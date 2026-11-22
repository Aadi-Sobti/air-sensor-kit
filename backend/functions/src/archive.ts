// Nightly raw archive (decision #4, design B): Firestore keeps readings 35 days (TTL); raw readings are kept
// forever here, one gzipped NDJSON file per UTC day in the project's private Storage bucket:
//   archive/raw/v1/YYYY/MM/DD.ndjson.gz   (one line per reading: device, ts, and the raw sensor fields)
// Corrections are versioned and can be re-run from this. No locations or personal data are in readings.
// Catches up on missed days (up to 5 per run), well inside the 35-day TTL.
import { gunzipSync, gzipSync } from "node:zlib";

import { FieldValue, Firestore, Timestamp } from "firebase-admin/firestore";

import { logEvent, logWarn } from "./lib/redact";

export const ARCHIVE = { maxDaysPerRun: 5, firstDayLookback: 2, maxPurgeFilesPerRun: 400 };
export type SaveFile = (path: string, data: Buffer) => Promise<void>;
export interface ArchiveStore {
  save: SaveFile;
  read: (path: string) => Promise<Buffer | null>;
  list: (prefix: string) => Promise<string[]>;
}

export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}
export function archivePath(day: string): string {
  const [y, m, d] = day.split("-");
  return `archive/raw/v1/${y}/${m}/${d}.ndjson.gz`;
}

export async function archiveDay(db: Firestore, save: SaveFile, day: string): Promise<number> {
  const start = Date.parse(`${day}T00:00:00Z`);
  const snap = await db.collection("readings_hourly")
    .where("hour", ">=", Timestamp.fromMillis(start))
    .where("hour", "<", Timestamp.fromMillis(start + 86400e3))
    .get();
  const lines: string[] = [];
  snap.forEach((doc) => {
    const device = String(doc.get("deviceId"));
    const r = (doc.get("r") ?? {}) as Record<string, Record<string, unknown>>;
    for (const ts of Object.keys(r).sort()) lines.push(JSON.stringify({ device, ts: Number(ts), ...r[ts] }));
  });
  await save(archivePath(day), gzipSync(Buffer.from(lines.join("\n") + (lines.length ? "\n" : ""), "utf8")));
  return lines.length;
}

/** Archives every finished UTC day not archived yet (up to ARCHIVE.maxDaysPerRun). */
export async function runArchive(db: Firestore, save: SaveFile, nowMs = Date.now()) {
  const stateRef = db.doc("public/archive_state"); // not client-readable (rules deny all)
  const last = (await stateRef.get()).get("lastDay") as string | undefined;
  const yesterday = dayKey(nowMs - 86400e3);
  let day = last ? dayKey(Date.parse(`${last}T00:00:00Z`) + 86400e3) : dayKey(nowMs - ARCHIVE.firstDayLookback * 86400e3);
  const done: string[] = [];
  while (day <= yesterday && done.length < ARCHIVE.maxDaysPerRun) {
    try {
      const n = await archiveDay(db, save, day);
      await stateRef.set({ lastDay: day, at: Timestamp.fromMillis(nowMs) }, { merge: true });
      logEvent("archive_day_ok", { day, readings: n });
      done.push(day);
    } catch (e) {
      logWarn("archive_day_failed", { day, error: String((e as Error)?.message ?? e).slice(0, 120) });
      break; // retry this day next run; never skip a day
    }
    day = dayKey(Date.parse(`${day}T00:00:00Z`) + 86400e3);
  }
  return done;
}

/**
 * "Delete my data" (founder decision 2026-11-21: delete archived raw readings too): rewrite every archive file that
 * may contain the retired device, without its lines. Budgeted per run; resumes next night until done.
 */
export async function runArchivePurge(db: Firestore, store: ArchiveStore, nowMs = Date.now()) {
  const pending = await db.collection("devices").where("archivePurgePending", "==", true).limit(20).get();
  let files = 0;
  const purged: string[] = [];
  for (const dev of pending.docs) {
    const d = dev.id;
    const from = dayKey((dev.get("enrolledAt") as Timestamp | undefined)?.toMillis() ?? 0);
    const resume = String(dev.get("archivePurgedThrough") ?? "");
    const paths = (await store.list("archive/raw/v1/")).filter((p) => /\/\d{4}\/\d{2}\/\d{2}\.ndjson\.gz$/.test(p)).sort();
    let done = true;
    for (const p of paths) {
      const day = p.replace(/^.*v1\/(\d{4})\/(\d{2})\/(\d{2}).*$/, "$1-$2-$3");
      if (day < from || (resume && day <= resume)) continue;
      if (files >= ARCHIVE.maxPurgeFilesPerRun) {
        done = false;
        break;
      }
      const buf = await store.read(p);
      files++;
      if (buf) {
        const lines = gunzipSync(buf).toString("utf8").split("\n").filter(Boolean);
        const kept = lines.filter((l) => {
          try {
            return JSON.parse(l).device !== d;
          } catch {
            return true;
          }
        });
        if (kept.length !== lines.length) await store.save(p, gzipSync(Buffer.from(kept.join("\n") + (kept.length ? "\n" : ""), "utf8")));
      }
      await dev.ref.set({ archivePurgedThrough: day }, { merge: true });
    }
    if (done) {
      await dev.ref.set({ archivePurgePending: false, archivePurgedAt: Timestamp.fromMillis(nowMs), archivePurgedThrough: FieldValue.delete() }, { merge: true });
      purged.push(d);
      logEvent("archive_purge_done", { device: d });
    }
  }
  return purged;
}
