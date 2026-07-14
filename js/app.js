import { createStore } from "./state.js?v=42";
import { createMapController, focusCurrentLocation } from "./map/map-controller.js?v=49";
import { bindPlaceSearch } from "./map/place-search.js?v=34";
import { loadRuntimeConfig } from "./config/runtime-config.js?v=33";
import { bindDateTimeControls } from "./ui/datetime-controls.js?v=12";
import { normalizeThemePreference, resolveThemePreference, themeColor } from "./ui/theme.js?v=6";
import { calculateSunData } from "./astronomy/sun-service.js";
import { calculateMoonData } from "./astronomy/moon-service.js?v=5";
import { calculateMilkyWay } from "./astronomy/milky-way-service.js?v=41";
import { calculateSelectedTargets } from "./astronomy/target-service.js?v=1";
import { targetLabelList } from "./astronomy/target-catalog.js?v=1";
import { subjectGeometry } from "./geometry/bearing.js?v=7";
import { signedAngleDifference } from "./geometry/angle.js";
import { bindSearchControls } from "./search/search-controller.js?v=45";
import { bindPlanManager } from "./plans/plan-manager.js?v=44";
import { createPlanRepository } from "./plans/plan-repository.js?v=16";
import { createPlanSyncCoordinator } from "./cloud/plan-sync.js?v=1";
import { bindCloudAccount } from "./cloud/account-controller.js?v=2";
import { parseSharedState } from "./plans/plan-data.js?v=41";
import { calculateComposition, focalLengthForFill, SENSOR_PRESETS } from "./composition/composition.js?v=19";
import { bindCompositionControls } from "./ui/composition-controls.js?v=24";
import { bindElevationControls } from "./elevation/elevation-controller.js?v=25";
import { apparentSolarAltitude, calculateTargetAltitude } from "./geometry/target-altitude.js?v=24";
import { bindShootingPlanner } from "./planning/shooting-planner.js?v=41";
import { bindTerrainProfile } from "./terrain/terrain-profile-controller.js?v=40";
import { bindFieldMode } from "./field/field-mode.js?v=48";
import { bindWeatherOverlay } from "./weather/weather-controller.js?v=9";
import { bindTargetSelector } from "./ui/target-selector.js?v=1";

let toastTimer;
registerServiceWorker();
const runtimeConfig = await loadRuntimeConfig();
const store = createStore();
const mapStage = document.querySelector(".map-stage");
const appShell = document.querySelector(".app-shell");
const controlDeck = document.querySelector(".control-deck");
const controlDeckContent = document.querySelector("#control-deck-content");
const deckToggle = document.querySelector("#deck-toggle");
const CONTROL_DECK_KEY = "celestiframe:controls-collapsed:v1";
const setLocationButton = document.querySelector("#set-location-button");
const subjectLocationButton = document.querySelector("#subject-location-button");
let mapController;
let controlDeckResizeTimer;
let activeLocationMode = null;
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: light)");
let sharedState = null;
try {
  sharedState = parseSharedState(window.location.href);
  if (sharedState) store.setState((state) => ({ ...state, ...sharedState, settings: state.settings }));
} catch (error) {
  console.warn("Shared plan could not be applied", error);
}

function setControlsCollapsed(collapsed, { persist = true } = {}) {
  controlDeck.classList.toggle("is-collapsed", collapsed);
  appShell.classList.toggle("is-controls-collapsed", collapsed);
  controlDeckContent.toggleAttribute("inert", collapsed);
  if (collapsed) controlDeckContent.setAttribute("aria-hidden", "true");
  else controlDeckContent.removeAttribute("aria-hidden");
  deckToggle.setAttribute("aria-expanded", String(!collapsed));
  deckToggle.setAttribute("aria-label", collapsed ? "コントロールを開く" : "コントロールを最小化");
  deckToggle.querySelector(".deck-toggle-label").textContent = collapsed ? "開く" : "最小化";
  if (persist) localStorage.setItem(CONTROL_DECK_KEY, JSON.stringify(collapsed));
  window.setTimeout(() => mapController?.map.invalidateSize(), 20);
  window.clearTimeout(controlDeckResizeTimer);
  controlDeckResizeTimer = window.setTimeout(() => mapController?.map.invalidateSize(), 400);
}

