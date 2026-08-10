import test from "node:test";
import assert from "node:assert/strict";
import { formatDistance } from "../js/utils/format.js";

test("distance formatting keeps metres concise and kilometres precise", () => {
  assert.equal(formatDistance(42.6), "43 m");
  assert.equal(formatDistance(999.6), "1000 m");
  assert.equal(formatDistance(1000), "1.00 km");
  assert.equal(formatDistance(1234), "1.23 km");
});
