// Every 5 min: (A) locate newly set-up sensors (geocode if needed -> public H3 cell), (B) hourly rollup
// (corrected hourly means + NowCast), (C) the public snapshot the map reads. Spec: backend.md "Corrections and
// AQI", "Scheduled snapshot", privacy tests. Exact addresses/coordinates stay in private_locations.
import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";

import { aqiFromPm25, category, nowcast } from "./lib/aqi";
import { publicCell } from "./lib/cells";
import { CORRECTION_VERSION, DEFAULT_RH, epaCorrect } from "./lib/correction";
import { censusGeocoder, Geocoder } from "./lib/geocode";
import { logEvent } from "./lib/redact";
import { Fetcher, httpFetcher, latestRh, nearestStation } from "./lib/rh";
import { shortCodeFor } from "./lib/shortcode";

export const PUBLISH = { offlineAfterMs: 30 * 60e3, keepHours: 24, rhMaxAgeMs: 3 * 3600e3 };

export interface PublishDeps {
  geocode: Geocoder;
  nws: Fetcher;
}
export const defaultDeps: PublishDeps = { geocode: censusGeocoder, nws: httpFetcher };

export function hourKeyUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/[-T:]/g, "").slice(0, 10);
}

interface HourPoint { h: string; pm: number | null; rh: number | null }

/** (A) Turn private locations into public cells. Returns how many sensors were placed. */
async function locate(db: Firestore, deps: PublishDeps, nowMs: number): Promise<number> {
  const ids = new Set<string>();
  for (const f of ["locationPending", "publicCellPending"]) {
    (await db.collection("devices").where(f, "==", true).limit(200).get()).forEach((d) => ids.add(d.id));
  }
  let placed = 0;
  for (const id of ids) {
    const locRef = db.doc(`private_locations/${id}`);
    const loc = await locRef.get();
    if (!loc.exists) continue;
    let lat = loc.get("lat") as number | undefined;
    let lng = loc.get("lng") as number | undefined;
    if (typeof lat !== "number" || typeof lng !== "number") {
      const g = await deps.geocode(String(loc.get("address") ?? ""), String(loc.get("zip") ?? ""));
      if (g.kind === "unavailable") continue; // try again next run
      if (g.kind === "no_match") {
        await db.doc(`devices/${id}`).set({ locationPending: false, locationNotFound: true }, { merge: true });
        continue; // owner page (M7b) asks them to fix the address
      }
      lat = g.point.lat;
      lng = g.point.lng;
      await locRef.set({ lat, lng, matchedAddress: g.point.matchedAddress, geocoder: "census" }, { merge: true });
    }
    const { cell, center } = publicCell(lat, lng);
    const dev = await db.doc(`devices/${id}`).get();
    // NWS station from the PUBLIC cell center only (never the address); cached per cell.
    const stRef = db.doc(`rh_stations/${cell}`);
    let station = (await stRef.get()).get("station") as string | undefined;
    if (!station) {
      station = (await nearestStation(center[0], center[1], deps.nws)) ?? undefined;
      if (station) await stRef.set({ station, at: Timestamp.fromMillis(nowMs) });
    }
    await db.doc(`public_sensors/${id}`).set({
      code: shortCodeFor(id, dev.get("shortCode") as string | undefined),
      cell, center, indoor: Boolean(dev.get("indoor")), station: station ?? null,
      placedAt: Timestamp.fromMillis(nowMs),
    }, { merge: true });
    await db.doc(`devices/${id}`).set({ locationPending: false, publicCellPending: false, locationNotFound: FieldValue.delete() }, { merge: true });
    placed++;
  }
  return placed;
}

/** Current RH per station (fetched once per run), with a cached fallback, then 50 %. */
async function rhFor(db: Firestore, deps: PublishDeps, stations: Set<string>, nowMs: number) {
  const out = new Map<string, { rh: number; source: string }>();
  for (const st of stations) {
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
  }
  return out;
}

function hourlyMean(r: Record<string, { pm25?: number; n?: number }> | undefined): number | null {
  const vals = Object.values(r ?? {}).filter((x) => typeof x?.pm25 === "number");
  if (!vals.length) return null;
  return vals.reduce((a, x) => a + (x.pm25 as number), 0) / vals.length;
}

