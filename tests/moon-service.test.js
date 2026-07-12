import test from "node:test";
import assert from "node:assert/strict";
import SunCalc from "suncalc";
import { calculateMoonData, moonPhaseName } from "../js/astronomy/moon-service.js";

const TOKYO = { latitude: 35.681236, longitude: 139.767125 };

test("calculateMoonData returns normalized lunar position and illumination", () => {
  const result = calculateMoonData(new Date("2026-07-12T10:30:00.000Z"), TOKYO, SunCalc);
  assert.ok(result.azimuth >= 0 && result.azimuth < 360);
  assert.ok(result.altitude > -90 && result.altitude < 90);
  assert.ok(result.illuminationFraction >= 0 && result.illuminationFraction <= 1);
  assert.ok(result.ageDays >= 0 && result.ageDays < 29.531);
  assert.ok(typeof result.phaseName === "string" && result.phaseName.length > 0);
});

test("moonPhaseName labels principal phases", () => {
  assert.equal(moonPhaseName(0), "新月");
  assert.equal(moonPhaseName(0.25), "上弦");
  assert.equal(moonPhaseName(0.5), "満月");
  assert.equal(moonPhaseName(0.75), "下弦");
});
