// "/my": check on and manage your sensors with the owner code (no account). Spec: web.md "Owner page";
// decisions #14 (web push), #20 (what it shows/allows). Shows the masked address only.
import "./style.css";

import { renderChart, HourPoint } from "./chart";
import { applyI18n, Key, t } from "./i18n";
import { api, loadSensors, saveSensors, StoredSensor, takeOwnerCodeFromUrl, upsertSensor, wifiLevel } from "./ownerApi";
import { currentSubscription, endpointHash, pushState, registerSw, setupInstallHint, subscribePush } from "./pwa";
import { CAT_COLORS, loadSnapshot, relTime, Snapshot, textOn } from "./snapshot";

const lang = applyI18n();
document.title = t(lang, "my.pageTitle");
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let sensors = loadSensors();
let snapshot: Snapshot | null = null;
let vapidKey = ""; // loaded up front: iOS needs the permission prompt to be the first thing a tap does

function showError(key: Key | null) {
  $("error").hidden = !key;
  $("error").textContent = key ? t(lang, key) : "";
}

async function openWithCode(raw: string): Promise<void> {
  showError(null);
  let r;
  try {
    r = await api("POST", "/session", { code: raw });
  } catch {
    return showError("my.error");
  }
  if (r.status === 429) return showError("my.tooMany");
  if (r.status !== 200) return showError("my.wrongCode");
  sensors = upsertSensor(sensors, { code: String(r.body.code), token: String(r.body.token), name: (r.body.name as string) ?? null });
  saveSensors(sensors);
  $<HTMLInputElement>("code").value = "";
  await renderAll();
}

function q<T extends Element>(root: Element, sel: string): T {
  return root.querySelector(sel) as T;
}

