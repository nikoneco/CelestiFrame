import test from "node:test";
import assert from "node:assert/strict";
import SunCalc from "suncalc";
import { calculateSunData } from "../js/astronomy/sun-service.js";
import { calculateMoonData } from "../js/astronomy/moon-service.js";

test("cached rise/set values match SunCalc across day, longitude and polar boundaries", () => {
  for (const latitude of [35, 70, -70]) for (const longitude of [-179, 0, 139, 179]) {
    for (let minutes = 0; minutes < 2880; minutes += 7) {
      const date = new Date(Date.UTC(2026, 8, 6, 0, minutes));
      const location = { latitude, longitude };
      const sun = calculateSunData(date, location);
      const moon = calculateMoonData(date, location);
      const rawSun = SunCalc.getTimes(date, latitude, longitude);
      const rawMoon = SunCalc.getMoonTimes(date, latitude, longitude);
      const validTime = (value) => value != null && Number.isFinite(+value) ? +value : null;
      assert.equal(validTime(sun.sunrise), validTime(rawSun.sunrise));
      assert.equal(validTime(sun.sunset), validTime(rawSun.sunset));
      assert.equal(validTime(moon.moonrise), validTime(rawMoon.rise));
      assert.equal(validTime(moon.moonset), validTime(rawMoon.set));
    }
  }
});

test("minute changes reuse daily events but recalculate position, and returned dates cannot poison cache", () => {
  let sunTimes = 0, moonTimes = 0, positions = 0;
  const calculator = {
    ...SunCalc,
    getTimes(...args) { sunTimes++; return SunCalc.getTimes(...args); },
    getMoonTimes(...args) { moonTimes++; return SunCalc.getMoonTimes(...args); },
    getMoonPosition(...args) { positions++; return SunCalc.getMoonPosition(...args); },
  };
  const location = { latitude: 35, longitude: 139 };
  const date = new Date(2026, 8, 6, 12);
  const first = calculateSunData(date, location, calculator);
  const sunrise = +first.sunrise;
  first.sunrise.setTime(0);
  for (let i = 0; i < 10; i++) {
    const instant = new Date(+date + i * 60000);
    calculateSunData(instant, location, calculator);
    calculateMoonData(instant, location, calculator);
    calculateMoonData(instant, location, calculator);
  }
  assert.equal(sunTimes, 1);
  assert.equal(moonTimes, 1);
  assert.equal(positions, 10);
  assert.equal(+calculateSunData(date, location, calculator).sunrise, sunrise);
});

globalThis.SunCalc = SunCalc;
