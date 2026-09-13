// Live rendering regressions for the above-horizon Milky Way fan.
// Run after npm run serve. QA_URL and QA_OUTPUT also support the public release.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.QA_URL || 'http://127.0.0.1:4173/';
const output = process.env.QA_OUTPUT || path.join(os.tmpdir(), 'celestiframe-milkyway-qa');
await mkdir(output, {recursive:true});
const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {channel:'chrome'})});
const results = [];
try {
  const context = await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
  const page = await context.newPage();
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const go = async (at, lat=35.681, lng=139.767) => {
    const url = new URL(base);
    for (const [key,value] of Object.entries({plan:'1',lat,lng,at,targets:'milkyway',slat:lat-0.006,slng:lng,subject:'QA',height:20,se:18,ce:18,ch:1.5,tm:'structure'})) url.searchParams.set(key,value);
    await page.goto(String(url));
    await page.locator('.leaflet-container').waitFor();
    await page.locator('#deck-tab-celestial').click();
    await page.locator('.milkyway-fan-camera').first().waitFor({state:'attached'});
    assert.equal(await page.title(), 'CelestiFrame');
    assert.ok((await page.locator('body').innerText()).includes('天の川'));
  };
  const settings = async (name,value) => {
    await page.locator('#more-button').click();
    await page.locator('#settings-button').click();
    await page.locator(`label:has(input[name="${name}"][value="${value}"])`).click();
    await page.locator('#settings-dialog').press('Escape');
  };
  const snapshot = () => page.evaluate(() => ({
    fans:[...document.querySelectorAll('.milkyway-fan-camera')].map(e=>{
      const style=getComputedStyle(e);
      return {d:e.getAttribute('d'),fill:style.fill,opacity:Number(style.fillOpacity),pointerEvents:style.pointerEvents,
        expectedOpacity:Number(style.getPropertyValue('--milkyway-fan-base-opacity'))+Number(style.getPropertyValue('--milkyway-central-weight'))*Number(style.getPropertyValue('--milkyway-fan-center-opacity'))};
    }),
    core:document.querySelectorAll('.milkyway-core-marker-camera').length,
    coreLine:document.querySelectorAll('.milkyway-core-line-camera').length,
    arcCore:document.querySelectorAll('#milkyway-arc .milkyway-core').length,
    coreAltitude:document.querySelector('[data-milkyway-field="core-altitude"]').textContent,
    width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,
  }));
  for (const fixture of [
    {name:'core-above',at:'2026-07-13T15:00:00Z',core:true},
    {name:'core-below',at:'2026-01-15T12:00:00Z',core:false},
    {name:'partial-rise',at:'2026-03-07T17:00:00Z',core:false},
    {name:'north-wrap',at:'2026-07-13T15:00:00Z',lat:0,lng:139.767,core:true},
    {name:'south',at:'2026-07-13T15:00:00Z',lat:-35.681,lng:139.767,core:true},
    {name:'near-zenith',at:'2026-07-12T10:00:00Z',lat:37.315,lng:0},
    {name:'dateline-east',at:'2026-07-13T10:00:00Z',lat:-17,lng:179.999,core:true},
    {name:'dateline-west',at:'2026-07-13T10:00:00Z',lat:-17,lng:-179.999,core:true},
  ]) {
    await go(fixture.at,fixture.lat,fixture.lng);
    const state = await snapshot();
    assert.ok(state.fans.length>0, fixture.name);
    assert.ok(state.fans.every(f=>f.d && !/NaN|Infinity/.test(f.d)),fixture.name);
    if (fixture.core !== undefined) {
      assert.equal(state.core,Number(fixture.core),fixture.name);
      assert.equal(state.coreLine,Number(fixture.core),fixture.name);
      assert.equal(state.arcCore,Number(fixture.core),fixture.name);
    }
    if (['core-above','partial-rise'].includes(fixture.name)) assert.ok(Math.max(...state.fans.map(f=>f.opacity))-Math.min(...state.fans.map(f=>f.opacity))>0.02,`${fixture.name}: central emphasis survives clipping`);
    if (fixture.name==='core-below') assert.ok(Math.max(...state.fans.map(f=>f.opacity))-Math.min(...state.fans.map(f=>f.opacity))<0.001,'winter: no central emphasis');
    if (fixture.name.startsWith('dateline')) {
      const marker = await page.locator('.milkyway-core-marker-camera').boundingBox();
      assert.ok(marker && marker.x>500 && marker.x<940 && marker.y>280 && marker.y<720,'date-line core stays near its origin');
      assert.ok(new Set(state.fans.map(f=>f.d)).size > state.fans.length*0.75,'date-line fans must not collapse into repeated horizontal paths');
    }
    await page.screenshot({path:path.join(output,`${fixture.name}.png`)});
    results.push({fixture:fixture.name,...state});
  }
  await go('2026-09-06T11:00:00Z');
  // Date/time controls must remove and restore the center without leaving stale layers.
  await page.locator('#quick-time-input').fill('08:00');
  await page.locator('#quick-time-input').press('Tab');
  assert.equal(await page.locator('.milkyway-core-marker-camera').count(),0);
  await page.locator('#quick-time-input').fill('20:00');
  await page.locator('#quick-time-input').press('Tab');
  assert.equal(await page.locator('.milkyway-core-marker-camera').count(),1);
  for (const origin of ['subject','both','camera']) {
    await settings('direction-line-origin',origin);
    assert.equal((await page.locator('.milkyway-fan-camera').count())>0,origin!=='subject');
    assert.equal((await page.locator('.milkyway-fan-subject').count())>0,origin!=='camera');
    assert.equal(await page.locator('.milkyway-core-marker-subject').count(),Number(origin!=='camera'));
  }
  await settings('direction-line-origin','both');
  for (const width of [1440,390,320]) {
    await page.setViewportSize({width,height:width===1440?1000:844});
    for (const theme of ['dark','light','red']) {
      await settings('theme',theme);
      await page.locator('#deck-tab-celestial').click();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(450);
      const state = await snapshot();
      assert.equal(state.scrollWidth,state.width,`${width}/${theme}: overflow`);
      assert.ok(state.fans.every(f=>f.pointerEvents==='none'), 'fans must not block map gestures');
      assert.ok(state.fans.every(f=>Math.abs(f.opacity-f.expectedOpacity)<0.001),'theme changes update opacity without a time or zoom change');
      await page.screenshot({path:path.join(output,`${width}-${theme}-detail.png`)});
      if (width<759) {
        if ((await page.locator('.control-deck').getAttribute('class')).includes('is-expanded')) await page.locator('.deck-handle').click();
        await page.waitForTimeout(450);
        await page.screenshot({path:path.join(output,`${width}-${theme}-half.png`)});
      }
      await page.locator('#deck-toggle').click();
      await page.waitForTimeout(450);
      await page.screenshot({path:path.join(output,`${width}-${theme}-map.png`)});
      const marker = await page.locator('.milkyway-core-marker-camera').boundingBox();
      assert.ok(marker && marker.x>=0 && marker.y>=0 && marker.x+marker.width<=width && marker.y+marker.height<=(width===1440?1000:844), 'core marker visible at normal zoom');
      await page.locator('.leaflet-control-zoom-in').click();
      await page.waitForTimeout(450);
      assert.equal(await page.locator('.milkyway-core-marker-camera').count(),1,'zoom must not duplicate core');
      await page.locator('.leaflet-control-zoom-out').click();
      await page.locator('#deck-toggle').click();
      if (width<759) { await page.locator('.deck-handle').click(); await page.waitForTimeout(450); }
      results.push({width,theme,...state});
    }
  }
  // An eastward center previously fell outside a 320px screen with a fixed radius.
  await page.setViewportSize({width:320,height:844});
  await go('2026-07-13T10:00:00Z',-35.681,139.767);
  if (!(await page.locator('.control-deck').getAttribute('class')).includes('is-collapsed')) await page.locator('#deck-toggle').click();
  await page.waitForTimeout(450);
  const eastMarker = await page.locator('.milkyway-core-marker-camera').boundingBox();
  assert.ok(eastMarker && eastMarker.x>=0 && eastMarker.x+eastMarker.width<=320,'eastward center remains inside 320px map');
  await page.screenshot({path:path.join(output,'320-east-core.png')});
  await page.locator('#deck-toggle').click();
  if (!(await page.locator('.control-deck').getAttribute('class')).includes('is-expanded')) await page.locator('.deck-handle').click();
  await page.locator('#target-selector-button').click();
  await page.locator('label:has(input[name="celestialTarget"][value="moon"])').click();
  await page.locator('label:has(input[name="celestialTarget"][value="milkyway"])').click();
  await page.getByRole('button',{name:'完了',exact:true}).click();
  assert.equal(await page.locator('[class*="milkyway-fan"], [class*="milkyway-core-line"], [class*="milkyway-core-marker"]').count(),0,'target removal clears every map layer');
  assert.equal(await page.locator('.celestial-card:visible').count(),1);
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'milkyway-results.json'),JSON.stringify({status:'PASS',base,errors,results},null,2));
  console.log(JSON.stringify({status:'PASS',base,cases:results.length,output,errors}));
} finally { await browser.close(); }
