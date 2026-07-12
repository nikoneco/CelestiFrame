import { createStore } from "./state.js";
import { createMapController } from "./map/map-controller.js";
import { bindDateTimeControls } from "./ui/datetime-controls.js";

const store = createStore();
const mapStage = document.querySelector(".map-stage");
const setLocationButton = document.querySelector("#set-location-button");
let mapController;
let isArmingLocation = false;

function showToast(message) {
  const toast = document.querySelector("#toast");
  document.querySelector("#toast-message").textContent = message;
  toast.hidden = false;
  window.setTimeout(() => {
    if (document.querySelector("#toast-action").hidden) toast.hidden = true;
  }, 3600);
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
  showToast("詳細設定は次のフェーズで追加します");
});

document.querySelectorAll("[data-body]").forEach((button) => {
  button.addEventListener("click", () => {
    const selectedBody = button.dataset.body;
    store.setState((state) => ({ ...state, selectedBody }));
  });
});

store.subscribe((state) => {
  document.querySelector("#coordinates").value = `${state.cameraLocation.latitude.toFixed(5)}, ${state.cameraLocation.longitude.toFixed(5)}`;
  document.querySelectorAll("[data-body]").forEach((button) => button.classList.toggle("is-active", button.dataset.body === state.selectedBody));
  document.querySelectorAll("[data-card]").forEach((card) => {
    card.hidden = state.selectedBody !== "both" && card.dataset.card !== state.selectedBody;
  });
});

document.querySelector("#timezone-label").textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || "LOCAL";
bindDateTimeControls(store);
initializeMap();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js");
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state !== "installed" || !navigator.serviceWorker.controller) return;
          const toast = document.querySelector("#toast");
          const action = document.querySelector("#toast-action");
          document.querySelector("#toast-message").textContent = "CelestiFrameの新しいバージョンがあります";
          action.hidden = false;
          action.onclick = () => worker.postMessage({ type: "SKIP_WAITING" });
          toast.hidden = false;
        });
      });
    } catch (error) {
      console.warn("Service Worker registration failed", error);
    }
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());
}
