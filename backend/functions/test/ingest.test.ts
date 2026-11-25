// Ingest against the Firestore emulator (run inside `firebase emulators:exec`).
import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";

import { clearRegistryCache, handleIngest, hourKey, INGEST, IngestRequest } from "../src/ingest";
import { sign } from "../src/lib/hmac";
import { redact } from "../src/lib/redact";

const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-prosefire";
let db: Firestore;
const NOW = Date.UTC(2026, 10, 21, 15, 30, 0); // fixed clock
const NOW_S = Math.floor(NOW / 1000);
let n = 0;

function reading(ts: number, pm25 = 9) {
  return {
    ts, n: 60, pm1_cf1: 6, pm25_cf1: pm25, pm10_cf1: 12, pm1_atm: 6, pm25_atm: pm25, pm10_atm: 12,
    counts: [1500, 450, 80, 10, 2, 1], pm25_cf1_min: pm25 - 2, pm25_cf1_max: pm25 + 3,
  };
}

function upload(extra: Record<string, unknown> = {}, readings = [reading(NOW_S - 10)]) {
  return { fw: "0.3.0", uptime_s: 1234, rssi: -61, readings, errors: { csum_err: 0 }, ...extra };
}

function req(id: string, secret: string, body: unknown, opts: { ts?: number; enroll?: boolean; sig?: string } = {}): IngestRequest {
  const raw = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  const ts = String(opts.ts ?? NOW_S);
  const headers: Record<string, string> = {
    "x-device-id": id, "x-timestamp": ts, "x-signature": opts.sig ?? sign(secret, ts, raw),
  };
  if (opts.enroll) headers["x-enroll-secret"] = secret;
  return { method: "POST", headers, rawBody: raw };
}

async function newDevice(status = "allowlisted"): Promise<{ id: string; secret: string }> {
  const id = `esp8266-${1000000 + ++n}${Math.floor(Math.random() * 1000)}`;
  await db.doc(`devices/${id}`).set({ status, shortCode: "ABC234" });
  return { id, secret: randomBytes(32).toString("hex") };
}

async function enrolled(): Promise<{ id: string; secret: string }> {
  const d = await newDevice();
  const r = await handleIngest(db, req(d.id, d.secret, upload(), { enroll: true }), NOW);
  assert.equal(r.status, 200);
  return d;
}

