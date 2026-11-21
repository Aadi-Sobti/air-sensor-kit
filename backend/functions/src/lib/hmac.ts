// Upload signatures: HMAC-SHA256(secret, timestamp + body), hex. The secret is 32 random bytes (64 hex chars)
// generated on the device and enrolled on its first upload (trust on first use, factory-allowlisted IDs only).
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function sign(secretHex: string, timestamp: string, body: Buffer | string): string {
  const key = Buffer.from(secretHex, "hex");
  return createHmac("sha256", key).update(timestamp).update(body).digest("hex");
}

export function verify(secretHex: string, timestamp: string, body: Buffer, signatureHex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(signatureHex) || !/^[0-9a-f]{64}$/i.test(secretHex)) return false;
  const want = Buffer.from(sign(secretHex, timestamp, body), "hex");
  const got = Buffer.from(signatureHex, "hex");
  return want.length === got.length && timingSafeEqual(want, got);
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
