import test from "node:test";
import assert from "node:assert/strict";
import { terrainProfileKey } from "../js/terrain/terrain-profile-controller.js";

test("terrain results depend on heights, elevations and target mode as well as coordinates", () => {
  const state = { cameraLocation: { latitude: 35, longitude: 139 }, subjectLocation: { latitude: 35.1, longitude: 139 },
    composition: { cameraHeightMeters: 100, cameraElevationMeters: 0, cameraElevationStatus: "ready" },
    subject: { heightMeters: 100, targetMode: "structure", groundElevationMeters: 0, groundElevationStatus: "ready" } };
  const initial = terrainProfileKey(state);
  for (const [group, field, value] of [["composition", "cameraHeightMeters", 0], ["composition", "cameraElevationMeters", 20],
    ["composition", "cameraElevationStatus", "error"], ["subject", "heightMeters", 0], ["subject", "targetMode", "terrain"],
    ["subject", "groundElevationMeters", 20], ["subject", "groundElevationStatus", "error"]]) {
    const changed = structuredClone(state);
    changed[group][field] = value;
    assert.notEqual(terrainProfileKey(changed), initial, field);
  }
  assert.equal(terrainProfileKey({ ...state, selectedDateTime: "2026-09-06T12:00:00Z" }), initial);
});
import { analyzeTerrainProfile, interpolateLocation, fetchTerrainProfile } from "../js/terrain/terrain-profile.js";

test("terrain requests are bounded to three and output stays in distance order", async () => {
  let active = 0, maximum = 0;
  const progress = [];
  const analysis = await fetchTerrainProfile({ latitude: 35, longitude: 139 }, { latitude: 35.01, longitude: 139 }, {
    sampleCount: 9,
    onProgress: (value) => progress.push(value),
    fetchElevationImpl: async (location) => {
      active++; maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, Math.round((35.01 - location.latitude) * 1000)));
      active--;
      return { meters: location.latitude, source: "fixture" };
    },
  });
  assert.equal(maximum, 3);
  assert.equal(analysis.points.length, 9);
  assert.deepEqual(analysis.points.map((point) => point.distanceMeters), analysis.points.map((point) => point.distanceMeters).sort((a,b)=>a-b));
  assert.deepEqual(progress, Array.from({length:9}, (_unused,index)=>(index+1)/9));
});

test("interpolateLocation returns the midpoint", () => {
  assert.deepEqual(interpolateLocation({ latitude: 35, longitude: 139 }, { latitude: 36, longitude: 141 }, 0.5), { latitude: 35.5, longitude: 140 });
});

test("terrain analysis detects an obstruction above the sightline", () => {
  const analysis = analyzeTerrainProfile([
    { distanceMeters: 0, elevationMeters: 0 },
    { distanceMeters: 500, elevationMeters: 200 },
    { distanceMeters: 1000, elevationMeters: 0 },
  ]);
  assert.equal(analysis.isClear, false);
  assert.ok(analysis.obstruction.clearanceMeters < 0);
});

test("terrain analysis accepts a clear low profile", () => {
  const analysis = analyzeTerrainProfile([
    { distanceMeters: 0, elevationMeters: 100 },
    { distanceMeters: 500, elevationMeters: 0 },
    { distanceMeters: 1000, elevationMeters: 100 },
  ], { cameraHeightMeters: 2 });
  assert.equal(analysis.isClear, true);
});
