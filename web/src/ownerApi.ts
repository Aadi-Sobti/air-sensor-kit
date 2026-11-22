// Owner API client + this browser's sensor list. Stores only session tokens and short codes (never the owner code).
export interface StoredSensor { code: string; token: string; name?: string | null }
const KEY = "prosefire.owner.v1";

export function loadSensors(): StoredSensor[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.code === "string" && typeof x.token === "string") : [];
  } catch {
    return [];
  }
}
export function saveSensors(list: StoredSensor[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* private mode: works for this visit only */ }
}
export function upsertSensor(list: StoredSensor[], s: StoredSensor): StoredSensor[] {
  return [...list.filter((x) => x.code !== s.code), s];
}

/** Reads "#owner=<code>" (from the card's QR), then removes it from the address bar and history. */
export function takeOwnerCodeFromUrl(loc: Location = location, hist: History = history): string | null {
  const m = new URLSearchParams(loc.hash.replace(/^#/, "")).get("owner");
  if (m === null) return null;
  hist.replaceState(null, "", loc.pathname);
  return m;
}

export type ApiResult = { status: number; body: Record<string, unknown> };

export async function api(method: string, path: string, body?: unknown, token?: string): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`/api/v1/owner${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store", credentials: "omit" });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

export function wifiLevel(rssi: number | null | undefined): "strong" | "ok" | "weak" | null {
  if (typeof rssi !== "number") return null;
  return rssi >= -60 ? "strong" : rssi >= -72 ? "ok" : "weak";
}
