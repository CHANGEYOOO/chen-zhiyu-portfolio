const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const styles = readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

test("直播项目标题与图片保持更宽松的垂直间距", () => {
  assert.match(
    styles,
    /\.cinematic-v2 \.livestream-meta\s*\{[\s\S]*?padding-top:\s*24px;/,
  );
});

test("直播项目类别位于项目名称下方并保持左对齐", () => {
  assert.match(
    styles,
    /\.cinematic-v2 \.livestream-meta\s*\{[\s\S]*?display:\s*block;[\s\S]*?padding-top:\s*18px;/,
  );
  assert.match(
    styles,
    /\.cinematic-v2 \.livestream-meta p\s*\{[\s\S]*?margin:\s*8px 0 0;[\s\S]*?text-align:\s*left;/,
  );
});
