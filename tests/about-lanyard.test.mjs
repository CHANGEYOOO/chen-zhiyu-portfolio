import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const html = readFileSync(resolve(root, "index.html"), "utf8");
const entry = readFileSync(resolve(root, "livestream-react/main.jsx"), "utf8");

test("About exposes an isolated Lanyard mount while retaining the portrait fallback", () => {
  assert.match(html, /data-about-lanyard/);
  assert.match(html, /data-lanyard-fallback/);
  assert.match(entry, /import Lanyard from "\.\/Lanyard\.jsx"/);
  assert.match(entry, /mountAboutLanyard/);
  assert.match(entry, /setAboutLanyardActive/);
  assert.match(entry, /getContext\("webgl2"\)/);
});

test("Lanyard uses one React Bits physics scene on desktop and mobile", () => {
  const lanyard = readFileSync(resolve(root, "livestream-react/Lanyard.jsx"), "utf8");
  assert.doesNotMatch(lanyard, /function MobileBand/);
  assert.match(lanyard, /<Physics[\s\S]*<Band[\s\S]*isMobile/);
  assert.match(lanyard, /active = false/);
  assert.match(lanyard, /is-lanyard-active/);
  assert.match(lanyard, /getDragTarget/);
  assert.doesNotMatch(lanyard, /getVisibleDragBounds/);
  assert.doesNotMatch(lanyard, /rubberBandLimit/);
  assert.doesNotMatch(lanyard, /shouldSleepLanyard/);
});

test("Lanyard assets stay relative when the portfolio is opened from a local file", () => {
  const lanyard = readFileSync(resolve(root, "livestream-react/Lanyard.jsx"), "utf8");
  assert.doesNotMatch(lanyard, /const cardGLB = "\//);
  assert.doesNotMatch(lanyard, /const lanyard = "\//);
});
