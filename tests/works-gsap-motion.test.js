const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const script = readFileSync(path.join(root, "script.js"), "utf8");
const styles = readFileSync(path.join(root, "styles.css"), "utf8");

test("loads local GSAP before the portfolio script", () => {
  const gsapIndex = html.indexOf('assets/vendor/gsap.min.js');
  const scrollTriggerIndex = html.indexOf('assets/vendor/ScrollTrigger.min.js');
  const siteScriptIndex = html.indexOf('src="script.js');

  assert.ok(gsapIndex >= 0, "GSAP must be vendored locally");
  assert.ok(scrollTriggerIndex > gsapIndex, "ScrollTrigger must load after GSAP");
  assert.ok(siteScriptIndex > scrollTriggerIndex, "site script must load after GSAP plugins");
});

test("TVC motion uses GSAP once-only entrances and desktop pointer depth", () => {
  assert.match(script, /function setupWorksGsapMotion\(/);
  assert.match(script, /gsap\.registerPlugin\(ScrollTrigger\)/);
  assert.match(script, /once:\s*true/);
  assert.match(script, /quickTo\(/);
  assert.match(script, /\(hover: hover\) and \(pointer: fine\)/);
});

test("TVC motion reveals and focuses one complete row without oversized scaling", () => {
  assert.match(script, /const rowSize = mobile \? 1 : 2/);
  assert.match(script, /scale:\s*0\.97/);
  assert.match(script, /scale:\s*isActive \? 1\.018 : 1/);
  assert.match(script, /let activeFocusRow = \[\]/);
  assert.doesNotMatch(script, /scale:\s*mobile \? 0\.94 : 0\.9/);
  assert.doesNotMatch(script, /scale:\s*isActive \? 1\.045 : 1/);
});

test("TVC initializes every row once and only toggles hidden trigger state", () => {
  assert.match(script, /function playWorksRow\(row, direction\)/);
  assert.match(script, /onEnter:\s*\(\) => record\.enabled && playWorksRow\(row, 1\)/);
  assert.match(script, /onEnterBack:\s*\(\) => record\.enabled && playWorksRow\(row, -1\)/);
  assert.match(script, /onUpdate:\s*\(self\) => record\.enabled && setFocusRow\(row, self\.isActive\)/);
  assert.doesNotMatch(script, /onLeave:\s*\(\) => resetWorksRow\(row\)/);
  assert.doesNotMatch(script, /onLeaveBack:\s*\(\) => resetWorksRow\(row\)/);
  assert.match(script, /schedulePortfolioExpansion\(refreshWorksMotion, expanded\)/);
  assert.match(script, /const cards = \[\.\.\.works\.querySelectorAll\("\.work-card"\)\]/);
  assert.match(script, /function createWorksRecordTriggers\(record\)/);
  assert.match(script, /if \(!record\.entranceTrigger\) createWorksRecordTriggers\(record\)/);
  assert.match(script, /function setWorksRecordEnabled\(record, enabled\)/);
  assert.match(script, /record\.entranceTrigger\?\.disable\(true, false\)/);
  assert.match(script, /record\.entranceTrigger\.enable\(true, false\)/);
  assert.match(script, /function hasLayoutBox\(element\)/);
  assert.match(script, /element\.getClientRects\(\)\.length > 0/);
  assert.doesNotMatch(script, /offsetParent !== null/);
  assert.doesNotMatch(script, /unregisterHiddenRows/);
  assert.doesNotMatch(script, /newRows/);
});

test("TVC metadata uses the same entrance distance and duration as livestream metadata", () => {
  assert.match(script, /function playWorksRow[\s\S]*?y:\s*direction \* 26[\s\S]*?duration:\s*0\.54/);
  assert.match(script, /function playLivestreamProject[\s\S]*?y:\s*scrollDirection \* 26[\s\S]*?duration:\s*0\.54/);
});

test("livestream motion enhances projects without taking over gallery scrolling", () => {
  assert.match(script, /function setupLivestreamGsapMotion\(/);
  assert.match(script, /livestream-project/);
  assert.doesNotMatch(script, /ScrollTrigger[^\n]*horizontal:\s*true/);
  assert.doesNotMatch(script, /containerAnimation/);
});

test("livestream initializes every project once and only toggles hidden trigger state", () => {
  assert.match(script, /let refreshLivestreamMotion = \(\) => \{\}/);
  assert.match(script, /function createLivestreamRecordTriggers\(record\)/);
  assert.match(script, /if \(!record\.entranceTrigger\) createLivestreamRecordTriggers\(record\)/);
  assert.match(script, /function setLivestreamRecordEnabled\(record, enabled\)/);
  assert.match(script, /onEnter:\s*\(\) => record\.enabled && playLivestreamProject\(project, direction, 1\)/);
  assert.match(script, /onEnterBack:\s*\(\) => record\.enabled && playLivestreamProject\(project, direction, -1\)/);
  assert.match(script, /onUpdate:\s*\(self\) => setLivestreamFocus\(record, self\.isActive\)/);
  assert.doesNotMatch(script, /onLeave:\s*\(\) => resetLivestreamProject\(project\)/);
  assert.doesNotMatch(script, /onLeaveBack:\s*\(\) => resetLivestreamProject\(project\)/);
  assert.match(script, /schedulePortfolioExpansion\(refreshLivestreamMotion, expanded\)/);
  assert.match(script, /record\.entranceTrigger\?\.disable\(true, false\)/);
  assert.match(script, /record\.entranceTrigger\.enable\(true, false\)/);
  assert.match(script, /setLivestreamRecordEnabled\(record, hasLayoutBox\(record\.project\)\)/);
  assert.doesNotMatch(script, /unregisterHiddenProjects/);
  assert.doesNotMatch(script, /newProjects/);
});

test("portfolio expansion preserves registered motion and performs one ordered layout refresh", () => {
  assert.match(script, /function schedulePortfolioExpansion\(refreshMotion, expanded\)[\s\S]*?ScrollTrigger\?\.refresh\(\)[\s\S]*?refreshMotion\(expanded\)[\s\S]*?ScrollTrigger\?\.sort\(\)[\s\S]*?ScrollTrigger\?\.refresh\(\)/);
  assert.doesNotMatch(script, /suspendAboutStackedEntrance/);
  assert.doesNotMatch(script, /registeredRows\.delete/);
  assert.doesNotMatch(script, /registeredProjects\.delete/);

  const worksMotion = script.slice(script.indexOf("function setupWorksGsapMotion"), script.indexOf("function setupLivestreamGsapMotion"));
  const livestreamMotion = script.slice(script.indexOf("function setupLivestreamGsapMotion"), script.indexOf("function setupPortfolioGsapMotion"));
  assert.doesNotMatch(worksMotion, /ScrollTrigger\.refresh\(\)/);
  assert.doesNotMatch(livestreamMotion, /ScrollTrigger\.refresh\(\)/);
});

test("initial async hydration registers portfolio motion before the global layout refresh", () => {
  assert.match(
    script,
    /Promise\.allSettled\(\[tvcHydrationPromise, livestreamHydrationPromise\]\)[\s\S]*?setupPortfolioGsapMotion\(\)[\s\S]*?ScrollTrigger\?\.sort\(\)[\s\S]*?ScrollTrigger\?\.refresh\(\)/,
  );
});

test("livestream card triggers remain independent from About", () => {
  const livestreamMotion = script.slice(script.indexOf("function setupLivestreamGsapMotion"), script.indexOf("function setupPortfolioGsapMotion"));
  assert.doesNotMatch(livestreamMotion, /pinnedContainer:/);
});

test("motion has a reduced-motion path and only promotes animated surfaces", () => {
  assert.match(script, /prefers-reduced-motion:\s*reduce/);
  assert.match(styles, /\.gsap-works-ready[\s\S]*will-change:\s*transform, opacity/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.gsap-works-ready/);
});
