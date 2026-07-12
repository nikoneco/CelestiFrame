import test from "node:test";
import assert from "node:assert/strict";
import { apparentSolarAltitude, calculateTargetAltitude, classifyDiamondAlignment } from "../js/geometry/target-altitude.js";

test("target altitude adds structure height but not terrain height", () => {
  const common = { distanceMeters: 1000, cameraElevationMeters: 10, cameraHeightMeters: 1.5, targetElevationMeters: 10, targetHeightMeters: 100, refractionCoefficient: 0 };
  const terrain = calculateTargetAltitude({ ...common, targetMode: "terrain" });
  const structure = calculateTargetAltitude({ ...common, targetMode: "structure" });
  assert.ok(terrain.altitudeDegrees < 0);
  assert.ok(structure.altitudeDegrees > 5);
  assert.equal(terrain.targetAbsoluteMeters, 10);
  assert.equal(structure.targetAbsoluteMeters, 110);
});

test("target altitude includes earth curvature across long distances", () => {
  const result = calculateTargetAltitude({ distanceMeters: 100000, cameraElevationMeters: 0, cameraHeightMeters: 0, targetElevationMeters: 0, refractionCoefficient: 0 });
  assert.ok(result.altitudeDegrees < -0.4 && result.altitudeDegrees > -0.5);
  assert.ok(result.curvatureDropMeters > 780 && result.curvatureDropMeters < 790);
});

test("diamond classification distinguishes center, disk and near states", () => {
  assert.equal(classifyDiamondAlignment({ azimuthDifferenceDegrees: 0.02, sunAltitudeDegrees: 2.02, targetAltitudeDegrees: 2 }).state, "center");
  assert.equal(classifyDiamondAlignment({ azimuthDifferenceDegrees: 0.2, sunAltitudeDegrees: 2.1, targetAltitudeDegrees: 2 }).state, "disk");
  assert.equal(classifyDiamondAlignment({ azimuthDifferenceDegrees: 0.45, sunAltitudeDegrees: 2.2, targetAltitudeDegrees: 2 }).state, "near");
});

test("solar refraction raises the apparent sun near the horizon", () => {
  assert.ok(apparentSolarAltitude(0) > 0.45);
  assert.equal(apparentSolarAltitude(-2), -2);
});
