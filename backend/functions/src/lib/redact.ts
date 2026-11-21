// Logger that can never print private data (privacy rule: no addresses, coordinates, secrets, or tokens in logs).
import { logger } from "firebase-functions";

const SENSITIVE = /(address|addr|street|zip|postal|lat|lng|lon|coord|secret|token|password|pass|signature|sig|owner.?code|contact|email|phone)/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[deep]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  logger.info(event, redact(fields) as Record<string, unknown>);
}

export function logWarn(event: string, fields: Record<string, unknown> = {}): void {
  logger.warn(event, redact(fields) as Record<string, unknown>);
}
