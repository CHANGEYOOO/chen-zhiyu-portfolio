# Minimal Cloudflare Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一个由 Cloudflare Access 保护的只读 `/admin/dashboard/`，登录后展示与线上前台一致的 30 个 TVC 和 8 个 Livestream，同时不修改旧后台代码或线上配置。

**Architecture:** 在 `admin/dashboard/` 内建立完全独立的静态模块。Cloudflare Access 在发布阶段负责 Cloudflare 账号授权；浏览器端只读取现有 `https://api.kjoe.top/api/public/works`，使用纯数据模型校验、分组和排序，再通过最小 DOM 视图渲染 Bootstrap 只读列表。

**Tech Stack:** Semantic HTML, Bootstrap 5.3.3 CSS, native CSS, native ES modules, Fetch API, Node.js built-in test runner.

## Global Constraints

- 不修改 `admin/` 目录中已有的任何文件；只允许在新目录 `admin/dashboard/` 内新增文件。
- 不修改旧后台、旧后台登录方式、Worker、D1、R2 或线上前台。
- 数据唯一来源为 `GET https://api.kjoe.top/api/public/works`。
- 只显示 `published` 数据：预期 TVC=30、Livestream=8、总数=38。
- 禁止上传、新增、编辑、删除、归档、排序、权限管理和数据库重构。
- 不使用旧后台 `admin.js`、`api-client.js` 或任何上传、草稿、排序模块。
- 不使用运行时 CDN；Bootstrap 5.3.3 CSS 固定保存在新模块 `vendor/` 内。
- 本轮只本地实现和提交，不推送 GitHub，不部署 GitHub Pages，不配置 Cloudflare Access。
- 网站本地版本从正式基线 V0.22 递增到 V0.23；发布标签和远程推送留到用户明确要求发布时执行。

---

### Task 1: 只读作品数据模型

**Files:**
- Create: `admin/dashboard/works-model.js`
- Create: `admin/dashboard/tests/works-model.test.js`

**Interfaces:**
- Consumes: API payload `{ works: Array<RawWork> }`, where each work contains `id`, `section`, `brand_name`, `work_title`, `work_type`, and `sort_order`.
- Produces: `WorksDataError`, `buildWorksModel(payload)`, and model `{ groups, counts, isEmpty, warning }`.

- [ ] **Step 1: Write the failing data-model tests**

Create `admin/dashboard/tests/works-model.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { WorksDataError, buildWorksModel } from "../works-model.js";

function work(overrides = {}) {
  return {
    id: "work-1",
    section: "tvc",
    brand_name: "Brand",
    work_title: "Title",
    work_type: "TVC",
    sort_order: 0,
    ...overrides,
  };
}

test("groups 30 TVC and 8 Livestream works and reports expected counts", () => {
  const works = [
    ...Array.from({ length: 30 }, (_, index) => work({ id: `tvc-${index}`, sort_order: 29 - index })),
    ...Array.from({ length: 8 }, (_, index) => work({ id: `live-${index}`, section: "livestream", work_type: "Set Design", sort_order: 7 - index })),
  ];
  const model = buildWorksModel({ works });
  assert.equal(model.groups.tvc.length, 30);
  assert.equal(model.groups.livestream.length, 8);
  assert.deepEqual(model.counts, { total: 38, tvc: 30, livestream: 8 });
  assert.equal(model.warning, "");
  assert.equal(model.groups.tvc[0].sort_order, 0);
  assert.equal(model.groups.livestream[0].sort_order, 0);
});

test("returns an empty model for an empty works array", () => {
  const model = buildWorksModel({ works: [] });
  assert.equal(model.isEmpty, true);
  assert.deepEqual(model.counts, { total: 0, tvc: 0, livestream: 0 });
  assert.match(model.warning, /预期 38 个/);
});

test("warns when valid data does not match the expected 30 plus 8 counts", () => {
  const model = buildWorksModel({ works: [work()] });
  assert.match(model.warning, /实际 1 个/);
  assert.equal(model.groups.tvc.length, 1);
});

test("rejects an invalid top-level payload", () => {
  assert.throws(() => buildWorksModel({}), WorksDataError);
  assert.throws(() => buildWorksModel(null), WorksDataError);
});

for (const field of ["id", "brand_name", "work_title", "work_type"]) {
  test(`rejects a work with invalid ${field}`, () => {
    assert.throws(() => buildWorksModel({ works: [work({ [field]: "" })] }), WorksDataError);
  });
}

test("rejects unknown sections and invalid sort orders", () => {
  assert.throws(() => buildWorksModel({ works: [work({ section: "other" })] }), WorksDataError);
  assert.throws(() => buildWorksModel({ works: [work({ sort_order: -1 })] }), WorksDataError);
  assert.throws(() => buildWorksModel({ works: [work({ sort_order: 1.5 })] }), WorksDataError);
});
```

