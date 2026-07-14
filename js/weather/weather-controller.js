import { CLOUD_MODES, createForecastGrid, fetchForecastGrid, isForecastHour, isPastForecastHour, toForecastHour } from "./forecast-service.js?v=2";

const formatPercent = (value) => `${Math.round(Number(value) || 0)}%`;
const formatVisibility = (meters) => meters >= 1000 ? `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km` : `${Math.round(meters)} m`;
const formatSelectedTime = (value) => new Intl.DateTimeFormat("ja-JP", {
  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo",
}).format(new Date(value));

function mapKey(bounds) {
  return [bounds.north, bounds.south, bounds.east, bounds.west].map((value) => Number(value).toFixed(3)).join(":");
}

export function bindWeatherOverlay(store, getMapController, { endpoint, fetchImpl = fetch } = {}) {
  const root = document.querySelector("#weather-overlay");
  const toggle = document.querySelector("#weather-toggle");
  const layerToggle = document.querySelector("#weather-layer-toggle");
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
  const modeButtons = [...document.querySelectorAll("[data-weather-mode]")];
  const cache = new Map();
  let activeMode = null;
  let isLayerEnabled = false;
  let latestForecast = null;
  let requestController = null;
  let refreshTimer = null;
  let requestSequence = 0;
  let lastStateKey = "";

  function setMetrics(forecast) {
    latestForecast = forecast || null;
    visibility.textContent = forecast ? formatVisibility(forecast.visibilityMeters) : "—";
    wind.textContent = forecast ? `${Math.round(forecast.windKmh)} / ${Math.round(forecast.gustKmh)}` : "—";
    precipitation.textContent = forecast ? `降水 ${formatPercent(forecast.precipitationProbability)}` : "降水 —";
  }

  function render() {
    const mode = activeMode && CLOUD_MODES[activeMode];
    const primaryMode = mode || CLOUD_MODES.total;
    const secondaryMode = CLOUD_MODES.total;
    const isTotalMode = primaryMode === CLOUD_MODES.total;
    root.classList.toggle("is-active", Boolean(mode && isLayerEnabled));
    root.classList.toggle("is-panel-open", !panel.hidden);
    metrics.classList.toggle("is-total", isTotalMode);
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    layerToggle.setAttribute("aria-checked", String(Boolean(mode && isLayerEnabled)));
    toggle.querySelector("strong").textContent = mode && isLayerEnabled ? `${mode.label} ${latestForecast ? formatPercent(latestForecast[activeMode]) : "…"}` : "予報雲";
    primaryLabel.textContent = primaryMode.label === "総雲" ? "総雲量" : `${primaryMode.label}雲`;
    secondaryLabel.textContent = secondaryMode.label === "総雲" ? "総雲量" : `${secondaryMode.label}雲`;
    total.textContent = latestForecast ? formatPercent(latestForecast[activeMode || "total"]) : "—";
    low.textContent = latestForecast ? formatPercent(latestForecast.total) : "—";
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

  function setLayerEnabled(enabled, { message } = {}) {
    requestController?.abort();
    requestController = null;
    isLayerEnabled = Boolean(enabled);
    if (!isLayerEnabled) {
      getMapController()?.clearCloudOverlay();
      setStatus(message || "雲レイヤーを非表示にしました");
    }
    render();
  }

  function scheduleRefresh({ force = false, delay = 450 } = {}) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => refresh({ force }), delay);
  }

  async function refresh({ force = false } = {}) {
    const mapController = getMapController();
    const state = store.getState();
    if (!activeMode || !isLayerEnabled || !mapController) return;
    if (!isForecastHour(state.selectedDateTime)) {
      mapController.clearCloudOverlay();
      setMetrics(null);
      isLayerEnabled = false;
      setStatus("予報雲は前日から16日先まで表示できます");
      render();
      return;
    }
    const hour = toForecastHour(state.selectedDateTime);
    const bounds = mapController.getVisibleBounds();
    const key = `${hour}|${mapKey(bounds)}`;
    const grid = createForecastGrid(bounds, { rows: 7, columns: 7 });
    const locations = [state.cameraLocation, ...grid];
    selectedTime.textContent = `${formatSelectedTime(state.selectedDateTime)} の予報`;
    source.textContent = "Open-Meteo・予報値";
    let records = !force ? cache.get(key) : null;
    if (!records) {
      requestController?.abort();
      requestController = new AbortController();
      const sequence = ++requestSequence;
      setStatus("地図の雲を読んでいます…", { busy: true });
      try {
        records = await fetchForecastGrid({ endpoint, locations, hour, includePast: isPastForecastHour(hour), fetchImpl, signal: requestController.signal });
        if (sequence !== requestSequence) return;
        cache.set(key, records);
      } catch (error) {
        if (error?.name === "AbortError") return;
        console.warn("Weather forecast fetch failed", error);
        mapController.clearCloudOverlay();
        setMetrics(null);
        isLayerEnabled = false;
        setStatus(navigator.onLine ? "空況データを取得できません" : "オフラインでは予報雲を更新できません");
        render();
        return;
      } finally {
        if (sequence === requestSequence && isLayerEnabled) setStatus("予報雲を地図に表示中");
      }
    }
    const [cameraRecord, ...gridRecords] = records;
    setMetrics(cameraRecord.forecast);
    mapController.setCloudOverlay(gridRecords.map((record, index) => ({
      ...grid[index],
      value: record.forecast[activeMode],
    })), { color: CLOUD_MODES[activeMode].color });
    setStatus("予報雲を地図に表示中");
    render();
  }

  function openPanel() {
    panel.hidden = false;
    if (!activeMode) {
      activeMode = "total";
      isLayerEnabled = true;
    }
    render();
    if (isLayerEnabled) scheduleRefresh({ delay: 0 });
  }

  toggle.addEventListener("click", () => {
    if (panel.hidden) openPanel();
    else {
      panel.hidden = true;
      render();
    }
  });
  panelClose.addEventListener("click", () => {
    panel.hidden = true;
    render();
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
  refreshButton.addEventListener("click", () => {
    cache.clear();
    scheduleRefresh({ force: true, delay: 0 });
  });
  modeButtons.forEach((button) => button.addEventListener("click", () => {
    activeMode = button.dataset.weatherMode;
    render();
    if (isLayerEnabled) scheduleRefresh({ delay: 0 });
  }));

  store.subscribe((state) => {
    selectedTime.textContent = `${formatSelectedTime(state.selectedDateTime)} の予報`;
    if (!activeMode || !isLayerEnabled) return;
    const stateKey = `${state.selectedDateTime}|${state.cameraLocation.latitude.toFixed(3)}|${state.cameraLocation.longitude.toFixed(3)}|${state.map.center.latitude.toFixed(3)}|${state.map.center.longitude.toFixed(3)}|${state.map.zoom}`;
    if (stateKey === lastStateKey) return;
    lastStateKey = stateKey;
    scheduleRefresh();
  });

  setMetrics(null);
  setStatus("雲レイヤーを表示していません");
  render();
  return { refresh: () => refresh(), clear: () => setLayerEnabled(false) };
}
