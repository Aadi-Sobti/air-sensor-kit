// Owner codes (printed on the card's back; "Manage my sensor"). Treated like passwords (project security rules):
//  - 10 characters from the 31-character no-look-alike alphabet (~49.5 bits), shown grouped XXXX-XXXX-XX;
//  - stored only as a keyed hash HMAC-SHA256(OWNER_PEPPER, code) (founder decision 2026-11-21: key in Secret
//    Manager), so a leaked database can't be brute-forced offline; the hash is also the lookup key;
//  - exchanged for short-lived, signed session tokens scoped to one sensor + code version (rotation kills them).
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { CODE_ALPHABET } from "./shortcode";

export const OWNER_CODE_LEN = 10;
export const SESSION_TTL_S = 7 * 24 * 3600; // sliding: refreshed on every use
export const SESSION_MAX_S = 90 * 24 * 3600; // absolute: after 90 days the owner code is needed again

export function newOwnerCode(): string {
  let s = "";
  for (let i = 0; i < OWNER_CODE_LEN; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

export function formatOwnerCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
}

/** Accepts what people type: lower case, spaces, dashes. Returns null if it can't be a code. */
export function normalizeOwnerCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "");
  if (s.length !== OWNER_CODE_LEN) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

export function ownerCodeHash(pepper: string, code: string): string {
  if (!pepper || pepper.length < 32) throw new Error("owner pepper missing");
  return createHmac("sha256", pepper).update(`owner-code:v1:${code}`).digest("hex");
}

// Session token: base64url(JSON payload) + "." + base64url(HMAC(pepper, "session:v1:" + payload)).
export interface SessionPayload { d: string; v: number; exp: number; iat?: number }

const b64u = (b: Buffer) => b.toString("base64url");

export function signSession(pepper: string, p: SessionPayload): string {
  const body = b64u(Buffer.from(JSON.stringify(p)));
  const sig = createHmac("sha256", pepper).update(`session:v1:${body}`).digest();
  return `${body}.${b64u(sig)}`;
}

export function verifySession(pepper: string, token: string, nowS: number): SessionPayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || body.length > 400) return null;
  const want = createHmac("sha256", pepper).update(`session:v1:${body}`).digest();
  let got: Buffer;
  try {
    got = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof p.d !== "string" || typeof p.v !== "number" || typeof p.exp !== "number" || p.exp < nowS) return null;
    return p;
  } catch {
    return null;
  }
}

/** "123 Main St, Apt 4" -> "123 M… St" style masking for display to the owner (never the full address). */
export function maskAddress(address: string): string {
  const words = address.replace(/,.*$/, "").trim().split(/\s+/);
  if (!words.length || !words[0]) return "";
  const num = /^\d/.test(words[0]) ? words.shift()! : "";
  const street = words.map((w, i) => (i === words.length - 1 && words.length > 1 ? w : `${w[0]}…`)).join(" ");
  return [num, street].filter(Boolean).join(" ");
}
