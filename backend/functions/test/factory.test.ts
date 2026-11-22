// Factory registration (M9) on the Firestore emulator.
import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";

import { FactoryRequest, handleFactory, newShortCode, parseKeyHashes, stationKeyHash } from "../src/factory";
import { formatOwnerCode, normalizeOwnerCode, ownerCodeHash } from "../src/lib/ownerCode";
import { checkOwnerCode, deleteSensorData } from "../src/owner/api";

const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-prosefire";
const PEPPER = "test-pepper-0123456789abcdef0123456789abcdef";
const KEY = randomBytes(32).toString("hex");
const OTHER_KEY = randomBytes(32).toString("hex");
const cfg = { pepper: PEPPER, keyHashes: parseKeyHashes(`bench-laptop ${stationKeyHash(KEY)}\n# junk line\nbad nothex`) };
let db: Firestore;
let n = 0;

const req = (body: unknown, key = KEY, path = "/api/v1/factory/register", method = "POST"): FactoryRequest => ({
  method, path, headers: key ? { authorization: `Bearer ${key}` } : {},
  rawBody: Buffer.from(typeof body === "string" ? body : JSON.stringify(body)),
});
const newId = () => `esp8266-${9100000 + ++n}`;

describe("factory register (emulator)", () => {
  before(() => {
    if (!getApps().length) initializeApp({ projectId: PROJECT });
    db = getFirestore();
  });

  it("parses the key list strictly", () => {
    assert.equal(cfg.keyHashes.size, 1);
    assert.equal(cfg.keyHashes.get(stationKeyHash(KEY)), "bench-laptop");
    assert.match(newShortCode(), /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
  });

  it("rejects missing, wrong, and malformed station keys", async () => {
    for (const k of ["", OTHER_KEY, "abc", KEY.toUpperCase() + "0"]) {
      const r = await handleFactory(db, cfg, req({ deviceId: newId() }, k));
      assert.equal(r.status, 401, k);
    }
    assert.equal((await handleFactory(db, cfg, req({}, KEY, "/api/v1/factory/other"))).status, 404);
    assert.equal((await handleFactory(db, cfg, req({}, KEY, undefined, "GET"))).status, 405);
  });

  it("validates the body", async () => {
    for (const b of ["not json", { deviceId: "esp32-1" }, { deviceId: "esp8266-12", fw: "1.0" }, {}]) {
      assert.equal((await handleFactory(db, cfg, req(b))).status, 400, JSON.stringify(b));
    }
  });

  it("registers a new chip: allowlisted, unique short code, owner code that works and is stored only hashed", async () => {
    const id = newId();
    const logs: string[] = [];
    const orig = logger.info;
    (logger as { info: unknown }).info = (...a: unknown[]) => logs.push(JSON.stringify(a));
    let r;
    try {
      r = await handleFactory(db, cfg, req({ deviceId: id, fw: "0.7.0" }));
    } finally {
      (logger as { info: unknown }).info = orig;
    }
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const { shortCode, ownerCode } = r.body as { shortCode: string; ownerCode: string };
    assert.match(shortCode, /^[A-Z2-9]{6}$/);
    assert.match(ownerCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{2}$/);
    const dev = await db.doc(`devices/${id}`).get();
    assert.equal(dev.get("status"), "allowlisted");
    assert.equal(dev.get("shortCode"), shortCode);
    assert.equal(dev.get("station"), "bench-laptop");
    assert.equal(dev.get("fwAtFactory"), "0.7.0");
    assert.equal((await db.doc(`short_codes/${shortCode}`).get()).get("deviceId"), id);
    const code = normalizeOwnerCode(ownerCode)!;
    assert.ok((await db.doc(`owner_codes/${ownerCodeHash(PEPPER, code)}`).get()).exists);
    assert.ok(!JSON.stringify(dev.data()).includes(code), "owner code must not be stored in the clear");
    assert.ok(!logs.join("").includes(code) && !logs.join("").includes(KEY), "logs must not contain the owner code or key");
    const check = await checkOwnerCode(db, PEPPER, "203.0.113.50", ownerCode, Date.now());
    assert.ok(typeof check === "object" && check.deviceId === id);
  });

  it("never hands out a short code that's taken", async () => {
    const taken = "TAKEN2";
    await db.doc(`short_codes/${taken}`).set({ deviceId: "esp8266-1" });
    const seq = [taken, taken, "FRESH3"];
    const r = await handleFactory(db, cfg, req({ deviceId: newId() }), () => seq.shift()!);
    assert.equal(r.body.shortCode, "FRESH3");
    const r2 = await handleFactory(db, cfg, req({ deviceId: newId() }), () => taken);
    assert.equal(r2.status, 503);
  });

  it("re-registering an unused chip keeps the short code, replaces the owner code, clears the old secret", async () => {
    const id = newId();
    const a = await handleFactory(db, cfg, req({ deviceId: id }));
    await db.doc(`device_secrets/${id}`).set({ secret: "aa".repeat(32) });
    const b = await handleFactory(db, cfg, req({ deviceId: id }));
    assert.equal(b.status, 200);
    assert.equal(b.body.shortCode, a.body.shortCode);
    assert.equal(b.body.reprovisioned, true);
    assert.notEqual(b.body.ownerCode, a.body.ownerCode);
    assert.equal(await checkOwnerCode(db, PEPPER, "203.0.113.51", String(a.body.ownerCode), Date.now()), "wrong");
    assert.equal(typeof await checkOwnerCode(db, PEPPER, "203.0.113.51", String(b.body.ownerCode), Date.now()), "object");
    assert.equal((await db.doc(`device_secrets/${id}`).get()).exists, false);
    assert.equal((await db.collection("owner_codes").where("deviceId", "==", id).get()).size, 1);
  });

  it("a chip in use is always refused; nothing is deleted", async () => {
    const id = newId();
    const first = await handleFactory(db, cfg, req({ deviceId: id }));
    await db.doc(`devices/${id}`).set({ status: "active" }, { merge: true });
    await db.doc(`private_locations/${id}`).set({ address: "123 Example Street", zip: "10027" });
    for (const reprovision of [false, true]) {
      const r = await handleFactory(db, cfg, req({ deviceId: id, reprovision }));
      assert.equal(r.status, 409);
      assert.equal(r.body.error, "already_in_use");
    }
    await db.doc(`private_locations/${id}`).delete();
    assert.equal((await handleFactory(db, cfg, req({ deviceId: id, reprovision: true }))).body.error, "already_in_use");
    assert.equal(typeof await checkOwnerCode(db, PEPPER, "203.0.113.52", String(first.body.ownerCode), Date.now()), "object");
  });

  it("after Delete my data: only with reprovision, after the archive purge, with every per-owner field reset", async () => {
    const id = newId();
    const first = await handleFactory(db, cfg, req({ deviceId: id }));
    await db.doc(`devices/${id}`).set({ status: "active", name: "Porch", indoor: true, scRegistered: true,
      enrolledAt: new Date(), fw: "0.7.0", rssi: -50 }, { merge: true });
    await db.doc(`private_locations/${id}`).set({ address: "123 Example Street", zip: "10027" });
    await db.doc(`readings_hourly/${id}_2026112210`).set({ deviceId: id, r: { "1": { pm25_cf1: 5 } } });
    await deleteSensorData(db, id, Date.now()); // the owner's "Delete my data"
    assert.equal((await handleFactory(db, cfg, req({ deviceId: id }))).body.error, "already_in_use"); // needs the flag
    const pending = await handleFactory(db, cfg, req({ deviceId: id, reprovision: true }));
    assert.equal(pending.status, 409);
    assert.equal(pending.body.error, "purge_pending"); // old archived readings not purged yet
    await db.doc(`devices/${id}`).set({ archivePurgePending: false }, { merge: true }); // nightly purge done
    await db.doc(`private_locations/${id}`).set({ address: "x" }); // (if an address somehow exists: refused)
    assert.equal((await handleFactory(db, cfg, req({ deviceId: id, reprovision: true }))).body.error, "owner_data_present");
    await db.doc(`private_locations/${id}`).delete();
    const r = await handleFactory(db, cfg, req({ deviceId: id, reprovision: true }));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.shortCode, first.body.shortCode);
    const dev = (await db.doc(`devices/${id}`).get()).data()!;
    assert.equal(dev.status, "allowlisted");
    for (const f of ["scRegistered", "name", "indoor", "deletedAt", "enrolledAt", "archivePurgePending", "fw", "rssi"]) {
      assert.ok(!(f in dev), `${f} must be reset`);
    }
    assert.equal((await db.doc(`public_sensors/${id}`).get()).exists, false);
    assert.equal(typeof await checkOwnerCode(db, PEPPER, "203.0.113.53", String(r.body.ownerCode), Date.now()), "object");
  });

  it("formats owner codes the way the card prints them", () => {
    assert.equal(formatOwnerCode("7KQ2MX4PR9"), "7KQ2-MX4P-R9");
  });
});
