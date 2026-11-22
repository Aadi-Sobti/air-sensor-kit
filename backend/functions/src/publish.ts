// Every 5 min: (A) place newly set-up sensors (geocode if needed -> public H3 cell), (B) hourly rollups
// (corrected hourly means + NowCast), (C) the public snapshot the map reads. Spec: backend.md "Corrections and
// AQI", "Scheduled snapshot", privacy tests. Exact addresses/coordinates stay in private_locations.
// Robustness: each step has a time budget and per-sensor error handling, so the snapshot is always written.
import { gzipSync } from "node:zlib";

import { DocumentSnapshot, FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";

import { aqiFromPm25, category, nowcast } from "./lib/aqi";
import { publicCell } from "./lib/cells";
import { CORRECTION_VERSION, DEFAULT_RH, epaCorrect } from "./lib/correction";
import { censusGeocoder, Geocoder } from "./lib/geocode";
import { logEvent, logWarn } from "./lib/redact";
import { Fetcher, httpFetcher, latestRh, nearestStation } from "./lib/rh";
import { shortCodeFor } from "./lib/shortcode";

export const PUBLISH = {
  offlineAfterMs: 30 * 60e3, // no upload for 30 min -> offline
  staleReadingMs: 30 * 60e3, // newest reading older than this -> no current value (e.g. sensor unplugged)
  keepHours: 168, // 7 days for the owner and sensor-page charts (M7b)
  rhMaxAgeMs: 3 * 3600e3,
  locateBudgetMs: 60e3,
  locateMax: 50,
  stationRetriesPerRun: 20,
  minReadingsForHour: 4, // ~10 min of 2.5-min readings before the current hour counts in the NowCast
  rerollAfterMin: 10, // re-roll the previous hour once, to include its late uploads
  maxRollupHours: 12,
  snapshotBudgetBytes: 900 * 1024, // Firestore doc limit is 1 MiB
  readChunk: 200,
};

// Web push sender (decision #14). Returns gone=true when the browser dropped the subscription (404/410).
export type PushSender = (sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<{ gone: boolean }>;

export interface PublishDeps {
  geocode: Geocoder;
  nws: Fetcher;
  push?: PushSender;
}
export const defaultDeps: PublishDeps = { geocode: censusGeocoder, nws: httpFetcher };

// Every alert carries the safety line (project safety rule), even device-status notices.
const OFFLINE_MSG = {
  en: (code: string) => ({ title: "Air sensor offline",
    body: `Your sensor ${code} stopped sending readings. Check its power and WiFi. (This is not a smoke alarm.)` }),
  es: (code: string) => ({ title: "Sensor de aire desconectado",
    body: `Tu sensor ${code} dejó de enviar lecturas. Revisa la corriente y el WiFi. (Esto no es una alarma de humo.)` }),
};

/** Sends the "offline" notice once per online -> offline change, to every subscribed browser of that sensor. */
async function notifyOffline(db: Firestore, push: PushSender, deviceId: string, code: string): Promise<number> {
  let sent = 0;
  const subs = await db.collection(`devices/${deviceId}/push_subs`).get();
  for (const s of subs.docs) {
    const lang = s.get("lang") === "es" ? "es" : "en";
    const msg = { ...OFFLINE_MSG[lang](code), url: "/my" };
    try {
      const r = await push(s.get("sub"), JSON.stringify(msg));
      if (r.gone) await s.ref.delete();
      else sent++;
    } catch {
      /* try again on the next state change */
    }
  }
  return sent;
}

export function hourKeyUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-T:]/g, "").slice(0, 10);
}
function hourStartMs(key: string): number {
  return Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8), +key.slice(8, 10));
}

interface HourPoint { h: string; pm: number | null; rh: number | null; src?: string }
type RhInfo = { rh: number; source: string };

async function getAllChunked(db: Firestore, paths: string[]): Promise<DocumentSnapshot[]> {
  const out: DocumentSnapshot[] = [];
  for (let i = 0; i < paths.length; i += PUBLISH.readChunk) {
    const refs = paths.slice(i, i + PUBLISH.readChunk).map((p) => db.doc(p));
    if (refs.length) out.push(...(await db.getAll(...refs)));
  }
  return out;
}

