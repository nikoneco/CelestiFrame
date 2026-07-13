import { createStore } from "./state.js?v=40";
import { createMapController, focusCurrentLocation } from "./map/map-controller.js?v=41";
import { bindPlaceSearch } from "./map/place-search.js?v=34";
import { loadRuntimeConfig } from "./config/runtime-config.js?v=32";
import { bindDateTimeControls } from "./ui/datetime-controls.js?v=12";
import { normalizeThemePreference, resolveThemePreference, themeColor } from "./ui/theme.js?v=6";
import { calculateSunData } from "./astronomy/sun-service.js";
import { calculateMoonData } from "./astronomy/moon-service.js?v=5";
import { calculateMilkyWay } from "./astronomy/milky-way-service.js?v=40";
import { subjectGeometry } from "./geometry/bearing.js?v=7";
import { signedAngleDifference } from "./geometry/angle.js";
import { bindSearchControls } from "./search/search-controller.js?v=43";
import { bindPlanManager } from "./plans/plan-manager.js?v=40";
import { parseSharedState } from "./plans/plan-data.js?v=40";
import { calculateComposition, focalLengthForFill, SENSOR_PRESETS } from "./composition/composition.js?v=19";
import { bindCompositionControls } from "./ui/composition-controls.js?v=24";
import { bindElevationControls } from "./elevation/elevation-controller.js?v=24";
import { apparentSolarAltitude, calculateTargetAltitude } from "./geometry/target-altitude.js?v=24";
import { bindShootingPlanner } from "./planning/shooting-planner.js?v=40";
import { bindTerrainProfile } from "./terrain/terrain-profile-controller.js?v=40";
import { bindFieldMode } from "./field/field-mode.js?v=48";

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
const bodyIsVisible = (selectedBody, body) => selectedBody === body || selectedBody === "all" || selectedBody === "both";
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
    if (bodyIsVisible(state.selectedBody, "moon")) {
      const directions = [];
      if (state.settings.directionLineOrigin !== "subject") {
        directions.push({ location: state.cameraLocation, data: moonData, origin: "camera" });
      }
      if (state.subjectLocation && state.settings.directionLineOrigin !== "camera") {
        directions.push({
          location: state.subjectLocation,
          data: calculateMoonData(selectedDate, state.subjectLocation),
          origin: "subject",
        });
      }
      mapController?.setMoonDirections(directions);
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
    if (bodyIsVisible(state.selectedBody, "sun")) {
      const directions = [];
      if (state.settings.directionLineOrigin !== "subject") {
        directions.push({ location: state.cameraLocation, data: sunData, origin: "camera" });
      }
      if (state.subjectLocation && state.settings.directionLineOrigin !== "camera") {
        directions.push({
          location: state.subjectLocation,
          data: calculateSunData(new Date(state.selectedDateTime), state.subjectLocation),
          origin: "subject",
        });
      }
      mapController?.setSunDirections(directions);
    } else {
      mapController?.clearSunDirection();
    }
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

function renderMilkyWay(state) {
  try {
    const date = new Date(state.selectedDateTime);
    const data = calculateMilkyWay(date, state.cameraLocation);
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
    if (bodyIsVisible(state.selectedBody, "milkyway")) {
      const directions = [];
      if (state.settings.directionLineOrigin !== "subject") directions.push({ location: state.cameraLocation, data, origin: "camera" });
      if (state.subjectLocation && state.settings.directionLineOrigin !== "camera") {
        directions.push({ location: state.subjectLocation, data: calculateMilkyWay(date, state.subjectLocation), origin: "subject" });
      }
      mapController?.setMilkyWayDirections(directions);
    } else {
      mapController?.clearMilkyWayDirection();
    }
  } catch (error) {
    console.error("Milky Way calculation failed", error);
    document.querySelector('[data-milkyway-field="state"]').textContent = "計算できません";
  }
}

function formatDistance(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(2)} km` : `${Math.round(value)} m`;
}

function formatAlignmentDifference(value) {
  if (Math.abs(value) < 0.05) return "正面";
  return `${Math.abs(value).toFixed(1)}°${value > 0 ? "右" : "左"}`;
}

function renderAlignment(state) {
  const card = document.querySelector("#alignment-card");
  if (!state.subjectLocation) {
    card.hidden = true;
    return;
  }

  const selectedDate = new Date(state.selectedDateTime);
  const geometry = subjectGeometry(state.cameraLocation, state.subjectLocation);
  const sunData = calculateSunData(selectedDate, state.cameraLocation);
  const moonData = calculateMoonData(selectedDate, state.cameraLocation);
  const milkyWayData = calculateMilkyWay(selectedDate, state.cameraLocation);
  const sunDifference = signedAngleDifference(geometry.bearingDegrees, sunData.azimuth);
  const moonDifference = signedAngleDifference(geometry.bearingDegrees, moonData.azimuth);
  const milkyWayDifference = signedAngleDifference(geometry.bearingDegrees, milkyWayData.azimuth);
  const candidates = state.selectedBody === "sun"
    ? [{ name: "太陽", difference: sunDifference }]
    : state.selectedBody === "moon"
      ? [{ name: "月", difference: moonDifference }]
      : state.selectedBody === "milkyway"
        ? [{ name: "天の川アーチ", difference: milkyWayDifference }]
        : [{ name: "太陽", difference: sunDifference }, { name: "月", difference: moonDifference }, { name: "天の川アーチ", difference: milkyWayDifference }];
  const closest = candidates.reduce((best, candidate) => (
    Math.abs(candidate.difference) < Math.abs(best.difference) ? candidate : best
  ));
  const absoluteDifference = Math.abs(closest.difference);

  card.hidden = false;
  document.querySelector("#alignment-title").textContent = `${state.subject?.name || "被写体"}との重なり`;
  document.querySelector('[data-alignment-field="distance"]').textContent = formatDistance(geometry.distanceMeters);
  document.querySelector('[data-alignment-field="bearing"]').textContent = geometry.bearingDegrees.toFixed(1);
  document.querySelector('[data-alignment-field="sun-difference"]').textContent = formatAlignmentDifference(sunDifference);
  document.querySelector('[data-alignment-field="moon-difference"]').textContent = formatAlignmentDifference(moonDifference);
  document.querySelector('[data-alignment-field="milkyway-difference"]').textContent = formatAlignmentDifference(milkyWayDifference);
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

function renderComposition(state) {
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
    const moonData = calculateMoonData(selectedDate, state.cameraLocation);
    const milkyWayData = calculateMilkyWay(selectedDate, state.cameraLocation);
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
      celestialBodies: [
        { id: "sun", label: "太陽", azimuthDifferenceDegrees: signedAngleDifference(geometry.bearingDegrees, sunData.azimuth), altitudeDegrees: sunData.altitude },
        { id: "moon", label: "月", azimuthDifferenceDegrees: signedAngleDifference(geometry.bearingDegrees, moonData.azimuth), altitudeDegrees: moonData.altitude },
        { id: "milkyway", label: "天の川", azimuthDifferenceDegrees: signedAngleDifference(geometry.bearingDegrees, milkyWayData.azimuth), altitudeDegrees: milkyWayData.altitude },
      ],
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

    composition.bodyPositions.forEach((body) => {
      const element = document.querySelector(`[data-composition-body="${body.id}"]`);
      element.style.left = `${body.xPercent}%`;
      element.style.top = `${body.yPercent}%`;
      element.hidden = !bodyIsVisible(state.selectedBody, body.id);
      element.classList.toggle("is-outside", !body.isInsideFrame);
      element.title = body.isInsideFrame ? `${body.label}はフレーム内` : `${body.label}はフレーム外`;
    });
  } catch (error) {
    card.classList.add("has-composition-error");
    document.querySelector('[data-composition-field="status"]').textContent = "入力を確認";
    document.querySelector('[data-composition-field="message"]').textContent = error.message || "構図を計算できません";
  }
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
  window.setTimeout(() => {
    if (action.hidden) toast.hidden = true;
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
  toast.hidden = false;
}

document.querySelector("#toast-dismiss").addEventListener("click", () => {
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

document.querySelectorAll("[data-body]").forEach((button) => {
  button.addEventListener("click", () => {
    const selectedBody = button.dataset.body;
    store.setState((state) => ({ ...state, selectedBody }));
  });
});

const compositionControls = bindCompositionControls(store);
bindElevationControls(store, showToast);

store.subscribe((state) => {
  applyTheme(state.settings.theme);
  const directionLineOrigin = ["camera", "subject", "both"].includes(state.settings.directionLineOrigin)
    ? state.settings.directionLineOrigin
    : "both";
  document.querySelectorAll('input[name="direction-line-origin"]').forEach((input) => {
    input.checked = input.value === directionLineOrigin;
  });
  document.querySelector("#coordinates").value = `${state.cameraLocation.latitude.toFixed(5)}, ${state.cameraLocation.longitude.toFixed(5)}`;
  document.querySelectorAll("[data-body]").forEach((button) => {
    const isActive = button.dataset.body === state.selectedBody;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  document.querySelectorAll("[data-requires-subject]").forEach((button) => {
    button.hidden = !state.subjectLocation;
  });
  document.querySelectorAll("[data-card]").forEach((card) => {
    card.hidden = !bodyIsVisible(state.selectedBody, card.dataset.card);
  });
  renderSun(state);
  renderMoon(state);
  renderMilkyWay(state);
  renderAlignment(state);
  renderComposition(state);
  compositionControls.sync(state);
  const compactDate = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(state.selectedDateTime));
  const compactBody = state.selectedBody === "sun" ? "太陽"
    : state.selectedBody === "moon" ? "月"
      : state.selectedBody === "milkyway" ? "天の川" : "全て";
  document.querySelector("#deck-compact-summary").textContent = `${compactDate} ・ ${compactBody}`;
});

document.querySelector("#timezone-label").textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || "LOCAL";
bindDateTimeControls(store);
bindSearchControls(store, showToast);
initializeMap();
bindPlaceSearch(store, () => mapController, showToast, { geocoderEndpoint: runtimeConfig.nominatimEndpoint });
bindPlanManager(store, { applyState: applyPlanState, showToast });
bindShootingPlanner(store, () => mapController, showToast);
bindTerrainProfile(store, () => mapController, showToast);
bindFieldMode(store, showToast);
renderSun(store.getState());
renderMoon(store.getState());
renderMilkyWay(store.getState());
renderAlignment(store.getState());
renderComposition(store.getState());
if (sharedState) showToast("共有された撮影計画を開きました");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
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
      if (registration.waiting && navigator.serviceWorker.controller) {
        showServiceWorkerUpdate(registration.waiting);
      }
      observeUpdateWorker(registration.installing);
      registration.addEventListener("updatefound", () => {
        observeUpdateWorker(registration.installing);
      });
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
  });
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });
}
