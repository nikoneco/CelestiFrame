import { normalizeSelectedTargets } from "../astronomy/target-catalog.js?v=1.9.1";

export const PLAN_FILE_VERSION = 6;
export const MAX_PLAN_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_PLAN_IMPORT_COUNT = 1000;

function cloneLocation(location) {
  if (!location) return null;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error("緯度が正しくありません");
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("経度が正しくありません");
  return { latitude, longitude };
}

const locationKey = (location) => location ? `${Number(location.latitude).toFixed(6)},${Number(location.longitude).toFixed(6)}` : "";

function snapshotElevation({ meters, status, mode, source, key, location }) {
  const hasValue = meters != null && Number.isFinite(Number(meters));
  const stale = mode === "auto" && key && key !== locationKey(location);
  const resolved = hasValue && !stale && (["ready", "manual"].includes(status) || status == null);
  return {
    meters: hasValue ? Number(meters) : 0,
    status: resolved ? (status || "manual") : "error",
    mode: mode === "manual" || (mode == null && resolved) ? "manual" : "auto",
    source: String(source || "").slice(0, 120),
    key: resolved ? locationKey(location) : "",
  };
}

export function defaultPlanName(state) {
  const date = new Date(state.selectedDateTime);
  const dateLabel = Number.isNaN(date.getTime())
    ? "撮影計画"
    : new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
  return `${state.subjectLocation ? state.subject?.name || "被写体" : "撮影地点"} ${dateLabel}`;
}

export function snapshotPlanState(state) {
  const selectedDateTime = new Date(state.selectedDateTime);
  if (Number.isNaN(selectedDateTime.getTime())) throw new Error("撮影日時が正しくありません");
  const subjectElevation = snapshotElevation({
    meters: state.subject?.groundElevationMeters, status: state.subject?.groundElevationStatus,
    mode: state.subject?.groundElevationMode, source: state.subject?.groundElevationSource,
    key: state.subject?.groundElevationKey, location: state.subjectLocation,
  });
  const cameraElevation = snapshotElevation({
    meters: state.composition?.cameraElevationMeters, status: state.composition?.cameraElevationStatus,
    mode: state.composition?.cameraElevationMode, source: state.composition?.cameraElevationSource,
    key: state.composition?.cameraElevationKey, location: state.cameraLocation,
  });
  return {
    selectedDateTime: selectedDateTime.toISOString(),
    selectedTargets: normalizeSelectedTargets(state.selectedTargets, state.selectedBody),
    cameraLocation: cloneLocation(state.cameraLocation),
    subjectLocation: cloneLocation(state.subjectLocation),
    subject: {
      name: String(state.subject?.name || "被写体").slice(0, 120),
      heightMeters: state.subject?.heightMeters != null && Number.isFinite(Number(state.subject.heightMeters))
        ? Number(state.subject.heightMeters)
        : null,
      groundElevationMeters: subjectElevation.meters,
      groundElevationStatus: subjectElevation.status,
      groundElevationSource: subjectElevation.source,
      groundElevationMode: subjectElevation.mode,
      groundElevationKey: subjectElevation.key,
      targetMode: state.subject?.targetMode === "terrain" ? "terrain" : "structure",
    },
    composition: {
      cameraElevationMeters: cameraElevation.meters,
      cameraHeightMeters: Math.min(1000, Math.max(0, state.composition?.cameraHeightMeters == null ? 1.5 : Number(state.composition.cameraHeightMeters) || 0)),
      cameraElevationStatus: cameraElevation.status,
      cameraElevationSource: cameraElevation.source,
      cameraElevationMode: cameraElevation.mode,
      cameraElevationKey: cameraElevation.key,
      focalLengthMm: Math.min(2000, Math.max(1, Number(state.composition?.focalLengthMm) || 50)),
      sensorPreset: ["full-frame", "aps-c", "mft", "one-inch"].includes(state.composition?.sensorPreset)
        ? state.composition.sensorPreset : "full-frame",
      orientation: state.composition?.orientation === "portrait" ? "portrait" : "landscape",
    },
    map: {
      zoom: Math.min(19, Math.max(2, Number(state.map?.zoom) || 13)),
      center: cloneLocation(state.map?.center || state.cameraLocation),
    },
  };
}

export function createPlan({ state, name, notes = "", id = crypto.randomUUID(), now = new Date() }) {
  const timestamp = new Date(now).toISOString();
  return {
    id,
    version: PLAN_FILE_VERSION,
    name: String(name || defaultPlanName(state)).trim().slice(0, 120) || defaultPlanName(state),
    notes: String(notes).trim().slice(0, 2000),
    favorite: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    state: snapshotPlanState(state),
  };
}

export function normalizePlan(value) {
  if (!value || typeof value !== "object") throw new Error("撮影計画の形式が正しくありません");
  const normalized = createPlan({
    state: value.state,
    name: value.name,
    notes: value.notes,
    id: String(value.id || crypto.randomUUID()),
    now: value.createdAt || new Date(),
  });
  normalized.favorite = Boolean(value.favorite);
  normalized.updatedAt = Number.isNaN(new Date(value.updatedAt).getTime()) ? normalized.createdAt : new Date(value.updatedAt).toISOString();
  return normalized;
}

export function serializePlans(plans, now = new Date()) {
  return JSON.stringify({
    app: "CelestiFrame",
    version: PLAN_FILE_VERSION,
    exportedAt: new Date(now).toISOString(),
    plans: plans.map(normalizePlan),
  }, null, 2);
}

