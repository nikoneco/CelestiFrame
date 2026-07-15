import test from "node:test";
import assert from "node:assert/strict";
import {
  formatHeadingGuidance,
  gpsAccuracyGuidance,
  headingRelativeCardinalOffsets,
  headingToTargetOffset,
} from "../js/field/field-mode.js";

function roundedOffsets(heading) {
  return Object.fromEntries(headingRelativeCardinalOffsets(heading).map(({ label, x, y }) => [
    label,
    { x: Math.round(x), y: Math.round(y) },
  ]));
}

test("north heading places cardinal directions in their conventional positions", () => {
  assert.deepEqual(roundedOffsets(0), {
    N: { x: 0, y: -76 },
    E: { x: 76, y: 0 },
    S: { x: 0, y: 76 },
    W: { x: -76, y: 0 },
  });
});

test("east heading moves east to the top and north to the left", () => {
  const offsets = roundedOffsets(90);
  assert.deepEqual(offsets.E, { x: 0, y: -76 });
  assert.deepEqual(offsets.N, { x: -76, y: 0 });
});

test("compass arrow always points from the device heading toward the target", () => {
  assert.equal(headingToTargetOffset(0, 90), 90);
  assert.equal(headingToTargetOffset(180, 90), -90);
  assert.equal(headingToTargetOffset(90, 90), 0);
});

test("field guidance leads with the action to take", () => {
  assert.equal(formatHeadingGuidance(0, 12), "右へ 12.0°");
  assert.equal(formatHeadingGuidance(20, 8), "左へ 12.0°");
  assert.equal(formatHeadingGuidance(90, 91), "正面です");
});

test("GPS guidance gives a concrete recovery action when accuracy is low", () => {
  assert.deepEqual(gpsAccuracyGuidance(8), { quality: "good", message: "GPS精度は良好です" });
  assert.equal(gpsAccuracyGuidance(28).quality, "fair");
  assert.deepEqual(gpsAccuracyGuidance(65), {
    quality: "poor",
    message: "精度が上がるまで、空が開けた場所で端末を静止してください",
  });
});