describe("ingest (emulator)", () => {
  before(() => {
    if (!getApps().length) initializeApp({ projectId: PROJECT });
    db = getFirestore();
  });
  beforeEach(() => clearRegistryCache());

  it("enrolls an allowlisted device on first upload and stores the reading", async () => {
    const d = await newDevice();
    const r = await handleIngest(db, req(d.id, d.secret, upload(), { enroll: true }), NOW);
    assert.equal(r.status, 200);
    assert.equal(r.body.accepted, 1);
    assert.equal((await db.doc(`devices/${d.id}`).get()).get("status"), "active");
    assert.equal((await db.doc(`device_secrets/${d.id}`).get()).get("secret"), d.secret);
    const hour = await db.doc(`readings_hourly/${d.id}_${hourKey(NOW_S)}`).get();
    assert.equal(hour.get("uploads"), 1);
    assert.equal(hour.get(`r.${NOW_S - 10}`).pm25, 9);
    assert.equal(hour.get("latest").pm25, 9);
    assert.ok(hour.get("expireAt").toMillis() > NOW + 34 * 86400e3);
  });

  it("accepts later uploads signed with the enrolled secret, ignoring a new enroll header", async () => {
    const d = await enrolled();
    clearRegistryCache();
    const ok = await handleIngest(db, req(d.id, d.secret, upload({}, [reading(NOW_S - 5, 11)])), NOW);
    assert.equal(ok.status, 200);
    const attacker = randomBytes(32).toString("hex"); // can't re-enroll an active device
    const bad = await handleIngest(db, req(d.id, attacker, upload(), { enroll: true }), NOW);
    assert.equal(bad.status, 401);
  });

  it("rejects a bad signature", async () => {
    const d = await enrolled();
    const r = await handleIngest(db, req(d.id, d.secret, upload(), { sig: "0".repeat(64) }), NOW);
    assert.equal(r.status, 401);
    assert.equal(r.body.error, "bad_signature");
  });

  it("rejects a tampered body", async () => {
    const d = await enrolled();
    const good = req(d.id, d.secret, upload());
    const tampered = { ...good, rawBody: Buffer.from(good.rawBody!.toString().replace('"pm25_cf1":9', '"pm25_cf1":99')) };
    assert.equal((await handleIngest(db, tampered, NOW)).status, 401);
  });

  it("rejects unknown and retired devices", async () => {
    const secret = randomBytes(32).toString("hex");
    const unknown = await handleIngest(db, req("esp8266-424242", secret, upload(), { enroll: true }), NOW);
    assert.equal(unknown.status, 403);
    const d = await newDevice("retired");
    assert.equal((await handleIngest(db, req(d.id, d.secret, upload(), { enroll: true }), NOW)).status, 403);
  });

  it("rejects clock skew beyond 10 minutes and tells the device the server time", async () => {
    const d = await enrolled();
    const r = await handleIngest(db, req(d.id, d.secret, upload(), { ts: NOW_S - INGEST.timestampWindowS - 1 }), NOW);
    assert.equal(r.status, 401);
    assert.equal(r.body.error, "clock_skew");
    assert.equal(r.body.server_time, NOW_S);
    const ahead = await handleIngest(db, req(d.id, d.secret, upload(), { ts: NOW_S + INGEST.timestampWindowS + 1 }), NOW);
    assert.equal(ahead.status, 401);
    const edge = await handleIngest(db, req(d.id, d.secret, upload(), { ts: NOW_S + 300 }), NOW);
    assert.equal(edge.status, 200);
  });

  it("replay: an old captured request is rejected; a resend within the window is idempotent", async () => {
    const d = await enrolled();
    const captured = req(d.id, d.secret, upload({}, [reading(NOW_S - 100)]));
    assert.equal((await handleIngest(db, captured, NOW)).body.accepted, 1);
    const again = await handleIngest(db, captured, NOW + 60e3);
    assert.equal(again.status, 200);
    assert.equal(again.body.accepted, 0);
    assert.equal(again.body.duplicates, 1);
    const later = await handleIngest(db, captured, NOW + 11 * 60e3);
    assert.equal(later.status, 401);
  });

  it("rate-limits a device after 60 uploads in an hour", async () => {
    const d = await enrolled(); // 1 upload already
    for (let i = 1; i < INGEST.maxUploadsPerHour; i++) {
      const r = await handleIngest(db, req(d.id, d.secret, upload({}, [reading(NOW_S - 1000 + i)])), NOW);
      assert.equal(r.status, 200, `upload ${i}`);
    }
    const r = await handleIngest(db, req(d.id, d.secret, upload({}, [reading(NOW_S - 1)])), NOW);
    assert.equal(r.status, 429);
  });

  it("rejects oversize, malformed, and invalid payloads", async () => {
    const d = await enrolled();
    const big = await handleIngest(db, req(d.id, d.secret, "x".repeat(17 * 1024)), NOW);
    assert.equal(big.status, 413);
    assert.equal((await handleIngest(db, req(d.id, d.secret, "{not json"), NOW)).status, 400);
    const healthOnly = await handleIngest(db, req(d.id, d.secret, upload({}, [])), NOW);
    assert.equal(healthOnly.status, 200); // readings: [] = health-only upload (warm-up, unplugged sensor)
    assert.equal(healthOnly.body.accepted, 0);
    const neg = upload({}, [{ ...reading(NOW_S), pm25_cf1: -1 }]);
    assert.equal((await handleIngest(db, req(d.id, d.secret, neg), NOW)).status, 400);
    const future = upload({}, [reading(NOW_S + 3600)]);
    assert.equal((await handleIngest(db, req(d.id, d.secret, future), NOW)).status, 400);
    const badHeaders = { method: "POST", headers: { "x-device-id": "evil/../x" }, rawBody: Buffer.from("{}") };
    assert.equal((await handleIngest(db, badHeaders, NOW)).status, 400);
    assert.equal((await handleIngest(db, { ...badHeaders, method: "GET" }, NOW)).status, 405);
  });

  it("stores the device's reset reason with the hour's health (fw 0.7.6+)", async () => {
    const d = await enrolled();
    const errors = { csum_err: 0, heap: 36000, reset_reason: 2, reset_exc: 28, reset_addr: 1075843636 };
    const r = await handleIngest(db, req(d.id, d.secret, upload({ errors }, [reading(NOW_S - 5)])), NOW);
    assert.equal(r.status, 200);
    const h = (await db.doc(`readings_hourly/${d.id}_${hourKey(NOW_S)}`).get()).data()!.health;
    assert.deepEqual(h.errors, errors);
  });

  it("puts readings from an earlier hour into that hour's bucket", async () => {
    const d = await enrolled();
    const prev = NOW_S - 3600;
    const r = await handleIngest(db, req(d.id, d.secret, upload({}, [reading(prev), reading(NOW_S - 3)])), NOW);
    assert.equal(r.body.accepted, 2);
    const old = await db.doc(`readings_hourly/${d.id}_${hourKey(prev)}`).get();
    assert.ok(old.get(`r.${prev}`));
    assert.equal(old.get("uploads"), undefined); // counter only on the current hour
  });

  it("privacy: setup address goes only to private_locations; claim hash stored; nothing public has it", async () => {
    const d = await enrolled();
    const setup = { address: "123 Example St Apt 4", zip: "10027", indoor: false };
    const claim = "a".repeat(64);
    const r = await handleIngest(db, req(d.id, d.secret, upload({ setup, claim_token_hash: claim })), NOW);
    assert.equal(r.status, 200);
    assert.equal(JSON.stringify(r.body).includes("Example"), false);
    const loc = await db.doc(`private_locations/${d.id}`).get();
    assert.equal(loc.get("address"), setup.address);
    const dev = (await db.doc(`devices/${d.id}`).get()).data()!;
    assert.equal(dev.claimTokenHash, claim);
    assert.equal(dev.indoor, false);
    const hour = (await db.doc(`readings_hourly/${d.id}_${hourKey(NOW_S)}`).get()).data()!;
    for (const doc of [dev, hour]) {
      const s = JSON.stringify(doc);
      assert.equal(/Example|10027|address|"lat"|"lng"|zip/i.test(s), false, s);
    }
    assert.equal(/secret/i.test(JSON.stringify(dev)), false);
  });

  it("bad setup info (non-US ZIP) is rejected before anything is written", async () => {
    const d = await enrolled();
    const r = await handleIngest(db, req(d.id, d.secret, upload({ setup: { address: "x", zip: "ABC", indoor: true } })), NOW);
    assert.equal(r.status, 400);
    assert.equal((await db.doc(`private_locations/${d.id}`).get()).exists, false);
  });
});

describe("log redaction", () => {
  it("never lets private fields through, at any depth", () => {
    const out = JSON.stringify(redact({
      device: "esp8266-1", address: "123 Main", nested: { lat: 40.8, lng: -73.9, zip: "10027" },
      arr: [{ secret: "s", claim_token: "t", ownerCode: "o", X_Signature: "x" }], accepted: 3,
    }));
    for (const bad of ["123 Main", "40.8", "-73.9", "10027", '"s"', '"t"', '"o"', '"x"']) {
      assert.equal(out.includes(bad), false, `${bad} leaked: ${out}`);
    }
    assert.ok(out.includes("esp8266-1") && out.includes('"accepted":3'));
  });
});
