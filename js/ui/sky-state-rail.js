import { calculateMilkyWay } from "../astronomy/milky-way-service.js?v=41";

const MINUTES_PER_DAY = 1440;
const SAMPLE_MINUTES = 10;
const MILKY_WAY_SAMPLE_MINUTES = 30;
const toDegrees = (radians) => radians * 180 / Math.PI;

const SKY_BANDS = Object.freeze([
  { id: "day", label: "昼", minAltitude: 0 },
  { id: "civil", label: "市民薄明", minAltitude: -6 },
  { id: "nautical", label: "航海薄明", minAltitude: -12 },
  { id: "astronomical", label: "天文薄明", minAltitude: -18 },
  { id: "night", label: "夜", minAltitude: -Infinity },
]);

function validLocation(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new TypeError("A valid location is required for the sky-state rail");
  }
  return { latitude, longitude };
}

function localDayStart(dateValue) {
  const date = dateValue instanceof Date ? new Date(dateValue) : new Date(dateValue);
  if (Number.isNaN(date.getTime())) throw new TypeError("A valid date is required for the sky-state rail");
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateAtMinute(dayStart, minute) {
  return new Date(dayStart.getTime() + minute * 60000);
}

function minuteInLocalDay(date, dayStart) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const minute = (date.getTime() - dayStart.getTime()) / 60000;
  return minute >= 0 && minute < MINUTES_PER_DAY ? minute : null;
}

export function skyBandForAltitude(altitude) {
  const value = Number(altitude);
  if (!Number.isFinite(value)) return SKY_BANDS.at(-1);
  return SKY_BANDS.find((band) => value >= band.minAltitude) || SKY_BANDS.at(-1);
}

function buildSegments(dayStart, location, calculator) {
  const segments = [];
  let activeBand = null;
  for (let minute = 0; minute < MINUTES_PER_DAY; minute += SAMPLE_MINUTES) {
    const position = calculator.getPosition(dateAtMinute(dayStart, minute), location.latitude, location.longitude);
    const band = skyBandForAltitude(toDegrees(position.altitude));
    if (!activeBand || activeBand.id !== band.id) {
      if (activeBand) segments.at(-1).endMinute = minute;
      segments.push({ id: band.id, label: band.label, startMinute: minute, endMinute: MINUTES_PER_DAY });
      activeBand = band;
    }
  }
  segments.at(-1).endMinute = MINUTES_PER_DAY;
  return segments;
}

function marker(id, label, shortLabel, date, dayStart, tone) {
  const minute = minuteInLocalDay(date, dayStart);
  return minute == null ? null : { id, label, shortLabel, minute, tone };
}

function findMilkyWayPeak(dayStart, location, calculator) {
  let peak = null;
  for (let minute = 0; minute < MINUTES_PER_DAY; minute += MILKY_WAY_SAMPLE_MINUTES) {
    const date = dateAtMinute(dayStart, minute);
    const altitude = Number(calculator(date, location)?.core?.altitude);
    if (Number.isFinite(altitude) && (!peak || altitude > peak.altitude)) peak = { minute, altitude };
  }
  return peak?.altitude > 0 ? peak : null;
}

export function buildSkyStateModel(dateValue, locationValue, {
  sunCalculator = globalThis.SunCalc,
  milkyWayCalculator = calculateMilkyWay,
} = {}) {
  if (!sunCalculator?.getPosition || !sunCalculator?.getTimes || !sunCalculator?.getMoonTimes) {
    throw new Error("SunCalc is unavailable for the sky-state rail");
  }
  const dayStart = localDayStart(dateValue);
  const location = validLocation(locationValue);
  const sunTimes = sunCalculator.getTimes(dayStart, location.latitude, location.longitude);
  const moonTimes = sunCalculator.getMoonTimes(dayStart, location.latitude, location.longitude);
  const markers = [
    marker("sunrise", "日の出", "日出", sunTimes.sunrise, dayStart, "solar"),
    marker("sunset", "日の入り", "日入", sunTimes.sunset, dayStart, "solar"),
    marker("moonrise", "月の出", "月出", moonTimes.rise, dayStart, "lunar"),
    marker("moonset", "月の入り", "月入", moonTimes.set, dayStart, "lunar"),
  ].filter(Boolean);
  const milkyWayPeak = findMilkyWayPeak(dayStart, location, milkyWayCalculator);
  if (milkyWayPeak) markers.push({
    id: "milkyway-peak",
    label: "天の川中心が最も高い時刻",
    shortLabel: "天川",
    minute: milkyWayPeak.minute,
    tone: "milkyway",
  });
  return {
    dayStart,
    segments: buildSegments(dayStart, location, sunCalculator),
    markers: markers.sort((a, b) => a.minute - b.minute),
  };
}

function timeLabel(minute) {
  const rounded = ((Math.round(minute) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function targetTone(targetId) {
  if (targetId === "sun") return "solar";
  if (targetId === "moon") return "lunar";
  if (targetId === "milkyway") return "milkyway";
  return "horizon";
}

export function bindSkyStateRail(store) {
  const rail = document.querySelector("#sky-state-rail");
  const bands = document.querySelector("#sky-state-bands");
  const markers = document.querySelector("#sky-state-markers");
  const current = document.querySelector("#sky-state-current");
  const input = document.querySelector("#time-slider");
  let model = null;
  let modelKey = "";

  function render(state) {
    const date = new Date(state.selectedDateTime);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}:${state.cameraLocation.latitude.toFixed(4)}:${state.cameraLocation.longitude.toFixed(4)}`;
    if (key !== modelKey) {
      try {
        model = buildSkyStateModel(date, state.cameraLocation);
        bands.replaceChildren(...model.segments.map((segment) => {
          const element = document.createElement("span");
          element.className = `sky-state-band sky-state-band-${segment.id}`;
          element.style.width = `${(segment.endMinute - segment.startMinute) / MINUTES_PER_DAY * 100}%`;
          element.title = segment.label;
          return element;
        }));
        markers.replaceChildren(...model.markers.map((item, index) => {
          const element = document.createElement("span");
          element.className = `sky-state-marker sky-state-marker-${item.tone}`;
          element.style.setProperty("--marker-position", `${item.minute / MINUTES_PER_DAY * 100}%`);
          element.dataset.row = String(index % 2);
          element.title = `${item.label} ${timeLabel(item.minute)}`;
          element.innerHTML = `<i></i><b>${item.shortLabel}</b>`;
          return element;
        }));
        rail.removeAttribute("data-unavailable");
      } catch (error) {
        console.warn("Sky-state rail calculation failed", error);
        model = null;
        bands.replaceChildren();
        markers.replaceChildren();
        rail.dataset.unavailable = "true";
      }
      modelKey = key;
    }
    const minute = date.getHours() * 60 + date.getMinutes();
    const band = model?.segments.find((segment) => minute >= segment.startMinute && minute < segment.endMinute);
    current.textContent = band?.label || "空の状態";
    rail.dataset.tone = targetTone(state.selectedTargets[0]);
    input.setAttribute("aria-valuetext", `${timeLabel(minute)} ${current.textContent}`);
  }

  store.subscribe(render);
}
