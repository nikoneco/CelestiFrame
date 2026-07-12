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
  },
  composition: {
    cameraElevationMeters: 0,
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
    timeStepMinutes: 1,
    coordinateFormat: "decimal",
  },
};

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored) return structuredClone(defaultState);
    return {
      ...structuredClone(defaultState),
      ...stored,
      cameraLocation: { ...defaultState.cameraLocation, ...stored.cameraLocation },
      subject: { ...defaultState.subject, ...stored.subject },
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
