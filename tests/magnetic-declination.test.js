import test from "node:test";
import assert from "node:assert/strict";
import { gsiMagneticDeclination2020 } from "../js/field/magnetic-declination.js";

test("GSI approximation matches its published Tokyo example", () => {
  const declination = gsiMagneticDeclination2020({ latitude: 35.68, longitude: 139.70 });
  assert.ok(Math.abs(declination - (7 + 36.5 / 60)) < 0.01);
});

test("GSI approximation is only used inside its published Japan-area bounds", () => {
  assert.equal(gsiMagneticDeclination2020({ latitude: 51.5, longitude: -0.1 }), null);
  assert.equal(gsiMagneticDeclination2020({ latitude: null, longitude: 139 }), null);
});
