import { elevationLocationKey, fetchElevation } from "./elevation-service.js?v=24";

const LABELS = {
  loading: "取得中",
  ready: "自動",
  manual: "手入力",
  error: "未取得",
};

export function bindElevationControls(store, showToast) {
  const controllers = { camera: null, subject: null };

  function updateRole(role, updater) {
    store.setState((state) => role === "camera"
      ? { ...state, composition: updater(state.composition) }
      : { ...state, subject: updater(state.subject) });
  }

  async function request(role, location, { force = false, announce = false } = {}) {
    if (!location) return;
    const key = elevationLocationKey(location);
    controllers[role]?.abort();
    const controller = new AbortController();
    controllers[role] = controller;
    updateRole(role, (value) => ({
      ...value,
      [role === "camera" ? "cameraElevationStatus" : "groundElevationStatus"]: "loading",
      [role === "camera" ? "cameraElevationMode" : "groundElevationMode"]: "auto",
      [role === "camera" ? "cameraElevationKey" : "groundElevationKey"]: key,
    }));
    try {
      const result = await fetchElevation(location, { signal: controller.signal, force });
      if (controller.signal.aborted) return;
      const state = store.getState();
      const current = role === "camera" ? state.composition : state.subject;
      const modeField = role === "camera" ? "cameraElevationMode" : "groundElevationMode";
      const keyField = role === "camera" ? "cameraElevationKey" : "groundElevationKey";
      if (current[modeField] !== "auto" || current[keyField] !== result.key) return;
      updateRole(role, (value) => ({
        ...value,
        [role === "camera" ? "cameraElevationMeters" : "groundElevationMeters"]: result.meters,
        [role === "camera" ? "cameraElevationStatus" : "groundElevationStatus"]: "ready",
        [role === "camera" ? "cameraElevationSource" : "groundElevationSource"]: result.source,
      }));
      if (announce) showToast(`${role === "camera" ? "撮影地点" : "被写体地点"}の標高を更新しました`);
    } catch (error) {
      if (error?.name === "AbortError") return;
      updateRole(role, (value) => ({
        ...value,
        [role === "camera" ? "cameraElevationStatus" : "groundElevationStatus"]: "error",
        [role === "camera" ? "cameraElevationSource" : "groundElevationSource"]: "",
      }));
      if (announce) showToast(error.message || "標高を取得できませんでした");
    }
  }

  document.querySelectorAll("[data-elevation-retry]").forEach((button) => {
    button.addEventListener("click", () => {
      const role = button.dataset.elevationRetry;
      const state = store.getState();
      request(role, role === "camera" ? state.cameraLocation : state.subjectLocation, { force: true, announce: true });
    });
  });

  const unsubscribe = store.subscribe((state) => {
    const cameraKey = elevationLocationKey(state.cameraLocation);
    if (state.composition.cameraElevationKey !== cameraKey) request("camera", state.cameraLocation);
    if (state.subjectLocation) {
      const subjectKey = elevationLocationKey(state.subjectLocation);
      if (state.subject.groundElevationKey !== subjectKey) request("subject", state.subjectLocation);
    }
    ["camera", "subject"].forEach((role) => {
      const value = role === "camera" ? state.composition : state.subject;
      const status = value[role === "camera" ? "cameraElevationStatus" : "groundElevationStatus"];
      const source = value[role === "camera" ? "cameraElevationSource" : "groundElevationSource"];
      const badge = document.querySelector(`[data-elevation-status="${role}"]`);
      const sourceLabel = document.querySelector(`[data-elevation-source="${role}"]`);
      if (badge) {
        badge.textContent = LABELS[status] || LABELS.error;
        badge.dataset.status = status || "error";
      }
      if (sourceLabel) sourceLabel.textContent = source ? `国土地理院 ${source}` : status === "error" ? "再取得または手入力できます" : "国土地理院DEM";
    });
  });

  return {
    destroy() {
      unsubscribe();
      controllers.camera?.abort();
      controllers.subject?.abort();
    },
    retry: request,
  };
}
