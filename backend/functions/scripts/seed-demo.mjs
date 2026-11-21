// Local demo data for the emulator only (fake sensors around NYC; no real people). Usage:
//   (cd backend && npm --prefix functions run build && firebase emulators:start ...) then
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node backend/functions/scripts/seed-demo.mjs
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { runPublish } from "../lib/publish.js";
initializeApp({ projectId: "demo-prosefire" });
const db = getFirestore();
const now = Date.now();
const key = (ms) => new Date(ms).toISOString().replace(/[-T:]/g, "").slice(0, 10);
const spots = [[40.7128,-74.006,6],[40.7306,-73.9866,14],[40.758,-73.9855,28],[40.6782,-73.9442,45],[40.7484,-73.9857,70],
  [40.8075,-73.9626,9],[40.6501,-73.9496,120],[40.7282,-73.7949,250],[40.8448,-73.8648,18],[40.5795,-74.1502,3]];
let i = 0;
for (const [lat, lng, pm] of spots) {
  const id = `esp8266-${900000 + i++}`;
  await db.doc(`devices/${id}`).set({ status: "active", indoor: false, publicCellPending: true });
  await db.doc(`private_locations/${id}`).set({ address: "demo", zip: "10001", lat, lng });
  const seen = i === 9 ? now - 3 * 3600e3 : now - 60e3; // one offline sensor
  await db.doc(`readings_hourly/${id}_${key(now)}`).set({ deviceId: id, lastSeen: Timestamp.fromMillis(seen), latest: { ts: Math.floor(seen/1000), pm25: pm, pm25a: pm } });
}
const fakeNws = async (u) => ({ ok: !u.includes("/points/"), json: async () => ({ properties: { relativeHumidity: { value: 55 } } }) });
const snap = await runPublish(db, { geocode: async () => ({ kind: "unavailable" }), nws: fakeNws }, now);
console.log("demo sensors:", snap.sensors.length, snap.sensors.map((s) => `${s.code}:${s.aqi ?? "off"}`).join(" "));
