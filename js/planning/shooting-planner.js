import { calculateSunData } from "../astronomy/sun-service.js";
import { calculateMoonData } from "../astronomy/moon-service.js?v=5";
import { calculateMilkyWay } from "../astronomy/milky-way-service.js?v=40";
import { createShootingCandidates } from "./shooting-candidates.js?v=40";

const BODY_LABELS = Object.freeze({ sun: "太陽", moon: "月", milkyway: "天の川" });

function bodyData(body, date, location) {
  if (body === "sun") return calculateSunData(date, location);
  if (body === "moon") return calculateMoonData(date, location);
  return calculateMilkyWay(date, location);
}

const distanceLabel = (meters) => meters >= 1000 ? `${meters / 1000} km` : `${meters} m`;

export function bindShootingPlanner(store, getMapController, showToast) {
  const panel = document.querySelector("#shooting-planner");
  const bodySelect = document.querySelector("#candidate-body");
  const toggle = document.querySelector("#candidate-toggle");
  const list = document.querySelector("#candidate-list");
  const summary = document.querySelector("#candidate-summary");
  let active = false;
  let currentCandidates = [];

  function clear() {
    active = false;
    currentCandidates = [];
    list.replaceChildren();
    summary.textContent = "被写体と天体の延長線上へ候補を表示します。";
    toggle.textContent = "候補を表示";
    getMapController()?.clearShootingCandidates();
  }

  function render() {
    const state = store.getState();
    panel.hidden = !state.subjectLocation;
    if (!state.subjectLocation) return clear();
    if (!active) return;
    try {
      const body = bodySelect.value;
      const data = bodyData(body, new Date(state.selectedDateTime), state.subjectLocation);
      currentCandidates = createShootingCandidates({
        subjectLocation: state.subjectLocation,
        celestialAzimuth: data.azimuth,
        body,
      }).map((candidate) => ({
        ...candidate,
        label: BODY_LABELS[body],
        distanceLabel: distanceLabel(candidate.distanceMeters),
      }));
      summary.textContent = `${BODY_LABELS[body]} 方位${data.azimuth.toFixed(1)}°の反対側に4地点`;
      toggle.textContent = "候補を消す";
      list.replaceChildren();
      currentCandidates.forEach((candidate) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.candidateId = candidate.id;
        const distance = document.createElement("b");
        distance.textContent = candidate.distanceLabel;
        const bearing = document.createElement("span");
        bearing.textContent = `被写体から${candidate.bearingDegrees.toFixed(1)}°`;
        button.append(distance, bearing);
        list.append(button);
      });
      getMapController()?.setShootingCandidates(currentCandidates);
    } catch (error) {
      console.error(error);
      clear();
      showToast(error.message || "撮影地点候補を計算できませんでした");
    }
  }

  toggle.addEventListener("click", () => {
    active = !active;
    if (active && ["sun", "moon", "milkyway"].includes(store.getState().selectedBody)) {
      bodySelect.value = store.getState().selectedBody;
    }
    if (active) render(); else clear();
  });
  bodySelect.addEventListener("change", render);
  list.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-candidate-id]");
    const candidate = currentCandidates.find((item) => item.id === button?.dataset.candidateId);
    if (!candidate) return;
    store.setState((state) => ({ ...state, cameraLocation: candidate.location }));
    getMapController()?.setLocation(candidate.location);
    showToast(`${candidate.label}・${candidate.distanceLabel}候補を撮影地点に設定しました`);
  });
  store.subscribe(render);
  return { clear, render };
}
