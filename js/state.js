const STORAGE_KEY = "celestiframe:state:v1";

const defaultState = {
  selectedDateTime: new Date().toISOString(),
  selectedBody: "moon",
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
    if (!stored) return structuredClone(defaultState);
    const subject = { ...defaultState.subject, ...stored.subject };
    if (!Number.isFinite(Number(subject.heightMeters)) || Number(subject.heightMeters) <= 0) subject.heightMeters = defaultState.subject.heightMeters;
    return {
      ...structuredClone(defaultState),
      ...stored,
      cameraLocation: { ...defaultState.cameraLocation, ...stored.cameraLocation },
      subject,
      composition: { ...defaultState.composition, ...stored.composition },
      map: { ...defaultState.map, ...stored.map },
      settings: { ...defaultState.settings, ...stored.settings },
    };
  } catch {
    return structuredClone(defaultState);
  }
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
