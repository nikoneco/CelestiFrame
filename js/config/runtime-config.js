export const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  nominatimEndpoint: "https://nominatim.openstreetmap.org/search",
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  lightPollutionTileUrl: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg",
  weatherForecastEndpoint: "https://api.open-meteo.com/v1/forecast",
});

function validateHttpsUrl(value, label) {
  const url = new URL(String(value));
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`${label}は認証情報やフラグメントを含まないHTTPS URLで指定してください`);
  }
  return String(value);
}

export function normalizeRuntimeConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("実行時設定の形式が正しくありません");
  }
  const nominatimEndpoint = validateHttpsUrl(value.nominatimEndpoint, "Nominatim endpoint");
  const tileUrl = validateHttpsUrl(value.tileUrl, "Tile URL");
  const lightPollutionTileUrl = validateHttpsUrl(value.lightPollutionTileUrl, "Light pollution tile URL");
  const weatherForecastEndpoint = validateHttpsUrl(value.weatherForecastEndpoint, "Weather forecast endpoint");
  [
    [tileUrl, "Tile URL"],
    [lightPollutionTileUrl, "Light pollution tile URL"],
  ].forEach(([template, label]) => {
    if (!["{z}", "{x}", "{y}"].every((token) => template.includes(token))) {
      throw new Error(`${label}には{z}、{x}、{y}が必要です`);
    }
  });
  return Object.freeze({ nominatimEndpoint, tileUrl, lightPollutionTileUrl, weatherForecastEndpoint });
}

export async function loadRuntimeConfig({
  fetchImpl = fetch,
  url = "./config/runtime-config.json",
} = {}) {
  try {
    const response = await fetchImpl(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`設定ファイルを取得できません（${response.status}）`);
    return normalizeRuntimeConfig(await response.json());
  } catch (error) {
    console.warn("実行時設定を読み込めないため既定値を使用します", error);
    return DEFAULT_RUNTIME_CONFIG;
  }
}
