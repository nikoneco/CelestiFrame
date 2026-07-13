import test from "node:test";
import assert from "node:assert/strict";
import { projectCelestialTarget } from "../js/field/celestial-projection.js";

const northHorizonCamera = { azimuth: 0, altitude: 0, roll: 0 };

test("3D celestial projection centers a target at the camera direction", () => {
  const projection = projectCelestialTarget({ azimuth: 0, altitude: 0 }, northHorizonCamera);
  assert.equal(projection.isVisible, true);
  assert.ok(Math.abs(projection.x - 50) < 0.001);
  assert.ok(Math.abs(projection.y - 50) < 0.001);
});

test("3D celestial projection places a higher target above the camera center", () => {
  const projection = projectCelestialTarget({ azimuth: 0, altitude: 20 }, northHorizonCamera);
  assert.equal(projection.isVisible, true);
  assert.ok(projection.y < 50);
});

test("3D celestial projection rejects a target behind the camera", () => {
  const projection = projectCelestialTarget({ azimuth: 180, altitude: 0 }, northHorizonCamera);
  assert.equal(projection.isInFront, false);
  assert.equal(projection.isVisible, false);
});
