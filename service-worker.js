const CACHE_VERSION = "celestiframe-shell-v41";
const APP_SHELL = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./assets/icon.svg?v=22",
  "./css/app.css?v=41",
  "./js/app.js?v=41",
  "./js/config/runtime-config.js?v=32",
  "./js/state.js?v=40",
  "./js/astronomy/sun-service.js",
  "./js/astronomy/moon-service.js?v=5",
  "./js/astronomy/milky-way-service.js?v=41",
  "./js/geometry/angle.js",
  "./js/geometry/bearing.js?v=7",
  "./js/geometry/destination.js",
  "./js/geometry/target-altitude.js?v=24",
  "./js/elevation/elevation-service.js?v=24",
  "./js/elevation/elevation-controller.js?v=24",
  "./js/map/geocoder.js?v=32",
  "./js/map/map-controller.js?v=40",
  "./js/map/place-search.js?v=32",
  "./js/plans/plan-data.js?v=40",
  "./js/plans/plan-manager.js?v=40",
  "./js/plans/plan-repository.js?v=14",
  "./js/composition/composition.js?v=19",
  "./js/search/search-controller.js?v=41",
  "./js/search/search-core.js?v=41",
  "./js/search/search-worker.js?v=41",
  "./js/ui/datetime-controls.js?v=11",
  "./js/ui/composition-controls.js?v=24",
  "./js/ui/theme.js?v=6",
  "./js/planning/shooting-candidates.js?v=40",
  "./js/planning/shooting-planner.js?v=40",
  "./js/terrain/terrain-profile.js?v=40",
  "./js/terrain/terrain-profile-controller.js?v=40",
  "./js/field/field-mode.js?v=41",
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
  if (requestUrl.origin === self.location.origin && requestUrl.pathname.endsWith("/config/runtime-config.json")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }
  if (requestUrl.hostname === "cyberjapandata2.gsi.go.jp") {
    event.respondWith(fetch(event.request));
    return;
  }
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
