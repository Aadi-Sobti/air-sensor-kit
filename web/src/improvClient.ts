// Talks Improv to the sensor over any byte transport (Web Serial in the browser, a fake device in tests).
import {
  ERR_UNABLE_TO_CONNECT, Frame, GET_INFO, GET_NETWORKS, GET_STATE, Parser, parseStrings, rpc, STATE_PROVISIONED,
  T_ERROR, T_RESULT, T_STATE, WIFI_SETTINGS, wifiSettings,
} from "./improv";

export interface Transport {
  write(bytes: Uint8Array): Promise<void>;
  /** Resolves with the next chunk, or null when closed. */
  read(): Promise<Uint8Array | null>;
}

export interface DeviceInfo { firmware: string; version: string; chip: string; name: string }
export interface Network { ssid: string; rssi: number; secure: boolean }
export type WifiResult = { ok: true; redirect: string } | { ok: false; reason: "wrong_password_or_range" | "timeout" };

export class ImprovClient {
  private parser = new Parser();
  private queue: Frame[] = [];
  private waiters: (() => void)[] = [];
  private closed = false;

  constructor(private t: Transport) {
    void this.pump();
  }

  private async pump() {
    for (;;) {
      const chunk = await this.t.read().catch(() => null);
      if (!chunk) {
        this.closed = true;
        this.wake();
        return;
      }
      this.queue.push(...this.parser.feed(chunk));
      this.wake();
    }
  }

  private wake() {
    const w = this.waiters;
    this.waiters = [];
    w.forEach((f) => f());
  }

  /** Waits for a frame matching pick() (which returns a value or undefined), up to ms. */
  private async waitFor<T>(pick: (f: Frame) => T | undefined, ms: number): Promise<T | undefined> {
    const end = Date.now() + ms;
    for (;;) {
      while (this.queue.length) {
        const v = pick(this.queue.shift()!);
        if (v !== undefined) return v;
      }
      const left = end - Date.now();
      if (left <= 0 || this.closed) return undefined;
      await new Promise<void>((res) => {
        const timer = setTimeout(res, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          res();
        });
      });
    }
  }

  private isResult(cmd: number) {
    return (f: Frame) => (f.type === T_RESULT && f.data[0] === cmd ? parseStrings(f.data) : undefined);
  }

  async getInfo(tries = 3, ms = 2500): Promise<DeviceInfo | undefined> {
    for (let i = 0; i < tries; i++) {
      await this.t.write(rpc(GET_INFO));
      const s = await this.waitFor(this.isResult(GET_INFO), ms);
      if (s && s.length >= 4) return { firmware: s[0], version: s[1], chip: s[2], name: s[3] };
    }
    return undefined;
  }

  async isConnected(ms = 3000): Promise<boolean> {
    await this.t.write(rpc(GET_STATE));
    const st = await this.waitFor((f) => (f.type === T_STATE ? f.data[0] : undefined), ms);
    return st === STATE_PROVISIONED;
  }

  async scan(ms = 15000): Promise<Network[]> {
    await this.t.write(rpc(GET_NETWORKS));
    const nets: Network[] = [];
    const done = await this.waitFor((f) => {
      const s = this.isResult(GET_NETWORKS)(f);
      if (!s) return undefined;
      if (s.length === 0) return true; // end of list
      if (!nets.some((n) => n.ssid === s[0])) nets.push({ ssid: s[0], rssi: Number(s[1]), secure: s[2] === "YES" });
      return undefined;
    }, ms);
    if (!done && nets.length === 0) throw new Error("scan_timeout");
    return nets.sort((a, b) => b.rssi - a.rssi);
  }

  async sendWifi(ssid: string, password: string, ms = 40000): Promise<WifiResult> {
    await this.t.write(wifiSettings(ssid, password));
    const r = await this.waitFor<WifiResult>((f) => {
      if (f.type === T_ERROR && f.data[0] === ERR_UNABLE_TO_CONNECT) return { ok: false, reason: "wrong_password_or_range" };
      if (f.type === T_RESULT && f.data[0] === WIFI_SETTINGS) return { ok: true, redirect: parseStrings(f.data)[0] ?? "" };
      return undefined;
    }, ms);
    return r ?? { ok: false, reason: "timeout" };
  }
}

/** Turns the sensor's redirect into a same-origin claim URL (so a URL from the device can't send people elsewhere). */
export function claimPathFromRedirect(redirect: string): string | null {
  const i = redirect.indexOf("#");
  if (i < 0) return null;
  const p = new URLSearchParams(redirect.slice(i + 1));
  const d = p.get("d") ?? "", t = p.get("t") ?? "";
  if (!/^esp8266-\d{1,10}$/.test(d) || !/^[0-9a-f]{32}$/.test(t)) return null;
  return `/claim#d=${d}&t=${t}`;
}

/** Reads d/t from a claim page fragment ("#d=...&t=..."). */
export function parseClaimFragment(hash: string): { d: string; t: string } | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const d = p.get("d") ?? "", t = (p.get("t") ?? "").toLowerCase();
  return /^esp8266-\d{1,10}$/.test(d) && /^[0-9a-f]{32}$/.test(t) ? { d, t } : null;
}
