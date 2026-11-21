import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LANGS, STRINGS, pickLang } from "./i18n";

describe("i18n", () => {
  const enKeys = Object.keys(STRINGS.en).sort();

  it.each(LANGS)("%s has exactly the same keys as en, all non-empty", (lang) => {
    expect(Object.keys(STRINGS[lang]).sort()).toEqual(enKeys);
    for (const v of Object.values(STRINGS[lang])) expect(v.trim()).not.toBe("");
  });

  it("every data-i18n key in index.html exists", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const used = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const k of used) expect(enKeys).toContain(k);
  });

  it("every page footer includes the safety line, readable even without JavaScript", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    const m = html.match(/<footer>[\s\S]*data-i18n="safety.notSmokeAlarm">([^<]*)<[\s\S]*<\/footer>/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe(STRINGS.en["safety.notSmokeAlarm"]);
  });

  it("picks the browser language, falling back to English", () => {
    expect(pickLang(["es-US", "en"])).toBe("es");
    expect(pickLang(["fr-FR", "en-US"])).toBe("en");
    expect(pickLang(["zh-CN"])).toBe("en");
    expect(pickLang([])).toBe("en");
  });
});
