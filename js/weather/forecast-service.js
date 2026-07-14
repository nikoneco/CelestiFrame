export const CLOUD_MODES = Object.freeze({
  total: { label: "総雲", field: "cloud_cover", color: "#dceaff" },
  low: { label: "低層", field: "cloud_cover_low", color: "#78ded1" },
  mid: { label: "中層", field: "cloud_cover_mid", color: "#91b8ec" },
  high: { label: "高層", field: "cloud_cover_high", color: "#c8b2ff" },
});

const HOURLY_FIELDS = [
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "visibility",
  "precipitation_probability",
  "wind_speed_10m",
  "wind_gusts_10m",
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatPart(parts, type) {
  return parts.find((part) => part.type === type)?.value || "";
}

export function toForecastHour(value, timeZone = "Asia/Tokyo") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("撮影日時が正しくありません");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return `${formatPart(parts, "year")}-${formatPart(parts, "month")}-${formatPart(parts, "day")}T${formatPart(parts, "hour")}:00`;
}

export function isForecastHour(value, now = new Date()) {
  const target = new Date(value).getTime();
  const earliest = new Date(now).setMinutes(0, 0, 0) - 60 * 60 * 1000;
  const latest = new Date(now).getTime() + 16 * 24 * 60 * 60 * 1000;
  return Number.isFinite(target) && target >= earliest && target <= latest;
}

export function createForecastGrid(bounds, { rows = 5, columns = 5 } = {}) {
  const north = finiteNumber(bounds?.north, NaN);
  const south = finiteNumber(bounds?.south, NaN);
  const east = finiteNumber(bounds?.east, NaN);
  const west = finiteNumber(bounds?.west, NaN);
  if (![north, south, east, west].every(Number.isFinite) || north <= south || east <= west) {
    throw new Error("地図範囲が正しくありません");
  }
  const safeRows = clamp(Math.round(rows), 2, 8);
  const safeColumns = clamp(Math.round(columns), 2, 8);
  const latitudeStep = (north - south) / safeRows;
  const longitudeStep = (east - west) / safeColumns;
  const cells = [];
  for (let row = 0; row < safeRows; row += 1) {
    for (let column = 0; column < safeColumns; column += 1) {
      const cellNorth = north - latitudeStep * row;
      const cellSouth = north - latitudeStep * (row + 1);
      const cellWest = west + longitudeStep * column;
      const cellEast = west + longitudeStep * (column + 1);
      cells.push({
        latitude: (cellNorth + cellSouth) / 2,
        longitude: (cellWest + cellEast) / 2,
        bounds: { north: cellNorth, south: cellSouth, east: cellEast, west: cellWest },
      });
    }
  }
  return cells;
}

export function buildForecastUrl(endpoint, locations, hour) {
  if (!Array.isArray(locations) || !locations.length || locations.length > 65) throw new Error("予報地点数が正しくありません");
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new Error("予報APIはHTTPSで指定してください");
  const coordinates = locations.map((location) => ({
    latitude: finiteNumber(location?.latitude, NaN),
    longitude: finiteNumber(location?.longitude, NaN),
  }));
  if (coordinates.some(({ latitude, longitude }) => latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || !Number.isFinite(longitude))) {
    throw new Error("予報地点が正しくありません");
  }
  url.searchParams.set("latitude", coordinates.map(({ latitude }) => latitude.toFixed(4)).join(","));
  url.searchParams.set("longitude", coordinates.map(({ longitude }) => longitude.toFixed(4)).join(","));
  url.searchParams.set("hourly", HOURLY_FIELDS.join(","));
  url.searchParams.set("timezone", "Asia/Tokyo");
  url.searchParams.set("start_hour", hour);
  url.searchParams.set("end_hour", hour);
  url.searchParams.set("wind_speed_unit", "kmh");
  return url;
}

function valueAt(record, field, index) {
  return finiteNumber(record?.hourly?.[field]?.[index], 0);
}

export function parseForecastResponse(payload, locations, hour) {
  const records = Array.isArray(payload) ? payload : [payload];
  if (records.length !== locations.length) throw new Error("予報データの地点数が一致しません");
  return records.map((record, index) => {
    const timeIndex = record?.hourly?.time?.indexOf(hour);
    if (timeIndex < 0) throw new Error("選択時刻の予報がありません");
    return {
      location: locations[index],
      forecast: {
        total: clamp(valueAt(record, "cloud_cover", timeIndex), 0, 100),
        low: clamp(valueAt(record, "cloud_cover_low", timeIndex), 0, 100),
        mid: clamp(valueAt(record, "cloud_cover_mid", timeIndex), 0, 100),
        high: clamp(valueAt(record, "cloud_cover_high", timeIndex), 0, 100),
        visibilityMeters: Math.max(0, valueAt(record, "visibility", timeIndex)),
        precipitationProbability: clamp(valueAt(record, "precipitation_probability", timeIndex), 0, 100),
        windKmh: Math.max(0, valueAt(record, "wind_speed_10m", timeIndex)),
        gustKmh: Math.max(0, valueAt(record, "wind_gusts_10m", timeIndex)),
      },
    };
  });
}

export async function fetchForecastGrid({ endpoint, locations, hour, fetchImpl = fetch, signal }) {
  const response = await fetchImpl(buildForecastUrl(endpoint, locations, hour), {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error(`空況データを取得できません（${response.status}）`);
  return parseForecastResponse(await response.json(), locations, hour);
}
