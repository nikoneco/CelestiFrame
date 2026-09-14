// Focused browser regression checks for the selected target primary order.
// Use NODE_PATH to expose Playwright and QA_OUTPUT for screenshots/results.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const base = process.env.QA_URL || "http://127.0.0.1:4173/";
const baseUrl = new URL(base);
baseUrl.search = "";
baseUrl.hash = "";
const shareUrl = new URL(baseUrl);
for (const [key, value] of Object.entries({
  plan: "1",
  lat: "35.665000",
  lng: "139.745430",
  at: "2026-09-06T09:00:00.000Z",
  targets: "moon,milkyway,jupiter,andromeda,sun",
  z: "14",
  slat: "35.658580",
  slng: "139.745430",
  subject: "東京タワー",
  height: "333",
  se: "18",
  ce: "18",
  ch: "1.5",
  tm: "structure",
})) shareUrl.searchParams.set(key, value);
const output = path.resolve(process.env.QA_OUTPUT || path.join(os.tmpdir(), "celestiframe-primary-qa"));
await mkdir(output, { recursive: true });

const tilePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const origins = ["camera", "subject"];
const selectedTargetIds = ["moon", "milkyway", "jupiter", "andromeda", "sun"];
const stateStorageKey = "celestiframe:state:v1";

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: Number(process.env.QA_DPR || 1),
  timezoneId: "Asia/Tokyo",
  serviceWorkers: "block",
});
let tileRequests = 0;
await context.route("https://tile.openstreetmap.org/**", async (route) => {
  tileRequests += 1;
  await route.fulfill({ status: 200, contentType: "image/png", body: tilePng });
});

const page = await context.newPage();
await page.emulateMedia({ reducedMotion: "reduce" });
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));

async function settle() {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(80);
}

async function waitForApp() {
  await page.locator(".leaflet-container").waitFor({ timeout: 20_000 });
  await page.locator("#target-selection-summary button[data-target-chip]").first().waitFor({ state: "attached", timeout: 20_000 });
  await settle();
}

async function openCelestialPanel() {
  const deck = page.locator(".control-deck");
  if ((await deck.getAttribute("class"))?.split(/\s+/).includes("is-collapsed")) {
    await page.locator("#deck-toggle").click();
  }
  await page.locator("#deck-tab-celestial").click();
  await page.waitForFunction(() => !document.querySelector("#celestial-panel")?.hasAttribute("hidden"));
}

async function openSettings() {
  const settings = page.locator("#settings-dialog");
  if (await settings.evaluate((element) => element.open)) return;
  const menu = page.locator("#topbar-menu");
  if (await menu.isHidden()) await page.locator("#more-button").click();
  await page.locator("#settings-button").click();
  await page.waitForFunction(() => document.querySelector("#settings-dialog")?.open === true);
}

async function closeSettings() {
  const settings = page.locator("#settings-dialog");
  if (await settings.evaluate((element) => element.open)) await settings.evaluate((element) => element.close());
  await page.waitForFunction(() => document.querySelector("#settings-dialog")?.open === false);
}

async function selectTheme(theme) {
  await openSettings();
  await page.locator(`input[name="theme"][value="${theme}"]`).check({ force: true });
  await closeSettings();
  await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
}

async function setOrigin(origin) {
  await openSettings();
  await page.locator(`input[name="direction-line-origin"][value="${origin}"]`).check({ force: true });
  await closeSettings();
  await page.waitForFunction((expected) => document.querySelector(`input[name="direction-line-origin"][value="${expected}"]`)?.checked, origin);
  const expectedRegularCount = await page.locator("#target-selection-summary [data-target-chip]").evaluateAll((nodes) => (
    nodes.filter((node) => node.dataset.targetChip !== "milkyway").length
  ));
  if (origin === "both") {
    await page.waitForFunction((count) => (
      document.querySelectorAll(".celestial-direction-line.camera-origin-line").length === count
      && document.querySelectorAll(".celestial-direction-line.subject-origin-line").length === count
    ), expectedRegularCount);
  } else {
    await page.waitForFunction(({ expected, count: expectedCount }) => {
      const actualCount = document.querySelectorAll(`.celestial-direction-line.${expected}-origin-line`).length;
      return actualCount === expectedCount;
    }, { expected: origin, count: expectedRegularCount });
  }
  await settle();
}

