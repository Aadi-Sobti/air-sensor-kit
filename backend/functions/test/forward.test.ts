// Sensor.Community forwarding (M8).
import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";

import { forwardOne, RetryableError, SC_URL, ScTask, scRequest, taskFor } from "../src/forward";
import { clearRegistryCache, handleIngest } from "../src/ingest";
import { sign } from "../src/lib/hmac";
import { Reading } from "../src/lib/payload";

const NOW_S = 1795400000;
const reading = (ts: number, extra: Partial<Reading> = {}): Reading => ({
  ts, n: 60, pm1_cf1: 9, pm25_cf1: 14, pm10_cf1: 20, pm1_atm: 6.04, pm25_atm: 9.456, pm10_atm: 12, counts: [1, 1, 1, 1, 1, 1],
  pm25_cf1_min: 10, pm25_cf1_max: 18, ...extra,
});

describe("Sensor.Community payload (unit)", () => {
  it("matches the push API: headers, string values, P0/P1/P2 from the ATM fields, no timestamp, no location", () => {
    const t = taskFor("esp8266-11001626", "0.6.0", [reading(NOW_S - 30)], NOW_S)!;
    const r = scRequest(t);
    assert.equal(r.url, "https://api.sensor.community/v1/push-sensor-data/");
    assert.equal(r.url, SC_URL);
    assert.equal(r.headers["X-Sensor"], "esp8266-11001626");
    assert.equal(r.headers["X-Pin"], "1");
    assert.equal(r.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(r.body), {
      software_version: "ProseFire-0.6.0",
      sensordatavalues: [{ value_type: "P0", value: "6.04" }, { value_type: "P1", value: "12.00" }, { value_type: "P2", value: "9.46" }],
    });
    assert.equal(/timestamp|"ts"|lat|lng|address|zip/i.test(r.body), false);
  });
  it("sends only the newest fresh reading (Sensor.Community stamps arrival time)", () => {
    assert.equal(taskFor("esp8266-1", "x", [reading(NOW_S - 400)], NOW_S), null); // 6.7 min old
    assert.equal(taskFor("esp8266-1", "x", [], NOW_S), null);
    assert.equal(taskFor("esp8266-1", "x", [reading(NOW_S - 10, { n: 0 })], NOW_S), null);
    assert.equal(taskFor("esp8266-1", "x", [reading(NOW_S - 900), reading(NOW_S - 20, { pm25_atm: 33 })], NOW_S)!.pm25, 33);
  });
  it("retries only on 5xx/429; network errors/timeouts aren't retried (no duplicates); late retries are dropped", async () => {
    const t: ScTask = { deviceId: "esp8266-1", fw: "x", pm1: 1, pm25: 2, pm10: 3, ts: NOW_S };
    assert.equal(await forwardOne(t, async () => ({ status: 201 }), NOW_S), "sent");
    await assert.rejects(forwardOne(t, async () => ({ status: 503 }), NOW_S), RetryableError);
    await assert.rejects(forwardOne(t, async () => ({ status: 429 }), NOW_S), RetryableError);
    assert.equal(await forwardOne(t, async () => { throw new Error("ECONNRESET"); }, NOW_S), "lost");
    assert.equal(await forwardOne(t, async () => ({ status: 403 }), NOW_S), "rejected");
    assert.equal(await forwardOne(t, async () => ({ status: 201 }), NOW_S + 301), "stale"); // > 5 min: would be mis-timed
  });
});

describe("forwarding gate in ingest (emulator)", () => {
  let db: Firestore;
  before(() => {
    if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? "demo-prosefire" });
    db = getFirestore();
  });

  async function upload(id: string, secret: string, enroll: boolean, deps: Parameters<typeof handleIngest>[3]) {
    const body = Buffer.from(JSON.stringify({ fw: "0.6.0", uptime_s: 5, rssi: -50, readings: [reading(NOW_S - 30)] }));
    const ts = String(NOW_S);
    const headers: Record<string, string> = { "x-device-id": id, "x-timestamp": ts, "x-signature": sign(secret, ts, body) };
    if (enroll) headers["x-enroll-secret"] = secret;
    return handleIngest(db, { method: "POST", headers, rawBody: body }, NOW_S * 1000, deps);
  }

  it("enqueues only when the flag is on AND the sensor is registered at Sensor.Community", async () => {
    const tasks: ScTask[] = [];
    const enqueueSc = async (t: ScTask) => void tasks.push(t);
    const a = `esp8266-${880000 + Math.floor(Math.random() * 9999)}`;
    const b = `esp8266-${890000 + Math.floor(Math.random() * 9999)}`;
    await db.doc(`devices/${a}`).set({ status: "allowlisted" });
    await db.doc(`devices/${b}`).set({ status: "allowlisted", scRegistered: true });
    const sa = randomBytes(32).toString("hex"), sb = randomBytes(32).toString("hex");
    clearRegistryCache();
    assert.equal((await upload(b, sb, true, { scEnabled: false, enqueueSc })).status, 200); // flag OFF (default)
    assert.equal(tasks.length, 0);
    assert.equal((await upload(a, sa, true, { scEnabled: true, enqueueSc })).status, 200); // not registered
    assert.equal(tasks.length, 0);
    clearRegistryCache();
    const r = await upload(b, sb, false, { scEnabled: true, enqueueSc });
    assert.equal(r.status, 200);
    assert.equal(r.body.duplicates, 1); // same reading again -> not accepted -> not forwarded twice
    assert.equal(tasks.length, 0);
  });

  it("forwards a newly accepted fresh reading, and a failing queue never fails the upload", async () => {
    const id = `esp8266-${900000 + Math.floor(Math.random() * 9999)}`;
    await db.doc(`devices/${id}`).set({ status: "allowlisted", scRegistered: true });
    const secret = randomBytes(32).toString("hex");
    const tasks: ScTask[] = [];
    clearRegistryCache();
    const ok = await upload(id, secret, true, { scEnabled: true, enqueueSc: async (t) => void tasks.push(t) });
    assert.equal(ok.status, 200);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].deviceId, id);
    assert.equal(tasks[0].pm25, 9.456);
    const id2 = `esp8266-${910000 + Math.floor(Math.random() * 9999)}`;
    await db.doc(`devices/${id2}`).set({ status: "allowlisted", scRegistered: true });
    const s2 = randomBytes(32).toString("hex");
    const r = await upload(id2, s2, true, { scEnabled: true, enqueueSc: async () => { throw new Error("queue down"); } });
    assert.equal(r.status, 200);
  });

  it("a hanging queue call can't hold the upload (2 s limit)", async () => {
    const id = `esp8266-${920000 + Math.floor(Math.random() * 9999)}`;
    await db.doc(`devices/${id}`).set({ status: "allowlisted", scRegistered: true });
    clearRegistryCache();
    const started = Date.now();
    const r = await upload(id, randomBytes(32).toString("hex"), true, { scEnabled: true, enqueueSc: () => new Promise<void>(() => undefined) });
    assert.equal(r.status, 200);
    assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
  });
});
