// POST /api/v1/factory/register : the packing laptop registers a freshly flashed board (M9, tools/provision.py).
// Spec: backend.md "Endpoints"; tools.md provision.py; founder decision 2026-11-22: per-station keys.
//
// Auth: "Authorization: Bearer <station key>" (64 hex chars, one per packing laptop). Only SHA-256 hashes of the
// keys exist in the backend, in the FACTORY_KEY_HASHES secret (one "<station-name> <sha256hex>" per line); revoke a
// laptop by removing its line and redeploying `factory`. Keys are 256-bit random, so a plain hash is enough.
//
// Body: { deviceId: "esp8266-<chipid>", fw?: "0.7.0", reprovision?: boolean }
// Result: { ok, deviceId, shortCode, ownerCode ("XXXX-XXXX-XX", shown once for printing), reprovisioned }
//
// Rules:
//  - New chip: allowlist it (status "allowlisted": the first signed upload enrolls its secret), reserve a unique
//    random short code (short_codes/{code}), issue an owner code (only its keyed hash is stored).
//  - Chip already registered and never used in the field (status "allowlisted"): same short code, NEW owner code
//    (old one stops working), and its enrolled secret is cleared (the board was re-flashed, so it has a new one).
//    This covers "registration worked but printing failed / the laptop lost the answer" (tools.md).
//  - Chip already used in the field (active/retired): only with reprovision=true, and never while a home address is
//    still stored (the previous owner must use "Delete my data" first, or the founder handles it). Nothing is deleted
//    here except the old secret and owner code.
import { createHash, randomInt } from "node:crypto";

import { FieldValue, Firestore } from "firebase-admin/firestore";

import { formatOwnerCode, newOwnerCode, ownerCodeHash } from "./lib/ownerCode";
import { logEvent, logWarn } from "./lib/redact";
import { CODE_ALPHABET } from "./lib/shortcode";

export interface FactoryRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer | undefined;
}
export interface FactoryResponse {
  status: number;
  body: Record<string, unknown>;
}
export interface FactoryConfig {
  pepper: string; // OWNER_PEPPER (owner-code keyed hash)
  keyHashes: Map<string, string>; // sha256(station key) -> station name
}

const DEVICE_ID_RE = /^esp8266-\d{1,10}$/;
const FW_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const SHORT_CODE_LEN = 6; // 31^6 ≈ 887M codes (backend.md: ≥ 6 chars)

/** Parses the FACTORY_KEY_HASHES secret. Bad lines are ignored (and can't grant access). */
export function parseKeyHashes(text: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const [name, hash] = line.trim().split(/\s+/);
    if (name && hash && /^[a-z0-9_-]{1,40}$/i.test(name) && /^[0-9a-f]{64}$/.test(hash)) m.set(hash, name);
  }
  return m;
}

export function stationKeyHash(key: string): string {
  return createHash("sha256").update(`factory-station:v1:${key}`).digest("hex");
}

export function newShortCode(): string {
  let s = "";
  for (let i = 0; i < SHORT_CODE_LEN; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

function header(req: FactoryRequest, name: string): string {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export async function handleFactory(db: Firestore, cfg: FactoryConfig, req: FactoryRequest,
  makeShortCode: () => string = newShortCode): Promise<FactoryResponse> {
  if (!/\/factory\/register$/.test(req.path)) return { status: 404, body: { ok: false, error: "not_found" } };
  if (req.method !== "POST") return { status: 405, body: { ok: false, error: "method_not_allowed" } };
  const key = header(req, "authorization").replace(/^Bearer\s+/i, "").trim();
  const station = /^[0-9a-f]{64}$/.test(key) ? cfg.keyHashes.get(stationKeyHash(key)) : undefined;
  if (!station) {
    logWarn("factory_reject", { reason: "bad_station_key" });
    return { status: 401, body: { ok: false, error: "bad_station_key" } };
  }
  let body: { deviceId?: unknown; fw?: unknown; reprovision?: unknown };
  try {
    body = JSON.parse((req.rawBody ?? Buffer.alloc(0)).toString("utf8"));
  } catch {
    return { status: 400, body: { ok: false, error: "bad_json" } };
  }
  const deviceId = String(body?.deviceId ?? "");
  const fw = body?.fw === undefined ? null : String(body.fw);
  if (!DEVICE_ID_RE.test(deviceId) || (fw !== null && !FW_RE.test(fw))) {
    return { status: 400, body: { ok: false, error: "bad_request" } };
  }
  const reprovision = body?.reprovision === true;

  const ownerCode = newOwnerCode();
  const ownerHash = ownerCodeHash(cfg.pepper, ownerCode);
  const devRef = db.doc(`devices/${deviceId}`);
  // Read outside the transaction: a collection query can't be locked, and a stale list only means an extra delete.
  const oldCodes = await db.collection("owner_codes").where("deviceId", "==", deviceId).get();

  type Out = { error: string; status: number; shortCode?: string } | { shortCode: string; reprovisioned: boolean };
  const out: Out = await db.runTransaction(async (tx) => {
    const [dev, loc] = await Promise.all([tx.get(devRef), tx.get(db.doc(`private_locations/${deviceId}`))]);
    const status = dev.exists ? String(dev.get("status") ?? "") : "";
    let shortCode = dev.exists ? (dev.get("shortCode") as string | undefined) : undefined;
    if (dev.exists && status !== "allowlisted") {
      if (!reprovision) return { status: 409, error: "already_in_use", shortCode };
      if (loc.exists) return { status: 409, error: "owner_data_present", shortCode };
    }
    if (!shortCode) {
      for (let i = 0; i < 5 && !shortCode; i++) {
        const c = makeShortCode();
        if (!(await tx.get(db.doc(`short_codes/${c}`))).exists) shortCode = c;
      }
      if (!shortCode) return { status: 503, error: "no_short_code" };
      tx.create(db.doc(`short_codes/${shortCode}`), { deviceId, createdAt: FieldValue.serverTimestamp() });
    }
    const v = Number(dev.get("ownerCodeVersion") ?? 0) + 1;
    oldCodes.forEach((d) => tx.delete(d.ref));
    tx.set(db.doc(`owner_codes/${ownerHash}`), { deviceId, v, createdAt: FieldValue.serverTimestamp() });
    tx.delete(db.doc(`device_secrets/${deviceId}`)); // re-flashed board = new identity; enrolled again on first upload
    tx.set(devRef, {
      status: "allowlisted", shortCode, ownerCodeVersion: v, station, fwAtFactory: fw,
      registeredAt: FieldValue.serverTimestamp(), ...(dev.exists ? { reprovisionedAt: FieldValue.serverTimestamp() } : {}),
      claimTokenHash: FieldValue.delete(), claimTokenExpires: FieldValue.delete(),
    }, { merge: true });
    return { shortCode, reprovisioned: dev.exists };
  });

  if ("error" in out) {
    logWarn("factory_reject", { device: deviceId, station, reason: out.error });
    return { status: out.status, body: { ok: false, error: out.error, shortCode: out.shortCode ?? null } };
  }
  logEvent("factory_register", { device: deviceId, station, shortCode: out.shortCode, reprovisioned: out.reprovisioned });
  return { status: 200, body: { ok: true, deviceId, shortCode: out.shortCode, ownerCode: formatOwnerCode(ownerCode),
    reprovisioned: out.reprovisioned } };
}
