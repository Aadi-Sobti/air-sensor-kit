import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";

// One region for everything; near NYC users. Keep in sync with firebase.json hosting rewrites.
setGlobalOptions({ region: "us-east1", maxInstances: 10 });

export const FUNCTIONS_VERSION = "0.0.1";

/** Liveness check: GET /api/v1/health -> {"ok":true}. No data, no secrets. */
export const health = onRequest((req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  res.set("Cache-Control", "no-store");
  res.json({ ok: true, service: "prosefire", version: FUNCTIONS_VERSION });
});
