const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const styles = readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

test("statement keeps the hero's final frame geometry without joining its shrink progress", () => {
  assert.match(styles, /\.cinematic-v2 \.hero \.panel-frame\s*\{[\s\S]*?--hero-frame-progress/);
  assert.match(
    styles,
    /\.cinematic-v2 \.statement \.panel-frame\s*\{[\s\S]*?inset:\s*var\(--hero-frame-top\)\s*var\(--hero-frame-right\)\s*var\(--hero-frame-bottom\)\s*var\(--hero-frame-left\)/,
  );
  assert.match(styles, /\.cinematic-v2 \.statement \.panel-frame\s*\{[\s\S]*?border-radius:\s*20px/);
  assert.doesNotMatch(
    styles,
    /\.cinematic-v2 \.statement \.panel-frame\s*\{[\s\S]*?--hero-frame-progress/,
  );
  assert.match(styles, /calc\(var\(--hero-frame-top\) \* var\(--hero-frame-progress\)\)/);
  assert.match(styles, /calc\(var\(--hero-frame-bottom\) \* var\(--hero-frame-progress\)\)/);
});
