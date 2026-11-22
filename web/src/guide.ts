// "/guide" : build + setup guide (M10, DRAFT). Three kit versions (decision #12 open): separate parts (8 connections),
// wires already on the adapter (4), or already built. Without JavaScript every step shows.
import "./style.css";

import { applyI18n, t } from "./i18n";

const lang = applyI18n();
document.title = t(lang, "guide.pageTitle");
document.getElementById("lbl-adapter")!.textContent = t(lang, "guide.diagram.adapter");
document.getElementById("lbl-board")!.textContent = t(lang, "guide.diagram.board");

// The WiFi board's two rows of 15 pins (only VIN, G, D1, D2 are labeled; people match the printed letters).
const pins = document.getElementById("pins")!;
for (let i = 0; i < 15; i++) {
  for (const x of [270, 390]) {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", String(x));
    c.setAttribute("cy", String(90 + i * 20));
    c.setAttribute("r", "5");
    pins.appendChild(c);
  }
}

export type Kit = "parts" | "prewired" | "assembled";

/** Shows only the steps for this kit version (elements list the versions they belong to in data-kit). */
export function showKit(root: ParentNode, kit: Kit): void {
  root.querySelectorAll<HTMLElement>("[data-kit]").forEach((el) => {
    el.hidden = !(el.dataset.kit ?? "").split(/\s+/).includes(kit);
  });
}

const radios = document.querySelectorAll<HTMLInputElement>('input[name="kit"]');
radios.forEach((r) => r.addEventListener("change", () => r.checked && showKit(document, r.value as Kit)));
showKit(document, "parts");
