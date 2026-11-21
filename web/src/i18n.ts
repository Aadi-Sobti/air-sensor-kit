// Every user-facing string lives here (EN + ES from day one). No hard-coded strings in pages.
// Wording source of truth: docs/USER_FLOW.md.
export const LANGS = ["en", "es"] as const;
export type Lang = (typeof LANGS)[number];

export const STRINGS = {
  en: {
    "site.title": "ProseFire air sensors",
    "site.comingSoon": "Our community air map is coming soon.",
    "safety.notSmokeAlarm":
      "This is not a smoke alarm. It does not replace official warnings or evacuation orders.",
  },
  es: {
    "site.title": "Sensores de aire ProseFire",
    "site.comingSoon": "Nuestro mapa comunitario del aire llegará pronto.",
    "safety.notSmokeAlarm":
      "Esto no es una alarma de humo. No reemplaza los avisos oficiales ni las órdenes de evacuación.",
  },
} as const satisfies Record<Lang, Record<string, string>>;

export type Key = keyof (typeof STRINGS)["en"];

export function pickLang(navLangs: readonly string[]): Lang {
  for (const l of navLangs) {
    const base = l.toLowerCase().split("-")[0];
    if ((LANGS as readonly string[]).includes(base)) return base as Lang;
  }
  return "en";
}

export function t(lang: Lang, key: Key): string {
  return STRINGS[lang][key] ?? STRINGS.en[key];
}
