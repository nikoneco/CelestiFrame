import test from "node:test";
import assert from "node:assert/strict";
import { destinationPoint } from "../js/geometry/destination.js";

const TOKYO = { latitude: 35.681236, longitude: 139.767125 };

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
