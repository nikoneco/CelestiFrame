import {
  CLOUD_MODES,
  createForecastGrid,
  createForecastSnapshot,
  fetchForecastGrid,
  isForecastHour,
  isPastForecastHour,
  normalizeForecastSnapshot,
  toForecastHour,
} from "./forecast-service.js?v=1.9.1";
import { calculateMoonConditions } from "./moon-conditions.js?v=1.9.1";
import { createLruCache } from "../utils/lru-cache.js?v=1.9.1";

const formatPercent = (value) => Number.isFinite(value) ? `${Math.round(value)}%` : "—";
const formatNumber = (value) => Number.isFinite(value) ? String(Math.round(value)) : "—";
const formatTemperature = (value) => Number.isFinite(value) ? `${Number(value).toFixed(1)}°C` : "—";
const formatHumidity = (value) => Number.isFinite(value) ? `${Number(value).toFixed(0)}%` : "—";
const formatVisibility = (meters) => !Number.isFinite(meters) ? "—" : meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km` : `${Math.round(meters)} m`;
const formatFetchedAt = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "時刻不明" : new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
    timeZone: "Asia/Tokyo",
  }).format(date);
};
const formatSelectedTime = (value) => new Intl.DateTimeFormat("ja-JP", {
  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo",
}).format(new Date(value));

function sameLocation(first, second) {
  return Boolean(first && second)
    && Math.abs(Number(first.latitude) - Number(second.latitude)) <= 0.0001
    && Math.abs(Number(first.longitude) - Number(second.longitude)) <= 0.0001;
}

function mapKey(bounds) {
  return [bounds.north, bounds.south, bounds.east, bounds.west].map((value) => Number(value).toFixed(3)).join(":");
}

export function bindWeatherOverlay(store, getMapController, { endpoint, fetchImpl = fetch } = {}) {
  const root = document.querySelector("#weather-overlay");
  const toggle = document.querySelector("#weather-toggle");
  const layerToggle = document.querySelector("#weather-layer-toggle");
  const panelLayerToggle = document.querySelector("#weather-panel-layer-toggle");
  const panel = document.querySelector("#weather-panel");
  const panelClose = document.querySelector("#weather-panel-close");
  const refreshButton = document.querySelector("#weather-refresh");
  const status = document.querySelector("#weather-status");
  const selectedTime = document.querySelector("#weather-time");
  const source = document.querySelector("#weather-source");
  const metrics = document.querySelector(".weather-metrics");
  const primaryLabel = document.querySelector("#weather-primary-label");
  const secondaryLabel = document.querySelector("#weather-secondary-label");
  const total = document.querySelector("#weather-total");
  const low = document.querySelector("#weather-low");
  const visibility = document.querySelector("#weather-visibility");
  const wind = document.querySelector("#weather-wind");
  const precipitation = document.querySelector("#weather-precipitation");
  const temperature = document.querySelector("#weather-temperature");
  const humidity = document.querySelector("#weather-humidity");
  const dewPoint = document.querySelector("#weather-dew-point");
  const dewSpread = document.querySelector("#weather-dew-spread");
  const moonConditions = document.querySelector("#weather-moon-conditions");
  const modeButtons = [...document.querySelectorAll("[data-weather-mode]")];
  const cache = createLruCache(24);
  let activeMode = null;
  let isLayerEnabled = false;
  let latestForecast = null;
  let latestSnapshot = null;
  let latestSnapshotSource = "none";
  let requestController = null;
  let refreshTimer = null;
  let requestSequence = 0;
  let lastStateKey = "";

  function renderMoonConditions(state) {
    if (!moonConditions) return;
    try {
      const selectedTarget = state?.selectedTargets?.[0] || null;
      const conditions = calculateMoonConditions(
        new Date(state?.selectedDateTime),
        state?.cameraLocation,
        selectedTarget,
      );
      const altitude = Number.isFinite(conditions.moonAltitudeDegrees)
        ? `${conditions.moonAltitudeDegrees.toFixed(1)}°`
        : "—";
      const illumination = Number.isFinite(conditions.moonIlluminationPercent)
        ? `${conditions.moonIlluminationPercent.toFixed(1)}%`
        : "—";
      const distance = Number.isFinite(conditions.angularDistanceDegrees)
        ? `${conditions.angularDistanceDegrees.toFixed(1)}°`
        : "—";
      moonConditions.textContent = `月高度 ${altitude}・月照明率 ${illumination}・${conditions.targetLabel}との角距離 ${distance}`;
    } catch (error) {
      console.warn("Moon conditions calculation failed", error);
      moonConditions.textContent = "月条件を計算できません";
    }
  }

  function setMetrics(forecast, state = store.getState()) {
    latestForecast = forecast || null;
    visibility.textContent = forecast ? formatVisibility(forecast.visibilityMeters) : "—";
    wind.textContent = forecast ? `${formatNumber(forecast.windKmh)} / ${formatNumber(forecast.gustKmh)}` : "—";
    precipitation.textContent = forecast ? `降水 ${formatPercent(forecast.precipitationProbability)}` : "降水 —";
    if (temperature) temperature.textContent = forecast ? formatTemperature(forecast.temperatureC) : "—";
    if (humidity) humidity.textContent = forecast ? formatHumidity(forecast.relativeHumidityPercent) : "—";
    if (dewPoint) dewPoint.textContent = forecast ? formatTemperature(forecast.dewPointC) : "—";
    if (dewSpread) dewSpread.textContent = forecast ? formatTemperature(forecast.temperatureDewPointSpreadC) : "—";
    renderMoonConditions(state);
  }

  function clearMetrics(state = store.getState()) {
    latestSnapshot = null;
    latestSnapshotSource = "none";
    setMetrics(null, state);
  }

  function setSnapshot(snapshot, source = "network") {
    latestSnapshot = normalizeForecastSnapshot(snapshot);
    latestSnapshotSource = latestSnapshot ? source : "none";
  }

  function setReadyStatus() {
    if (latestSnapshotSource === "offline" && latestSnapshot) {
      source.textContent = `Open-Meteo・保存値（${formatFetchedAt(latestSnapshot.fetchedAt)}）`;
      setStatus(`保存済み予報（取得 ${formatFetchedAt(latestSnapshot.fetchedAt)}）`);
      return;
    }
    source.textContent = "Open-Meteo・予報値";
    setStatus(isLayerEnabled ? "予報雲を地図に表示中" : "予報値を表示中");
  }

  function render() {
    const mode = activeMode && CLOUD_MODES[activeMode];
    const primaryMode = mode || CLOUD_MODES.total;
    const isTotalMode = primaryMode === CLOUD_MODES.total;
    const secondaryMode = isTotalMode ? CLOUD_MODES.low : CLOUD_MODES.total;
    root.classList.toggle("is-active", Boolean(mode && isLayerEnabled));
    root.classList.toggle("is-panel-open", !panel.hidden);
    metrics.classList.remove("is-total");
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    layerToggle.setAttribute("aria-checked", String(Boolean(mode && isLayerEnabled)));
    panelLayerToggle?.setAttribute("aria-pressed", String(Boolean(mode && isLayerEnabled)));
    if (panelLayerToggle) panelLayerToggle.textContent = mode && isLayerEnabled ? "雲レイヤーを非表示" : "雲レイヤーを表示";
    toggle.querySelector("strong").textContent = mode && isLayerEnabled ? `${mode.label} ${latestForecast ? formatPercent(latestForecast[activeMode]) : "…"}` : "星景条件";
    primaryLabel.textContent = primaryMode.label === "総雲" ? "総雲量" : `${primaryMode.label}雲`;
    secondaryLabel.textContent = secondaryMode.label === "総雲" ? "総雲量" : `${secondaryMode.label}雲`;
    total.textContent = latestForecast ? formatPercent(latestForecast[activeMode || "total"]) : "—";
    low.textContent = latestForecast ? formatPercent(latestForecast[isTotalMode ? "low" : "total"]) : "—";
    modeButtons.forEach((button) => {
      const selected = button.dataset.weatherMode === activeMode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function setStatus(message, { busy = false } = {}) {
    status.textContent = message;
    root.classList.toggle("is-loading", busy);
    refreshButton.disabled = busy;
  }

  function cancelPendingRefresh() {
    requestSequence++;
    requestController?.abort();
    requestController = null;
  }

  function setLayerEnabled(enabled, { message } = {}) {
    cancelPendingRefresh();
    isLayerEnabled = Boolean(enabled);
    if (!isLayerEnabled) {
      getMapController()?.clearCloudOverlay();
      setStatus(message || "雲レイヤーを非表示にしました");
    }
    render();
    if (!isLayerEnabled && !panel.hidden && activeMode) scheduleRefresh({ delay: 0 });
  }

  function scheduleRefresh({ force = false, delay = 450 } = {}) {
    cancelPendingRefresh();
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => refresh({ force }), delay);
  }

  async function refresh({ force = false } = {}) {
    requestController?.abort();
    const sequence = ++requestSequence;
    const state = store.getState();
    if (!activeMode || (panel.hidden && !isLayerEnabled)) return;
    if (!isForecastHour(state.selectedDateTime)) {
      getMapController()?.clearCloudOverlay();
      if (latestSnapshotSource === "offline" && latestSnapshot?.hour === toForecastHour(state.selectedDateTime)
        && sameLocation(latestSnapshot.location, state.cameraLocation)) {
        isLayerEnabled = false;
        setReadyStatus();
        render();
        return;
      }
      clearMetrics(state);
      isLayerEnabled = false;
      setStatus("予報雲は48時間前から16日先まで表示できます");
      render();
      return;
    }
    const hour = toForecastHour(state.selectedDateTime);
    const mapController = getMapController();
    const useLayer = Boolean(isLayerEnabled && mapController);
    const bounds = useLayer ? mapController.getVisibleBounds() : null;
    const grid = useLayer ? createForecastGrid(bounds, { rows: 7, columns: 7 }) : [];
    const locations = [state.cameraLocation, ...grid];
    const locationKey = `${state.cameraLocation.latitude.toFixed(4)},${state.cameraLocation.longitude.toFixed(4)}`;
    const key = useLayer ? `grid|${hour}|${mapKey(bounds)}|${locationKey}` : `point|${hour}|${locationKey}`;
    selectedTime.textContent = `${formatSelectedTime(state.selectedDateTime)} の予報`;
    const cached = !force ? cache.get(key) : null;
    let records = cached && Date.now() - cached.fetchedAt < 15 * 60 * 1000 ? cached.records : null;
    let fetchedAt = cached?.fetchedAt || null;
    if (!records) {
      requestController?.abort();
      requestController = new AbortController();
      setStatus(useLayer ? "地図の雲を読んでいます…" : "予報値を読んでいます…", { busy: true });
      try {
        records = await fetchForecastGrid({ endpoint, locations, hour, includePast: isPastForecastHour(hour), fetchImpl, signal: requestController.signal });
        if (sequence !== requestSequence) return;
        fetchedAt = Date.now();
        cache.set(key, { records, fetchedAt });
      } catch (error) {
        if (error?.name === "AbortError" || sequence !== requestSequence) return;
        console.warn("Weather forecast fetch failed", error);
        mapController?.clearCloudOverlay();
        const online = typeof navigator === "undefined" || navigator.onLine !== false;
        const savedSnapshot = latestSnapshotSource === "offline"
          && latestSnapshot
          && sameLocation(latestSnapshot.location, state.cameraLocation)
          && latestSnapshot.hour === hour;
        if (savedSnapshot) {
          isLayerEnabled = false;
          setReadyStatus();
          render();
          return;
        }
        clearMetrics(state);
        isLayerEnabled = false;
        setStatus(online ? "空況データを取得できません" : "オフラインでは予報値を更新できません");
        render();
        return;
      } finally {
        if (sequence === requestSequence && isLayerEnabled) setStatus("予報雲を地図に表示中");
      }
    }
    if (sequence !== requestSequence || !records?.length || !fetchedAt) return;
    const [cameraRecord, ...gridRecords] = records;
    setSnapshot(createForecastSnapshot({
      location: cameraRecord.location,
      hour,
      forecast: cameraRecord.forecast,
      fetchedAt,
    }), "network");
    setMetrics(cameraRecord.forecast, state);
    if (useLayer) {
      mapController.setCloudOverlay(gridRecords.map((record, index) => ({
        ...grid[index],
        value: record.forecast[activeMode],
      })).filter((cell) => Number.isFinite(cell.value)), { color: CLOUD_MODES[activeMode].color });
    } else {
      mapController?.clearCloudOverlay();
    }
    setReadyStatus();
    render();
  }

  function openPanel() {
    panel.hidden = false;
    if (!activeMode) {
      activeMode = "total";
      isLayerEnabled = true;
    }
    render();
    scheduleRefresh({ delay: 0 });
  }

  toggle.addEventListener("click", () => {
    if (panel.hidden) openPanel();
    else {
      panel.hidden = true;
      cancelPendingRefresh();
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
      render();
      if (isLayerEnabled) scheduleRefresh({ delay: 0 });
    }
  });
  panelClose.addEventListener("click", () => {
    panel.hidden = true;
    cancelPendingRefresh();
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
    render();
    if (isLayerEnabled) scheduleRefresh({ delay: 0 });
  });
  layerToggle.addEventListener("click", () => {
    if (isLayerEnabled) {
      setLayerEnabled(false);
    } else {
      if (!activeMode) activeMode = "total";
      isLayerEnabled = true;
      render();
      scheduleRefresh({ delay: 0 });
    }
  });
  panelLayerToggle?.addEventListener("click", () => layerToggle.click());
  refreshButton.addEventListener("click", () => {
    cache.clear();
    scheduleRefresh({ force: true, delay: 0 });
  });
  modeButtons.forEach((button) => button.addEventListener("click", () => {
    activeMode = button.dataset.weatherMode;
    render();
    if (!panel.hidden) scheduleRefresh({ delay: 0 });
  }));

  store.subscribe((state) => {
    selectedTime.textContent = `${formatSelectedTime(state.selectedDateTime)} の予報`;
    renderMoonConditions(state);
    const stateKey = `${toForecastHour(state.selectedDateTime)}|${state.cameraLocation.latitude.toFixed(4)}|${state.cameraLocation.longitude.toFixed(4)}|${state.map.center.latitude.toFixed(3)}|${state.map.center.longitude.toFixed(3)}|${state.map.zoom}`;
    if (stateKey === lastStateKey) return;
    lastStateKey = stateKey;
    cancelPendingRefresh();
    const matchingSnapshot = latestSnapshot?.hour === toForecastHour(state.selectedDateTime)
      && sameLocation(latestSnapshot?.location, state.cameraLocation);
    if (!matchingSnapshot) clearMetrics(state);
    getMapController()?.clearCloudOverlay();
    render();
    if (activeMode && (isLayerEnabled || !panel.hidden)) scheduleRefresh();
  });

  setMetrics(null);
  setStatus("雲レイヤーを表示していません");
  render();

  function getSnapshot() {
    if (!latestSnapshot) return null;
    return {
      ...latestSnapshot,
      location: { ...latestSnapshot.location },
      forecast: { ...latestSnapshot.forecast },
      fetchedAt: new Date(latestSnapshot.fetchedAt).toISOString(),
    };
  }

  function restoreSnapshot(snapshot) {
    if (snapshot == null) {
      requestSequence++;
      requestController?.abort();
      requestController = null;
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
      clearMetrics(store.getState());
      isLayerEnabled = false;
      getMapController()?.clearCloudOverlay();
      source.textContent = "Open-Meteo・予報値";
      if (!panel.hidden) setStatus("予報値を表示していません");
      render();
      return false;
    }
    const normalized = normalizeForecastSnapshot(snapshot);
    if (!normalized) return false;
    const state = store.getState();
    let hour;
    try {
      hour = toForecastHour(state.selectedDateTime);
    } catch {
      return false;
    }
    if (!sameLocation(normalized.location, state.cameraLocation) || normalized.hour !== hour) return false;
    requestSequence++;
    requestController?.abort();
    requestController = null;
    window.clearTimeout(refreshTimer);
    refreshTimer = null;
    latestSnapshot = normalized;
    latestSnapshotSource = "offline";
    isLayerEnabled = false;
    getMapController()?.clearCloudOverlay();
    selectedTime.textContent = `${formatSelectedTime(state.selectedDateTime)} の予報`;
    setMetrics(normalized.forecast, state);
    setReadyStatus();
    render();
    return true;
  }

  return {
    refresh: () => refresh(),
    clear: () => setLayerEnabled(false),
    getSnapshot,
    restoreSnapshot,
  };
}
