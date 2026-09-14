// End-to-end field-data and plan restoration checks using deterministic API fixtures.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.env.QA_URL || "http://127.0.0.1:4173/";
const output = process.env.QA_OUTPUT || path.join(os.tmpdir(), "celestiframe-field-qa");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const results = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo" });
  await context.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64") }));
  await context.route("https://cyberjapandata2.gsi.go.jp/**", (route) => route.fulfill({ json: { elevation: 18, hsrc: "DEM5A" } }));
  let denyForecast = false;
  await context.route("https://api.open-meteo.com/**", (route) => {
    if (denyForecast) return route.abort("internetdisconnected");
    const url = new URL(route.request().url());
    const hour = url.searchParams.get("start_hour");
    const hourly = { time: [hour], cloud_cover: [21], cloud_cover_low: [12], cloud_cover_mid: [8], cloud_cover_high: [9], visibility: [18000], precipitation_probability: [5], wind_speed_10m: [4], wind_gusts_10m: [8], temperature_2m: [12.5], relative_humidity_2m: [87], dew_point_2m: [10.4] };
    const records = url.searchParams.get("latitude").split(",").map(() => ({ hourly }));
    return route.fulfill({ json: records.length === 1 ? records[0] : records });
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const url = new URL(base);
  const at = new Date(Date.now() + 24 * 3600 * 1000); at.setUTCMinutes(0, 0, 0);
  for (const [key, value] of Object.entries({ plan: "1", lat: "35.665", lng: "139.74543", at: at.toISOString(), targets: "milkyway,moon,sun", slat: "35.65858", slng: "139.74543", subject: "東京タワー", height: "333", se: "18", ce: "18", ch: "1.5", tm: "structure" })) url.searchParams.set(key, value);
  await page.goto(String(url));
  await page.locator(".leaflet-container").waitFor();
  console.log("Loaded app; waiting for offline shell");
  await page.evaluate(() => Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error("Service worker did not activate")), 30000))]));
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  console.log("Offline shell ready; checking conditions");
  await page.locator("#weather-toggle").click();
  await page.waitForFunction(() => document.querySelector("#weather-temperature").textContent === "12.5°C");
  assert.equal(await page.locator("#weather-humidity").textContent(), "87%");
  assert.equal(await page.locator("#weather-dew-point").textContent(), "10.4°C");
  assert.equal(await page.locator("#weather-dew-spread").textContent(), "2.1°C");
  assert.match(await page.locator("#weather-moon-conditions").textContent(), /銀河中心/);
  await page.locator("#weather-panel-layer-toggle").click();
  assert.equal(await page.locator("#weather-layer-toggle").getAttribute("aria-checked"), "false");
  await page.locator("#weather-refresh").click();
  await page.waitForFunction(() => document.querySelector("#weather-temperature").textContent === "12.5°C" && !document.querySelector("#weather-refresh").disabled);
  await page.screenshot({ path: path.join(output, "conditions-390.png") });
  await page.locator("#weather-panel-close").click();
  await page.locator("#plans-button").click();
  await page.locator("#plan-name").fill("現地準備QA");
  await page.locator("#plan-save").click();
  const card = page.locator(".plan-card").filter({ hasText: "現地準備QA" });
  await card.waitFor();
  await card.locator('[data-action="more"]').click();
  await page.locator('[data-plan-more-action="prepare-offline"]').click();
  console.log("Preparing plan data");
  await page.waitForFunction(() => document.querySelector(".plan-card-offline-status")?.textContent.includes("準備済み"), null, { timeout: 60000 });
  results.push({ prepared: await card.locator(".plan-card-offline-status").textContent() });
  console.log(await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open("celestiframe-offline-v1"); request.onsuccess = () => resolve(request.result); request.onerror = reject; });
    const records = await new Promise((resolve, reject) => { const request = db.transaction("prepared-plans").objectStore("prepared-plans").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = reject; });
    db.close();
    return records.map((record) => Object.fromEntries(Object.entries(record.parts).map(([key, part]) => [key, { ...part, data: part.data && Object.keys(part.data) }])));
  }));
  await card.locator('[data-action="more"]').click();
  await page.screenshot({ path: path.join(output, "prepared-390.png") });
  await page.locator("#plan-more-dialog").press("Escape");
  await page.locator("#plans-close").click();
  for (const width of [320, 390, 1440]) for (const theme of ["dark", "light"]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.locator("#more-button").click();
    await page.locator("#settings-button").click();
    await page.locator(`label:has(input[name="theme"][value="${theme}"])`).click();
    await page.locator("#settings-dialog").press("Escape");
    await page.locator("#weather-toggle").click();
    await page.screenshot({ path: path.join(output, `conditions-${width}-${theme}.png`) });
    const styles = await page.locator("#weather-panel").evaluate((panel) => ({
      text: getComputedStyle(panel.querySelector("output")).color,
      muted: getComputedStyle(panel.querySelector("span")).color,
      height: panel.getBoundingClientRect().height,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    assert.equal(styles.overflow, false);
    await page.locator("#weather-panel-close").click();
    await page.locator("#plans-button").click();
    await card.locator('[data-action="more"]').click();
    await page.screenshot({ path: path.join(output, `prepared-${width}-${theme}.png`) });
    await page.locator("#plan-more-dialog").press("Escape");
    await page.locator("#plans-close").click();
    results.push({ width, theme, styles });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // A reload discards in-memory terrain/forecast caches; only persisted plan data remains.
  denyForecast = true;
  await context.setOffline(true);
  await page.goto(base);
  await page.locator(".leaflet-container").waitFor();
  await page.locator("#plans-button").click();
  await page.locator('.plan-card [data-action="more"]').click();
  await page.locator('[data-plan-more-action="field"]').click();
  await page.waitForFunction(() => document.querySelector("#field-dialog").open);
  assert.equal(await page.locator("#plans-dialog").evaluate((el) => el.open), false);
  await page.screenshot({ path: path.join(output, "field-offline-390.png") });
  await page.evaluate(() => {
    window.__fieldWatchCalls = 0;
    Object.defineProperty(DeviceOrientationEvent, "requestPermission", { configurable: true, value: () => new Promise((resolve) => { window.__resolveOrientation = resolve; }) });
    Object.defineProperty(navigator.geolocation, "watchPosition", { configurable: true, value: () => { window.__fieldWatchCalls++; return 99; } });
  });
  await page.locator("#field-start").click();
  await page.locator("#field-close").click();
  await page.evaluate(async () => { window.__resolveOrientation("granted"); await Promise.resolve(); });
  assert.equal(await page.evaluate(() => window.__fieldWatchCalls), 0, "closing field mode cancels a delayed sensor permission response");
  assert.equal(await page.locator("#field-start").textContent(), "現在地と方位を開始");
  await page.locator("#weather-toggle").click();
  await page.waitForFunction(() => document.querySelector("#weather-temperature").textContent === "12.5°C");
  assert.match(await page.locator("#weather-source").textContent(), /保存/);
  assert.equal(await page.locator("#weather-dew-spread").textContent(), "2.1°C");
  await page.screenshot({ path: path.join(output, "conditions-offline-390.png") });
  await page.locator("#weather-panel-close").click();
  // Panning/zooming changes the map view, not the plan's camera or forecast hour.
  await page.locator(".leaflet-control-zoom-in").click();
  await page.locator("#weather-toggle").click();
  await page.waitForFunction(() => document.querySelector("#weather-temperature").textContent === "12.5°C");
  await page.locator("#weather-panel-close").click();
  await page.locator("#deck-tab-alignment").click();
  assert.equal(await page.locator("#terrain-profile-result").evaluate((el) => el.hidden), false);
  assert.match(await page.locator("#terrain-profile-status").textContent(), /保存データ/);
  const cachedTiles = await page.evaluate(async () => (await (await caches.open("celestiframe-field-light-v1")).keys()).length);
  assert.ok(cachedTiles > 0 && cachedTiles <= 36);
  assert.equal(await page.locator("#light-pollution-toggle").getAttribute("aria-checked"), "true");
  await page.waitForFunction(() => [...document.querySelectorAll(".light-pollution-tiles img")].some((img) => img.complete && img.naturalWidth > 0));
  results.push({ offlineReload: "PASS", cachedTiles, terrain: await page.locator("#terrain-profile-status").textContent() });
  await page.locator("#deck-tab-time").click();
  await page.locator('[data-minutes="60"]').click();
  await page.locator("#weather-toggle").click();
  await page.waitForFunction(() => document.querySelector("#weather-temperature").textContent === "—");
  results.push({ differentHourDoesNotReuseForecast: "PASS" });
  await page.locator("#weather-panel-close").click();
  await page.locator("#plans-button").click();
  await card.locator('[data-action="more"]').click();
  await page.locator('[data-plan-more-action="prepare-offline"]').click();
  await page.waitForFunction(() => document.querySelector(".plan-card-offline-status")?.textContent.includes("一部"));
  await card.locator('[data-action="more"]').click();
  assert.match(await page.locator("#plan-offline-details").textContent(), /保存済み再利用/);
  await page.screenshot({ path: path.join(output, "offline-retry-partial.png") });
  await page.locator("#plan-more-dialog").press("Escape");
  await card.locator('[data-action="open"]').click();
  await page.locator("#weather-toggle").click();
  await page.waitForFunction(() => document.querySelector("#weather-temperature").textContent === "12.5°C");
  await page.locator("#weather-panel-close").click();
  await page.locator("#plans-button").click();
  await card.locator('[data-action="more"]').click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator('[data-plan-more-action="delete"]').click();
  await page.locator(".plans-empty").waitFor();
  const remaining = await page.evaluate(async () => {
    const db = await new Promise((resolve) => { const request = indexedDB.open("celestiframe-offline-v1"); request.onsuccess = () => resolve(request.result); });
    const count = await new Promise((resolve) => { const request = db.transaction("prepared-plans").objectStore("prepared-plans").count(); request.onsuccess = () => resolve(request.result); });
    db.close(); return count;
  });
  assert.equal(remaining, 0);
  results.push({ failedOfflineRetryPreservesForecast: "PASS", deleteRemovesPreparedData: "PASS", lateSensorPermissionIgnored: "PASS" });
  assert.deepEqual(errors, []);
  await context.close();
  await writeFile(path.join(output, "field-results.json"), JSON.stringify({ results, errors }, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
