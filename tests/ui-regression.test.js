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
  const lightCompactBlock = css.match(/:root\[data-theme="light"\] \.celestial-card\.is-compact \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(lightCompactBlock, /--text:\s*#102033/);
  assert.match(lightCompactBlock, /--muted:\s*#5c6d7d/);
  assert.match(lightCompactBlock, /--milkyway:\s*#7443a8/);
  assert.ok(css.includes(':root[data-theme="light"] .celestial-card.is-compact .horizon-state.is-above'));
});

test("mobile deck stage control exposes both screen-size actions", () => {
  const html = readProjectFile("index.html");
  const app = readProjectFile("js/app.js");
  assert.ok(html.includes('class="deck-handle-label">全画面</span>'));
  assert.ok(app.includes('textContent = expanded ? "半画面" : "全画面"'));
  assert.ok(app.includes('setAttribute("aria-label", expanded ? "コントロールを半画面に戻す" : "コントロールを全画面に広げる")'));
});
