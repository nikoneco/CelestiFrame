// Browser regression checks. Install Playwright, or expose it with NODE_PATH.
// QA_URL selects the app; QA_OUTPUT selects the screenshot directory.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
const { chromium } = createRequire(import.meta.url)("playwright");
const base = process.env.QA_URL || "http://127.0.0.1:48731/";
const output = process.env.QA_OUTPUT || path.join(os.tmpdir(), "celestiframe-qa");
await mkdir(output, { recursive: true });
const url = new URL(base);
for (const [key, value] of Object.entries({ plan: "1", lat: "35.665", lng: "139.74543", at: "2026-09-06T08:00:00.000Z", targets: "sun,moon,milkyway,jupiter,andromeda", slat: "35.65858", slng: "139.74543", subject: "東京タワー", height: "333", se: "18", ce: "18", ch: "1.5", tm: "structure" })) url.searchParams.set(key, value);
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }) });
const results = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Tokyo", serviceWorkers: "block" });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const settled = async () => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => !document.getAnimations().some((animation) => animation.playState === 'running'));
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(String(url));
  await page.locator(".leaflet-container").waitFor();
  await page.waitForFunction(() => document.querySelector('#date-input').value === '2026-09-06');
  await page.locator('#time-input').fill('04:00');
  await page.locator('#time-input').press('Tab');
  assert.equal(await page.locator('#date-input').inputValue(), '2026-09-06');
  await page.locator('#time-input').fill('23:59');
  await page.locator('#time-input').press('Tab');
  await page.locator('#deck-tab-celestial').click();
  await page.locator('#quick-time-controls [data-minutes="1"]').click();
  assert.equal(await page.locator('#date-input').inputValue(), '2026-09-07');
  assert.equal(await page.locator('#quick-time-input').inputValue(), '00:00');
  await page.locator('#quick-time-controls [data-minutes="-1"]').click();
  assert.equal(await page.locator('#date-input').inputValue(), '2026-09-06');
  await page.locator('#quick-time-input').fill('17:00');
  await page.locator('#quick-time-input').press('Tab');

  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    // The deck's resize handlers invalidate Leaflet after its 380ms transition.
    await page.waitForTimeout(450);
    for (const theme of ['dark', 'light', 'red']) {
      await page.locator('#more-button').click();
      await page.locator('#settings-button').click();
      await page.locator(`label:has(input[name="theme"][value="${theme}"])`).click();
      assert.equal(await page.locator(`input[name="theme"][value="${theme}"]`).isChecked(), true);
      await page.locator('#settings-dialog').press('Escape');
      await page.locator('#deck-tab-celestial').click();
      if (width < 759 && !(await page.locator('.control-deck').getAttribute('class')).includes('is-expanded')) await page.locator('.deck-handle').click();
      await page.locator('.celestial-card.is-compact[data-card="sun"]').click();
      assert.equal(await page.locator('.celestial-card.is-detail').getAttribute('data-card'), 'sun');
      await page.locator('.celestial-card.is-compact[data-card="moon"]').click();
      const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
        compact: [...document.querySelectorAll('.celestial-card.is-compact h2')].map((el) => ({ text: el.textContent, whiteSpace: getComputedStyle(el).whiteSpace, height: el.getBoundingClientRect().height, color: getComputedStyle(el).color })),
        detailColor: getComputedStyle(document.querySelector('.celestial-card.is-detail h2')).color }));
      assert.equal(geometry.scrollWidth, geometry.width, `${width}/${theme}: horizontal overflow`);
      geometry.compact.forEach((item) => assert.equal(item.whiteSpace, 'nowrap', item.text));
      await settled();
      await page.screenshot({ path: path.join(output, `${width}-${theme}-celestial.png`) });
      await page.locator('#deck-tab-alignment').click();
      const labelColors = await page.locator('.alignment-target-label').evaluateAll((nodes) => nodes.map((el) => ({color:getComputedStyle(el).color, text:getComputedStyle(el).getPropertyValue('--text').trim()})));
      assert.equal(new Set(labelColors.map((item) => item.color)).size, 1, 'target labels use readable body text, independent of target palette');
      await settled();
      await page.screenshot({ path: path.join(output, `${width}-${theme}-alignment.png`) });
      results.push({ width, theme, ...geometry, labelColors });
      if (width < 759) {
        await page.locator('.control-deck').evaluate((el) => { el.scrollTop = el.scrollHeight; });
        await page.locator('#deck-toggle').click();
        await page.waitForFunction(() => document.querySelector('.control-deck').classList.contains('is-collapsed'));
        const toggle = await page.locator('#deck-toggle').boundingBox();
        assert.ok(toggle.y >= 0 && toggle.y + toggle.height <= 844, 'restore button stays in viewport after scrolling');
        await page.locator('#deck-toggle').click();
        await page.locator('#deck-tab-time').click();
        await settled();
        await page.screenshot({ path: path.join(output, `${width}-${theme}-time.png`) });
      }
    }
  }

  // Compare with the audit's 60 synchronous minute updates, five targets and a subject.
  const measure = () => {
    const counts = { polylines: 0, replaceChildren: 0, getPosition: 0, getTimes: 0, getMoonPosition: 0, getMoonTimes: 0, getMoonIllumination: 0 };
    const restore = [];
    for (const [object, key, counter] of [[L, 'polyline', 'polylines'], [Element.prototype, 'replaceChildren', 'replaceChildren'], ...['getPosition','getTimes','getMoonPosition','getMoonTimes','getMoonIllumination'].map((key) => [SunCalc,key,key])]) {
      const original = object[key]; object[key] = function(...args) { counts[counter]++; return original.apply(this,args); }; restore.push(()=>{object[key]=original;});
    }
    const times = [];
    const input = document.querySelector('#time-slider');
    try { for(let i=0;i<60;i++) { const start=performance.now(); input.value=String(600+i); input.dispatchEvent(new Event('input',{bubbles:true})); times.push(performance.now()-start); } }
    finally { restore.forEach((fn)=>fn()); }
    return {counts,meanMs:times.reduce((a,b)=>a+b,0)/times.length,maxMs:Math.max(...times)};
  };
  const performance = await page.evaluate(measure);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate:4});
  const constrainedPerformance = await page.evaluate(measure);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate:1});
  assert.equal(performance.counts.polylines, 0, 'time scrubbing reuses map lines');
  assert.ok(performance.counts.getMoonTimes <= 2, 'daily moon events are reused per observing point');
  for (const height of [0, 300]) {
    await page.locator('#deck-tab-composition').click();
    await page.locator('#camera-height-meters').fill(String(height));
    await page.locator('#plans-button').click();
    await page.locator('#plan-name').fill(`QA height ${height}`);
    await page.locator('#plan-save').click();
    await page.locator('.plan-card-main').filter({hasText:`QA height ${height}`}).waitFor();
    await page.locator('#plans-close').click();
  }
  await page.reload();
  await page.locator('.leaflet-container').waitFor();
  for (const height of [0, 300]) {
    await page.locator('#plans-button').click();
    await page.locator('.plan-card-main').filter({hasText:`QA height ${height}`}).click();
    await page.locator('#deck-tab-composition').click();
    assert.equal(await page.locator('#camera-height-meters').inputValue(), String(height));
  }
  results.push({heightSaveReload: '0m and 300m pass'});

  let delayTerrain = false, releaseTerrain, terrainStarted;
  let terrainGate = Promise.resolve();
  await page.route('**/getelevation.php?*', async (route) => {
    if (delayTerrain) { terrainStarted?.(); await terrainGate; }
    await route.fulfill({ json: { elevation: 18, hsrc: 'QA fixture' } }).catch(()=>{});
  });
  await page.locator('#deck-tab-alignment').click();
  await page.locator('#terrain-profile-button').click();
  await page.locator('#terrain-profile-result').waitFor({state:'visible'});
  await page.locator('#deck-tab-composition').click();
  await page.locator('#camera-height-meters').fill('301');
  assert.equal(await page.locator('#terrain-profile-result').getAttribute('hidden'), '');
  await page.evaluate(async () => (await import('./js/elevation/elevation-service.js?v=1.7.0')).clearElevationCache());
  delayTerrain = true;
  terrainGate = new Promise((resolve) => { releaseTerrain = resolve; });
  const started = new Promise((resolve) => { terrainStarted = resolve; });
  await page.locator('#deck-tab-alignment').click();
  await page.locator('#terrain-profile-button').click();
  await started;
  await page.locator('#deck-tab-composition').click();
  await page.locator('#camera-height-meters').fill('302');
  releaseTerrain();
  await page.locator('#deck-tab-alignment').click();
  assert.equal(await page.locator('#terrain-profile-result').getAttribute('hidden'), '');
  assert.equal(await page.locator('#terrain-profile-button').isEnabled(), true);
  assert.match(await page.locator('#terrain-profile-status').textContent(), /21点/);
  results.push({terrainInvalidation: 'completed and pending results reset after height changes'});
  assert.deepEqual(errors, []);
  await page.locator('#deck-tab-celestial').click();
  await page.locator('#target-selector-button').click();
  for (const target of ['sun','milkyway','jupiter','andromeda']) await page.locator(`label:has(input[name="celestialTarget"][value="${target}"])`).click();
  await page.getByRole('button',{name:'完了',exact:true}).click();
  assert.equal(await page.locator('.celestial-card:visible').count(),1);
  assert.equal(await page.locator('.celestial-card.is-detail:visible').getAttribute('data-card'),'moon');
  for (const theme of ['dark','light']) {
    await page.locator('#more-button').click(); await page.locator('#settings-button').click();
    await page.locator(`label:has(input[name="theme"][value="${theme}"])`).click();
    await page.locator('#settings-dialog').press('Escape');
    await settled();
    await page.screenshot({path:path.join(output,`single-${theme}.png`)});
  }
  results.push({ performance, constrainedPerformance, errors, singleSelection:'pass' });
  const weatherMarkup = await page.locator('#weather-overlay').evaluate((node)=>node.outerHTML);
  const weatherPage = await context.newPage();
  await weatherPage.route('**/qa-weather', (route)=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><body>${weatherMarkup}</body></html>`}));
  await weatherPage.goto(new URL('qa-weather', base).href);
  await weatherPage.evaluate(async () => {
    const { bindWeatherOverlay } = await import('./js/weather/weather-controller.js?v=1.7.0');
    const { toForecastHour } = await import('./js/weather/forecast-service.js?v=1.7.0');
    let state = {selectedDateTime:new Date().toISOString(), cameraLocation:{latitude:35,longitude:139}, map:{center:{latitude:35,longitude:139},zoom:14}};
    const listeners = [];
    const fixture = window.weatherFixture = {calls:[],pending:[],hold:false,missing:false,cells:[]};
    fixture.camera = (latitude) => { state={...state,cameraLocation:{latitude,longitude:139}}; listeners.forEach((listener)=>listener(state)); };
    const store={getState:()=>state,subscribe(listener){listeners.push(listener);listener(state);}};
    bindWeatherOverlay(store,()=>({getVisibleBounds:()=>({north:35.1,south:34.9,east:139.1,west:138.9}),clearCloudOverlay(){fixture.cells=[];},setCloudOverlay(cells){fixture.cells=cells;}}),{
      endpoint:'https://forecast.invalid/',
      fetchImpl:async (url) => {
        const latitude=Number(new URL(url).searchParams.get('latitude').split(',')[0]);
        fixture.calls.push(latitude);
        const value=fixture.missing?null:latitude===35?20:latitude===35.002?80:latitude===35.003?30:70;
        const locationCount=new URL(url).searchParams.get('latitude').split(',').length;
        const response=()=>new Response(JSON.stringify(Array.from({length:locationCount},()=>({hourly:{time:[toForecastHour(state.selectedDateTime)],cloud_cover:[value],cloud_cover_low:[value],cloud_cover_mid:[value],cloud_cover_high:[value],visibility:[fixture.missing?null:10000],wind_speed_10m:[value],wind_gusts_10m:[value],precipitation_probability:[value]}}))),{headers:{'Content-Type':'application/json'}});
        if(fixture.hold) return new Promise((resolve)=>fixture.pending.push(()=>resolve(response())));
        return response();
      },
    });
  });
  await weatherPage.locator('#weather-toggle').click();
  await weatherPage.waitForFunction(()=>document.querySelector('#weather-total').textContent==='20%');
  await weatherPage.evaluate(()=>window.weatherFixture.camera(35.002));
  assert.equal(await weatherPage.locator('#weather-total').textContent(),'—');
  await weatherPage.waitForFunction(()=>document.querySelector('#weather-total').textContent==='80%');
  await weatherPage.evaluate(()=>{window.weatherFixture.hold=true;window.weatherFixture.camera(35.003);});
  await weatherPage.waitForFunction(()=>window.weatherFixture.pending.length===1);
  await weatherPage.evaluate(()=>window.weatherFixture.camera(35.004));
  await weatherPage.waitForFunction(()=>window.weatherFixture.pending.length===2);
  await weatherPage.evaluate(()=>window.weatherFixture.pending[1]());
  await weatherPage.waitForFunction(()=>document.querySelector('#weather-total').textContent==='70%');
  await weatherPage.evaluate(()=>window.weatherFixture.pending[0]());
  assert.equal(await weatherPage.locator('#weather-total').textContent(),'70%');
  await weatherPage.evaluate(()=>{window.weatherFixture.hold=false;window.weatherFixture.missing=true;});
  await weatherPage.locator('#weather-refresh').click();
  await weatherPage.waitForFunction(()=>document.querySelector('#weather-total').textContent==='—' && window.weatherFixture.calls.length===5);
  assert.equal(await weatherPage.locator('#weather-visibility').textContent(),'—');
  assert.equal(await weatherPage.evaluate(()=>window.weatherFixture.cells.length),0);
  results.push({weather:'camera-only move, late response, and missing metrics pass'});
  await weatherPage.close();
  await context.close();

  const denied = await browser.newContext({ serviceWorkers: 'block' });
  await denied.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked','SecurityError'); } }));
  const deniedPage = await denied.newPage();
  const deniedErrors = [];
  deniedPage.on('pageerror', (error)=>deniedErrors.push(error.message));
  await deniedPage.goto(String(url));
  await deniedPage.locator('.leaflet-container').waitFor();
  await deniedPage.locator('#deck-tab-celestial').click();
  assert.deepEqual(deniedErrors, []);
  await denied.close();
  results.push({ storageDenied: 'pass' });

  const offline = await browser.newContext({ viewport: {width:390,height:844}, timezoneId:'Asia/Tokyo' });
  const offlinePage = await offline.newPage();
  const offlineErrors = [];
  offlinePage.on('pageerror', (error)=>offlineErrors.push(error.message));
  await offlinePage.goto(String(url));
  await offlinePage.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await offlinePage.locator('.leaflet-container').waitFor();
  await offlinePage.locator('#deck-tab-celestial').click();
  await offlinePage.evaluate(() => document.fonts.ready);
  const fonts = await offlinePage.evaluate(() => performance.getEntriesByType('resource').filter((entry)=>/\.woff2/.test(entry.name)).map((entry)=>entry.name));
  if (fonts.some((name)=>/IBMPlexSansJP-(Regular|SemiBold)\.woff2/.test(name))) {
    const coverage = await offlinePage.evaluate(async () => {
      const css = await (await fetch('./css/ui-fonts.css?v=1.7.0')).text();
      const supported = new Set([...css.matchAll(/U\+([0-9A-F]+)/g)].map((match)=>parseInt(match[1],16)));
      return [...new Set(document.body.innerText)].filter((character)=>character.codePointAt(0)>32 && !supported.has(character.codePointAt(0)));
    });
    console.log('FONT FALLBACK DIAGNOSTIC', JSON.stringify({fonts,missingVisibleCharacters:coverage}));
  }
  assert.ok(!fonts.some((name)=>/IBMPlexSansJP-(Regular|SemiBold)\.woff2/.test(name)), 'initial UI only needs subset fonts');
  await offline.setOffline(true);
  await offlinePage.reload();
  await offlinePage.locator('.leaflet-container').waitFor();
  await offlinePage.locator('#deck-tab-celestial').click();
  assert.match(await offlinePage.locator('[data-moon-field="altitude"]').textContent(), /\d/);
  await offlinePage.locator('#quick-time-input').fill('19:00');
  await offlinePage.locator('#quick-time-input').press('Tab');
  assert.equal(await offlinePage.locator('#time-input').inputValue(), '19:00');
  assert.deepEqual(offlineErrors, []);
  results.push({ offlineReloadAndCalculation:'pass', initialFonts:fonts });
  await offline.close();
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify(results,null,2));
  console.log(JSON.stringify({ status:'PASS', output, performance, cases:results.length }));
} finally { await browser.close(); }
