import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";

import { handleIngest } from "./ingest";

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
