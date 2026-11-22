// Owner API (no accounts in v1): /api/v1/owner/*. Spec: backend.md "Owner access", web.md "Owner page",
// decisions #14 (web push), #20 (what the page shows/allows). Never returns the full address.
import { createHash, timingSafeEqual } from "node:crypto";

import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";

import { sha256Hex } from "../lib/hmac";
import { formatOwnerCode, maskAddress, newOwnerCode, normalizeOwnerCode, ownerCodeHash, SESSION_MAX_S, SESSION_TTL_S, signSession, verifySession } from "../lib/ownerCode";
import { logEvent, logWarn } from "../lib/redact";
import { shortCodeFor } from "../lib/shortcode";

// Known browser push services only (the backend POSTs to these): Chrome/Android, Firefox, Safari/iOS, Edge.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function isPushServiceUrl(u: string): boolean {
  if (u.length > 1000) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(url.hostname));
  } catch {
    return false;
  }
}
export function endpointId(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}
function b64urlLen(s: unknown): number {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]+=*$/.test(s)) return -1;
  return Buffer.from(s, "base64url").length;
}

export const OWNER = {
  maxPushSubs: 10,
  wrongPerIpPerHour: 10,
  wrongGlobalPerHour: 2000,
  maxBodyBytes: 4096,
  expectedUploadsPerHour: 24, // one every 2.5 min (decision #6)
  chartHours: 168,
};

export interface OwnerConfig { pepper: string; vapidPublic: string }
export interface OwnerRequest {
  method: string; path: string; headers: Record<string, string | string[] | undefined>; rawBody?: Buffer; ip: string;
  query?: Record<string, unknown>;
}
export interface OwnerResponse { status: number; body: Record<string, unknown> }

/**
 * Client IP for rate limiting. Checked on dev 2026-11-21: through Firebase Hosting (CDN headers present, e.g.
 * `cdn-loop`), Hosting replaces any client-sent X-Forwarded-For with "<client>, <cdn>", so the FIRST entry is the
 * client. Direct calls to the function URL get "<whatever the client sent>, <client>" from Google's front end,
 * so the LAST entry is the client. IPv6 is keyed by its /64 (one household/network).
 * Residual risk (recorded in decisions.md): a direct caller who forges the CDN headers can pick the first entry.
 */
export function clientIp(headers: Record<string, string | string[] | undefined>, fallback?: string): string {
  const h = (n: string) => { const v = headers[n]; return (Array.isArray(v) ? v[0] : v) ?? ""; };
  const parts = h("x-forwarded-for").split(",").map((p) => p.trim()).filter(Boolean);
  const viaHosting = /fastly/i.test(h("cdn-loop"));
  const ip = (viaHosting ? parts[0] : parts[parts.length - 1]) || fallback || "unknown";
  if (ip.includes(":")) {
    const groups = ip.split("::")[0].split(":").filter(Boolean);
    return `${groups.slice(0, 4).join(":")}::/64`;
  }
  return ip;
}

const NOT_FOUND = { status: 404, body: { ok: false, error: "not_found" } };
const NO_SESSION = { status: 401, body: { ok: false, error: "session" } };

function header(req: OwnerRequest, name: string): string {
  const v = req.headers[name.toLowerCase()];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}
