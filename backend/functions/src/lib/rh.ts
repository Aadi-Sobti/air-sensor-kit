// Relative humidity for the EPA correction from the nearest National Weather Service station (decision
// 2026-11-21). API facts verified 2026-11-21 at https://www.weather.gov/documentation/services-web-api :
//   /points/{lat},{lon} -> properties.observationStations (URL; stations sorted by distance)
//   /stations/{id}/observations/latest -> properties.relativeHumidity.value (%)
// NWS requires a User-Agent identifying the app; we use the public repo URL (no personal contact).
// Lookups use the PUBLIC cell center only (never the private address). NWS data is public domain.
export const NWS_USER_AGENT = "(ProseFire community air sensors, https://github.com/Aadi-Sobti/air-sensor-kit)";
const BASE = "https://api.weather.gov";

export type Fetcher = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
export const httpFetcher: Fetcher = (url) =>
  fetch(url, { headers: { "User-Agent": NWS_USER_AGENT, Accept: "application/geo+json" }, signal: AbortSignal.timeout(8000) });

export async function nearestStation(lat: number, lng: number, f: Fetcher = httpFetcher): Promise<string | null> {
  try {
    const p = await f(`${BASE}/points/${lat.toFixed(4)},${lng.toFixed(4)}`);
    if (!p.ok) return null;
    const url = (await p.json() as { properties?: { observationStations?: string } }).properties?.observationStations;
    if (!url) return null;
    const s = await f(url);
    if (!s.ok) return null;
    const feats = (await s.json() as { features?: { properties?: { stationIdentifier?: string } }[] }).features ?? [];
    return feats[0]?.properties?.stationIdentifier ?? null;
  } catch {
    return null;
  }
}

export async function latestRh(station: string, f: Fetcher = httpFetcher): Promise<number | null> {
  try {
    const r = await f(`${BASE}/stations/${encodeURIComponent(station)}/observations/latest`);
    if (!r.ok) return null;
    const v = (await r.json() as { properties?: { relativeHumidity?: { value?: number | null } } }).properties?.relativeHumidity?.value;
    return typeof v === "number" && v >= 0 && v <= 100 ? v : null;
  } catch {
    return null;
  }
}
