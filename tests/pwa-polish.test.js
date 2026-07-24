import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const projectUrl = (path) => new URL(`../${path}`, import.meta.url);
const readProjectFile = (path) => readFileSync(projectUrl(path), "utf8");

function luminance(hex) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function themeTokens(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`${escaped} \\{([\\s\\S]*?)\\n\\}`))?.[1] || "";
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1], match[2]]));
}

test("release metadata stays aligned with the visible app version", () => {
  const packageMetadata = JSON.parse(readProjectFile("package.json"));
  const lockMetadata = JSON.parse(readProjectFile("package-lock.json"));
  const html = readProjectFile("index.html");
  const readme = readProjectFile("README.md");
  const css = readProjectFile("css/app.css");
  assert.equal(packageMetadata.version, "1.6.0");
  assert.equal(lockMetadata.version, packageMetadata.version);
  assert.equal(lockMetadata.packages[""].version, packageMetadata.version);
  assert.ok(html.includes(`Ver ${packageMetadata.version} - CelestiFrame`));
  assert.ok(readme.includes(`Version ${packageMetadata.version}として`));
  assert.ok(readProjectFile("service-worker.js").includes("celestiframe-shell-v112"));
  assert.match(css, /\.phase-note \{[^}]*color: var\(--muted\);/);
});

test("P3 manifest provides install icons, screenshots, shortcuts, and both orientations", () => {
  const manifest = JSON.parse(readProjectFile("manifest.webmanifest"));
  assert.equal(manifest.id, "./");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "any");
  assert.deepEqual(manifest.icons.filter(({ type }) => type === "image/png").map(({ sizes }) => sizes), ["192x192", "512x512", "512x512"]);
  assert.deepEqual(manifest.screenshots.map(({ form_factor }) => form_factor), ["narrow", "wide"]);
  assert.deepEqual(manifest.shortcuts.map(({ url }) => url), ["./?shortcut=plans", "./?shortcut=field"]);
  [...manifest.icons, ...manifest.screenshots].forEach(({ src }) => assert.equal(existsSync(projectUrl(src.replace(/^\.\//, ""))), true, src));
});

test("P3 service worker keeps the core shell reliable and warms optional Leaflet assets", () => {
  const worker = readProjectFile("service-worker.js");
  assert.ok(worker.includes("Promise.allSettled(OPTIONAL_SHELL"));
  assert.ok(worker.includes("leaflet@1.9.4/dist/leaflet.css"));
  assert.ok(worker.includes("leaflet@1.9.4/dist/leaflet.js"));
  assert.ok(worker.includes("fetchWithTimeout(event.request)"));
  assert.ok(worker.includes("./js/pwa/pwa-runtime.js?v=1"));
});

test("P3 landscape and standalone rules preserve map space and mobile input sizing", () => {
  const css = readProjectFile("css/app.css");
  assert.match(css, /@media \(display-mode: standalone\)/);
  const landscape = css.match(/@media \(orientation: landscape\) and \(max-height: 560px\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(landscape, /\.map-stage[^\{]*\{ height: 100dvh; min-height: 0; \}/);
  assert.match(landscape, /width: min\(390px, 52vw\)/);
  assert.match(landscape, /font-size: 16px/);
  assert.match(css, /scroll-padding-block:/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("dark, light, and red primary and supporting text meet WCAG AA contrast", () => {
  const css = readProjectFile("tokens.css");
  for (const selector of [":root", ':root[data-theme="light"]', ':root[data-theme="red"]']) {
    const tokens = themeTokens(css, selector);
    assert.ok(contrast(tokens.text, tokens.panel) >= 4.5, `${selector} text`);
    assert.ok(contrast(tokens.muted, tokens.panel) >= 4.5, `${selector} muted`);
  }
});
