import test from "node:test";
import assert from "node:assert/strict";
import { calculateMilkyWay, milkyWayInternals } from "../js/astronomy/milky-way-service.js";

test("galactic center converts near the accepted J2000 equatorial position", () => {
  const center = milkyWayInternals.galacticToEquatorial(0);
  assert.ok(Math.abs(center.rightAscensionDegrees - 266.405) < 0.01);
  assert.ok(Math.abs(center.declinationDegrees + 28.936) < 0.01);
});

test("Milky Way calculation returns a normalized core direction and plane", () => {
  const result = calculateMilkyWay("2026-07-13T15:00:00Z", { latitude: 35.681, longitude: 139.767 });
  assert.ok(result.azimuth >= 0 && result.azimuth < 360);
  assert.ok(result.altitude >= -90 && result.altitude <= 90);
  assert.equal(result.plane.length, 36);
  assert.ok(result.peak.altitude >= result.core.altitude || result.core.isAboveHorizon);
});
