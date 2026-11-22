// Service worker: offline shell for the installed app + web push notices. Never caches API responses
// (owner data stays fresh and private). Bump VERSION to roll out a new shell.
const VERSION = "v1";
const SHELL = ["/my", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return; // network only
  if (e.request.mode === "navigate" && url.pathname === "/my") {
    // Network first, so updates arrive; cached shell when offline.
    e.respondWith(fetch(e.request).catch(() => caches.match("/my")));
  }
});
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { /* ignore */ }
  e.waitUntil(self.registration.showNotification(d.title || "ProseFire", { body: d.body || "", icon: "/icons/icon-192.png", data: { url: d.url || "/my" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow((e.notification.data && e.notification.data.url) || "/my"));
});
