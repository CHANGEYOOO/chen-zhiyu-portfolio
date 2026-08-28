const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const styles = readFileSync(path.join(root, "styles.css"), "utf8");
const textTypeStyles = readFileSync(path.join(root, "livestream-react", "TextType.css"), "utf8");

test("TextType inherits host typography without recursively shrinking nested spans", () => {
  assert.doesNotMatch(styles, /\.contact-name span\s*,\s*\.contact-role span/);
  assert.doesNotMatch(styles, /\.about-role span:last-child/);
  assert.match(styles, /\.contact-name\s*>\s*\[data-text-type\]/);
  assert.match(textTypeStyles, /\.text-type,\s*\.text-type__content\s*\{[\s\S]*?font-size:\s*inherit;/);
  assert.match(textTypeStyles, /\.text-type,\s*\.text-type__content\s*\{[\s\S]*?line-height:\s*inherit;/);
  assert.match(textTypeStyles, /\.text-type,\s*\.text-type__content\s*\{[\s\S]*?letter-spacing:\s*inherit;/);
}
);

test("mobile About and Contact define a stable typography and spacing rhythm", () => {
  assert.match(styles, /\/\* Revision 83: stable mobile About and Contact typography\. \*\/[\s\S]*?@media \(max-width: 768px\)/);
  assert.match(styles, /\.cinematic-v2 \.about-stage \.about-role\s*\{[\s\S]*?font-size:\s*clamp\(22px,\s*6vw,\s*25px\);[\s\S]*?line-height:\s*1\.35;/);
  assert.match(styles, /\.cinematic-v2 \.about-stage \.about-summary\s*\{[\s\S]*?font-size:\s*17px;[\s\S]*?line-height:\s*1\.75;/);
  assert.match(styles, /\.cinematic-v2 \.contact-name\s*\{[\s\S]*?font-size:\s*20px;[\s\S]*?line-height:\s*1\.25;/);
  assert.match(styles, /\.cinematic-v2 \.contact-value\s*\{[\s\S]*?font-size:\s*clamp\(25px,\s*7vw,\s*30px\);[\s\S]*?line-height:\s*1\.1;/);
});
