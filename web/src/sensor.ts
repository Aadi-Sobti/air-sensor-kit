// "/s/<CODE>" : one sensor's public page (current AQI, corrected PM2.5, online/offline). Charts come in M7b.
import "./style.css";

import { applyI18n, Key, t } from "./i18n";
import { CAT_COLORS, loadSnapshot, relTime, textOn } from "./snapshot";

const lang = applyI18n();
const code = decodeURIComponent(location.pathname.replace(/^\/s\//, "").replace(/\/$/, "")).toUpperCase();
document.title = t(lang, "sensor.pageTitle", { code });
const $ = (id: string) => document.getElementById(id)!;
$("title").textContent = t(lang, "sensor.title", { code });

function err(key: Key) {
  $("error").textContent = t(lang, key);
  $("error").hidden = false;
}

(async () => {
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return err("sensor.notFound");
  let snap;
  try {
    snap = await loadSnapshot();
  } catch {
    return err("map.loadError");
  }
  const s = snap.sensors.find((x) => x.code === code);
  if (!s) return err("sensor.notFound");
  $("indoor").hidden = !s.in;
  if (s.on && s.aqi !== null && s.cat) {
    $("reading").hidden = false;
    $("aqi").textContent = String(s.aqi);
    $("aqi-cat").textContent = t(lang, `aqi.${s.cat}` as Key);
    const box = $("aqi-box");
    box.style.background = CAT_COLORS[s.cat];
    box.style.color = textOn(s.cat);
    $("pm").textContent = s.pm !== null ? t(lang, "sensor.pm", { value: s.pm.toFixed(1) }) : "";
  }
  $("status").textContent = !s.upd ? t(lang, "sensor.neverSeen")
    : t(lang, s.on ? "sensor.working" : "sensor.offline", { ago: relTime(lang, s.upd) });
})();
