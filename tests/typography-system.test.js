const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const styles = readFileSync(path.join(root, "styles.css"), "utf8");
const reactEntry = readFileSync(path.join(root, "livestream-react", "main.jsx"), "utf8");

test("intro uses the approved concise Chinese copy", () => {
  assert.match(html, /<span class="hero-name">陈智宇<\/span>/);
  assert.match(html, /<span class="hero-role">影视美术指导·视觉设计师<\/span>/);
  assert.match(html, /<h2 id="statement-title"[^>]*>将抽象概念转化为视觉叙事<\/h2>/);
  assert.doesNotMatch(html, /在影视、空间与制作之间/);
});

test("all long-form sections share label title and descriptor hierarchy", () => {
  assert.match(html, /01 \/ PORTFOLIO[\s\S]*?id="work-title">[\s\S]*?TVC[\s\S]*?<\/h2>[\s\S]*?Film Art Direction/);
  assert.match(html, /02 \/ PORTFOLIO[\s\S]*?id="livestream-title">[\s\S]*?LIVESTREAM[\s\S]*?<\/h2>[\s\S]*?Set Design/);
  assert.match(html, /03 \/ PROFILE[\s\S]*?id="about-section-title">[\s\S]*?ABOUT[\s\S]*?<\/h2>/);
  assert.match(html, /04 \/ CONTACT[\s\S]*?id="contact-title">[\s\S]*?CONTACT[\s\S]*?<\/h2>[\s\S]*?LET'S CREATE VISUAL WORLDS/);
});

test("TVC and livestream labels use the same left-aligned heading flow", () => {
  assert.doesNotMatch(html, /class="works-header\s+film-heading/);
  assert.doesNotMatch(html, /class="livestream-header\s+film-heading/);
  assert.doesNotMatch(styles, /\.cinematic-v2 \.film-heading \.works-kicker/);
});

test("typography tokens unify section headings labels and card metadata", () => {
  assert.match(styles, /--type-section-title:\s*clamp\(/);
  assert.match(styles, /--type-card-title:\s*clamp\(/);
  assert.match(styles, /\.cinematic-v2 \.section-heading \.section-heading-title/);
  assert.match(styles, /\.cinematic-v2 \.section-heading-label/);
  assert.match(styles, /\.cinematic-v2 \.work-meta/);
  assert.match(styles, /\.cinematic-v2 \.livestream-meta h3/);
});

test("section titles mount the Stroke Text treatment without replacing their heading semantics", () => {
  assert.match(html, /id="work-title">\s*<span data-stroke-heading>TVC<\/span>/);
  assert.match(html, /id="livestream-title">\s*<span data-stroke-heading>LIVESTREAM<\/span>/);
  assert.match(html, /id="about-section-title">\s*<span data-stroke-heading>ABOUT<\/span>/);
  assert.match(html, /id="contact-title">\s*<span data-stroke-heading>CONTACT<\/span>/);
  assert.match(reactEntry, /import StrokeText from "\.\/StrokeText\.jsx"/);
  assert.match(reactEntry, /mountStrokeHeadings/);
});

test("TVC metadata uses 14px for its first line and 18px for the work title", () => {
  assert.match(styles, /\.cinematic-v2 \.work-meta-line\s*\{[\s\S]*?font-size:\s*14px;/);
  assert.match(styles, /\.cinematic-v2 \.work-card h3\s*\{[\s\S]*?font-size:\s*18px;/);
});

test("Stroke Text replays when a section title re-enters during reverse scroll", () => {
  const strokeText = readFileSync(path.join(root, "livestream-react", "StrokeText.jsx"), "utf8");
  assert.match(strokeText, /onEnterBack:\s*\(\)\s*=>\s*timeline\.play\(0\)/);
  assert.doesNotMatch(strokeText, /once:\s*true/);
  assert.match(strokeText, /\+=0\.1/);
});