async function stationFor(db: Firestore, deps: PublishDeps, cell: string, center: [number, number], nowMs: number) {
  const stRef = db.doc(`rh_stations/${cell}`);
  const cached = (await stRef.get()).get("station") as string | undefined;
  if (cached) return cached;
  const st = await nearestStation(center[0], center[1], deps.nws); // public cell center only, never the address
  if (st) await stRef.set({ station: st, at: Timestamp.fromMillis(nowMs) });
  return st;
}

/** (A) Turn private locations into public cells. Time-boxed; stops geocoding when Census is down. */
async function locate(db: Firestore, deps: PublishDeps, nowMs: number): Promise<number> {
  const started = Date.now();
  const ids = new Set<string>();
  for (const f of ["locationPending", "publicCellPending"]) {
    (await db.collection("devices").where(f, "==", true).limit(PUBLISH.locateMax).get()).forEach((d) => ids.add(d.id));
  }
  let placed = 0;
  let geocoderDown = false;
  for (const id of ids) {
    if (Date.now() - started > PUBLISH.locateBudgetMs) break;
    try {
      const devRef = db.doc(`devices/${id}`);
      const dev = await devRef.get();
      const pubRef = db.doc(`public_sensors/${id}`);
      const base = { code: shortCodeFor(id, dev.get("shortCode") as string | undefined), indoor: Boolean(dev.get("indoor")),
        notifyOffline: dev.get("notifyOffline") === true };
      const locRef = db.doc(`private_locations/${id}`);
      const loc = await locRef.get();
      if (!loc.exists) continue;
      let lat = loc.get("lat") as number | undefined;
      let lng = loc.get("lng") as number | undefined;
      if (typeof lat !== "number" || typeof lng !== "number") {
        // Until placed, the sensor is public by code only (no location), so its page works right away.
        await pubRef.set({ ...base, cell: null, center: null, placement: "pending" }, { merge: true });
        if (geocoderDown) continue;
        const g = await deps.geocode(String(loc.get("address") ?? ""), String(loc.get("zip") ?? ""));
        if (g.kind === "unavailable") {
          geocoderDown = true; // don't spend the run waiting on it; retry next run
          continue;
        }
        if (g.kind === "no_match") {
          // Stop retrying (both flags), and hide any old placement: the sensor may have moved.
          await devRef.set({ locationPending: false, publicCellPending: false, locationNotFound: true }, { merge: true });
          await pubRef.set({ ...base, cell: null, center: null, placement: "not_found" }, { merge: true });
          continue;
        }
        lat = g.point.lat;
        lng = g.point.lng;
        await locRef.set({ lat, lng, matchedAddress: g.point.matchedAddress, geocoder: "census" }, { merge: true });
      }
      const { cell, center } = publicCell(lat, lng);
      const station = await stationFor(db, deps, cell, center, nowMs);
      await pubRef.set({ ...base, cell, center, station: station ?? null, placement: "placed", placedAt: Timestamp.fromMillis(nowMs) }, { merge: true });
      await devRef.set({ locationPending: false, publicCellPending: false, locationNotFound: FieldValue.delete() }, { merge: true });
      placed++;
    } catch (e) {
      logWarn("publish_locate_error", { device: id, error: String((e as Error)?.message ?? e).slice(0, 120) });
    }
  }
  return placed;
}

/** Current RH per station (fetched once per run), with a cached fallback (≤ 3 h), then 50 %. */
async function rhFor(db: Firestore, deps: PublishDeps, stations: Set<string>, nowMs: number) {
  const out = new Map<string, RhInfo>();
  for (const st of stations) {
    try {
      const ref = db.doc(`rh_cache/${st}`);
      const live = await latestRh(st, deps.nws);
      if (live !== null) {
        out.set(st, { rh: live, source: `nws:${st}` });
        await ref.set({ rh: live, at: Timestamp.fromMillis(nowMs) });
        continue;
      }
      const c = await ref.get();
      const at = (c.get("at") as Timestamp | undefined)?.toMillis() ?? 0;
      if (c.exists && nowMs - at < PUBLISH.rhMaxAgeMs) out.set(st, { rh: Number(c.get("rh")), source: `nws:${st}:cached` });
    } catch {
      /* default below */
    }
  }
  return out;
}