- [ ] **Step 2: Run the model test and verify RED**

Run:

```bash
'/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' --test admin/dashboard/tests/works-model.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `admin/dashboard/works-model.js`.

- [ ] **Step 3: Implement the minimal model**

Create `admin/dashboard/works-model.js`:

```js
const EXPECTED_COUNTS = Object.freeze({ total: 38, tvc: 30, livestream: 8 });
const SECTIONS = new Set(["tvc", "livestream"]);

export class WorksDataError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorksDataError";
  }
}

function requiredString(value, field, index) {
  if (typeof value !== "string" || !value.trim()) {
    throw new WorksDataError(`作品 ${index + 1} 的 ${field} 无效`);
  }
  return value.trim();
}

function normalizeWork(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorksDataError(`作品 ${index + 1} 格式无效`);
  }
  const section = requiredString(value.section, "section", index);
  if (!SECTIONS.has(section)) throw new WorksDataError(`作品 ${index + 1} 的 section 无效`);
  if (!Number.isInteger(value.sort_order) || value.sort_order < 0) {
    throw new WorksDataError(`作品 ${index + 1} 的 sort_order 无效`);
  }
  return {
    id: requiredString(value.id, "id", index),
    section,
    brand_name: requiredString(value.brand_name, "brand_name", index),
    work_title: requiredString(value.work_title, "work_title", index),
    work_type: requiredString(value.work_type, "work_type", index),
    sort_order: value.sort_order,
  };
}