export function parsePlansFile(text) {
  if (new Blob([text]).size > MAX_PLAN_IMPORT_BYTES) throw new Error("撮影計画ファイルは5MB以内にしてください");
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("JSONファイルを読み取れません"); }
  if (data?.app !== "CelestiFrame" || !Array.isArray(data.plans)) throw new Error("CelestiFrameの撮影計画ファイルではありません");
  if (data.plans.length > MAX_PLAN_IMPORT_COUNT) throw new Error(`撮影計画は一度に${MAX_PLAN_IMPORT_COUNT}件まで読み込めます`);
  return data.plans.map(normalizePlan);
}

export function buildShareUrl(state, baseUrl = location.href) {
  const snapshot = snapshotPlanState(state);
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set("plan", "1");
  url.searchParams.set("lat", snapshot.cameraLocation.latitude.toFixed(6));
  url.searchParams.set("lng", snapshot.cameraLocation.longitude.toFixed(6));
  url.searchParams.set("at", snapshot.selectedDateTime);
  url.searchParams.set("targets", snapshot.selectedTargets.join(","));
  url.searchParams.set("z", String(snapshot.map.zoom));
  url.searchParams.set("f", String(snapshot.composition.focalLengthMm));
  url.searchParams.set("sensor", snapshot.composition.sensorPreset);
  url.searchParams.set("orientation", snapshot.composition.orientation);
  url.searchParams.set("ce", String(snapshot.composition.cameraElevationMeters));
  if (snapshot.composition.cameraElevationStatus === "error") url.searchParams.set("ces", "unknown");
  url.searchParams.set("ch", String(snapshot.composition.cameraHeightMeters));
  if (snapshot.subjectLocation) {
    url.searchParams.set("slat", snapshot.subjectLocation.latitude.toFixed(6));
    url.searchParams.set("slng", snapshot.subjectLocation.longitude.toFixed(6));
    url.searchParams.set("subject", snapshot.subject.name);
    url.searchParams.set("height", String(snapshot.subject.heightMeters ?? 10));
    url.searchParams.set("se", String(snapshot.subject.groundElevationMeters));
    if (snapshot.subject.groundElevationStatus === "error") url.searchParams.set("ses", "unknown");
    url.searchParams.set("tm", snapshot.subject.targetMode);
  }
  return url.toString();
}

export function parseSharedState(urlValue) {
  const url = new URL(urlValue, "https://example.invalid/");
  if (url.searchParams.get("plan") !== "1") return null;
  const cameraLocation = cloneLocation({ latitude: url.searchParams.get("lat"), longitude: url.searchParams.get("lng") });
  const selectedDateTime = new Date(url.searchParams.get("at"));
  if (Number.isNaN(selectedDateTime.getTime())) throw new Error("共有URLの撮影日時が正しくありません");
  const hasSubject = url.searchParams.has("slat") && url.searchParams.has("slng");
  const subjectLocation = hasSubject
    ? cloneLocation({ latitude: url.searchParams.get("slat"), longitude: url.searchParams.get("slng") })
    : null;
  return {
    selectedDateTime: selectedDateTime.toISOString(),
    selectedTargets: normalizeSelectedTargets(
      url.searchParams.get("targets")?.split(",").filter(Boolean),
      url.searchParams.get("body"),
    ),
    cameraLocation,
    subjectLocation,
    subject: {
      name: url.searchParams.get("subject")?.slice(0, 120) || "被写体",
      heightMeters: Math.max(0.1, Number(url.searchParams.get("height")) || 10),
      groundElevationMeters: Number(url.searchParams.get("se")) || 0,
      groundElevationStatus: url.searchParams.get("ses") === "unknown" ? "error" : "manual",
      groundElevationSource: "共有計画",
      groundElevationMode: url.searchParams.get("ses") === "unknown" ? "auto" : "manual",
      groundElevationKey: url.searchParams.get("ses") === "unknown" ? "" : locationKey(subjectLocation),
      targetMode: url.searchParams.get("tm") === "terrain" ? "terrain" : "structure",
    },
    composition: {
      cameraElevationMeters: Number(url.searchParams.get("ce")) || 0,
      cameraHeightMeters: Math.min(1000, Math.max(0, url.searchParams.has("ch") && Number.isFinite(Number(url.searchParams.get("ch"))) ? Number(url.searchParams.get("ch")) : 1.5)),
      cameraElevationStatus: url.searchParams.get("ces") === "unknown" ? "error" : "manual",
      cameraElevationSource: "共有計画",
      cameraElevationMode: url.searchParams.get("ces") === "unknown" ? "auto" : "manual",
      cameraElevationKey: url.searchParams.get("ces") === "unknown" ? "" : locationKey(cameraLocation),
      focalLengthMm: Math.min(2000, Math.max(1, Number(url.searchParams.get("f")) || 50)),
      sensorPreset: ["full-frame", "aps-c", "mft", "one-inch"].includes(url.searchParams.get("sensor"))
        ? url.searchParams.get("sensor") : "full-frame",
      orientation: url.searchParams.get("orientation") === "portrait" ? "portrait" : "landscape",
    },
    map: { zoom: Math.min(19, Math.max(2, Number(url.searchParams.get("z")) || 13)), center: cameraLocation },
  };
}
