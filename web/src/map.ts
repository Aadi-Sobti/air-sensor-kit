// "/" : public map. MapLibre + self-hosted PMTiles basemap (decision #9) + the public snapshot.
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";

import { layers, namedFlavor } from "@protomaps/basemaps";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

import { applyI18n, Key, t } from "./i18n";
import { CAT_COLORS, CAT_ORDER, CatKey, loadSnapshot, OFFLINE_COLOR, relTime, textOn, toGeoJson } from "./snapshot";

const lang = applyI18n();
document.title = t(lang, "map.pageTitle");

// Legend
const legend = document.getElementById("legend")!;
for (const k of CAT_ORDER) {
  const row = document.createElement("span");
  row.className = "legend-item";
  const sw = document.createElement("span");
  sw.className = "swatch";
  sw.style.background = CAT_COLORS[k];
  row.append(sw, document.createTextNode(t(lang, `aqi.${k}` as Key)));
  legend.append(row);
}
const off = document.createElement("span");
off.className = "legend-item";
const offSw = document.createElement("span");
offSw.className = "swatch";
offSw.style.background = OFFLINE_COLOR;
off.append(offSw, document.createTextNode(t(lang, "map.offline")));
legend.append(off);

const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);
const origin = location.origin;
const map = new maplibregl.Map({
  container: "map",
  center: [-73.95, 40.72],
  zoom: 10.3,
  minZoom: 9,
  maxZoom: 16,
  maxBounds: [[-74.6, 40.3], [-73.3, 41.1]],
  attributionControl: { compact: true },
  style: {
    version: 8,
    glyphs: `${origin}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${origin}/tiles/nyc.pmtiles`,
        // OpenStreetMap data is ODbL: attribution is required.
        attribution: '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    // No sprite sheet: drop the few icon layers so everything stays self-hosted.
    layers: layers("protomaps", namedFlavor("light"), { lang: lang === "es" ? "es" : "en" })
      .filter((l) => !((l as { layout?: Record<string, unknown> }).layout?.["icon-image"])),
  },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }));

function showError(key: Key) {
  const e = document.getElementById("error")!;
  e.textContent = t(lang, key);
  e.hidden = false;
}

map.on("load", async () => {
  let snap;
  try {
    snap = await loadSnapshot();
  } catch {
    showError("map.loadError");
    return;
  }
  const upd = document.getElementById("updated")!;
  upd.textContent = snap.generated ? t(lang, "map.updated", { time: relTime(lang, snap.generated) }) : "";
  const data = toGeoJson(snap);
  document.getElementById("empty")!.hidden = data.features.length > 0; // a note, not an error
  map.addSource("sensors", { type: "geojson", data });
  const color: unknown[] = ["match", ["get", "cat"]];
  for (const k of CAT_ORDER) color.push(k, CAT_COLORS[k]);
  color.push(OFFLINE_COLOR);
  map.addLayer({
    id: "sensors",
    type: "circle",
    source: "sensors",
    paint: {
      // Roughly the size of an H3 res-9 cell (~200 m edge) at street zooms, still visible when zoomed out.
      "circle-radius": ["interpolate", ["exponential", 2], ["zoom"], 9, 5, 13, 12, 16, 60],
      "circle-color": color as maplibregl.ExpressionSpecification,
      "circle-opacity": 0.8,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#333",
    },
  });
  map.on("click", "sensors", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const p = f.properties as { code: string; aqi: number; cat: CatKey | "offline"; pm: number; upd: number };
    const box = document.createElement("div");
    const head = document.createElement("p");
    head.className = "popup-aqi";
    head.style.background = p.cat === "offline" ? OFFLINE_COLOR : CAT_COLORS[p.cat];
    head.style.color = textOn(p.cat);
    head.textContent = p.cat === "offline" ? t(lang, "map.offline") : `AQI ${p.aqi} · ${t(lang, `aqi.${p.cat}` as Key)}`;
    const when = document.createElement("p");
    when.className = "hint";
    when.textContent = p.upd ? t(lang, "map.updated", { time: relTime(lang, p.upd) }) : "";
    const link = document.createElement("a");
    link.href = `/s/${encodeURIComponent(p.code)}`;
    link.textContent = t(lang, "map.open");
    box.append(head, when, link);
    new maplibregl.Popup({ closeButton: true }).setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).setDOMContent(box).addTo(map);
  });
  map.on("mouseenter", "sensors", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "sensors", () => (map.getCanvas().style.cursor = ""));
});
