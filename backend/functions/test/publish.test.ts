// Publish job on the Firestore emulator: placement, rollup, NowCast, snapshot privacy.
import { strict as assert } from "node:assert";

import { getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore, Timestamp } from "firebase-admin/firestore";

import { aqiFromPm25, nowcast } from "../src/lib/aqi";
import { epaCorrect } from "../src/lib/correction";
import { Geocoder } from "../src/lib/geocode";
import { Fetcher } from "../src/lib/rh";
import { fallbackShortCode } from "../src/lib/shortcode";
import { archiveDay, archivePath, runArchive } from "../src/archive";
import { hourKeyUtc, PUBLISH, PublishDeps, runPublish } from "../src/publish";
import { gunzipSync, gzipSync } from "node:zlib";

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
    // Only 1 reading in the current hour (< 4) and 1 finished hour -> no NowCast yet; AQI from the current value.
    assert.equal(s1.nc, null);
    assert.equal(s1.aqi, aqiFromPm25(s1.pm as number));
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
    // address not found: public by code only (no location), flagged for the owner page
    const e = (await db.doc("public_sensors/esp8266-500005").get()).data()!;
    assert.equal(e.center, null);
    assert.equal(e.placement, "not_found");
    assert.equal(by(e.code).c, null);
    assert.equal((await db.doc("devices/esp8266-500005").get()).get("locationNotFound"), true);
    // no 24-hour history in the snapshot (keeps it small; charts come per sensor in M7b)
    assert.equal("h" in s1, false);

    // PRIVACY: the stored snapshot has no address text and no exact coordinates
    const json = gunzipSync((await db.doc("public/snapshot").get()).get("gz")).toString();
    for (const bad of ["Test St", "Phone Path", "Nowhere", "10027", "40.8075", "-73.9626", "40.7128", "-74.006", "\"lat\"", "\"lng\"", "address"]) {
      assert.equal(json.includes(bad), false, `${bad} leaked into the snapshot`);
    }
    // centers are H3 cell centers, not the inputs
    assert.notDeepEqual(s1.c, [40.8075, -73.9626]);
    // public_sensors docs are public-facing data too: no address or exact coordinates
    for (const doc of (await db.collection("public_sensors").get()).docs) {
      const t = JSON.stringify(doc.data());
      assert.equal(/"(lat|lng|address|zip|matchedAddress)"|Test St|Phone Path|40\.8075|40\.7128/.test(t), false, t);
    }
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

