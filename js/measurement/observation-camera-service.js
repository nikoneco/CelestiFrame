export const OBSERVATION_CAMERA_CONSTRAINTS = Object.freeze({
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
});

export function cameraErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "カメラの利用が許可されませんでした。カメラなしでも測定できます。";
  }
  if (error?.name === "NotFoundError" || error?.name === "OverconstrainedError") {
    return "利用できる背面カメラが見つかりません。カメラなしでも測定できます。";
  }
  if (error?.name === "NotReadableError" || error?.name === "AbortError") {
    return "カメラを起動できませんでした。他のアプリで使用中でないか確認してください。";
  }
  return error?.message || "カメラを起動できませんでした。カメラなしでも測定できます。";
}

export class ObservationCamera {
  constructor(mediaDevices = globalThis.navigator?.mediaDevices, { requestTimeoutMs = 20000 } = {}) {
    this.mediaDevices = mediaDevices;
    this.requestTimeoutMs = requestTimeoutMs;
    this.stream = null;
    this.video = null;
  }

  get supported() {
    return typeof this.mediaDevices?.getUserMedia === "function";
  }

  async start(video) {
    this.stop();
    if (!this.supported) {
      const error = new Error("この端末ではカメラプレビューを利用できません。カメラなしでも測定できます。");
      error.name = "NotSupportedError";
      throw error;
    }

    const request = Promise.resolve(this.mediaDevices.getUserMedia(OBSERVATION_CAMERA_CONSTRAINTS));
    let timeoutId;
    let timedOut = false;
    const timeout = new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        const error = new Error("カメラの許可を確認できませんでした。カメラなしでも測定できます。");
        error.name = "TimeoutError";
        reject(error);
      }, this.requestTimeoutMs);
    });
    let stream;
    try {
      stream = await Promise.race([request, timeout]);
    } catch (error) {
      if (timedOut) {
        request.then((lateStream) => lateStream?.getTracks?.().forEach((track) => track.stop())).catch(() => {});
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
    this.stream = stream;
    this.video = video;
    try {
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play?.();
      }
    } catch (error) {
      this.stop();
      throw error;
    }
    return stream;
  }

  stop() {
    this.stream?.getTracks?.().forEach((track) => track.stop());
    if (this.video) {
      this.video.pause?.();
      this.video.srcObject = null;
    }
    this.stream = null;
    this.video = null;
  }
}
