import test from "node:test";
import assert from "node:assert/strict";
import { buildSkyStateModel, skyBandForAltitude } from "../js/ui/sky-state-rail.js";

const day = new Date(2026, 6, 15, 12, 0);
const at = (hours, minutes = 0) => new Date(2026, 6, 15, hours, minutes);
const fakeSunCalc = {
  getPosition(date) {
    const hour = date.getHours() + date.getMinutes() / 60;
    const altitude = 70 * Math.sin((hour - 6) / 12 * Math.PI) - 4;
    return { altitude: altitude * Math.PI / 180 };
  },
  getTimes() {
    return { sunrise: at(5, 10), sunset: at(19, 5) };
  },
  getMoonTimes() {
    return { rise: at(21, 20), set: at(8, 40) };
  },
};

test("sky altitude bands use photographic twilight thresholds", () => {
  assert.equal(skyBandForAltitude(12).id, "day");
  assert.equal(skyBandForAltitude(-3).id, "civil");
  assert.equal(skyBandForAltitude(-9).id, "nautical");
  assert.equal(skyBandForAltitude(-15).id, "astronomical");
  assert.equal(skyBandForAltitude(-22).id, "night");
});

test("sky-state model covers a full day and includes planning markers", () => {
  const model = buildSkyStateModel(day, { latitude: 35.42, longitude: 138.90 }, {
    sunCalculator: fakeSunCalc,
    milkyWayCalculator(date) {
      return { core: { altitude: 70 - Math.abs(date.getHours() - 1) * 4 } };
    },
  });
  assert.equal(model.segments[0].startMinute, 0);
  assert.equal(model.segments.at(-1).endMinute, 1440);
  assert.ok(model.segments.every((segment, index) => index === 0 || segment.startMinute === model.segments[index - 1].endMinute));
  assert.deepEqual(model.markers.map(({ id }) => id).sort(), ["milkyway-peak", "moonrise", "moonset", "sunrise", "sunset"]);
  assert.equal(model.markers.find(({ id }) => id === "sunrise").minute, 310);
});