export function hourlyMean(r: Record<string, { pm25?: number }> | undefined, minReadings = 1): number | null {
  const vals = Object.values(r ?? {}).filter((x) => typeof x?.pm25 === "number");
  if (vals.length < minReadings) return null;
  return vals.reduce((a, x) => a + (x.pm25 as number), 0) / vals.length;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Hours to (re)roll for a sensor: every missed finished hour (≤ 12), plus one late re-roll of the previous hour. */
function hoursToRoll(rolledThrough: string | undefined, rerolled: string | undefined, nowMs: number): string[] {
  const prevKey = hourKeyUtc(nowMs - 3600e3);
  const keys: string[] = [];
  if (rolledThrough !== prevKey) {
    const from = rolledThrough ? hourStartMs(rolledThrough) + 3600e3 : hourStartMs(prevKey);
    for (let t = Math.max(from, hourStartMs(prevKey) - (PUBLISH.maxRollupHours - 1) * 3600e3); t <= hourStartMs(prevKey); t += 3600e3) {
      keys.push(hourKeyUtc(t));
    }
  } else if (rerolled !== prevKey && new Date(nowMs).getUTCMinutes() >= PUBLISH.rerollAfterMin) {
    keys.push(prevKey);
  }
  return keys;
}

export async function runPublish(db: Firestore, deps: PublishDeps = defaultDeps, nowMs = Date.now()) {
  let placed = 0;
  try {
    placed = await locate(db, deps, nowMs);
  } catch (e) {
    logWarn("publish_locate_failed", { error: String((e as Error)?.message ?? e).slice(0, 120) });
  }

  const sensors = (await db.collection("public_sensors").get()).docs;
  // Retry missing NWS stations (limited per run), from the public cell center.
  let retries = 0;
  for (const s of sensors) {
    if (retries >= PUBLISH.stationRetriesPerRun) break;
    if (!s.get("station") && s.get("cell") && s.get("center")) {
      retries++;
      try {
        const st = await stationFor(db, deps, s.get("cell"), s.get("center"), nowMs);
        if (st) await s.ref.set({ station: st }, { merge: true });
      } catch { /* next run */ }
    }
  }
  const fresh = retries ? (await db.collection("public_sensors").get()).docs : sensors;
  const stations = new Set<string>();
  fresh.forEach((s) => { const st = s.get("station"); if (st) stations.add(st); });
  const rh = await rhFor(db, deps, stations, nowMs);
  const rhOf = (st: string | null | undefined): RhInfo => (st && rh.get(st)) || { rh: DEFAULT_RH, source: "default" };

  const curKey = hourKeyUtc(nowMs);
  const curDocs = await getAllChunked(db, fresh.map((s) => `readings_hourly/${s.id}_${curKey}`));
  const entries: Record<string, unknown>[] = [];
  const toNotify: { id: string; code: string }[] = [];
  let errors = 0;
  for (let i = 0; i < fresh.length; i++) {
    const s = fresh[i];
    try {
      const st = s.get("station") as string | null;
      const r = rhOf(st);
      const update: Record<string, unknown> = {};

      // (B) hourly rollups
      let hourly = (s.get("hourly") as HourPoint[] | undefined) ?? [];
      const roll = hoursToRoll(s.get("rolledUpThrough"), s.get("rerolled"), nowMs);
      if (roll.length) {
        const docs = await getAllChunked(db, roll.map((k) => `readings_hourly/${s.id}_${k}`));
        roll.forEach((k, j) => {
          const mean = docs[j].exists ? hourlyMean(docs[j].get("r")) : null;
          const p: HourPoint = { h: k, pm: mean === null ? null : round1(epaCorrect(mean, r.rh)), rh: r.rh, src: r.source };
          hourly = [p, ...hourly.filter((x) => x.h !== k)];
          const lt = docs[j].exists ? docs[j].get("latest") : null;
          if (lt) update.lastLatest = { ...lt, lastSeen: docs[j].get("lastSeen") ?? null };
        });
        hourly.sort((a, b) => (a.h < b.h ? 1 : -1));
        hourly = hourly.slice(0, PUBLISH.keepHours);
        update.hourly = hourly;
        const prevKey = hourKeyUtc(nowMs - 3600e3);
        update.rolledUpThrough = prevKey;
        if (roll.includes(prevKey) && s.get("rolledUpThrough") === prevKey) update.rerolled = prevKey;
        update.rhSource = r.source;
      }

      // (C) current value: uploads (lastSeen) say whether it's online; the newest READING's own time says
      // whether there is a current value (health-only uploads keep it online but don't refresh readings).
      const cur = curDocs[i];
      const latest = ((cur.exists ? cur.get("latest") : null) ?? (update.lastLatest as Record<string, unknown> | undefined) ??
        s.get("lastLatest")) as { ts?: number; pm25?: number; lastSeen?: Timestamp } | null;
      const lastSeenTs = (cur.exists ? cur.get("lastSeen") : null) ?? latest?.lastSeen ?? null;
      const lastSeen = lastSeenTs ? (lastSeenTs as Timestamp).toMillis() : 0;
      const online = lastSeen > 0 && nowMs - lastSeen < PUBLISH.offlineAfterMs;
      const readingMs = typeof latest?.ts === "number" ? latest.ts * 1000 : 0;
      const freshReading = online && readingMs > 0 && nowMs - readingMs < PUBLISH.staleReadingMs;
      const nowPm = freshReading && typeof latest?.pm25 === "number" ? round1(epaCorrect(latest.pm25, r.rh)) : null;

      // NowCast on HOURLY means: the current hour counts only with enough readings; finished hours from rollups.
      const curMean = cur.exists ? hourlyMean(cur.get("r"), PUBLISH.minReadingsForHour) : null;
      const byHour = new Map(hourly.map((p) => [p.h, p.pm]));
      const series: (number | null)[] = [curMean === null ? null : round1(epaCorrect(curMean, r.rh))];
      for (let k = 1; k < 12; k++) series.push(byHour.get(hourKeyUtc(nowMs - k * 3600e3)) ?? null);
      const nc = freshReading ? nowcast(series) : null;
      const aqi = nc !== null ? aqiFromPm25(nc) : nowPm !== null ? aqiFromPm25(nowPm) : null;
      // Offline notices (web push): only on a change from online to offline, once; sent after the snapshot.
      if (s.get("notifyOffline") && deps.push) {
        const wasOnline = s.get("lastOnline");
        if (wasOnline === true && !online) toNotify.push({ id: s.id, code: String(s.get("code")) });
        if (wasOnline !== online) update.lastOnline = online;
      }
      if (Object.keys(update).length) await s.ref.set({ ...update, correctionVersion: CORRECTION_VERSION }, { merge: true });

      const indoor = Boolean(s.get("indoor"));
      const center = s.get("center") as [number, number] | null;
      entries.push({
        code: s.get("code"),
        c: indoor || !center ? null : center, // indoor / not placed yet: public by code only, no location
        in: indoor ? 1 : 0,
        pl: s.get("placement") === "placed" ? 1 : 0,
        pm: nowPm,
        nc,
        aqi,
        cat: aqi !== null ? category(aqi).key : null,
        upd: readingMs ? Math.floor(readingMs / 1000) : null, // time of the newest reading
        seen: lastSeen ? Math.floor(lastSeen / 1000) : null, // time of the newest upload
        on: online ? 1 : 0,
        rh: r.source === "default" ? "default" : "nws",
      });
    } catch (e) {
      errors++;
      logWarn("publish_sensor_error", { device: s.id, error: String((e as Error)?.message ?? e).slice(0, 120) });
    }
  }
  const snapshot = { v: 2, generated: Math.floor(nowMs / 1000), correction: CORRECTION_VERSION, sensors: entries };
  const json = JSON.stringify(snapshot);
  // Stored gzip-compressed: Firestore documents are limited to 1 MiB; ~10K sensors ≈ 1.7 MB of JSON but ~0.2 MB
  // compressed. If it ever gets close, split the snapshot (e.g. by area).
  const gz = gzipSync(Buffer.from(json, "utf8"));
  if (gz.length > PUBLISH.snapshotBudgetBytes) {
    logWarn("publish_snapshot_too_big", { bytes: json.length, gzBytes: gz.length, sensors: entries.length });
  } else {
    await db.doc("public/snapshot").set({ gz, bytes: json.length, generatedAt: Timestamp.fromMillis(nowMs) });
  }
  // Notices last, so a slow push service can never hold up the map (each send also has a 5 s timeout).
  let notified = 0;
  for (const n of toNotify) {
    try {
      notified += await notifyOffline(db, deps.push!, n.id, n.code);
    } catch { /* next change */ }
  }
  logEvent("publish_ok", { placed, sensors: entries.length, stations: stations.size, errors, bytes: json.length, gzBytes: gz.length, notified });
  return snapshot;
}
