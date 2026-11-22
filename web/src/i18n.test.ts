import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LANGS, STRINGS, pickLang } from "./i18n";

describe("i18n", () => {
  const enKeys = Object.keys(STRINGS.en).sort();

  it.each(LANGS)("%s has exactly the same keys as en, all non-empty", (lang) => {
    expect(Object.keys(STRINGS[lang]).sort()).toEqual(enKeys);
    for (const v of Object.values(STRINGS[lang])) expect(v.trim()).not.toBe("");
  });

  const PAGES = ["index.html", "setup.html", "claim.html", "s.html", "my.html"];
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

  it.each(PAGES)("every data-i18n key in %s exists", (page) => {
    const used = [...read(page).matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const k of used) expect(enKeys).toContain(k);
  });

  it.each(PAGES)("%s footer has the safety line, readable even without JavaScript", (page) => {
    const m = read(page).match(/<footer>[\s\S]*data-i18n="safety.notSmokeAlarm">([^<]*)<[\s\S]*<\/footer>/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(STRINGS.en["safety.notSmokeAlarm"]);
  });

  it("every t() key used in the scripts exists", () => {
    for (const f of ["src/setup.ts", "src/claim.ts", "src/map.ts", "src/sensor.ts", "src/my.ts"]) {
      const used = [...read(f).matchAll(/"((?:setup|claim|census|site|safety|map|sensor|aqi|my|pwa|share)\.[a-zA-Z_.]+)"/g)].map((m) => m[1]);
      for (const k of used) expect(enKeys, `${f}: ${k}`).toContain(k);
    }
  });

  it("has a name for every AQI category in every language", () => {
    for (const k of ["good", "moderate", "usg", "unhealthy", "very_unhealthy", "hazardous"]) expect(enKeys).toContain(`aqi.${k}`);
  });

  it("picks the browser language, falling back to English", () => {
    expect(pickLang(["es-US", "en"])).toBe("es");
    expect(pickLang(["fr-FR", "en-US"])).toBe("en");
    expect(pickLang(["zh-CN"])).toBe("en");
    expect(pickLang([])).toBe("en");
  });
});

import { toGeoJson } from "./snapshot";

describe("map data privacy", () => {
  it("puts only placed outdoor sensors on the map (indoor and unplaced have no location)", () => {
    const g = toGeoJson({ v: 2, generated: 1, correction: "x", sensors: [
      { code: "AAAAAA", c: [40.7, -74.0], in: 0, pl: 1, pm: 5, nc: null, aqi: 21, cat: "good", upd: 1, on: 1 },
      { code: "BBBBBB", c: null, in: 1, pm: 5, nc: null, aqi: 21, cat: "good", upd: 1, on: 1 },
      { code: "CCCCCC", c: null, in: 0, pl: 0, pm: 5, nc: null, aqi: 21, cat: "good", upd: 1, on: 1 },
      { code: "DDDDDD", c: [40.6, -73.9], in: 1, pm: 5, nc: null, aqi: 21, cat: "good", upd: 1, on: 1 },
    ] });
    expect(g.features.map((f) => f.properties.code)).toEqual(["AAAAAA"]);
    expect(g.features[0].geometry.coordinates).toEqual([-74.0, 40.7]); // GeoJSON is [lng, lat]
  });
});
