// "/s/<CODE>" : one sensor's public page (current AQI, corrected PM2.5, online/offline). Charts come in M7b.
import "./style.css";

import { HourPoint, renderChart } from "./chart";
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
  $("unplaced").hidden = !!s.in || s.pl !== 0;
  $("nowcast-note").textContent = t(lang, s.nc !== null ? "sensor.nowcast" : "sensor.latestOnly");
  if (s.on && s.aqi !== null && s.cat) {
    $("reading").hidden = false;
    $("aqi").textContent = String(s.aqi);
    $("aqi-cat").textContent = t(lang, `aqi.${s.cat}` as Key);
    const box = $("aqi-box");
    box.style.background = CAT_COLORS[s.cat];
    box.style.color = textOn(s.cat);
    $("pm").textContent = s.pm !== null ? t(lang, "sensor.pm", { value: s.pm.toFixed(1) }) : "";
  }
  const seen = s.seen ?? s.upd;
  $("status").textContent = !seen ? t(lang, "sensor.neverSeen")
    : !s.on ? t(lang, "sensor.offline", { ago: relTime(lang, seen) })
    : s.pm === null ? t(lang, "sensor.noFreshReading") // uploading, but the dust sensor isn't answering
    : t(lang, "sensor.working", { ago: relTime(lang, s.upd ?? seen) });
  // 24 h / 7 d chart from the public history (no location in it)
  try {
    const r = await fetch(`/api/v1/sensor/${encodeURIComponent(code)}/history`);
    const h = r.ok ? ((await r.json()).h as HourPoint[]) : [];
    if (h.some(([, v]) => v !== null)) {
      $("tabs").hidden = false;
      const draw = (hours: 24 | 168) => {
        renderChart($("chart"), h, hours, lang, t(lang, "my.chartLabel"));
        $("t24").classList.toggle("active", hours === 24);
        $("t7d").classList.toggle("active", hours === 168);
      };
      $("t24").onclick = () => draw(24);
      $("t7d").onclick = () => draw(168);
      draw(24);
    }
  } catch { /* chart is optional */ }
})();
