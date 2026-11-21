// End-to-end through the functions emulator: wiring, raw body, and headers.
import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { sign } from "../src/lib/hmac";

const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-prosefire";
const URL = `http://127.0.0.1:5001/${PROJECT}/us-east1/ingest`;

describe("ingest over HTTP (functions emulator)", () => {
  before(() => {
    if (!getApps().length) initializeApp({ projectId: PROJECT });
  });

  it("accepts a correctly signed enrollment upload", async () => {
    const id = `esp8266-${Date.now() % 1e9}`;
    await getFirestore().doc(`devices/${id}`).set({ status: "allowlisted" });
    const secret = randomBytes(32).toString("hex");
    const now = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      fw: "0.3.0", uptime_s: 10, rssi: -55,
      readings: [{ ts: now - 5, n: 60, pm1_cf1: 1, pm25_cf1: 2, pm10_cf1: 3, pm1_atm: 1, pm25_atm: 2, pm10_atm: 3,
                   counts: [1, 1, 1, 1, 1, 1], pm25_cf1_min: 1, pm25_cf1_max: 3 }],
    });
    const ts = String(now);
    const r = await fetch(URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-id": id, "x-timestamp": ts,
                 "x-signature": sign(secret, ts, body), "x-enroll-secret": secret },
      body,
    });
    assert.equal(r.status, 200, await r.clone().text());
    assert.equal(((await r.json()) as { accepted: number }).accepted, 1);
  });
});
