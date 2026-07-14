import test from "node:test";
import assert from "node:assert/strict";
import * as Astronomy from "astronomy-engine";
import { calculateTargetData } from "../js/astronomy/target-service.js";

const date = new Date("2026-07-14T12:00:00.000Z");
const tokyo = { latitude: 35.681236, longitude: 139.767125 };

test("fixed deep sky targets return normalized horizontal coordinates", () => {
  const andromeda = calculateTargetData("andromeda", date, tokyo, Astronomy);
  assert.ok(andromeda.azimuth >= 0 && andromeda.azimuth < 360);
  assert.ok(andromeda.altitude >= -90 && andromeda.altitude <= 90);
  assert.equal(andromeda.target.shortLabel, "M31");
});

test("planets use Astronomy Engine and return a visible-sky direction", () => {
  const mars = calculateTargetData("mars", date, tokyo, Astronomy);
  assert.ok(mars.azimuth >= 0 && mars.azimuth < 360);
  assert.ok(mars.altitude >= -90 && mars.altitude <= 90);
  assert.equal(typeof mars.direction, "string");
});
