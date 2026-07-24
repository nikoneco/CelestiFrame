import { subjectGeometry } from "../geometry/bearing.js?v=7";
import {
  calculateObservationHeight,
  calculateStructureHeight,
  OrientationStabilityTracker,
  orientationSampleFromEvent,
} from "./observation-height-service.js?v=2";

const READY_ELEVATION_STATES = new Set(["ready", "manual"]);
const formatDistance = (meters) => meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
const isLocation = (value) => Number.isFinite(Number(value?.latitude)) && Number.isFinite(Number(value?.longitude));

export class MeasurementCommitter {
  constructor(store) {
    this.store = store;
    this.pendingHeight = null;
    this.pendingMode = null;
  }

  stage(heightMeters, mode = "observer") {
    const height = Number(heightMeters);
    const limit = mode === "structure" ? 10000 : 1000;
    if (!Number.isFinite(height) || height < 0 || height > limit) throw new Error("反映できる高さではありません");
    if (!["observer", "structure"].includes(mode)) throw new Error("反映先が正しくありません");
    this.pendingHeight = height;
    this.pendingMode = mode;
    return {
      heightMeters: height,
      mode,
      currentHeightMeters: Number(mode === "structure"
        ? this.store.getState().subject.heightMeters
        : this.store.getState().composition.cameraHeightMeters),
    };
  }

  cancel() {
    this.pendingHeight = null;
    this.pendingMode = null;
  }

  confirm() {
    if (this.pendingHeight == null) return false;
    const height = this.pendingHeight;
    const mode = this.pendingMode;
    this.store.setState((state) => mode === "structure"
      ? { ...state, subject: { ...state.subject, heightMeters: height, targetMode: "structure" } }
      : { ...state, composition: { ...state.composition, cameraHeightMeters: height } });
    this.pendingHeight = null;
    this.pendingMode = null;
    return true;
  }
}

export function validateObservationContext(state) {
  if (!isLocation(state?.cameraLocation)) return "撮影地点の位置情報を取得できません";
  if (!isLocation(state?.subjectLocation)) return "被写体地点を地図上で設定してください";
  if (!READY_ELEVATION_STATES.has(state?.composition?.cameraElevationStatus)) return "撮影地点の標高を取得または入力してください";
  if (!READY_ELEVATION_STATES.has(state?.subject?.groundElevationStatus)) return "被写体地点の標高を取得または入力してください";
  return "";
}

