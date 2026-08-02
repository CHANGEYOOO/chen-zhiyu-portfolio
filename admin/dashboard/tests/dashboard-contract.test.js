import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("dashboard is an isolated read-only module", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  assert.match(html, /vendor\/bootstrap\.min\.css/);
  assert.match(html, /dashboard\.css/);
  assert.match(html, /dashboard\.js/);
  assert.match(html, /data-dashboard-status/);
  assert.match(html, /data-works-body="tvc"/);
  assert.match(html, /data-works-body="livestream"/);
  assert.match(html, /href="\/cdn-cgi\/access\/logout"/);
  assert.doesNotMatch(html, /\.\.\/admin\.js|\.\.\/api-client\.js|upload-manager|sortable-list|type="file"/);
  assert.doesNotMatch(html, />\s*(上传|编辑|删除|排序|权限)\s*</);
});

test("dashboard styles do not import runtime CDN assets", async () => {
  const css = await readFile(new URL("dashboard.css", root), "utf8");
  assert.doesNotMatch(css, /@import|https?:\/\//);
});

test("vendored Bootstrap CSS exists", async () => {
  const css = await readFile(new URL("vendor/bootstrap.min.css", root), "utf8");
  assert.match(css, /Bootstrap\s+v5\.3\.3/);
});