async function targetOrder() {
  return page.locator("#target-selection-summary button[data-target-chip]").evaluateAll((nodes) => (
    nodes.map((node) => node.dataset.targetChip)
  ));
}

async function assertTargetOrder(expected, label) {
  assert.deepEqual(await targetOrder(), expected, label);
  const state = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), stateStorageKey);
  assert.deepEqual(state?.selectedTargets, expected, `${label}: localStorage order`);
  assert.equal(await page.locator('#celestial-grid .celestial-card.is-detail:visible').getAttribute('data-card'), expected[0], `${label}: primary is the expanded card`);
  assert.equal(await page.locator('#celestial-grid .celestial-card:visible').first().getAttribute('data-card'), expected[0], `${label}: primary is the first card`);
}

async function waitForStorageOrder(expected) {
  await page.waitForFunction(({ key, value }) => {
    try {
      return JSON.parse(localStorage.getItem(key) || "null")?.selectedTargets?.join(",") === value.join(",");
    } catch {
      return false;
    }
  }, { key: stateStorageKey, value: expected });
}

async function promoteChip(targetId) {
  const chip = page.locator(`#target-selection-summary button[data-target-chip="${targetId}"]`);
  await chip.focus();
  await chip.press("Enter");
  await page.waitForFunction((expected) => document.querySelector("#target-selection-summary button[data-target-chip]")?.dataset.targetChip === expected, targetId);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.targetChip), targetId, "primary chip keeps keyboard focus");
}

async function directionCount(origin) {
  return page.locator(`.celestial-direction-line.${origin}-origin-line`).count();
}

async function inspectElement(selector) {
  return page.evaluate((targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (!element) return null;
    const style = getComputedStyle(element);
    const classes = typeof element.className === "string" ? element.className : element.className?.baseVal || "";
    return {
      classes,
      opacity: Number.parseFloat(style.opacity),
      fillOpacity: Number.parseFloat(style.fillOpacity),
      strokeOpacity: Number.parseFloat(style.strokeOpacity),
      strokeWidth: Number.parseFloat(style.strokeWidth),
    };
  }, selector);
}

async function mapSnapshot(origin) {
  return page.evaluate((expectedOrigin) => {
    const read = (selector) => [...document.querySelectorAll(selector)].map((element) => {
      const style = getComputedStyle(element);
      const classes = typeof element.className === "string" ? element.className : element.className?.baseVal || "";
      return {
        classes,
        opacity: Number.parseFloat(style.opacity),
        fillOpacity: Number.parseFloat(style.fillOpacity),
        strokeOpacity: Number.parseFloat(style.strokeOpacity),
        strokeWidth: Number.parseFloat(style.strokeWidth),
      };
    });
    return {
      regular: read(`.celestial-direction-line.${expectedOrigin}-origin-line`),
      fans: read(`.milkyway-fan-${expectedOrigin}`),
      coreLines: read(`.milkyway-core-line-${expectedOrigin}`),
      coreMarkers: read(`.milkyway-core-marker-${expectedOrigin}`),
    };
  }, origin);
}

function assertStyleEqual(actual, expected, keys, label) {
  for (const key of keys) {
    assert.ok(Number.isFinite(actual?.[key]) && Number.isFinite(expected?.[key]), `${label}: ${key} is numeric`);
    assert.ok(Math.abs(actual[key] - expected[key]) < 0.01, `${label}: ${key} changed (${actual[key]} vs ${expected[key]})`);
  }
}

