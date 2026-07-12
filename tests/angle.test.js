import test from "node:test";
import assert from "node:assert/strict";
import { degreesToDirection, normalizeDegrees, signedAngleDifference } from "../js/geometry/angle.js";

test("normalizeDegrees keeps angles within 0° and 360°", () => {
  assert.equal(normalizeDegrees(0), 0);
  assert.equal(normalizeDegrees(360), 0);
  assert.equal(normalizeDegrees(-1), 359);
  assert.equal(normalizeDegrees(721), 1);
});

test("signedAngleDifference crosses north by the shortest path", () => {
  assert.equal(signedAngleDifference(359, 1), 2);
  assert.equal(signedAngleDifference(1, 359), -2);
});

test("degreesToDirection maps primary compass points", () => {
  assert.equal(degreesToDirection(0), "北");
  assert.equal(degreesToDirection(45), "北東");
  assert.equal(degreesToDirection(90), "東");
  assert.equal(degreesToDirection(180), "南");
  assert.equal(degreesToDirection(270), "西");
  assert.equal(degreesToDirection(315), "北西");
});
