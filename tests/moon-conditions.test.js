import test from "node:test";
import assert from "node:assert/strict";
import { angularDistanceDegrees, calculateMoonConditions } from "../js/weather/moon-conditions.js";

const DATE = new Date("2026-07-14T12:00:00.000Z");
const LOCATION = { latitude: 35.681236, longitude: 139.767125 };

function moonCalculator() {
  return {
    getMoonPosition() {
      return { azimuth: 30 * Math.PI / 180, altitude: 20 * Math.PI / 180, distance: 384400 };
    },
    getMoonIllumination() {
      return { fraction: 0.375 };
    },
    getMoonTimes() {
      return {};
    },
  };
}

test("moon conditions use the first target and preserve self distance as unknown", () => {
  const calls = [];
  const result = calculateMoonConditions(DATE, LOCATION, "moon", {
    moonCalculator: moonCalculator(),
    targetCalculator: (...args) => {
      calls.push(args);
      return { target: { label: "unexpected" }, azimuth: 0, altitude: 0 };
    },
  });
  assert.equal(result.targetId, "moon");
  assert.equal(result.targetLabel, "月");
  assert.equal(result.moonAltitudeDegrees, 20);
  assert.equal(result.moonIlluminationPercent, 37.5);
  assert.equal(result.angularDistanceDegrees, null);
  assert.equal(calls.length, 0);
});

test("moon conditions measure a target at the same instant and place", () => {
  const calls = [];
  const result = calculateMoonConditions(DATE, LOCATION, "mars", {
    moonCalculator: moonCalculator(),
    targetCalculator: (targetId, date, location) => {
      calls.push({ targetId, date, location });
      return { target: { label: "火星" }, azimuth: 120, altitude: 10 };
    },
  });
  assert.equal(result.targetLabel, "火星");
  assert.ok(Math.abs(result.angularDistanceDegrees - angularDistanceDegrees({ azimuth: 210, altitude: 20 }, { azimuth: 120, altitude: 10 })) < 1e-12);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].date.getTime(), DATE.getTime());
  assert.deepEqual(calls[0].location, LOCATION);
});

test("Milky Way distance is explicitly measured from the galactic center", () => {
  const result = calculateMoonConditions(DATE, LOCATION, "milkyway", {
    moonCalculator: moonCalculator(),
    milkyWayCalculator: () => ({ core: { azimuth: 210, altitude: 20 } }),
  });
  assert.equal(result.targetLabel, "天の川（銀河中心）");
  assert.equal(result.angularDistanceDegrees, 0);
});

test("angular distance clamps small floating point overflow", () => {
  assert.equal(angularDistanceDegrees({ azimuth: 1, altitude: 30 }, { azimuth: 1, altitude: 30 }), 0);
  assert.equal(angularDistanceDegrees(null, { azimuth: 1, altitude: 30 }), null);
});
