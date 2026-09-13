import { createLruCache } from "../utils/lru-cache.js?v=1.8.0";

const ENDPOINT = "https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php";
const cache = createLruCache(200);

export function elevationLocationKey(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new TypeError("緯度が正しくありません");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new TypeError("経度が正しくありません");
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

export async function fetchElevation(location, { signal, fetcher = fetch, force = false, timeoutMs = 12000 } = {}) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const key = elevationLocationKey(location);
  const cached = !force ? cache.get(key) : undefined;
  if (cached) return cached;
  const [latitude, longitude] = key.split(",");
  const url = new URL(ENDPOINT);
  url.searchParams.set("lon", longitude);
  url.searchParams.set("lat", latitude);
  url.searchParams.set("outtype", "JSON");
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("標高の取得がタイムアウトしました。再取得してください", "TimeoutError")), timeoutMs);
  try {
    const response = await fetcher(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`標高データを取得できませんでした (${response.status})`);
    const data = await response.json();
    const meters = Number(data?.elevation);
    if (data?.elevation == null || data.elevation === "" || data.elevation === "-----" || !Number.isFinite(meters)) throw new Error("この地点の標高データがありません");
    const result = Object.freeze({ meters, source: String(data.hsrc || "国土地理院DEM"), key });
    cache.set(key, result);
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function clearElevationCache() {
  cache.clear();
}
