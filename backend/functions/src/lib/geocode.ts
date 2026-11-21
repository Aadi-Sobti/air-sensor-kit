// US Census Geocoder (decision #10): free, no key, US addresses only. Verified 2026-11-21 from
// https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html :
//   GET /geocoder/locations/address?street=..&zip=..&benchmark=Public_AR_Current&format=json
//   -> result.addressMatches[i].coordinates.{x: lng, y: lat}, .matchedAddress
// The exact location is private (private_locations only); only an H3 cell is ever public (M7).
export interface GeoPoint {
  lat: number;
  lng: number;
  matchedAddress: string;
}
export type GeocodeResult = { kind: "match"; point: GeoPoint } | { kind: "no_match" } | { kind: "unavailable" };
export type Geocoder = (street: string, zip: string) => Promise<GeocodeResult>;

const BASE = "https://geocoding.geo.census.gov/geocoder/locations/address";

export const censusGeocoder: Geocoder = async (street, zip) => {
  const url = `${BASE}?${new URLSearchParams({ street, zip, benchmark: "Public_AR_Current", format: "json" })}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { kind: "unavailable" };
    const j = (await r.json()) as {
      result?: { addressMatches?: { coordinates?: { x?: number; y?: number }; matchedAddress?: string }[] };
    };
    const m = j.result?.addressMatches?.[0];
    const x = m?.coordinates?.x;
    const y = m?.coordinates?.y;
    if (typeof x !== "number" || typeof y !== "number") return { kind: "no_match" };
    return { kind: "match", point: { lat: y, lng: x, matchedAddress: String(m?.matchedAddress ?? "") } };
  } catch {
    return { kind: "unavailable" };
  }
};
