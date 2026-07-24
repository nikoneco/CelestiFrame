import test from "node:test";
import assert from "node:assert/strict";
import { calculateTargetAltitude } from "../js/geometry/target-altitude.js";
import {
  calculateObservationHeight,
  calculateStructureHeight,
  OrientationStabilityTracker,
  orientationSampleFromEvent,
  robustAngleEstimate,
  SHORT_DISTANCE_THRESHOLD_METERS,
} from "../js/measurement/observation-height-service.js";
import { MeasurementCommitter, validateObservationContext } from "../js/measurement/observation-height-controller.js";

test("observation height inverts a measured depression or elevation angle", () => {
  const flatDepression = calculateObservationHeight({
    distanceMeters: 620,
    cameraGroundElevationMeters: 10,
    targetGroundElevationMeters: 10,
    angleDegrees: -3.2,
    applyCurvature: false,
  });
  assert.ok(flatDepression.heightMeters > 34.6 && flatDepression.heightMeters < 34.7);

  const flatElevation = calculateObservationHeight({
    distanceMeters: 100,
    cameraGroundElevationMeters: 10,
    targetGroundElevationMeters: 30,
    angleDegrees: 5,
    applyCurvature: false,
  });
  assert.ok(flatElevation.heightMeters > 11.2 && flatElevation.heightMeters < 11.3);
});

test("observation height round-trips the existing curvature and refraction model", () => {
  for (const refractionCoefficient of [0, 0.13]) {
    const forward = calculateTargetAltitude({
      distanceMeters: 25000,
      cameraElevationMeters: 120,
      cameraHeightMeters: 42,
      targetElevationMeters: 85,
      refractionCoefficient,
    });
    const inverse = calculateObservationHeight({
      distanceMeters: 25000,
      cameraGroundElevationMeters: 120,
      targetGroundElevationMeters: 85,
      angleDegrees: forward.altitudeDegrees,
      applyCurvature: true,
      refractionCoefficient,
    });
    assert.ok(Math.abs(inverse.heightMeters - 42) < 0.001);
  }

  const curved = calculateObservationHeight({
    distanceMeters: 100000,
    cameraGroundElevationMeters: 0,
    targetGroundElevationMeters: 0,
    angleDegrees: 0,
    applyCurvature: true,
    refractionCoefficient: 0,
  });
  const flat = calculateObservationHeight({
    distanceMeters: 100000,
    cameraGroundElevationMeters: 0,
    targetGroundElevationMeters: 0,
    angleDegrees: 0,
    applyCurvature: false,
  });
  assert.ok(curved.heightMeters < -780);
  assert.equal(flat.heightMeters, 0);
});

test("structure height round-trips the existing target-height model", () => {
  for (const refractionCoefficient of [0, 0.13]) {
    const forward = calculateTargetAltitude({
      distanceMeters: 18000,
      cameraElevationMeters: 65,
      cameraHeightMeters: 24,
      targetElevationMeters: 110,
      targetHeightMeters: 180,
      targetMode: "structure",
      refractionCoefficient,
    });
    const inverse = calculateStructureHeight({
      distanceMeters: 18000,
      cameraGroundElevationMeters: 65,
      cameraHeightMeters: 24,
      targetGroundElevationMeters: 110,
      angleDegrees: forward.altitudeDegrees,
      applyCurvature: true,
      refractionCoefficient,
    });
    assert.ok(Math.abs(inverse.heightMeters - 180) < 0.001);
  }
});

test("short distances are marked with the measurement warning", () => {
  const result = calculateObservationHeight({
    distanceMeters: SHORT_DISTANCE_THRESHOLD_METERS - 1,
    cameraGroundElevationMeters: 0,
    targetGroundElevationMeters: 0,
    angleDegrees: -1,
  });
  assert.equal(result.isShortDistance, true);
});

test("sensor outliers do not materially change the chosen angle", () => {
  const estimate = robustAngleEstimate([-3.2, -3.1, -3.2, -3.3, 28, -3.2, -3.1]);
  assert.ok(Math.abs(estimate + 3.183) < 0.05);
});

test("null device-orientation readings are not mistaken for a valid downward angle", () => {
  assert.equal(orientationSampleFromEvent({ beta: null, gamma: null }, 0), null);
});

test("measurement does not complete while the device keeps moving", () => {
  const tracker = new OrientationStabilityTracker({ stableDurationMs: 800, minSamples: 5, movementThresholdDegrees: 0.8 });
  let result;
  for (let index = 0; index < 20; index += 1) {
    result = tracker.addSample({
      angleDegrees: index % 2 ? -3 : 0,
      rollDegrees: 0,
      timestamp: index * 100,
    });
  }
  assert.notEqual(result.status, "complete");
});

test("unsupported or incomplete measurement context remains a usable validation state", () => {
  const state = {
    cameraLocation: { latitude: 35, longitude: 139 },
    subjectLocation: null,
    composition: { cameraElevationStatus: "ready" },
    subject: { groundElevationStatus: "error" },
  };
  assert.equal(validateObservationContext(state), "被写体地点を地図上で設定してください");
});

test("camera height changes only after the staged confirmation", () => {
  let state = { composition: { cameraHeightMeters: 1.5 } };
  const store = {
    getState: () => state,
    setState(update) {
      state = update(state);
    },
  };
  const committer = new MeasurementCommitter(store);
  committer.stage(34.8);
  assert.equal(state.composition.cameraHeightMeters, 1.5);
  committer.cancel();
  assert.equal(committer.confirm(), false);
  assert.equal(state.composition.cameraHeightMeters, 1.5);
  committer.stage(34.8);
  assert.equal(committer.confirm(), true);
  assert.equal(state.composition.cameraHeightMeters, 34.8);
});

test("structure height also changes only after confirmation", () => {
  let state = {
    composition: { cameraHeightMeters: 1.5 },
    subject: { heightMeters: 10, targetMode: "terrain" },
  };
  const store = {
    getState: () => state,
    setState(update) {
      state = update(state);
    },
  };
  const committer = new MeasurementCommitter(store);
  committer.stage(124.6, "structure");
  assert.equal(state.subject.heightMeters, 10);
  committer.cancel();
  assert.equal(state.subject.heightMeters, 10);
  committer.stage(124.6, "structure");
  assert.equal(committer.confirm(), true);
  assert.equal(state.subject.heightMeters, 124.6);
  assert.equal(state.subject.targetMode, "structure");
  assert.equal(state.composition.cameraHeightMeters, 1.5);
});
