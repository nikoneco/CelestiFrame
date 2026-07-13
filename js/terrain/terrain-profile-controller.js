import { fetchTerrainProfile } from "./terrain-profile.js?v=40";

const SVG_NS = "http://www.w3.org/2000/svg";

function chartPoints(points, field, min, max) {
  const range = Math.max(1, max - min);
  const total = Math.max(1, points.at(-1).distanceMeters);
  return points.map((point) => {
    const x = 8 + point.distanceMeters / total * 344;
    const y = 94 - (point[field] - min) / range * 78;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function bindTerrainProfile(store, getMapController, showToast) {
  const panel = document.querySelector("#terrain-profile-panel");
  const button = document.querySelector("#terrain-profile-button");
  const status = document.querySelector("#terrain-profile-status");
  const result = document.querySelector("#terrain-profile-result");
  const svg = document.querySelector("#terrain-profile-chart");
  let controller = null;
  let lastLocationKey = "";

  function reset() {
    controller?.abort();
    controller = null;
    result.hidden = true;
    status.textContent = "21点の標高から見通しを確認します。";
    button.disabled = false;
    button.textContent = "地形断面を計算";
    getMapController()?.clearTerrainObstruction();
  }

  function renderChart(analysis) {
    const terrainValues = analysis.points.map((point) => point.elevationMeters + point.earthBulgeMeters);
    const sightValues = analysis.points.map((point) => point.sightlineMeters);
    const min = Math.min(...terrainValues, ...sightValues);
    const max = Math.max(...terrainValues, ...sightValues);
    svg.replaceChildren();
    const ground = document.createElementNS(SVG_NS, "polyline");
    ground.setAttribute("class", "terrain-profile-ground");
    ground.setAttribute("points", chartPoints(analysis.points.map((point, index) => ({ ...point, apparent: terrainValues[index] })), "apparent", min, max));
    const sight = document.createElementNS(SVG_NS, "polyline");
    sight.setAttribute("class", "terrain-profile-sight");
    sight.setAttribute("points", chartPoints(analysis.points, "sightlineMeters", min, max));
    svg.append(ground, sight);
    svg.setAttribute("aria-label", `地形断面。最低${Math.round(min)}m、最高${Math.round(max)}m`);
  }

  store.subscribe((state) => {
    panel.hidden = !state.subjectLocation;
    const key = state.subjectLocation
      ? `${state.cameraLocation.latitude},${state.cameraLocation.longitude}:${state.subjectLocation.latitude},${state.subjectLocation.longitude}`
      : "";
    if (key !== lastLocationKey) {
      lastLocationKey = key;
      reset();
    }
  });

  button.addEventListener("click", async () => {
    const state = store.getState();
    if (!state.subjectLocation) return showToast("先に被写体地点を設定してください");
    controller?.abort();
    controller = new AbortController();
    button.disabled = true;
    result.hidden = true;
    getMapController()?.clearTerrainObstruction();
    try {
      const targetHeightMeters = state.subject.targetMode === "structure" ? Number(state.subject.heightMeters) || 0 : 0;
      const analysis = await fetchTerrainProfile(state.cameraLocation, state.subjectLocation, {
        signal: controller.signal,
        cameraElevationMeters: ["ready", "manual"].includes(state.composition.cameraElevationStatus)
          ? state.composition.cameraElevationMeters : undefined,
        subjectElevationMeters: ["ready", "manual"].includes(state.subject.groundElevationStatus)
          ? state.subject.groundElevationMeters : undefined,
        cameraHeightMeters: state.composition.cameraHeightMeters,
        targetHeightMeters,
        onProgress: (progress) => {
          status.textContent = `標高を取得中… ${Math.round(progress * 100)}%`;
          button.textContent = `${Math.round(progress * 100)}%`;
        },
      });
      renderChart(analysis);
      result.hidden = false;
      if (analysis.isClear) {
        status.textContent = `計算上は見通せます（最小余裕 ${Math.round(analysis.minimumClearanceMeters)} m）`;
        result.dataset.result = "clear";
      } else {
        const distanceKm = analysis.obstruction.distanceMeters / 1000;
        status.textContent = `${distanceKm.toFixed(1)} km先で約${Math.ceil(-analysis.minimumClearanceMeters)} m遮られる可能性`;
        result.dataset.result = "blocked";
        getMapController()?.setTerrainObstruction(analysis.obstruction.location);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error(error);
        status.textContent = error.message || "地形断面を取得できませんでした";
      }
    } finally {
      button.disabled = false;
      button.textContent = "再計算";
      controller = null;
    }
  });
}
