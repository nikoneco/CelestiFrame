import { subjectGeometry } from "../geometry/bearing.js?v=7";
import { signedAngleDifference } from "../geometry/angle.js";

const formatDistance = (meters) => meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;

export function bindFieldMode(store, showToast) {
  const dialog = document.querySelector("#field-dialog");
  const startButton = document.querySelector("#field-start");
  const wakeButton = document.querySelector("#field-wake");
  const headingOutput = document.querySelector("#field-heading");
  const targetOutput = document.querySelector("#field-target-bearing");
  const differenceOutput = document.querySelector("#field-heading-difference");
  const distanceOutput = document.querySelector("#field-distance");
  const accuracyOutput = document.querySelector("#field-accuracy");
  const targetName = document.querySelector("#field-target-name");
  let watchId = null;
  let currentLocation = null;
  let heading = null;
  let wakeLock = null;

  function render() {
    const state = store.getState();
    if (!currentLocation) {
      targetName.textContent = "撮影地点";
      return;
    }
    const cameraApproach = subjectGeometry(currentLocation, state.cameraLocation);
    const useSubject = cameraApproach.distanceMeters <= 30 && state.subjectLocation;
    const target = useSubject ? state.subjectLocation : state.cameraLocation;
    targetName.textContent = useSubject ? state.subject.name || "被写体" : "撮影地点";
    const geometry = subjectGeometry(currentLocation, target);
    targetOutput.textContent = `${geometry.bearingDegrees.toFixed(1)}°`;
    distanceOutput.textContent = formatDistance(geometry.distanceMeters);
    if (heading == null) {
      headingOutput.textContent = "—";
      differenceOutput.textContent = "端末方位を取得できません";
      return;
    }
    headingOutput.textContent = `${heading.toFixed(1)}°`;
    const difference = signedAngleDifference(geometry.bearingDegrees, heading);
    differenceOutput.textContent = Math.abs(difference) < 2
      ? "ほぼ正面です"
      : `${Math.abs(difference).toFixed(1)}° ${difference > 0 ? "左へ" : "右へ"}`;
    document.querySelector("#field-compass-arrow").style.transform = `rotate(${signedAngleDifference(heading, geometry.bearingDegrees)}deg)`;
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
        const permission = await DeviceOrientationEvent.requestPermission();
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
