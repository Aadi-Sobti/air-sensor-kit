// Owner access (M7b) on the Firestore emulator.
import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

import { getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore, Timestamp } from "firebase-admin/firestore";

import { runArchivePurge } from "../src/archive";
import { sha256Hex } from "../src/lib/hmac";
import { formatOwnerCode, maskAddress, normalizeOwnerCode, ownerCodeHash, signSession, verifySession } from "../src/lib/ownerCode";
import { logger } from "firebase-functions";
import { checkOwnerCode, clientIp, deleteSensorData, handleOwner, isPushServiceUrl, issueOwnerCode, OWNER, OwnerRequest, sensorHistory } from "../src/owner/api";
import { clearRegistryCache, handleIngest } from "../src/ingest";
import { sign } from "../src/lib/hmac";
import { hourKeyUtc, PushSender, runPublish } from "../src/publish";

const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-prosefire";
const PEPPER = "test-pepper-0123456789abcdef0123456789abcdef";
const cfg = { pepper: PEPPER, vapidPublic: "BPUBLICKEY" };
const NOW = Date.UTC(2026, 10, 22, 14, 30, 0);
let db: Firestore;
let n = 0;

const req = (method: string, path: string, body?: unknown, token?: string, ip = "203.0.113.7"): OwnerRequest => ({
  method, path: `/api/v1/owner${path}`, ip,
  headers: token ? { authorization: `Bearer ${token}` } : {},
  rawBody: body === undefined ? undefined : Buffer.from(JSON.stringify(body)),
});

async function owned(extra: Record<string, unknown> = {}): Promise<{ id: string; code: string }> {
  const id = `esp8266-${7700000 + ++n}`;
  await db.doc(`devices/${id}`).set({ status: "active", indoor: false, ...extra });
  await db.doc(`private_locations/${id}`).set({ address: "123 Example Street, Apt 4", zip: "10027", lat: 40.81, lng: -73.96 });
  const code = await issueOwnerCode(db, PEPPER, id);
  return { id, code };
}

async function login(code: string, ip?: string): Promise<string> {
  const r = await handleOwner(db, cfg, req("POST", "/session", { code: formatOwnerCode(code).toLowerCase() }, undefined, ip), NOW);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return String(r.body.token);
}

describe("owner codes (unit)", () => {
  it("normalizes what people type and rejects look-alikes", () => {
    assert.equal(normalizeOwnerCode(" 7kq2-mx4p-r9 ".replace("R9", "R9")), "7KQ2MX4PR9");
    assert.equal(normalizeOwnerCode("7KQ2-MX4P-R0"), null); // 0 isn't in the alphabet
    assert.equal(normalizeOwnerCode("short"), null);
    assert.equal(formatOwnerCode("7KQ2MX4PR9"), "7KQ2-MX4P-R9");
  });
  it("keyed hash depends on the secret (a leaked DB alone can't be brute-forced)", () => {
    assert.notEqual(ownerCodeHash(PEPPER, "7KQ2MX4PR9"), ownerCodeHash(PEPPER + "x", "7KQ2MX4PR9"));
    assert.notEqual(ownerCodeHash(PEPPER, "7KQ2MX4PR9"), sha256Hex("7KQ2MX4PR9"));
    assert.throws(() => ownerCodeHash("short", "7KQ2MX4PR9"));
  });
  it("session tokens: signed, expiring, tamper-evident", () => {
    const t = signSession(PEPPER, { d: "esp8266-1", v: 2, exp: 1000 });
    assert.deepEqual(verifySession(PEPPER, t, 999), { d: "esp8266-1", v: 2, exp: 1000 });
    assert.equal(verifySession(PEPPER, t, 1001), null);
    assert.equal(verifySession("other-pepper-0123456789abcdef0123456789", t, 999), null);
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ d: "esp8266-2", v: 2, exp: 1000 })).toString("base64url");
    assert.equal(verifySession(PEPPER, `${forged}.${sig}`, 999), null);
    assert.equal(verifySession(PEPPER, `${body}.`, 999), null);
  });
  it("masks addresses", () => {
    assert.equal(maskAddress("123 Example Street, Apt 4"), "123 E… Street");
    assert.equal(maskAddress("1 Main St"), "1 M… St");
    assert.equal(maskAddress("Broadway"), "B…");
    assert.equal(maskAddress(""), "");
  });
});

