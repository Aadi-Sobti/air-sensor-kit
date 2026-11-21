// The public snapshot (GET /api/v1/snapshot.json, CDN-cached). Never contains addresses or exact coordinates.
export type CatKey = "good" | "moderate" | "usg" | "unhealthy" | "very_unhealthy" | "hazardous";
export interface SnapSensor {
  code: string;
  c: [number, number] | null; // H3 cell center [lat, lng]; null for indoor sensors
  in: 0 | 1;
  pm: number | null; // EPA-corrected PM2.5 now (µg/m³), null when offline
  nc: number | null; // NowCast PM2.5
  aqi: number | null;
  cat: CatKey | null;
  upd: number | null; // unix seconds of the last reading
  on: 0 | 1;
}
export interface Snapshot { v: number; generated: number; correction: string; sensors: SnapSensor[] }

// EPA AQI colors (EPA-403/B-26-003 Table 1: Green, Yellow, Orange, Red, Purple, Maroon).
export const CAT_COLORS: Record<CatKey, string> = {
  good: "#00e400", moderate: "#ffff00", usg: "#ff7e00", unhealthy: "#ff0000", very_unhealthy: "#8f3f97", hazardous: "#7e0023",
};
export const CAT_ORDER: CatKey[] = ["good", "moderate", "usg", "unhealthy", "very_unhealthy", "hazardous"];
export const OFFLINE_COLOR = "#9e9e9e";

export async function loadSnapshot(): Promise<Snapshot> {
  const r = await fetch("/api/v1/snapshot.json", { cache: "no-cache" });
  if (!r.ok) throw new Error(`snapshot ${r.status}`);
  return (await r.json()) as Snapshot;
}

/** GeoJSON for the map: outdoor sensors only (indoor sensors have no location). */
export function toGeoJson(s: Snapshot) {
  return {
    type: "FeatureCollection" as const,
    features: s.sensors.filter((x) => x.c && !x.in).map((x) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [x.c![1], x.c![0]] },
      properties: { code: x.code, aqi: x.aqi ?? -1, cat: x.on && x.cat ? x.cat : "offline", pm: x.pm ?? -1, upd: x.upd ?? 0 },
    })),
  };
}

/** Text color that stays readable on each AQI color. */
export function textOn(cat: CatKey | "offline"): string {
  return cat === "good" || cat === "moderate" || cat === "usg" || cat === "offline" ? "#111" : "#fff";
}

export function relTime(lang: string, unixSec: number, nowMs = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const s = Math.round(unixSec - nowMs / 1000);
  const a = Math.abs(s);
  if (a < 60) return rtf.format(Math.round(s), "second");
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}
