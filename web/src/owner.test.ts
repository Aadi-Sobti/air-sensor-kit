import { describe, expect, it } from "vitest";

import { catForPm } from "./aqiColor";
import { series } from "./chart";
import { ImprovClient, Transport } from "./improvClient";
import { takeOwnerCodeFromUrl, upsertSensor, wifiLevel } from "./ownerApi";

describe("owner page helpers", () => {
  it("takes the owner code from the QR fragment and removes it from the address bar", () => {
    let replaced = "";
    const loc = { hash: "#owner=7KQ2-MX4P-R9", pathname: "/my" } as Location;
    const hist = { replaceState: (_a: unknown, _b: string, url: string) => (replaced = url) } as unknown as History;
    expect(takeOwnerCodeFromUrl(loc, hist)).toBe("7KQ2-MX4P-R9");
    expect(replaced).toBe("/my");
    expect(takeOwnerCodeFromUrl({ hash: "", pathname: "/my" } as Location, hist)).toBeNull();
  });
  it("keeps one entry per sensor", () => {
    const l = upsertSensor([{ code: "A", token: "1" }, { code: "B", token: "2" }], { code: "A", token: "3" });
    expect(l).toEqual([{ code: "B", token: "2" }, { code: "A", token: "3" }]);
  });
  it("WiFi signal words", () => {
    expect(wifiLevel(-50)).toBe("strong");
    expect(wifiLevel(-70)).toBe("ok");
    expect(wifiLevel(-80)).toBe("weak");
    expect(wifiLevel(null)).toBeNull();
  });
  it("chart colors use the same AQI breakpoints as the backend", () => {
    expect(catForPm(9.0)).toBe("good");
    expect(catForPm(9.05)).toBe("good"); // truncated to 9.0
    expect(catForPm(9.1)).toBe("moderate");
    expect(catForPm(35.5)).toBe("usg");
    expect(catForPm(125.5)).toBe("very_unhealthy");
    expect(catForPm(300)).toBe("hazardous");
  });
  it("chart series fills gaps for the last N finished hours", () => {
    const now = Date.UTC(2026, 10, 22, 14, 30);
    const s = series([["2026112213", 5], ["2026112211", 7]], 3, now);
    expect(s.map((p) => p.pm)).toEqual([7, null, 5]);
  });
  it("reads the sensor's one-time claim reply (and ignores binary/log noise)", async () => {
    const enc = new TextEncoder();
    let sent = "";
    const chunks = [enc.encode("[hb] up\n"), Uint8Array.from([0x49, 0x4d, 0x0a, 0xff]), enc.encode("[claim] d=esp8266-42 t=" + "ab".repeat(16) + "\n")];
    const t: Transport = {
      async write(b) { sent += new TextDecoder().decode(b); },
      async read() { await new Promise((r) => setTimeout(r, 5)); return chunks.shift() ?? null; },
    };
    const c = new ImprovClient(t);
    const r = await c.freshClaim(1000);
    expect(sent).toContain("PFCMD NEWCLAIM");
    expect(r).toEqual({ d: "esp8266-42", t: "ab".repeat(16) });
  });
});
