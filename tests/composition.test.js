import test from "node:test";
import assert from "node:assert/strict";
import { calculateComposition, fieldOfView, focalLengthForFill } from "../js/composition/composition.js";

test("50mm full-frame field of view is optically plausible", () => {
  const fov = fieldOfView({ sensorWidthMm: 36, sensorHeightMm: 24, focalLengthMm: 50 });
  assert.ok(Math.abs(fov.horizontalDegrees - 39.6) < 0.1);
  assert.ok(Math.abs(fov.verticalDegrees - 27.0) < 0.1);
});

test("portrait orientation swaps horizontal and vertical field of view", () => {
  const landscape = fieldOfView({ sensorWidthMm: 36, sensorHeightMm: 24, focalLengthMm: 50 });
  const portrait = fieldOfView({ sensorWidthMm: 36, sensorHeightMm: 24, focalLengthMm: 50, orientation: "portrait" });
  assert.equal(portrait.horizontalDegrees, landscape.verticalDegrees);
  assert.equal(portrait.verticalDegrees, landscape.horizontalDegrees);
});

test("composition calculates subject fill and celestial frame position", () => {
  const result = calculateComposition({
    distanceMeters: 100,
    subjectHeightMeters: 10,
    focalLengthMm: 50,
    sensorWidthMm: 36,
    sensorHeightMm: 24,
    celestialBodies: [{ id: "moon", azimuthDifferenceDegrees: 0, altitudeDegrees: 2.855 }],
  });
  assert.ok(result.verticalFillPercent > 20 && result.verticalFillPercent < 22);
  assert.ok(Math.abs(result.bodyPositions[0].xPercent - 50) < 0.01);
  assert.ok(Math.abs(result.bodyPositions[0].yPercent - 50) < 0.1);
  assert.equal(result.bodyPositions[0].isInsideFrame, true);
});

test("focalLengthForFill suggests a longer lens for greater target fill", () => {
  const half = focalLengthForFill({ angularHeightDegrees: 5, sensorHeightMm: 24, targetFill: 0.5 });
  const eighty = focalLengthForFill({ angularHeightDegrees: 5, sensorHeightMm: 24, targetFill: 0.8 });
  assert.ok(eighty > half);
});

test("composition rejects coincident camera and subject points", () => {
  assert.throws(() => calculateComposition({ distanceMeters: 0, subjectHeightMeters: 10, focalLengthMm: 50, sensorWidthMm: 36, sensorHeightMm: 24 }), /離して/);
});
