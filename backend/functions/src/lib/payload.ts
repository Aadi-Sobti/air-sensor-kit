// Upload payload validation (no dependencies). `readings` is always an array (ready for phase-2 buffering).
export interface Reading {
  ts: number; // device unix seconds (end of the averaging interval)
  n: number; // samples averaged
  pm1_cf1: number;
  pm25_cf1: number;
  pm10_cf1: number;
  pm1_atm: number;
  pm25_atm: number;
  pm10_atm: number;
  counts: number[]; // >0.3, >0.5, >1.0, >2.5, >5.0, >10 um per 0.1 L
  pm25_cf1_min: number;
  pm25_cf1_max: number;
}

export interface SetupInfo {
  address: string;
  zip: string;
  indoor: boolean;
}

export interface Upload {
  fw: string;
  uptime_s: number;
  rssi: number;
  readings: Reading[];
  errors?: Record<string, number>;
  setup?: SetupInfo;
  claim_token_hash?: string;
}

export const LIMITS = {
  maxBodyBytes: 16 * 1024,
  maxReadings: 50,
  maxReadingAgeS: 2 * 24 * 3600, // phase-2 buffering may send older readings; v1 sends fresh ones
  maxReadingFutureS: 10 * 60,
};

const num = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

export function parseUpload(raw: unknown, nowS: number): { ok: true; upload: Upload } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "body_not_object" };
  const b = raw as Record<string, unknown>;
  if (!str(b.fw, 32) || !/^[0-9A-Za-z._-]+$/.test(b.fw)) return { ok: false, error: "bad_fw" };
  if (!num(b.uptime_s, 0, 1e9)) return { ok: false, error: "bad_uptime" };
  if (!num(b.rssi, -127, 0)) return { ok: false, error: "bad_rssi" };
  if (!Array.isArray(b.readings) || b.readings.length < 1 || b.readings.length > LIMITS.maxReadings) {
    return { ok: false, error: "bad_readings" };
  }
  const readings: Reading[] = [];
  for (const r of b.readings as unknown[]) {
    if (!r || typeof r !== "object") return { ok: false, error: "bad_reading" };
    const x = r as Record<string, unknown>;
    if (!num(x.ts, nowS - LIMITS.maxReadingAgeS, nowS + LIMITS.maxReadingFutureS) || !Number.isInteger(x.ts)) {
      return { ok: false, error: "bad_reading_ts" };
    }
    const pmKeys = ["pm1_cf1", "pm25_cf1", "pm10_cf1", "pm1_atm", "pm25_atm", "pm10_atm", "pm25_cf1_min", "pm25_cf1_max"];
    for (const k of pmKeys) if (!num(x[k], 0, 65535)) return { ok: false, error: `bad_${k}` };
    if (!num(x.n, 0, 65535)) return { ok: false, error: "bad_n" };
    if (!Array.isArray(x.counts) || x.counts.length !== 6 || !x.counts.every((c) => num(c, 0, 65535))) {
      return { ok: false, error: "bad_counts" };
    }
    readings.push({
      ts: x.ts as number, n: x.n as number,
      pm1_cf1: x.pm1_cf1 as number, pm25_cf1: x.pm25_cf1 as number, pm10_cf1: x.pm10_cf1 as number,
      pm1_atm: x.pm1_atm as number, pm25_atm: x.pm25_atm as number, pm10_atm: x.pm10_atm as number,
      counts: (x.counts as number[]).slice(), pm25_cf1_min: x.pm25_cf1_min as number, pm25_cf1_max: x.pm25_cf1_max as number,
    });
  }
  const upload: Upload = { fw: b.fw, uptime_s: b.uptime_s, rssi: b.rssi, readings };
  if (b.errors !== undefined) {
    if (!b.errors || typeof b.errors !== "object" || Array.isArray(b.errors)) return { ok: false, error: "bad_errors" };
    const errs: Record<string, number> = {};
    for (const [k, v] of Object.entries(b.errors as Record<string, unknown>)) {
      if (!/^[a-z_]{1,24}$/.test(k) || !num(v, 0, 4294967295)) return { ok: false, error: "bad_errors" };
      errs[k] = v;
    }
    if (Object.keys(errs).length > 16) return { ok: false, error: "bad_errors" };
    upload.errors = errs;
  }
  if (b.setup !== undefined) {
    const s = b.setup as Record<string, unknown>;
    if (!s || typeof s !== "object" || !str(s.address, 200) || !str(s.zip, 10) || !/^\d{5}(-\d{4})?$/.test(s.zip) ||
        typeof s.indoor !== "boolean") {
      return { ok: false, error: "bad_setup" };
    }
    upload.setup = { address: s.address.trim(), zip: s.zip, indoor: s.indoor };
  }
  if (b.claim_token_hash !== undefined) {
    if (!str(b.claim_token_hash, 64) || !/^[0-9a-f]{64}$/.test(b.claim_token_hash)) return { ok: false, error: "bad_claim" };
    upload.claim_token_hash = b.claim_token_hash;
  }
  return { ok: true, upload };
}