async function renderCard(s: StoredSensor): Promise<HTMLElement> {
  const tpl = $<HTMLTemplateElement>("card").content.firstElementChild!.cloneNode(true) as HTMLElement;
  tpl.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => (el.textContent = t(lang, el.dataset.i18n as Key)));
  const setText = (sel: string, text: string) => (q<HTMLElement>(tpl, sel).textContent = text);
  setText(".s-name", s.name || s.code);
  let r;
  try {
    const ep = await endpointHash(await currentSubscription());
    r = await api("GET", `/sensor${ep ? `?ep=${ep}` : ""}`, undefined, s.token);
  } catch {
    setText(".s-status", t(lang, "my.error"));
    return tpl;
  }
  if (r.status === 401) {
    // Session ended (expired, or the owner code was replaced): ask for the code again.
    setText(".s-status", t(lang, "my.sessionExpired"));
    const forget = q<HTMLElement>(tpl, ".b-forget"); // keep "Remove from this phone" for dead cards
    tpl.querySelector("details")?.replaceWith(forget);
    tpl.querySelector(".chart-tabs")?.remove();
    forget.addEventListener("click", async () => {
      saveSensors(sensors = sensors.filter((x) => x.code !== s.code));
      await renderAll();
    });
    return tpl;
  }
  if (r.status !== 200) {
    setText(".s-status", t(lang, "my.error"));
    return tpl;
  }
  const b = r.body as Record<string, unknown> & { health?: Record<string, unknown> | null; chart?: HourPoint[] };
  s.token = String(b.token);
  s.name = (b.name as string) ?? null;
  saveSensors(sensors = upsertSensor(sensors, s));
  setText(".s-name", s.name || s.code);

  // Status + current AQI from the public snapshot (same numbers as the map).
  const pub = snapshot?.sensors.find((x) => x.code === s.code);
  const lastSeen = b.lastSeen as number | null;
  const online = !!pub?.on || (!!lastSeen && Date.now() / 1000 - lastSeen < 1800);
  setText(".s-status", !lastSeen ? t(lang, "sensor.neverSeen")
    : online ? t(lang, "sensor.working", { ago: relTime(lang, pub?.upd ?? lastSeen) }) : t(lang, "sensor.offline", { ago: relTime(lang, lastSeen) }));
  if (pub && pub.aqi !== null && pub.cat) {
    const a = q<HTMLElement>(tpl, ".s-aqi");
    a.hidden = false;
    a.textContent = `AQI ${pub.aqi} · ${t(lang, `aqi.${pub.cat}` as Key)}`;
    a.style.background = CAT_COLORS[pub.cat];
    a.style.color = textOn(pub.cat);
  }
  q<HTMLElement>(tpl, ".s-fault").hidden = !(b.health && b.health.sensorOk === false);

  // Chart (24 h / 7 d)
  const chartEl = q<HTMLElement>(tpl, ".s-chart");
  const chart = (b.chart ?? []) as HourPoint[];
  const draw = (hours: 24 | 168) => {
    if (!chart.some(([, v]) => v !== null)) chartEl.textContent = t(lang, "my.chartEmpty");
    else renderChart(chartEl, chart, hours, lang, t(lang, "my.chartLabel"));
    q<HTMLElement>(tpl, ".t24").classList.toggle("active", hours === 24);
    q<HTMLElement>(tpl, ".t7d").classList.toggle("active", hours === 168);
  };
  q<HTMLElement>(tpl, ".t24").addEventListener("click", () => draw(24));
  q<HTMLElement>(tpl, ".t7d").addEventListener("click", () => draw(168));
  draw(24);

  // Health
  const health = q<HTMLElement>(tpl, ".s-health");
  const li = (text: string) => { const x = document.createElement("li"); x.textContent = text; health.append(x); };
  const h = b.health ?? {};
  const lvl = wifiLevel(h.rssi as number | null);
  if (lvl) li(t(lang, "my.wifi", { level: t(lang, `my.wifi.${lvl}` as Key) }));
  if (h.fw) li(t(lang, "my.firmware", { v: String(h.fw) }));
  if (typeof h.lastRestart === "number") li(t(lang, "my.restart", { ago: relTime(lang, h.lastRestart) }));
  if (typeof b.uploadSuccess === "number") li(t(lang, "my.uploads", { pct: String(Math.round((b.uploadSuccess as number) * 100)) }));

  // Settings
  const nameIn = q<HTMLInputElement>(tpl, ".f-name");
  nameIn.value = s.name ?? "";
  const fin = q<HTMLInputElement>(tpl, ".f-in"), fout = q<HTMLInputElement>(tpl, ".f-out");
  fin.name = fout.name = `where-${s.code}`;
  (b.indoor ? fin : fout).checked = true;
  q<HTMLFormElement>(tpl, ".s-settings").addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = await api("PATCH", "/sensor", { name: nameIn.value, indoor: fin.checked }, s.token);
    if (u.status === 200) {
      s.token = String(u.body.token);
      s.name = nameIn.value.trim() || null;
      saveSensors(sensors = upsertSensor(sensors, s));
      q<HTMLElement>(tpl, ".s-saved").hidden = false;
      setText(".s-name", s.name || s.code);
    } else showError("my.error");
  });
  setText(".s-addr", b.address ? t(lang, "my.address", { addr: String(b.address) }) : "");
  setText(".s-addr-status", b.addressStatus === "pending" ? t(lang, "my.addressPending")
    : b.addressStatus === "not_found" ? t(lang, "my.addressNotFound") : "");
  q<HTMLFormElement>(tpl, ".s-address").addEventListener("submit", async (e) => {
    e.preventDefault();
    const address = q<HTMLInputElement>(tpl, ".f-address").value.trim();
    const zip = q<HTMLInputElement>(tpl, ".f-zip").value.trim();
    if (address.length < 3) return showError("claim.err.address");
    if (!/^\d{5}$/.test(zip)) return showError("claim.err.zip");
    const u = await api("PATCH", "/sensor", { address, zip }, s.token);
    if (u.status === 200) await renderAll();
    else showError("my.error");
  });

  // Offline notices (web push)
  const nText = q<HTMLElement>(tpl, ".s-notices-text");
  const nBtn = q<HTMLButtonElement>(tpl, ".b-notices");
  const refreshNotices = async () => {
    const st = await pushState();
    const on = st === "on" && !!b.notices;
    nText.textContent = st === "needs_install" ? t(lang, "my.noticesNeedInstall") : st === "blocked" ? t(lang, "my.noticesBlocked")
      : st === "unsupported" ? t(lang, "my.noticesUnsupported") : on ? t(lang, "my.noticesOn") : "";
    nBtn.hidden = st === "needs_install" || st === "blocked" || st === "unsupported";
    nBtn.textContent = t(lang, on ? "my.noticesTurnOff" : "my.noticesTurnOn");
    nBtn.onclick = async () => {
      if (on) {
        const sub = await currentSubscription();
        if (sub) await api("DELETE", "/push", { subscription: sub.toJSON() }, s.token);
        b.notices = false;
      } else {
        const sub = vapidKey ? await subscribePush(vapidKey) : null; // permission prompt first, no awaits before it
        if (sub) {
          const u = await api("POST", "/push", { subscription: sub.toJSON(), lang }, s.token);
          b.notices = u.status === 200;
        }
      }
      await refreshNotices();
    };
  };
  await refreshNotices();

  const pubLink = q<HTMLAnchorElement>(tpl, ".s-public");
  pubLink.href = `/s/${encodeURIComponent(s.code)}`;
  pubLink.textContent = t(lang, "my.publicPage");

  q<HTMLElement>(tpl, ".b-delete").addEventListener("click", async () => {
    if (!confirm(t(lang, "my.deleteConfirm1")) || !confirm(t(lang, "my.deleteConfirm2"))) return; // confirm twice
    const u = await api("DELETE", "/sensor/data", undefined, s.token);
    if (u.status === 200) {
      saveSensors(sensors = sensors.filter((x) => x.code !== s.code));
      alert(t(lang, "my.deleted"));
      await renderAll();
    } else showError("my.error");
  });
  q<HTMLElement>(tpl, ".b-forget").addEventListener("click", async () => {
    saveSensors(sensors = sensors.filter((x) => x.code !== s.code));
    await renderAll();
  });
  return tpl;
}

async function renderAll(): Promise<void> {
  try { snapshot = await loadSnapshot(); } catch { snapshot = null; }
  const box = $("sensors");
  const cards = await Promise.all(sensors.map((s) => renderCard(s)));
  box.replaceChildren(...cards);
  $("add-intro").textContent = t(lang, sensors.length ? "my.addAnother" : "my.enterCode");
}

(async () => {
  void registerSw();
  void api("GET", "/vapid").then((r) => (vapidKey = String(r.body.key ?? ""))).catch(() => undefined);
  setupInstallHint({ box: $("install"), text: $("install-text"), button: $<HTMLButtonElement>("install-btn"),
    dismiss: $<HTMLButtonElement>("install-dismiss"), iosText: t(lang, "pwa.iosHint"), androidText: t(lang, "pwa.androidHint") });
  $("code-form").addEventListener("submit", (e) => {
    e.preventDefault();
    void openWithCode($<HTMLInputElement>("code").value);
  });
  const fromQr = takeOwnerCodeFromUrl(); // "Manage my sensor" QR: /my#owner=<code>
  if (fromQr) await openWithCode(fromQr);
  else await renderAll();
})();