describe("owner API (emulator)", () => {
  before(() => {
    if (!getApps().length) initializeApp({ projectId: PROJECT });
    db = getFirestore();
  });

  it("owner code -> session -> sensor page data, with only a masked address", async () => {
    const { id, code } = await owned({ name: "Back yard", lastSeen: Timestamp.fromMillis(NOW - 60e3) });
    await db.doc(`readings_hourly/${id}_${hourKeyUtc(NOW)}`).set({ deviceId: id, uploads: 12, lastSeen: Timestamp.fromMillis(NOW - 60e3),
      health: { fw: "0.5.0", uptime_s: 3600, rssi: -61, errors: { sensor_ok: 1 } } });
    await db.doc(`public_sensors/${id}`).set({ code: "ZZZZZZ", hourly: [{ h: hourKeyUtc(NOW - 3600e3), pm: 8.2 }] });
    const token = await login(code);
    const r = await handleOwner(db, cfg, req("GET", "/sensor", undefined, token), NOW + 60e3);
    assert.equal(r.status, 200);
    const b = r.body as Record<string, unknown>;
    assert.equal(b.name, "Back yard");
    assert.equal(b.address, "123 E… Street");
    assert.equal((b.health as { fw: string }).fw, "0.5.0");
    assert.equal((b.health as { lastRestart: number }).lastRestart, Math.floor((NOW - 60e3) / 1000) - 3600);
    assert.ok((b.uploadSuccess as number) > 0 && (b.uploadSuccess as number) <= 1);
    assert.deepEqual(b.chart, [[hourKeyUtc(NOW - 3600e3), 8.2]]);
    const s = JSON.stringify(b);
    for (const bad of ["Example Street", "Apt 4", "10027", "40.81", "-73.96", "\"lat\"", "\"lng\""]) assert.equal(s.includes(bad), false, `${bad}: ${s}`);
    // sliding session: the refreshed token expires later than the original
    const later = verifySession(PEPPER, String(b.token), Math.floor(NOW / 1000))!;
    assert.ok(later.exp > verifySession(PEPPER, token, Math.floor(NOW / 1000))!.exp);
  });

  it("rejects wrong codes, tampered and missing sessions", async () => {
    const { code } = await owned();
    const wrong = await handleOwner(db, cfg, req("POST", "/session", { code: "AAAA-AAAA-AA" }, undefined, "198.51.100.1"), NOW);
    assert.equal(wrong.status, 401);
    assert.equal((await handleOwner(db, cfg, req("GET", "/sensor"), NOW)).status, 401);
    assert.equal((await handleOwner(db, cfg, req("GET", "/sensor", undefined, "x.y"), NOW)).status, 401);
    const t = await login(code);
    assert.equal((await handleOwner(db, cfg, req("GET", "/sensor", undefined, t), NOW + 8 * 86400e3)).status, 401); // expired
  });

  it("brute force: 10 wrong tries per IP per hour, then even the right code is refused from that IP", async () => {
    const { code } = await owned();
    const ip = "192.0.2.55";
    for (let i = 0; i < OWNER.wrongPerIpPerHour; i++) {
      const r = await handleOwner(db, cfg, req("POST", "/session", { code: formatOwnerCode("A".repeat(9) + "B") }, undefined, ip), NOW);
      assert.equal(r.status, 401);
    }
    const blocked = await handleOwner(db, cfg, req("POST", "/session", { code }, undefined, ip), NOW);
    assert.equal(blocked.status, 429);
    const other = await handleOwner(db, cfg, req("POST", "/session", { code }, undefined, "192.0.2.56"), NOW);
    assert.equal(other.status, 200); // other IPs unaffected
    assert.equal((await handleOwner(db, cfg, req("POST", "/session", { code }, undefined, ip), NOW + 3600e3)).status, 200); // next hour
  });

  it("rotation (fresh claim token over USB) issues a new code; the old code and its sessions stop working", async () => {
    const { id, code } = await owned();
    const oldToken = await login(code);
    const t = randomBytes(16).toString("hex");
    await db.doc(`devices/${id}`).set({ claimTokenHash: sha256Hex(t), claimTokenExpires: Timestamp.fromMillis(NOW + 3600e3) }, { merge: true });
    const wrongTok = await handleOwner(db, cfg, req("POST", "/rotate", { d: id, t: randomBytes(16).toString("hex") }), NOW);
    assert.equal(wrongTok.status, 409);
    const r = await handleOwner(db, cfg, req("POST", "/rotate", { d: id, t }), NOW);
    assert.equal(r.status, 200);
    const newCode = String(r.body.ownerCode);
    assert.match(newCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}$/);
    assert.equal((await handleOwner(db, cfg, req("POST", "/session", { code }), NOW)).status, 401); // old code dead
    assert.equal((await handleOwner(db, cfg, req("GET", "/sensor", undefined, oldToken), NOW)).status, 401); // old session dead
    assert.equal((await handleOwner(db, cfg, req("POST", "/rotate", { d: id, t }), NOW)).status, 409); // token single-use
    await login(newCode.replace(/-/g, ""));
  });

  it("settings: rename, inside/outside, new address (re-placed by the publish job)", async () => {
    const { id, code } = await owned();
    await db.doc(`public_sensors/${id}`).set({ code: "YYYYYY", cell: "x", center: [40.8, -73.9], placement: "placed", indoor: false });
    const t = await login(code);
    assert.equal((await handleOwner(db, cfg, req("PATCH", "/sensor", { name: "x".repeat(41) }, t), NOW)).status, 400);
    assert.equal((await handleOwner(db, cfg, req("PATCH", "/sensor", { name: " Roof  deck ", indoor: true }, t), NOW)).status, 200);
    let dev = (await db.doc(`devices/${id}`).get()).data()!;
    assert.equal(dev.name, "Roof deck");
    assert.equal(dev.indoor, true);
    assert.equal((await db.doc(`public_sensors/${id}`).get()).get("indoor"), true);
    assert.equal((await handleOwner(db, cfg, req("PATCH", "/sensor", { address: "9 New Pl", zip: "ABCDE" }, t), NOW)).status, 400);
    assert.equal((await handleOwner(db, cfg, req("PATCH", "/sensor", { address: "9 New Pl", zip: "11201" }, t), NOW)).status, 200);
    const loc = (await db.doc(`private_locations/${id}`).get()).data()!;
    assert.equal(loc.address, "9 New Pl");
    assert.equal(loc.lat, undefined); // old exact location dropped
    dev = (await db.doc(`devices/${id}`).get()).data()!;
    assert.equal(dev.locationPending, true);
    assert.equal((await db.doc(`public_sensors/${id}`).get()).get("center"), null); // old block hidden until re-placed
  });

  it("delete my data: readings, location, map entry, codes, notices gone; device retired; sessions dead", async () => {
    const { id, code } = await owned();
    const t = await login(code);
    await db.doc(`readings_hourly/${id}_${hourKeyUtc(NOW)}`).set({ deviceId: id, r: { "1": { pm25: 5 } } });
    await db.doc(`public_sensors/${id}`).set({ code: "XXXXXX" });
    await db.doc(`device_secrets/${id}`).set({ secret: "s" });
    assert.equal((await handleOwner(db, cfg, req("POST", "/push", { subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/abc123", keys: { p256dh: Buffer.alloc(65, 4).toString("base64url"), auth: Buffer.alloc(16, 7).toString("base64url") } } }, t), NOW)).status, 200);
    assert.equal((await handleOwner(db, cfg, req("DELETE", "/sensor/data", undefined, t), NOW)).status, 200);
    for (const p of [`readings_hourly/${id}_${hourKeyUtc(NOW)}`, `private_locations/${id}`, `public_sensors/${id}`, `device_secrets/${id}`]) {
      assert.equal((await db.doc(p).get()).exists, false, p);
    }
    assert.equal((await db.collection(`devices/${id}/push_subs`).get()).size, 0);
    assert.equal((await db.collection("owner_codes").where("deviceId", "==", id).get()).size, 0);
    const dev = (await db.doc(`devices/${id}`).get()).data()!;
    assert.equal(dev.status, "retired");
    assert.equal(dev.archivePurgePending, true);
    assert.equal((await handleOwner(db, cfg, req("GET", "/sensor", undefined, t), NOW)).status, 401);
    assert.equal((await handleOwner(db, cfg, req("POST", "/session", { code }), NOW)).status, 401);
  });

  it("logs never contain owner codes, tokens, or addresses", async () => {
    const lines: string[] = [];
    const orig = { info: logger.info, warn: logger.warn };
    logger.info = (...a: unknown[]) => void lines.push(JSON.stringify(a));
    logger.warn = (...a: unknown[]) => void lines.push(JSON.stringify(a));
    try {
      const { code } = await owned();
      const t = await login(code);
      await handleOwner(db, cfg, req("POST", "/session", { code: "AAAA-AAAA-AA" }, undefined, "192.0.2.99"), NOW);
      await handleOwner(db, cfg, req("PATCH", "/sensor", { address: "77 Secret Ln", zip: "10001" }, t), NOW);
      const all = lines.join("\n");
      for (const bad of [code, formatOwnerCode(code), t, "77 Secret", "10001", "AAAA-AAAA-AA", "192.0.2.99"]) assert.equal(all.includes(bad), false, bad);
    } finally {
      logger.info = orig.info;
      logger.warn = orig.warn;
    }
  });

  it("public history by short code, without any location", async () => {
    const id = `esp8266-${7790000 + ++n}`;
    await db.doc(`public_sensors/${id}`).set({ code: "HSTRY2", center: [40.7, -74], hourly: [{ h: "2026112213", pm: 4.4, rh: 50 }] });
    const r = await sensorHistory(db, "HSTRY2");
    assert.deepEqual(r.body, { ok: true, code: "HSTRY2", h: [["2026112213", 4.4]] });
    assert.equal((await sensorHistory(db, "NOPE99")).status, 404);
    assert.equal((await sensorHistory(db, "<script>")).status, 404);
  });
});

describe("owner security fixes (emulator)", () => {
  before(() => {
    if (!getApps().length) initializeApp({ projectId: PROJECT });
    db = getFirestore();
  });

  it("client IP: first entry through Hosting (CDN), last entry for direct calls; IPv6 keyed by /64", () => {
    assert.equal(clientIp({ "x-forwarded-for": "198.51.100.4, 151.101.1.1", "cdn-loop": "Fastly, Fastly" }), "198.51.100.4");
    assert.equal(clientIp({ "x-forwarded-for": "9.9.9.9, 198.51.100.4" }), "198.51.100.4"); // direct + spoofed header
    assert.equal(clientIp({ "x-forwarded-for": "198.51.100.4" }), "198.51.100.4");
    assert.equal(clientIp({ "x-forwarded-for": "2001:db8:aa:bb:1:2:3:4, 151.101.1.1", "cdn-loop": "Fastly" }), "2001:db8:aa:bb::/64");
    assert.equal(clientIp({}, "203.0.113.9"), "203.0.113.9");
  });

  it("parallel wrong guesses can't get past the per-IP limit", async () => {
    await owned();
    const ip = "198.51.100.200";
    const results = await Promise.all(Array.from({ length: 30 }, () =>
      handleOwner(db, cfg, req("POST", "/session", { code: "BBBB-BBBB-BB" }, undefined, ip), NOW)));
    const wrong = results.filter((r) => r.status === 401).length;
    assert.ok(wrong <= OWNER.wrongPerIpPerHour, `${wrong} guesses were checked`);
    assert.equal(results.filter((r) => r.status === 429).length, 30 - wrong);
  });

  it("a correct code doesn't use up the IP's allowance, and a guessing surge never locks out correct codes", async () => {
    const { code } = await owned();
    const ip = "198.51.100.201";
    for (let i = 0; i < 15; i++) await login(code, ip); // 15 correct logins from one IP: all fine
    const hour = Math.floor(NOW / 3600e3);
    await db.doc(`owner_attempts/global_${hour}`).set({ n: OWNER.wrongGlobalPerHour + 50 });
    await login(code, "198.51.100.202"); // global surge: correct codes still work
  });

  it("checkOwnerCode is a reusable helper (for partner links later)", async () => {
    const { id, code } = await owned();
    const r = await checkOwnerCode(db, PEPPER, "test-ip-key-1", code, NOW);
    assert.ok(typeof r === "object" && r.deviceId === id);
    assert.equal(await checkOwnerCode(db, PEPPER, "test-ip-key-1", "AAAA-AAAA-AA", NOW), "wrong");
  });

  it("rotation refuses expired tokens and retired sensors", async () => {
    const a = await owned();
    const t = randomBytes(16).toString("hex");
    await db.doc(`devices/${a.id}`).set({ claimTokenHash: sha256Hex(t), claimTokenExpires: Timestamp.fromMillis(NOW - 1) }, { merge: true });
    assert.equal((await handleOwner(db, cfg, req("POST", "/rotate", { d: a.id, t }), NOW)).status, 409);
    const b = await owned({ status: "retired" });
    const t2 = randomBytes(16).toString("hex");
    await db.doc(`devices/${b.id}`).set({ claimTokenHash: sha256Hex(t2), claimTokenExpires: Timestamp.fromMillis(NOW + 3600e3) }, { merge: true });
    assert.equal((await handleOwner(db, cfg, req("POST", "/rotate", { d: b.id, t: t2 }), NOW)).status, 409);
  });

  it("push: only real push services, real key sizes, at most 10 browsers per sensor; status is per browser", async () => {
    assert.ok(isPushServiceUrl("https://fcm.googleapis.com/fcm/send/x"));
    assert.ok(isPushServiceUrl("https://web.push.apple.com/abc"));
    assert.ok(isPushServiceUrl("https://updates.push.services.mozilla.com/wpush/v2/x"));
    for (const bad of ["https://evil.example/x", "http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.com/x", "https://push.apple.com.evil/x"]) {
      assert.equal(isPushServiceUrl(bad), false, bad);
    }
    const { id, code } = await owned();
    const t = await login(code);
    const keys = { p256dh: Buffer.alloc(65, 1).toString("base64url"), auth: Buffer.alloc(16, 2).toString("base64url") };
    const bad = await handleOwner(db, cfg, req("POST", "/push", { subscription: { endpoint: "https://evil.example/x", keys } }, t), NOW);
    assert.equal(bad.status, 400);
    const shortKey = await handleOwner(db, cfg, req("POST", "/push", { subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/z", keys: { ...keys, auth: "AA" } } }, t), NOW);
    assert.equal(shortKey.status, 400);
    for (let i = 0; i < OWNER.maxPushSubs; i++) {
      const r = await handleOwner(db, cfg, req("POST", "/push", { subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/${i}`, keys } }, t), NOW);
      assert.equal(r.status, 200, `sub ${i}`);
    }
    const over = await handleOwner(db, cfg, req("POST", "/push", { subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/11", keys } }, t), NOW);
    assert.equal(over.status, 400);
    assert.equal((await db.doc(`devices/${id}`).get()).get("notifyOffline"), true); // flag on the device itself
    const ep = sha256Hex("https://fcm.googleapis.com/fcm/send/3");
    const mine = await handleOwner(db, cfg, { ...req("GET", "/sensor", undefined, t), query: { ep } }, NOW);
    assert.equal(mine.body.notices, true);
    const other = await handleOwner(db, cfg, { ...req("GET", "/sensor", undefined, t), query: { ep: sha256Hex("https://fcm.googleapis.com/fcm/send/none") } }, NOW);
    assert.equal(other.body.notices, false);
  });

  it("sessions have an absolute 90-day limit even when used every day", async () => {
    const { code } = await owned();
    let t = await login(code);
    for (let day = 6; day <= 84; day += 6) {
      const r = await handleOwner(db, cfg, req("GET", "/sensor", undefined, t), NOW + day * 86400e3);
      assert.equal(r.status, 200, `day ${day}`);
      t = String(r.body.token);
    }
    assert.equal((await handleOwner(db, cfg, req("GET", "/sensor", undefined, t), NOW + 91 * 86400e3)).status, 401);
  });

  it("ingest refuses setup info for a sensor whose data was deleted (even with a stale device cache)", async () => {
    const id = `esp8266-${7950000 + ++n}`;
    await db.doc(`devices/${id}`).set({ status: "allowlisted" });
    const secret = randomBytes(32).toString("hex");
    const up = async (body: object, enroll: boolean, atMs: number) => {
      const raw = Buffer.from(JSON.stringify(body));
      const ts = String(Math.floor(atMs / 1000));
      const headers: Record<string, string> = { "x-device-id": id, "x-timestamp": ts, "x-signature": sign(secret, ts, raw) };
      if (enroll) headers["x-enroll-secret"] = secret;
      return handleIngest(db, { method: "POST", headers, rawBody: raw }, atMs);
    };
    const base = { fw: "0.6.0", uptime_s: 1, rssi: -50, readings: [] };
    clearRegistryCache();
    assert.equal((await up(base, true, NOW)).status, 200); // enrolled + cached as active
    await deleteSensorData(db, id, NOW + 1000);
    const r = await up({ ...base, setup: { address: "1 Late St", zip: "10001", indoor: false } }, false, NOW + 60e3);
    assert.equal(r.status, 403);
    assert.equal((await db.doc(`private_locations/${id}`).get()).exists, false);
  });
});

describe("offline notices + archive purge (emulator)", () => {
  before(() => {
    if (!getApps().length) initializeApp({ projectId: PROJECT });
    db = getFirestore();
  });

  it("sends one push on online -> offline, in the subscriber's language, and drops dead subscriptions", async () => {
    const id = `esp8266-${7800000 + ++n}`;
    await db.doc(`devices/${id}`).set({ status: "active", indoor: false });
    await db.doc(`public_sensors/${id}`).set({ code: "PUSHME", cell: "c", center: [40.7, -74], placement: "placed", notifyOffline: true });
    await db.doc(`devices/${id}/push_subs/a`).set({ sub: { endpoint: "https://push.example/a", keys: { p256dh: "p", auth: "a" } }, lang: "es" });
    await db.doc(`devices/${id}/push_subs/b`).set({ sub: { endpoint: "https://push.example/gone", keys: { p256dh: "p", auth: "a" } }, lang: "en" });
    const sent: { endpoint: string; payload: string }[] = [];
    const push: PushSender = async (sub, payload) => {
      sent.push({ endpoint: sub.endpoint, payload });
      return { gone: sub.endpoint.endsWith("/gone") };
    };
    const nws = async () => ({ ok: false, json: async () => ({}) });
    const geocode = async () => ({ kind: "unavailable" as const });
    await db.doc(`readings_hourly/${id}_${hourKeyUtc(NOW)}`).set({ deviceId: id, lastSeen: Timestamp.fromMillis(NOW - 60e3),
      latest: { ts: Math.floor((NOW - 60e3) / 1000), pm25: 5 }, r: {} });
    await runPublish(db, { geocode, nws, push }, NOW); // online: no notice
    assert.equal(sent.length, 0);
    await runPublish(db, { geocode, nws, push }, NOW + 45 * 60e3); // 45 min silent: offline -> notice
    assert.equal(sent.length, 2);
    assert.ok(JSON.parse(sent.find((x) => x.endpoint.endsWith("/a"))!.payload).body.includes("dejó de enviar"));
    assert.equal((await db.doc(`devices/${id}/push_subs/b`).get()).exists, false); // gone subscription removed
    await runPublish(db, { geocode, nws, push }, NOW + 50 * 60e3); // still offline: no repeat
    assert.equal(sent.length, 2);
  });

  it("purge rewrites archive files without the deleted device (and resumes until done)", async () => {
    const files = new Map<string, Buffer>();
    const day = (d: string, lines: object[]) => files.set(`archive/raw/v1/2026/11/${d}.ndjson.gz`, gzipSync(lines.map((l) => JSON.stringify(l)).join("\n") + "\n"));
    day("10", [{ device: "esp8266-1", ts: 1 }, { device: "esp8266-GONE", ts: 2 }]);
    day("11", [{ device: "esp8266-GONE", ts: 3 }]);
    day("12", [{ device: "esp8266-1", ts: 4 }]);
    const id = "esp8266-GONE";
    await db.doc(`devices/${id}`).set({ status: "retired", archivePurgePending: true, enrolledAt: Timestamp.fromMillis(Date.UTC(2026, 10, 9)) });
    const store = {
      save: async (p: string, b: Buffer) => void files.set(p, b),
      read: async (p: string) => files.get(p) ?? null,
      list: async () => [...files.keys()],
    };
    await db.doc("public/archive_state").set({ lastDay: "2026-11-30" }); // archive already covers the deletion day
    const done = await runArchivePurge(db, store, NOW);
    assert.ok(done.includes(id));
    const all = [...files.values()].map((b) => gunzipSync(b).toString()).join("");
    assert.equal(all.includes("GONE"), false);
    assert.ok(all.includes("\"ts\":1") && all.includes("\"ts\":4"));
    assert.equal((await db.doc(`devices/${id}`).get()).get("archivePurgePending"), false);
  });

  it("purge handles already-decompressed downloads, deletes late readings, and waits until the deletion day is archived", async () => {
    const id = "esp8266-LATE";
    const files = new Map<string, Buffer>();
    files.set("archive/raw/v1/2026/11/20.ndjson.gz", Buffer.from(`{"device":"esp8266-LATE","ts":1}\n{"device":"esp8266-2","ts":2}\n`)); // plain text
    files.set("archive/raw/v1/2026/11/21.ndjson.gz", gzipSync(`{"device":"esp8266-LATE","ts":3}\n`));
    const deletedAt = Date.UTC(2026, 10, 22, 23, 58);
    await db.doc(`devices/${id}`).set({ status: "retired", archivePurgePending: true, deletedAt: Timestamp.fromMillis(deletedAt),
      enrolledAt: Timestamp.fromMillis(Date.UTC(2026, 10, 19)) });
    await db.doc(`readings_hourly/${id}_2026112300`).set({ deviceId: id, r: { "9": { pm25: 1 } } }); // arrived after deletion
    const store = { save: async (p: string, b: Buffer) => void files.set(p, b), read: async (p: string) => files.get(p) ?? null, list: async () => [...files.keys()] };
    await db.doc("public/archive_state").set({ lastDay: "2026-11-22" }); // the day after deletion (23rd, +10 min) isn't archived yet
    assert.deepEqual(await runArchivePurge(db, store, NOW), []);
    assert.equal((await db.doc(`readings_hourly/${id}_2026112300`).get()).exists, false); // leftover deleted anyway
    assert.equal((await db.doc(`devices/${id}`).get()).get("archivePurgePending"), true);
    await db.doc("public/archive_state").set({ lastDay: "2026-11-23" });
    assert.deepEqual(await runArchivePurge(db, store, NOW), [id]);
    const all = [...files.values()].map((b) => (b[0] === 0x1f ? gunzipSync(b) : b).toString()).join("");
    assert.equal(all.includes("LATE"), false);
    assert.ok(all.includes("esp8266-2"));
  });

  it("notices work for a sensor that wasn't on the map when they were turned on", async () => {
    const id = `esp8266-${7960000 + ++n}`;
    await db.doc(`devices/${id}`).set({ status: "active", indoor: false, notifyOffline: true, publicCellPending: true });
    await db.doc(`private_locations/${id}`).set({ address: "1 A St", zip: "10001", lat: 40.7, lng: -74.0 });
    const geocode = async () => ({ kind: "unavailable" as const });
    const nws = async () => ({ ok: false, json: async () => ({}) });
    await runPublish(db, { geocode, nws }, NOW);
    assert.equal((await db.doc(`public_sensors/${id}`).get()).get("notifyOffline"), true);
  });
});
