// Claim flow against the Firestore emulator: device uploads sha256(t) -> browser claims with t.
import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";

import { CLAIM, handleClaim } from "../src/claim";
import { clearRegistryCache, handleIngest } from "../src/ingest";
import { Geocoder } from "../src/lib/geocode";
import { sha256Hex, sign } from "../src/lib/hmac";

const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-prosefire";
const NOW = Date.UTC(2026, 10, 21, 16, 10, 0);
const NOW_S = Math.floor(NOW / 1000);
let db: Firestore;
let n = 0;

const match: Geocoder = async () => ({ kind: "match", point: { lat: 40.8075, lng: -73.9626, matchedAddress: "MATCHED" } });
const noMatch: Geocoder = async () => ({ kind: "no_match" });
const down: Geocoder = async () => ({ kind: "unavailable" });

async function uploadedDevice(withClaim = true): Promise<{ id: string; token: string }> {
  const id = `esp8266-${7000000 + ++n}${Math.floor(Math.random() * 1000)}`;
  await db.doc(`devices/${id}`).set({ status: "allowlisted" });
  const secret = randomBytes(32).toString("hex");
  const token = randomBytes(16).toString("hex");
  const body = JSON.stringify({
    fw: "0.4.0", uptime_s: 50, rssi: -40,
    readings: [{ ts: NOW_S - 5, n: 12, pm1_cf1: 3, pm25_cf1: 7.5, pm10_cf1: 9, pm1_atm: 3, pm25_atm: 7.5, pm10_atm: 9,
                 counts: [900, 300, 50, 5, 1, 0], pm25_cf1_min: 6, pm25_cf1_max: 9 }],
    ...(withClaim ? { claim_token_hash: sha256Hex(token) } : {}),
  });
  const ts = String(NOW_S);
  const r = await handleIngest(db, { method: "POST", rawBody: Buffer.from(body), headers: {
    "x-device-id": id, "x-timestamp": ts, "x-signature": sign(secret, ts, Buffer.from(body)), "x-enroll-secret": secret,
  } }, NOW);
  assert.equal(r.status, 200);
  return { id, token };
}

const claimBody = (d: string, t: string, extra: Record<string, unknown> = {}) =>
  Buffer.from(JSON.stringify({ d, t, address: "123 Example St, Apt 4", zip: "10027", indoor: false, ...extra }));

