import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LANGS, STRINGS, pickLang } from "./i18n";

describe("i18n", () => {
  const enKeys = Object.keys(STRINGS.en).sort();

  it.each(LANGS)("%s has exactly the same keys as en, all non-empty", (lang) => {
    expect(Object.keys(STRINGS[lang]).sort()).toEqual(enKeys);
    for (const v of Object.values(STRINGS[lang])) expect(v.trim()).not.toBe("");
  });

  const PAGES = ["index.html", "setup.html", "claim.html"];
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
    for (const f of ["src/setup.ts", "src/claim.ts"]) {
      const used = [...read(f).matchAll(/"((?:setup|claim|census|site|safety)\.[a-zA-Z.]+)"/g)].map((m) => m[1]);
      for (const k of used) expect(enKeys, `${f}: ${k}`).toContain(k);
    }
  });

  it("picks the browser language, falling back to English", () => {
    expect(pickLang(["es-US", "en"])).toBe("es");
    expect(pickLang(["fr-FR", "en-US"])).toBe("en");
    expect(pickLang(["zh-CN"])).toBe("en");
    expect(pickLang([])).toBe("en");
  });
});