export function bindObservationHeightMeasurement(store, showToast, {
  beginSubjectSelection = () => {},
  closeTopbarMenu = () => {},
} = {}) {
  const dialog = document.querySelector("#observation-height-dialog");
  const confirmDialog = document.querySelector("#observation-height-confirm-dialog");
  const openButton = document.querySelector("#observation-height-button");
  const modeButtons = [...document.querySelectorAll("[data-observation-height-mode]")];
  const guideTarget = document.querySelector("#observation-height-guide-target");
  const viewfinder = document.querySelector(".observation-height-viewfinder");
  const pickSubjectButton = document.querySelector("#observation-height-pick-subject");
  const startButton = document.querySelector("#observation-height-start");
  const retryButton = document.querySelector("#observation-height-retry");
  const closeButtons = [...dialog.querySelectorAll("[data-observation-height-close]")];
  const angleOutput = document.querySelector("#observation-height-angle");
  const distanceOutput = document.querySelector("#observation-height-distance");
  const sensorOutput = document.querySelector("#observation-height-sensor");
  const measurementOutput = document.querySelector("#observation-height-status");
  const errorOutput = document.querySelector("#observation-height-error");
  const warningOutput = document.querySelector("#observation-height-warning");
  const levelWarning = document.querySelector("#observation-height-level-warning");
  const progress = document.querySelector("#observation-height-progress");
  const resultPanel = document.querySelector("#observation-height-result");
  const resultHeight = document.querySelector("#observation-height-result-value");
  const resultTitle = document.querySelector("#observation-height-result-title");
  const resultAngle = document.querySelector("#observation-height-result-angle");
  const resultDistance = document.querySelector("#observation-height-result-distance");
  const applyButton = document.querySelector("#observation-height-apply");
  const confirmValue = document.querySelector("#observation-height-confirm-value");
  const confirmCurrent = document.querySelector("#observation-height-confirm-current");
  const confirmTitle = document.querySelector("#observation-height-confirm-title");
  const confirmQuestion = document.querySelector("#observation-height-confirm-question");
  const confirmCurrentLabel = document.querySelector("#observation-height-confirm-current-label");
  const confirmCancel = document.querySelector("#observation-height-confirm-cancel");
  const confirmApply = document.querySelector("#observation-height-confirm-apply");
  const committer = new MeasurementCommitter(store);
  const tracker = new OrientationStabilityTracker();
  let measurementMode = "observer";
  let latestResult = null;
  let awaitingSubjectSelection = false;
  let sensorTimer = null;
  let listening = false;

  function screenAngle() {
    return Number(window.screen?.orientation?.angle ?? window.orientation ?? 0) || 0;
  }

  function setError(message = "") {
    errorOutput.textContent = message;
    errorOutput.hidden = !message;
  }

  function renderContext() {
    const state = store.getState();
    const error = validateObservationContext(state);
    setError(error);
    if (isLocation(state.cameraLocation) && isLocation(state.subjectLocation)) {
      const geometry = subjectGeometry(state.cameraLocation, state.subjectLocation);
      distanceOutput.textContent = formatDistance(geometry.distanceMeters);
      warningOutput.hidden = geometry.distanceMeters >= 50;
    } else {
      distanceOutput.textContent = "—";
      warningOutput.hidden = true;
    }
    pickSubjectButton.textContent = state.subjectLocation ? "被写体地点を地図で変更" : "被写体地点を地図で選択";
    startButton.disabled = Boolean(error);
    modeButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.observationHeightMode === measurementMode)));
    const structureMode = measurementMode === "structure";
    resultTitle.textContent = structureMode ? "推定建造物高さ" : "推定観測点高さ";
    applyButton.textContent = structureMode ? "建造物の高さへ反映" : "カメラ高へ反映";
    guideTarget.textContent = structureMode
      ? "画面中央の照準を、建造物の頂点へ合わせます。"
      : "画面中央の照準を、被写体の地面との接点へ合わせます。";
    viewfinder.setAttribute("aria-label", structureMode ? "建造物の頂点に合わせる照準" : "被写体の地面との接点に合わせる照準");
  }

  function stopSensors() {
    if (!listening) return;
    window.removeEventListener("deviceorientationabsolute", handleOrientation);
    window.removeEventListener("deviceorientation", handleOrientation);
    listening = false;
    clearTimeout(sensorTimer);
    sensorTimer = null;
  }

  function resetMeasurement() {
    stopSensors();
    tracker.reset();
    latestResult = null;
    resultPanel.hidden = true;
    retryButton.hidden = true;
    applyButton.hidden = true;
    startButton.hidden = false;
    angleOutput.textContent = "—";
    sensorOutput.textContent = "待機";
    measurementOutput.textContent = "未開始";
    progress.value = 0;
    levelWarning.hidden = true;
    setError(validateObservationContext(store.getState()));
  }

  function finishMeasurement(angleDegrees) {
    stopSensors();
    const state = store.getState();
    const contextError = validateObservationContext(state);
    if (contextError) {
      setError(contextError);
      measurementOutput.textContent = "測定失敗";
      return;
    }
    try {
      const geometry = subjectGeometry(state.cameraLocation, state.subjectLocation);
      const common = {
        distanceMeters: geometry.distanceMeters,
        cameraGroundElevationMeters: state.composition.cameraElevationMeters,
        targetGroundElevationMeters: state.subject.groundElevationMeters,
        angleDegrees,
      };
      const result = measurementMode === "structure"
        ? calculateStructureHeight({ ...common, cameraHeightMeters: state.composition.cameraHeightMeters })
        : calculateObservationHeight(common);
      const maximum = measurementMode === "structure" ? 10000 : 1000;
      if (result.heightMeters < 0 || result.heightMeters > maximum) {
        throw new Error("推定値が範囲外です。照準点、地点、標高を確認してください");
      }
      latestResult = { ...result, mode: measurementMode };
      resultTitle.textContent = measurementMode === "structure" ? "推定建造物高さ" : "推定観測点高さ";
      resultHeight.textContent = `${result.heightMeters.toFixed(1)} m`;
      resultAngle.textContent = `${result.angleDegrees.toFixed(1)}°`;
      resultDistance.textContent = formatDistance(result.distanceMeters);
      resultPanel.hidden = false;
      retryButton.hidden = false;
      applyButton.hidden = false;
      applyButton.textContent = measurementMode === "structure" ? "建造物の高さへ反映" : "カメラ高へ反映";
      startButton.hidden = true;
      measurementOutput.textContent = "安定";
      sensorOutput.textContent = "測定完了";
      progress.value = 1;
      navigator.vibrate?.(45);
    } catch (error) {
      setError(error.message || (measurementMode === "structure"
        ? "建造物の高さを計算できませんでした"
        : "観測点高さを計算できませんでした"));
      measurementOutput.textContent = "測定失敗";
      retryButton.hidden = false;
      startButton.hidden = true;
    }
  }

  function handleOrientation(event) {
    const sample = orientationSampleFromEvent(event, screenAngle());
    if (!sample) {
      sensorOutput.textContent = "値を取得できません";
      return;
    }
    clearTimeout(sensorTimer);
    sensorTimer = window.setTimeout(() => {
      sensorOutput.textContent = "入力待ち";
      measurementOutput.textContent = "入力なし";
      setError("姿勢センサーの値を継続取得できません。端末設定と権限を確認してください");
      retryButton.hidden = false;
      stopSensors();
    }, 2500);
    sensorOutput.textContent = "受信中";
    angleOutput.textContent = `${sample.angleDegrees.toFixed(1)}°`;
    const tracked = tracker.addSample({ ...sample, timestamp: event.timeStamp || performance.now() });
    levelWarning.hidden = tracked.status !== "level";
    if (tracked.status === "level") {
      measurementOutput.textContent = "水平待ち";
      progress.value = 0;
    } else if (tracked.status === "moving") {
      measurementOutput.textContent = "静止待ち";
      progress.value = 0;
    } else if (tracked.status === "stabilizing") {
      measurementOutput.textContent = "安定判定中";
      progress.value = tracked.progress;
    } else if (tracked.status === "complete") {
      finishMeasurement(tracked.angleDegrees);
    }
  }

  async function startMeasurement() {
    resetMeasurement();
    const contextError = validateObservationContext(store.getState());
    if (contextError) return setError(contextError);
    if (typeof window.DeviceOrientationEvent === "undefined") {
      sensorOutput.textContent = "非対応";
      measurementOutput.textContent = "開始できません";
      return setError("この端末は姿勢センサーに対応していません");
    }

    if (typeof window.DeviceOrientationEvent.requestPermission === "function") {
      try {
        const permission = await window.DeviceOrientationEvent.requestPermission();
        if (permission !== "granted") {
          sensorOutput.textContent = "権限拒否";
          measurementOutput.textContent = "開始できません";
          return setError("姿勢センサーの利用が許可されませんでした");
        }
      } catch (error) {
        sensorOutput.textContent = "権限エラー";
        measurementOutput.textContent = "開始できません";
        return setError(error.message || "姿勢センサーの権限を取得できませんでした");
      }
    }

    setError("");
    tracker.reset();
    resultPanel.hidden = true;
    retryButton.hidden = true;
    applyButton.hidden = true;
    startButton.hidden = true;
    sensorOutput.textContent = "待機中";
    measurementOutput.textContent = "端末を静止";
    window.addEventListener("deviceorientationabsolute", handleOrientation);
    window.addEventListener("deviceorientation", handleOrientation);
    listening = true;
    sensorTimer = window.setTimeout(() => {
      sensorOutput.textContent = "入力待ち";
      measurementOutput.textContent = "入力なし";
      setError("姿勢センサーの値を取得できません。端末設定と権限を確認してください");
      retryButton.hidden = false;
      stopSensors();
    }, 3500);
  }

  function open() {
    closeTopbarMenu();
    resetMeasurement();
    renderContext();
    dialog.showModal();
  }

  openButton.addEventListener("click", open);
  modeButtons.forEach((button) => button.addEventListener("click", () => {
    measurementMode = button.dataset.observationHeightMode;
    resetMeasurement();
    renderContext();
  }));
  pickSubjectButton.addEventListener("click", () => {
    awaitingSubjectSelection = true;
    dialog.close();
    beginSubjectSelection();
  });
  startButton.addEventListener("click", startMeasurement);
  retryButton.addEventListener("click", startMeasurement);
  closeButtons.forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("close", stopSensors);
  applyButton.addEventListener("click", () => {
    if (!latestResult) return;
    const pending = committer.stage(Number(latestResult.heightMeters.toFixed(1)), latestResult.mode);
    const structureMode = pending.mode === "structure";
    confirmTitle.textContent = structureMode ? "建造物の高さへ反映" : "カメラ高へ反映";
    confirmQuestion.textContent = structureMode
      ? "推定建造物高さを「建造物の高さ」へ反映しますか？"
      : "推定観測点高さを「カメラ高」へ反映しますか？";
    confirmCurrentLabel.textContent = structureMode ? "現在の建造物の高さ" : "現在のカメラ高";
    confirmValue.textContent = `${pending.heightMeters.toFixed(1)} m`;
    confirmCurrent.textContent = `${pending.currentHeightMeters.toFixed(1)} m`;
    confirmDialog.showModal();
  });
  confirmCancel.addEventListener("click", () => {
    committer.cancel();
    confirmDialog.close();
  });
  confirmApply.addEventListener("click", () => {
    const appliedMode = committer.pendingMode;
    if (!committer.confirm()) return;
    confirmDialog.close();
    dialog.close();
    showToast(appliedMode === "structure"
      ? "推定建造物高さを建造物の高さへ反映しました"
      : "推定観測点高さをカメラ高へ反映しました");
  });
  confirmDialog.addEventListener("cancel", () => committer.cancel());
  const unsubscribe = store.subscribe(() => dialog.open && renderContext());

  return {
    resumeAfterSubjectSelection() {
      if (!awaitingSubjectSelection) return false;
      awaitingSubjectSelection = false;
      renderContext();
      dialog.showModal();
      startButton.focus();
      return true;
    },
    destroy() {
      stopSensors();
      unsubscribe();
    },
  };
}
