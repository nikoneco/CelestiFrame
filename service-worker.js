const CACHE_VERSION = "celestiframe-shell-v1.9.1";
const TRUSTED_STATIC_HOSTS = new Set(["unpkg.com", "www.gstatic.com"]);
const OPTIONAL_SHELL = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
];
const APP_SHELL = [
  "./",
  "./index.html",
  "./offline.html",
  "./manifest.webmanifest?v=2",
  "./assets/icon.svg?v=43",
  "./assets/icons/app-180.png",
  "./assets/icons/app-192.png",
  "./assets/icons/app-512.png",
  "./assets/icons/app-maskable-512.png",
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
  "./assets/fonts/IBMPlexSansJP-Regular-ui.woff2",
  "./assets/fonts/IBMPlexSansJP-SemiBold-ui.woff2",
  "./css/ui-fonts.css?v=1.9.1",
  "./assets/fonts/IBMPlexSansCondensed-Regular.woff2",
  "./assets/fonts/IBMPlexSansCondensed-SemiBold.woff2",
  "./assets/fonts/IBMPlexMono-Regular.woff2",
  "./assets/fonts/IBMPlexMono-SemiBold.woff2",
  "./assets/fonts/LICENSE-IBM-PLEX.txt",
  "./tokens.css?v=1.9.1",
  "./css/app.css?v=1.9.1",
  "./js/app.js?v=1.9.1",
  "./js/config/runtime-config.js?v=1.9.1",
  "./js/config/firebase-config.js?v=1.9.1",
  "./js/state.js?v=1.9.1",
  "./js/astronomy/sun-service.js?v=1.9.1",
  "./js/astronomy/ephemeris-cache.js?v=1.9.1",
  "./js/astronomy/moon-service.js?v=1.9.1",
  "./js/astronomy/milky-way-service.js?v=1.9.1",
  "./js/astronomy/target-catalog.js?v=1.9.1",
  "./js/astronomy/target-service.js?v=1.9.1",
  "./js/geometry/angle.js?v=1.9.1",
  "./js/geometry/bearing.js?v=1.9.1",
  "./js/geometry/destination.js?v=1.9.1",
  "./js/geometry/target-altitude.js?v=1.9.1",
  "./js/elevation/elevation-service.js?v=1.9.1",
  "./js/elevation/elevation-controller.js?v=1.9.1",
  "./js/map/geocoder.js?v=1.9.1",
  "./js/map/map-controller.js?v=1.9.1",
  "./js/map/place-search.js?v=1.9.1",
  "./js/plans/plan-data.js?v=1.9.1",
  "./js/plans/plan-manager.js?v=1.9.1",
  "./js/plans/offline-preparation.js?v=1.9.1",
  "./js/plans/offline-store.js?v=1.9.1",
  "./js/plans/plan-repository.js?v=1.9.1",
  "./js/map/google-maps-url.js?v=1.9.1",
  "./js/weather/forecast-service.js?v=1.9.1",
  "./js/weather/weather-controller.js?v=1.9.1",
  "./js/weather/moon-conditions.js?v=1.9.1",
  "./js/field/field-data-collector.js?v=1.9.1",
  "./js/light-pollution/offline-light-pollution.js?v=1.9.1",
  "./js/light-pollution/light-pollution-controller.js?v=1.9.1",
  "./js/cloud/plan-sync.js?v=1.9.1",
  "./js/cloud/firebase-client.js?v=1.9.1",
  "./js/cloud/firestore-plan-repository.js?v=1.9.1",
  "./js/utils/storage.js?v=1.9.1",
  "./js/cloud/account-controller.js?v=1.9.1",
  "./js/utils/lru-cache.js?v=1.9.1",
  "./js/utils/format.js?v=1.9.1",
  "./js/composition/composition.js?v=1.9.1",
  "./js/search/search-controller.js?v=1.9.1",
  "./js/search/search-core.js?v=1.9.1",
  "./js/search/search-worker.js?v=1.9.1",
  "./js/ui/datetime-controls.js?v=1.9.1",
  "./js/ui/sky-state-rail.js?v=1.9.1",
  "./js/ui/composition-controls.js?v=1.9.1",
  "./js/ui/theme.js?v=1.9.1",
  "./js/ui/target-selector.js?v=1.9.1",
  "./js/pwa/pwa-runtime.js?v=1.9.1",
  "./js/planning/shooting-candidates.js?v=1.9.1",
  "./js/planning/shooting-planner.js?v=1.9.1",
  "./js/terrain/terrain-profile.js?v=1.9.1",
  "./js/terrain/terrain-profile-controller.js?v=1.9.1",
  "./js/field/field-mode.js?v=1.9.1",
  "./js/measurement/observation-height-service.js?v=1.9.1",
  "./js/measurement/observation-camera-service.js?v=1.9.1",
  "./js/measurement/observation-height-controller.js?v=1.9.1",
  "./js/vendor/suncalc.js?v=1.9.1",
  "./js/vendor/astronomy-engine.min.js?v=1.9.1",
];

async function fetchWithTimeout(request, timeout = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then(async (cache) => {
    await cache.addAll(APP_SHELL);
    await Promise.allSettled(OPTIONAL_SHELL.map(async (url) => {
      const response = await fetchWithTimeout(new Request(url, { mode: "cors" }));
      if (response.ok) await cache.put(url, response);
    }));
  }));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("celestiframe-shell-") && key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    // A controlled page uses the HTML installed with its complete module graph.
    // registration.update() checks for releases; activation reloads every open page.
    event.respondWith(caches.open(CACHE_VERSION).then(async (cache) => (
      await cache.match("./index.html") || await fetchWithTimeout(event.request)
    )).catch(() => caches.match("./offline.html")));
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
    && ["script", "style", "font"].includes(event.request.destination);

  if (isVersionedSource) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
          const cached = await cache.match(event.request);
          if (cached) return cached;
          const response = await fetchWithTimeout(event.request);
          if (!response.ok) throw new Error(`Asset request failed: ${response.status}`);
          const copy = response.clone();
          await cache.put(event.request, copy);
          return response;
        }).catch(() => new Response("Offline", { status: 503, statusText: "Offline" })),
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
