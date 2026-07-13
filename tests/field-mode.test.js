import test from "node:test";
import assert from "node:assert/strict";
import { headingRelativeCardinalOffsets, headingToTargetOffset } from "../js/field/field-mode.js";

function roundedOffsets(heading) {
  return Object.fromEntries(headingRelativeCardinalOffsets(heading, 68).map(({ label, x, y }) => [
    label,
    { x: Math.round(x), y: Math.round(y) },
  ]));
}

test("north heading places cardinal directions in their conventional positions", () => {
  assert.deepEqual(roundedOffsets(0), {
    N: { x: 0, y: -68 },
    E: { x: 68, y: 0 },
    S: { x: 0, y: 68 },
    W: { x: -68, y: 0 },
  });
});

test("east heading moves east to the top and north to the left", () => {
  const offsets = roundedOffsets(90);
  assert.deepEqual(offsets.E, { x: 0, y: -68 });
  assert.deepEqual(offsets.N, { x: -68, y: 0 });
});

test("compass arrow always points from the device heading toward the target", () => {
  assert.equal(headingToTargetOffset(0, 90), 90);
  assert.equal(headingToTargetOffset(180, 90), -90);
  assert.equal(headingToTargetOffset(90, 90), 0);
});
