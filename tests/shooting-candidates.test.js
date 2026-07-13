import test from "node:test";
import assert from "node:assert/strict";
import { createShootingCandidates } from "../js/planning/shooting-candidates.js";
import { subjectGeometry } from "../js/geometry/bearing.js";

test("shooting candidates extend behind the subject opposite the celestial azimuth", () => {
  const subject = { latitude: 35, longitude: 139 };
  const [candidate] = createShootingCandidates({ subjectLocation: subject, celestialAzimuth: 90, body: "sun", distancesMeters: [1000] });
  const geometry = subjectGeometry(subject, candidate.location);
  assert.ok(Math.abs(geometry.bearingDegrees - 270) < 0.1);
  assert.ok(Math.abs(geometry.distanceMeters - 1000) < 1);
});
