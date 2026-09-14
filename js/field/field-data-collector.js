import { fetchElevation, elevationLocationKey } from "../elevation/elevation-service.js?v=1.9.2";
import { fetchTerrainProfile } from "../terrain/terrain-profile.js?v=1.9.2";
import { terrainProfileKey } from "../terrain/terrain-profile-controller.js?v=1.9.2";
import { fetchForecastGrid, toForecastHour, isForecastHour, isPastForecastHour } from "../weather/forecast-service.js?v=1.9.2";
import { collectOfflineLight } from "../light-pollution/offline-light-pollution.js?v=1.9.2";

export function createFieldDataCollector({ config, terrainController }) {
  return async function prepareParts(plan, { signal, onProgress = () => {}, onPart = async () => {} } = {}) {
    const state = structuredClone(plan.state);
    const parts = {};
    async function acquire(name, source, operation) {
      onProgress({ part: name, status: "loading" });
      try {
        const data = await operation();
        parts[name] = { status: "ready", source, fetchedAt: data.fetchedAt || new Date().toISOString(), data };
      } catch (error) {
        if (signal?.aborted || error.name === "AbortError") throw error;
        parts[name] = { status: "failed", source, fetchedAt: null, error: error.message };
      }
      await onPart(name, parts[name]);
      onProgress({ part: name, status: parts[name].status });
    }
    // Resolve elevations first: the profile and its restoration key must use
    // exactly these values, without changing the user's saved plan.
    await acquire("elevation", "国土地理院DEM / 保存済み標高", async () => {
      const values = {};
      for (const role of ["camera", "subject"]) {
        const location = role === "camera" ? state.cameraLocation : state.subjectLocation;
        if (!location) continue;
        const target = role === "camera" ? state.composition : state.subject;
        const prefix = role === "camera" ? "cameraElevation" : "groundElevation";
        const key = elevationLocationKey(location);
        const usable = ["manual", "ready"].includes(target[`${prefix}Status`])
          && (target[`${prefix}Mode`] === "manual" || target[`${prefix}Key`] === key)
          && Number.isFinite(target[`${prefix}Meters`]);
        const reading = usable ? { meters: target[`${prefix}Meters`], source: target[`${prefix}Source`] || "保存済み標高", key }
          : await fetchElevation(location, { signal });
        values[role] = { ...reading, mode: target[`${prefix}Mode`] === "manual" ? "manual" : "auto" };
        Object.assign(target, { [`${prefix}Meters`]: reading.meters, [`${prefix}Source`]: reading.source,
          [`${prefix}Key`]: key, [`${prefix}Status`]: values[role].mode === "manual" ? "manual" : "ready" });
      }
      return values;
    });
    await Promise.all([
      state.subjectLocation ? acquire("terrain", "国土地理院DEM・21点", async () => {
        if (parts.elevation.status !== "ready") throw new Error("地点の標高を取得できないため地形断面を準備できません");
        const current = terrainController.getSnapshot();
        const key = terrainProfileKey(state);
        if (current?.key === key) return current;
        const analysis = await fetchTerrainProfile(state.cameraLocation, state.subjectLocation, {
          signal,
          cameraElevationMeters: parts.elevation.data?.camera?.meters,
          subjectElevationMeters: parts.elevation.data?.subject?.meters,
          cameraHeightMeters: state.composition.cameraHeightMeters,
          targetHeightMeters: state.subject.targetMode === "structure" ? state.subject.heightMeters : 0,
        });
        return { key, analysis, fetchedAt: new Date().toISOString() };
      }) : Promise.resolve(parts.terrain = { status: "unavailable", source: "国土地理院DEM", error: "被写体地点がないため地形断面は対象外" }),
      isForecastHour(state.selectedDateTime) ? acquire("forecast", "Open-Meteo・予報値", async () => {
        const hour = toForecastHour(state.selectedDateTime);
        const [record] = await fetchForecastGrid({ endpoint: config.weatherForecastEndpoint, locations: [state.cameraLocation], hour,
          includePast: isPastForecastHour(hour), signal });
        if (!Object.values(record.forecast).some(Number.isFinite)) throw new Error("選択時刻の予報値がありません");
        return { location: state.cameraLocation, hour, forecast: record.forecast, fetchedAt: new Date().toISOString() };
      }) : Promise.resolve(parts.forecast = { status: "unavailable", source: "Open-Meteo", error: "撮影日時が予報の提供範囲外です" }),
      acquire("lightPollution", "NASA VIIRS VNP46A4・2025", () => collectOfflineLight(state, { template: config.lightPollutionTileUrl, signal })),
    ]);
    return parts;
  };
}

export function stateWithOfflineElevation(state, part) {
  const restored = structuredClone(state);
  if (part?.status !== "ready") return restored;
  for (const role of ["camera", "subject"]) {
    const reading = part.data?.[role];
    const location = role === "camera" ? restored.cameraLocation : restored.subjectLocation;
    if (!location || !reading || reading.key !== elevationLocationKey(location) || !Number.isFinite(reading.meters)) continue;
    const target = role === "camera" ? restored.composition : restored.subject;
    const prefix = role === "camera" ? "cameraElevation" : "groundElevation";
    Object.assign(target, { [`${prefix}Meters`]: reading.meters, [`${prefix}Mode`]: reading.mode,
      [`${prefix}Status`]: reading.mode === "manual" ? "manual" : "ready", [`${prefix}Source`]: reading.source,
      [`${prefix}Key`]: reading.key });
  }
  return restored;
}
