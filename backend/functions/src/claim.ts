// POST /api/v1/claim : finishes computer setup. The browser got d (device ID) and t (claim token) in the URL
// fragment from the sensor over USB (physical access = ownership); the sensor uploaded sha256(t) in its next
// signed upload. Spec: backend.md "Endpoints"; web.md "Claim page".
// Body: { d, t, address, zip, indoor }. Responses never include the address or coordinates.
import { timingSafeEqual } from "node:crypto";

import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";

import { censusGeocoder, Geocoder } from "./lib/geocode";
import { sha256Hex } from "./lib/hmac";
import { logEvent, logWarn } from "./lib/redact";

export const CLAIM = { maxAttemptsPerHour: 20, maxBodyBytes: 2048 };

export interface ClaimResponse {
  status: number;
  body: Record<string, unknown>;
}

function hashesEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === 32 && y.length === 32 && timingSafeEqual(x, y);
}

export async function handleClaim(
  db: Firestore, method: string, rawBody: Buffer | undefined, nowMs = Date.now(), geocode: Geocoder = censusGeocoder,
): Promise<ClaimResponse> {
  if (method !== "POST") return { status: 405, body: { ok: false, error: "method_not_allowed" } };
  const raw = rawBody ?? Buffer.alloc(0);
  if (raw.length > CLAIM.maxBodyBytes) return { status: 413, body: { ok: false, error: "too_large" } };
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(raw.toString("utf8"));
  } catch {
    return { status: 400, body: { ok: false, error: "bad_json" } };
  }
  const d = typeof b.d === "string" ? b.d : "";
  const t = typeof b.t === "string" ? b.t.toLowerCase() : "";
  const address = typeof b.address === "string" ? b.address.trim().replace(/\s+/g, " ") : "";
  const zip = typeof b.zip === "string" ? b.zip.trim() : "";
  if (!/^esp8266-\d{1,10}$/.test(d) || !/^[0-9a-f]{32}$/.test(t)) return { status: 400, body: { ok: false, error: "bad_link" } };
  if (address.length < 3 || address.length > 200) return { status: 400, body: { ok: false, error: "bad_address" } };
  if (!/^\d{5}$/.test(zip)) return { status: 400, body: { ok: false, error: "bad_zip" } };
  if (typeof b.indoor !== "boolean") return { status: 400, body: { ok: false, error: "bad_indoor" } };
  const indoor = b.indoor;

  // Rate limit per device (tokens are 128-bit, so this is defense in depth, not the main protection).
  const hour = Math.floor(nowMs / 3600e3);
  const attemptsRef = db.doc(`claim_attempts/${d}_${hour}`);
  const attempts = await db.runTransaction(async (tx) => {
    const s = await tx.get(attemptsRef);
    const n = Number(s.exists ? s.get("n") ?? 0 : 0) + 1;
    tx.set(attemptsRef, { n, expireAt: Timestamp.fromMillis((hour + 2) * 3600e3) }, { merge: true });
    return n;
  });
  if (attempts > CLAIM.maxAttemptsPerHour) {
    logWarn("claim_reject", { device: d, reason: "rate_limited" });
    return { status: 429, body: { ok: false, error: "rate_limited" } };
  }

  const devRef = db.doc(`devices/${d}`);
  const dev = await devRef.get();
  if (!dev.exists || !["active"].includes(String(dev.get("status")))) {
    // Not enrolled yet: the sensor hasn't made its first upload. The page keeps polling.
    return { status: 409, body: { ok: false, error: "not_yet" } };
  }
  const stored = String(dev.get("claimTokenHash") ?? "");
  const expires = dev.get("claimTokenExpires") as Timestamp | undefined;
  const want = sha256Hex(t);
  if (!stored) return { status: 409, body: { ok: false, error: "not_yet" } };
  if (!hashesEqual(stored, want)) {
    // Either an old/used link, or the sensor hasn't uploaded this token's hash yet.
    logWarn("claim_reject", { device: d, reason: "token_mismatch" });
    return { status: 409, body: { ok: false, error: "not_yet_or_used" } };
  }
  if (!expires || expires.toMillis() < nowMs) return { status: 410, body: { ok: false, error: "expired" } };

  // Geocode outside the transaction (network call). Outage -> accept and geocode later; no match -> ask again.
  const geo = await geocode(address, zip);
  if (geo.kind === "no_match") return { status: 422, body: { ok: false, error: "address_not_found" } };

  let won = false;
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(devRef);
    if (!hashesEqual(String(fresh.get("claimTokenHash") ?? "0".repeat(64)), want)) return; // used meanwhile
    won = true;
    const loc: Record<string, unknown> = { address, zip, updatedAt: Timestamp.fromMillis(nowMs), source: "claim" };
    if (geo.kind === "match") {
      loc.lat = geo.point.lat;
      loc.lng = geo.point.lng;
      loc.matchedAddress = geo.point.matchedAddress;
      loc.geocoder = "census";
    }
    tx.set(db.doc(`private_locations/${d}`), loc);
    tx.set(devRef, {
      indoor,
      claimedAt: Timestamp.fromMillis(nowMs),
      claimTokenHash: FieldValue.delete(), // single-use
      claimTokenExpires: FieldValue.delete(),
      locationPending: geo.kind !== "match", // geocode retry (M7 job)
      publicCellPending: true, // H3 cell computed in M7; nothing public until then
    }, { merge: true });
  });
  if (!won) return { status: 409, body: { ok: false, error: "not_yet_or_used" } };

  // First reading for the success screen (the claimer just proved physical access).
  const hourKey = new Date(nowMs).toISOString().replace(/[-T:]/g, "").slice(0, 10);
  const prevKey = new Date(nowMs - 3600e3).toISOString().replace(/[-T:]/g, "").slice(0, 10);
  let latest: Record<string, unknown> | null = null;
  for (const k of [hourKey, prevKey]) {
    const h = await db.doc(`readings_hourly/${d}_${k}`).get();
    const l = h.exists ? (h.get("latest") as Record<string, unknown> | undefined) : undefined;
    if (l) {
      latest = { ts: l.ts, pm25_cf1: l.pm25, pm25_atm: l.pm25a };
      break;
    }
  }
  logEvent("claim_ok", { device: d, geocoded: geo.kind === "match", indoor });
  return { status: 200, body: { ok: true, device: d, located: geo.kind === "match", latest } };
}