describe("publish robustness and freshness (emulator)", () => {
  before(() => {
    if (!getApps().length) initializeApp({ projectId: PROJECT });
    db = getFirestore();
  });

  it("claimed sensor whose new address isn't found stops retrying and hides its old placement", async () => {
    await seed("esp8266-510001", { claimed: true, lat: 40.73, lng: -73.99, pm25: 7 });
    await runPublish(db, { geocode: geo(0, 0), nws }, NOW);
    assert.ok((await db.doc("public_sensors/esp8266-510001").get()).get("center"));
    // moved: new address that doesn't geocode (claim sets both flags, private location has no lat/lng)
    await db.doc("private_locations/esp8266-510001").set({ address: "1 Nowhere Rd", zip: "10001" });
    await db.doc("devices/esp8266-510001").set({ locationPending: true, publicCellPending: true }, { merge: true });
    let calls = 0;
    const counting = async (street: string, zip: string) => { calls++; return geo(0, 0)(street, zip); };
    await runPublish(db, { geocode: counting, nws }, NOW + 300e3);
    await runPublish(db, { geocode: counting, nws }, NOW + 600e3);
    assert.equal(calls, 1); // no retry loop
    const p = (await db.doc("public_sensors/esp8266-510001").get()).data()!;
    assert.equal(p.center, null);
    assert.equal(p.placement, "not_found");
  });

  it("a hanging or failing geocoder can't stop the snapshot", async () => {
    await seed("esp8266-520001", { address: "5 Slow St", pm25: 4 });
    await seed("esp8266-520002", { address: "6 Slow St", pm25: 4 });
    let calls = 0;
    const down = async () => { calls++; return { kind: "unavailable" as const }; };
    const snap = await runPublish(db, { geocode: down, nws }, NOW + 900e3);
    assert.equal(calls, 1); // stops geocoding for the rest of the run after the first outage
    assert.ok(snap.sensors.length > 0);
    const thrower = async () => { throw new Error("boom"); };
    const snap2 = await runPublish(db, { geocode: thrower as never, nws }, NOW + 1200e3);
    assert.ok(snap2.generated > 0);
    // unplaced sensors are public by code only, right away (their page works before they're on the map)
    const u = (await db.doc("public_sensors/esp8266-520001").get()).data()!;
    assert.equal(u.center, null);
    assert.equal(u.placement, "pending");
  });

  it("uploading but no fresh reading (health-only uploads) -> online, no current value or AQI", async () => {
    const id = "esp8266-530001";
    await seed(id, { claimed: true, lat: 40.69, lng: -73.98, pm25: 12 });
    await runPublish(db, { geocode: geo(0, 0), nws }, NOW);
    // 40 min later: uploads still arrive (lastSeen fresh) but the newest reading is 40 min old
    const later = NOW + 40 * 60e3;
    await db.doc(`readings_hourly/${id}_${hourKeyUtc(later)}`).set({
      deviceId: id, lastSeen: Timestamp.fromMillis(later - 30e3),
      latest: { ts: Math.floor((NOW - 60e3) / 1000), pm25: 12, pm25a: 12 }, r: {},
    });
    const snap = await runPublish(db, { geocode: geo(0, 0), nws }, later);
    const code = (await db.doc(`public_sensors/${id}`).get()).get("code");
    const s = snap.sensors.find((x) => x.code === code) as Record<string, unknown>;
    assert.equal(s.on, 1);
    assert.equal(s.pm, null);
    assert.equal(s.aqi, null);
  });

  it("NowCast uses hourly means: one spike reading can't dominate it", async () => {
    const id = "esp8266-540001";
    await seed(id, { claimed: true, lat: 40.66, lng: -73.96 });
    const pub = db.doc(`public_sensors/${id}`);
    await runPublish(db, { geocode: geo(0, 0), nws }, NOW);
    // 11 finished hours at ~10 (corrected), and a current hour with 6 readings incl. one 300 spike
    const hourly = Array.from({ length: 11 }, (_, k) => ({ h: hourKeyUtc(NOW - (k + 1) * 3600e3), pm: 10, rh: 60 }));
    await pub.set({ hourly, rolledUpThrough: hourKeyUtc(NOW - 3600e3), rerolled: hourKeyUtc(NOW - 3600e3) }, { merge: true });
    const r: Record<string, { pm25: number }> = {};
    [10, 10, 10, 10, 10, 300].forEach((v, k) => (r[String(Math.floor(NOW / 1000) - 900 + k * 150)] = { pm25: v }));
    await db.doc(`readings_hourly/${id}_${hourKeyUtc(NOW)}`).set({ deviceId: id, lastSeen: Timestamp.fromMillis(NOW - 10e3),
      latest: { ts: Math.floor(NOW / 1000) - 15, pm25: 300, pm25a: 300 }, r });
    const snap = await runPublish(db, { geocode: geo(0, 0), nws }, NOW + 1000);
    const code = (await pub.get()).get("code");
    const e = snap.sensors.find((x) => x.code === code) as Record<string, number>;
    // EPA NowCast on hourly means: current hour = corrected mean of its 6 readings, then 11 hours at 10.
    const curHour = Math.round(epaCorrect((5 * 10 + 300) / 6, 60) * 10) / 10;
    assert.equal(e.nc, nowcast([curHour, ...Array(11).fill(10)]));
    // the old behavior (one 2.5-min reading treated as the whole hour) would have been far higher
    const singleReading = Math.round(epaCorrect(300, 60) * 10) / 10;
    assert.ok(e.nc < nowcast([singleReading, ...Array(11).fill(10)])! / 3, `nowcast ${e.nc}`);
  });

  it("catches up on missed hours (publish didn't run for 3 hours)", async () => {
    const id = "esp8266-550001";
    await seed(id, { claimed: true, lat: 40.62, lng: -74.02 });
    await runPublish(db, { geocode: geo(0, 0), nws }, NOW - 4 * 3600e3);
    for (let k = 1; k <= 3; k++) {
      await db.doc(`readings_hourly/${id}_${hourKeyUtc(NOW - k * 3600e3)}`).set({ deviceId: id, r: { "1": { pm25: 10 * k } } });
    }
    await runPublish(db, { geocode: geo(0, 0), nws }, NOW);
    const hourly = (await db.doc(`public_sensors/${id}`).get()).get("hourly") as { h: string; pm: number }[];
    for (let k = 1; k <= 3; k++) assert.ok(hourly.find((p) => p.h === hourKeyUtc(NOW - k * 3600e3) && p.pm !== null), `hour -${k}`);
  });

  it("snapshot (gzip) stays under the Firestore document limit at 10,000 varied sensors", () => {
    const cats = ["good", "moderate", "usg", "unhealthy", "very_unhealthy", "hazardous"];
    const rnd = (k: number) => Math.abs(Math.sin(k * 12.9898) * 43758.5453) % 1; // deterministic, varied values
    const sensors = Array.from({ length: 10000 }, (_, k) => ({
      code: fallbackShortCode(Math.floor(rnd(k) * 4e9)), c: [40.5 + rnd(k + 1) / 2, -74.2 + rnd(k + 2) / 2].map((v) => Math.round(v * 1e5) / 1e5),
      in: 0, pl: 1, pm: Math.round(rnd(k + 3) * 3000) / 10, nc: Math.round(rnd(k + 4) * 3000) / 10, aqi: Math.floor(rnd(k + 5) * 400),
      cat: cats[k % 6], upd: 1795300000 + Math.floor(rnd(k + 6) * 1800), seen: 1795300000 + Math.floor(rnd(k + 7) * 1800), on: 1, rh: "nws",
    }));
    const json = JSON.stringify({ v: 2, generated: 1795300000, correction: "epa-us-2021+smoke-2022", sensors });
    const gz = gzipSync(Buffer.from(json));
    assert.ok(gz.length < PUBLISH.snapshotBudgetBytes, `${gz.length} gz bytes (json ${json.length})`);
    assert.ok(PUBLISH.snapshotBudgetBytes < 1024 * 1024);
  });
});

