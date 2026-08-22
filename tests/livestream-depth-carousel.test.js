const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const script = readFileSync(path.join(root, "script.js"), "utf8");
const styles = readFileSync(path.join(root, "styles.css"), "utf8");
const data = JSON.parse(readFileSync(path.join(root, "assets/data/livestream-projects.json"), "utf8"));

test("live projects keep the JSON source order and render one depth carousel per project", () => {
  assert.equal(data.length, 8);
  assert.match(script, /function createLivestreamProject\(project, projectIndex, imageDimensions\)/);
  assert.match(script, /project\.images\.forEach\(/);
  assert.match(script, /depth-carousel/);
  assert.match(script, /data-depth-card/);
  assert.match(script, /setupDepthCarousel/);
});

test("depth carousel supports controls and drag without autoplay", () => {
  assert.match(script, /data-depth-direction/);
  assert.match(script, /ArrowLeft/);
  assert.match(script, /setPointerCapture/);
  assert.match(script, /data-depth-dot/);
  assert.doesNotMatch(script, /autoplayDelay|setInterval\(/);
});

test("depth carousel cards preserve image proportions instead of cropping", () => {
  assert.match(styles, /\.depth-carousel-card img\s*\{[\s\S]*?object-fit:\s*contain/);
  assert.match(styles, /\.depth-carousel-card\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(styles, /\.depth-carousel-controls\s*\{[\s\S]*?backdrop-filter:\s*blur/);
});

test("live projects use one full-width row on desktop and mobile", () => {
  assert.match(styles, /\.cinematic-v2 \.livestream-projects\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 768px\)[\s\S]*?\.cinematic-v2 \.livestream-projects\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});