async function assertUiState(width, theme, expectedPrimary) {
  await openCelestialPanel();
  const state = await page.evaluate(() => {
    const summary = document.querySelector("#target-selection-summary");
    const chip = summary?.querySelector("button.is-primary");
    const primaryStyle = chip ? getComputedStyle(chip) : null;
    const visibleCards = [...document.querySelectorAll("#celestial-grid .celestial-card[data-card]")]
      .filter((card) => !card.hidden)
      .map((card) => card.dataset.card);
    return {
      documentWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      theme: document.documentElement.dataset.theme,
      summaryOutsideOpenButton: !summary?.closest("#target-selector-button"),
      summaryRole: summary?.getAttribute("role"),
      primaryId: chip?.dataset.targetChip,
      pressedCount: summary ? [...summary.querySelectorAll("button")].filter((button) => button.getAttribute("aria-pressed") === "true").length : 0,
      primaryLabel: chip?.getAttribute("aria-label"),
      chipHeight: chip ? primaryStyle?.height : null,
      chipColor: chip ? primaryStyle?.color : null,
      bodyColor: getComputedStyle(document.body).color,
      skyTone: document.querySelector("#sky-state-rail")?.dataset.tone,
      visibleCards,
    };
  });
  assert.equal(state.documentWidth, width, `${width}/${theme}: document width`);
  assert.equal(state.scrollWidth, width, `${width}/${theme}: horizontal overflow`);
  assert.equal(state.theme, theme, `${width}/${theme}: applied theme`);
  assert.equal(state.summaryOutsideOpenButton, true, `${width}/${theme}: summary is outside open button`);
  assert.equal(state.summaryRole, "group", `${width}/${theme}: summary group semantics`);
  assert.equal(state.primaryId, expectedPrimary, `${width}/${theme}: primary chip`);
  assert.equal(state.pressedCount, 1, `${width}/${theme}: one pressed primary chip`);
  assert.match(state.primaryLabel || "", /主対象/);
  assert.ok(Number.parseFloat(state.chipHeight) >= 40, `${width}/${theme}: chip is keyboard/touch sized`);
  assert.ok(state.chipColor && state.bodyColor, `${width}/${theme}: readable computed colors exist`);
  assert.equal(state.skyTone, expectedPrimary === "moon" ? "lunar" : expectedPrimary === "milkyway" ? "milkyway" : "horizon", `${width}/${theme}: sky rail tone`);
  assert.deepEqual(state.visibleCards, selectedTargetIdsFromState(await targetOrder()), `${width}/${theme}: card order follows chips`);
  await page.screenshot({ path: path.join(output, `primary-${version}-${width}-${theme}.png`), fullPage: true });
  return state;
}

function selectedTargetIdsFromState(ids) {
  return ids;
}

const results = { version, output, deviceScaleFactor: Number(process.env.QA_DPR || 1), tileRequests: 0, originChecks: [], themeChecks: [], screenshots: [] };

