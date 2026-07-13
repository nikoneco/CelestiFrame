import test from "node:test";
import assert from "node:assert/strict";
import SunCalc from "suncalc";
import "../js/search/search-core.js";
import { calendarYearLater, normalizeOvernightEndMinute, validateSearchInput } from "../js/search/search-controller.js";
import { apparentSolarAltitude } from "../js/geometry/target-altitude.js";

const baseInput = {
  target: "sun",
  cameraLocation: { latitude: 35.681236, longitude: 139.767125 },
  subjectBearing: 180,
  startDate: "2026-07-12",
  endDate: "2026-07-12",
  startMinute: 0,
  endMinute: 1439,
  stepMinutes: 60,
  toleranceDegrees: 180,
  minAltitude: -90,
  maxAltitude: 90,
  minIllumination: 0,
};

test("searchCandidates returns scored and sorted solar candidates", () => {
  const progress = [];
  const results = globalThis.CelestiSearchCore.searchCandidates(baseInput, SunCalc, (value) => progress.push(value));
  assert.ok(results.length > 0);
  assert.ok(results.every((result) => result.score >= 0 && result.score <= 100));
  assert.ok(results.every((result, index) => index === 0 || results[index - 1].score >= result.score));
  assert.equal(progress.at(-1), 1);
});

test("validateSearchInput rejects reversed and ranges beyond one calendar year", () => {
  assert.deepEqual(validateSearchInput({ ...baseInput, startDate: "2026-08-01", endDate: "2026-07-01" }), ["開始日は終了日以前にしてください"]);
  assert.deepEqual(validateSearchInput({ ...baseInput, startDate: "2026-07-13", endDate: "2027-07-13" }), []);
  assert.deepEqual(validateSearchInput({ ...baseInput, startDate: "2026-07-13", endDate: "2027-07-14" }), ["検索期間は開始日から1年以内にしてください"]);
});

test("calendarYearLater preserves the calendar date and clamps leap day", () => {
  assert.equal(calendarYearLater("2026-07-13"), "2027-07-13");
  assert.equal(calendarYearLater("2024-02-29"), "2025-02-28");
});

test("coarse search never returns candidates outside the requested altitude range", () => {
  const calculator = {
    getMoonPosition: () => ({ azimuth: 0, altitude: 13.5 * Math.PI / 180 }),
    getMoonIllumination: () => ({ fraction: 0.5 }),
  };
  const results = globalThis.CelestiSearchCore.searchCandidates({
    ...baseInput,
    target: "moon",
    startMinute: 0,
    endMinute: 0,
    stepMinutes: 10,
    minAltitude: 10,
    maxAltitude: 11,
  }, calculator);
  assert.equal(results.length, 0);
});

test("overnight windows continue into the following date", () => {
  const overnightInput = {
    ...baseInput,
    startMinute: 23 * 60,
    endMinute: normalizeOvernightEndMinute(23 * 60, 2 * 60),
    stepMinutes: 60,
  };
  const results = globalThis.CelestiSearchCore.searchCandidates(overnightInput, SunCalc);
  assert.equal(results.length, 4);
  assert.ok(results.some((result) => new Date(result.iso).getDate() === 13));
  assert.deepEqual(validateSearchInput(overnightInput), []);
});

test("diamond search matches both bearing and target altitude", () => {
  const calculator = {
    getPosition: () => ({ azimuth: 0, altitude: 2 * Math.PI / 180 }),
  };
  const results = globalThis.CelestiSearchCore.searchCandidates({
    ...baseInput,
    startMinute: 360,
    endMinute: 360,
    stepMinutes: 1,
    toleranceDegrees: 1,
    minAltitude: -10,
    maxAltitude: 10,
    matchTargetAltitude: true,
    targetAltitude: apparentSolarAltitude(2),
    verticalToleranceDegrees: 0.3,
  }, calculator);
  assert.equal(results.length, 1);
  assert.equal(results[0].diamondState, "center");
  assert.ok(results[0].angularSeparation < 0.01);
});

test("Milky Way search matches the visible arch and filters daylight", () => {
  const milkyWayCalculator = (date) => ({
    azimuth: 180,
    altitude: 35,
    isAboveHorizon: true,
    timestamp: date.getTime(),
  });
  const darkCalculator = {
    getPosition: () => ({ azimuth: 0, altitude: -20 * Math.PI / 180 }),
  };
  const results = globalThis.CelestiSearchCore.searchCandidates({
    ...baseInput,
    target: "milkyway",
    subjectBearing: 180,
    startMinute: 1200,
    endMinute: 1200,
    stepMinutes: 10,
    toleranceDegrees: 1,
    minAltitude: 0,
    maxAltitude: 90,
    maxSunAltitude: -18,
  }, darkCalculator, () => {}, milkyWayCalculator);
  assert.equal(results.length, 1);
  assert.equal(results[0].azimuth, 180);
  assert.equal(results[0].altitude, 35);
  assert.ok(results[0].sunAltitude <= -18);

  const daylightResults = globalThis.CelestiSearchCore.searchCandidates({
    ...baseInput,
    target: "milkyway",
    subjectBearing: 180,
    startMinute: 720,
    endMinute: 720,
    stepMinutes: 10,
    toleranceDegrees: 1,
    minAltitude: 0,
    maxAltitude: 90,
    maxSunAltitude: -18,
  }, { getPosition: () => ({ azimuth: 0, altitude: 10 * Math.PI / 180 }) }, () => {}, milkyWayCalculator);
  assert.equal(daylightResults.length, 0);
});
