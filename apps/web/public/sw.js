// Tote service worker — makes the app installable and lets the barn-capture
// shell load offline. Navigations are network-first with a cached fallback;
// static assets are cached at runtime. Capture data itself is queued in the
// page's localStorage and synced by the page on reconnect, so no financial
// write ever depends on the cache.
const CACHE = "tote-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/capture", "/icon.svg"]).catch(() => {})));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never cache mutations

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/capture"))),
    );
    return;
  }

  // Stale-while-revalidate: serve the cached copy for speed, but always refresh
  // it in the background. Cache-first without this pins an asset to its first
  // version forever, which silently strands the app on a stale build.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((res) => {
        if (res.ok && new URL(request.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      });

      if (cached) {
        event.waitUntil(network.catch(() => {}));
        return cached;
      }
      return network;
    }),
  );
});
