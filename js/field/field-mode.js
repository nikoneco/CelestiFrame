import { subjectGeometry } from "../geometry/bearing.js?v=7";
import { normalizeDegrees, signedAngleDifference } from "../geometry/angle.js";

const formatDistance = (meters) => meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;

export function headingRelativeCardinalOffsets(heading, radius = 68) {
  if (!Number.isFinite(Number(heading)) || !Number.isFinite(Number(radius))) return [];
  return [
    { label: "N", bearing: 0 },
    { label: "E", bearing: 90 },
    { label: "S", bearing: 180 },
    { label: "W", bearing: 270 },
  ].map((cardinal) => {
    const angle = normalizeDegrees(cardinal.bearing - Number(heading));
    const radians = angle * Math.PI / 180;
    const x = Math.sin(radians) * Number(radius);
    const y = -Math.cos(radians) * Number(radius);
    return {
      ...cardinal,
      angle,
      x: Math.abs(x) < 1e-10 ? 0 : x,
      y: Math.abs(y) < 1e-10 ? 0 : y,
    };
  });
}

export function headingToTargetOffset(heading, targetBearing) {
  if (!Number.isFinite(Number(heading)) || !Number.isFinite(Number(targetBearing))) return null;
  return signedAngleDifference(Number(heading), Number(targetBearing));
}

export function bindFieldMode(store, showToast) {
  const dialog = document.querySelector("#field-dialog");
  const startButton = document.querySelector("#field-start");
  const wakeButton = document.querySelector("#field-wake");
  const headingOutput = document.querySelector("#field-heading");
  const targetOutput = document.querySelector("#field-target-bearing");
  const differenceOutput = document.querySelector("#field-heading-difference");
  const distanceOutput = document.querySelector("#field-distance");
  const accuracyOutput = document.querySelector("#field-accuracy");
  const cameraTargetButton = document.querySelector("#field-target-camera");
  const subjectTargetButton = document.querySelector("#field-target-subject");
  const compassRing = document.querySelector("#field-compass-ring");
  const compassArrow = document.querySelector("#field-compass-arrow");
  let watchId = null;
  let currentLocation = null;
  let heading = null;
  let wakeLock = null;
  let targetMode = "camera";

  function renderTargetSwitch(state) {
    const hasSubject = Boolean(state.subjectLocation);
    if (!hasSubject && targetMode === "subject") targetMode = "camera";
    cameraTargetButton.setAttribute("aria-pressed", String(targetMode === "camera"));
    subjectTargetButton.setAttribute("aria-pressed", String(targetMode === "subject"));
    subjectTargetButton.disabled = !hasSubject;
    subjectTargetButton.title = hasSubject ? state.subject.name || "被写体" : "被写体地点を設定してください";
  }

  function renderCardinalScale(currentHeading) {
    const offsets = headingRelativeCardinalOffsets(currentHeading);
    offsets.forEach(({ bearing, x, y }) => {
      const label = compassRing.querySelector(`[data-cardinal-bearing="${bearing}"]`);
      label.style.setProperty("--cardinal-x", `${x.toFixed(2)}px`);
      label.style.setProperty("--cardinal-y", `${y.toFixed(2)}px`);
    });
    compassRing.dataset.bearingReady = "true";
  }

  function render() {
    const state = store.getState();
    renderTargetSwitch(state);
    if (!currentLocation) return;
    const target = targetMode === "subject" ? state.subjectLocation : state.cameraLocation;
    const geometry = subjectGeometry(currentLocation, target);
    targetOutput.textContent = `${geometry.bearingDegrees.toFixed(1)}°`;
    distanceOutput.textContent = formatDistance(geometry.distanceMeters);
    if (heading == null) {
      headingOutput.textContent = "—";
      differenceOutput.textContent = "端末方位を取得できません";
      compassRing.dataset.bearingReady = "false";
      compassRing.dataset.headingReady = "false";
      compassArrow.style.transform = "rotate(0deg)";
      return;
    }
    renderCardinalScale(heading);
    compassRing.dataset.headingReady = "true";
    headingOutput.textContent = `${heading.toFixed(1)}°`;
    const difference = signedAngleDifference(geometry.bearingDegrees, heading);
    differenceOutput.textContent = Math.abs(difference) < 2
      ? "ほぼ正面です"
      : `${Math.abs(difference).toFixed(1)}° ${difference > 0 ? "左へ" : "右へ"}`;
    compassArrow.style.transform = `rotate(${headingToTargetOffset(heading, geometry.bearingDegrees)}deg)`;
  }

  function handleOrientation(event) {
    const compass = Number(event.webkitCompassHeading);
    if (Number.isFinite(compass)) heading = compass;
    else if (event.absolute && Number.isFinite(Number(event.alpha))) heading = (360 - Number(event.alpha)) % 360;
    else return;
    render();
  }

  async function startSensors() {
    if (!navigator.geolocation) return showToast("この端末では現在地を利用できません");
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        const permission = await DeviceOrientationEvent.requestPermission(true);
        if (permission !== "granted") showToast("端末方位の利用が許可されませんでした");
      } catch (error) {
        console.warn(error);
      }
    }
    window.addEventListener("deviceorientationabsolute", handleOrientation);
    window.addEventListener("deviceorientation", handleOrientation);
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition((position) => {
      currentLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      accuracyOutput.textContent = `±${Math.round(position.coords.accuracy)} m`;
      startButton.textContent = "現在地を更新中";
      render();
    }, (error) => {
      showToast(error.message || "現在地を取得できませんでした");
      startButton.textContent = "現在地と方位を開始";
    }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
  }

  async function toggleWakeLock() {
    if (!("wakeLock" in navigator)) return showToast("この端末は画面点灯維持に対応していません");
    try {
      if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      } else {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => {
          wakeLock = null;
          wakeButton.textContent = "画面点灯を維持";
          wakeButton.setAttribute("aria-pressed", "false");
        });
      }
      wakeButton.textContent = wakeLock ? "画面点灯を解除" : "画面点灯を維持";
      wakeButton.setAttribute("aria-pressed", String(Boolean(wakeLock)));
    } catch (error) {
      showToast(error.message || "画面点灯を維持できませんでした");
    }
  }

  document.querySelector("#field-button").addEventListener("click", () => {
    render();
    dialog.showModal();
  });
  document.querySelector("#field-close").addEventListener("click", () => dialog.close());
  cameraTargetButton.addEventListener("click", () => {
    targetMode = "camera";
    render();
  });
  subjectTargetButton.addEventListener("click", () => {
    if (!store.getState().subjectLocation) return showToast("先に被写体地点を設定してください");
    targetMode = "subject";
    render();
  });
  startButton.addEventListener("click", startSensors);
  wakeButton.addEventListener("click", toggleWakeLock);
  dialog.addEventListener("close", () => {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    window.removeEventListener("deviceorientationabsolute", handleOrientation);
    window.removeEventListener("deviceorientation", handleOrientation);
    wakeLock?.release();
    wakeLock = null;
    wakeButton.textContent = "画面点灯を維持";
    wakeButton.setAttribute("aria-pressed", "false");
  });
  store.subscribe(() => dialog.open && render());
}
