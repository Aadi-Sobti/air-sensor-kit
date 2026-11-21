import { pickLang, t, type Key } from "./i18n";

const lang = pickLang(navigator.languages ?? [navigator.language]);
document.documentElement.lang = lang;
document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
  el.textContent = t(lang, el.dataset.i18n as Key);
});
