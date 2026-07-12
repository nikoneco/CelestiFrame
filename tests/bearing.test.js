import test from "node:test";
import assert from "node:assert/strict";
import { distanceMeters, initialBearingDegrees, subjectGeometry } from "../js/geometry/bearing.js";

const TOKYO_STATION = { latitude: 35.681236, longitude: 139.767125 };
const TOKYO_TOWER = { latitude: 35.658581, longitude: 139.745433 };

test("distanceMeters returns zero for the same point", () => {
  assert.equal(distanceMeters(TOKYO_STATION, TOKYO_STATION), 0);
});

test("Tokyo Station to Tokyo Tower has a plausible distance and southwest bearing", () => {
  const geometry = subjectGeometry(TOKYO_STATION, TOKYO_TOWER);
  assert.ok(geometry.distanceMeters > 3000 && geometry.distanceMeters < 3500);
  assert.ok(geometry.bearingDegrees > 210 && geometry.bearingDegrees < 230);
});

test("initialBearingDegrees handles cardinal directions", () => {
  assert.equal(initialBearingDegrees({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }), 0);
  assert.equal(initialBearingDegrees({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }), 90);
});
