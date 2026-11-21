// /setup : computer setup over USB (primary path). Spec: web.md "Setup page"; USER_FLOW.md Part 2A.
import "./style.css";
import { applyI18n, Key, t } from "./i18n";
import { claimPathFromRedirect, ImprovClient, Network } from "./improvClient";
import { SerialTransport, USB_FILTERS } from "./serialTransport";

const lang = applyI18n();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => ($(id).hidden = !on);
const STEPS = ["unsupported", "step-connect", "step-wifi", "step-done", "busy"];

function only(...ids: string[]) {
  STEPS.forEach((s) => show(s, ids.includes(s)));
}
function setError(key: Key | null) {
  show("error", !!key);
  $("error").textContent = key ? t(lang, key) : "";
}
function busy(key: Key) {
  only("busy");
  $("busy").textContent = t(lang, key);
}

let transport: SerialTransport | null = null;
let client: ImprovClient | null = null;

async function closePort() {
  const tr = transport;
  transport = null;
  client = null;
  await tr?.close();
}
window.addEventListener("pagehide", () => void closePort());

function bars(rssi: number) {
  const n = Math.max(1, Math.min(4, Math.floor((rssi + 100) / 12)));
  return "▂▄▆█".slice(0, n);
}

function renderNetworks(nets: Network[]) {
  const box = $("networks");
  box.replaceChildren();
  nets.forEach((n, i) => {
    const label = document.createElement("label");
    label.className = "choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "net";
    input.value = n.ssid;
    if (i === 0) input.checked = true;
    const name = document.createElement("span");
    name.textContent = n.ssid; // textContent: SSIDs are untrusted text
    const b = document.createElement("span");
    b.className = "bars";
    b.textContent = bars(n.rssi);
    label.append(input, name, b);
    if (!n.secure) {
      const o = document.createElement("span");
      o.className = "hint";
      o.textContent = `(${t(lang, "setup.wifi.open")})`;
      label.append(o);
    }
    box.append(label);
  });
  if (!nets.length) {
    (document.querySelector('input[value="__other__"]') as HTMLInputElement).checked = true;
    show("other");
  }
}

async function connect() {
  setError(null);
  show("retry", false);
  let port: SerialPort;
  try {
    port = await navigator.serial!.requestPort({ filters: USB_FILTERS });
  } catch {
    // Cancelled, or nothing to pick (charge-only cable, missing driver, port held elsewhere).
    only("step-connect");
    setError("setup.err.emptyPicker");
    return;
  }
  busy("setup.connecting");
  transport = new SerialTransport(port);
  try {
    await transport.open();
  } catch {
    await closePort();
    only("step-connect");
    setError("setup.err.busy");
    return;
  }
  client = new ImprovClient(transport);
  const info = await client.getInfo();
  if (!info) {
    await closePort();
    only("step-connect");
    setError("setup.err.noAnswer");
    return;
  }
  busy("setup.wifi.scanning");
  let nets: Network[] = [];
  try {
    nets = await client.scan();
  } catch {
    nets = [];
  }
  renderNetworks(nets);
  only("step-wifi");
  if (!nets.length) setError("setup.err.noNetworks");
  $<HTMLInputElement>("password").focus();
}

async function submitWifi(ev: Event) {
  ev.preventDefault();
  if (!client) return;
  const picked = (document.querySelector('input[name="net"]:checked') as HTMLInputElement | null)?.value ?? "__other__";
  const ssid = picked === "__other__" ? $<HTMLInputElement>("ssid").value.trim() : picked;
  if (!ssid) {
    setError("setup.err.needName");
    return;
  }
  const pass = $<HTMLInputElement>("password");
  setError(null);
  busy("setup.testing");
  const r = await client.sendWifi(ssid, pass.value);
  if (!r.ok) {
    only("step-wifi");
    setError(r.reason === "timeout" ? "setup.err.timeout" : "setup.err.badPassword");
    pass.select();
    return;
  }
  pass.value = "";
  only("step-done");
  await closePort(); // always release the port before leaving
  const next = claimPathFromRedirect(r.redirect);
  setTimeout(() => location.assign(next ?? "/"), 1500);
}

function init() {
  if (!("serial" in navigator) || !navigator.serial) {
    only("unsupported"); // Safari, Firefox, iPhone/iPad: phone path, no dead end
    return;
  }
  only("step-connect");
  $("connect").addEventListener("click", () => void connect());
  $("retry").addEventListener("click", () => void connect());
  $("wifi-form").addEventListener("submit", (e) => void submitWifi(e));
  $("show").addEventListener("change", (e) => {
    $<HTMLInputElement>("password").type = (e.target as HTMLInputElement).checked ? "text" : "password";
  });
  document.querySelectorAll('input[name="net"]').forEach(() => undefined);
  $("step-wifi").addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name === "net") show("other", el.value === "__other__");
  });
}

init();
