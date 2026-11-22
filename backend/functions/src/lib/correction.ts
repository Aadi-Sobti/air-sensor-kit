// EPA corrections for PMS5003 (PurpleAir) PM2.5. Raw values are stored forever; corrections are versioned.
// Verified 2026-11-21 from the papers:
//  - Barkjohn, Gantt, Clements (2021), Atmos. Meas. Tech. 14:4617, Eq. (10), https://amt.copernicus.org/articles/14/4617/2021/
//      PM2.5 = 0.524 × PA_cf1 − 0.0862 × RH + 5.75   (RH in %, "substituting a value of 50 %" if RH is missing)
//  - Barkjohn et al. (2022), Sensors 22(24):9669, Sect. 3.1, Eqs. (1)-(3), https://www.mdpi.com/1424-8220/22/24/9669
//      PA_cf1 < 570:        Eq. (1) (the 2021 equation)
//      570 ≤ PA_cf1 < 611:  (0.0244 × PA_cf1 − 13.9) × Eq.(3) + (1 − (0.0244 × PA_cf1 − 13.9)) × Eq.(1)
//      PA_cf1 ≥ 611:        Eq. (3) = 4.21e-4 × PA_cf1² + 0.392 × PA_cf1 + 3.44
// Notes: EPA fit these with PurpleAir's internal RH (drier than outdoor air) and A/B-channel averages; we have one
// PMS5003 and outdoor RH from the nearest NWS station (rh_source is recorded). Negative results are clamped to 0.
export const CORRECTION_VERSION = "epa-us-2021+smoke-2022";
export const DEFAULT_RH = 50;

function eq1(pa: number, rh: number): number {
  return 0.524 * pa - 0.0862 * rh + 5.75;
}
function eq3(pa: number): number {
  return 4.21e-4 * pa * pa + 0.392 * pa + 3.44;
}

/** Corrected PM2.5 (µg/m³) from the sensor's CF=1 PM2.5 and relative humidity (%). */
export function epaCorrect(paCf1: number, rh: number | null | undefined): number {
  const h = rh === null || rh === undefined || !Number.isFinite(rh) || rh < 0 || rh > 100 ? DEFAULT_RH : rh;
  const pa = Math.max(0, paCf1);
  let v: number;
  if (pa < 570) v = eq1(pa, h);
  else if (pa < 611) {
    const w = 0.0244 * pa - 13.9;
    v = w * eq3(pa) + (1 - w) * eq1(pa, h);
  } else v = eq3(pa);
  return Math.max(0, v);
}
