// Sensor.Community forwarding (M8). Feature flag OFF until the founder confirms with Sensor.Community.
// Facts verified 2026-11-21:
//  - Push API (https://github.com/opendata-stuttgart/meta/wiki/EN-APIs): POST
//    https://api.sensor.community/v1/push-sensor-data/ with headers X-Sensor: esp8266-<chipid>, X-Pin, Content-Type
//    JSON; body {software_version, sensordatavalues:[{value_type, value}]}; values as strings; "Don't send a
//    timestamp with the data. This should be set by the server." PMS1003-7003: X-Pin 1, P1 = PM10, P2 = PM2.5.
//  - airrohr firmware (opendata-stuttgart/sensors-software, GPL-3; read for facts only, no code copied):
//    defines.h "#define PMS_API_PIN 1"; it reads frame bytes 10-15 (Plantower data 4-6 = PM1/PM2.5/PM10 under
//    atmospheric environment) and sends them as P0/P2/P1. We send the same ATM fields.
// Privacy: no location is sent here (Sensor.Community gets a location only at registration; use the public cell).
// Readings older than MAX_AGE are not sent, because Sensor.Community stamps the arrival time.
import { logEvent, logWarn } from "./lib/redact";
import { Reading } from "./lib/payload";

export const SC_URL = "https://api.sensor.community/v1/push-sensor-data/";
export const SC = { pin: "1", maxAgeS: 5 * 60, timeoutMs: 15000, enqueueTimeoutMs: 2000 };

export interface ScTask { deviceId: string; fw: string; pm1: number; pm25: number; pm10: number; ts: number }

/** The newest reading if it's fresh enough to be stamped "now" by Sensor.Community; else null. */
export function taskFor(deviceId: string, fw: string, readings: Reading[], nowS: number): ScTask | null {
  if (!readings.length) return null;
  const r = readings.reduce((a, b) => (b.ts > a.ts ? b : a));
  if (nowS - r.ts > SC.maxAgeS || r.n === 0) return null;
  return { deviceId, fw, pm1: r.pm1_atm, pm25: r.pm25_atm, pm10: r.pm10_atm, ts: r.ts };
}

export function scRequest(t: ScTask): { url: string; headers: Record<string, string>; body: string } {
  return {
    url: SC_URL,
    headers: { "Content-Type": "application/json", "X-Sensor": t.deviceId, "X-Pin": SC.pin, "User-Agent": `ProseFire/${t.fw}` },
    body: JSON.stringify({
      software_version: `ProseFire-${t.fw}`,
      sensordatavalues: [
        { value_type: "P0", value: t.pm1.toFixed(2) },
        { value_type: "P1", value: t.pm10.toFixed(2) },
        { value_type: "P2", value: t.pm25.toFixed(2) },
      ],
    }),
  };
}

export type HttpPost = (url: string, headers: Record<string, string>, body: string) => Promise<{ status: number }>;
export const httpPost: HttpPost = async (url, headers, body) => {
  const r = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(SC.timeoutMs) });
  return { status: r.status };
};

export class RetryableError extends Error {}

/** Resolves (or rejects) within `ms`, so a slow Cloud Tasks call can't hold up a sensor's upload. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

/**
 * Task handler body. Retries (throws RetryableError) only when Sensor.Community definitely did NOT accept the
 * reading (5xx / 429). Network errors and timeouts are not retried: the POST may already have been accepted, and
 * their API can't detect repeats, so a lost point is better than a duplicate. Readings older than SC.maxAgeS are
 * dropped (Sensor.Community stamps the arrival time; a late delivery would be mis-timed).
 */
export async function forwardOne(t: ScTask, post: HttpPost = httpPost, nowS = Math.floor(Date.now() / 1000)): Promise<"sent" | "stale" | "rejected" | "lost"> {
  if (nowS - t.ts > SC.maxAgeS) return "stale";
  const req = scRequest(t);
  let status: number;
  try {
    status = (await post(req.url, req.headers, req.body)).status;
  } catch (e) {
    logWarn("sc_forward_lost", { device: t.deviceId, error: String((e as Error)?.message ?? e).slice(0, 80) });
    return "lost";
  }
  if (status >= 200 && status < 300) {
    logEvent("sc_forward_ok", { device: t.deviceId, status });
    return "sent";
  }
  if (status === 429 || status >= 500) throw new RetryableError(`status ${status}`);
  logWarn("sc_forward_rejected", { device: t.deviceId, status }); // e.g. not registered there: don't retry
  return "rejected";
}
