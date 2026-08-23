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

test("Lanyard uses the React Bits physics scene on desktop", () => {
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

test("Lanyard model and rope texture are embedded for external browsers opening a local file", () => {
  const lanyard = readFileSync(resolve(root, "livestream-react/Lanyard.jsx"), "utf8");
  const viteConfig = readFileSync(resolve(root, "vite.livestream.config.mjs"), "utf8");
  assert.match(lanyard, /import cardGLB from "\.\.\/assets\/react\/card\.glb"/);
  assert.match(lanyard, /import lanyard from "\.\.\/assets\/react\/lanyard\.png"/);
  assert.match(viteConfig, /assetsInclude:\s*\["\*\*\/\*\.glb"\]/);
  assert.match(viteConfig, /assetsInlineLimit:\s*4 \* 1024 \* 1024/);
  assert.doesNotMatch(lanyard, /const cardGLB = "assets\//);
  assert.doesNotMatch(lanyard, /const lanyard = "assets\//);
});

test("mobile does not mount WebGL and always exposes the portrait fallback", () => {
  const styles = readFileSync(resolve(root, "styles.css"), "utf8");
  assert.match(entry, /matchMedia\("\(max-width: 768px\)"\)\.matches/);
  assert.match(styles, /@media \(max-width: 768px\) \{[\s\S]*?\.about-lanyard\s*\{[\s\S]*?display:\s*none/);
  assert.match(styles, /@media \(max-width: 768px\) \{[\s\S]*?\.about-portrait-fallback\s*\{[\s\S]*?visibility:\s*visible\s*!important/);
});
