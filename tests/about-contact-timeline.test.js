const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const styles = readFileSync(path.join(root, "styles.css"), "utf8");
const script = readFileSync(path.join(root, "script.js"), "utf8");

function aboutSection() {
  return html.slice(html.indexOf('<section class="about"'), html.indexOf('<section class="content-section contact"'));
}

test("identity copy uses the approved Chinese role while keeping the English name", () => {
  assert.match(html, /陈智宇，影视美术指导·视觉设计师。/);
  assert.match(html, /<span[^>]*>CHEN ZHIYU<\/span>/);
  assert.doesNotMatch(html, /影视美术指导与视觉创作者/);
  assert.doesNotMatch(html, /ART DIRECTION &amp; VISUAL WORLDS/);
});

test("About identity absorbs education and removes the retired method and collaboration blocks", () => {
  const section = aboutSection();
  const identity = section.match(/<div class="about-identity about-reveal">[\s\S]*?<\/div>/)?.[0] || "";

  assert.match(identity, /Education/);
  assert.match(identity, /北京电影学院现代创意媒体学院/);
  assert.match(identity, /视觉艺术系 · 戏剧影视美术设计专业本科/);
  assert.doesNotMatch(section, /视觉方向|空间与制作/);
  assert.doesNotMatch(section, /数字视觉|Digital Visuals/);
  assert.doesNotMatch(section, /about-methods|about-method /);
  assert.doesNotMatch(section, /Selected Collaborations|about-collaborations/);
  assert.doesNotMatch(section, /about-secondary/);
});

test("About keeps the experience timeline label without the visible Chinese heading", () => {
  const section = aboutSection();
  assert.match(section, /<p class="about-label" lang="en">Experience<\/p>/);
  assert.doesNotMatch(section, /<h3 id="experience-title">工作经历<\/h3>/);
});

test("experience is a scroll-progress timeline with stable revealed items", () => {
  assert.match(html, /data-experience-timeline/);
  assert.match(html, /data-timeline-item/);
  assert.match(styles, /\.about-timeline::before\s*\{/);
  assert.match(styles, /--timeline-progress/);
  assert.match(styles, /\.about-timeline-item\.is-visible/);
  assert.match(script, /setupExperienceTimeline/);
  assert.match(script, /--timeline-progress/);
});

test("Contact is a compact closing section instead of a full viewport hero", () => {
  assert.match(styles, /\.cinematic-v2 \.contact \{\s*min-height:\s*clamp\(/);
  const contactMarkup = html.slice(html.indexOf('<section class="content-section contact"'));
  assert.match(contactMarkup, /<p class="contact-role">影视美术指导·视觉设计师<\/p>/);
});