deckToggle.addEventListener("click", () => setControlsCollapsed(!controlDeck.classList.contains("is-collapsed")));
setControlsCollapsed(localStorage.getItem(CONTROL_DECK_KEY) === "true", { persist: false });

document.querySelectorAll("[data-deck-target]").forEach((button) => {
  button.addEventListener("click", () => {
    const target = document.querySelector(`#${button.dataset.deckTarget}`);
    if (!target) return;
    const deckTop = controlDeck.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    controlDeck.scrollTo({
      top: controlDeck.scrollTop + targetTop - deckTop - 58,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  });
});

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
const SVG_NS = "http://www.w3.org/2000/svg";

function formatMoonEvent(date, selectedDate) {
  if (!date) return "なし";
  const prefix = date.getFullYear() !== selectedDate.getFullYear()
    || date.getMonth() !== selectedDate.getMonth()
    || date.getDate() !== selectedDate.getDate()
    ? "翌日 "
    : "";
  return `${prefix}${formatTime(date)}`;
}

function renderMoon(state, calculatedData = null) {
  if (!state.selectedTargets.includes("moon")) return;
  try {
    const selectedDate = new Date(state.selectedDateTime);
    const moonData = calculatedData || calculateMoonData(selectedDate, state.cameraLocation);
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
  } catch (error) {
    console.error("Lunar calculation failed", error);
    document.querySelector('[data-moon-field="state"]').textContent = "計算できません";
  }
}

function renderSun(state, calculatedData = null) {
  if (!state.selectedTargets.includes("sun")) return;
  try {
    const sunData = calculatedData || calculateSunData(new Date(state.selectedDateTime), state.cameraLocation);
    document.querySelector('[data-sun-field="azimuth"]').textContent = formatAngle(sunData.azimuth);
    document.querySelector('[data-sun-field="altitude"]').textContent = formatAngle(sunData.altitude);
    document.querySelector('[data-sun-field="direction"]').textContent = sunData.direction;
    document.querySelector('[data-sun-field="sunrise"]').textContent = formatTime(sunData.sunrise);
    document.querySelector('[data-sun-field="sunset"]').textContent = formatTime(sunData.sunset);
    const horizonState = document.querySelector('[data-sun-field="state"]');
    horizonState.textContent = sunData.isAboveHorizon ? "地平線の上" : "地平線の下（計算値）";
    horizonState.classList.toggle("is-above", sunData.isAboveHorizon);
    horizonState.classList.toggle("is-below", !sunData.isAboveHorizon);
  } catch (error) {
    console.error("Solar calculation failed", error);
    document.querySelector('[data-sun-field="state"]').textContent = "計算できません";
  }
}

function renderMilkyWayArc(data) {
  const svg = document.querySelector("#milkyway-arc");
  svg.replaceChildren();
  const horizon = document.createElementNS(SVG_NS, "line");
  horizon.setAttribute("class", "milkyway-horizon");
  horizon.setAttribute("x1", "0");
  horizon.setAttribute("x2", "360");
  horizon.setAttribute("y1", "90");
  horizon.setAttribute("y2", "90");
  svg.append(horizon);
  let segment = [];
  const appendSegment = () => {
    if (segment.length < 2) {
      segment = [];
      return;
    }
    const path = document.createElementNS(SVG_NS, "polyline");
    path.setAttribute("class", "milkyway-path");
    path.setAttribute("points", segment.map((point) => `${point.azimuth.toFixed(1)},${(90 - point.altitude * 0.82).toFixed(1)}`).join(" "));
    svg.append(path);
    segment = [];
  };
  data.plane.forEach((point) => {
    const previous = segment.at(-1);
    if (point.altitude < 0 || (previous && Math.abs(point.azimuth - previous.azimuth) > 120)) {
      appendSegment();
      if (point.altitude < 0) return;
    }
    segment.push(point);
  });
  appendSegment();
  if (data.core.isAboveHorizon) {
    const core = document.createElementNS(SVG_NS, "circle");
    core.setAttribute("class", "milkyway-core");
    core.setAttribute("cx", data.core.azimuth.toFixed(1));
    core.setAttribute("cy", (90 - data.core.altitude * 0.82).toFixed(1));
    core.setAttribute("r", "4");
    svg.append(core);
  }
}

function renderMilkyWay(state, calculatedData = null) {
  if (!state.selectedTargets.includes("milkyway")) return;
  try {
    const date = new Date(state.selectedDateTime);
    const data = calculatedData || calculateMilkyWay(date, state.cameraLocation);
    const sun = calculateSunData(date, state.cameraLocation);
    document.querySelector('[data-milkyway-field="azimuth"]').textContent = formatAngle(data.azimuth);
    document.querySelector('[data-milkyway-field="altitude"]').textContent = formatAngle(data.altitude);
    document.querySelector('[data-milkyway-field="direction"]').textContent = data.direction;
    document.querySelector('[data-milkyway-field="core-direction"]').textContent = `${data.core.direction} ${data.core.azimuth.toFixed(1)}°`;
    document.querySelector('[data-milkyway-field="core-altitude"]').textContent = `${data.core.altitude.toFixed(1)}°`;
    document.querySelector('[data-milkyway-field="darkness"]').textContent = sun.altitude <= -18 ? "天文夜" : sun.altitude <= -12 ? "暗い" : sun.altitude <= -6 ? "薄明" : "明るい";
    const stateLabel = document.querySelector('[data-milkyway-field="state"]');
    stateLabel.textContent = data.core.isAboveHorizon ? "銀河中心も地平線上" : "アーチのみ・中心は地平線下";
    stateLabel.classList.toggle("is-above", data.isAboveHorizon);
    renderMilkyWayArc(data);
  } catch (error) {
    console.error("Milky Way calculation failed", error);
    document.querySelector('[data-milkyway-field="state"]').textContent = "計算できません";
  }
}

function renderStellarTargets(targetData) {
  const container = document.querySelector("#stellar-target-grid");
  container.replaceChildren();
  targetData.filter((data) => !["sun", "moon", "milkyway"].includes(data.target.id)).forEach((data) => {
    const card = document.createElement("article");
    card.className = "celestial-card celestial-card-target";
    card.style.setProperty("--target-color", data.target.color);
    const header = document.createElement("header");
    const symbol = document.createElement("span");
    symbol.className = "celestial-symbol";
    symbol.textContent = data.target.symbol;
    symbol.setAttribute("aria-hidden", "true");
    const title = document.createElement("div");
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = data.target.kind === "planet" ? "PLANET VECTOR" : "DEEP SKY VECTOR";
    const heading = document.createElement("h2");
    heading.textContent = data.target.label;
    title.append(eyebrow, heading);
    const stateLabel = document.createElement("span");
    stateLabel.className = `horizon-state ${data.isAboveHorizon ? "is-above" : "is-below"}`;
    stateLabel.textContent = data.isAboveHorizon ? "地平線の上" : "地平線の下（計算値）";
    header.append(symbol, title, stateLabel);
    const metrics = document.createElement("div");
    metrics.className = "metric-pair";
    const azimuth = document.createElement("div");
    azimuth.innerHTML = `<span>方位角 <em>${data.direction}</em></span><strong><b>${data.azimuth.toFixed(1)}</b><small>°</small></strong>`;
    const altitude = document.createElement("div");
    altitude.innerHTML = `<span>高度角</span><strong><b>${data.altitude.toFixed(1)}</b><small>°</small></strong>`;
    metrics.append(azimuth, altitude);
    const footer = document.createElement("footer");
    footer.textContent = data.target.kind === "planet" ? "現在の観測地点から見た計算位置" : "代表点の方位・高度";
    card.append(header, metrics, footer);
    container.append(card);
  });
}

function renderCelestialDirections(state, cameraTargetData) {
  if (!mapController) return;
  const directions = [];
  if (state.settings.directionLineOrigin !== "subject") {
    cameraTargetData.forEach((data) => directions.push({ targetId: data.target.id, location: state.cameraLocation, data, origin: "camera" }));
  }
  if (state.subjectLocation && state.settings.directionLineOrigin !== "camera") {
    const subjectData = calculateSelectedTargets(state.selectedTargets, new Date(state.selectedDateTime), state.subjectLocation);
    subjectData.forEach((data) => directions.push({ targetId: data.target.id, location: state.subjectLocation, data, origin: "subject" }));
  }
  mapController.setCelestialDirections(directions);
}

function formatDistance(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${Math.round(value)} m`;
}

function formatAlignmentDifference(value) {
  if (Math.abs(value) < 0.05) return "正面";
  return `${Math.abs(value).toFixed(1)}°${value > 0 ? "右" : "左"}`;
}

function renderAlignment(state, targetData = []) {
  const card = document.querySelector("#alignment-card");
  if (!state.subjectLocation) {
    card.hidden = true;
    return;
  }

  const geometry = subjectGeometry(state.cameraLocation, state.subjectLocation);
  const candidates = targetData.map((data) => ({
    name: data.target.label,
    shortName: data.target.shortLabel,
    color: data.target.color,
    difference: signedAngleDifference(geometry.bearingDegrees, data.azimuth),
  }));
  if (!candidates.length) {
    card.hidden = true;
    return;
  }
  const closest = candidates.reduce((best, candidate) => (
    Math.abs(candidate.difference) < Math.abs(best.difference) ? candidate : best
  ));
  const absoluteDifference = Math.abs(closest.difference);

  card.hidden = false;
  document.querySelector("#alignment-title").textContent = `${state.subject?.name || "被写体"}との重なり`;
  document.querySelector('[data-alignment-field="distance"]').textContent = formatDistance(geometry.distanceMeters);
  document.querySelector('[data-alignment-field="bearing"]').textContent = geometry.bearingDegrees.toFixed(1);
  const metrics = document.querySelector("#alignment-target-metrics");
  metrics.replaceChildren(...candidates.map((candidate) => {
    const item = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = `${candidate.shortName}との差`;
    label.style.color = candidate.color;
    const value = document.createElement("strong");
    value.textContent = formatAlignmentDifference(candidate.difference);
    item.append(label, value);
    return item;
  }));
  document.querySelector("#alignment-search-button").hidden = false;
  document.querySelector('[data-alignment-field="status"]').textContent = absoluteDifference <= 1
    ? "重なり候補"
    : absoluteDifference <= 5 ? "方向が近い" : "方位差あり";
  document.querySelector('[data-alignment-field="message"]').textContent = absoluteDifference < 0.05
    ? `${closest.name}は被写体の正面方向です。`
    : `${closest.name}は被写体の${formatAlignmentDifference(closest.difference)}にあります。`;
  mapController?.setSubjectLocation(state.cameraLocation, state.subjectLocation);
}

const clampPercent = (value) => Math.min(100, Math.max(0, value));

function renderComposition(state, targetData = []) {
  const card = document.querySelector("#composition-card");
  if (!state.subjectLocation) {
    card.hidden = true;
    return;
  }

  card.hidden = false;
  try {
    const selectedDate = new Date(state.selectedDateTime);
    const geometry = subjectGeometry(state.cameraLocation, state.subjectLocation);
    const sunData = calculateSunData(selectedDate, state.cameraLocation);
    const sensor = SENSOR_PRESETS[state.composition.sensorPreset] || SENSOR_PRESETS["full-frame"];
    const targetAltitude = calculateTargetAltitude({
      distanceMeters: geometry.distanceMeters,
      cameraElevationMeters: state.composition.cameraElevationMeters,
      cameraHeightMeters: state.composition.cameraHeightMeters,
      targetElevationMeters: state.subject.groundElevationMeters,
      targetHeightMeters: state.subject.heightMeters,
      targetMode: state.subject.targetMode,
    });
    const visualHeightMeters = state.subject.targetMode === "terrain" ? 0.1 : state.subject.heightMeters;
    const composition = calculateComposition({
      distanceMeters: geometry.distanceMeters,
      subjectHeightMeters: visualHeightMeters,
      cameraElevationMeters: targetAltitude.cameraAbsoluteMeters,
      subjectElevationMeters: state.subject.groundElevationMeters,
      focalLengthMm: state.composition.focalLengthMm,
      sensorWidthMm: sensor.widthMm,
      sensorHeightMm: sensor.heightMm,
      orientation: state.composition.orientation,
      celestialBodies: targetData.map((data) => ({
        id: data.target.id,
        label: data.target.shortLabel,
        symbol: data.target.symbol,
        color: data.target.color,
        azimuthDifferenceDegrees: signedAngleDifference(geometry.bearingDegrees, data.azimuth),
        altitudeDegrees: data.altitude,
      })),
    });

    card.classList.remove("has-composition-error");
    document.querySelector('[data-composition-field="status"]').textContent = state.subject.targetMode === "terrain" ? "地形照準点" : composition.framing;
    document.querySelector('[data-composition-field="horizontal-fov"]').textContent = `${composition.horizontalDegrees.toFixed(1)}°`;
    document.querySelector('[data-composition-field="vertical-fov"]').textContent = `${composition.verticalDegrees.toFixed(1)}°`;
    document.querySelector('[data-composition-field="fill"]').textContent = composition.verticalFillPercent > 0 && composition.verticalFillPercent < 1
      ? "1%未満" : `${composition.verticalFillPercent.toFixed(0)}%`;
    const sensorHeight = state.composition.orientation === "portrait" ? sensor.widthMm : sensor.heightMm;
    const suggestedFocal = focalLengthForFill({ angularHeightDegrees: composition.angularHeightDegrees, sensorHeightMm: sensorHeight });
    document.querySelector('[data-composition-field="suggested-focal"]').textContent = suggestedFocal
      ? suggestedFocal > 2000 ? "2000 mm超" : `${Math.round(suggestedFocal)} mm`
      : "—";
    document.querySelector('[data-terrain-field="camera-elevation"]').textContent = `${targetAltitude.cameraAbsoluteMeters.toFixed(1)} m`;
    document.querySelector('[data-terrain-field="target-elevation"]').textContent = `${targetAltitude.targetAbsoluteMeters.toFixed(1)} m`;
    document.querySelector('[data-terrain-field="target-altitude"]').textContent = `${targetAltitude.altitudeDegrees.toFixed(2)}°`;
    const planningSunAltitude = apparentSolarAltitude(sunData.altitude);
    document.querySelector('[data-terrain-field="sun-vertical-difference"]').textContent = `${(planningSunAltitude - targetAltitude.altitudeDegrees).toFixed(2)}°`;
    document.querySelector('[data-composition-field="message"]').textContent = state.subject.targetMode === "terrain"
      ? `${state.subject.name || "地形点"}の推定仰角は${targetAltitude.altitudeDegrees.toFixed(2)}°（幾何学値 ${targetAltitude.geometricAltitudeDegrees.toFixed(2)}°）。`
      : `${state.subject.name || "被写体"}は垂直画角の${composition.verticalFillPercent.toFixed(0)}%。上端の推定仰角は${targetAltitude.altitudeDegrees.toFixed(2)}°（幾何学値 ${targetAltitude.geometricAltitudeDegrees.toFixed(2)}°）です。`;
    document.querySelector("#composition-frame-label").textContent = `${sensor.name.toUpperCase()} · ${state.composition.focalLengthMm}mm · ${state.composition.orientation === "portrait" ? "縦" : "横"}`;
    document.querySelector("#composition-viewfinder").classList.toggle("is-portrait", state.composition.orientation === "portrait");
    document.querySelector("#composition-subject-label").textContent = state.subject.name || "被写体";

    const subjectElement = document.querySelector("#composition-subject");
    const top = clampPercent(composition.subjectTopPercent);
    const bottom = clampPercent(composition.subjectBottomPercent);
    subjectElement.style.top = `${top}%`;
    subjectElement.style.height = `${Math.max(2, bottom - top)}%`;
    subjectElement.classList.toggle("is-clipped", composition.verticalFillPercent > 100);
    subjectElement.classList.toggle("is-terrain-point", state.subject.targetMode === "terrain");
    const horizon = document.querySelector("#composition-horizon");
    horizon.style.top = `${clampPercent(composition.horizonPercent)}%`;
    horizon.classList.toggle("is-outside", composition.horizonPercent < 0 || composition.horizonPercent > 100);

    const bodyContainer = document.querySelector("#composition-celestial-bodies");
    bodyContainer.replaceChildren(...composition.bodyPositions.map((body) => {
      const element = document.createElement("span");
      element.className = `composition-body composition-body-${body.id}`;
      element.dataset.compositionBody = body.id;
      element.style.setProperty("--target-color", body.color);
      const symbol = document.createElement("i");
      symbol.textContent = body.symbol;
      const label = document.createElement("b");
      label.textContent = body.label;
      element.append(symbol, label);
      element.style.left = `${body.xPercent}%`;
      element.style.top = `${body.yPercent}%`;
      element.classList.toggle("is-outside", !body.isInsideFrame);
      element.title = body.isInsideFrame ? `${body.label}はフレーム内` : `${body.label}はフレーム外`;
      return element;
    }));
  } catch (error) {
    card.classList.add("has-composition-error");
    document.querySelector('[data-composition-field="status"]').textContent = "入力を確認";
    document.querySelector('[data-composition-field="message"]').textContent = error.message || "構図を計算できません";
  }
}

function clearToastTimer() {
  window.clearTimeout(toastTimer);
  toastTimer = null;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  const action = document.querySelector("#toast-action");
  const dismiss = document.querySelector("#toast-dismiss");
  document.querySelector("#toast-message").textContent = message;
  action.hidden = true;
  action.disabled = false;
  action.textContent = "更新";
  action.onclick = null;
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "通知を閉じる");
  toast.hidden = false;
  clearToastTimer();
  toastTimer = window.setTimeout(() => {
    if (action.hidden) toast.hidden = true;
    toastTimer = null;
  }, 3600);
}

function showServiceWorkerUpdate(worker) {
  const toast = document.querySelector("#toast");
  const action = document.querySelector("#toast-action");
  const dismiss = document.querySelector("#toast-dismiss");
  document.querySelector("#toast-message").textContent = "CelestiFrameの新しいバージョンがあります";
  action.textContent = "更新";
  action.disabled = false;
  action.hidden = false;
  action.onclick = () => {
    action.disabled = true;
    action.textContent = "更新中…";
    worker.postMessage({ type: "SKIP_WAITING" });
  };
  dismiss.textContent = "後で";
  dismiss.setAttribute("aria-label", "更新を後で行う");
  clearToastTimer();
  toast.hidden = false;
}

document.querySelector("#toast-dismiss").addEventListener("click", () => {
  clearToastTimer();
  document.querySelector("#toast").hidden = true;
});

function setCameraLocation(location, options) {
  store.setState((state) => ({ ...state, cameraLocation: location }));
  mapController?.setLocation(location, options);
}

function setSubjectLocationFromMap(subjectLocation) {
  store.setState((state) => ({
    ...state,
    subjectLocation,
    subject: { ...state.subject, name: "被写体" },
  }));
}

function updateLocationMode(mode) {
  activeLocationMode = mode;
  const cameraActive = mode === "camera";
  const subjectActive = mode === "subject";
  mapStage.classList.toggle("is-arming", Boolean(mode));
  mapStage.classList.toggle("is-subject-arming", subjectActive);
  setLocationButton.classList.toggle("is-active", cameraActive);
  subjectLocationButton.classList.toggle("is-active", subjectActive);
  setLocationButton.innerHTML = cameraActive
    ? '<span aria-hidden="true">◎</span> 中央を撮影地点にする'
    : '<span aria-hidden="true">＋</span> 撮影地点';
  subjectLocationButton.innerHTML = subjectActive
    ? '<span aria-hidden="true">◆</span> 中央を被写体地点にする'
    : '<span aria-hidden="true">◇</span> 被写体地点';
}

function initializeMap() {
  const state = store.getState();
  try {
    mapController = createMapController({
      elementId: "map",
      initialLocation: state.cameraLocation,
      initialZoom: state.map.zoom,
      onLocationChange: (cameraLocation) => store.setState((current) => ({ ...current, cameraLocation })),
      onSubjectLocationChange: setSubjectLocationFromMap,
      onMapMove: (map) => store.setState((current) => ({ ...current, map })),
      onShootingCandidateSelect: (candidate) => {
        store.setState((current) => ({ ...current, cameraLocation: candidate.location }));
        showToast(`${candidate.label}・${candidate.distanceLabel}候補を撮影地点に設定しました`);
      },
      tileUrl: runtimeConfig.tileUrl,
    });
  } catch (error) {
    console.error(error);
    document.querySelector("#map-fallback").hidden = false;
  }
}

function applyPlanState(planState) {
  store.setState((state) => ({
    ...state,
    ...planState,
    subject: {
      ...state.subject,
      ...planState.subject,
      heightMeters: Number(planState.subject?.heightMeters) > 0
        ? Number(planState.subject.heightMeters)
        : Number(state.subject.heightMeters) > 0 ? state.subject.heightMeters : 10,
    },
    composition: { ...state.composition, ...planState.composition },
    settings: state.settings,
  }));
  mapController?.setLocation(planState.cameraLocation, { pan: false });
  if (planState.subjectLocation) {
    mapController?.setSubjectLocation(planState.cameraLocation, planState.subjectLocation);
    mapController?.focusLocation(planState.subjectLocation, planState.map?.zoom || 14);
  } else {
    mapController?.clearSubjectLocation();
    mapController?.focusLocation(planState.cameraLocation, planState.map?.zoom || 14);
  }
}

setLocationButton.addEventListener("click", () => {
  if (!mapController) return showToast("地図を読み込んでから地点を設定してください");
  if (activeLocationMode !== "camera") {
    updateLocationMode("camera");
    showToast("地図を動かし、ファインダーを撮影地点に合わせてください");
    return;
  }
  mapController.pickCenter();
  updateLocationMode(null);
  showToast("撮影地点を更新しました");
});

subjectLocationButton.addEventListener("click", () => {
  if (!mapController) return showToast("地図を読み込んでから被写体地点を設定してください");
  if (activeLocationMode !== "subject") {
    updateLocationMode("subject");
    showToast("地図を動かし、ファインダーを被写体へ合わせてください");
    return;
  }
  mapController.pickSubjectCenter();
  updateLocationMode(null);
  showToast("被写体地点を設定しました");
});

document.querySelector("#locate-button").addEventListener("click", () => {
  if (!mapController) return showToast("地図を読み込んでから現在地へ移動してください");
  if (!navigator.geolocation) return showToast("この端末では現在地を利用できません");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      focusCurrentLocation(mapController, { latitude: coords.latitude, longitude: coords.longitude });
      showToast("現在地へ移動しました。撮影地点は変更していません");
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

document.querySelectorAll('input[name="direction-line-origin"]').forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    store.setState((state) => ({
      ...state,
      settings: { ...state.settings, directionLineOrigin: input.value },
    }));
  });
});

systemThemeQuery.addEventListener("change", () => {
  if (store.getState().settings.theme === "system") applyTheme("system");
});

const compositionControls = bindCompositionControls(store);
bindElevationControls(store, showToast);
bindTargetSelector(store, showToast);

function renderState(state) {
  applyTheme(state.settings.theme);
  const directionLineOrigin = ["camera", "subject", "both"].includes(state.settings.directionLineOrigin)
    ? state.settings.directionLineOrigin
    : "both";
  document.querySelectorAll('input[name="direction-line-origin"]').forEach((input) => {
    input.checked = input.value === directionLineOrigin;
  });
  document.querySelector("#coordinates").value = `${state.cameraLocation.latitude.toFixed(5)}, ${state.cameraLocation.longitude.toFixed(5)}`;
  document.querySelectorAll("[data-requires-subject]").forEach((button) => {
    button.hidden = !state.subjectLocation;
  });
  document.querySelectorAll("[data-card]").forEach((card) => {
    card.hidden = !state.selectedTargets.includes(card.dataset.card);
  });
  let targetData = [];
  try {
    targetData = calculateSelectedTargets(state.selectedTargets, new Date(state.selectedDateTime), state.cameraLocation);
  } catch (error) {
    console.error("Selected target calculation failed", error);
  }
  renderSun(state, targetData.find((data) => data.target.id === "sun"));
  renderMoon(state, targetData.find((data) => data.target.id === "moon"));
  renderMilkyWay(state, targetData.find((data) => data.target.id === "milkyway"));
  renderStellarTargets(targetData);
  renderCelestialDirections(state, targetData);
  renderAlignment(state, targetData);
  renderComposition(state, targetData);
  compositionControls.sync(state);
  const compactDate = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(state.selectedDateTime));
  const compactTargets = targetLabelList(state.selectedTargets, { short: true }).join("・");
  document.querySelector("#deck-compact-summary").textContent = `${compactDate} ・ ${compactTargets}`;
}

store.subscribe(renderState);

document.querySelector("#timezone-label").textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || "LOCAL";
bindDateTimeControls(store);
bindSearchControls(store, showToast);
initializeMap();
bindPlaceSearch(store, () => mapController, showToast, { geocoderEndpoint: runtimeConfig.nominatimEndpoint });
bindWeatherOverlay(store, () => mapController, { endpoint: runtimeConfig.weatherForecastEndpoint });
const localPlanRepository = createPlanRepository();
const planSyncCoordinator = createPlanSyncCoordinator(localPlanRepository);
const planManager = bindPlanManager(store, {
  applyState: applyPlanState,
  showToast,
  repository: planSyncCoordinator,
});
bindCloudAccount({
  coordinator: planSyncCoordinator,
  store,
  showToast,
  onPlansChanged: planManager.refresh,
});
bindShootingPlanner(store, () => mapController, showToast);
bindTerrainProfile(store, () => mapController, showToast);
bindFieldMode(store, showToast);
renderState(store.getState());
if (sharedState) showToast("共有された撮影計画を開きました");

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });
  try {
    const registration = await navigator.serviceWorker.register("./service-worker.js");
    let lastUpdateCheck = 0;
    const checkForUpdates = () => {
      const now = Date.now();
      if (now - lastUpdateCheck < 60_000) return;
      lastUpdateCheck = now;
      registration.update().catch((error) => console.warn("Service Worker update check failed", error));
    };
    const observedWorkers = new WeakSet();
    const observeUpdateWorker = (worker) => {
      if (!worker || observedWorkers.has(worker)) return;
      observedWorkers.add(worker);
      const announceWhenReady = () => {
        if (worker.state !== "installed" || !navigator.serviceWorker.controller) return;
        showServiceWorkerUpdate(worker);
      };
      worker.addEventListener("statechange", announceWhenReady);
      announceWhenReady();
    };
    if (registration.waiting && navigator.serviceWorker.controller) showServiceWorkerUpdate(registration.waiting);
    observeUpdateWorker(registration.installing);
    registration.addEventListener("updatefound", () => observeUpdateWorker(registration.installing));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) checkForUpdates();
    });
    window.addEventListener("focus", checkForUpdates);
    window.addEventListener("online", checkForUpdates);
    window.setInterval(checkForUpdates, 30 * 60_000);
    checkForUpdates();
  } catch (error) {
    console.warn("Service Worker registration failed", error);
  }
}
