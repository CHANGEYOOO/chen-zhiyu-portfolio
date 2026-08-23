const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const styles = readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const script = readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const html = readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("hero frame uses a scroll progress for the full-bleed to rounded transition", () => {
  assert.match(styles, /\.cinematic-v2 \.hero \.panel-frame,\s*\.cinematic-v2 \.statement \.panel-frame\s*\{[\s\S]*?--hero-frame-progress/);
  assert.match(styles, /inset:\s*calc\(var\(--hero-frame-top\)\s*\*\s*var\(--hero-frame-progress\)\)/);
  assert.match(styles, /border-radius:\s*calc\(20px\s*\*\s*var\(--hero-frame-progress\)\)/);
  assert.match(styles, /box-shadow:[\s\S]*?calc\(0\.3\s*\*\s*var\(--hero-frame-progress\)\)/);
  assert.match(script, /heroFrameEnd/);
  assert.match(script, /--hero-frame-progress/);
});

test("navigation color and logo filter share the hero transition progress", () => {
  assert.match(styles, /\.cinematic-v2 \.site-header nav[\s\S]*?color:\s*var\(--hero-nav-color/);
  assert.match(styles, /\.cinematic-v2 \.site-header \.brand img[\s\S]*?invert\(var\(--hero-logo-invert/);
  assert.match(script, /--hero-nav-color/);
  assert.match(script, /--hero-logo-invert/);
});

test("hero-to-statement transition follows one scroll progress without hijacking the wheel", () => {
  assert.doesNotMatch(script, /handleIntroWheel/);
  assert.doesNotMatch(script, /scrollToIntroFlipBoundary/);
  assert.doesNotMatch(script, /window\.addEventListener\(["']wheel["']/);
  assert.match(script, /introRawFlipProgress/);
  assert.match(script, /introDisplayedFlipProgress/);
  assert.match(script, /introSnapSide/);
  assert.match(styles, /--intro-flip-progress/);
  assert.match(styles, /rotateX\(var\(--intro-flip-angle-x/);
  assert.match(script, /displayedFlipProgress \* 180/);
});

test("the existing full-bleed shrink remains before the scroll-linked card flip", () => {
  assert.match(script, /heroFrameEnd/);
  assert.match(script, /--hero-frame-progress/);
  assert.match(script, /flipStart/);
  assert.match(script, /flipEnd/);
  assert.match(styles, /transform-origin:\s*50%\s+50%/);
});

test("card flip adds perspective depth and a restrained mid-flip scale", () => {
  assert.match(styles, /perspective:\s*1600px/);
  assert.match(styles, /\.media-panel\s*\{[\s\S]*?overflow:\s*visible;[\s\S]*?transform-style:\s*preserve-3d;/);
  assert.match(styles, /translateZ\(var\(--intro-card-depth\)\)/);
  assert.match(styles, /scale\(var\(--intro-card-scale\)\)/);
  assert.match(script, /--intro-card-depth/);
  assert.match(script, /--intro-card-scale/);
});

test("intro cards are the front and back faces of one 180 degree flip card", () => {
  assert.match(html, /<div class="intro-flip-card" data-intro-flip-card>/);
  assert.match(styles, /\.intro-flip-card\s*\{[\s\S]*?transform-style:\s*preserve-3d;/);
  assert.match(styles, /\.intro-flip-card\s*\{[\s\S]*?rotateX\(var\(--intro-flip-angle-x\)\)/);
  assert.match(styles, /\.statement\s*\{[\s\S]*?rotateX\(180deg\)/);
});

test("faces fade around the edge-on point instead of drawing a persistent 90 degree edge", () => {
  assert.match(styles, /\.has-js \.media-panel\.hero\s*\{[\s\S]*?opacity:\s*var\(--hero-face-opacity/);
  assert.match(styles, /\.has-js \.media-panel\.statement\s*\{[\s\S]*?opacity:\s*var\(--statement-face-opacity/);
  assert.match(script, /--hero-face-opacity/);
  assert.match(script, /--statement-face-opacity/);
});

test("each copy is printed inside its own video card and the hero English name is removed", () => {
  const hero = html.match(/<article class="media-panel hero"[\s\S]*?<\/article>/)?.[0] || "";
  const statement = html.match(/<article class="media-panel statement"[\s\S]*?<\/article>/)?.[0] || "";

  assert.match(hero, /<div class="panel-frame">[\s\S]*?<div class="panel-copy hero-copy"/);
  assert.match(statement, /<div class="panel-frame">[\s\S]*?<div class="panel-copy statement-copy"/);
  assert.doesNotMatch(hero, /CHEN ZHIYU/);
  assert.doesNotMatch(html, /data-copy-stage/);
});

test("hero and statement primary copy use one shared responsive type size", () => {
  assert.match(
    styles,
    /\.cinematic-v2 \.hero-copy h1,\s*\.cinematic-v2 \.statement-copy h2\s*\{[\s\S]*?font-size:\s*clamp\(/,
  );
});

test("hero and statement media cards have no pause controls", () => {
  const intro = html.match(/<section[^>]+data-intro-sequence[\s\S]*?<section\s+class="works"/)?.[0] || "";
  assert.doesNotMatch(intro, /data-video-toggle/);
  assert.doesNotMatch(intro, /data-autoplay-note/);
});

test("hero text uses scroll-distance easing and a distance buffer before the 180 degree flip", () => {
  assert.match(script, /introDisplayedHeroTextProgress/);
  assert.match(script, /heroTextHoldEnd/);
  assert.match(script, /heroTextHoldDistance/);
  assert.match(script, /smoothstep\(0, 1, targetFirstReveal\)/);
  assert.match(script, /const heroTextReady =\s*distance >= introMetrics\.heroTextHoldEnd/);
  assert.doesNotMatch(script, /introHeroTextCompletedAt/);
  assert.doesNotMatch(script, /introLastHeroTextFrameTime/);
  assert.doesNotMatch(script, /heroTextHoldDuration/);
  assert.match(script, /revealCopy\(copies\[0\], displayedHeroTextProgress\)/);
});

test("GSAP choreographs the approved preload, 184 degree overshoot, and 180 degree snap", () => {
  assert.match(script, /function setupIntroGsapFlip\(/);
  assert.match(script, /gsap\.timeline\(\{\s*paused:\s*true/);
  assert.match(script, /--intro-card-scale["']:\s*0\.965/);
  assert.match(script, /\[flipAngleProperty\]:\s*"184deg"/);
  assert.match(script, /\[flipAngleProperty\]:\s*"180deg"/);
  assert.match(script, /--intro-edge-highlight-opacity/);
});

test("the flip uses a longer scroll range and only snaps near either endpoint", () => {
  assert.match(script, /scrollDistance \* 0\.72/);
  assert.match(script, /function getIntroSnapSide\(progress\)/);
  assert.match(script, /progress <= 0\.18/);
  assert.match(script, /progress >= 0\.82/);
  assert.match(script, /introSnapSide = getIntroSnapSide\(introRawFlipProgress\)/);
  assert.doesNotMatch(script, /introRawFlipProgress < 0\.5 \? 0 : 1/);
});

test("the two main flip halves use an even ease so the middle rotation stays visible", () => {
  const evenFlipHalves = script.match(/\[flipAngleProperty\]:[\s\S]{0,220}?ease:\s*"power1\.inOut"/g) || [];
  assert.equal(evenFlipHalves.length, 2);
});

test("the restrained edge highlight only belongs to the intro flip card", () => {
  assert.match(styles, /--intro-edge-highlight-opacity:\s*0/);
  assert.match(styles, /\.intro-flip-card::after\s*\{[\s\S]*?opacity:\s*var\(--intro-edge-highlight-opacity\)/);
  assert.match(styles, /\.intro-flip-card::after\s*\{[\s\S]*?pointer-events:\s*none/);
});

test("intro copy reveals as one top-to-bottom mask instead of per-character opacity", () => {
  assert.match(script, /function revealCopy\(copy, progress\)/);
  assert.match(script, /--copy-reveal-bottom/);
  assert.match(script, /revealCopy\(copies\[0\], displayedHeroTextProgress\)/);
  assert.match(script, /revealCopy\(copies\[1\], secondReveal\)/);
  assert.doesNotMatch(script, /prepareCharacters\(/);
  assert.doesNotMatch(script, /revealCharacters\(/);
  assert.match(styles, /clip-path:\s*inset\(0 0 var\(--copy-reveal-bottom, 100%\) 0\)/);
});

test("mobile flips around the vertical axis while desktop keeps the horizontal axis", () => {
  assert.match(styles, /rotateX\(var\(--intro-flip-angle-x\)\)[\s\S]*rotateY\(var\(--intro-flip-angle-y\)\)/);
  assert.match(styles, /@media \(max-width:\s*768px\)[\s\S]*?\.statement\s*\{[\s\S]*?rotateY\(180deg\)/);
  assert.match(script, /mobileIntroFlip\.matches\s*\?\s*"--intro-flip-angle-y"\s*:\s*"--intro-flip-angle-x"/);
});
