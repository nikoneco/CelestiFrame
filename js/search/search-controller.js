import { subjectGeometry } from "../geometry/bearing.js?v=7";
import { calculateTargetAltitude } from "../geometry/target-altitude.js?v=24";
import { getTarget } from "../astronomy/target-catalog.js?v=1";

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
  if (!getTarget(input.target)) errors.push("検索する撮影対象を選んでください");
  const start = new Date(`${input.startDate}T00:00:00`);
  const end = new Date(`${input.endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) errors.push("検索期間を入力してください");
  else if (start > end) errors.push("開始日は終了日以前にしてください");
  else if (input.endDate > calendarYearLater(input.startDate)) errors.push("検索期間は開始日から1年以内にしてください");
  if (input.toleranceDegrees < 0.1 || input.toleranceDegrees > 180) errors.push("許容方位差は0.1〜180°にしてください");
  if (input.minAltitude < -90 || input.maxAltitude > 90 || input.minAltitude > input.maxAltitude) errors.push("仰角範囲を確認してください");
  if (input.minIllumination < 0 || input.minIllumination > 100) errors.push("月照度は0〜100%にしてください");
  if (!["sun", "moon"].includes(input.target) && (input.maxSunAltitude < -90 || input.maxSunAltitude > 90)) errors.push("太陽仰角の上限を確認してください");
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
        ? `仰角 ${result.altitude.toFixed(1)}°・太陽仰角 ${result.sunAltitude.toFixed(1)}°`
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
  const panel = dialog.querySelector(".search-panel");
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
  const targetAltitudeReference = document.querySelector("#search-target-altitude-reference");
  const targetAltitudeNote = document.querySelector("#search-target-altitude-note");
  const moonIlluminationCondition = document.querySelector("#moon-illumination-condition");
  const milkyWayDarknessCondition = document.querySelector("#milkyway-darkness-condition");
  const oneYearButton = document.querySelector("#search-end-one-year");
  const feedback = document.querySelector("#search-feedback");
  let worker = null;

  function syncTargetOptions(state, preferredTarget = form.elements.target.value) {
    form.elements.target.replaceChildren(...state.selectedTargets.map((targetId) => {
      const target = getTarget(targetId);
      const option = document.createElement("option");
      option.value = targetId;
      option.textContent = target.label;
      return option;
    }));
    form.elements.target.value = state.selectedTargets.includes(preferredTarget)
      ? preferredTarget
      : state.selectedTargets[0];
  }

  function applyTargetDefaults(targetId) {
    const target = getTarget(targetId);
    const isSun = targetId === "sun";
    const isMoon = targetId === "moon";
    form.elements.minIllumination.disabled = !isMoon;
    form.elements.startTime.value = isSun ? "04:00" : "18:00";
    form.elements.endTime.value = isSun ? "20:00" : "06:00";
    form.elements.maxAltitude.value = targetId === "milkyway" || target?.kind === "fixed" ? "90" : "45";
    form.elements.matchTargetAltitude.checked = isSun;
    if (targetId === "milkyway" || target?.kind === "fixed") form.elements.maxSunAltitude.value = "-12";
    else if (!isSun && !isMoon) form.elements.maxSunAltitude.value = "90";
    updateOvernightBadge();
    updateDiamondControls();
  }

  function scrollStatusIntoView(element, block = "center") {
    requestAnimationFrame(() => element.scrollIntoView({ block, behavior: "smooth" }));
  }

  function clearFeedback() {
    feedback.hidden = true;
    feedback.textContent = "";
  }

  function showFeedback(message) {
    feedback.textContent = message;
    feedback.hidden = false;
    scrollStatusIntoView(feedback, "nearest");
  }

  function setSearchBusy(busy) {
    submitButton.disabled = busy;
    submitButton.textContent = busy ? "検索中…" : "日時を検索";
    cancelButton.hidden = !busy;
  }

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
    clearFeedback();
  }

  function revealResults(count) {
    const visibleCount = Math.min(count, 100);
    const summary = count > visibleCount ? `${count}件中 上位${visibleCount}件` : `${count}件`;
    resultsSummary.value = summary;
    resultsSummary.textContent = summary;
    resultsSection.hidden = false;
    scrollStatusIntoView(resultsSection, "start");
  }

  function invalidateSearchResults() {
    if (worker) {
      stopWorker();
      setSearchBusy(false);
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

  function updateTargetAltitudeReference() {
    const state = store.getState();
    if (!state.subjectLocation) {
      targetAltitudeReference.value = "—";
      targetAltitudeReference.textContent = "—";
      targetAltitudeNote.textContent = "被写体地点を設定すると表示します";
      return;
    }
    try {
      const target = targetAltitudeForState(state);
      const value = `${target.altitudeDegrees.toFixed(2)}°`;
      targetAltitudeReference.value = value;
      targetAltitudeReference.textContent = value;
      const elevationsReady = [state.composition.cameraElevationStatus, state.subject.groundElevationStatus]
        .every((status) => status === "ready" || status === "manual");
      const targetLabel = state.subject.targetMode === "terrain" ? "地形点" : "建造物上端";
      targetAltitudeNote.textContent = elevationsReady ? `${targetLabel}への現在値` : `${targetLabel}への暫定値・標高取得中`;
    } catch {
      targetAltitudeReference.value = "—";
      targetAltitudeReference.textContent = "—";
      targetAltitudeNote.textContent = "標高と高さを確認してください";
    }
  }

  function updateDiamondControls() {
    updateTargetAltitudeReference();
    const target = form.elements.target.value;
    const isSun = target === "sun";
    const isDarkSkyTarget = !["sun", "moon"].includes(target);
    diamondToggle.hidden = !isSun;
    diamondTolerance.hidden = !isSun || !form.elements.matchTargetAltitude.checked;
    moonIlluminationCondition.hidden = target !== "moon";
    milkyWayDarknessCondition.hidden = !isDarkSkyTarget;
    milkyWayDarknessCondition.querySelector(":scope > span:first-child").textContent = target === "milkyway" ? "太陽仰角の上限" : "空の暗さ";
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

  function updateDateLimits() {
    const startDate = form.elements.startDate.value;
    form.elements.endDate.min = startDate;
    form.elements.endDate.max = calendarYearLater(startDate);
  }

  function validateDateRangeFeedback() {
    const startDate = form.elements.startDate.value;
    const endDate = form.elements.endDate.value;
    form.elements.endDate.removeAttribute("aria-invalid");
    if (!startDate || !endDate) return false;
    if (startDate > endDate) {
      form.elements.endDate.setAttribute("aria-invalid", "true");
      showFeedback("終了日は開始日以降にしてください");
      return false;
    }
    const latestEndDate = calendarYearLater(startDate);
    if (endDate > latestEndDate) {
      form.elements.endDate.setAttribute("aria-invalid", "true");
      const latestLabel = new Intl.DateTimeFormat("ja-JP", { dateStyle: "long" })
        .format(new Date(`${latestEndDate}T00:00:00`));
      showFeedback(`検索期間は1年以内です。終了日は${latestLabel}までにしてください`);
      return false;
    }
    return true;
  }

  document.querySelector("#alignment-search-button").addEventListener("click", () => {
    const state = store.getState();
    if (!state.subjectLocation) return showToast("先に被写体地点を設定してください");
    const selected = new Date(state.selectedDateTime);
    const end = new Date(selected);
    end.setDate(end.getDate() + 30);
    form.elements.startDate.value = localDateValue(selected);
    form.elements.endDate.value = localDateValue(end);
    syncTargetOptions(state, state.selectedTargets[0]);
    applyTargetDefaults(form.elements.target.value);
    updateDateLimits();
    updateDiamondControls();
    stopWorker();
    setSearchBusy(false);
    resetSearchUi();
    panel.scrollTop = 0;
    dialog.showModal();
  });

  form.elements.target.addEventListener("change", () => applyTargetDefaults(form.elements.target.value));

  form.elements.matchTargetAltitude.addEventListener("change", updateDiamondControls);

  form.elements.startTime.addEventListener("change", updateOvernightBadge);
  form.elements.endTime.addEventListener("change", updateOvernightBadge);
  form.addEventListener("input", () => {
    invalidateSearchResults();
    updateDateLimits();
    validateDateRangeFeedback();
  });
  form.addEventListener("change", () => {
    invalidateSearchResults();
    updateDateLimits();
    validateDateRangeFeedback();
  });

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
    setSearchBusy(false);
  });

  store.subscribe((state) => {
    if (dialog.open) {
      syncTargetOptions(state);
      updateTargetAltitudeReference();
      updateDiamondControls();
    }
  });

  cancelButton.addEventListener("click", () => {
    stopWorker();
    setSearchBusy(false);
    progressLabel.textContent = "検索をキャンセルしました";
    showFeedback("検索をキャンセルしました。条件を変更して再検索できます。");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const state = store.getState();
    const geometry = subjectGeometry(state.cameraLocation, state.subjectLocation);
    const data = new FormData(form);
    const startTime = data.get("startTime");
    const endTime = data.get("endTime");
    if (!startTime || !endTime) return showFeedback("開始時刻と終了時刻を入力してください");
    const startMinute = minutesFromTime(startTime);
    const matchTargetAltitude = data.get("target") === "sun" && data.get("matchTargetAltitude") === "on";
    let targetAltitude = null;
    if (matchTargetAltitude) {
      const elevationsReady = [state.composition.cameraElevationStatus, state.subject.groundElevationStatus]
        .every((status) => status === "ready" || status === "manual");
      if (!elevationsReady) return showFeedback("撮影地点と被写体地点の標高を取得してください");
      targetAltitude = targetAltitudeForState(state);
    }
    const input = {
      target: data.get("target"),
      cameraLocation: state.cameraLocation,
      subjectBearing: geometry.bearingDegrees,
      startDate: data.get("startDate"),
      endDate: data.get("endDate"),
      startMinute,
      endMinute: normalizeOvernightEndMinute(startMinute, minutesFromTime(endTime)),
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
    if (input.startDate && input.endDate && !validateDateRangeFeedback()) return;
    const errors = validateSearchInput(input);
    if (errors.length) return showFeedback(errors[0]);

    stopWorker();
    clearFeedback();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const searchWorker = new Worker(new URL("./search-worker.js?v=45", import.meta.url));
    worker = searchWorker;
    setSearchBusy(true);
    progressPanel.hidden = false;
    progress.value = 0;
    progressLabel.textContent = "方位を走査しています…";
    resetSearchUi({ keepProgress: true });
    scrollStatusIntoView(progressPanel, "center");
    const handleWorkerFailure = (message) => {
      if (worker !== searchWorker) return;
      console.error("Alignment search worker failed", message);
      setSearchBusy(false);
      progressLabel.textContent = "検索Workerを起動できませんでした";
      showFeedback(`日時検索を開始できません: ${message}`);
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
        setSearchBusy(false);
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
        setSearchBusy(false);
        progressLabel.textContent = "検索に失敗しました";
        showFeedback(message.data.message);
        showToast(message.data.message);
        searchWorker.terminate();
        worker = null;
      }
    });
    searchWorker.postMessage(input);
  });
}
