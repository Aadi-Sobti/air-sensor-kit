// Pure math: corrections, AQI, NowCast, H3, short codes, NWS parsing (no emulator needed).
import { strict as assert } from "node:assert";

import { aqiFromPm25, category, nowcast, truncate1 } from "../src/lib/aqi";
import { publicCell } from "../src/lib/cells";
import { epaCorrect } from "../src/lib/correction";
import { latestRh, nearestStation, NWS_USER_AGENT } from "../src/lib/rh";
import { fallbackShortCode, shortCodeFor } from "../src/lib/shortcode";

const close = (a: number, b: number, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

describe("EPA correction (Barkjohn 2021 Eq. 10 + 2022 Eqs. 1-3)", () => {
  it("matches the 2021 US-wide equation in the normal range", () => {
    close(epaCorrect(10, 50), 0.524 * 10 - 0.0862 * 50 + 5.75); // 6.68
    close(epaCorrect(100, 30), 52.4 - 2.586 + 5.75);
    close(epaCorrect(20, null), epaCorrect(20, 50)); // missing RH -> 50 % (2021 paper)
    close(epaCorrect(20, 150), epaCorrect(20, 50)); // impossible RH -> 50 %
  });
  it("hits the paper's transition checkpoints (PA 570 -> ~300 at 50 % RH; PA 611 -> ~400)", () => {
    close(epaCorrect(569.99, 50), 300.12, 0.1); // Eq. (1) just below 570
    close(epaCorrect(611, 50), 400.12, 0.1); // Eq. (3), no RH term
    close(epaCorrect(611, 10), epaCorrect(611, 90), 1e-9);
  });
  it("blends continuously through 570-611 (no jumps)", () => {
    let prev = epaCorrect(560, 50);
    for (let pa = 561; pa <= 620; pa += 1) {
      const v = epaCorrect(pa, 50);
      assert.ok(v - prev < 6 && v >= prev - 0.5, `jump at ${pa}: ${prev} -> ${v}`);
      prev = v;
    }
    close(epaCorrect(570, 50), epaCorrect(569.999, 50), 0.6); // w(570) = 0.008: nearly Eq. (1)
  });
  it("never goes negative", () => {
    assert.equal(epaCorrect(0, 100), 0);
    assert.equal(epaCorrect(-5, 50), epaCorrect(0, 50));
  });
});

describe("AQI (EPA TAD May 2026, Table 6 + Eq. 1)", () => {
  it("reproduces the TAD worked example: PM2.5 35.9 -> 102", () => {
    assert.equal(aqiFromPm25(35.9), 102);
  });
  it("maps every breakpoint edge correctly", () => {
    const cases: [number, number][] = [[0, 0], [9.0, 50], [9.1, 51], [35.4, 100], [35.5, 101], [55.4, 150], [55.5, 151],
      [125.4, 200], [125.5, 201], [225.4, 300], [225.5, 301], [325.4, 500]];
    for (const [c, a] of cases) assert.equal(aqiFromPm25(c), a, `${c}`);
  });
  it("truncates (not rounds) to 1 decimal before the lookup", () => {
    assert.equal(truncate1(9.09), 9.0);
    assert.equal(aqiFromPm25(9.09), 50);
    assert.equal(aqiFromPm25(35.49), 100);
  });
  it("goes beyond 500 on the top segment", () => {
    assert.ok(aqiFromPm25(400) > 500);
  });
  it("names categories with EPA colors", () => {
    assert.equal(category(50).name, "Good");
    assert.equal(category(51).name, "Moderate");
    assert.equal(category(102).key, "usg");
    assert.equal(category(301).name, "Hazardous");
  });
});

describe("NowCast (EPA TAD p. 16)", () => {
  it("equals the value when air is steady", () => {
    assert.equal(nowcast(Array(12).fill(12.3)), 12.3);
  });
  it("uses weight 0.5 (≈ 3-hour average) when air changes fast", () => {
    const h = [60, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10];
    // w = 1 - 50/60 < 0.5 -> 0.5; NowCast = sum(v * 0.5^i) / sum(0.5^i)
    const num = 60 + 10 * (1 - Math.pow(0.5, 12)) / (1 - 0.5) - 10;
    const den = (1 - Math.pow(0.5, 12)) / (1 - 0.5);
    assert.equal(nowcast(h), truncate1(num / den));
  });
  it("needs 2 of the last 3 hours", () => {
    assert.equal(nowcast([null, null, 10, 10, 10]), null);
    assert.notEqual(nowcast([10, null, 10]), null);
    assert.equal(nowcast([]), null);
  });
  it("skips missing hours in both sums", () => {
    assert.equal(nowcast([20, null, 20, 20]), 20);
  });
});

describe("public cells (H3 res 9)", () => {
  it("rounds an address to its cell center and never returns the input point", () => {
    const { cell, center } = publicCell(40.8075, -73.9626);
    assert.equal(cell, "892a1008c2bffff");
    assert.notDeepEqual(center, [40.8075, -73.9626]);
    assert.ok(Math.abs(center[0] - 40.8075) < 0.005 && Math.abs(center[1] + 73.9626) < 0.005);
    assert.deepEqual(publicCell(center[0], center[1]).cell, cell); // stable
  });
});

describe("short codes", () => {
  it("match the firmware's fallback codes (portal.cpp fallbackShortCode)", () => {
    assert.equal(fallbackShortCode(11001626), "FDK7NA");
    assert.equal(fallbackShortCode(0), "AAAAAA");
    assert.equal(fallbackShortCode(4294967295), "D38WA5");
    assert.equal(shortCodeFor("esp8266-11001626"), "FDK7NA");
    assert.equal(shortCodeFor("esp8266-11001626", "K7Q2MX"), "K7Q2MX");
  });
});

describe("NWS humidity client", () => {
  const fake = (routes: Record<string, unknown>) => async (url: string) => {
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    return { ok: !!hit, json: async () => hit?.[1] };
  };
  it("finds the nearest station and reads RH", async () => {
    const f = fake({
      "/points/": { properties: { observationStations: "https://api.weather.gov/gridpoints/OKX/33,37/stations" } },
      "/stations?": {}, "/gridpoints/": { features: [{ properties: { stationIdentifier: "KNYC" } }] },
      "/observations/latest": { properties: { relativeHumidity: { unitCode: "wmoUnit:percent", value: 63.2 } } },
    });
    assert.equal(await nearestStation(40.78, -73.97, f), "KNYC");
    assert.equal(await latestRh("KNYC", f), 63.2);
  });
  it("returns null on missing/invalid data and identifies itself without personal info", async () => {
    assert.equal(await latestRh("X", fake({ "/observations/latest": { properties: { relativeHumidity: { value: null } } } })), null);
    assert.equal(await nearestStation(0, 0, fake({})), null);
    assert.ok(NWS_USER_AGENT.includes("github.com") && !/@/.test(NWS_USER_AGENT));
  });
});
