import { gunzipSync } from "node:zlib";

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { runArchive } from "./archive";
import { handleClaim } from "./claim";
import { handleIngest } from "./ingest";
import { runPublish } from "./publish";

// One region for everything; near NYC users. Keep in sync with firebase.json hosting rewrites.
setGlobalOptions({ region: "us-east1", maxInstances: 10 });
initializeApp();

export const FUNCTIONS_VERSION = "0.1.0";

/** Liveness check: GET /api/v1/health -> {"ok":true}. No data, no secrets. */
export const health = onRequest((req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, service: "prosefire", version: FUNCTIONS_VERSION });
});

/**
 * Sensor uploads. Smallest instance (cost table, docs/COSTS.md): fractional vCPU needs concurrency 1.
 * Kept lean: no geocoding or forwarding inline (cold starts; device timeout >= 15 s).
 */
export const ingest = onRequest(
  { cpu: "gcf_gen1", memory: "256MiB", concurrency: 1, maxInstances: 20, timeoutSeconds: 30 },
  async (req, res) => {
    const out = await handleIngest(getFirestore(), {
      method: req.method,
      headers: req.headers as Record<string, string | string[] | undefined>,
      rawBody: req.rawBody,
    });
    res.set("Cache-Control", "no-store");
    res.status(out.status).json(out.body);
  },
);

/** Computer-setup claim (from the /claim page). Same-origin only via the Hosting rewrite; no CORS. */
export const claim = onRequest({ memory: "256MiB", maxInstances: 5, timeoutSeconds: 30 }, async (req, res) => {
  const out = await handleClaim(getFirestore(), req.method, req.rawBody);
  res.set("Cache-Control", "no-store");
  res.status(out.status).json(out.body);
});

/** Every 5 min: place new sensors on the map (public cell), hourly rollup + NowCast, public snapshot. */
export const publish = onSchedule({ schedule: "every 5 minutes", memory: "256MiB", timeoutSeconds: 240, maxInstances: 1 },
  async () => {
    await runPublish(getFirestore());
  });

/** GET /api/v1/snapshot.json : the public map data (CDN-cached; never exact locations). */
export const snapshot = onRequest({ memory: "256MiB", maxInstances: 10 }, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false });
    return;
  }
  const doc = await getFirestore().doc("public/snapshot").get();
  res.set("Cache-Control", "public, max-age=60, s-maxage=120"); // keeps "on the map in ~10 min"
  res.set("Content-Type", "application/json; charset=utf-8");
  const gz = doc.exists ? (doc.get("gz") as Buffer | undefined) : undefined;
  res.status(200).send(gz ? gunzipSync(gz).toString("utf8") : JSON.stringify({ v: 2, generated: 0, sensors: [] }));
});

/** Nightly: raw readings of each finished UTC day -> gzipped NDJSON in the private Storage bucket (kept forever). */
export const archive = onSchedule({ schedule: "30 3 * * *", timeZone: "UTC", memory: "512MiB", timeoutSeconds: 540, maxInstances: 1 },
  async () => {
    const bucket = getStorage().bucket();
    await runArchive(getFirestore(), async (path, data) => {
      await bucket.file(path).save(data, { contentType: "application/x-ndjson", metadata: { contentEncoding: "gzip" }, resumable: false });
    });
  });
