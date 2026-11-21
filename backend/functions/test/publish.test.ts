// Publish job on the Firestore emulator: placement, rollup, NowCast, snapshot privacy.
import { strict as assert } from "node:assert";

import { getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore, Timestamp } from "firebase-admin/firestore";

import { aqiFromPm25 } from "../src/lib/aqi";
import { epaCorrect } from "../src/lib/correction";
import { Geocoder } from "../src/lib/geocode";
import { Fetcher } from "../src/lib/rh";
import { hourKeyUtc, PublishDeps, runPublish } from "../src/publish";

const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-prosefire";
const NOW = Date.UTC(2026, 10, 21, 18, 20, 0);
let db: Firestore;

const nws: Fetcher = async (url) => {
  if (url.includes("/points/")) return { ok: true, json: async () => ({ properties: { observationStations: "https://api.weather.gov/x/stations" } }) };
  if (url.endsWith("/x/stations")) return { ok: true, json: async () => ({ features: [{ properties: { stationIdentifier: "KTEST" } }] }) };
  if (url.includes("/observations/latest")) return { ok: true, json: async () => ({ properties: { relativeHumidity: { value: 60 } } }) };
  return { ok: false, json: async () => ({}) };
};
const geo = (lat: number, lng: number): Geocoder => async (street) =>
  street.includes("Nowhere") ? { kind: "no_match" } : { kind: "match", point: { lat, lng, matchedAddress: "M" } };

async function seed(id: string, opts: { lat?: number; lng?: number; address?: string; indoor?: boolean; claimed?: boolean;
  lastSeenMs?: number; pm25?: number; prevPm25?: number[] }) {
  await db.doc(`devices/${id}`).set({
    status: "active", indoor: !!opts.indoor,
    ...(opts.claimed ? { publicCellPending: true } : { locationPending: true }),
  });
  const loc: Record<string, unknown> = { address: opts.address ?? "12 Test St, Apt 3", zip: "10027" };
  if (opts.lat !== undefined) Object.assign(loc, { lat: opts.lat, lng: opts.lng });
  await db.doc(`private_locations/${id}`).set(loc);
  const seen = opts.lastSeenMs ?? NOW - 60e3;
  if (opts.pm25 !== undefined) {
    await db.doc(`readings_hourly/${id}_${hourKeyUtc(NOW)}`).set({
      deviceId: id, lastSeen: Timestamp.fromMillis(seen), latest: { ts: Math.floor(seen / 1000), pm25: opts.pm25, pm25a: opts.pm25 },
      r: { [String(Math.floor(seen / 1000))]: { pm25: opts.pm25 } },
    });
  }
  if (opts.prevPm25) {
    const r: Record<string, { pm25: number }> = {};
    opts.prevPm25.forEach((v, i) => (r[String(Math.floor((NOW - 3600e3) / 1000) + i * 150)] = { pm25: v }));
    await db.doc(`readings_hourly/${id}_${hourKeyUtc(NOW - 3600e3)}`).set({
      deviceId: id, lastSeen: Timestamp.fromMillis(NOW - 3600e3 + 1000), latest: { ts: 1, pm25: opts.prevPm25[0], pm25a: 0 }, r,
    });
  }
}

