import { createStore } from "./state.js";
import { createMapController } from "./map/map-controller.js?v=5";
import { bindDateTimeControls } from "./ui/datetime-controls.js";
import { normalizeThemePreference, resolveThemePreference, themeColor } from "./ui/theme.js?v=6";
import { calculateSunData } from "./astronomy/sun-service.js";
import { calculateMoonData } from "./astronomy/moon-service.js?v=5";

const store = createStore();
const mapStage = document.querySelector(".map-stage");
const setLocationButton = document.querySelector("#set-location-button");
let mapController;
let isArmingLocation = false;
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: light)");

function applyTheme(preference) {
  const normalized = normalizeThemePreference(preference);
  const resolved = resolveThemePreference(normalized, systemThemeQuery.matches);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = normalized;
  document.querySelector('meta[name="theme-color"]').content = themeColor(resolved);
  document.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.checked = input.value === normalized;
  });
}

const formatAngle = (value) => value.toFixed(1);
const formatTime = (date) => date
  ? new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date)
  : "なし";

function formatMoonEvent(date, selectedDate) {
  if (!date) return "なし";
  const prefix = date.getFullYear() !== selectedDate.getFullYear()
    || date.getMonth() !== selectedDate.getMonth()
    || date.getDate() !== selectedDate.getDate()
    ? "翌日 "
    : "";
  return `${prefix}${formatTime(date)}`;
}

function renderMoon(state) {
  try {
    const selectedDate = new Date(state.selectedDateTime);
    const moonData = calculateMoonData(selectedDate, state.cameraLocation);
    document.querySelector('[data-moon-field="azimuth"]').textContent = formatAngle(moonData.azimuth);
    document.querySelector('[data-moon-field="altitude"]').textContent = formatAngle(moonData.altitude);
    document.querySelector('[data-moon-field="direction"]').textContent = moonData.direction;
    document.querySelector('[data-moon-field="age"]').textContent = `${moonData.ageDays.toFixed(1)}日`;
    document.querySelector('[data-moon-field="illumination"]').textContent = `${(moonData.illuminationFraction * 100).toFixed(1)}%`;
    document.querySelector('[data-moon-field="moonrise"]').textContent = formatMoonEvent(moonData.moonrise, selectedDate);
    document.querySelector('[data-moon-field="moonset"]').textContent = formatMoonEvent(moonData.moonset, selectedDate);
    const horizonState = document.querySelector('[data-moon-field="state"]');
    horizonState.textContent = moonData.isAboveHorizon
      ? `${moonData.phaseName}・地平線の上`
      : `${moonData.phaseName}・地平線の下（計算値）`;
    horizonState.classList.toggle("is-above", moonData.isAboveHorizon);
    horizonState.classList.toggle("is-below", !moonData.isAboveHorizon);
    if (state.selectedBody === "moon" || state.selectedBody === "both") {
      mapController?.setMoonDirection(state.cameraLocation, moonData);
    } else {
      mapController?.clearMoonDirection();
    }
  } catch (error) {
    console.error("Lunar calculation failed", error);
    document.querySelector('[data-moon-field="state"]').textContent = "計算できません";
  }
}

function renderSun(state) {
  try {
    const sunData = calculateSunData(new Date(state.selectedDateTime), state.cameraLocation);
    document.querySelector('[data-sun-field="azimuth"]').textContent = formatAngle(sunData.azimuth);
    document.querySelector('[data-sun-field="altitude"]').textContent = formatAngle(sunData.altitude);
    document.querySelector('[data-sun-field="direction"]').textContent = sunData.direction;
    document.querySelector('[data-sun-field="sunrise"]').textContent = formatTime(sunData.sunrise);
    document.querySelector('[data-sun-field="sunset"]').textContent = formatTime(sunData.sunset);
    const horizonState = document.querySelector('[data-sun-field="state"]');
    horizonState.textContent = sunData.isAboveHorizon ? "地平線の上" : "地平線の下（計算値）";
    horizonState.classList.toggle("is-above", sunData.isAboveHorizon);
    horizonState.classList.toggle("is-below", !sunData.isAboveHorizon);
    if (state.selectedBody === "sun" || state.selectedBody === "both") {
      mapController?.setSunDirection(state.cameraLocation, sunData);
    } else {
      mapController?.clearSunDirection();
    }
  } catch (error) {
    console.error("Solar calculation failed", error);
    document.querySelector('[data-sun-field="state"]').textContent = "計算できません";
  }
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  document.querySelector("#toast-message").textContent = message;
  toast.hidden = false;
  window.setTimeout(() => {
    if (document.querySelector("#toast-action").hidden) toast.hidden = true;
  }, 3600);
}

