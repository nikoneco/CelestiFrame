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
  const panel = document.querySelector("#weather-panel");
  const panelClose = document.querySelector("#weather-panel-close");
  const clearButton = document.querySelector("#weather-clear");
  const refreshButton = document.querySelector("#weather-refresh");
  const status = document.querySelector("#weather-status");
  const selectedTime = document.querySelector("#weather-time");
  const source = document.querySelector("#weather-source");
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
    const secondaryMode = activeMode && activeMode !== "total" ? CLOUD_MODES.total : CLOUD_MODES.low;
    root.classList.toggle("is-active", Boolean(mode));
    root.classList.toggle("is-panel-open", !panel.hidden);
    toggle.setAttribute("aria-pressed", String(Boolean(mode)));
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    toggle.querySelector("strong").textContent = mode ? `${mode.label} ${latestForecast ? formatPercent(latestForecast[activeMode]) : "…"}` : "予報雲";
    primaryLabel.textContent = primaryMode.label === "総雲" ? "総雲量" : `${primaryMode.label}雲`;
    secondaryLabel.textContent = secondaryMode.label === "総雲" ? "総雲量" : `${secondaryMode.label}雲`;
    total.textContent = latestForecast ? formatPercent(latestForecast[activeMode || "total"]) : "—";
    low.textContent = latestForecast ? formatPercent(latestForecast[secondaryMode === CLOUD_MODES.total ? "total" : "low"]) : "—";
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

  function clearOverlay({ message = "雲レイヤーを表示していません" } = {}) {
    requestController?.abort();
    requestController = null;
    activeMode = null;
    getMapController()?.clearCloudOverlay();
    setMetrics(null);
    setStatus(message);
    render();
  }

  function scheduleRefresh({ force = false, delay = 450 } = {}) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => refresh({ force }), delay);
  }

  async function refresh({ force = false } = {}) {
    const mapController = getMapController();
    const state = store.getState();
    if (!activeMode || !mapController) return;
    if (!isForecastHour(state.selectedDateTime)) {
      mapController.clearCloudOverlay();
      setMetrics(null);
      setStatus("予報雲は前日から16日先まで表示できます");
      render();
      return;
    }
    const hour = toForecastHour(state.selectedDateTime);
    const bounds = mapController.getVisibleBounds();
    const key = `${hour}|${mapKey(bounds)}`;
    const grid = createForecastGrid(bounds);
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
        setStatus(navigator.onLine ? "空況データを取得できません" : "オフラインでは予報雲を更新できません");
        render();
        return;
      } finally {
        if (sequence === requestSequence) setStatus("予報雲を地図に表示中");
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
    if (!activeMode) activeMode = "total";
    render();
    scheduleRefresh({ delay: 0 });
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
  clearButton.addEventListener("click", () => clearOverlay());
  refreshButton.addEventListener("click", () => {
    cache.clear();
    scheduleRefresh({ force: true, delay: 0 });
  });
  modeButtons.forEach((button) => button.addEventListener("click", () => {
    activeMode = button.dataset.weatherMode;
    render();
    scheduleRefresh({ delay: 0 });
  }));

  store.subscribe((state) => {
    selectedTime.textContent = `${formatSelectedTime(state.selectedDateTime)} の予報`;
    if (!activeMode) return;
    const stateKey = `${state.selectedDateTime}|${state.cameraLocation.latitude.toFixed(3)}|${state.cameraLocation.longitude.toFixed(3)}|${state.map.center.latitude.toFixed(3)}|${state.map.center.longitude.toFixed(3)}|${state.map.zoom}`;
    if (stateKey === lastStateKey) return;
    lastStateKey = stateKey;
    scheduleRefresh();
  });

  clearOverlay();
  return { refresh: () => refresh(), clear: clearOverlay };
}
