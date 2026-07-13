import test from "node:test";
import assert from "node:assert/strict";
import {
  cameraFrameFromQuaternion,
  cameraPoseFromFrame,
  deviceOrientationQuaternion,
  projectCelestialTarget,
  smoothQuaternion,
} from "../js/field/celestial-projection.js";

const northHorizonCamera = { azimuth: 0, altitude: 0, roll: 0 };

test("3D celestial projection centers a target at the camera direction", () => {
  const projection = projectCelestialTarget({ azimuth: 0, altitude: 0 }, northHorizonCamera);
  assert.equal(projection.isVisible, true);
  assert.ok(Math.abs(projection.x - 50) < 0.001);
  assert.ok(Math.abs(projection.y - 50) < 0.001);
});

test("3D celestial projection places a higher target above the camera center", () => {
  const projection = projectCelestialTarget({ azimuth: 0, altitude: 20 }, northHorizonCamera);
  assert.equal(projection.isVisible, true);
  assert.ok(projection.y < 50);
});

test("3D celestial projection rejects a target behind the camera", () => {
  const projection = projectCelestialTarget({ azimuth: 180, altitude: 0 }, northHorizonCamera);
  assert.equal(projection.isInFront, false);
  assert.equal(projection.isVisible, false);
});

test("portrait device orientation points the rear camera north at the horizon", () => {
  const quaternion = deviceOrientationQuaternion({ alpha: 0, beta: 90, gamma: 0, screenAngle: 0 });
  const pose = cameraPoseFromFrame(cameraFrameFromQuaternion(quaternion));
  assert.ok(Math.abs(pose.azimuth) < 0.001);
  assert.ok(Math.abs(pose.altitude) < 0.001);
  assert.ok(Math.abs(pose.roll) < 0.001);
});

test("intrinsic device rotation keeps heading correct while the camera tilts", () => {
  const levelPose = cameraPoseFromFrame(cameraFrameFromQuaternion(
    deviceOrientationQuaternion({ alpha: 45, beta: 90, gamma: 0, screenAngle: 0 }),
  ));
  const raisedPose = cameraPoseFromFrame(cameraFrameFromQuaternion(
    deviceOrientationQuaternion({ alpha: 45, beta: 125, gamma: 0, screenAngle: 0 }),
  ));
  assert.ok(Math.abs(levelPose.azimuth - raisedPose.azimuth) < 0.001);
  assert.ok(raisedPose.altitude > levelPose.altitude);
});

test("screen rotation changes camera axes without changing its forward direction", () => {
  const portrait = cameraFrameFromQuaternion(deviceOrientationQuaternion({ alpha: 0, beta: 90, gamma: 0, screenAngle: 0 }));
  const landscape = cameraFrameFromQuaternion(deviceOrientationQuaternion({ alpha: 0, beta: 90, gamma: 0, screenAngle: 90 }));
  assert.deepEqual(landscape.forward.map((value) => Math.round(value)), portrait.forward.map((value) => Math.round(value)));
  assert.ok(Math.abs(landscape.right[2]) > 0.99);
});

test("quaternion smoothing stays normalized", () => {
  const from = deviceOrientationQuaternion({ alpha: 0, beta: 90, gamma: 0, screenAngle: 0 });
  const to = deviceOrientationQuaternion({ alpha: 90, beta: 90, gamma: 0, screenAngle: 0 });
  const result = smoothQuaternion(from, to, 0.25);
  assert.ok(Math.abs(Math.hypot(result.x, result.y, result.z, result.w) - 1) < 1e-10);
});
