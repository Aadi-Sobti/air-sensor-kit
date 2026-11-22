// Installable web app (web.md "Owner page"): service worker (offline shell only, never owner API responses),
// one-time "Add to Home Screen" hint (iPhone wording vs Android install button), and web push for offline notices.
const HINT_KEY = "prosefire.installHint.v1";

export function isStandalone(): boolean {
  return matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}
export function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export async function registerSw(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

interface InstallUi {
  box: HTMLElement; text: HTMLElement; button: HTMLButtonElement; dismiss: HTMLButtonElement; iosText: string; androidText: string;
}

export function setupInstallHint(ui: InstallUi): void {
  let seen = false;
  try { seen = localStorage.getItem(HINT_KEY) === "1"; } catch { /* ignore */ }
  if (seen || isStandalone()) return;
  const done = () => {
    ui.box.hidden = true;
    try { localStorage.setItem(HINT_KEY, "1"); } catch { /* ignore */ }
  };
  ui.dismiss.addEventListener("click", done);
  if (isIos()) {
    ui.text.textContent = ui.iosText; // iPhone/iPad: no install prompt; Safari's Share menu
    ui.box.hidden = false;
    return;
  }
  // Android/desktop: Chrome offers an install prompt; other browsers (Firefox, Samsung Internet) get wording.
  ui.text.textContent = ui.androidText;
  const fallback = setTimeout(() => { if (/android/i.test(navigator.userAgent)) ui.box.hidden = false; }, 3000);
  window.addEventListener("beforeinstallprompt", (e) => {
    clearTimeout(fallback);
    e.preventDefault();
    const prompt = e as Event & { prompt: () => Promise<void> };
    ui.button.hidden = false;
    ui.box.hidden = false;
    ui.button.addEventListener("click", async () => {
      await prompt.prompt();
      done();
    }, { once: true });
  });
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export type PushState = "unsupported" | "needs_install" | "blocked" | "off" | "on";

export async function pushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return isIos() && !isStandalone() ? "needs_install" : "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/**
 * Must be called directly from the tap handler with the VAPID key ALREADY loaded: Safari/iOS only allows the
 * permission prompt as the first thing a user gesture does (no network awaits before it).
 */
export async function subscribePush(vapidKey: string): Promise<PushSubscription | null> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await registerSw());
  if (!reg) return null;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(vapidKey) as BufferSource });
}

/** SHA-256 (hex) of this browser's push endpoint, so the server can say whether THIS browser gets notices. */
export async function endpointHash(sub: PushSubscription | null): Promise<string> {
  if (!sub || !crypto?.subtle) return "";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sub.endpoint));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker?.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}
