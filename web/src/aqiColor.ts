// Client copy of the PM2.5 → AQI category mapping for chart colors (same breakpoints as backend lib/aqi.ts:
// EPA-403/B-26-003 Table 6). Display only; the backend is the source of truth for published AQI values.
import type { CatKey } from "./snapshot";

const EDGES: [number, CatKey][] = [[9.0, "good"], [35.4, "moderate"], [55.4, "usg"], [125.4, "unhealthy"], [225.4, "very_unhealthy"]];

export function catForPm(pm: number): CatKey {
  const c = Math.floor(pm * 10 + 1e-9) / 10;
  for (const [hi, k] of EDGES) if (c <= hi) return k;
  return "hazardous";
}
