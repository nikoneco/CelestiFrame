import test from "node:test";
import assert from "node:assert/strict";
import { clearElevationCache, elevationLocationKey, fetchElevation } from "../js/elevation/elevation-service.js";

test("elevationLocationKey validates and normalizes coordinates", () => {
  assert.equal(elevationLocationKey({ latitude: 35.3606012, longitude: 138.7273988 }), "35.360601,138.727399");
  assert.throws(() => elevationLocationKey({ latitude: 91, longitude: 0 }), /緯度/);
});

test("fetchElevation parses GSI elevation data and caches coordinates", async () => {
  clearElevationCache();
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ elevation: 3770.4, hsrc: "1m（レーザ）" }) };
  };
  const location = { latitude: 35.3606, longitude: 138.7274 };
  const first = await fetchElevation(location, { fetcher });
  const second = await fetchElevation(location, { fetcher });
  assert.deepEqual(first, { meters: 3770.4, source: "1m（レーザ）", key: "35.360600,138.727400" });
  assert.equal(second, first);
  assert.equal(calls, 1);
});

test("fetchElevation rejects missing elevation data", async () => {
  clearElevationCache();
  const fetcher = async () => ({ ok: true, json: async () => ({ elevation: "-----", hsrc: "-----" }) });
  await assert.rejects(() => fetchElevation({ latitude: 0, longitude: 0 }, { fetcher }), /ありません/);
});
