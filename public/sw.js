/* ICNA Relief Portal service worker.
 *
 * Deliberately minimal, because the portal holds staff and client data:
 *  - It never caches portal pages or API responses (nothing private is
 *    stored on the phone, and nobody sees stale data).
 *  - It only keeps a small offline page, shown when a page can't load
 *    because the phone has no connection.
 *  - It's ready for push notifications (helpdesk, approvals…): the
 *    handlers below show them and open the right page when tapped.
 *
 * Bump VERSION when this file changes so phones pick up the new one.
 */
const VERSION = "v2";
const OFFLINE_CACHE = `icna-offline-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const OFFLINE_ASSETS = [OFFLINE_URL]; // the page has its logo built in

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("icna-offline-") && k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Page loads go to the network as usual; only if that fails (offline) do
// we show the offline page. Everything else is left to the browser.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode !== "navigate") return;
  event.respondWith(
    fetch(req).catch(async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      return (await cache.match(OFFLINE_URL)) || Response.error();
    })
  );
});

// ── Push notifications ──────────────────────────────────────────────
// Expected payload (JSON): { title, body, url?, tag? }
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ICNA Relief", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "ICNA Relief Portal";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      // Android's status-bar icon: it only uses the image's shape, so this
      // must be a white silhouette on transparent (a full-color square
      // icon shows up as a plain white box).
      badge: "/icons/badge-96.png",
      tag: data.tag,
      data: { url: data.url || "/select-app" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/select-app", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
