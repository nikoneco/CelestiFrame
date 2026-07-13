import { calculatePolarisData } from "../astronomy/polaris-service.js";
import { gsiMagneticDeclination2020 } from "./magnetic-declination.js?v=1";
import {
  cameraFrameFromQuaternion,
  cameraPoseFromFrame,
  effectiveCameraFov,
  projectCelestialTargetFromFrame,
  resolveDeviceOrientation,
  smoothQuaternion,
} from "./celestial-projection.js?v=2";

const formatClock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function currentScreenAngle() {
  const angle = Number(globalThis.screen?.orientation?.angle ?? globalThis.orientation ?? 0);
  return Number.isFinite(angle) ? angle : 0;
}

function projectionDirection(projection) {
  if (projection.isVisible) return "北天の極は画面内です";
  if (!projection.isInFront) return "北天の極は端末の反対側です";
  const horizontal = projection.horizontal > 0.08 ? "右" : projection.horizontal < -0.08 ? "左" : "";
  const vertical = projection.vertical > 0.08 ? "上" : projection.vertical < -0.08 ? "下" : "";
  return `北天の極は画面の${horizontal}${vertical || "方向"}です`;
}

export function bindPolarAssist(showToast) {
  const dialog = document.querySelector("#polar-assist-dialog");
  const video = document.querySelector("#polar-camera");
  const cameraView = dialog.querySelector(".polar-view");
  const startButton = document.querySelector("#polar-start");
  const resyncButton = document.querySelector("#polar-level");
  const stateOutput = document.querySelector("#polar-state");
  const trackingBadge = document.querySelector("#polar-tracking-state");
  const headingOutput = document.querySelector("#polar-heading");
  const ncpOutput = document.querySelector("#polar-ncp");
  const polarisOutput = document.querySelector("#polar-position");
  const clockOutput = document.querySelector("#polar-clock");
  const poseOutput = document.querySelector("#polar-pose");
  const declinationOutput = document.querySelector("#polar-declination");
  const guidanceOutput = document.querySelector("#polar-guidance");
  const ncpMarker = document.querySelector("#polar-ncp-marker");
  const polarisMarker = document.querySelector("#polar-polaris-marker");
  let stream = null;
  let watchId = null;
  let location = null;
  let orientationQuaternion = null;
  let cameraFrame = null;
  let cameraPose = null;
  let orientationSource = "relative";
  let magneticDeclination = null;
  let lastOrientationAt = null;
  let lastAbsoluteAt = null;
  let refreshTimer = null;

  function setState(message) { stateOutput.textContent = message; }

  function placeMarker(marker, projection) {
    const x = projection.x;
    const y = projection.y;
    const clampedX = Math.min(94, Math.max(6, Number.isFinite(x) ? x : 50));
    const clampedY = Math.min(92, Math.max(8, Number.isFinite(y) ? y : 50));
    marker.hidden = false;
    marker.style.left = `${clampedX}%`;
    marker.style.top = `${clampedY}%`;
    marker.classList.toggle("is-offscreen", !projection.isVisible);
    marker.classList.toggle("is-behind", !projection.isInFront);
  }

  function render() {
    if (cameraPose) {
      headingOutput.textContent = `${cameraPose.azimuth.toFixed(1)}°`;
      poseOutput.textContent = `仰角 ${cameraPose.altitude.toFixed(1)}° / 傾き ${cameraPose.roll.toFixed(1)}°`;
    } else {
      headingOutput.textContent = "—";
      poseOutput.textContent = "姿勢を取得中";
    }
    if (!location) return;
    const polaris = calculatePolarisData(new Date(), location);
    declinationOutput.textContent = magneticDeclination == null ? "地域データなし" : `西偏 ${magneticDeclination.toFixed(1)}°を補正`;
    ncpOutput.textContent = `北 0.0° / 高度 ${polaris.northCelestialPole.altitude.toFixed(1)}°`;
    polarisOutput.textContent = `方位 ${polaris.azimuth.toFixed(1)}° / 高度 ${polaris.altitude.toFixed(1)}°`;
    clockOutput.textContent = `空の配置 ${formatClock(polaris.skyClockMinutes)}`;
    if (!cameraFrame) {
      guidanceOutput.textContent = "端末姿勢を待っています。ゆっくり北へ向けてください。";
      return;
    }
    const viewBounds = cameraView.getBoundingClientRect();
    const projectionFov = effectiveCameraFov({
      videoWidth: video.videoWidth || 1920,
      videoHeight: video.videoHeight || 1080,
      viewportWidth: viewBounds.width,
      viewportHeight: viewBounds.height,
    });
    const ncpProjection = projectCelestialTargetFromFrame(polaris.northCelestialPole, cameraFrame, projectionFov);
    const polarisProjection = projectCelestialTargetFromFrame(polaris, cameraFrame, projectionFov);
    placeMarker(ncpMarker, ncpProjection);
    placeMarker(polarisMarker, polarisProjection);
    const referenceWarning = orientationSource === "relative"
      ? " 絶対方位がないため左右位置は参考値です。"
      : orientationSource === "compass"
        ? " 磁気方位のため真北との差を含む場合があります。"
        : "";
    guidanceOutput.textContent = `${projectionDirection(ncpProjection)}。北極星は北天の極から ${polaris.separationDegrees.toFixed(2)}°。${referenceWarning}`;
  }

  function handleOrientation(event) {
    const now = performance.now();
    const isAbsoluteEvent = event.type === "deviceorientationabsolute" || event.absolute === true;
    if (!isAbsoluteEvent && lastAbsoluteAt != null && now - lastAbsoluteAt < 300) return;
    if (isAbsoluteEvent) lastAbsoluteAt = now;
    const reading = resolveDeviceOrientation({
      eventType: event.type,
      absolute: event.absolute,
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
      compassHeading: event.webkitCompassHeading,
      magneticDeclinationDegrees: magneticDeclination ?? 0,
      screenAngle: currentScreenAngle(),
    });
    if (!reading) return;
    orientationSource = reading.source;
    const elapsed = lastOrientationAt == null ? Infinity : Math.max(1, now - lastOrientationAt);
    const smoothingFactor = Number.isFinite(elapsed) ? 1 - Math.exp(-elapsed / 110) : 1;
    orientationQuaternion = smoothQuaternion(orientationQuaternion, reading.quaternion, smoothingFactor);
    cameraFrame = cameraFrameFromQuaternion(orientationQuaternion);
    cameraPose = cameraPoseFromFrame(cameraFrame);
    lastOrientationAt = now;
    trackingBadge.textContent = orientationSource === "absolute"
      ? "3D姿勢・絶対方位"
      : orientationSource === "compass-corrected"
        ? "3D姿勢・真北補正"
        : orientationSource === "compass"
          ? "3D姿勢・磁気方位"
          : "3D姿勢・相対方位";
    trackingBadge.dataset.quality = orientationSource;
    render();
  }

  function resetOrientation() {
    orientationQuaternion = null;
    cameraFrame = null;
    cameraPose = null;
    lastOrientationAt = null;
    ncpMarker.hidden = true;
    polarisMarker.hidden = true;
    trackingBadge.textContent = "3D姿勢を同期中";
    trackingBadge.dataset.quality = "pending";
    setState("端末姿勢を再同期しています。ゆっくり動かしてください。");
    render();
  }

  async function requestSensors() {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      const permission = await DeviceOrientationEvent.requestPermission(true);
      if (permission !== "granted") throw new Error("端末方位の利用が許可されませんでした");
    }
    window.addEventListener("deviceorientationabsolute", handleOrientation);
    window.addEventListener("deviceorientation", handleOrientation);
    globalThis.screen?.orientation?.addEventListener?.("change", resetOrientation);
    window.addEventListener("orientationchange", resetOrientation);
    if (!navigator.geolocation) throw new Error("この端末では現在地を利用できません");
    watchId = navigator.geolocation.watchPosition((position) => {
      location = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      magneticDeclination = gsiMagneticDeclination2020(location);
      render();
    }, (error) => setState(error.message || "現在地を取得できません"), { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
  }

  async function start() {
    startButton.disabled = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("この端末ではカメラを利用できません");
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      video.srcObject = stream;
      await video.play();
      await requestSensors();
      setState("カメラ・現在地・3D姿勢を利用中。方位が揺れる場合は端末を8の字に動かしてください。");
      startButton.textContent = "極軸アシストを利用中";
      refreshTimer = window.setInterval(render, 10000);
    } catch (error) {
      console.warn(error);
      const message = error.message || "カメラまたはセンサーを開始できませんでした";
      stop();
      setState(message);
      showToast(message);
    }
  }

  function stop() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    window.removeEventListener("deviceorientationabsolute", handleOrientation);
    window.removeEventListener("deviceorientation", handleOrientation);
    globalThis.screen?.orientation?.removeEventListener?.("change", resetOrientation);
    window.removeEventListener("orientationchange", resetOrientation);
    window.clearInterval(refreshTimer);
    refreshTimer = null;
    location = null;
    orientationSource = "relative";
    magneticDeclination = null;
    lastAbsoluteAt = null;
    resetOrientation();
    startButton.disabled = false;
    startButton.textContent = "カメラとセンサーを開始";
    setState("開始すると端末内でカメラを表示します");
  }

  document.querySelector("#field-polar-assist").addEventListener("click", () => dialog.showModal());
  document.querySelector("#polar-close").addEventListener("click", () => dialog.close());
  startButton.addEventListener("click", start);
  resyncButton.addEventListener("click", () => {
    if (!stream) return showToast("先にカメラとセンサーを開始してください");
    resetOrientation();
  });
  dialog.addEventListener("close", stop);
}
