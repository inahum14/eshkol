const CACHE = "eshkol-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Network-first for the app shell so it opens even without reception.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("/"))),
  );
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: "אני כאן", body: e.data?.text() }; }
  e.waitUntil(
    self.registration.showNotification(d.title || "אני כאן 💜", {
      body: d.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: d.tag,
      data: { url: d.url || "/" },
      requireInteraction: !!d.urgent,
    }).then(() => self.navigator?.setAppBadge?.().catch(() => {})),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = e.notification.data?.url || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.navigate?.(target).catch(() => {}); return c.focus(); }
      }
      return self.clients.openWindow(target);
    }),
  );
});