export function buildWorksModel(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.works)) {
    throw new WorksDataError("作品接口返回格式无效");
  }
  const works = payload.works.map(normalizeWork);
  const groups = {
    tvc: works.filter((item) => item.section === "tvc").sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)),
    livestream: works.filter((item) => item.section === "livestream").sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)),
  };
  const counts = { total: works.length, tvc: groups.tvc.length, livestream: groups.livestream.length };
  const matches = counts.total === EXPECTED_COUNTS.total && counts.tvc === EXPECTED_COUNTS.tvc && counts.livestream === EXPECTED_COUNTS.livestream;
  const warning = matches ? "" : `作品数量异常：预期 38 个（TVC 30、Livestream 8），实际 ${counts.total} 个（TVC ${counts.tvc}、Livestream ${counts.livestream}）。`;
  return { groups, counts, isEmpty: works.length === 0, warning };
}
```

- [ ] **Step 4: Run the model test and verify GREEN**

Run:

```bash
'/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' --test admin/dashboard/tests/works-model.test.js
```

Expected: all tests PASS, zero warnings and zero failures.

- [ ] **Step 5: Commit the data model**

```bash
git add admin/dashboard/works-model.js admin/dashboard/tests/works-model.test.js
git commit -m "Add read-only dashboard works model"
```

---

### Task 2: 独立 Dashboard 页面合约与 Bootstrap 壳层

**Files:**
- Create: `admin/dashboard/index.html`
- Create: `admin/dashboard/dashboard.css`
- Create: `admin/dashboard/vendor/bootstrap.min.css`
- Create: `admin/dashboard/tests/dashboard-contract.test.js`

**Interfaces:**
- Consumes: no old-admin assets; only `./vendor/bootstrap.min.css`, `./dashboard.css`, and `./dashboard.js`.
- Produces: stable DOM hooks `[data-dashboard-status]`, `[data-dashboard-warning]`, `[data-count]`, `[data-works-body]`, and `[data-retry]` for Task 3.

- [ ] **Step 1: Write the failing static contract tests**

Create `admin/dashboard/tests/dashboard-contract.test.js`:

```js
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
  assert.match(css, /Bootstrap v5\.3\.3/);
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
'/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' --test admin/dashboard/tests/dashboard-contract.test.js
```

Expected: FAIL with `ENOENT` for `admin/dashboard/index.html`.

- [ ] **Step 3: Vendor Bootstrap 5.3.3 CSS**

Run from `prototype/`:

```bash
mkdir -p admin/dashboard/vendor
curl --fail --location --output admin/dashboard/vendor/bootstrap.min.css https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css
```

Confirm the downloaded header contains `Bootstrap v5.3.3` and the file is non-empty:

```bash
head -c 120 admin/dashboard/vendor/bootstrap.min.css
wc -c admin/dashboard/vendor/bootstrap.min.css
```

Expected: header names Bootstrap v5.3.3 and size is greater than 200000 bytes.

- [ ] **Step 4: Create the minimal semantic page**

Create `admin/dashboard/index.html` with this exact structure:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>JOEKUNI ADMIN - Dashboard</title>
    <link rel="stylesheet" href="./vendor/bootstrap.min.css" />
    <link rel="stylesheet" href="./dashboard.css?v=0.23" />
    <script type="module" src="./dashboard.js?v=0.23"></script>
  </head>
  <body class="bg-body-tertiary">
    <header class="navbar bg-dark" data-bs-theme="dark">
      <div class="container-fluid dashboard-width">
        <span class="navbar-brand mb-0 h1">JOEKUNI ADMIN</span>
        <div class="d-flex align-items-center gap-3">
          <span class="badge text-bg-secondary">只读</span>
          <a class="btn btn-outline-light btn-sm" href="/cdn-cgi/access/logout">退出登录</a>
        </div>
      </div>
    </header>
    <main class="container-fluid dashboard-width py-4 py-lg-5">
      <div class="d-flex flex-column flex-md-row justify-content-between gap-2 mb-4">
        <div><p class="text-secondary text-uppercase small mb-1">Dashboard</p><h1 class="h2 mb-0">作品列表</h1></div>
        <p class="text-secondary mb-0 align-self-md-end">数据与线上前台同步</p>
      </div>
      <section class="row g-3 mb-4" aria-label="作品概览">
        <div class="col-12 col-md-4"><div class="card h-100"><div class="card-body"><p class="text-secondary mb-1">全部作品</p><strong class="display-6" data-count="total">-</strong></div></div></div>
        <div class="col-6 col-md-4"><div class="card h-100"><div class="card-body"><p class="text-secondary mb-1">TVC</p><strong class="display-6" data-count="tvc">-</strong></div></div></div>
        <div class="col-6 col-md-4"><div class="card h-100"><div class="card-body"><p class="text-secondary mb-1">Livestream</p><strong class="display-6" data-count="livestream">-</strong></div></div></div>
      </section>
      <div class="alert alert-info" role="status" data-dashboard-status>正在读取作品数据…</div>
      <div class="alert alert-warning" role="alert" data-dashboard-warning hidden></div>
      <button class="btn btn-dark mb-4" type="button" data-retry hidden>重新加载</button>
      <section class="card mb-4" aria-labelledby="tvc-title"><div class="card-header"><h2 class="h5 mb-0" id="tvc-title">TVC</h2></div><div class="table-responsive"><table class="table table-hover align-middle mb-0"><thead><tr><th scope="col">#</th><th scope="col">品牌</th><th scope="col">作品</th><th scope="col">类型</th></tr></thead><tbody data-works-body="tvc"></tbody></table></div></section>
      <section class="card" aria-labelledby="livestream-title"><div class="card-header"><h2 class="h5 mb-0" id="livestream-title">Livestream</h2></div><div class="table-responsive"><table class="table table-hover align-middle mb-0"><thead><tr><th scope="col">#</th><th scope="col">品牌</th><th scope="col">作品</th><th scope="col">类型</th></tr></thead><tbody data-works-body="livestream"></tbody></table></div></section>
    </main>
  </body>
</html>
```

- [ ] **Step 5: Add only the necessary responsive CSS**

Create `admin/dashboard/dashboard.css`:

```css
:root { color-scheme: light; }
.dashboard-width { max-width: 1180px; }
th:first-child, td:first-child { width: 64px; }
[data-dashboard-status][data-kind="error"] { color: var(--bs-danger-text-emphasis); background: var(--bs-danger-bg-subtle); border-color: var(--bs-danger-border-subtle); }
@media (max-width: 575.98px) {
  table, thead, tbody, tr, th, td { display: block; }
  thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  tbody tr { padding: 1rem; border-bottom: 1px solid var(--bs-border-color); }
  tbody td { padding: .2rem 0; border: 0; }
  tbody td:first-child { width: auto; color: var(--bs-secondary-color); font-size: .875rem; }
  tbody td:nth-child(2) { font-weight: 600; }
}
```

- [ ] **Step 6: Run the contract test and verify GREEN**

Run:

```bash
'/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' --test admin/dashboard/tests/dashboard-contract.test.js
```

Expected: all tests PASS.

- [ ] **Step 7: Commit the page shell**

