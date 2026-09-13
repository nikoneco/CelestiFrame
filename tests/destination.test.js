import test from "node:test";
import assert from "node:assert/strict";
import { destinationPoint } from "../js/geometry/destination.js";
import { directionLineLocations, milkyWayFanLocations } from "../js/map/map-controller.js";

const TOKYO = { latitude: 35.681236, longitude: 139.767125 };

test("Milky Way fans keep the nearest world copy across both sides of the date line", () => {
  for (const longitude of [179.999, -179.999]) {
    const origin = { latitude: -17, longitude };
    const points = milkyWayFanLocations(origin, { points: [{ azimuth: 80 }, { azimuth: 100 }, { azimuth: 260 }, { azimuth: 280 }] }, 1500);
    assert.ok(points.every(point => Math.abs(point.longitude - longitude) < 0.02));
    assert.ok(points[1].longitude > longitude);
    assert.ok(points[3].longitude < longitude);
    assert.ok(points.some(point => Math.abs(point.longitude) > 180), "nearby map copies may have unwrapped longitude");
  }
});

test("destinationPoint moves north for a 0 degree bearing", () => {
  const destination = destinationPoint(TOKYO, 0, 1000);
  assert.ok(destination.latitude > TOKYO.latitude);
  assert.ok(Math.abs(destination.longitude - TOKYO.longitude) < 0.001);
});

test("destinationPoint moves east for a 90 degree bearing", () => {
  const destination = destinationPoint(TOKYO, 90, 1000);
  assert.ok(destination.longitude > TOKYO.longitude);
  assert.ok(Math.abs(destination.latitude - TOKYO.latitude) < 0.001);
});

test("camera direction line starts at the camera and points toward the celestial body", () => {
  const points = directionLineLocations(TOKYO, 0, "camera", 1000);
  assert.equal(points.length, 2);
  assert.deepEqual(points[0], TOKYO);
  assert.ok(points[1].latitude > TOKYO.latitude);
});

test("subject direction line extends through the subject toward a camera candidate", () => {
  const points = directionLineLocations(TOKYO, 0, "subject", 1000);
  assert.equal(points.length, 3);
  assert.ok(points[0].latitude < TOKYO.latitude);
  assert.deepEqual(points[1], TOKYO);
  assert.ok(points[2].latitude > TOKYO.latitude);
});
