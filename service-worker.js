const CACHE_VERSION = "celestiframe-shell-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./css/app.css?v=5",
  "./js/app.js?v=5",
  "./js/state.js",
  "./js/astronomy/sun-service.js",
  "./js/astronomy/moon-service.js?v=5",
  "./js/geometry/angle.js",
  "./js/geometry/destination.js",
  "./js/map/map-controller.js?v=5",
  "./js/ui/datetime-controls.js",
  "./js/vendor/suncalc.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("./index.html").then((response) => response || caches.match("./offline.html"))));
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isVersionedSource = requestUrl.origin === self.location.origin
    && (event.request.destination === "script" || event.request.destination === "style");

  if (isVersionedSource) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => {
        if (response.ok || response.type === "opaque") {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
      return cached || network;
    }).catch(() => new Response("Offline", { status: 503, statusText: "Offline" })),
  );
});