```bash
git add admin/dashboard/index.html admin/dashboard/dashboard.css admin/dashboard/vendor/bootstrap.min.css admin/dashboard/tests/dashboard-contract.test.js
git commit -m "Add isolated read-only dashboard shell"
```

---

### Task 3: Dashboard 请求、状态控制与安全渲染

**Files:**
- Create: `admin/dashboard/dashboard.js`
- Modify: `admin/dashboard/tests/dashboard-contract.test.js`

**Interfaces:**
- Consumes: `buildWorksModel(payload)` from Task 1 and DOM hooks from Task 2.
- Produces: `PUBLIC_WORKS_URL`, `DashboardRequestError`, `requestPublishedWorks(fetchImpl)`, `createDashboardController({ request, buildModel, view, logger? })`, and browser bootstrap.

- [ ] **Step 1: Add failing request and controller tests**

Append to `admin/dashboard/tests/dashboard-contract.test.js`:

```js
import { DashboardRequestError, PUBLIC_WORKS_URL, createDashboardController, requestPublishedWorks } from "../dashboard.js";

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
```

- [ ] **Step 2: Run the dashboard tests and verify RED**

Run:

```bash
node --test admin/dashboard/tests/dashboard-contract.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `admin/dashboard/dashboard.js`.

- [ ] **Step 3: Implement request and controller primitives**

Create the first part of `admin/dashboard/dashboard.js`:

```js
import { buildWorksModel } from "./works-model.js";

export const PUBLIC_WORKS_URL = "https://api.kjoe.top/api/public/works";

export class DashboardRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "DashboardRequestError";
  }
}

