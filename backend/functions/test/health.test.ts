// Runs inside `firebase emulators:exec`, which sets FIREBASE_CONFIG / GCLOUD_PROJECT.
import { strict as assert } from "node:assert";

const PROJECT = process.env.GCLOUD_PROJECT ?? "demo-prosefire";
const BASE = `http://127.0.0.1:5001/${PROJECT}/us-east1/health`;

describe("health function (emulator)", () => {
  it("GET returns ok + version", async () => {
    const r = await fetch(BASE);
    assert.equal(r.status, 200);
    const body = (await r.json()) as { ok: boolean; version: string };
    assert.equal(body.ok, true);
    assert.match(body.version, /^\d+\.\d+\.\d+$/);
    assert.equal(r.headers.get("cache-control"), "no-store");
  });

  it("POST is rejected", async () => {
    const r = await fetch(BASE, { method: "POST" });
    assert.equal(r.status, 405);
  });
});
