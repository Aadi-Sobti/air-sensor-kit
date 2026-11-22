// /claim : finishes computer setup (address + inside/outside). Spec: web.md "Claim page".
// The link's fragment (#d=..&t=..) never reaches server logs; we move it to sessionStorage and strip it from the URL.
import "./style.css";
import { applyI18n, Key, t } from "./i18n";
import { parseClaimFragment } from "./improvClient";

const lang = applyI18n();
document.title = t(lang, "claim.pageTitle");
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on = true) => ($(id).hidden = !on);
const KEY = "prosefire.claim";

function setError(key: Key | null, offerSetup = false) {
  show("error", !!key);
  $("error").textContent = key ? t(lang, key) : "";
  show("setup-again", offerSetup);
}

function loadLink(): { d: string; t: string } | null {
  const fromHash = parseClaimFragment(location.hash);
  if (fromHash) {
    try { sessionStorage.setItem(KEY, JSON.stringify(fromHash)); } catch { /* private mode */ }
    history.replaceState(null, "", location.pathname); // token out of the address bar and history
    return fromHash;
  }
  try {
    const s = sessionStorage.getItem(KEY);
    return s ? parseClaimFragment(`#d=${JSON.parse(s).d}&t=${JSON.parse(s).t}`) : null;
  } catch {
    return null;
  }
}

const link = loadLink();
const POLL_MS = 5000, POLL_FOR_MS = 120000;

async function postClaim(body: object): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch("/api/v1/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "omit",
    cache: "no-store",
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

async function finish(ev: Event) {
  ev.preventDefault();
  if (!link) return;
  const address = $<HTMLInputElement>("address").value.trim();
  const zip = $<HTMLInputElement>("zip").value.trim();
  if (address.length < 3) {
    setError("claim.err.address");
    return;
  }
  if (!/^\d{5}$/.test(zip)) {
    setError("claim.err.zip");
    return;
  }
  const indoor = (document.querySelector('input[name="where"]:checked') as HTMLInputElement).value === "inside";
  setError(null);
  $<HTMLButtonElement>("finish").disabled = true;
  const start = Date.now();
  try {
    for (;;) {
      let res;
      try {
        res = await postClaim({ d: link.d, t: link.t, address, zip, indoor });
      } catch {
        setError("claim.err.network");
        return;
      }
      if (res.status === 200) {
        try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
        // ATM values (the sensor's own ambient estimate) read closer to reality than raw CF=1 at low levels.
        // The EPA-corrected value and AQI arrive with the map (M7). Provisional choice: see decisions.md.
        const latest = res.body.latest as { pm25_atm?: number } | null;
        $("reading").textContent = latest && typeof latest.pm25_atm === "number"
          ? t(lang, "claim.firstReading", { value: latest.pm25_atm.toFixed(1) })
          : t(lang, "claim.noReadingYet");
        show("step-form", false);
        show("waiting", false);
        show("step-done");
        return;
      }
      if (res.status === 409 && Date.now() - start < POLL_FOR_MS) {
        show("waiting"); // the sensor hasn't uploaded its claim yet: keep asking
        await new Promise((r) => setTimeout(r, POLL_MS));
        continue;
      }
      show("waiting", false);
      if (res.status === 409) setError("claim.err.notYet");
      else if (res.status === 422) setError("claim.err.address");
      else if (res.status === 410) setError("claim.err.expired", true);
      else if (res.status === 429) setError("claim.err.tooMany");
      else if (res.body.error === "bad_zip") setError("claim.err.zip");
      else if (res.body.error === "bad_link") setError("claim.err.badLink", true);
      else setError("claim.err.network");
      return;
    }
  } finally {
    $<HTMLButtonElement>("finish").disabled = false;
  }
}

if (!link) {
  setError("claim.err.badLink", true);
} else {
  show("step-form");
  $("claim-form").addEventListener("submit", (e) => void finish(e));
}
