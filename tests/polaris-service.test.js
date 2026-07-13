import test from "node:test";
import assert from "node:assert/strict";
import { calculatePolarisData, equatorialToHorizontal, localSiderealTime } from "../js/astronomy/polaris-service.js";

const TOKYO = { latitude: 35.681236, longitude: 139.767125 };
const DATE = new Date("2026-07-13T12:00:00.000Z");

test("Polaris data returns a near-north star and the local north celestial pole", () => {
  const result = calculatePolarisData(DATE, TOKYO);
  assert.equal(result.northCelestialPole.azimuth, 0);
  assert.equal(result.northCelestialPole.altitude, TOKYO.latitude);
  assert.ok(result.azimuth >= 0 && result.azimuth < 360);
  assert.ok(result.altitude > -90 && result.altitude < 90);
  assert.ok(result.separationDegrees > 0 && result.separationDegrees < 1);
  assert.ok(Number.isInteger(result.skyClockMinutes));
});

test("sidereal and horizontal conversions stay normalized", () => {
  assert.ok(localSiderealTime(DATE, TOKYO.longitude) >= 0 && localSiderealTime(DATE, TOKYO.longitude) < 360);
  const horizontal = equatorialToHorizontal({ rightAscension: 0, declination: 0 }, DATE, TOKYO);
  assert.ok(horizontal.azimuth >= 0 && horizontal.azimuth < 360);
  assert.ok(horizontal.altitude >= -90 && horizontal.altitude <= 90);
});
