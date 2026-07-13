import { MAX_PLACE_QUERY_LENGTH, normalizePlaceQuery, searchPlaces } from "./geocoder.js?v=32";

const CACHE_KEY = "celestiframe:place-search:v1";
const COLLAPSED_KEY = "celestiframe:place-search-collapsed:v1";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_REQUEST_INTERVAL_MS = 1000;

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function getCachedResults(query) {
  const entry = readCache()[query];
  if (!entry || Date.now() - entry.savedAt > CACHE_TTL_MS) return null;
  return entry.results;
}

function saveCachedResults(query, results) {
  const cache = readCache();
  cache[query] = { savedAt: Date.now(), results };
  const entries = Object.entries(cache)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt)
    .slice(0, 20);
  localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
}

function resultLabel(displayName) {
  return displayName.split(",")[0].trim();
}

export function bindPlaceSearch(store, getMapController, showToast, { geocoderEndpoint } = {}) {
  const container = document.querySelector(".place-search");
  const form = document.querySelector("#place-search-form");
  const input = document.querySelector("#place-search-input");
  const submit = document.querySelector("#place-search-submit");
  const toggle = document.querySelector("#place-search-toggle");
  const panel = document.querySelector("#place-search-results");
  const list = document.querySelector("#place-search-list");
  const status = document.querySelector("#place-search-status");
  let lastRequestAt = 0;

  function setCollapsed(collapsed, { persist = true } = {}) {
    container.classList.toggle("is-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", collapsed ? "検索バーを開く" : "検索バーを収納");
    toggle.title = collapsed ? "検索バーを開く" : "検索バーを収納";
    if (collapsed) input.blur();
    if (!persist) return;
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // Storage can be unavailable in private browsing; the control still works for this session.
    }
  }

  let startsCollapsed = false;
  try {
    startsCollapsed = localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    startsCollapsed = false;
  }
  setCollapsed(startsCollapsed, { persist: false });

  toggle.addEventListener("click", () => {
    setCollapsed(!container.classList.contains("is-collapsed"));
  });

  function renderResults(results, source) {
    list.replaceChildren();
    panel.hidden = false;
    if (!results.length) {
      status.textContent = "候補が見つかりませんでした";
      return;
    }
    status.textContent = `${results.length}件の候補${source === "cache" ? "（保存済み）" : ""}`;
    results.forEach((place) => {
      const row = document.createElement("div");
      row.className = "place-result";
      const focus = document.createElement("button");
      focus.type = "button";
      focus.className = "place-result-focus";
      const name = document.createElement("strong");
      name.textContent = resultLabel(place.displayName);
      const address = document.createElement("span");
      address.textContent = place.displayName;
      focus.append(name, address);
      focus.addEventListener("click", () => {
        getMapController()?.focusLocation(place, 16);
        panel.hidden = true;
        showToast(`${resultLabel(place.displayName)}へ移動しました`);
      });
      const actions = document.createElement("div");
      actions.className = "place-result-actions";
      const setCamera = document.createElement("button");
      setCamera.type = "button";
      setCamera.className = "place-result-camera";
      setCamera.textContent = "撮影地点";
      setCamera.addEventListener("click", () => {
        const cameraLocation = { latitude: place.latitude, longitude: place.longitude };
        store.setState((state) => ({ ...state, cameraLocation }));
        const mapController = getMapController();
        mapController?.setLocation(cameraLocation);
        panel.hidden = true;
        showToast(`${resultLabel(place.displayName)}を撮影地点に設定しました`);
      });
      const setSubject = document.createElement("button");
      setSubject.type = "button";
      setSubject.className = "place-result-subject";
      setSubject.textContent = "被写体に設定";
      setSubject.addEventListener("click", () => {
        const subjectLocation = { latitude: place.latitude, longitude: place.longitude };
        store.setState((state) => ({
          ...state,
          subjectLocation,
          subject: { ...state.subject, name: resultLabel(place.displayName) },
        }));
        getMapController()?.focusLocation(subjectLocation, 16);
        panel.hidden = true;
        showToast(`${resultLabel(place.displayName)}を被写体に設定しました`);
      });
      actions.append(setCamera, setSubject);
      row.append(focus, actions);
      list.append(row);
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const query = normalizePlaceQuery(input.value);
    if (query.length < 2) return showToast("地名や施設名を2文字以上入力してください");
    if (query.length > MAX_PLACE_QUERY_LENGTH) return showToast(`検索語は${MAX_PLACE_QUERY_LENGTH}文字以内で入力してください`);
    const cached = getCachedResults(query);
    if (cached) return renderResults(cached, "cache");

    submit.disabled = true;
    panel.hidden = false;
    status.textContent = "場所を検索しています…";
    list.replaceChildren();
    try {
      const wait = Math.max(0, MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      lastRequestAt = Date.now();
      const results = await searchPlaces(query, { endpoint: geocoderEndpoint });
      saveCachedResults(query, results);
      renderResults(results, "network");
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "場所検索に失敗しました";
    } finally {
      submit.disabled = false;
    }
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") panel.hidden = true;
  });

  document.querySelector("#place-search-close").addEventListener("click", () => {
    panel.hidden = true;
  });
}
