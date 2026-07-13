import { calculatePolarisData } from "../astronomy/polaris-service.js";
import { signedAngleDifference } from "../geometry/angle.js";

const normalizeSigned = (value) => ((value + 540) % 360) - 180;
const formatClock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export function bindPolarAssist(showToast) {
  const dialog = document.querySelector("#polar-assist-dialog");
  const video = document.querySelector("#polar-camera");
  const startButton = document.querySelector("#polar-start");
  const levelButton = document.querySelector("#polar-level");
  const flipButton = document.querySelector("#polar-flip");
  const stateOutput = document.querySelector("#polar-state");
  const headingOutput = document.querySelector("#polar-heading");
  const ncpOutput = document.querySelector("#polar-ncp");
  const polarisOutput = document.querySelector("#polar-position");
  const clockOutput = document.querySelector("#polar-clock");
  const guidanceOutput = document.querySelector("#polar-guidance");
  const ncpMarker = document.querySelector("#polar-ncp-marker");
  const polarisMarker = document.querySelector("#polar-polaris-marker");
  let stream = null;
  let watchId = null;
  let location = null;
  let heading = null;
  let beta = null;
  let levelBeta = null;
  let tiltDirection = 1;
  let refreshTimer = null;

  function setState(message) { stateOutput.textContent = message; }

  function placeMarker(marker, target, cameraAltitude = 0) {
    const x = 50 + (signedAngleDifference(heading ?? 0, target.azimuth) / 60) * 50;
    const y = 50 - ((target.altitude - cameraAltitude) / 45) * 50;
    const clampedX = Math.min(94, Math.max(6, x));
    const clampedY = Math.min(92, Math.max(8, y));
    marker.style.left = `${clampedX}%`;
    marker.style.top = `${clampedY}%`;
    marker.classList.toggle("is-offscreen", x !== clampedX || y !== clampedY);
  }

  function render() {
    if (!location) return;
    const polaris = calculatePolarisData(new Date(), location);
    const cameraAltitude = levelBeta == null || beta == null ? 0 : tiltDirection * normalizeSigned(beta - levelBeta);
    ncpOutput.textContent = `北 0.0° / 高度 ${polaris.northCelestialPole.altitude.toFixed(1)}°`;
    polarisOutput.textContent = `方位 ${polaris.azimuth.toFixed(1)}° / 高度 ${polaris.altitude.toFixed(1)}°`;
    clockOutput.textContent = `空の配置 ${formatClock(polaris.skyClockMinutes)}`;
    headingOutput.textContent = heading == null ? "—" : `${heading.toFixed(1)}°`;
    placeMarker(ncpMarker, polaris.northCelestialPole, cameraAltitude);
    placeMarker(polarisMarker, polaris, cameraAltitude);
    if (heading == null) {
      guidanceOutput.textContent = "端末方位を待っています。北を向けてください。";
    } else {
      const difference = signedAngleDifference(heading, polaris.northCelestialPole.azimuth);
      const turn = Math.abs(difference) < 2 ? "北を向いています" : `${Math.abs(difference).toFixed(1)}° ${difference > 0 ? "右" : "左"}へ向ける`;
      guidanceOutput.textContent = `${turn}。北極星は北天の極から ${polaris.separationDegrees.toFixed(2)}° の位置です。`;
    }
  }

  function handleOrientation(event) {
    const compass = Number(event.webkitCompassHeading);
    if (Number.isFinite(compass)) heading = compass;
    else if (event.absolute && Number.isFinite(Number(event.alpha))) heading = (360 - Number(event.alpha)) % 360;
    if (Number.isFinite(Number(event.beta))) beta = Number(event.beta);
    render();
  }

  async function requestSensors() {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      const permission = await DeviceOrientationEvent.requestPermission(true);
      if (permission !== "granted") throw new Error("端末方位の利用が許可されませんでした");
    }
    window.addEventListener("deviceorientationabsolute", handleOrientation);
    window.addEventListener("deviceorientation", handleOrientation);
    if (!navigator.geolocation) throw new Error("この端末では現在地を利用できません");
    watchId = navigator.geolocation.watchPosition((position) => {
      location = { latitude: position.coords.latitude, longitude: position.coords.longitude };
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
      setState("カメラ・現在地・方位を利用中");
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
    window.clearInterval(refreshTimer);
    refreshTimer = null;
    startButton.disabled = false;
    startButton.textContent = "カメラとセンサーを開始";
    setState("開始すると端末内でカメラを表示します");
  }

  document.querySelector("#field-polar-assist").addEventListener("click", () => dialog.showModal());
  document.querySelector("#polar-close").addEventListener("click", () => dialog.close());
  startButton.addEventListener("click", start);
  levelButton.addEventListener("click", () => {
    if (beta == null) return showToast("先に端末センサーを開始してください");
    levelBeta = beta;
    levelButton.textContent = "水平基準を更新";
    setState("地平線を基準にしました。上下が逆なら反転できます。");
    render();
  });
  flipButton.addEventListener("click", () => {
    tiltDirection *= -1;
    flipButton.setAttribute("aria-pressed", String(tiltDirection === -1));
    render();
  });
  dialog.addEventListener("close", stop);
}
