import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCloudSettings } from "../js/cloud/account-controller.js";

test("cloud settings retain only supported display preferences", () => {
  assert.deepEqual(normalizeCloudSettings({
    theme: "red",
    directionLineOrigin: "both",
    timeStepMinutes: 10,
    coordinateFormat: "decimal",
    injected: "ignored",
  }), {
    theme: "red",
    directionLineOrigin: "both",
    timeStepMinutes: 10,
    coordinateFormat: "decimal",
  });
});

test("cloud settings reject unknown values and constrain the time step", () => {
  assert.deepEqual(normalizeCloudSettings({
    theme: "neon",
    directionLineOrigin: "server",
    timeStepMinutes: 999,
    coordinateFormat: "html",
  }), { timeStepMinutes: 60 });
});
