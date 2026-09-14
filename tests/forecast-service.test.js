import test from "node:test";
import assert from "node:assert/strict";
import {
  buildForecastUrl,
  createForecastGrid,
  createForecastSnapshot,
  isForecastHour,
  isPastForecastHour,
  normalizeForecastSnapshot,
  parseForecastResponse,
  toForecastHour,
} from "../js/weather/forecast-service.js";

test("missing forecast measurements stay unknown while genuine zero is retained", () => {
  const hour = "2026-09-06T12:00";
  const locations = [{ latitude: 35, longitude: 139 }];
  const [result] = parseForecastResponse({ hourly: { time: [hour], cloud_cover: [null], wind_speed_10m: [0] } }, locations, hour);
  assert.equal(result.forecast.total, null);
  assert.equal(result.forecast.precipitationProbability, null);
  assert.equal(result.forecast.visibilityMeters, null);
  assert.equal(result.forecast.temperatureC, null);
  assert.equal(result.forecast.relativeHumidityPercent, null);
  assert.equal(result.forecast.dewPointC, null);
  assert.equal(result.forecast.temperatureDewPointSpreadC, null);
  assert.equal(result.forecast.windKmh, 0);
  assert.throws(() => parseForecastResponse({ hourly: {} }, locations, hour), /選択時刻/);
});

test("forecast grid divides the visible map into bounded cells", () => {
  const cells = createForecastGrid({ north: 36, south: 35, east: 140, west: 139 }, { rows: 2, columns: 2 });
  assert.equal(cells.length, 4);
  assert.deepEqual(cells[0].bounds, { north: 36, south: 35.5, east: 139.5, west: 139 });
  assert.equal(cells[3].latitude, 35.25);
  assert.equal(cells[3].longitude, 139.75);
});

test("forecast URL batches locations and only asks for the selected hour", () => {
  const url = buildForecastUrl("https://weather.example.test/forecast", [{ latitude: 35.68, longitude: 139.76 }, { latitude: 35.7, longitude: 139.8 }], "2026-07-14T21:00");
  assert.equal(url.searchParams.get("latitude"), "35.6800,35.7000");
  assert.equal(url.searchParams.get("longitude"), "139.7600,139.8000");
  assert.equal(url.searchParams.get("start_hour"), "2026-07-14T21:00");
  assert.equal(url.searchParams.get("end_hour"), "2026-07-14T21:00");
  assert.match(url.searchParams.get("hourly"), /cloud_cover_low/);
  assert.match(url.searchParams.get("hourly"), /temperature_2m/);
  assert.match(url.searchParams.get("hourly"), /relative_humidity_2m/);
  assert.match(url.searchParams.get("hourly"), /dew_point_2m/);
  assert.equal(url.searchParams.get("temperature_unit"), "celsius");
});

test("past forecast URL includes the previous day without a conflicting fixed range", () => {
  const url = buildForecastUrl("https://weather.example.test/forecast", [{ latitude: 35.68, longitude: 139.76 }], "2026-07-14T03:00", { includePast: true });
  assert.equal(url.searchParams.get("past_days"), "2");
  assert.equal(url.searchParams.get("forecast_days"), "1");
  assert.equal(url.searchParams.has("start_hour"), false);
  assert.equal(url.searchParams.has("end_hour"), false);
});

test("forecast response selects the requested hour and normalizes cloud metrics", () => {
  const locations = [{ latitude: 35.68, longitude: 139.76 }];
  const [result] = parseForecastResponse({
    hourly: {
      time: ["2026-07-14T20:00", "2026-07-14T21:00"],
      cloud_cover: [15, 120], cloud_cover_low: [5, 25], cloud_cover_mid: [5, 35], cloud_cover_high: [5, 45],
      visibility: [10000, 12345], precipitation_probability: [0, 14], wind_speed_10m: [3, 12], wind_gusts_10m: [4, 20],
      temperature_2m: [18.2, 21.4], relative_humidity_2m: [76, 68], dew_point_2m: [14.1, 14.2],
    },
  }, locations, "2026-07-14T21:00");
  assert.equal(result.forecast.total, 100);
  assert.equal(result.forecast.low, 25);
  assert.equal(result.forecast.visibilityMeters, 12345);
  assert.equal(result.forecast.gustKmh, 20);
  assert.equal(result.forecast.temperatureC, 21.4);
  assert.equal(result.forecast.relativeHumidityPercent, 68);
  assert.equal(result.forecast.dewPointC, 14.2);
  assert.ok(Math.abs(result.forecast.temperatureDewPointSpreadC - 7.2) < 1e-12);
});

test("forecast snapshots preserve a point forecast and normalize ISO timestamps", () => {
  const snapshot = createForecastSnapshot({
    location: { latitude: 35.68, longitude: 139.76 },
    hour: "2026-07-14T21:00",
    forecast: { temperatureC: 21.4, dewPointC: 14.2, temperatureDewPointSpreadC: 7.2 },
    fetchedAt: "2026-07-14T12:34:56.000Z",
  });
  assert.equal(snapshot.fetchedAt, Date.parse("2026-07-14T12:34:56.000Z"));
  assert.equal(snapshot.forecast.temperatureC, 21.4);
  assert.equal(snapshot.forecast.relativeHumidityPercent, null);
  assert.equal(normalizeForecastSnapshot({ ...snapshot, version: 99 }), null);
  assert.equal(normalizeForecastSnapshot({ ...snapshot, location: { latitude: 95, longitude: 139 } }), null);
});

test("forecast hour follows Asia Tokyo and accepts the prior 48 hours", () => {
  assert.equal(toForecastHour("2026-07-14T12:42:00.000Z"), "2026-07-14T21:00");
  assert.equal(isForecastHour("2026-07-29T12:00:00.000Z", new Date("2026-07-14T00:00:00.000Z")), true);
  assert.equal(isForecastHour("2026-07-31T12:00:00.000Z", new Date("2026-07-14T00:00:00.000Z")), false);
  assert.equal(isForecastHour("2026-07-12T02:38:00.000Z", new Date("2026-07-14T02:38:00.000Z")), true);
  assert.equal(isForecastHour("2026-07-12T02:37:59.000Z", new Date("2026-07-14T02:38:00.000Z")), false);
  assert.equal(isPastForecastHour("2026-07-14T03:00", new Date("2026-07-14T02:38:00.000Z")), true);
  assert.equal(isPastForecastHour("2026-07-14T11:00", new Date("2026-07-14T02:38:00.000Z")), false);
});
