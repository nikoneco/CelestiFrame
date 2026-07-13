import { subjectGeometry } from "../geometry/bearing.js?v=7";
import { calculateTargetAltitude } from "../geometry/target-altitude.js?v=24";

const pad = (value) => String(value).padStart(2, "0");

function localDateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function calendarYearLater(value) {
  const source = new Date(`${value}T00:00:00`);
  if (Number.isNaN(source.getTime())) return "";
  const targetYear = source.getFullYear() + 1;
  const targetMonth = source.getMonth();
  const targetDay = source.getDate();
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  return localDateValue(new Date(targetYear, targetMonth, Math.min(targetDay, lastDay)));
}

function minutesFromTime(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function normalizeOvernightEndMinute(startMinute, endMinute) {
  return endMinute < startMinute ? endMinute + 1440 : endMinute;
}

export function validateSearchInput(input) {
  const errors = [];
  const start = new Date(`${input.startDate}T00:00:00`);
  const end = new Date(`${input.endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) errors.push("検索期間を入力してください");
  else if (start > end) errors.push("開始日は終了日以前にしてください");
  else if (input.endDate > calendarYearLater(input.startDate)) errors.push("検索期間は開始日から1年以内にしてください");
  if (input.toleranceDegrees < 0.1 || input.toleranceDegrees > 180) errors.push("許容方位差は0.1〜180°にしてください");
  if (input.minAltitude < -90 || input.maxAltitude > 90 || input.minAltitude > input.maxAltitude) errors.push("仰角範囲を確認してください");
  if (input.minIllumination < 0 || input.minIllumination > 100) errors.push("月照度は0〜100%にしてください");
  if (input.target === "milkyway" && (input.maxSunAltitude < -90 || input.maxSunAltitude > 90)) errors.push("太陽仰角の上限を確認してください");
  if (input.matchTargetAltitude && (!Number.isFinite(input.targetAltitude) || input.verticalToleranceDegrees < 0 || input.verticalToleranceDegrees > 5)) errors.push("照準点の仰角条件を確認してください");
  return errors;
}

function formatDifference(value) {
  if (Math.abs(value) < 0.05) return "正面";
  return `${Math.abs(value).toFixed(1)}°${value > 0 ? "右" : "左"}`;
}

function renderResults(results, container, onSelect) {
  container.replaceChildren();
  if (!results.length) {
    const empty = document.createElement("p");
    empty.className = "search-empty";
    empty.textContent = "一致する日時がありません。許容方位差や仰角の範囲を少し広げてください。";
    container.append(empty);
    return;
  }

  results.slice(0, 100).forEach((result) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";
    button.style.setProperty("--score", `${Math.round(result.score)}%`);
    const date = new Date(result.iso);
    const dateText = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }).format(date);
    const timeText = new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    const illuminationText = result.illumination === null ? "" : `照度 ${result.illumination.toFixed(0)}%`;
    const diamondLabels = { center: "中心付近", disk: "太陽円盤内", near: "円盤に接近", "azimuth-only": "方位のみ一致" };
    const secondaryText = result.diamondState
      ? `${diamondLabels[result.diamondState]}・仰角差 ${Math.abs(result.verticalDifference).toFixed(2)}°`
      : result.sunAltitude !== null
        ? `アーチ仰角 ${result.altitude.toFixed(1)}°・太陽仰角 ${result.sunAltitude.toFixed(1)}°`
      : `仰角 ${result.altitude.toFixed(1)}° ${illuminationText}`;
    const dateBlock = document.createElement("span");
    dateBlock.className = "result-date";
    const dateLabel = document.createElement("b");
    dateLabel.textContent = dateText;
    const timeLabel = document.createElement("strong");
    timeLabel.textContent = timeText;
    dateBlock.append(dateLabel, timeLabel);

    const metrics = document.createElement("span");
    metrics.className = "result-metrics";
    const difference = document.createElement("b");
    difference.textContent = `方位差 ${formatDifference(result.difference)}`;
    const secondary = document.createElement("span");
    secondary.textContent = secondaryText;
    metrics.append(difference, secondary);

    const score = document.createElement("span");
    score.className = "result-score";
    score.textContent = String(Math.round(result.score));
    button.append(dateBlock, metrics, score);
    button.addEventListener("click", () => onSelect(result));
    container.append(button);
  });
}

export function bindSearchControls(store, showToast) {
  const dialog = document.querySelector("#search-dialog");
  const form = document.querySelector("#search-form");
  const progressPanel = document.querySelector("#search-progress-panel");
  const progress = document.querySelector("#search-progress");
  const progressLabel = document.querySelector("#search-progress-label");
  const resultsSection = document.querySelector("#search-results-section");
  const resultsSummary = document.querySelector("#search-results-summary");
  const resultsContainer = document.querySelector("#search-results");
  const submitButton = document.querySelector("#search-submit");
  const cancelButton = document.querySelector("#search-cancel");
  const overnightBadge = document.querySelector("#overnight-badge");
  const diamondToggle = document.querySelector("#diamond-toggle");
  const diamondTolerance = document.querySelector("#diamond-tolerance");
  const diamondSummary = document.querySelector("#diamond-target-summary");
  const moonIlluminationCondition = document.querySelector("#moon-illumination-condition");
  const milkyWayDarknessCondition = document.querySelector("#milkyway-darkness-condition");
  const oneYearButton = document.querySelector("#search-end-one-year");
  let worker = null;

  function stopWorker() {
    worker?.terminate();
    worker = null;
  }

  function resetSearchUi({ keepProgress = false } = {}) {
    resultsContainer.replaceChildren();
    resultsSection.hidden = true;
    resultsSummary.value = "";
    resultsSummary.textContent = "";
    if (!keepProgress) progressPanel.hidden = true;
  }

  function revealResults(count) {
    const visibleCount = Math.min(count, 100);
    const summary = count > visibleCount ? `${count}件中 上位${visibleCount}件` : `${count}件`;
    resultsSummary.value = summary;
    resultsSummary.textContent = summary;
    resultsSection.hidden = false;
    requestAnimationFrame(() => resultsSection.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  function invalidateSearchResults() {
    if (worker) {
      stopWorker();
      submitButton.disabled = false;
      cancelButton.hidden = true;
    }
    resetSearchUi();
  }

  function targetAltitudeForState(state) {
    if (!state.subjectLocation) return null;
    const geometry = subjectGeometry(state.cameraLocation, state.subjectLocation);
    return calculateTargetAltitude({
      distanceMeters: geometry.distanceMeters,
      cameraElevationMeters: state.composition.cameraElevationMeters,
      cameraHeightMeters: state.composition.cameraHeightMeters,
      targetElevationMeters: state.subject.groundElevationMeters,
      targetHeightMeters: state.subject.heightMeters,
      targetMode: state.subject.targetMode,
    });
  }

  function updateDiamondControls() {
    const target = form.elements.target.value;
    const isSun = target === "sun";
    diamondToggle.hidden = !isSun;
    diamondTolerance.hidden = !isSun || !form.elements.matchTargetAltitude.checked;
    moonIlluminationCondition.hidden = target !== "moon";
    milkyWayDarknessCondition.hidden = target !== "milkyway";
    if (!isSun) return;
    try {
      const target = targetAltitudeForState(store.getState());
      diamondSummary.textContent = target
        ? `照準仰角 ${target.altitudeDegrees.toFixed(2)}°・太陽円盤との重なりを判定`
        : "先に被写体地点を設定してください";
    } catch {
      diamondSummary.textContent = "標高と高さを確認してください";
    }
  }

  function updateOvernightBadge() {
    if (!form.elements.startTime.value || !form.elements.endTime.value) return;
    const startMinute = minutesFromTime(form.elements.startTime.value);
    const endMinute = minutesFromTime(form.elements.endTime.value);
    overnightBadge.hidden = endMinute >= startMinute;
  }

  document.querySelector("#alignment-search-button").addEventListener("click", () => {
    const state = store.getState();
    if (!state.subjectLocation) return showToast("先に被写体地点を設定してください");
    const selected = new Date(state.selectedDateTime);
    const end = new Date(selected);
    end.setDate(end.getDate() + 30);
    form.elements.startDate.value = localDateValue(selected);
    form.elements.endDate.value = localDateValue(end);
    const target = ["sun", "moon", "milkyway"].includes(state.selectedBody) ? state.selectedBody : "moon";
    form.elements.target.value = target;
    form.elements.minIllumination.disabled = target !== "moon";
    form.elements.startTime.value = target === "sun" ? "04:00" : "18:00";
    form.elements.endTime.value = target === "sun" ? "20:00" : "06:00";
    form.elements.maxAltitude.value = target === "milkyway" ? "90" : "45";
    form.elements.matchTargetAltitude.checked = target === "sun";
    updateOvernightBadge();
    updateDiamondControls();
    stopWorker();
    submitButton.disabled = false;
    cancelButton.hidden = true;
    resetSearchUi();
    dialog.showModal();
  });

  Array.from(form.elements.target).forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      form.elements.minIllumination.disabled = input.value !== "moon";
      form.elements.startTime.value = input.value === "sun" ? "04:00" : "18:00";
      form.elements.endTime.value = input.value === "sun" ? "20:00" : "06:00";
      form.elements.maxAltitude.value = input.value === "milkyway" ? "90" : "45";
      form.elements.matchTargetAltitude.checked = input.value === "sun";
      updateOvernightBadge();
      updateDiamondControls();
    });
  });

  form.elements.matchTargetAltitude.addEventListener("change", updateDiamondControls);

  form.elements.startTime.addEventListener("change", updateOvernightBadge);
  form.elements.endTime.addEventListener("change", updateOvernightBadge);
  form.addEventListener("input", invalidateSearchResults);
  form.addEventListener("change", invalidateSearchResults);

  oneYearButton.addEventListener("click", () => {
    const nextYear = calendarYearLater(form.elements.startDate.value);
    if (!nextYear) return showToast("先に開始日を入力してください");
    form.elements.endDate.value = nextYear;
    form.elements.endDate.dispatchEvent(new Event("change", { bubbles: true }));
  });

  document.querySelector("#search-close").addEventListener("click", () => {
    stopWorker();
    dialog.close();
  });

  dialog.addEventListener("cancel", () => {
    stopWorker();
    submitButton.disabled = false;
    cancelButton.hidden = true;
  });

  cancelButton.addEventListener("click", () => {
    stopWorker();
    submitButton.disabled = false;
    cancelButton.hidden = true;
    progressLabel.textContent = "検索をキャンセルしました";
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const state = store.getState();
    const geometry = subjectGeometry(state.cameraLocation, state.subjectLocation);
    const data = new FormData(form);
    const startMinute = minutesFromTime(data.get("startTime"));
    const matchTargetAltitude = data.get("target") === "sun" && data.get("matchTargetAltitude") === "on";
    let targetAltitude = null;
    if (matchTargetAltitude) {
      const elevationsReady = [state.composition.cameraElevationStatus, state.subject.groundElevationStatus]
        .every((status) => status === "ready" || status === "manual");
      if (!elevationsReady) return showToast("撮影地点と被写体地点の標高を取得してください");
      targetAltitude = targetAltitudeForState(state);
    }
    const input = {
      target: data.get("target"),
      cameraLocation: state.cameraLocation,
      subjectBearing: geometry.bearingDegrees,
      startDate: data.get("startDate"),
      endDate: data.get("endDate"),
      startMinute,
      endMinute: normalizeOvernightEndMinute(startMinute, minutesFromTime(data.get("endTime"))),
      stepMinutes: Number(data.get("stepMinutes")),
      toleranceDegrees: Number(data.get("toleranceDegrees")),
      minAltitude: Number(data.get("minAltitude")),
      maxAltitude: Number(data.get("maxAltitude")),
      minIllumination: Number(data.get("minIllumination") || 0),
      maxSunAltitude: Number(data.get("maxSunAltitude") || 90),
      matchTargetAltitude,
      targetAltitude: targetAltitude?.altitudeDegrees ?? null,
      verticalToleranceDegrees: Number(data.get("verticalToleranceDegrees") || 0.3),
    };
    const errors = validateSearchInput(input);
    if (errors.length) return showToast(errors[0]);

    stopWorker();
    const searchWorker = new Worker(new URL("./search-worker.js?v=42", import.meta.url));
    worker = searchWorker;
    submitButton.disabled = true;
    cancelButton.hidden = false;
    progressPanel.hidden = false;
    progress.value = 0;
    progressLabel.textContent = "方位を走査しています…";
    resetSearchUi({ keepProgress: true });
    const handleWorkerFailure = (message) => {
      if (worker !== searchWorker) return;
      console.error("Alignment search worker failed", message);
      submitButton.disabled = false;
      cancelButton.hidden = true;
      progressLabel.textContent = "検索Workerを起動できませんでした";
      showToast(`日時検索を開始できません: ${message}`);
      searchWorker.terminate();
      worker = null;
    };
    searchWorker.addEventListener("error", (error) => {
      error.preventDefault();
      handleWorkerFailure(error.message || "Worker script error");
    });
    searchWorker.addEventListener("messageerror", () => {
      handleWorkerFailure("Worker message error");
    });
    searchWorker.addEventListener("message", (message) => {
      if (worker !== searchWorker) return;
      if (message.data.type === "progress") {
        const percent = Math.round(message.data.progress * 100);
        progress.value = percent;
        progressLabel.textContent = `${percent}% 走査済み`;
      }
      if (message.data.type === "done") {
        submitButton.disabled = false;
        cancelButton.hidden = true;
        progress.value = 100;
        progressLabel.textContent = `${message.data.results.length}件の候補を検出`;
        renderResults(message.data.results, resultsContainer, (result) => {
          store.setState((current) => ({ ...current, selectedDateTime: result.iso }));
          dialog.close();
          showToast("検索結果の日時を地図へ反映しました");
        });
        revealResults(message.data.results.length);
        searchWorker.terminate();
        worker = null;
      }
      if (message.data.type === "error") {
        submitButton.disabled = false;
        cancelButton.hidden = true;
        progressLabel.textContent = "検索に失敗しました";
        showToast(message.data.message);
        searchWorker.terminate();
        worker = null;
      }
    });
    searchWorker.postMessage(input);
  });
}
