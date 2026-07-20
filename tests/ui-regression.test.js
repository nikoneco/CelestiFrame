import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readProjectFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("celestial selector stays separated from the detail cards", () => {
  const css = readProjectFile("css/app.css");
  assert.ok(css.includes(".celestial-panel .celestial-grid { margin-top: 12px; }"));
});

test("light theme gives compact celestial rows readable local tokens", () => {
  const css = readProjectFile("css/app.css");
  const tokens = readProjectFile("tokens.css");
  const lightCompactBlock = css.match(/:root\[data-theme="light"\] \.celestial-card\.is-compact \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(lightCompactBlock, /--text:\s*var\(--compact-text\)/);
  assert.match(lightCompactBlock, /--muted:\s*var\(--compact-muted\)/);
  assert.match(lightCompactBlock, /--milkyway:\s*var\(--compact-milkyway\)/);
  assert.match(tokens, /--compact-text:\s*#102033/);
  assert.match(tokens, /--compact-muted:\s*#5c6d7d/);
  assert.match(tokens, /--compact-milkyway:\s*#7443a8/);
  assert.ok(css.includes(':root[data-theme="light"] .celestial-card.is-compact .horizon-state.is-above'));
});

test("Hallmark refinement flattens nested tools and removes side-stripe selection", () => {
  const css = readProjectFile("css/app.css");
  const toolsBlock = css.match(/\.shooting-planner, \.terrain-profile-panel \{([^}]*)\}/)?.[1] || "";
  const compositionBlock = css.match(/\.composition-control-group \{([^}]*)\}/)?.[1] || "";
  const themeSelected = css.match(/\.theme-option:has\(input:checked\) \{([^}]*)\}/)?.[1] || "";
  const targetSelected = css.match(/\.target-option\.is-selected \{([^}]*)\}/)?.[1] || "";
  assert.match(toolsBlock, /border-radius:\s*0/);
  assert.match(toolsBlock, /background:\s*transparent/);
  assert.match(compositionBlock, /border-radius:\s*0/);
  assert.match(compositionBlock, /border-top:\s*1px solid var\(--line\)/);
  assert.equal(compositionBlock.includes("border-left"), false);
  assert.equal(themeSelected.includes("inset 3px 0"), false);
  assert.equal(targetSelected.includes("inset 3px 0"), false);
  assert.equal(css.includes(".plan-card::before"), false);
  assert.ok(css.includes(".plan-card.is-favorite::before"));
});

test("visual colors and elevation are sourced from the shared token file", () => {
  const css = readProjectFile("css/app.css");
  const tokens = readProjectFile("tokens.css");
  assert.match(css, /^\/\* Hallmark · genre: modern-minimal · macrostructure: Workbench/m);
  assert.match(css, /html \{ overflow-x: clip;/);
  assert.match(css, /overflow-x: clip;\n  overflow-y: hidden;/);
  assert.equal(/#[0-9a-f]{3,8}|rgba?\(/i.test(css), false);
  assert.ok(tokens.includes("--shadow-control:"));
  assert.ok(tokens.includes("--shadow-floating:"));
  assert.ok(tokens.includes("--shadow-modal:"));
  assert.ok(css.includes("box-shadow: var(--shadow-control)"));
  assert.equal(css.includes("text-shadow:"), false);
});

test("mobile deck stage control exposes both screen-size actions", () => {
  const html = readProjectFile("index.html");
  const app = readProjectFile("js/app.js");
  assert.ok(html.includes('class="deck-handle-label">全画面</span>'));
  assert.ok(app.includes('textContent = expanded ? "半画面" : "全画面"'));
  assert.ok(app.includes('setAttribute("aria-label", expanded ? "コントロールを半画面に戻す" : "コントロールを全画面に広げる")'));
});

test("day navigation shares the date row instead of consuming a separate row", () => {
  const html = readProjectFile("index.html");
  assert.ok(html.includes('class="date-input-row"'));
  assert.ok(html.includes('data-days="-1"'));
  assert.ok(html.includes('data-days="1"'));
  assert.equal(html.includes('class="date-stepper"'), false);
});

test("time slider stays above the nudge row and away from the screen edge", () => {
  const html = readProjectFile("index.html");
  const sliderPosition = html.indexOf('id="time-slider"');
  const nudgePosition = html.indexOf('class="time-nudges"');
  assert.ok(sliderPosition >= 0);
  assert.ok(nudgePosition > sliderPosition);
});

test("P2 sky-state rail keeps the photographic timeline and bundled typography offline", () => {
  const html = readProjectFile("index.html");
  const css = readProjectFile("css/app.css");
  const tokens = readProjectFile("tokens.css");
  const worker = readProjectFile("service-worker.js");
  assert.ok(html.includes('id="sky-state-bands"'));
  assert.ok(html.includes('id="sky-state-markers"'));
  assert.match(tokens, /font-family:\s*"IBM Plex Sans JP"/);
  assert.match(tokens, /font-family:\s*"IBM Plex Sans Condensed"/);
  assert.match(tokens, /font-family:\s*"IBM Plex Mono"/);
  [
    "IBMPlexSansJP-Regular.woff2",
    "IBMPlexSansCondensed-Regular.woff2",
    "IBMPlexMono-Regular.woff2",
  ].forEach((font) => assert.ok(worker.includes(font)));
});

test("P2 map preserves road colors and field mode leads with actionable guidance", () => {
  const html = readProjectFile("index.html");
  const css = readProjectFile("css/app.css");
  const darkMapFilter = css.match(/\.leaflet-tile-pane \{ filter: ([^;]+); \}/)?.[1] || "";
  assert.equal(darkMapFilter.includes("hue-rotate"), false);
  assert.ok(html.indexOf('class="field-guidance"') < html.indexOf('class="field-compass"'));
  assert.ok(html.includes('id="field-accuracy-guidance"'));
  assert.equal(html.includes("ON LOCATION"), false);
});

test("P2 mobile layout keeps the full datetime workflow inside the initial viewport", () => {
  const css = readProjectFile("css/app.css");
  assert.ok(css.includes(".map-stage { height: 45dvh; }"));
  assert.ok(css.includes(".control-deck { min-height: calc(52dvh + 18px); max-height: calc(55dvh + 18px); }"));
  assert.ok(css.includes(".date-input-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; }"));
});

test("expanded mobile deck stays above Leaflet attribution and controls", () => {
  const html = readProjectFile("index.html");
  const css = readProjectFile("css/app.css");
  const worker = readProjectFile("service-worker.js");
  assert.match(css, /\.control-deck\.is-expanded \{[^}]*z-index:\s*1100;/);
  assert.ok(html.includes("./tokens.css?v=1"));
  assert.ok(worker.includes("./tokens.css?v=1"));
  assert.ok(html.includes("./css/app.css?v=88"));
  assert.ok(worker.includes("./css/app.css?v=88"));
});
