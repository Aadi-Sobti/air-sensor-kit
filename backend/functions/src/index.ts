import { gunzipSync } from "node:zlib";

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineBoolean, defineSecret } from "firebase-functions/params";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { getFunctions } from "firebase-admin/functions";
import webpush from "web-push";

import { runArchive, runArchivePurge } from "./archive";
import { clientIp, handleOwner, sensorHistory } from "./owner/api";
import { PushSender } from "./publish";
import { handleClaim } from "./claim";
import { forwardOne, ScTask } from "./forward";
import { handleIngest } from "./ingest";
import { defaultDeps, runPublish } from "./publish";

// One region for everything; near NYC users. Keep in sync with firebase.json hosting rewrites.
setGlobalOptions({ region: "us-east1", maxInstances: 10 });
initializeApp();

// Secrets (Google Secret Manager; founder decision 2026-11-21). Never logged.
const OWNER_PEPPER = defineSecret("OWNER_PEPPER"); // keyed hash for owner codes + session signing
const VAPID_PUBLIC = defineSecret("VAPID_PUBLIC"); // web push (not secret, but kept with its private half)
const VAPID_PRIVATE = defineSecret("VAPID_PRIVATE");
// Sensor.Community forwarding (M8): OFF until the founder confirms with Sensor.Community (backend.md).
// Set in functions/.env.<project>; each sensor must also have devices.scRegistered = true.
const SC_FORWARD_ENABLED = defineBoolean("SC_FORWARD_ENABLED", { default: false });

function pushSender(): PushSender | undefined {
  try {
    webpush.setVapidDetails("https://github.com/Aadi-Sobti/air-sensor-kit", VAPID_PUBLIC.value(), VAPID_PRIVATE.value());
  } catch {
    return undefined; // bad/missing keys must never stop the map update; notices are skipped
  }
  return async (sub, payload) => {
    try {
      await webpush.sendNotification(sub, payload, { TTL: 6 * 3600, timeout: 5000 });
      return { gone: false };
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) return { gone: true };
      throw e;
    }
  };
}

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
    const enabled = SC_FORWARD_ENABLED.value();
    const out = await handleIngest(getFirestore(), {
      method: req.method,
      headers: req.headers as Record<string, string | string[] | undefined>,
      rawBody: req.rawBody,
    }, Date.now(), enabled ? {
      scEnabled: true,
      enqueueSc: async (task) => {
        await getFunctions().taskQueue("locations/us-east1/functions/forwardSensorCommunity").enqueue(task, { dispatchDeadlineSeconds: 60 });
      },
    } : {});
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
export const publish = onSchedule({ schedule: "every 5 minutes", memory: "256MiB", timeoutSeconds: 240, maxInstances: 1,
  secrets: [VAPID_PUBLIC, VAPID_PRIVATE] },
  async () => {
    await runPublish(getFirestore(), { ...defaultDeps, push: pushSender() });
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
    const store = {
      // Stored as plain gzip bytes (no Content-Encoding), read back raw (decompress: false) for the purge.
      save: async (path: string, data: Buffer) => {
        await bucket.file(path).save(data, { contentType: "application/gzip", resumable: false });
      },
      read: async (path: string) => {
        const f = bucket.file(path);
        return (await f.exists())[0] ? (await f.download({ decompress: false }))[0] : null;
      },
      list: async (prefix: string) => (await bucket.getFiles({ prefix }))[0].map((f) => f.name),
    };
    await runArchive(getFirestore(), store.save);
    await runArchivePurge(getFirestore(), store); // "Delete my data" also removes archived raw readings
  });

/** Owner API: /api/v1/owner/** (sessions from owner codes; no accounts). */
export const owner = onRequest({ memory: "256MiB", maxInstances: 10, secrets: [OWNER_PEPPER, VAPID_PUBLIC] }, async (req, res) => {
  const out = await handleOwner(getFirestore(), { pepper: OWNER_PEPPER.value(), vapidPublic: VAPID_PUBLIC.value() }, {
    method: req.method, path: req.path, headers: req.headers as Record<string, string | string[] | undefined>,
    rawBody: req.rawBody, ip: clientIp(req.headers as Record<string, string | string[] | undefined>, req.ip),
    query: req.query as Record<string, unknown>,
  });
  res.set("Cache-Control", "no-store");
  res.status(out.status).json(out.body);
});

/** GET /api/v1/sensor/<CODE>/history : public hourly history for the sensor page chart (no location). */
export const history = onRequest({ memory: "256MiB", maxInstances: 10 }, async (req, res) => {
  const code = (req.path.match(/\/sensor\/([A-Za-z0-9]{4,12})\/history$/)?.[1] ?? "").toUpperCase();
  const out = await sensorHistory(getFirestore(), code);
  res.set("Cache-Control", out.status === 200 ? "public, max-age=120, s-maxage=300" : "no-store");
  res.status(out.status).json(out.body);
});

/** Task queue worker: one reading -> Sensor.Community, with retries/backoff (never inline in ingest). */
export const forwardSensorCommunity = onTaskDispatched<ScTask>({
  // Retries only for 5xx/429, and only while the reading is still fresh (Sensor.Community stamps arrival time).
  retryConfig: { maxAttempts: 4, minBackoffSeconds: 20, maxBackoffSeconds: 120, maxRetrySeconds: 300 },
  rateLimits: { maxConcurrentDispatches: 10, maxDispatchesPerSecond: 5 },
  memory: "256MiB",
}, async (req) => {
  await forwardOne(req.data); // throws RetryableError on 5xx/429/network -> the queue retries with backoff
});
