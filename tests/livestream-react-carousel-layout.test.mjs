import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const styles = readFileSync(resolve(root, "livestream-react/styles.css"), "utf8");
const component = readFileSync(resolve(root, "livestream-react/CircularGallery.jsx"), "utf8");

test("keeps source aspect ratios inside a bounded card envelope", () => {
  assert.match(styles, /--react-card-height:\s*404px/);
  assert.match(styles, /height:\s*var\(--react-gallery-height\)/);
  assert.match(styles, /--react-gallery-height:\s*calc\(var\(--react-card-height\)\s*\+\s*56px\)/);
  assert.match(styles, /--react-card-min-width:\s*0px/);
  assert.match(styles, /--react-card-max-width:\s*100%/);
  assert.match(styles, /width:\s*clamp\(/);
  assert.match(styles, /calc\(var\(--react-card-height\)\s*\*\s*var\(--react-card-ratio\)\)/);
  assert.match(styles, /aspect-ratio:\s*var\(--react-card-ratio\)/);
  assert.match(styles, /height:\s*auto/);
  assert.match(component, /style=\{\{\s*"--react-card-ratio":\s*item\.aspectRatio/);
});

test("keeps wide mobile images inside the carousel while giving portrait images a readable minimum width", () => {
  const mobileRules = styles.match(/@media \(max-width: 768px\) \{[\s\S]*?\n\}/)?.[0] || "";

  assert.match(mobileRules, /--react-card-min-width:\s*min\(44%,\s*160px\)/);
  assert.match(mobileRules, /--react-card-max-width:\s*82%/);
  assert.match(mobileRules, /--react-gallery-height:\s*390px/);
  assert.match(mobileRules, /\.react-circular-gallery-card\s*\{[\s\S]*?bottom:\s*28px/);
});

test("keeps one full-width gallery row per project and aligns project blocks", () => {
  assert.match(styles, /\.livestream-projects\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /\.livestream-projects\s*\{[\s\S]*?align-items:\s*stretch/);
  assert.match(styles, /\.livestream-react-project\s*\{[\s\S]*?height:\s*100%/);
});

test("lets the page keep vertical wheel scrolling when a project has no horizontal overflow", () => {
  assert.match(component, /const canScroll = \(\) => totalWidth > viewportWidth/);
  assert.match(component, /if \(!canScroll\(\)\) return/);
  assert.match(component, /event\.preventDefault\(\)/);
  assert.match(component, /root\.addEventListener\("wheel", onWheel, \{ passive: false \}\)/);
});

test("does not turn a vertical mouse wheel into horizontal gallery movement", () => {
  assert.match(component, /const deltaX = event\.deltaX/);
  assert.match(component, /Math\.abs\(deltaX\) <= Math\.abs\(event\.deltaY\)/);
});

test("renders repeated runtime copies and centers a middle copy before interaction", () => {
  assert.match(component, /const copyCount = data\.length <= 4 \? 8 : 3/);
  assert.match(component, /state\.current = cardCenterOffset\(count \* Math\.floor\(copyCount \/ 2\)\)/);
  assert.match(component, /cards\.forEach\(\(card, index\) =>/);
  assert.match(component, /positions\[index\]/);
  assert.match(component, /aria-hidden=\{index >= data\.length/);
});

test("uses the bottom center as the rotation origin and fans cards outward", () => {
  assert.match(styles, /transform-origin:\s*50%\s+100%/);
  assert.match(component, /const rotation = normalized \* bend \* 3/);
});

test("snaps every variable-width card to the central display position", () => {
  assert.match(component, /const cardCenterOffset = \(index\) =>/);
  assert.match(component, /const cycleWidth = positions\[count\] \|\| totalWidth/);
  assert.match(component, /Math\.round\(\(state\.target - anchor\) \/ cycleWidth\)/);
});

test("lifts and enlarges the card that reaches the central display position", () => {
  assert.match(component, /const focus = clamp\(1 - Math\.abs\(normalized\) \/ 0\.72, 0, 1\)/);
  assert.match(component, /const scale = lerp\(0\.84, 1\.09, depthCurve\)/);
  assert.match(component, /const lift = focus \* 34/);
  assert.match(component, /curve - lift/);
});

test("adds continuous scale, blur, opacity, and z-depth across the carousel", () => {
  assert.match(component, /const depthProgress = clamp\(Math\.abs\(normalized\), 0, 1\)/);
  assert.match(component, /const depthCurve = Math\.pow\(1 - depthProgress, 2\.4\)/);
  assert.match(component, /const scale = lerp\(0\.84, 1\.09, depthCurve\)/);
  assert.match(component, /const depthZ = lerp\(0, -160, depthProgress\)/);
  assert.match(component, /card\.style\.setProperty\("--react-card-depth-blur",/);
  assert.match(component, /card\.style\.opacity = String\(lerp\(0\.72, 1, depthCurve\)\)/);
  assert.match(component, /translate3d\(\$\{x\.toFixed\(2\)\}px, \$\{\(curve - lift\)\.toFixed\(2\)\}px, \$\{depthZ\.toFixed\(2\)\}px\)/);
});

test("keeps desktop and mobile depth blur within the visual budget", () => {
  assert.match(styles, /--react-gallery-max-blur:\s*4px/);
  assert.match(styles, /filter:\s*blur\(calc\(var\(--react-card-depth-blur, 0\) \* var\(--react-gallery-max-blur\)\)\)/);
  assert.match(styles, /@media \(max-width: 768px\)[\s\S]*?--react-gallery-max-blur:\s*2\.5px/);
  assert.match(styles, /perspective:\s*1200px/);
  assert.match(styles, /transform-style:\s*preserve-3d/);
});

test("caches card widths during measurement instead of reading layout every frame", () => {
  assert.match(component, /let cardWidths = \[\]/);
  assert.match(component, /cardWidths\.push\(cardWidth\)/);
  assert.match(component, /const cardWidth = cardWidths\[index\] \|\| firstWidth/);
});

test("measures card layout from untransformed widths before calculating snap positions", () => {
  assert.match(component, /const cardWidth = card\.offsetWidth/);
  assert.match(component, /cursor \+= cardWidth \+ gap/);
  assert.match(component, /firstWidth = cardWidths\[0\] \|\| 0/);
  assert.match(component, /const width = cardWidths\[index\] \|\| firstWidth/);
});

test("keeps the lifted card top and curved shadows visible without horizontal bleed", () => {
  assert.match(styles, /\.react-circular-gallery\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(styles, /clip-path:\s*inset\(-64px 0 -24px 0\)/);
});
