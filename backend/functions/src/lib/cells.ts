// Public location = an H3 cell (decision 2026-11-21: resolution 9, avg ~0.105 km², ~200 m edge;
// https://h3geo.org/docs/core-library/restable). Exact coordinates never leave private_locations.
import { cellToLatLng, latLngToCell } from "h3-js";

export const PUBLIC_RES = 9;

export function publicCell(lat: number, lng: number): { cell: string; center: [number, number] } {
  const cell = latLngToCell(lat, lng, PUBLIC_RES);
  const [clat, clng] = cellToLatLng(cell);
  return { cell, center: [Math.round(clat * 1e5) / 1e5, Math.round(clng * 1e5) / 1e5] };
}
