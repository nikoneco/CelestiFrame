import test from "node:test";
import assert from "node:assert/strict";
import { dateWithWrappedMinutes } from "../js/ui/datetime-controls.js";

test("late night to early morning advances to the next date", () => {
  const current = new Date(2026, 6, 12, 23, 50);
  const next = dateWithWrappedMinutes(current, 10);
  assert.deepEqual(
    [next.getFullYear(), next.getMonth(), next.getDate(), next.getHours(), next.getMinutes()],
    [2026, 6, 13, 0, 10],
  );
});

test("early morning to late night returns to the previous date", () => {
  const current = new Date(2026, 6, 13, 0, 10);
  const previous = dateWithWrappedMinutes(current, 23 * 60 + 50);
  assert.deepEqual(
    [previous.getFullYear(), previous.getMonth(), previous.getDate(), previous.getHours(), previous.getMinutes()],
    [2026, 6, 12, 23, 50],
  );
});

test("ordinary daytime changes remain on the same date", () => {
  const current = new Date(2026, 6, 12, 12, 0);
  const next = dateWithWrappedMinutes(current, 13 * 60);
  assert.equal(next.getDate(), 12);
  assert.equal(next.getHours(), 13);
});