describe("publish job (emulator)", () => {
  let deps: PublishDeps;
  before(() => {
    if (!getApps().length) initializeApp({ projectId: PROJECT });
    db = getFirestore();
    deps = { geocode: geo(40.7128, -74.006), nws };
  });

  it("places claimed + phone-setup sensors, corrects values, and publishes a private-safe snapshot", async () => {
    await seed("esp8266-500001", { claimed: true, lat: 40.8075, lng: -73.9626, pm25: 20, prevPm25: [10, 14, 18] });
    await seed("esp8266-500002", { address: "99 Phone Path Ave", pm25: 5 }); // phone path: geocoded by the job
    await seed("esp8266-500003", { claimed: true, lat: 40.75, lng: -73.99, indoor: true, pm25: 8 });
    await seed("esp8266-500004", { claimed: true, lat: 40.70, lng: -73.95, pm25: 30, lastSeenMs: NOW - 2 * 3600e3 });
    await seed("esp8266-500005", { address: "1 Nowhere Rd", pm25: 3 });

    const snap = await runPublish(db, deps, NOW);
    const by = (code: string) => snap.sensors.find((s) => s.code === code) as Record<string, unknown>;
    const a = (await db.doc("public_sensors/esp8266-500001").get()).data()!;
    const s1 = by(a.code);
    assert.equal(s1.on, 1);
    assert.equal(s1.pm, Math.round(epaCorrect(20, 60) * 10) / 10); // RH from the (fake) nearest NWS station
    assert.equal(s1.rh, "nws");
    assert.ok(Array.isArray(s1.c));
    // hourly rollup of the previous hour (mean of 10, 14, 18 = 14, corrected at RH 60)
    assert.equal((a.hourly as { pm: number }[])[0].pm, Math.round(epaCorrect(14, 60) * 10) / 10);
    assert.equal(s1.aqi, aqiFromPm25(s1.nc as number));
    assert.equal((await db.doc("devices/esp8266-500001").get()).get("publicCellPending"), false);

    // phone-path sensor geocoded by the job and placed
    const b = (await db.doc("public_sensors/esp8266-500002").get()).data()!;
    assert.ok(b.cell);
    assert.equal((await db.doc("private_locations/esp8266-500002").get()).get("lat"), 40.7128);
    // indoor: in the snapshot by code, but with no location
    const c = (await db.doc("public_sensors/esp8266-500003").get()).data()!;
    assert.equal(by(c.code).c, null);
    assert.equal(by(c.code).in, 1);
    // offline: no current value / AQI
    const d = (await db.doc("public_sensors/esp8266-500004").get()).data()!;
    assert.equal(by(d.code).on, 0);
    assert.equal(by(d.code).aqi, null);
    // address not found: not placed, flagged for the owner page
    assert.equal((await db.doc("public_sensors/esp8266-500005").get()).exists, false);
    assert.equal((await db.doc("devices/esp8266-500005").get()).get("locationNotFound"), true);

    // PRIVACY: the stored snapshot has no address text and no exact coordinates
    const json = String((await db.doc("public/snapshot").get()).get("json"));
    for (const bad of ["Test St", "Phone Path", "Nowhere", "10027", "40.8075", "-73.9626", "40.7128", "-74.006", "\"lat\"", "\"lng\"", "address"]) {
      assert.equal(json.includes(bad), false, `${bad} leaked into the snapshot`);
    }
    // centers are H3 cell centers, not the inputs
    assert.notDeepEqual(s1.c, [40.8075, -73.9626]);
  });

  it("is idempotent within an hour (no double rollup) and caches the NWS station per cell", async () => {
    let calls = 0;
    const counting: Fetcher = async (u) => { if (u.includes("/points/")) calls++; return nws(u); };
    await runPublish(db, { geocode: deps.geocode, nws: counting }, NOW + 60e3);
    const a = (await db.doc("public_sensors/esp8266-500001").get()).data()!;
    assert.equal((a.hourly as unknown[]).filter((p) => (p as { h: string }).h === hourKeyUtc(NOW - 3600e3)).length, 1);
    assert.equal(calls, 0); // no new placements -> no station lookups
  });

  it("falls back to 50 % RH when NWS is down and there's no recent cached value", async () => {
    const down: Fetcher = async () => ({ ok: false, json: async () => ({}) });
    await db.doc("rh_cache/KTEST").set({ rh: 60, at: Timestamp.fromMillis(NOW - 4 * 3600e3) });
    const snap = await runPublish(db, { geocode: deps.geocode, nws: down }, NOW + 120e3);
    const a = (await db.doc("public_sensors/esp8266-500001").get()).data()!;
    const s1 = snap.sensors.find((s) => s.code === a.code) as Record<string, unknown>;
    assert.equal(s1.rh, "default");
    assert.equal(s1.pm, Math.round(epaCorrect(20, 50) * 10) / 10);
  });
});
