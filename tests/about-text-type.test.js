const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const script = readFileSync(path.join(root, "script.js"), "utf8");
const reactEntry = readFileSync(path.join(root, "livestream-react", "main.jsx"), "utf8");
const textType = readFileSync(path.join(root, "livestream-react", "TextType.jsx"), "utf8");

test("About types its non-name copy on visibility while preserving the static name", () => {
  const aboutMarkup = html.match(/<section class="about"[\s\S]*?<\/section>\s*<section class="content-section contact"/)[0];

  assert.match(aboutMarkup, /data-about-text-type/);
  assert.doesNotMatch(aboutMarkup.match(/<h3 class="about-name"[\s\S]*?<\/h3>/)[0], /data-about-text-type/);
  assert.match(script, /mountAboutTextType/);
  assert.match(reactEntry, /import TextType from "\.\/TextType\.jsx"/);
});

test("About TextType resets after leaving the viewport so reverse scrolling replays it", () => {
  assert.match(textType, /setVisible\(entry\.isIntersecting\)/);
  assert.match(textType, /if \(entry\.isIntersecting\) setCount\(0\)/);
  assert.doesNotMatch(textType, /setVisible\(true\);\s*observer\.disconnect\(\);/);
});
