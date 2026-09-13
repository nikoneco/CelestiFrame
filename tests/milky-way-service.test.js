import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateMilkyWay,
  milkyWayInternals,
  MILKY_WAY_CORE_EMPHASIS_EXTENT_DEGREES,
} from "../js/astronomy/milky-way-service.js";

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
  assert.ok(result.visibleSegments.length > 0);
  assert.ok(result.peak.altitude >= result.core.altitude || result.core.isAboveHorizon);
});

test("visible plane segments clip a horizon crossing and contain no below-horizon points", () => {
  const plane = [
    { longitude: 350, azimuth: 355, altitude: 12 },
    { longitude: 0, azimuth: 2, altitude: -8 },
    { longitude: 10, azimuth: 12, altitude: -18 },
    { longitude: 20, azimuth: 22, altitude: 8 },
  ];
  const segments = milkyWayInternals.clipMilkyWayPlane(plane);
  assert.ok(segments.length >= 2);
  assert.ok(segments.every(({ points }) => points.every((point) => point.altitude >= 0)));
  const crossing = segments.find(({ points }) => points.some((point) => point.isHorizonIntersection));
  assert.ok(crossing);
  assert.ok(crossing.points.some((point) => point.altitude === 0));
});

test("central emphasis is smooth across the 350 to 0 degree closure", () => {
  const plane = [
    { longitude: 350, azimuth: 350, altitude: 10 },
    { longitude: 0, azimuth: 0, altitude: 12 },
    { longitude: 10, azimuth: 10, altitude: 10 },
    { longitude: 180, azimuth: 180, altitude: 10 },
  ];
  const segments = milkyWayInternals.clipMilkyWayPlane(plane);
  const central = segments.find(({ edgeIndex }) => edgeIndex === 0);
  const next = segments.find(({ edgeIndex }) => edgeIndex === 1);
  assert.ok(central && next);
  assert.ok(central.centralWeight > 0.9);
  assert.ok(next.centralWeight > 0.5);
  assert.equal(milkyWayInternals.centralEmphasisWeight(MILKY_WAY_CORE_EMPHASIS_EXTENT_DEGREES), 0);
  assert.equal(milkyWayInternals.centralEmphasisWeight(360 - MILKY_WAY_CORE_EMPHASIS_EXTENT_DEGREES), 0);
});

test("near-zenith arcs keep their real azimuth span with adaptive spherical samples", () => {
  const plane = [
    { longitude: 0, azimuth: 325, altitude: 80 },
    { longitude: 10, azimuth: 10, altitude: 89.8 },
    { longitude: 20, azimuth: 145, altitude: 80 },
  ];
  const segments = milkyWayInternals.clipMilkyWayPlane(plane);
  const azimuthDifference = (from, to) => Math.abs(((to - from + 540) % 360) - 180);
  const coveredAzimuth = segments.reduce((total, { points }) => total + points.slice(1).reduce((subtotal, point, index) => (
    subtotal + azimuthDifference(points[index].azimuth, point.azimuth)
  ), 0), 0);
  assert.ok(coveredAzimuth > 170 && coveredAzimuth < 190);
  assert.ok(segments.every(({ points }) => points.slice(1).every((point, index) => (
    azimuthDifference(points[index].azimuth, point.azimuth) <= 5.1
  ))));
  const realFixture = calculateMilkyWay("2026-07-12T10:00:00Z", { latitude: 37.315, longitude: 0 });
  const realCoverage = realFixture.visibleSegments.reduce((total, { points }) => total + points.slice(1).reduce((subtotal, point, index) => (
    subtotal + azimuthDifference(points[index].azimuth, point.azimuth)
  ), 0), 0);
  assert.ok(Math.abs(realCoverage - 180) < 0.001, "a near-zenith arch must not lose the visible azimuth span");
  assert.ok(realFixture.visibleSegments.every(({ points }) => points.slice(1).every((point, index) => (
    azimuthDifference(points[index].azimuth, point.azimuth) <= 5.1
  ))));
});

test("a risen outer arch remains available while a below-horizon core stays below", () => {
  const result = calculateMilkyWay("2026-01-15T12:00:00Z", { latitude: 35.681, longitude: 139.767 });
  assert.equal(result.core.isAboveHorizon, false);
  assert.ok(result.visibleSegments.length > 0);
  assert.ok(result.visibleSegments.every(({ points }) => points.every((point) => point.altitude >= 0)));
});
