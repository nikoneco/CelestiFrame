import test from "node:test";
import assert from "node:assert/strict";
import { targetRelativeCardinalOffsets, targetRelativeHeadingOffset } from "../js/field/field-mode.js";

function roundedOffsets(targetBearing) {
  return Object.fromEntries(targetRelativeCardinalOffsets(targetBearing, 68).map(({ label, x, y }) => [
    label,
    { x: Math.round(x), y: Math.round(y) },
  ]));
}

test("north target places cardinal directions in their conventional positions", () => {
  assert.deepEqual(roundedOffsets(0), {
    N: { x: 0, y: -68 },
    E: { x: 68, y: 0 },
    S: { x: 0, y: 68 },
    W: { x: -68, y: 0 },
  });
});

test("east target keeps the target at the top and moves north to the left", () => {
  const offsets = roundedOffsets(90);
  assert.deepEqual(offsets.E, { x: 0, y: -68 });
  assert.deepEqual(offsets.N, { x: -68, y: 0 });
});

test("current heading is expressed around the target-up compass axis", () => {
  assert.equal(targetRelativeHeadingOffset(90, 0), -90);
  assert.equal(targetRelativeHeadingOffset(90, 180), 90);
  assert.equal(targetRelativeHeadingOffset(90, 90), 0);
});
