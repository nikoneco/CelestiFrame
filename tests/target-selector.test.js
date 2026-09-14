import test from "node:test";
import assert from "node:assert/strict";
import { moveTargetToPrimary } from "../js/ui/target-selector.js";

test("selected target chip promotes its target to the primary position", () => {
  assert.deepEqual(
    moveTargetToPrimary(["moon", "milkyway", "andromeda"], "andromeda"),
    ["andromeda", "moon", "milkyway"],
  );
});

test("promoting a target keeps the normalized selection schema", () => {
  assert.deepEqual(
    moveTargetToPrimary(["moon", "unknown", "moon", "mars", "sun"], "mars"),
    ["mars", "moon", "sun"],
  );
  assert.deepEqual(moveTargetToPrimary(["moon", "mars"], "unknown"), ["moon", "mars"]);
  assert.deepEqual(moveTargetToPrimary(["moon", "mars"], "moon"), ["moon", "mars"]);
});
