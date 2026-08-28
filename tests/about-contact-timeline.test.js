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
  assert.match(html, /<span class="hero-name">陈智宇<\/span>/);
  assert.match(html, /<span class="hero-role">影视美术指导·视觉设计师<\/span>/);
  assert.match(html, /<span[^>]*>CHEN ZHIYU<\/span>/);
  assert.doesNotMatch(html, /影视美术指导与视觉创作者/);
  assert.doesNotMatch(html, /ART DIRECTION &amp; VISUAL WORLDS/);
});

test("About identity absorbs education and removes the retired method and collaboration blocks", () => {
  const section = aboutSection();
  const identity = section.match(/<div class="about-identity">[\s\S]*?<\/div>/)?.[0] || "";

  assert.match(identity, /Education/);
  assert.match(identity, /北京电影学院现代创意媒体学院/);
  assert.match(identity, /视觉艺术系 · 戏剧影视美术设计专业本科/);
  assert.doesNotMatch(section, /视觉方向|空间与制作/);
  assert.doesNotMatch(section, /数字视觉|Digital Visuals/);
  assert.doesNotMatch(section, /about-methods|about-method /);
  assert.doesNotMatch(section, /Selected Collaborations|about-collaborations/);
  assert.doesNotMatch(section, /about-secondary/);
});

test("About keeps the typed experience timeline label without the visible Chinese heading", () => {
  const section = aboutSection();
  assert.match(section, /<p class="about-label" lang="en" data-about-text-type>Experience<\/p>/);
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

test("timeline rail and dots use one shared horizontal coordinate on every breakpoint", () => {
  assert.match(styles, /--timeline-rail-x:\s*6px/);
  assert.match(styles, /left:\s*var\(--timeline-rail-x\)/);
  assert.match(styles, /left:\s*calc\(var\(--timeline-rail-x\)\s*-\s*var\(--timeline-indent\)\s*-\s*5px\)/);
  assert.doesNotMatch(styles, /\.about-timeline-item::before\s*\{\s*left:\s*-35px/);
});

test("About remains one independent card before its separate experience timeline", () => {
  const section = aboutSection();
  const stageStart = section.indexOf('data-about-stage');
  const experienceStart = section.indexOf('class="about-experience"');

  assert.match(section, /data-about-arrival/);
  assert.ok(stageStart >= 0, "About needs a full-card arrival stage");
  assert.ok(experienceStart > stageStart, "Experience must remain below the full About card");
  assert.match(section, /class="about-portrait about-lanyard-anchor"/);
  assert.match(styles, /\.cinematic-v2 \.about-arrival\s*\{[\s\S]*?min-height:\s*auto/);
  assert.match(styles, /\.cinematic-v2 \.about-stage\s*\{[\s\S]*?position:\s*relative[\s\S]*?top:\s*auto/);
  assert.match(styles, /\.cinematic-v2 \.about-lanyard-anchor\s*\{[\s\S]*?top:\s*0/);
  assert.match(script, /setupAboutCardEntrance/);
});

test("About no longer pins, scales, or owns the livestream scroll state", () => {
  assert.doesNotMatch(html, /data-about-transition-source/);
  assert.doesNotMatch(script, /pin:\s*livestream/);
  assert.doesNotMatch(script, /pinSpacing:/);
  assert.doesNotMatch(script, /portfolioSurfaces/);
  assert.doesNotMatch(script, /scale:\s*0\.92/);
  assert.match(styles, /\.cinematic-v2 \.about-lanyard-anchor\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(styles, /\.cinematic-v2 \.about-lanyard-anchor\s*\{[\s\S]*?inset:\s*0/);
});

test("About card remains the only isolated surface above the outgoing livestream", () => {
  assert.match(styles, /\.cinematic-v2 \.about-stage\s*\{[\s\S]*?background:\s*var\(--page-background\)/);
  assert.match(styles, /\.cinematic-v2 \.about-experience-wrap\s*\{[\s\S]*?position:\s*relative[\s\S]*?z-index:\s*2/);
});

test("only the About card keeps the page-background surface", () => {
  const aboutSurface = [...styles.matchAll(/\.cinematic-v2 \.about \{[^}]*\}/g)].at(-1)?.[0] || "";
  const experienceSurface = [...styles.matchAll(/\.cinematic-v2 \.about-experience-wrap \{[^}]*\}/g)].at(-1)?.[0] || "";

  assert.doesNotMatch(aboutSurface, /background:\s*var\(--page-background\)/);
  assert.doesNotMatch(experienceSurface, /background:\s*var\(--page-background\)/);
  assert.match(styles, /\.cinematic-v2 \.about-stage\s*\{[\s\S]*?background:\s*var\(--page-background\)/);
  assert.doesNotMatch(styles, /\.about-timeline-item:last-child\s*\{[\s\S]*?border-bottom:/);
});

test("mobile puts the static portrait after About copy instead of mounting the lanyard", () => {
  assert.match(styles, /@media \(max-width: 768px\) \{[\s\S]*?\.cinematic-v2 \.about-lanyard-anchor\s*\{[\s\S]*?position:\s*relative[\s\S]*?top:\s*auto/);
  assert.match(styles, /@media \(max-width: 768px\) \{[\s\S]*?\.cinematic-v2 \.about-lanyard-anchor\s*\{[\s\S]*?width:\s*100%/);
  assert.match(styles, /@media \(max-width: 768px\) \{[\s\S]*?\.cinematic-v2 \.about-lanyard-anchor\s*\{[\s\S]*?aspect-ratio:\s*3\s*\/\s*5/);
});

test("only the About card keeps a page surface while the other sections stay transparent", () => {
  assert.match(styles, /\.cinematic-v2 \.intro-sequence,[\s\S]*?\.cinematic-v2 \.contact\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(styles, /\.cinematic-v2 \.about-stage\s*\{[\s\S]*?background:\s*var\(--page-background\)/);
});

test("Contact is a compact closing section instead of a full viewport hero", () => {
  assert.match(styles, /\.cinematic-v2 \.contact \{\s*min-height:\s*clamp\(/);
  const contactMarkup = html.slice(html.indexOf('<section class="content-section contact"'));
  assert.match(contactMarkup, /<p class="contact-role">影视美术指导·视觉设计师<\/p>/);
});
