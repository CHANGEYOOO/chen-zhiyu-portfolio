import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DashboardRequestError,
  PUBLIC_WORKS_URL,
  createDashboardController,
  createDomView,
  highlightedWorkId,
  renderDashboardActions,
  requestPublishedWorks,
} from "../dashboard.js";

const root = new URL("../", import.meta.url);

function fakeElement(tagName = "div") {
  return {
    tagName,
    children: [],
    dataset: {},
    classList: {
      values: new Set(),
      add(...names) { names.forEach((name) => this.values.add(name)); },
      contains(name) { return this.values.has(name); },
    },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; },
    focus() { this.focused = true; },
    scrollIntoView() { this.scrolledIntoView = true; },
  };
}

function createFakeDocument() {
  const elements = new Map();
  return {
    createElement: (tagName) => fakeElement(tagName),
    querySelector: (selector) => elements.get(selector) || null,
    register(selector, element) { elements.set(selector, element); return element; },
  };
}

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

test("dashboard renders the isolated TVC creation action", () => {
  const fakeDocument = createFakeDocument();
  const root = fakeDocument.createElement("nav");
  renderDashboardActions(fakeDocument, root);
  const link = root.children[0];
  assert.equal(link.href, "/admin/dashboard/tvc/new/");
  assert.equal(link.textContent, "新增 TVC");
});

test("highlight query accepts only safe work ids", () => {
  assert.equal(highlightedWorkId("?highlight=work-123"), "work-123");
  assert.equal(highlightedWorkId("?highlight=%3Cscript%3E"), "");
});

test("matching work row is highlighted, focused, and scrolled into view", () => {
  const fakeDocument = createFakeDocument();
  const tvcBody = fakeDocument.register('[data-works-body="tvc"]', fakeElement("tbody"));
  fakeDocument.register('[data-works-body="livestream"]', fakeElement("tbody"));
  fakeDocument.register('[data-dashboard-status]', fakeElement());
  fakeDocument.register('[data-dashboard-warning]', fakeElement());
  fakeDocument.register('[data-retry]', fakeElement());
  fakeDocument.register('[data-count="total"]', fakeElement());
  fakeDocument.register('[data-count="tvc"]', fakeElement());
  fakeDocument.register('[data-count="livestream"]', fakeElement());

  createDomView(fakeDocument, { highlightId: "work-123" }).showModel({
    groups: {
      tvc: [{ id: "work-123", brand_name: "Brand", work_title: "Title", work_type: "TVC" }],
      livestream: [],
    },
    counts: { total: 1, tvc: 1, livestream: 0 },
    isEmpty: false,
    warning: "",
  });

  const item = tvcBody.children[0];
  assert.equal(item.dataset.workId, "work-123");
  assert.equal(item.classList.contains("is-highlighted"), true);
  assert.equal(item.tabIndex, -1);
  assert.equal(item.focused, true);
  assert.equal(item.scrolledIntoView, true);
});

test("vendored Bootstrap CSS exists", async () => {
  const css = await readFile(new URL("vendor/bootstrap.min.css", root), "utf8");
  assert.match(css, /Bootstrap\s+v5\.3\.3/);
});

test("requests only the current public works endpoint", async () => {
  let observed;
  const payload = { works: [] };
  const result = await requestPublishedWorks(async (url, options) => {
    observed = { url, options };
    return { ok: true, json: async () => payload };
  });
  assert.equal(observed.url, "https://api.kjoe.top/api/public/works");
  assert.equal(PUBLIC_WORKS_URL, observed.url);
  assert.deepEqual(observed.options, { headers: { Accept: "application/json" } });
  assert.equal(result, payload);
});

test("maps unsuccessful responses to DashboardRequestError", async () => {
  await assert.rejects(
    () => requestPublishedWorks(async () => ({ ok: false, status: 503 })),
    (error) => error instanceof DashboardRequestError && error.message.includes("503"),
  );
});

test("controller transitions through loading and success", async () => {
  const calls = [];
  const model = { groups: { tvc: [], livestream: [] }, counts: { total: 0, tvc: 0, livestream: 0 }, isEmpty: true, warning: "count warning" };
  const controller = createDashboardController({
    request: async () => ({ works: [] }),
    buildModel: () => model,
    view: {
      showLoading: () => calls.push("loading"),
      showModel: (value) => calls.push(["model", value]),
      showError: (message) => calls.push(["error", message]),
    },
  });
  await controller.load();
  assert.deepEqual(calls, ["loading", ["model", model]]);
});

test("controller exposes a safe error message", async () => {
  const calls = [];
  const controller = createDashboardController({
    request: async () => { throw new Error("private diagnostic"); },
    buildModel: (value) => value,
    logger: { error() {} },
    view: {
      showLoading: () => calls.push("loading"),
      showModel: () => calls.push("model"),
      showError: (message) => calls.push(["error", message]),
    },
  });
  await controller.load();
  assert.deepEqual(calls, ["loading", ["error", "作品数据加载失败，请稍后重试。"]]);
});

test("project records the local V0.23 dashboard milestone", async () => {
  const readme = await readFile(new URL("../../../README.md", import.meta.url), "utf8");
  const home = await readFile(new URL("../../../index.html", import.meta.url), "utf8");
  const guide = await readFile(new URL("../../../docs/minimal-admin-dashboard.md", import.meta.url), "utf8");
  assert.match(readme, /HTML 原型 V0\.23/);
  assert.match(readme, /\/admin\/dashboard\//);
  assert.match(home, /HTML PROTOTYPE V0\.23/);
  assert.match(guide, /Cloudflare 账号授权/);
  assert.match(guide, /api\.kjoe\.top\/api\/public\/works/);
});
