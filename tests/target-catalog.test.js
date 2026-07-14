import test from "node:test";
import assert from "node:assert/strict";
import { CELESTIAL_TARGETS, MAX_SELECTED_TARGETS, normalizeSelectedTargets } from "../js/astronomy/target-catalog.js";

test("celestial catalog has unique targets and a five target ceiling", () => {
  assert.equal(new Set(CELESTIAL_TARGETS.map((target) => target.id)).size, CELESTIAL_TARGETS.length);
  assert.equal(MAX_SELECTED_TARGETS, 5);
  assert.ok(CELESTIAL_TARGETS.some((target) => target.id === "andromeda"));
  assert.ok(CELESTIAL_TARGETS.some((target) => target.id === "saturn"));
});

test("target normalization removes duplicates, unknown ids and overflow", () => {
  assert.deepEqual(
    normalizeSelectedTargets(["sun", "moon", "sun", "mars", "unknown", "jupiter", "saturn", "venus"]),
    ["sun", "moon", "mars", "jupiter", "saturn"],
  );
});
