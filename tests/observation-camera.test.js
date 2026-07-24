import test from "node:test";
import assert from "node:assert/strict";
import {
  cameraErrorMessage,
  ObservationCamera,
  OBSERVATION_CAMERA_CONSTRAINTS,
} from "../js/measurement/observation-camera-service.js";

function createStream() {
  const track = { stopped: false, stop() { this.stopped = true; } };
  return {
    track,
    getTracks() {
      return [track];
    },
  };
}

test("observation camera requests the rear camera and releases it", async () => {
  const stream = createStream();
  let requestedConstraints;
  const mediaDevices = {
    async getUserMedia(constraints) {
      requestedConstraints = constraints;
      return stream;
    },
  };
  const video = {
    srcObject: null,
    muted: false,
    playsInline: false,
    played: false,
    paused: false,
    async play() { this.played = true; },
    pause() { this.paused = true; },
  };
  const camera = new ObservationCamera(mediaDevices);

  await camera.start(video);

  assert.deepEqual(requestedConstraints, OBSERVATION_CAMERA_CONSTRAINTS);
  assert.equal(video.srcObject, stream);
  assert.equal(video.muted, true);
  assert.equal(video.playsInline, true);
  assert.equal(video.played, true);

  camera.stop();
  assert.equal(stream.track.stopped, true);
  assert.equal(video.paused, true);
  assert.equal(video.srcObject, null);
});

test("observation camera remains usable when no camera API exists", async () => {
  const camera = new ObservationCamera(undefined);
  assert.equal(camera.supported, false);
  await assert.rejects(() => camera.start(null), /カメラプレビューを利用できません/);
});

test("camera permission errors provide a non-blocking fallback message", () => {
  assert.match(cameraErrorMessage({ name: "NotAllowedError" }), /カメラなしでも測定できます/);
  assert.match(cameraErrorMessage({ name: "NotFoundError" }), /背面カメラが見つかりません/);
});

test("a preview playback failure also releases the acquired camera", async () => {
  const stream = createStream();
  const camera = new ObservationCamera({ async getUserMedia() { return stream; } });
  const video = {
    srcObject: null,
    async play() { throw new Error("play failed"); },
    pause() {},
  };

  await assert.rejects(() => camera.start(video), /play failed/);
  assert.equal(stream.track.stopped, true);
  assert.equal(video.srcObject, null);
});

test("a camera request timeout falls back and releases a late stream", async () => {
  const stream = createStream();
  let resolveRequest;
  const pendingRequest = new Promise((resolve) => { resolveRequest = resolve; });
  const camera = new ObservationCamera({
    getUserMedia() { return pendingRequest; },
  }, { requestTimeoutMs: 5 });

  await assert.rejects(() => camera.start(null), /許可を確認できませんでした/);
  resolveRequest(stream);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(stream.track.stopped, true);
});
