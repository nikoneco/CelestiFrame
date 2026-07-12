import test from "node:test";
import assert from "node:assert/strict";
import SunCalc from "suncalc";
import "../js/search/search-core.js";
import { normalizeOvernightEndMinute, validateSearchInput } from "../js/search/search-controller.js";
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

test("validateSearchInput rejects reversed and excessive ranges", () => {
  assert.deepEqual(validateSearchInput({ ...baseInput, startDate: "2026-08-01", endDate: "2026-07-01" }), ["開始日は終了日以前にしてください"]);
  assert.deepEqual(validateSearchInput({ ...baseInput, endDate: "2026-12-31" }), ["検索期間は93日以内にしてください"]);
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
