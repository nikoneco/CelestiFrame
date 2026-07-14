import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RUNTIME_CONFIG, loadRuntimeConfig, normalizeRuntimeConfig } from "../js/config/runtime-config.js";

test("normalizeRuntimeConfig accepts HTTPS providers and tile placeholders", () => {
  const config = normalizeRuntimeConfig({
    nominatimEndpoint: "https://geo.example.test/search",
    tileUrl: "https://tiles.example.test/{z}/{x}/{y}.png",
    weatherForecastEndpoint: "https://weather.example.test/forecast",
  });
  assert.equal(config.nominatimEndpoint, "https://geo.example.test/search");
  assert.equal(config.tileUrl, "https://tiles.example.test/{z}/{x}/{y}.png");
  assert.equal(config.weatherForecastEndpoint, "https://weather.example.test/forecast");
});

test("normalizeRuntimeConfig rejects insecure endpoints and incomplete tile templates", () => {
  assert.throws(() => normalizeRuntimeConfig({
    nominatimEndpoint: "http://geo.example.test/search",
    tileUrl: "https://tiles.example.test/{z}/{x}/{y}.png",
    weatherForecastEndpoint: "https://weather.example.test/forecast",
  }), /HTTPS URL/);
  assert.throws(() => normalizeRuntimeConfig({
    nominatimEndpoint: "https://geo.example.test/search",
    tileUrl: "https://tiles.example.test/{z}/{x}.png",
    weatherForecastEndpoint: "https://weather.example.test/forecast",
  }), /\{y\}/);
});

test("loadRuntimeConfig falls back when the runtime file is invalid", async () => {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const config = await loadRuntimeConfig({
      fetchImpl: async () => ({ ok: true, json: async () => ({ nominatimEndpoint: "javascript:alert(1)", tileUrl: "x", weatherForecastEndpoint: "https://weather.example.test/forecast" }) }),
    });
    assert.equal(config, DEFAULT_RUNTIME_CONFIG);
  } finally {
    console.warn = originalWarn;
  }
});
