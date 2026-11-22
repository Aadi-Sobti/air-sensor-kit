// Small dependency-free SVG bar chart of hourly EPA-corrected PM2.5, bars colored by AQI category.
import { catForPm } from "./aqiColor";
import { CAT_COLORS } from "./snapshot";

export type HourPoint = [string, number | null]; // ["YYYYMMDDHH" UTC, µg/m³ or null]

function hourToMs(h: string): number {
  return Date.UTC(+h.slice(0, 4), +h.slice(4, 6) - 1, +h.slice(6, 8), +h.slice(8, 10));
}

/** Points for the last `hours` hours ending now, oldest first, with gaps as null. */
export function series(points: HourPoint[], hours: number, nowMs = Date.now()): { t: number; pm: number | null }[] {
  const by = new Map(points.map(([h, v]) => [hourToMs(h), v]));
  const end = Math.floor(nowMs / 3600e3) * 3600e3 - 3600e3; // last finished hour
  const out: { t: number; pm: number | null }[] = [];
  for (let t = end - (hours - 1) * 3600e3; t <= end; t += 3600e3) out.push({ t, pm: by.get(t) ?? null });
  return out;
}

export function renderChart(el: HTMLElement, points: HourPoint[], hours: 24 | 168, lang: string, label: string): void {
  const data = series(points, hours);
  const W = 600, H = 180, pad = 28;
  const max = Math.max(12, ...data.map((d) => d.pm ?? 0)) * 1.1;
  const bw = (W - pad) / data.length;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H + 20}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", label);
  svg.classList.add("chart");
  data.forEach((d, i) => {
    if (d.pm === null) return;
    const h = Math.max(1, (d.pm / max) * H);
    const r = document.createElementNS(ns, "rect");
    r.setAttribute("x", String(pad + i * bw + 0.5));
    r.setAttribute("y", String(H - h));
    r.setAttribute("width", String(Math.max(1, bw - 1)));
    r.setAttribute("height", String(h));
    r.setAttribute("fill", CAT_COLORS[catForPm(d.pm)]);
    const title = document.createElementNS(ns, "title");
    title.textContent = `${new Date(d.t).toLocaleString(lang, { weekday: "short", hour: "numeric" })}: ${d.pm.toFixed(1)} µg/m³`;
    r.append(title);
    svg.append(r);
  });
  const axis = (y: number, text: string) => {
    const t = document.createElementNS(ns, "text");
    t.setAttribute("x", "0");
    t.setAttribute("y", String(y));
    t.setAttribute("font-size", "11");
    t.textContent = text;
    svg.append(t);
  };
  axis(12, String(Math.round(max)));
  axis(H, "0");
  const first = data[0]?.t, last = data[data.length - 1]?.t;
  const fmt = (t: number) => new Date(t).toLocaleString(lang, hours === 24 ? { hour: "numeric" } : { weekday: "short" });
  if (first !== undefined && last !== undefined) {
    const a = document.createElementNS(ns, "text");
    a.setAttribute("x", String(pad));
    a.setAttribute("y", String(H + 16));
    a.setAttribute("font-size", "11");
    a.textContent = fmt(first);
    const b = document.createElementNS(ns, "text");
    b.setAttribute("x", String(W));
    b.setAttribute("y", String(H + 16));
    b.setAttribute("font-size", "11");
    b.setAttribute("text-anchor", "end");
    b.textContent = fmt(last);
    svg.append(a, b);
  }
  el.replaceChildren(svg);
}
