// Improv Wi-Fi serial codec (browser side). Same framing as firmware/lib/core/src/improv.cpp and tools/improv.py:
// "IMPROV" | 0x01 | type | len | data | checksum (sum of all previous bytes, mod 256). Spec:
// https://www.improv-wifi.com/serial/ ; checksum per https://github.com/improv-wifi/sdk-cpp (reference only).
export const T_STATE = 0x01, T_ERROR = 0x02, T_RPC = 0x03, T_RESULT = 0x04;
export const WIFI_SETTINGS = 0x01, GET_STATE = 0x02, GET_INFO = 0x03, GET_NETWORKS = 0x04;
export const STATE_READY = 0x02, STATE_PROVISIONING = 0x03, STATE_PROVISIONED = 0x04;
export const ERR_UNABLE_TO_CONNECT = 0x03;
export const ERR_UNKNOWN = 0xff;

const HEADER = [0x49, 0x4d, 0x50, 0x52, 0x4f, 0x56]; // "IMPROV"
const enc = new TextEncoder();
const dec = new TextDecoder();

export function frame(type: number, data: Uint8Array): Uint8Array {
  if (data.length > 255) throw new Error("data too long");
  const f = new Uint8Array(10 + data.length);
  f.set(HEADER, 0);
  f[6] = 0x01;
  f[7] = type;
  f[8] = data.length;
  f.set(data, 9);
  let sum = 0;
  for (let i = 0; i < 9 + data.length; i++) sum = (sum + f[i]) & 0xff;
  f[9 + data.length] = sum;
  return f;
}

export function rpc(command: number, payload: Uint8Array = new Uint8Array()): Uint8Array {
  const d = new Uint8Array(2 + payload.length);
  d[0] = command;
  d[1] = payload.length;
  d.set(payload, 2);
  return frame(T_RPC, d);
}

export function wifiSettings(ssid: string, password: string): Uint8Array {
  const s = enc.encode(ssid), p = enc.encode(password);
  if (s.length < 1 || s.length > 32 || p.length > 64) throw new Error("bad_credentials_length");
  const payload = new Uint8Array(2 + s.length + p.length);
  payload[0] = s.length;
  payload.set(s, 1);
  payload[1 + s.length] = p.length;
  payload.set(p, 2 + s.length);
  return rpc(WIFI_SETTINGS, payload);
}

/** RPC result data: command, length, then length-prefixed UTF-8 strings. */
export function parseStrings(data: Uint8Array): string[] {
  const out: string[] = [];
  let i = 2;
  while (i < data.length) {
    const n = data[i];
    out.push(dec.decode(data.subarray(i + 1, i + 1 + n)));
    i += 1 + n;
  }
  return out;
}

export interface Frame {
  type: number;
  data: Uint8Array;
}

/** Streaming parser: logs and noise between frames are skipped. */
export class Parser {
  private buf: number[] = [];

  feed(chunk: Uint8Array): Frame[] {
    const out: Frame[] = [];
    for (const b of chunk) this.buf.push(b);
    for (;;) {
      const i = this.findHeader();
      if (i < 0) {
        this.buf = this.buf.slice(-5); // a header may be split across chunks
        return out;
      }
      this.buf = this.buf.slice(i);
      if (this.buf.length >= 7 && this.buf[6] !== 0x01) {
        this.buf.shift(); // "IMPROV" inside a log line
        continue;
      }
      if (this.buf.length < 9) return out;
      const n = this.buf[8];
      if (this.buf.length < 10 + n) return out;
      const f = this.buf.slice(0, 10 + n);
      this.buf = this.buf.slice(10 + n);
      let sum = 0;
      for (let k = 0; k < 9 + n; k++) sum = (sum + f[k]) & 0xff;
      if (sum !== f[9 + n]) continue;
      out.push({ type: f[7], data: Uint8Array.from(f.slice(9, 9 + n)) });
    }
  }

  private findHeader(): number {
    outer: for (let i = 0; i + 6 <= this.buf.length; i++) {
      for (let k = 0; k < 6; k++) if (this.buf[i + k] !== HEADER[k]) continue outer;
      return i;
    }
    return -1;
  }
}