function json(req: OwnerRequest): Record<string, unknown> | null {
  if (!req.rawBody || req.rawBody.length > OWNER.maxBodyBytes) return null;
  try {
    const v = JSON.parse(req.rawBody.toString("utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
function hourKey(ms: number): string {
  return new Date(ms).toISOString().replace(/[-T:]/g, "").slice(0, 10);
}

/** Issues a new owner code for a device: the old code (and every session made with it) stops working. */
export async function issueOwnerCode(db: Firestore, pepper: string, deviceId: string): Promise<string> {
  const code = newOwnerCode();
  const hash = ownerCodeHash(pepper, code);
  const old = await db.collection("owner_codes").where("deviceId", "==", deviceId).get();
  await db.runTransaction(async (tx) => {
    const dev = await tx.get(db.doc(`devices/${deviceId}`));
    const v = Number(dev.get("ownerCodeVersion") ?? 0) + 1;
    old.forEach((d) => tx.delete(d.ref));
    tx.set(db.doc(`owner_codes/${hash}`), { deviceId, v, createdAt: FieldValue.serverTimestamp() });
    tx.set(dev.ref, { ownerCodeVersion: v }, { merge: true });
  });
  return code;
}

/**
 * The owner-code check (reusable for partner links, backend.md). Every attempt is counted BEFORE the code is
 * checked, in a transaction, so parallel guesses can't slip past the limit; a correct code refunds its attempt.
 * Per-IP limit: OWNER.wrongPerIpPerHour. The global count never locks out correct codes; it only raises an alert.
 */
export async function checkOwnerCode(db: Firestore, pepper: string, ipKey: string, raw: string, nowMs: number):
  Promise<{ deviceId: string; v: number; shortCode?: string; name?: string } | "rate_limited" | "wrong"> {
  const hour = Math.floor(nowMs / 3600e3);
  const ipRef = db.doc(`owner_attempts/${ipKey}_${hour}`);
  const gRef = db.doc(`owner_attempts/global_${hour}`);
  const exp = Timestamp.fromMillis((hour + 2) * 3600e3);
  let n: number;
  try {
    n = await db.runTransaction(async (tx) => {
      const cur = Number((await tx.get(ipRef)).get("n") ?? 0) + 1;
      tx.set(ipRef, { n: cur, expireAt: exp }, { merge: true });
      return cur;
    });
  } catch {
    // The counter couldn't be updated (e.g. a burst of parallel guesses from one address contending for it): fail
    // closed. The guess is not checked, and the caller sees "too many tries" instead of a server error.
    return "rate_limited";
  }
  if (n > OWNER.wrongPerIpPerHour) return "rate_limited";
  const code = normalizeOwnerCode(raw);
  const entry = code ? await db.doc(`owner_codes/${ownerCodeHash(pepper, code)}`).get() : null;
  const dev = entry?.exists ? await db.doc(`devices/${entry.get("deviceId")}`).get() : null;
  if (!entry?.exists || !dev?.exists || dev.get("status") === "retired" || Number(dev.get("ownerCodeVersion")) !== Number(entry.get("v"))) {
    const g = await db.runTransaction(async (tx) => {
      const cur = Number((await tx.get(gRef)).get("n") ?? 0) + 1;
      tx.set(gRef, { n: cur, expireAt: exp }, { merge: true });
      return cur;
    });
    if (g === OWNER.wrongGlobalPerHour) logWarn("owner_guessing_surge", { wrongThisHour: g }); // alert once per hour
    return "wrong";
  }
  await ipRef.set({ n: FieldValue.increment(-1) }, { merge: true }); // a correct code doesn't count as a guess
  return { deviceId: String(entry.get("deviceId")), v: Number(entry.get("v")), shortCode: dev.get("shortCode"), name: dev.get("name") };
}

async function session(db: Firestore, cfg: OwnerConfig, req: OwnerRequest, nowS: number) {
  const auth = header(req, "authorization").replace(/^Bearer\s+/i, "");
  const p = auth ? verifySession(cfg.pepper, auth, nowS) : null;
  if (!p) return null;
  if (p.iat !== undefined && nowS - p.iat > SESSION_MAX_S) return null; // absolute limit; then the code is needed again
  const dev = await db.doc(`devices/${p.d}`).get();
  if (!dev.exists || dev.get("status") === "retired" || Number(dev.get("ownerCodeVersion") ?? 0) !== p.v) return null;
  return { p, dev, fresh: signSession(cfg.pepper, { d: p.d, v: p.v, exp: nowS + SESSION_TTL_S, iat: p.iat ?? nowS }) };
}

export async function handleOwner(db: Firestore, cfg: OwnerConfig, req: OwnerRequest, nowMs = Date.now()): Promise<OwnerResponse> {
  const nowS = Math.floor(nowMs / 1000);
  const route = `${req.method} ${req.path.replace(/^\/api\/v1\/owner/, "").replace(/\/$/, "") || "/"}`;
  const ipKey = sha256Hex(`${cfg.pepper}:ip:${req.ip}`).slice(0, 32); // IPs are not stored as-is

  if (route === "GET /vapid") return { status: 200, body: { ok: true, key: cfg.vapidPublic } };

  if (route === "POST /session") {
    const b = json(req);
    const r = await checkOwnerCode(db, cfg.pepper, ipKey, String(b?.code ?? ""), nowMs);
    if (r === "rate_limited") return { status: 429, body: { ok: false, error: "rate_limited" } };
    if (r === "wrong") {
      logWarn("owner_session_reject", { reason: "wrong_code" });
      return { status: 401, body: { ok: false, error: "wrong_code" } };
    }
    const token = signSession(cfg.pepper, { d: r.deviceId, v: r.v, exp: nowS + SESSION_TTL_S, iat: nowS });
    logEvent("owner_session_ok", { device: r.deviceId });
    return { status: 200, body: { ok: true, token, code: shortCodeFor(r.deviceId, r.shortCode), name: r.name ?? null } };
  }

  if (route === "POST /rotate") {
    // New owner code via computer setup: a fresh claim token from the sensor over USB (physical access).
    const b = json(req);
    const d = String(b?.d ?? ""), t = String(b?.t ?? "").toLowerCase();
    if (!/^esp8266-\d{1,10}$/.test(d) || !/^[0-9a-f]{32}$/.test(t)) return { status: 400, body: { ok: false, error: "bad_link" } };
    const devRef = db.doc(`devices/${d}`);
    const want = sha256Hex(t);
    // One transaction: consume the token AND issue the new code, so a failure can't lose both.
    const code = await db.runTransaction(async (tx) => {
      const dev = await tx.get(devRef);
      const stored = String(dev.get("claimTokenHash") ?? "");
      const exp = (dev.get("claimTokenExpires") as Timestamp | undefined)?.toMillis() ?? 0;
      if (!dev.exists || dev.get("status") !== "active" || stored.length !== 64 || exp < nowMs) return null;
      if (!timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(want, "hex"))) return null;
      const old = await tx.get(db.collection("owner_codes").where("deviceId", "==", d));
      const fresh = newOwnerCode();
      const v = Number(dev.get("ownerCodeVersion") ?? 0) + 1;
      old.forEach((o) => tx.delete(o.ref));
      tx.set(db.doc(`owner_codes/${ownerCodeHash(cfg.pepper, fresh)}`), { deviceId: d, v, createdAt: FieldValue.serverTimestamp() });
      tx.set(devRef, { claimTokenHash: FieldValue.delete(), claimTokenExpires: FieldValue.delete(), usedClaimTokenHash: want, ownerCodeVersion: v }, { merge: true });
      return fresh;
    });
    if (!code) return { status: 409, body: { ok: false, error: "not_ready" } }; // the page polls until the sensor uploads
    logEvent("owner_code_rotated", { device: d });
    return { status: 200, body: { ok: true, ownerCode: formatOwnerCode(code), code: shortCodeFor(d, (await devRef.get()).get("shortCode")) } };
  }

  const s = await session(db, cfg, req, nowS);
  if (!s) return NO_SESSION;
  const d = s.p.d;
  const devRef = db.doc(`devices/${d}`);

  if (route === "GET /sensor") {
    const keys = Array.from({ length: 24 }, (_, i) => hourKey(nowMs - i * 3600e3));
    const [loc, pub, ...hours] = await db.getAll(db.doc(`private_locations/${d}`), db.doc(`public_sensors/${d}`),
      ...keys.map((k) => db.doc(`readings_hourly/${d}_${k}`)));
    const cur = hours[0];
    const health = (cur.exists ? cur.get("health") : null) as { fw?: string; uptime_s?: number; rssi?: number; errors?: Record<string, number> } | null;
    const lastSeen = (cur.exists ? cur.get("lastSeen") : s.dev.get("lastSeen")) as Timestamp | undefined;
    const uploads = hours.reduce((a, h) => a + Number(h.exists ? h.get("uploads") ?? 0 : 0), 0);
    const minutesSoFar = new Date(nowMs).getUTCMinutes();
    const expected = 23 * OWNER.expectedUploadsPerHour + Math.max(1, Math.floor((minutesSoFar / 60) * OWNER.expectedUploadsPerHour));
    // Notices for THIS browser: the page sends a hash of its own push endpoint (?ep=), if it has one.
    const ep = /^[0-9a-f]{64}$/.test(String(req.query?.ep ?? "")) ? String(req.query!.ep) : "";
    const thisBrowser = ep ? (await devRef.collection("push_subs").doc(ep).get()).exists : false;
    return {
      status: 200,
      body: {
        ok: true,
        token: s.fresh,
        code: shortCodeFor(d, s.dev.get("shortCode")),
        name: s.dev.get("name") ?? null,
        indoor: Boolean(s.dev.get("indoor")),
        address: loc.exists ? maskAddress(String(loc.get("address") ?? "")) : null, // masked only
        addressStatus: s.dev.get("locationNotFound") ? "not_found" : s.dev.get("locationPending") ? "pending" : loc.exists ? "ok" : "none",
        lastSeen: lastSeen ? Math.floor(lastSeen.toMillis() / 1000) : null,
        health: health ? {
          fw: health.fw ?? null, rssi: health.rssi ?? null,
          lastRestart: typeof health.uptime_s === "number" && lastSeen ? Math.floor(lastSeen.toMillis() / 1000) - health.uptime_s : null,
          sensorOk: health.errors?.sensor_ok === undefined ? null : health.errors.sensor_ok === 1,
        } : null,
        uploadSuccess: Math.min(1, uploads / expected),
        chart: ((pub.exists ? pub.get("hourly") : []) as { h: string; pm: number | null }[]).slice(0, OWNER.chartHours).map((p) => [p.h, p.pm]),
        notices: thisBrowser,
      },
    };
  }

  if (route === "PATCH /sensor") {
    const b = json(req);
    if (!b) return { status: 400, body: { ok: false, error: "bad_json" } };
    const devUpd: Record<string, unknown> = {};
    const pubUpd: Record<string, unknown> = {};
    if (b.name !== undefined) {
      const name = String(b.name).trim().replace(/\s+/g, " ");
      if (name.length > 40) return { status: 400, body: { ok: false, error: "bad_name" } };
      devUpd.name = name || FieldValue.delete();
    }
    if (b.indoor !== undefined) {
      if (typeof b.indoor !== "boolean") return { status: 400, body: { ok: false, error: "bad_indoor" } };
      devUpd.indoor = b.indoor;
      pubUpd.indoor = b.indoor;
    }
    if (b.address !== undefined || b.zip !== undefined) {
      const address = String(b.address ?? "").trim().replace(/\s+/g, " ");
      const zip = String(b.zip ?? "").trim();
      if (address.length < 3 || address.length > 200) return { status: 400, body: { ok: false, error: "bad_address" } };
      if (!/^\d{5}$/.test(zip)) return { status: 400, body: { ok: false, error: "bad_zip" } };
      // New address: drop the old exact location; the publish job geocodes it and moves the public cell.
      await db.doc(`private_locations/${d}`).set({ address, zip, updatedAt: Timestamp.fromMillis(nowMs), source: "owner" });
      devUpd.locationPending = true;
      devUpd.locationNotFound = FieldValue.delete();
      Object.assign(pubUpd, { cell: null, center: null, placement: "pending" });
    }
    if (Object.keys(devUpd).length) await devRef.set(devUpd, { merge: true });
    if (Object.keys(pubUpd).length) {
      const pub = db.doc(`public_sensors/${d}`);
      if ((await pub.get()).exists) await pub.set(pubUpd, { merge: true });
    }
    logEvent("owner_update", { device: d, fields: Object.keys(b).filter((k) => ["name", "indoor", "address", "zip"].includes(k)) });
    return { status: 200, body: { ok: true, token: s.fresh } };
  }

  if (route === "POST /push" || route === "DELETE /push") {
    const b = json(req);
    const sub = b?.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
    const endpoint = String(sub?.endpoint ?? "");
    if (!isPushServiceUrl(endpoint)) return { status: 400, body: { ok: false, error: "bad_subscription" } };
    const ref = devRef.collection("push_subs").doc(endpointId(endpoint));
    if (route === "DELETE /push") {
      await ref.delete();
    } else {
      // Browser push keys: P-256 public key (65 bytes) and auth secret (16 bytes), base64url.
      if (b64urlLen(sub?.keys?.p256dh) !== 65 || b64urlLen(sub?.keys?.auth) !== 16) return { status: 400, body: { ok: false, error: "bad_subscription" } };
      const count = (await devRef.collection("push_subs").count().get()).data().count;
      if (count >= OWNER.maxPushSubs && !(await ref.get()).exists) return { status: 400, body: { ok: false, error: "too_many_devices" } };
      const lang = String(b?.lang ?? "en") === "es" ? "es" : "en";
      await ref.set({ sub: { endpoint, keys: { p256dh: sub!.keys!.p256dh, auth: sub!.keys!.auth } }, lang, createdAt: Timestamp.fromMillis(nowMs) });
    }
    const n = (await devRef.collection("push_subs").count().get()).data().count;
    // Flag on the device (copied to the map entry by publish, even if the sensor isn't placed yet).
    await devRef.set({ notifyOffline: n > 0 }, { merge: true });
    const pub = db.doc(`public_sensors/${d}`);
    if ((await pub.get()).exists) await pub.set({ notifyOffline: n > 0 }, { merge: true });
    return { status: 200, body: { ok: true, token: s.fresh, notices: route === "POST /push" } };
  }

  if (route === "DELETE /sensor/data") {
    await deleteSensorData(db, d, nowMs);
    logEvent("owner_delete", { device: d });
    return { status: 200, body: { ok: true } };
  }

  return NOT_FOUND;
}

/** "Delete my data": readings, location, map entry, owner codes, notices; device retired; archive purge queued. */
export async function deleteSensorData(db: Firestore, d: string, nowMs: number): Promise<void> {
  const del = async (refs: FirebaseFirestore.DocumentReference[]) => {
    for (let i = 0; i < refs.length; i += 400) {
      const batch = db.batch();
      refs.slice(i, i + 400).forEach((r) => batch.delete(r));
      await batch.commit();
    }
  };
  const devRef = db.doc(`devices/${d}`);
  await del((await db.collection("readings_hourly").where("deviceId", "==", d).select().get()).docs.map((x) => x.ref));
  await del((await db.collection("owner_codes").where("deviceId", "==", d).get()).docs.map((x) => x.ref));
  await del((await devRef.collection("push_subs").get()).docs.map((x) => x.ref));
  await del([db.doc(`private_locations/${d}`), db.doc(`public_sensors/${d}`), db.doc(`device_secrets/${d}`)]);
  const dev = await devRef.get();
  await devRef.set({
    status: "retired", deletedAt: Timestamp.fromMillis(nowMs), archivePurgePending: true,
    enrolledAt: dev.get("enrolledAt") ?? null, // kept so the archive purge knows which days to rewrite
    name: FieldValue.delete(), indoor: FieldValue.delete(), claimTokenHash: FieldValue.delete(), claimTokenExpires: FieldValue.delete(),
    usedClaimTokenHash: FieldValue.delete(), locationPending: FieldValue.delete(), publicCellPending: FieldValue.delete(),
    locationNotFound: FieldValue.delete(), ownerCodeVersion: FieldValue.increment(1), fw: FieldValue.delete(), rssi: FieldValue.delete(),
  }, { merge: true });
}

/** Public history for /s/<code> charts (no location): GET /api/v1/sensor/<CODE>/history */
export async function sensorHistory(db: Firestore, code: string): Promise<OwnerResponse> {
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return NOT_FOUND;
  const q = await db.collection("public_sensors").where("code", "==", code).limit(1).get();
  if (q.empty) return NOT_FOUND;
  const s = q.docs[0];
  return { status: 200, body: { ok: true, code, h: ((s.get("hourly") ?? []) as { h: string; pm: number | null }[]).slice(0, OWNER.chartHours).map((p) => [p.h, p.pm]) } };
}
