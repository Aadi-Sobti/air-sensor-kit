// US AQI for PM2.5 and the NowCast. Source (verified 2026-11-21): EPA "Technical Assistance Document for the
// Reporting of Daily Air Quality – the Air Quality Index (AQI)", EPA-403/B-26-003, May 2026, Table 1 (names and
// colors), Table 6 (breakpoints, 2024 revision), Equation 1, "How the NowCast is calculated" (p. 16).
// https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf
// PM2.5 is truncated to 1 decimal; the index is rounded to the nearest integer; AQI > 500 uses the 500 breakpoint
// (325.4 µg/m³) in Equation 1.
const BP: [number, number, number, number][] = [
  // [C_lo, C_hi, I_lo, I_hi]
  [0.0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
];

export function truncate1(c: number): number {
  return Math.floor(c * 10 + 1e-9) / 10;
}

export function aqiFromPm25(concentration: number): number {
  const c = truncate1(Math.max(0, concentration));
  for (const [lo, hi, ilo, ihi] of BP) {
    if (c <= hi) return Math.round(((ihi - ilo) / (hi - lo)) * (Math.max(c, lo) - lo) + ilo);
  }
  const [lo, hi, ilo, ihi] = BP[BP.length - 1];
  return Math.round(((ihi - ilo) / (hi - lo)) * (c - lo) + ilo); // beyond the AQI: extend the top segment
}

export interface Category {
  name: string;
  color: string; // hex; EPA names: Green, Yellow, Orange, Red, Purple, Maroon
  key: "good" | "moderate" | "usg" | "unhealthy" | "very_unhealthy" | "hazardous";
}
export function category(aqi: number): Category {
  if (aqi <= 50) return { name: "Good", color: "#00e400", key: "good" };
  if (aqi <= 100) return { name: "Moderate", color: "#ffff00", key: "moderate" };
  if (aqi <= 150) return { name: "Unhealthy for Sensitive Groups", color: "#ff7e00", key: "usg" };
  if (aqi <= 200) return { name: "Unhealthy", color: "#ff0000", key: "unhealthy" };
  if (aqi <= 300) return { name: "Very Unhealthy", color: "#8f3f97", key: "very_unhealthy" };
  return { name: "Hazardous", color: "#7e0023", key: "hazardous" };
}

/**
 * NowCast from hourly averages, newest first (index 0 = current hour); null = missing hour.
 * Returns null unless 2 of the last 3 hours are valid. Missing hours are left out of both sums.
 */
export function nowcast(hourly: (number | null)[]): number | null {
  const h = hourly.slice(0, 12);
  const valid3 = h.slice(0, 3).filter((v) => v !== null && Number.isFinite(v)).length;
  if (valid3 < 2) return null;
  const vals = h.filter((v): v is number => v !== null && Number.isFinite(v));
  const max = Math.max(...vals), min = Math.min(...vals);
  let w = max > 0 ? 1 - (max - min) / max : 1;
  if (w < 0.5) w = 0.5;
  let num = 0, den = 0;
  h.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return;
    const f = Math.pow(w, i);
    num += v * f;
    den += f;
  });
  return truncate1(num / den);
}
