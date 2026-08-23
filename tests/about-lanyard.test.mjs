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
  assert.match(entry, /getContext\("webgl2"\)/);
});

test("Lanyard keeps desktop interaction but uses a one-shot mobile sway", () => {
  const lanyard = readFileSync(resolve(root, "livestream-react/Lanyard.jsx"), "utf8");
  const lanyardCss = readFileSync(resolve(root, "livestream-react/Lanyard.css"), "utf8");
  assert.match(lanyard, /<MobileBand/);
  assert.match(lanyard, /<Physics[\s\S]*<Band[\s\S]*interactive/);
  assert.match(lanyardCss, /mobile-sway/);
  assert.match(lanyardCss, /animation-iteration-count:\s*1/);
  assert.match(lanyardCss, /prefers-reduced-motion/);
});