describe("claim (emulator)", () => {
  before(() => {
    if (!getApps().length) initializeApp({ projectId: PROJECT });
    db = getFirestore();
  });
  beforeEach(() => clearRegistryCache());

  it("claims with the right token, geocodes privately, returns the first reading", async () => {
    const { id, token } = await uploadedDevice();
    const r = await handleClaim(db, "POST", claimBody(id, token), NOW + 30e3, match);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.located, true);
    assert.equal((r.body.latest as { pm25_cf1: number }).pm25_cf1, 7.5);
    const loc = (await db.doc(`private_locations/${id}`).get()).data()!;
    assert.equal(loc.lat, 40.8075);
    assert.equal(loc.address, "123 Example St, Apt 4");
    const dev = (await db.doc(`devices/${id}`).get()).data()!;
    assert.equal(dev.claimTokenHash, undefined);
    assert.equal(dev.indoor, false);
    assert.equal(dev.publicCellPending, true);
  });

  it("privacy: the response and device doc never contain the address or coordinates", async () => {
    const { id, token } = await uploadedDevice();
    const r = await handleClaim(db, "POST", claimBody(id, token), NOW + 30e3, match);
    const s = JSON.stringify(r.body) + JSON.stringify((await db.doc(`devices/${id}`).get()).data());
    assert.equal(/Example|10027|40\.8|73\.9|MATCHED|"(address|matchedAddress|lat|lng|zip)"/i.test(s), false, s);
  });

  it("is single-use: a second claim with the same link fails", async () => {
    const { id, token } = await uploadedDevice();
    assert.equal((await handleClaim(db, "POST", claimBody(id, token), NOW + 30e3, match)).status, 200);
    const again = await handleClaim(db, "POST", claimBody(id, token, { address: "1 Other St" }), NOW + 60e3, match);
    assert.equal(again.status, 409);
    assert.equal((await db.doc(`private_locations/${id}`).get()).get("address"), "123 Example St, Apt 4");
  });

  it("says not_yet before the sensor has uploaded (the page keeps polling)", async () => {
    const id = `esp8266-${8000000 + ++n}`;
    await db.doc(`devices/${id}`).set({ status: "allowlisted" });
    const r = await handleClaim(db, "POST", claimBody(id, randomBytes(16).toString("hex")), NOW, match);
    assert.equal(r.status, 409);
    assert.equal(r.body.error, "not_yet");
    const { id: id2 } = await uploadedDevice(false); // enrolled but no claim hash yet
    assert.equal((await handleClaim(db, "POST", claimBody(id2, randomBytes(16).toString("hex")), NOW, match)).body.error, "not_yet");
  });

  it("rejects a wrong token without leaking whether the device exists", async () => {
    const { id } = await uploadedDevice();
    const r = await handleClaim(db, "POST", claimBody(id, randomBytes(16).toString("hex")), NOW + 1e3, match);
    assert.equal(r.status, 409);
    assert.equal((await db.doc(`private_locations/${id}`).get()).exists, false);
  });

  it("expires after 24 h", async () => {
    const { id, token } = await uploadedDevice();
    const r = await handleClaim(db, "POST", claimBody(id, token), NOW + 25 * 3600e3, match);
    assert.equal(r.status, 410);
  });

  it("asks again when the address isn't found; accepts and retries later when the geocoder is down", async () => {
    const a = await uploadedDevice();
    const r = await handleClaim(db, "POST", claimBody(a.id, a.token), NOW + 1e3, noMatch);
    assert.equal(r.status, 422);
    assert.equal(r.body.error, "address_not_found");
    const ok = await handleClaim(db, "POST", claimBody(a.id, a.token), NOW + 2e3, match); // token still valid
    assert.equal(ok.status, 200);
    const b = await uploadedDevice();
    const r2 = await handleClaim(db, "POST", claimBody(b.id, b.token), NOW + 1e3, down);
    assert.equal(r2.status, 200);
    assert.equal(r2.body.located, false);
    assert.equal((await db.doc(`devices/${b.id}`).get()).get("locationPending"), true);
    assert.equal((await db.doc(`private_locations/${b.id}`).get()).get("lat"), undefined);
  });

  it("validates input", async () => {
    const t = randomBytes(16).toString("hex");
    assert.equal((await handleClaim(db, "GET", undefined, NOW, match)).status, 405);
    assert.equal((await handleClaim(db, "POST", Buffer.from("{x"), NOW, match)).status, 400);
    assert.equal((await handleClaim(db, "POST", claimBody("evil", t), NOW, match)).body.error, "bad_link");
    assert.equal((await handleClaim(db, "POST", claimBody("esp8266-1", "zz"), NOW, match)).body.error, "bad_link");
    assert.equal((await handleClaim(db, "POST", claimBody("esp8266-1", t, { zip: "1002" }), NOW, match)).body.error, "bad_zip");
    assert.equal((await handleClaim(db, "POST", claimBody("esp8266-1", t, { address: "" }), NOW, match)).body.error, "bad_address");
    assert.equal((await handleClaim(db, "POST", claimBody("esp8266-1", t, { indoor: "no" }), NOW, match)).body.error, "bad_indoor");
    assert.equal((await handleClaim(db, "POST", Buffer.from("x".repeat(3000)), NOW, match)).status, 413);
  });

  it("rate-limits guessing per device", async () => {
    const { id } = await uploadedDevice();
    let last = 0;
    for (let i = 0; i <= CLAIM.maxAttemptsPerHour; i++) {
      last = (await handleClaim(db, "POST", claimBody(id, randomBytes(16).toString("hex")), NOW + 5e3, match)).status;
    }
    assert.equal(last, 429);
  });
});
