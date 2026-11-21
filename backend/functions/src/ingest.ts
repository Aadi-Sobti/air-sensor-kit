// POST /api/v1/ingest : signed uploads from sensors. Spec: backend.md "Endpoints"; storage design B in docs/COSTS.md.
//
// Headers: X-Device-Id (esp8266-<chipid>), X-Timestamp (unix seconds, device clock after NTP),
//          X-Signature (hex HMAC-SHA256(secret, timestamp + raw body)), first upload only: X-Enroll-Secret (hex).
// Firestore (all deny-by-default to clients):
//   devices/{id}                 registry + health; written on enrollment, the first upload of each hour, setup info
//   device_secrets/{id}          { secret } HMAC key (needed to verify; never leaves the backend)
//   readings_hourly/{id}_{hour}  { deviceId, hour, expireAt, uploads, lastSeen, latest, r: { "<ts>": reading } }
//   private_locations/{id}       address + ZIP from setup (never public, never logged)
import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";

import { sha256Hex, verify } from "./lib/hmac";
import { LIMITS, parseUpload, Reading } from "./lib/payload";
import { logEvent, logWarn } from "./lib/redact";

export const INGEST = {
  timestampWindowS: 10 * 60, // +-10 min (backend.md)
  skewFlagS: 60,
  maxUploadsPerHour: 60, // normal is 24 (every 2.5 min); headroom for retries after outages
  ttlDays: 35, // raw readings stay in Firestore this long; the nightly archive keeps them forever
  claimTokenTtlS: 24 * 3600,
  registryCacheMs: 5 * 60 * 1000,
};

export interface IngestRequest {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer | undefined;
}
export interface IngestResponse {
  status: number;
  body: Record<string, unknown>;
}

interface DeviceEntry {
  status: string;
  secret: string | null;
  fetchedAt: number;
}
const registryCache = new Map<string, DeviceEntry>();
export function clearRegistryCache(): void {
  registryCache.clear();
}

const DEVICE_ID_RE = /^esp8266-\d{1,10}$/;

