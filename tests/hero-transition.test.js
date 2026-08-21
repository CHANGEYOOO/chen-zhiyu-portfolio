const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const styles = readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const script = readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

test("hero frame uses a scroll progress for the full-bleed to rounded transition", () => {
  assert.match(styles, /\.cinematic-v2 \.hero \.panel-frame\s*\{[\s\S]*?--hero-frame-progress/);
  assert.match(styles, /inset:\s*calc\(var\(--hero-frame-top\)\s*\*\s*var\(--hero-frame-progress\)\)/);
  assert.match(styles, /border-radius:\s*calc\(20px\s*\*\s*var\(--hero-frame-progress\)\)/);
  assert.match(styles, /box-shadow:[\s\S]*?calc\(0\.3\s*\*\s*var\(--hero-frame-progress\)\)/);
  assert.match(script, /heroFrameEnd/);
  assert.match(script, /--hero-frame-progress/);
});

test("navigation color and logo filter share the hero transition progress", () => {
  assert.match(styles, /\.cinematic-v2 \.site-header nav[\s\S]*?color:\s*var\(--hero-nav-color/);
  assert.match(styles, /\.cinematic-v2 \.site-header \.brand img[\s\S]*?invert\(var\(--hero-logo-invert/);
  assert.match(script, /--hero-nav-color/);
  assert.match(script, /--hero-logo-invert/);
});