export async function requestPublishedWorks(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(PUBLIC_WORKS_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new DashboardRequestError(`作品接口请求失败：HTTP ${response.status}`);
  return response.json();
}

export function createDashboardController({ request, buildModel, view, logger = console }) {
  return {
    async load() {
      view.showLoading();
      try {
        view.showModel(buildModel(await request()));
      } catch (error) {
        logger.error("Dashboard load failed", error);
        view.showError("作品数据加载失败，请稍后重试。");
      }
    },
  };
}
```

- [ ] **Step 4: Implement the DOM view without HTML string interpolation**

Append to `admin/dashboard/dashboard.js`:

```js
function setText(element, value) { if (element) element.textContent = String(value); }

function row(documentRef, work, index) {
  const item = documentRef.createElement("tr");
  for (const value of [index + 1, work.brand_name, work.work_title, work.work_type]) {
    const cell = documentRef.createElement("td");
    cell.textContent = String(value);
    item.appendChild(cell);
  }
  return item;
}

export function createDomView(documentRef) {
  const status = documentRef.querySelector("[data-dashboard-status]");
  const warning = documentRef.querySelector("[data-dashboard-warning]");
  const retry = documentRef.querySelector("[data-retry]");
  const bodies = {
    tvc: documentRef.querySelector('[data-works-body="tvc"]'),
    livestream: documentRef.querySelector('[data-works-body="livestream"]'),
  };
  return {
    showLoading() {
      status.hidden = false;
      status.dataset.kind = "loading";
      status.textContent = "正在读取作品数据…";
      warning.hidden = true;
      retry.hidden = true;
    },
    showModel(model) {
      setText(documentRef.querySelector('[data-count="total"]'), model.counts.total);
      setText(documentRef.querySelector('[data-count="tvc"]'), model.counts.tvc);
      setText(documentRef.querySelector('[data-count="livestream"]'), model.counts.livestream);
      for (const section of ["tvc", "livestream"]) {
        bodies[section].replaceChildren(...model.groups[section].map((work, index) => row(documentRef, work, index)));
      }
      status.hidden = false;
      status.dataset.kind = "success";
      status.textContent = model.isEmpty ? "当前没有已发布作品。" : `已载入 ${model.counts.total} 个作品。`;
      warning.textContent = model.warning;
      warning.hidden = !model.warning;
      retry.hidden = true;
    },
    showError(message) {
      status.hidden = false;
      status.dataset.kind = "error";
      status.textContent = message;
      warning.hidden = true;
      retry.hidden = false;
    },
  };
}

if (typeof document !== "undefined") {
  const controller = createDashboardController({ request: requestPublishedWorks, buildModel: buildWorksModel, view: createDomView(document) });
  document.querySelector("[data-retry]")?.addEventListener("click", () => controller.load());
  controller.load();
}
```

- [ ] **Step 5: Run both test suites and verify GREEN**

Run:

```bash
'/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' --test admin/dashboard/tests/*.test.js
```

Expected: all tests PASS, zero failures.

- [ ] **Step 6: Commit dashboard behavior**

```bash
git add admin/dashboard/dashboard.js admin/dashboard/tests/dashboard-contract.test.js
git commit -m "Load published works in minimal dashboard"
```

---

### Task 4: V0.23 版本记录与本地集成验收

**Files:**
- Modify: `README.md`
- Modify: `index.html`
- Create: `docs/minimal-admin-dashboard.md`
- Test: `admin/dashboard/tests/*.test.js`

**Interfaces:**
- Consumes: complete dashboard from Tasks 1–3.
- Produces: locally versioned V0.23 project, reproducible verification commands, and no remote deployment.

- [ ] **Step 1: Write the failing version/documentation assertions**

Append to `admin/dashboard/tests/dashboard-contract.test.js`:

```js
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
```

- [ ] **Step 2: Run the version assertion and verify RED**

Run:

```bash
'/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' --test admin/dashboard/tests/dashboard-contract.test.js
```

Expected: FAIL because README/footer still state V0.22 and the dashboard guide does not exist.

- [ ] **Step 3: Update the local version and documentation**

Change the first line of `README.md` to:

```markdown
# HTML 原型 V0.23 交付
```

Add this completed item under `README.md` → `已完成`:

```markdown
- 新增完全独立的 `/admin/dashboard/` 最小只读后台：预留 Cloudflare 账号授权入口，只读取线上前台公开作品 API，显示 30 个 TVC 与 8 个 Livestream；未修改旧后台代码，未发布线上 Access 规则。
```

Change the footer text in `index.html` to:

```html
<p>HTML PROTOTYPE V0.23</p>
```

Create `docs/minimal-admin-dashboard.md`:

```markdown
# Minimal Admin Dashboard

## Local preview

From `prototype/`, start a static server and open `/admin/dashboard/`.

## Data

The page reads `https://api.kjoe.top/api/public/works`, the same published data source preferred by the public frontend. Expected counts are TVC 30, Livestream 8, total 38.

## Authentication

Local preview does not simulate authentication. Production access will use a new Cloudflare Access application scoped to `/admin/dashboard*`, with Cloudflare 账号授权 and an allow policy for the confirmed account. Existing `/admin*` email-OTP protection remains unchanged.

## Release boundary

This local milestone does not push GitHub, publish GitHub Pages, or change Cloudflare Access. Perform those steps only after an explicit publish instruction.
```

- [ ] **Step 4: Run all dashboard tests and syntax checks**

Run:

```bash
'/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' --test admin/dashboard/tests/*.test.js
'/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' --check admin/dashboard/works-model.js
'/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node' --check admin/dashboard/dashboard.js
git diff --check
```

Expected: all tests PASS; both syntax checks exit 0; `git diff --check` has no output.

- [ ] **Step 5: Run a local static-server smoke test**

Start a local server from `prototype/`:

```bash
'/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3' -m http.server 4173
```

Verify in a browser:

```text
http://127.0.0.1:4173/admin/dashboard/
```

Expected:

- page title is `JOEKUNI ADMIN - Dashboard`;
- loading state changes to a list or a clear API/CORS error;
- successful API access shows total 38, TVC 30, Livestream 8;
- there are no upload, edit, delete, order, archive, permission, or file-input controls;
- desktop and 390px mobile widths remain readable;
- browser console contains no uncaught exception.

- [ ] **Step 6: Verify old-admin isolation**

Run:

```bash
git diff --name-only HEAD~4..HEAD -- admin | sort
```

Expected: every changed path starts with `admin/dashboard/`; no pre-existing file directly under `admin/` appears.

- [ ] **Step 7: Commit the V0.23 local milestone**

```bash
git add README.md index.html docs/minimal-admin-dashboard.md admin/dashboard/tests/dashboard-contract.test.js
git commit -m "Prepare minimal admin dashboard V0.23"
```

- [ ] **Step 8: Stop before publication**

Run:

```bash
git status --short
git log -4 --oneline
```

Expected: worktree clean and four local feature commits visible. Do not run `git push`, create a release tag, deploy GitHub Pages, edit Cloudflare Access, or change production routes.

---

## Plan Self-Review Result

- Spec coverage: login boundary, route, 38-item published data source, isolation, forbidden features, responsive states, tests, versioning, and no-publish boundary each map to a task.
- Placeholder scan: no deferred implementation instructions or unspecified error handling remain.
- Type consistency: Task 1 produces `buildWorksModel`; Task 3 consumes the same symbol and returns the documented `{ groups, counts, isEmpty, warning }` shape. DOM hooks created in Task 2 exactly match Task 3 selectors.
