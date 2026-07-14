export const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  nominatimEndpoint: "https://nominatim.openstreetmap.org/search",
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  lightPollutionTileUrl: "./assets/light-pollution/vnp46a4-2025/{z}/{x}/{y}.webp",
  lightPollutionDataYear: 2025,
  weatherForecastEndpoint: "https://api.open-meteo.com/v1/forecast",
});

function validateHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    throw new Error(`${label}は認証情報やフラグメントを含まないHTTPS URLで指定してください`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`${label}は認証情報やフラグメントを含まないHTTPS URLで指定してください`);
  }
  return String(value);
}

function validateLightPollutionTileUrl(value) {
  const text = String(value);
  if (text.startsWith("./") || text.startsWith("/")) {
    const segments = text.replace(/\\/g, "/").split("/");
    const url = new URL(text, "https://celestiframe.invalid/");
    if (text.includes("\\") || text.includes("?") || text.includes("#") || segments.includes("..")
      || url.origin !== "https://celestiframe.invalid" || !url.pathname.startsWith("/assets/")) {
      throw new Error("Light pollution tile URLの相対パスはassets配下で指定してください");
    }
    return text;
  }
  return validateHttpsUrl(text, "Light pollution tile URL");
}

export function normalizeRuntimeConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("実行時設定の形式が正しくありません");
  }
  const nominatimEndpoint = validateHttpsUrl(value.nominatimEndpoint, "Nominatim endpoint");
  const tileUrl = validateHttpsUrl(value.tileUrl, "Tile URL");
  const lightPollutionTileUrl = validateLightPollutionTileUrl(value.lightPollutionTileUrl);
  const lightPollutionDataYear = Number(value.lightPollutionDataYear);
  if (!Number.isInteger(lightPollutionDataYear) || lightPollutionDataYear < 2012 || lightPollutionDataYear > 2100) {
    throw new Error("Light pollution data yearが正しくありません");
  }
  const weatherForecastEndpoint = validateHttpsUrl(value.weatherForecastEndpoint, "Weather forecast endpoint");
  [
    [tileUrl, "Tile URL"],
    [lightPollutionTileUrl, "Light pollution tile URL"],
  ].forEach(([template, label]) => {
    if (!["{z}", "{x}", "{y}"].every((token) => template.includes(token))) {
      throw new Error(`${label}には{z}、{x}、{y}が必要です`);
    }
  });
  return Object.freeze({ nominatimEndpoint, tileUrl, lightPollutionTileUrl, lightPollutionDataYear, weatherForecastEndpoint });
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