function showServiceWorkerUpdate(worker) {
  const toast = document.querySelector("#toast");
  const action = document.querySelector("#toast-action");
  document.querySelector("#toast-message").textContent = "CelestiFrameの新しいバージョンがあります";
  action.hidden = false;
  action.onclick = () => worker.postMessage({ type: "SKIP_WAITING" });
  toast.hidden = false;
}

function setCameraLocation(location, options) {
  store.setState((state) => ({ ...state, cameraLocation: location }));
  mapController?.setLocation(location, options);
}

function updateLocationMode(active) {
  isArmingLocation = active;
  mapStage.classList.toggle("is-arming", active);
  setLocationButton.classList.toggle("is-active", active);
  setLocationButton.innerHTML = active
    ? '<span aria-hidden="true">◎</span> 中央を撮影地点にする'
    : '<span aria-hidden="true">＋</span> 撮影地点を設定';
}

function initializeMap() {
  const state = store.getState();
  try {
    mapController = createMapController({
      elementId: "map",
      initialLocation: state.cameraLocation,
      initialZoom: state.map.zoom,
      onLocationChange: (cameraLocation) => store.setState((current) => ({ ...current, cameraLocation })),
      onMapMove: (map) => store.setState((current) => ({ ...current, map })),
    });
  } catch (error) {
    console.error(error);
    document.querySelector("#map-fallback").hidden = false;
  }
}

setLocationButton.addEventListener("click", () => {
  if (!mapController) return showToast("地図を読み込んでから地点を設定してください");
  if (!isArmingLocation) {
    updateLocationMode(true);
    showToast("地図を動かし、ファインダーを撮影地点に合わせてください");
    return;
  }
  mapController.pickCenter();
  updateLocationMode(false);
  showToast("撮影地点を更新しました");
});

document.querySelector("#locate-button").addEventListener("click", () => {
  if (!navigator.geolocation) return showToast("この端末では現在地を利用できません");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      setCameraLocation({ latitude: coords.latitude, longitude: coords.longitude });
      showToast("現在地へ移動しました");
    },
    () => showToast("現在地を取得できませんでした。地図から地点を選べます"),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
});

document.querySelector("#settings-button").addEventListener("click", () => {
  document.querySelector("#settings-dialog").showModal();
});

document.querySelectorAll('input[name="theme"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    store.setState((state) => ({
      ...state,
      settings: { ...state.settings, theme: input.value },
    }));
  });
});

systemThemeQuery.addEventListener("change", () => {
  if (store.getState().settings.theme === "system") applyTheme("system");
});

document.querySelectorAll("[data-body]").forEach((button) => {
  button.addEventListener("click", () => {
    const selectedBody = button.dataset.body;
    store.setState((state) => ({ ...state, selectedBody }));
  });
});

store.subscribe((state) => {
  applyTheme(state.settings.theme);
  document.querySelector("#coordinates").value = `${state.cameraLocation.latitude.toFixed(5)}, ${state.cameraLocation.longitude.toFixed(5)}`;
  document.querySelectorAll("[data-body]").forEach((button) => button.classList.toggle("is-active", button.dataset.body === state.selectedBody));
  document.querySelectorAll("[data-card]").forEach((card) => {
    card.hidden = state.selectedBody !== "both" && card.dataset.card !== state.selectedBody;
  });
  renderSun(state);
  renderMoon(state);
});

document.querySelector("#timezone-label").textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || "LOCAL";
bindDateTimeControls(store);
initializeMap();
renderSun(store.getState());
renderMoon(store.getState());

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js");
      if (registration.waiting && navigator.serviceWorker.controller) {
        showServiceWorkerUpdate(registration.waiting);
      }
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state !== "installed" || !navigator.serviceWorker.controller) return;
          showServiceWorkerUpdate(worker);
        });
      });
    } catch (error) {
      console.warn("Service Worker registration failed", error);
    }
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());
}
