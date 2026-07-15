const CACHE_VERSION = "celestiframe-shell-v100";
const TRUSTED_STATIC_HOSTS = new Set(["unpkg.com", "www.gstatic.com"]);
const APP_SHELL = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.webmanifest",
  "./assets/icon.svg?v=43",
  "./assets/icons/chevron-down.svg",
  "./assets/icons/chevron-left.svg",
  "./assets/icons/chevron-right.svg",
  "./assets/icons/cloud.svg",
  "./assets/icons/compass.svg",
  "./assets/icons/copy.svg",
  "./assets/icons/crosshair.svg",
  "./assets/icons/diamond.svg",
  "./assets/icons/ellipsis.svg",
  "./assets/icons/external-link.svg",
  "./assets/icons/locate-fixed.svg",
  "./assets/icons/map-pin.svg",
  "./assets/icons/notebook-tabs.svg",
  "./assets/icons/panel-bottom-close.svg",
  "./assets/icons/panel-bottom-open.svg",
  "./assets/icons/panel-left-close.svg",
  "./assets/icons/plus.svg",
  "./assets/icons/search.svg",
  "./assets/icons/settings-2.svg",
  "./assets/icons/sparkles.svg",
  "./assets/icons/trash-2.svg",
  "./assets/icons/x.svg",
  "./assets/fonts/IBMPlexSansJP-Regular.woff2",
  "./assets/fonts/IBMPlexSansJP-SemiBold.woff2",
  "./assets/fonts/IBMPlexSansCondensed-Regular.woff2",
  "./assets/fonts/IBMPlexSansCondensed-SemiBold.woff2",
  "./assets/fonts/IBMPlexMono-Regular.woff2",
  "./assets/fonts/IBMPlexMono-SemiBold.woff2",
  "./assets/fonts/LICENSE-IBM-PLEX.txt",
  "./css/app.css?v=83",
  "./js/app.js?v=88",
  "./js/config/runtime-config.js?v=35",
  "./js/config/firebase-config.js?v=1",
  "./js/state.js?v=42",
  "./js/astronomy/sun-service.js",
  "./js/astronomy/moon-service.js?v=5",
  "./js/astronomy/milky-way-service.js?v=41",
  "./js/astronomy/target-catalog.js?v=1",
  "./js/astronomy/target-service.js?v=1",
  "./js/geometry/angle.js",
  "./js/geometry/bearing.js?v=7",
  "./js/geometry/destination.js",
  "./js/geometry/target-altitude.js?v=24",
  "./js/elevation/elevation-service.js?v=25",
  "./js/elevation/elevation-controller.js?v=25",
  "./js/map/geocoder.js?v=32",
  "./js/map/map-controller.js?v=52",
  "./js/map/place-search.js?v=34",
  "./js/plans/plan-data.js?v=41",
  "./js/plans/plan-manager.js?v=45",
  "./js/plans/plan-repository.js?v=16",
  "./js/map/google-maps-url.js?v=1",
  "./js/weather/forecast-service.js?v=2",
  "./js/weather/weather-controller.js?v=9",
  "./js/light-pollution/light-pollution-controller.js?v=2",
  "./js/cloud/plan-sync.js?v=1",
  "./js/cloud/firebase-client.js?v=1",
  "./js/cloud/account-controller.js?v=2",
  "./js/utils/lru-cache.js?v=1",
  "./js/composition/composition.js?v=19",
  "./js/search/search-controller.js?v=45",
  "./js/search/search-core.js?v=45",
  "./js/search/search-worker.js?v=45",
  "./js/ui/datetime-controls.js?v=12",
  "./js/ui/sky-state-rail.js?v=1",
  "./js/ui/composition-controls.js?v=24",
  "./js/ui/theme.js?v=6",
  "./js/ui/target-selector.js?v=1",
  "./js/planning/shooting-candidates.js?v=40",
  "./js/planning/shooting-planner.js?v=41",
  "./js/terrain/terrain-profile.js?v=40",
  "./js/terrain/terrain-profile-controller.js?v=40",
  "./js/field/field-mode.js?v=49",
  "./js/vendor/suncalc.js",
  "./js/vendor/astronomy-engine.min.js",
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

  const isTrustedStaticAsset = requestUrl.origin !== self.location.origin
    && TRUSTED_STATIC_HOSTS.has(requestUrl.hostname)
    && (event.request.destination === "script" || event.request.destination === "style");
  if (isTrustedStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
        if (response.ok || response.type === "opaque") {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })).catch(() => new Response("Offline", { status: 503, statusText: "Offline" })),
    );
    return;
  }

  if (requestUrl.origin !== self.location.origin) {
    event.respondWith(fetch(event.request).catch(() => new Response("Offline", { status: 503, statusText: "Offline" })));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cached) => cached || fetch(event.request))
      .catch(() => new Response("Offline", { status: 503, statusText: "Offline" })),
  );
});
