import { normalizeSelectedTargets } from "./astronomy/target-catalog.js?v=1";

const STORAGE_KEY = "celestiframe:state:v1";

const defaultState = {
  selectedDateTime: new Date().toISOString(),
  selectedTargets: ["moon"],
  cameraLocation: {
    latitude: 35.681236,
    longitude: 139.767125,
  },
  subjectLocation: null,
  subject: {
    name: "被写体",
    heightMeters: 10,
    groundElevationMeters: 0,
    groundElevationStatus: "error",
    groundElevationSource: "",
    groundElevationMode: "auto",
    groundElevationKey: "",
    targetMode: "structure",
  },
  composition: {
    cameraElevationMeters: 0,
    cameraHeightMeters: 1.5,
    cameraElevationStatus: "error",
    cameraElevationSource: "",
    cameraElevationMode: "auto",
    cameraElevationKey: "",
    focalLengthMm: 50,
    sensorPreset: "full-frame",
    orientation: "landscape",
  },
  map: {
    zoom: 13,
    center: {
      latitude: 35.681236,
      longitude: 139.767125,
    },
  },
  settings: {
    theme: "dark",
    directionLineOrigin: "both",
    timeStepMinutes: 1,
    coordinateFormat: "decimal",
  },
};

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeState(stored);
  } catch {
    return structuredClone(defaultState);
  }
}

const oneOf = (value, options, fallback) => options.includes(value) ? value : fallback;
const finiteNumber = (value, fallback, { min = -Infinity, max = Infinity } = {}) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
};
const safeText = (value, fallback, maxLength) => typeof value === "string" ? value.slice(0, maxLength) : fallback;

function normalizeLocation(value, fallback = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback ? structuredClone(fallback) : null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return fallback ? structuredClone(fallback) : null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return fallback ? structuredClone(fallback) : null;
  return { latitude, longitude };
}

export function normalizeState(value) {
  const fallback = structuredClone(defaultState);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const subjectValue = value.subject && typeof value.subject === "object" ? value.subject : {};
  const compositionValue = value.composition && typeof value.composition === "object" ? value.composition : {};
  const settingsValue = value.settings && typeof value.settings === "object" ? value.settings : {};
  const mapValue = value.map && typeof value.map === "object" ? value.map : {};
  const cameraLocation = normalizeLocation(value.cameraLocation, fallback.cameraLocation);
  const selectedDate = new Date(value.selectedDateTime);

  return {
    selectedDateTime: Number.isNaN(selectedDate.getTime()) ? fallback.selectedDateTime : selectedDate.toISOString(),
    selectedTargets: normalizeSelectedTargets(value.selectedTargets, value.selectedBody),
    cameraLocation,
    subjectLocation: normalizeLocation(value.subjectLocation),
    subject: {
      name: safeText(subjectValue.name, fallback.subject.name, 120) || fallback.subject.name,
      heightMeters: finiteNumber(subjectValue.heightMeters, fallback.subject.heightMeters, { min: 0.1, max: 10000 }),
      groundElevationMeters: finiteNumber(subjectValue.groundElevationMeters, fallback.subject.groundElevationMeters, { min: -500, max: 9000 }),
      groundElevationStatus: oneOf(subjectValue.groundElevationStatus, ["loading", "ready", "manual", "error"], fallback.subject.groundElevationStatus),
      groundElevationSource: safeText(subjectValue.groundElevationSource, fallback.subject.groundElevationSource, 120),
      groundElevationMode: oneOf(subjectValue.groundElevationMode, ["auto", "manual"], fallback.subject.groundElevationMode),
      groundElevationKey: safeText(subjectValue.groundElevationKey, fallback.subject.groundElevationKey, 80),
      targetMode: oneOf(subjectValue.targetMode, ["terrain", "structure"], fallback.subject.targetMode),
    },
    composition: {
      cameraElevationMeters: finiteNumber(compositionValue.cameraElevationMeters, fallback.composition.cameraElevationMeters, { min: -500, max: 9000 }),
      cameraHeightMeters: finiteNumber(compositionValue.cameraHeightMeters, fallback.composition.cameraHeightMeters, { min: 0, max: 100 }),
      cameraElevationStatus: oneOf(compositionValue.cameraElevationStatus, ["loading", "ready", "manual", "error"], fallback.composition.cameraElevationStatus),
      cameraElevationSource: safeText(compositionValue.cameraElevationSource, fallback.composition.cameraElevationSource, 120),
      cameraElevationMode: oneOf(compositionValue.cameraElevationMode, ["auto", "manual"], fallback.composition.cameraElevationMode),
      cameraElevationKey: safeText(compositionValue.cameraElevationKey, fallback.composition.cameraElevationKey, 80),
      focalLengthMm: finiteNumber(compositionValue.focalLengthMm, fallback.composition.focalLengthMm, { min: 1, max: 2000 }),
      sensorPreset: oneOf(compositionValue.sensorPreset, ["full-frame", "aps-c", "mft", "one-inch"], fallback.composition.sensorPreset),
      orientation: oneOf(compositionValue.orientation, ["landscape", "portrait"], fallback.composition.orientation),
    },
    map: {
      zoom: finiteNumber(mapValue.zoom, fallback.map.zoom, { min: 2, max: 19 }),
      center: normalizeLocation(mapValue.center, cameraLocation),
    },
    settings: {
      theme: oneOf(settingsValue.theme, ["system", "light", "dark", "red"], fallback.settings.theme),
      directionLineOrigin: oneOf(settingsValue.directionLineOrigin, ["camera", "subject", "both"], fallback.settings.directionLineOrigin),
      timeStepMinutes: finiteNumber(settingsValue.timeStepMinutes, fallback.settings.timeStepMinutes, { min: 1, max: 60 }),
      coordinateFormat: oneOf(settingsValue.coordinateFormat, ["decimal", "dms"], fallback.settings.coordinateFormat),
    },
  };
}

export function createStore() {
  let state = loadState();
  const listeners = new Set();
  let persistTimer;

  function notify() {
    listeners.forEach((listener) => listener(state));
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, 120);
  }

  return {
    getState: () => state,
    setState(update) {
      state = typeof update === "function" ? update(state) : { ...state, ...update };
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  };
}
