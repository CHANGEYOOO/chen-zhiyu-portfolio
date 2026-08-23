const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const styles = readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

function ruleBody(pattern) {
  const match = styles.match(pattern);
  assert.ok(match, `Missing CSS rule: ${pattern}`);
  return match[1];
}

test("root scrolling cannot expose horizontal canvas space on mobile", () => {
  const html = ruleBody(/(?:^|\n)html\s*\{([^}]*)\}/);
  const body = ruleBody(/(?:^|\n)body\s*\{([^}]*)\}/);

  assert.match(html, /overflow-x\s*:\s*hidden/);
  assert.match(body, /overflow-x\s*:\s*hidden/);
});

test("scroll reveal does not clip media shadows", () => {
  const hiddenReveal = ruleBody(
    /\.cinematic-v2 \.works-motion-ready \.works-reveal,[\s\S]*?\.cinematic-v2 \.contact-motion-ready \.contact-reveal\s*\{([^}]*)\}/,
  );
  const visibleReveal = ruleBody(
    /\.cinematic-v2 \.works-motion-ready \.works-reveal\.is-visible,[\s\S]*?\.cinematic-v2 \.contact-motion-ready \.contact-reveal\.is-visible\s*\{([^}]*)\}/,
  );

  assert.doesNotMatch(hiddenReveal, /clip-path\s*:/);
  assert.doesNotMatch(visibleReveal, /clip-path\s*:/);
});

test("TVC cards separate the shadow, crop, and control layers", () => {
  const card = ruleBody(/(?:^|\n)\.work-card\s*\{([^}]*)\}/);
  const shadow = ruleBody(/(?:^|\n)\.work-card::before\s*\{([^}]*)\}/);
  const poster = ruleBody(/(?:^|\n)\.work-poster\s*\{([^}]*)\}/);
  const play = ruleBody(/(?:^|\n)\.work-play\s*\{([^}]*)\}/);
  const meta = ruleBody(/(?:^|\n)\.work-meta\s*\{([^}]*)\}/);

  assert.match(card, /overflow\s*:\s*visible/);
  assert.match(card, /isolation\s*:\s*isolate/);
  assert.match(shadow, /z-index\s*:\s*0/);
  assert.match(poster, /overflow\s*:\s*hidden/);
  assert.match(poster, /z-index\s*:\s*1/);
  assert.match(play, /z-index\s*:\s*2/);
  assert.match(meta, /z-index\s*:\s*1/);
});

test("livestream and portrait surfaces keep shadows outside crop owners", () => {
  const livestream = ruleBody(/(?:^|\n)\.livestream\s*\{([^}]*)\}/);
  const project = ruleBody(/(?:^|\n)\.livestream-project\s*\{([^}]*)\}/);
  const carousel = ruleBody(/(?:^|\n)\.livestream-carousel\s*\{([^}]*)\}/);
  const meta = ruleBody(/(?:^|\n)\.livestream-meta\s*\{([^}]*)\}/);
  const contact = ruleBody(/(?:^|\n)\.contact\s*\{([^}]*)\}/);
  const portrait = ruleBody(/(?:^|\n)\.cinematic-v2 \.about-portrait\s*\{([^}]*)\}/);

  assert.doesNotMatch(livestream, /overflow\s*:\s*clip/);
  assert.match(project, /overflow\s*:\s*visible/);
  assert.match(project, /isolation\s*:\s*isolate/);
  assert.match(carousel, /z-index\s*:\s*1/);
  assert.match(meta, /z-index\s*:\s*1/);
  assert.doesNotMatch(contact, /overflow\s*:\s*clip/);
  assert.match(portrait, /overflow\s*:\s*visible/);
  assert.match(portrait, /isolation\s*:\s*isolate/);
});
