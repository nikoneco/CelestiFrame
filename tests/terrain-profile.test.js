import test from "node:test";
import assert from "node:assert/strict";
import { analyzeTerrainProfile, interpolateLocation } from "../js/terrain/terrain-profile.js";

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