describe("nightly raw archive (emulator)", () => {
  before(() => {
    if (!getApps().length) initializeApp({ projectId: PROJECT });
    db = getFirestore();
  });

  it("writes one gzipped NDJSON file per finished UTC day, with every raw reading and no location data", async () => {
    const day = "2026-11-10";
    const h0 = Date.parse(`${day}T05:00:00Z`);
    await db.doc(`readings_hourly/esp8266-600001_2026111005`).set({ deviceId: "esp8266-600001", hour: Timestamp.fromMillis(h0),
      r: { "1794805200": { pm25: 7.5, c: [1, 2, 3, 4, 5, 6] }, "1794805350": { pm25: 8 } } });
    await db.doc(`readings_hourly/esp8266-600002_2026111023`).set({ deviceId: "esp8266-600002", hour: Timestamp.fromMillis(h0 + 18 * 3600e3),
      r: { "1794870000": { pm25: 3 } } });
    await db.doc(`readings_hourly/esp8266-600002_2026111100`).set({ deviceId: "esp8266-600002", hour: Timestamp.fromMillis(Date.parse("2026-11-11T00:00:00Z")),
      r: { "1794873600": { pm25: 99 } } }); // next day: not included
    const files = new Map<string, Buffer>();
    const n = await archiveDay(db, async (p, d) => void files.set(p, d), day);
    assert.equal(n, 3);
    const lines = gunzipSync(files.get(archivePath(day))!).toString().trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => [l.device, l.ts, l.pm25]), [["esp8266-600001", 1794805200, 7.5], ["esp8266-600001", 1794805350, 8], ["esp8266-600002", 1794870000, 3]]);
    assert.equal(archivePath(day), "archive/raw/v1/2026/11/10.ndjson.gz");
  });

  it("catches up on missed days and never skips a day after a failure", async () => {
    await db.doc("public/archive_state").set({ lastDay: "2026-11-07" });
    const saved: string[] = [];
    let fail = true;
    const flaky = async (p: string) => { if (p.includes("/11/09") && fail) throw new Error("bucket down"); saved.push(p); };
    let done = await runArchive(db, flaky, Date.parse("2026-11-12T03:30:00Z"));
    assert.deepEqual(done, ["2026-11-08"]); // stopped at the failing day
    fail = false;
    done = await runArchive(db, flaky, Date.parse("2026-11-12T03:30:00Z"));
    assert.deepEqual(done, ["2026-11-09", "2026-11-10", "2026-11-11"]);
    assert.equal((await db.doc("public/archive_state").get()).get("lastDay"), "2026-11-11");
  });
});