function header(req: IngestRequest, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

export function hourKey(tsS: number): string {
  const d = new Date(tsS * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}`;
}

async function loadDevice(db: Firestore, id: string, nowMs: number, fresh: boolean): Promise<DeviceEntry | null> {
  const cached = registryCache.get(id);
  if (!fresh && cached && nowMs - cached.fetchedAt < INGEST.registryCacheMs) return cached;
  const [dev, sec] = await Promise.all([db.doc(`devices/${id}`).get(), db.doc(`device_secrets/${id}`).get()]);
  if (!dev.exists) {
    registryCache.delete(id);
    return null;
  }
  const entry: DeviceEntry = {
    status: String(dev.get("status") ?? ""),
    secret: sec.exists ? String(sec.get("secret")) : null,
    fetchedAt: nowMs,
  };
  registryCache.set(id, entry);
  return entry;
}

function compactReading(r: Reading): Record<string, unknown> {
  return {
    n: r.n,
    pm1: r.pm1_cf1, pm25: r.pm25_cf1, pm10: r.pm10_cf1,
    pm1a: r.pm1_atm, pm25a: r.pm25_atm, pm10a: r.pm10_atm,
    c: r.counts, mn: r.pm25_cf1_min, mx: r.pm25_cf1_max,
  };
}

export async function handleIngest(db: Firestore, req: IngestRequest, nowMs = Date.now()): Promise<IngestResponse> {
  const nowS = Math.floor(nowMs / 1000);
  if (req.method !== "POST") return { status: 405, body: { ok: false, error: "method_not_allowed" } };
  const body = req.rawBody ?? Buffer.alloc(0);
  if (body.length > LIMITS.maxBodyBytes) return { status: 413, body: { ok: false, error: "too_large" } };

  const id = header(req, "x-device-id") ?? "";
  const tsHeader = header(req, "x-timestamp") ?? "";
  const sig = (header(req, "x-signature") ?? "").toLowerCase();
  const enrollSecret = (header(req, "x-enroll-secret") ?? "").toLowerCase();
  if (!DEVICE_ID_RE.test(id) || !/^\d{9,11}$/.test(tsHeader) || !/^[0-9a-f]{64}$/.test(sig)) {
    return { status: 400, body: { ok: false, error: "bad_headers" } };
  }
  const ts = Number(tsHeader);
  const skew = ts - nowS;
  if (Math.abs(skew) > INGEST.timestampWindowS) {
    logWarn("ingest_reject", { device: id, reason: "clock_skew", skew_s: skew });
    // server_time lets the device notice its clock is wrong (it should re-run NTP).
    return { status: 401, body: { ok: false, error: "clock_skew", server_time: nowS } };
  }

  let dev = await loadDevice(db, id, nowMs, false);
  if (!dev || !["allowlisted", "active"].includes(dev.status)) {
    logWarn("ingest_reject", { device: id, reason: dev ? `status_${dev.status}` : "unknown_device" });
    return { status: 403, body: { ok: false, error: "not_registered" } };
  }

  let enrolling = false;
  if (!verify(dev.secret ?? "", tsHeader, body, sig)) {
    dev = (await loadDevice(db, id, nowMs, true)) ?? dev; // another instance may have enrolled it just now
    if (dev.secret && verify(dev.secret, tsHeader, body, sig)) {
      // ok after refresh
    } else if (!dev.secret && dev.status === "allowlisted" && /^[0-9a-f]{64}$/.test(enrollSecret) &&
               verify(enrollSecret, tsHeader, body, sig)) {
      enrolling = true; // trust on first use: factory-allowlisted chip, no secret yet
    } else {
      logWarn("ingest_reject", { device: id, reason: "bad_signature" });
      return { status: 401, body: { ok: false, error: "bad_signature" } };
    }
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body.toString("utf8"));
  } catch {
    return { status: 400, body: { ok: false, error: "bad_json" } };
  }
  const parsed = parseUpload(parsedJson, nowS);
  if (!parsed.ok) {
    logWarn("ingest_reject", { device: id, reason: parsed.error });
    return { status: 400, body: { ok: false, error: parsed.error } };
  }
  const up = parsed.upload;

  // Group readings by hour bucket.
  const byHour = new Map<string, Reading[]>();
  for (const r of up.readings) {
    const k = hourKey(r.ts);
    byHour.set(k, [...(byHour.get(k) ?? []), r]);
  }
  const currentHour = hourKey(nowS);
  if (!byHour.has(currentHour)) byHour.set(currentHour, []); // rate-limit counter lives in the current hour

  let accepted = 0;
  let duplicates = 0;
  let rateLimited = false;
  let newHour = false;
  const latest = up.readings.reduce((a, b) => (b.ts > a.ts ? b : a));

  await db.runTransaction(async (tx) => {
    accepted = 0;
    duplicates = 0;
    rateLimited = false;
    newHour = false;
    const refs = [...byHour.keys()].map((h) => db.doc(`readings_hourly/${id}_${h}`));
    const snaps = await tx.getAll(...refs);
    const cur = snaps.find((s) => s.id === `${id}_${currentHour}`);
    const uploads = Number(cur?.exists ? cur.get("uploads") ?? 0 : 0);
    if (uploads >= INGEST.maxUploadsPerHour) {
      rateLimited = true;
      return;
    }
    newHour = !cur?.exists;
    snaps.forEach((snap, i) => {
      const h = [...byHour.keys()][i];
      const existing = (snap.exists ? (snap.get("r") as Record<string, unknown>) : undefined) ?? {};
      const fresh: Record<string, unknown> = {};
      for (const r of byHour.get(h) ?? []) {
        const key = String(r.ts);
        if (key in existing || key in fresh) duplicates++;
        else {
          fresh[key] = compactReading(r);
          accepted++;
        }
      }
      const hourStart = Math.floor(Date.UTC(+h.slice(0, 4), +h.slice(4, 6) - 1, +h.slice(6, 8), +h.slice(8, 10)) / 1000);
      const update: Record<string, unknown> = {
        deviceId: id,
        hour: Timestamp.fromMillis(hourStart * 1000),
        expireAt: Timestamp.fromMillis((hourStart + INGEST.ttlDays * 86400) * 1000),
      };
      if (Object.keys(fresh).length) update.r = fresh;
      if (h === currentHour) {
        update.uploads = FieldValue.increment(1);
        update.lastSeen = Timestamp.fromMillis(nowMs);
        update.latest = { ts: latest.ts, ...compactReading(latest) };
        update.health = { fw: up.fw, uptime_s: up.uptime_s, rssi: up.rssi, errors: up.errors ?? {}, skew_s: skew };
      }
      if (h !== currentHour && !Object.keys(fresh).length) return; // nothing new for an old bucket
      tx.set(snap.ref, update, { merge: true });
    });

    const devUpdate: Record<string, unknown> = {};
    if (enrolling) {
      tx.set(db.doc(`device_secrets/${id}`), { secret: enrollSecret, enrolledAt: Timestamp.fromMillis(nowMs) });
      devUpdate.status = "active";
      devUpdate.enrolledAt = Timestamp.fromMillis(nowMs);
    }
    if (enrolling || newHour || up.setup || up.claim_token_hash) {
      devUpdate.lastSeen = Timestamp.fromMillis(nowMs);
      devUpdate.fw = up.fw;
      devUpdate.rssi = up.rssi;
      devUpdate.clockSkewFlag = Math.abs(skew) > INGEST.skewFlagS;
    }
    if (up.setup) {
      tx.set(db.doc(`private_locations/${id}`), {
        address: up.setup.address, zip: up.setup.zip, updatedAt: Timestamp.fromMillis(nowMs),
      });
      devUpdate.indoor = up.setup.indoor;
      devUpdate.locationPending = true; // geocode + H3 cell happen later (claim / M7), never here
    }
    if (up.claim_token_hash) {
      devUpdate.claimTokenHash = up.claim_token_hash;
      devUpdate.claimTokenExpires = Timestamp.fromMillis((nowS + INGEST.claimTokenTtlS) * 1000);
    }
    if (Object.keys(devUpdate).length) tx.set(db.doc(`devices/${id}`), devUpdate, { merge: true });
  });

  if (rateLimited) {
    logWarn("ingest_reject", { device: id, reason: "rate_limited" });
    return { status: 429, body: { ok: false, error: "rate_limited", retry_after_s: 600 } };
  }
  if (enrolling) {
    registryCache.set(id, { status: "active", secret: enrollSecret, fetchedAt: nowMs });
  }
  // Sensor.Community forwarding is enqueued here in M8 (feature flag OFF until the founder confirms).
  logEvent("ingest_ok", { device: id, accepted, duplicates, enrolled: enrolling, setup: Boolean(up.setup) });
  return { status: 200, body: { ok: true, accepted, duplicates, server_time: nowS } };
}

export { sha256Hex };