try {
  await page.goto(String(baseUrl), { waitUntil: "domcontentloaded" });
  await waitForApp();
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForApp();

  await page.goto(String(shareUrl), { waitUntil: "domcontentloaded" });
  await waitForApp();
  await openCelestialPanel();
  await page.waitForFunction((expected) => JSON.stringify([...document.querySelectorAll("#target-selection-summary [data-target-chip]")].map((node) => node.dataset.targetChip)) === JSON.stringify(expected), selectedTargetIds);
  await assertTargetOrder(selectedTargetIds, "five-target URL selection");
  assert.equal(await page.locator("#target-selection-summary button").count(), 5, "five selected target chips render");

  const initialCards = await page.locator("#celestial-grid .celestial-card[data-card]").evaluateAll((cards) => cards.filter((card) => !card.hidden).map((card) => card.dataset.card));
  assert.deepEqual(initialCards, selectedTargetIds, "initial detail cards follow selected target order");
  assert.equal(await page.locator("#sky-state-rail").getAttribute("data-tone"), "lunar", "initial sky rail follows moon primary");

  const baseline = {};
  for (const origin of origins) {
    await setOrigin(origin);
    assert.equal(await directionCount(origin), 4, `${origin}: four non-Milky-Way direction lines`);
    const snapshot = await mapSnapshot(origin);
    assert.ok(snapshot.fans.length > 0, `${origin}: Milky Way fan exists`);
    assert.equal(snapshot.coreLines.length, 1, `${origin}: Milky Way core line exists`);
    assert.equal(snapshot.coreMarkers.length, 1, `${origin}: Milky Way core marker exists`);
    assert.equal(snapshot.fans.some((item) => item.classes.includes("is-primary")), false, `${origin}: secondary Milky Way fans are unmarked`);
    assert.equal(snapshot.coreLines[0].classes.includes("is-primary"), false, `${origin}: secondary Milky Way core is unmarked`);
    baseline[origin] = snapshot;
  }
  await setOrigin("both");
  assert.equal(await directionCount("camera"), 4, "both: camera lines exist");
  assert.equal(await directionCount("subject"), 4, "both: subject lines exist");
  results.originChecks.push({ origin: "baseline", fanCounts: origins.map((origin) => baseline[origin].fans.length) });

  await promoteChip("milkyway");
  await waitForStorageOrder(["milkyway", "moon", "jupiter", "andromeda", "sun"]);
  assert.deepEqual(await targetOrder(), ["milkyway", "moon", "jupiter", "andromeda", "sun"], "Milky Way chip moves to first");
  assert.equal(await page.locator("#sky-state-rail").getAttribute("data-tone"), "milkyway", "Milky Way becomes sky rail tone");

  for (const origin of [...origins, "both"]) {
    await setOrigin(origin);
    const inspectedOrigins = origin === "both" ? origins : [origin];
    for (const inspectedOrigin of inspectedOrigins) {
      const snapshot = await mapSnapshot(inspectedOrigin);
      assert.ok(snapshot.fans.some((item) => item.classes.includes("is-primary")), `${origin}/${inspectedOrigin}: primary Milky Way fan class`);
      assert.equal(snapshot.coreLines.filter((item) => item.classes.includes("is-primary")).length, 1, `${origin}/${inspectedOrigin}: primary Milky Way core line class`);
      assert.equal(snapshot.coreMarkers.filter((item) => item.classes.includes("is-primary")).length, 1, `${origin}/${inspectedOrigin}: primary Milky Way core marker class`);
      if (inspectedOrigin === "camera") {
        assert.ok(snapshot.fans[0].fillOpacity >= baseline[inspectedOrigin].fans[0].fillOpacity * 1.5, `${origin}/${inspectedOrigin}: primary fan has a clearly stronger fill`);
      } else {
        assert.ok(snapshot.fans[0].strokeWidth > baseline[inspectedOrigin].fans[0].strokeWidth + 0.1, `${origin}/${inspectedOrigin}: primary fan weight is slightly emphasized`);
      }
      assert.ok(snapshot.coreLines[0].strokeWidth > baseline[inspectedOrigin].coreLines[0].strokeWidth + 0.1, `${origin}/${inspectedOrigin}: primary core weight is slightly emphasized`);
      assertStyleEqual(snapshot.regular[2], baseline[inspectedOrigin].regular[2], ["opacity", "strokeWidth"], `${origin}/${inspectedOrigin}: non-primary direction retains opacity/weight`);
      results.originChecks.push({ origin, layerOrigin: inspectedOrigin, directionCount: snapshot.regular.length, primaryFanCount: snapshot.fans.filter((item) => item.classes.includes("is-primary")).length });
    }
  }
  await setOrigin("both");

  const jupiterBaseline = Object.fromEntries(origins.map((origin) => [
    origin,
    baseline[origin].regular.find((item) => item.classes.includes("celestial-direction-jupiter")),
  ]));
  await promoteChip("jupiter");
  await waitForStorageOrder(["jupiter", "milkyway", "moon", "andromeda", "sun"]);
  assert.equal(await page.locator("#sky-state-rail").getAttribute("data-tone"), "horizon", "fixed target uses horizon sky rail tone");
  for (const origin of origins) {
    const jupiterPrimary = (await mapSnapshot(origin)).regular.find((item) => item.classes.includes("celestial-direction-jupiter"));
    assert.ok(jupiterPrimary.classes.includes("is-primary"), `${origin}: primary Jupiter line receives primary class`);
    assert.ok(jupiterPrimary.strokeWidth >= jupiterBaseline[origin].strokeWidth * 1.8, `${origin}: primary Jupiter line is visibly heavier`);
    const demotedMilkyWay = await mapSnapshot(origin);
    assert.equal(demotedMilkyWay.fans.some((item) => item.classes.includes("is-primary")), false, `${origin}: demoted Milky Way fan has no primary class`);
    assert.equal(demotedMilkyWay.coreLines[0].classes.includes("is-primary"), false, `${origin}: demoted Milky Way core has no primary class`);
    assertStyleEqual(demotedMilkyWay.fans[0], baseline[origin].fans[0], ["fillOpacity", "strokeWidth"], `${origin}: demoted Milky Way fan restores non-primary style`);
    assertStyleEqual(demotedMilkyWay.coreLines[0], baseline[origin].coreLines[0], ["strokeOpacity", "strokeWidth"], `${origin}: demoted Milky Way core restores non-primary style`);
  }

  await page.goto(String(baseUrl), { waitUntil: "domcontentloaded" });
  await waitForApp();
  await openCelestialPanel();
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForApp();
  await openCelestialPanel();
  await assertTargetOrder(["jupiter", "milkyway", "moon", "andromeda", "sun"], "saved order after reload");
  assert.equal(await page.locator("#sky-state-rail").getAttribute("data-tone"), "horizon", "saved primary survives reload");

  // Opening a card and choosing a chip must update the same primary target.
  for (const [target, action, expected] of [
    ['moon', 'click', ['moon', 'jupiter', 'milkyway', 'andromeda', 'sun']],
    ['sun', 'Enter', ['sun', 'moon', 'jupiter', 'milkyway', 'andromeda']],
    ['milkyway', 'Space', ['milkyway', 'sun', 'moon', 'jupiter', 'andromeda']],
  ]) {
    const card = page.locator(`.celestial-card.is-compact[data-card="${target}"]`);
    if (action === 'click') await card.click();
    else { await card.focus(); await card.press(action); }
    await waitForStorageOrder(expected);
    await assertTargetOrder(expected, `card ${action}: ${target}`);
    assert.equal(await page.locator('#target-selection-summary button[aria-pressed="true"]').getAttribute('data-target-chip'), target);
    const snapshot = await mapSnapshot('camera');
    if (target === 'milkyway') assert.ok(snapshot.fans.some(item => item.classes.includes('is-primary')));
    else assert.ok(snapshot.regular.find(item => item.classes.includes(`celestial-direction-${target}`))?.classes.includes('is-primary'));
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForApp();
  await openCelestialPanel();
  await assertTargetOrder(['milkyway', 'sun', 'moon', 'jupiter', 'andromeda'], 'card primary survives reload');
  await promoteChip('jupiter');
  await waitForStorageOrder(['jupiter', 'milkyway', 'sun', 'moon', 'andromeda']);
  await assertTargetOrder(['jupiter', 'milkyway', 'sun', 'moon', 'andromeda'], 'chip also switches expanded card');

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.waitForTimeout(180);
    for (const theme of ["dark", "light", "red"]) {
      await selectTheme(theme);
      const ui = await assertUiState(width, theme, "jupiter");
      results.themeChecks.push({ width, theme, primary: ui.primaryId, scrollWidth: ui.scrollWidth });
    }
  }

  const singleUrl = new URL(shareUrl);
  singleUrl.searchParams.set("targets", "moon");
  await page.goto(String(singleUrl), { waitUntil: "domcontentloaded" });
  await waitForApp();
  await openCelestialPanel();
  await assertTargetOrder(["moon"], "single-target URL selection");
  assert.equal(await page.locator('#target-selection-summary button[aria-pressed="true"]').count(), 1, "single target is primary");
  assert.deepEqual(
    await page.locator("#celestial-grid .celestial-card[data-card]").evaluateAll((cards) => cards.filter((card) => !card.hidden).map((card) => card.dataset.card)),
    ["moon"],
    "single target leaves only one detail card",
  );
  assert.equal(await page.locator("#sky-state-rail").getAttribute("data-tone"), "lunar", "single target sets lunar sky rail tone");
  await setOrigin("both");
  assert.equal(await directionCount("camera"), 1, "single target camera line");
  assert.equal(await directionCount("subject"), 1, "single target subject line");
  await page.screenshot({ path: path.join(output, `primary-${version}-single-dark.png`), fullPage: true });

  assert.ok(tileRequests > 0, "OSM tile requests were served by the single-tile fixture");
  assert.deepEqual(pageErrors, [], "browser page errors");
  results.tileRequests = tileRequests;
  results.screenshots = [
    ...[1440, 390, 320].flatMap((width) => ["dark", "light", "red"].map((theme) => `primary-${version}-${width}-${theme}.png`)),
    `primary-${version}-single-dark.png`,
  ];
  await writeFile(path.join(output, "primary-results.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ status: "PASS", output, version, tileRequests, originChecks: results.originChecks.length, themeChecks: results.themeChecks.length }));
} finally {
  await browser.close();
}
