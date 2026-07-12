import test from "node:test";
import assert from "node:assert/strict";
import SunCalc from "suncalc";
import { calculateSunData } from "../js/astronomy/sun-service.js";

const TOKYO = { latitude: 35.681236, longitude: 139.767125 };

test("calculateSunData returns normalized position and valid solar times", () => {
  const result = calculateSunData(new Date("2026-07-12T03:00:00.000Z"), TOKYO, SunCalc);
  assert.ok(result.azimuth >= 0 && result.azimuth < 360);
  assert.ok(result.altitude > -90 && result.altitude < 90);
  assert.ok(result.sunrise instanceof Date && !Number.isNaN(result.sunrise.getTime()));
  assert.ok(result.sunset instanceof Date && !Number.isNaN(result.sunset.getTime()));
});

test("calculateSunData converts SunCalc south-based azimuth to north-based degrees", () => {
  const calculator = {
    getPosition: () => ({ azimuth: 0, altitude: Math.PI / 6 }),
    getTimes: () => ({ sunrise: new Date(0), solarNoon: new Date(1), sunset: new Date(2) }),
  };
  const result = calculateSunData(new Date("2026-01-01T00:00:00.000Z"), TOKYO, calculator);
  assert.equal(result.azimuth, 180);
  assert.equal(result.altitude, 29.999999999999996);
  assert.equal(result.direction, "南");
  assert.equal(result.isAboveHorizon, true);
});
