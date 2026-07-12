const CACHE_VERSION = "celestiframe-shell-v18";
const APP_SHELL = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./assets/icon.svg?v=18",
  "./css/app.css?v=17",
  "./js/app.js?v=16",
  "./js/state.js?v=7",
  "./js/astronomy/sun-service.js",
  "./js/astronomy/moon-service.js?v=5",
  "./js/geometry/angle.js",
  "./js/geometry/bearing.js?v=7",
  "./js/geometry/destination.js",
  "./js/map/geocoder.js?v=12",
  "./js/map/map-controller.js?v=14",
  "./js/map/place-search.js?v=14",
  "./js/plans/plan-data.js?v=14",
  "./js/plans/plan-manager.js?v=14",
  "./js/plans/plan-repository.js?v=14",
  "./js/search/search-controller.js?v=11",
  "./js/search/search-core.js",
  "./js/search/search-worker.js?v=10",
  "./js/ui/datetime-controls.js?v=11",
  "./js/ui/theme.js?v=6",
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
          if (!response.ok) throw new Error(`Asset request failed: ${response.status}`);
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
