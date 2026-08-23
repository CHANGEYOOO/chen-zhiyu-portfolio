const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const styles = readFileSync(path.join(root, "styles.css"), "utf8");

test("intro uses the approved concise Chinese copy", () => {
  assert.match(html, /<span class="hero-name">陈智宇<\/span>/);
  assert.match(html, /<span class="hero-role">影视美术指导·视觉设计师<\/span>/);
  assert.match(html, /<h2 id="statement-title"[^>]*>将抽象概念转化为视觉叙事<\/h2>/);
  assert.doesNotMatch(html, /在影视、空间与制作之间/);
});

test("all long-form sections share label title and descriptor hierarchy", () => {
  assert.match(html, /01 \/ PORTFOLIO[\s\S]*?<h2 class="section-heading-title" id="work-title">TVC<\/h2>[\s\S]*?Film Art Direction/);
  assert.match(html, /02 \/ PORTFOLIO[\s\S]*?<h2 class="section-heading-title" id="livestream-title">LIVESTREAM<\/h2>[\s\S]*?Set Design/);
  assert.match(html, /03 \/ PROFILE[\s\S]*?<h2 class="section-heading-title" id="about-section-title">ABOUT<\/h2>/);
  assert.match(html, /04 \/ CONTACT[\s\S]*?<h2 class="section-heading-title" id="contact-title">CONTACT<\/h2>[\s\S]*?LET'S CREATE VISUAL WORLDS/);
});

test("typography tokens unify section headings labels and card metadata", () => {
  assert.match(styles, /--type-section-title:\s*clamp\(/);
  assert.match(styles, /--type-card-title:\s*clamp\(/);
  assert.match(styles, /\.cinematic-v2 \.section-heading \.section-heading-title/);
  assert.match(styles, /\.cinematic-v2 \.section-heading-label/);
  assert.match(styles, /\.cinematic-v2 \.work-meta/);
  assert.match(styles, /\.cinematic-v2 \.livestream-meta h3/);
});
