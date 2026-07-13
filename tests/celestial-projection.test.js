import test from "node:test";
import assert from "node:assert/strict";
import {
  cameraFrameFromQuaternion,
  cameraPoseFromFrame,
  deviceOrientationQuaternion,
  effectiveCameraFov,
  projectCelestialTarget,
  resolveDeviceOrientation,
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

test("quaternion orientation matches an independent Z-X-Y rotation matrix grid", () => {
  const radians = (degrees) => degrees * Math.PI / 180;
  const multiplyMatrices = (a, b) => a.map((row) => b[0].map((_, column) => row.reduce((sum, value, index) => sum + value * b[index][column], 0)));
  const applyMatrix = (matrix, vector) => matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
  const rx = (degrees) => { const c = Math.cos(radians(degrees)); const s = Math.sin(radians(degrees)); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
  const ry = (degrees) => { const c = Math.cos(radians(degrees)); const s = Math.sin(radians(degrees)); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
  const rz = (degrees) => { const c = Math.cos(radians(degrees)); const s = Math.sin(radians(degrees)); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
  for (const alpha of [0, 45, 123, 270, 359]) {
    for (const beta of [-120, -30, 0, 70, 90, 135]) {
      for (const gamma of [-75, -20, 0, 35, 80]) {
        for (const screenAngle of [0, 90, 180, 270]) {
          const matrix = multiplyMatrices(multiplyMatrices(multiplyMatrices(rz(alpha), rx(beta)), ry(gamma)), rz(-screenAngle));
          const frame = cameraFrameFromQuaternion(deviceOrientationQuaternion({ alpha, beta, gamma, screenAngle }));
          for (const [actual, expected] of [
            [frame.forward, applyMatrix(matrix, [0, 0, -1])],
            [frame.right, applyMatrix(matrix, [1, 0, 0])],
            [frame.up, applyMatrix(matrix, [0, 1, 0])],
          ]) {
            actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-10));
          }
        }
      }
    }
  }
});

test("orientation resolver rejects null sensor axes instead of treating them as zero", () => {
  assert.equal(resolveDeviceOrientation({ alpha: null, beta: null, gamma: null }), null);
  assert.equal(resolveDeviceOrientation({ alpha: 0, beta: null, gamma: 0 }), null);
});

test("orientation resolver distinguishes absolute, compass and relative sources", () => {
  assert.equal(resolveDeviceOrientation({ eventType: "deviceorientationabsolute", alpha: 10, beta: 90, gamma: 0 }).source, "absolute");
  assert.equal(resolveDeviceOrientation({ alpha: 20, beta: 90, gamma: 0, compassHeading: 340 }).source, "compass");
  assert.equal(resolveDeviceOrientation({ alpha: 20, beta: 90, gamma: 0 }).source, "relative");
});

test("magnetic declination converts a compass heading to true camera azimuth", () => {
  const reading = resolveDeviceOrientation({ alpha: 0, beta: 90, gamma: 0, compassHeading: 0, magneticDeclinationDegrees: 8 });
  const pose = cameraPoseFromFrame(cameraFrameFromQuaternion(reading.quaternion));
  assert.equal(reading.source, "compass-corrected");
  assert.ok(Math.abs(pose.azimuth - 352) < 0.001);
});

test("camera FOV follows the visible object-fit cover crop", () => {
  const uncropped = effectiveCameraFov({ videoWidth: 1920, videoHeight: 1080, viewportWidth: 1920, viewportHeight: 1080 });
  const squareCrop = effectiveCameraFov({ videoWidth: 1920, videoHeight: 1080, viewportWidth: 500, viewportHeight: 500 });
  assert.ok(uncropped.horizontalFov > uncropped.verticalFov);
  assert.ok(squareCrop.horizontalFov < uncropped.horizontalFov);
  assert.ok(Math.abs(squareCrop.horizontalFov - squareCrop.verticalFov) < 1e-10);
});
