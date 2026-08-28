const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const styles = readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

test("the shared page background keeps its approved gradient and adds a subtle repeating dot layer", () => {
  assert.match(
    styles,
    /--page-background:\s*radial-gradient\(circle at 1px 1px, rgba\(76, 150, 255, 0\.14\) 1px, transparent 1\.2px\)\s+0 0 \/ 28px 28px repeat,\s*radial-gradient\(\s*circle at 50% 50%,\s*#e6faff 0%,\s*#f4f4f4 86\.3%,\s*#ffffff 100%\s*\)/,
  );
});