export async function runPublish(db: Firestore, deps: PublishDeps = defaultDeps, nowMs = Date.now()) {
  const placed = await locate(db, deps, nowMs);

  const sensors = await db.collection("public_sensors").get();
  const stations = new Set<string>();
  sensors.forEach((s) => { const st = s.get("station"); if (st) stations.add(st); });
  const rh = await rhFor(db, deps, stations, nowMs);
  const rhOf = (st: string | null | undefined) => (st && rh.get(st)) || { rh: DEFAULT_RH, source: "default" };

  const curKey = hourKeyUtc(nowMs);
  const prevKey = hourKeyUtc(nowMs - 3600e3);
  const entries: Record<string, unknown>[] = [];
  for (const s of sensors.docs) {
    const id = s.id;
    const st = s.get("station") as string | null;
    const update: Record<string, unknown> = {};

    // (B) hourly rollup, once per finished hour
    let hourly = (s.get("hourly") as HourPoint[] | undefined) ?? [];
    if (s.get("rolledUpThrough") !== prevKey) {
      const prev = await db.doc(`readings_hourly/${id}_${prevKey}`).get();
      const mean = prev.exists ? hourlyMean(prev.get("r")) : null;
      const r = rhOf(st);
      hourly = [{ h: prevKey, pm: mean === null ? null : Math.round(epaCorrect(mean, r.rh) * 10) / 10, rh: r.rh }, ...hourly.filter((p) => p.h !== prevKey)]
        .slice(0, PUBLISH.keepHours);
      update.hourly = hourly;
      update.rolledUpThrough = prevKey;
      const pl = prev.exists ? prev.get("latest") : null;
      if (pl) update.lastLatest = { ...pl, lastSeen: prev.get("lastSeen") ?? null };
    }

    // (C) current value from the current hour (or the last known one)
    const cur = await db.doc(`readings_hourly/${id}_${curKey}`).get();
    const latest = (cur.exists ? cur.get("latest") : null) ?? (update.lastLatest as Record<string, unknown> | undefined) ?? s.get("lastLatest");
    const lastSeenTs = (cur.exists ? cur.get("lastSeen") : null) ?? (latest as { lastSeen?: Timestamp } | null)?.lastSeen ?? null;
    const lastSeen = lastSeenTs ? (lastSeenTs as Timestamp).toMillis() : 0;
    const online = lastSeen > 0 && nowMs - lastSeen < PUBLISH.offlineAfterMs;
    const r = rhOf(st);
    const nowPm = latest && typeof (latest as { pm25?: number }).pm25 === "number"
      ? Math.round(epaCorrect((latest as { pm25: number }).pm25, r.rh) * 10) / 10 : null;

    // NowCast over consecutive hours: current partial hour (current value) + finished hours, gaps as null.
    const byHour = new Map(hourly.map((p) => [p.h, p.pm]));
    const series: (number | null)[] = [online ? nowPm : null];
    for (let i = 1; i < 12; i++) series.push(byHour.get(hourKeyUtc(nowMs - i * 3600e3)) ?? null);
    const nc = nowcast(series);
    const aqi = nc !== null ? aqiFromPm25(nc) : nowPm !== null && online ? aqiFromPm25(nowPm) : null;
    if (Object.keys(update).length) await s.ref.set({ ...update, correctionVersion: CORRECTION_VERSION }, { merge: true });

    const indoor = Boolean(s.get("indoor"));
    entries.push({
      code: s.get("code"),
      // Indoor sensors: no location in public data (not on the map); their page still works by code.
      c: indoor ? null : s.get("center"),
      in: indoor ? 1 : 0,
      pm: online ? nowPm : null,
      nc,
      aqi: online ? aqi : null,
      cat: online && aqi !== null ? category(aqi).key : null,
      upd: lastSeen ? Math.floor(lastSeen / 1000) : null,
      on: online ? 1 : 0,
      rh: r.source === "default" ? "default" : "nws",
      h: hourly.slice(0, 24).map((p) => [p.h, p.pm]),
    });
  }
  const snapshot = { v: 1, generated: Math.floor(nowMs / 1000), correction: CORRECTION_VERSION, sensors: entries };
  await db.doc("public/snapshot").set({ json: JSON.stringify(snapshot), generatedAt: Timestamp.fromMillis(nowMs) });
  logEvent("publish_ok", { placed, sensors: entries.length, stations: stations.size });
  return snapshot;
}
