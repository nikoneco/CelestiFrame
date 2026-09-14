import test from "node:test";
import assert from "node:assert/strict";
import { offlineLightTileUrls, collectOfflineLight } from "../js/light-pollution/offline-light-pollution.js";
import { stateWithOfflineElevation } from "../js/field/field-data-collector.js";

const template = "./assets/light-pollution/vnp46a4-2025/{z}/{x}/{y}.webp";
const baseUrl = "https://nikoneco.github.io/CelestiFrame/";
const state = { cameraLocation: { latitude: 35.68, longitude: 139.76 }, subjectLocation: { latitude: 34.68, longitude: 135.5 }, map: { zoom: 14 }, composition: {}, subject: {} };

test("offline light tiles are bounded and use only the bundled provider at the Pages subpath", () => {
  const urls = offlineLightTileUrls(state, template, baseUrl);
  assert.ok(urls.length > 0 && urls.length <= 18);
  assert.ok(urls.every((url) => /^https:\/\/nikoneco.github.io\/CelestiFrame\/assets\/light-pollution\/vnp46a4-2025\/8\/\d+\/\d+\.webp$/.test(url)));
  assert.equal(urls.length, new Set(urls).size);
  assert.throws(() => offlineLightTileUrls(state, "https://tile.openstreetmap.org/{z}/{x}/{y}.png", baseUrl), /未対応/);
  assert.throws(() => offlineLightTileUrls({ ...state, cameraLocation: { latitude: 0, longitude: 0 } }, template, baseUrl), /地域外/);
});

test("offline light collection rejects non-image and failed responses instead of marking ready", async () => {
  await assert.rejects(collectOfflineLight(state, { template, baseUrl, fetchImpl: async () => new Response("html") }), /形式/);
  await assert.rejects(collectOfflineLight(state, { template, baseUrl, fetchImpl: async () => new Response("missing", { status: 404 }) }), /404/);
});

test("offline elevation never applies a reading from another location or mutates the plan", () => {
  const part = { status: "ready", data: { camera: { key: "35.680000,139.760000", meters: 18, source: "DEM", mode: "auto" }, subject: { key: "0,0", meters: 999 } } };
  const restored = stateWithOfflineElevation(state, part);
  assert.equal(restored.composition.cameraElevationMeters, 18);
  assert.equal(restored.composition.cameraElevationStatus, "ready");
  assert.equal(restored.subject.groundElevationMeters, undefined);
  assert.deepEqual(state.composition, {});
});
