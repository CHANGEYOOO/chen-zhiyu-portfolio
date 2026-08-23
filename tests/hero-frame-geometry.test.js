const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const styles = readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

test("hero and statement faces share the same responsive video-frame geometry", () => {
  assert.match(
    styles,
    /\.cinematic-v2 \.hero \.panel-frame,\s*\.cinematic-v2 \.statement \.panel-frame\s*\{[\s\S]*?--hero-frame-progress/,
  );
  assert.match(styles, /calc\(var\(--hero-frame-top\) \* var\(--hero-frame-progress\)\)/);
  assert.match(styles, /calc\(var\(--hero-frame-bottom\) \* var\(--hero-frame-progress\)\)/);
});
