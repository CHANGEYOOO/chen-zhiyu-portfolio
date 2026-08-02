# TVC Local Upload and Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在独立的新 Dashboard 中实现 TVC 远程草稿、Poster 转换与上传、视频分片上传、真实媒体预览、位置选择和明确确认发布，同时保持旧后台与线上前端不受影响。

**Architecture:** 静态页面新增 `/admin/dashboard/tvc/new/`，通过同源 `/admin/dashboard/api/*` 调用一套独立 Cloudflare Worker。新 Worker 复用现有 D1 和 R2，但使用独立 Access audience、精确路由和服务器端发布完整性校验；旧 `/admin/`、`api.kjoe.top/api/admin/*` 与公共读取接口保持原样。

**Tech Stack:** 原生 HTML/CSS/ES modules、Canvas/Blob、HTMLMediaElement、Fetch API、Cloudflare Workers、Access JWT、D1、R2 Multipart Upload、Node.js built-in test runner。

## Global Constraints

- 实现目标版本为 V0.24；只有全部验收通过时才更新版本号。
- 本计划不授权 GitHub push、Worker 部署、Access 修改、R2 真实上传或作品发布。
- 不修改 `admin/admin.js` 和旧后台页面；不扩展旧管理 API。
- 不新增数据库和对象存储；复用当前 `works`、`upload_sessions`、`audit_log` 与现有 R2 bucket。
- 当前阶段不实现 Livestream 新增、编辑、删除、归档、恢复、转码和批量上传。
- 删除文件时必须使用 `/usr/bin/trash`；本计划本身不需要删除文件。
- 每一任务都先写失败测试，再写最小实现，再运行相关回归测试并单独提交。
- 测试不得写生产 D1/R2。真实生产验收必须另行说明目标、回滚方式并取得用户明确授权。

---

## Task 1: Dashboard 动态计数、新增入口和发布后高亮

**Files:**

- Modify: `admin/dashboard/works-model.js`
- Modify: `admin/dashboard/dashboard.js`
- Modify: `admin/dashboard/index.html`
- Modify: `admin/dashboard/dashboard.css`
- Modify: `admin/dashboard/tests/works-model.test.js`
- Modify: `admin/dashboard/tests/dashboard-contract.test.js`

**Interfaces:**

```js
export function buildWorksModel(payload)
export function highlightedWorkId(search = location.search)
export function createDomView(documentRef, { highlightId = "" } = {})
```

- [ ] **RED — 删除固定数量假设并定义入口/高亮契约。**

在 `works-model.test.js` 增加：

```js
test("counts are derived only from returned works", () => {
  const model = buildWorksModel({ works: [tvc("a", 0), livestream("b", 0)] });
  assert.deepEqual(model.counts, { total: 2, tvc: 1, livestream: 1 });
  assert.equal(model.warning, "");
});
```

在 `dashboard-contract.test.js` 增加实际 DOM 渲染测试，不通过正则读取 HTML 源码：

```js
test("dashboard renders the isolated TVC creation action", () => {
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
```

- [ ] 运行测试并确认它们因固定计数与缺少入口/导出失败：

```bash
NODE=/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
$NODE --test admin/dashboard/tests/*.test.js
```

- [ ] **GREEN — 实现动态计数与安全高亮。**

删除 `EXPECTED_COUNTS` 和固定数量警告，保留数据格式校验；新增：

```js
export function highlightedWorkId(search = "") {
  const value = new URLSearchParams(search).get("highlight") || "";
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value) ? value : "";
}
```

为生成的行设置 `data-work-id`，匹配时添加 `is-highlighted`、`tabindex="-1"` 并在渲染后聚焦/滚入视口。新增入口只链接到新页面，不添加上传逻辑。

- [ ] 运行 Dashboard 测试和语法检查：

```bash
$NODE --test admin/dashboard/tests/*.test.js
$NODE --check admin/dashboard/dashboard.js
$NODE --check admin/dashboard/works-model.js
```

- [ ] 提交：

```bash
git add admin/dashboard
git commit -m "Add TVC creation entry to dashboard"
```

---

## Task 2: 建立独立 Dashboard API Worker 与 Access 边界

**Files:**

- Create: `cloudflare-dashboard-api/wrangler.toml`
- Create: `cloudflare-dashboard-api/src/index.js`
- Create: `cloudflare-dashboard-api/src/auth.js`
- Create: `cloudflare-dashboard-api/src/http.js`
- Create: `cloudflare-dashboard-api/src/validation.js`
- Create: `cloudflare-dashboard-api/test/helpers/access.js`
- Create: `cloudflare-dashboard-api/test/helpers/d1.js`
- Create: `cloudflare-dashboard-api/test/helpers/r2.js`
- Create: `cloudflare-dashboard-api/test/auth.test.js`
- Create: `cloudflare-dashboard-api/test/router.test.js`

**Interfaces:**

```js
export async function requireDashboardAccess(request, env)
export function json(payload, init = {})
export function problem(status, code, message, details)
export function safeWorkId(value)
export default { async fetch(request, env) }
```

- [ ] **RED — 锁定精确前缀、方法和身份验证。**

```js
test("rejects requests outside the exact dashboard API prefix", async () => {
  const response = await worker.fetch(request("/api/admin/works"), env());
  assert.equal(response.status, 404);
});

test("accepts only the configured audience and admin email", async () => {
  assert.equal((await requireDashboardAccess(signedRequest({ aud: "wrong" }), accessEnv())).response.status, 403);
  assert.equal((await requireDashboardAccess(signedRequest({ email: "other@example.com" }), accessEnv())).response.status, 403);
});
```

- [ ] 运行并确认新模块不存在导致测试失败：

```bash
$NODE --test cloudflare-dashboard-api/test/auth.test.js cloudflare-dashboard-api/test/router.test.js
```

- [ ] **GREEN — 新建独立 Worker。**

`wrangler.toml` 只声明现有 D1/R2 binding 名称和兼容日期，不写 audience、邮箱或 token：

```toml
name = "kjoe-dashboard-api"
main = "src/index.js"
compatibility_date = "2026-08-02"

[[d1_databases]]
binding = "DB"
database_name = "kjoe-portfolio-content"
database_id = "42b6c0fa-8994-4dfc-97eb-c3449e559bb8"

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "kjoe-portfolio-media"
```

路由器仅识别 `/admin/dashboard/api/`；所有业务路由先调用 Access 校验。会话响应：

```js
return json({ data: { email: identity.email, logoutUrl: "/cdn-cgi/access/logout" } });
```

验证 JWT 签名、issuer、audience、expiry 与 `ADMIN_EMAILS` allowlist；`ACCESS_AUD` 支持逗号分隔，但新部署只配置 Dashboard 应用 audience。

- [ ] 运行新 Worker 测试和旧 Worker 回归：

```bash
$NODE --test cloudflare-dashboard-api/test/*.test.js cloudflare-portfolio-api/test/*.test.js
```

- [ ] 提交：

```bash
git add cloudflare-dashboard-api
git commit -m "Add isolated dashboard API worker"
```

---

## Task 3: TVC 草稿、读取、更新与顺序修订号

**Files:**

- Create: `cloudflare-dashboard-api/src/works.js`
- Create: `cloudflare-dashboard-api/src/order.js`
- Modify: `cloudflare-dashboard-api/src/index.js`
- Create: `cloudflare-dashboard-api/test/works.test.js`
- Create: `admin/dashboard/tvc/new/api-client.js`
- Create: `admin/dashboard/tvc/new/form-model.js`
- Create: `admin/dashboard/tvc/new/tests/api-client.test.js`
- Create: `admin/dashboard/tvc/new/tests/form-model.test.js`

**Interfaces:**

```js
export async function createTvcDraft(request, env, identity)
export async function getTvcDraft(request, env, workId, identity)
export async function updateTvcDraft(request, env, workId, identity)
export async function getTvcOrder(request, env)
export async function orderRevision(ids)

export class DashboardApiError extends Error
export function createDashboardApi(fetchImpl = fetch)
export function validateDraftFields(fields)
```

- [ ] **RED — 草稿只能由服务器生成 ID 且固定为 TVC/draft。**

```js
test("creates a server-id TVC draft and ignores no client id", async () => {
  const response = await create({ brandName: "Nike", workTitle: "Run", workType: "TVC" });
  assert.equal(response.status, 201);
  assert.match((await response.json()).data.id, /^[a-zA-Z0-9_-]+$/);
  assert.deepEqual(db.inserted.pick("section", "status"), { section: "tvc", status: "draft" });
});

test("updates only the active draft with optimistic version", async () => {
  const response = await update("work-1", { version: 2, brandName: "A", workTitle: "B", workType: "TVC" });
  assert.equal(response.status, 409);
});
```

前端契约测试同源 URL 与统一错误：

```js
assert.equal(api.url("/works"), "/admin/dashboard/api/works");
await assert.rejects(() => api.createDraft(invalid), DashboardApiError);
```

- [ ] **GREEN — 实现草稿和顺序。**

`POST /works` 不接收 `id`、`section`、`status`、媒体 key 或排序；以 `crypto.randomUUID()` 生成 ID。`PUT` 要求 work 属于 `tvc`、仍为 `draft` 且 version 匹配。`GET /tvc/order` 只返回 `published` TVC，按 `sort_order,id` 排序：

```json
{
  "data": {
    "items": [{ "id": "work-1", "label": "Brand — Title" }],
    "orderRevision": "sha256-base64url"
  }
}
```

修订号对 `ids.join("\n")` 做 SHA-256，再转 base64url，确保客户端不能伪造旧顺序。

- [ ] 运行相关测试：

```bash
$NODE --test cloudflare-dashboard-api/test/works.test.js admin/dashboard/tvc/new/tests/api-client.test.js admin/dashboard/tvc/new/tests/form-model.test.js
```

- [ ] 提交：

```bash
git add cloudflare-dashboard-api admin/dashboard/tvc/new
git commit -m "Add TVC draft and order APIs"
```

---

## Task 4: Poster 校验、双规格转换、上传与绑定

**Files:**

- Create: `admin/dashboard/tvc/new/poster-processor.js`
- Create: `admin/dashboard/tvc/new/tests/poster-processor.test.js`
- Create: `cloudflare-dashboard-api/src/media.js`
- Create: `cloudflare-dashboard-api/test/media.test.js`
- Modify: `cloudflare-dashboard-api/src/index.js`
- Modify: `admin/dashboard/tvc/new/api-client.js`

**Interfaces:**

```js
export const POSTER_OUTPUTS = Object.freeze({
  desktop: { width: 1600, height: 900 },
  mobile: { width: 960, height: 540 },
});
export function validatePosterSource({ type, size, width, height })
export async function createPosterVariants(file, adapters)

export async function uploadPoster(request, env, workId, variant, identity)
export async function attachDraftMedia(request, env, workId, identity)
```

- [ ] **RED — 覆盖 MIME、20 MiB、最小尺寸、1% 比例容差和双输出。**

```js
test("rejects undersized or non-16:9 posters", () => {
  assert.throws(() => validatePosterSource({ type: "image/jpeg", size: 100, width: 1200, height: 800 }), /1600 × 900/);
  assert.throws(() => validatePosterSource({ type: "image/jpeg", size: 100, width: 1600, height: 1000 }), /16:9/);
});

test("produces exact desktop and mobile WebP variants", async () => {
  const result = await createPosterVariants(file, fakeCanvasAdapters());
  assert.deepEqual(result.map(({ variant, width, height, type }) => ({ variant, width, height, type })), [
    { variant: "desktop", width: 1600, height: 900, type: "image/webp" },
    { variant: "mobile", width: 960, height: 540, type: "image/webp" },
  ]);
});
```

Worker 测试必须拒绝错误 variant、非 WebP、任意 work ID/object key，并验证对象 custom metadata 的 work ownership。

- [ ] **GREEN — Canvas 中心裁切和草稿归属上传。**

转换算法使用 `createImageBitmap`，按 `scale = Math.max(targetWidth/sourceWidth, targetHeight/sourceHeight)` 居中绘制，再 `canvas.convertToBlob({ type: "image/webp", quality: 0.86 })`；不上传原图。

Poster endpoint 由 URL 决定 `workId` 与 `variant`，对象 key 固定生成在：

```text
portfolio/tvc/<workId>/poster-desktop-<uuid>.webp
portfolio/tvc/<workId>/poster-mobile-<uuid>.webp
```

`PUT /media` 只接受该草稿的已完成服务器 key，逐个 `MEDIA.head` 并检查 `section/workId/variant` metadata 后，以 version 乐观锁绑定。

- [ ] 运行测试：

```bash
$NODE --test admin/dashboard/tvc/new/tests/poster-processor.test.js cloudflare-dashboard-api/test/media.test.js
```

- [ ] 提交：

```bash
git add admin/dashboard/tvc/new cloudflare-dashboard-api
git commit -m "Add TVC poster processing and binding"
```

---

## Task 5: 视频校验、指纹和可恢复分片上传

**Files:**

- Create: `admin/dashboard/tvc/new/video-validation.js`
- Create: `admin/dashboard/tvc/new/multipart-upload.js`
- Create: `admin/dashboard/tvc/new/tests/video-validation.test.js`
- Create: `admin/dashboard/tvc/new/tests/multipart-upload.test.js`
- Create: `cloudflare-dashboard-api/src/uploads.js`
- Create: `cloudflare-dashboard-api/test/uploads.test.js`
- Modify: `cloudflare-dashboard-api/src/index.js`
- Modify: `admin/dashboard/tvc/new/api-client.js`

**Interfaces:**

```js
export const VIDEO_LIMITS = Object.freeze({ maxBytes: 2 * 1024 ** 3, maxLongEdge: 1920, maxShortEdge: 1080 });
export function validateVideoFile(file, metadata)
export function videoFingerprint(file)
export function sameFingerprint(left, right)
export function createMultipartUploader({ api, partSize = 10 * 1024 ** 2, concurrency = 3 })
```

- [ ] **RED — 验证格式/大小/分辨率和恢复边界。**

```js
test("rejects video above the 1080p envelope", () => {
  assert.throws(() => validateVideoFile(mp4, { width: 2560, height: 1440 }), /1080p/);
});

test("fingerprint uses no file bytes", () => {
  assert.deepEqual(videoFingerprint(mp4), {
    name: mp4.name, size: mp4.size, type: mp4.type, lastModified: mp4.lastModified,
  });
});

test("uploads at most three parts and resumes acknowledged etags", async () => {
  const result = await uploader.resume(file, sessionWithParts([1, 2]));
  assert.equal(api.maximumObservedConcurrency, 3);
  assert.deepEqual(result.parts.slice(0, 2).map((part) => part.partNumber), [1, 2]);
});
```

- [ ] **GREEN — 实现 10 MiB 分片、并发 3、重试/取消/恢复。**

上传器对每个 part 最多重试 3 次（仅网络错误、408、429、5xx；带 250/500/1000ms 抖动退避），将服务器确认的 `{partNumber, etag}` 交给状态持久层。取消时终止本地 `AbortController` 并调用 Worker abort endpoint。

Worker 创建 session 时验证草稿存在且属于 TVC/draft，生成固定前缀 key；part 路由从 D1 session 查出 object key，不接受浏览器传入 key。complete 必须校验 part 从 1 连续递增、无重复、数量不超过 10,000、actor 匹配、session 状态可完成，随后写 audit log。

- [ ] 运行上传测试：

```bash
$NODE --test admin/dashboard/tvc/new/tests/video-validation.test.js admin/dashboard/tvc/new/tests/multipart-upload.test.js cloudflare-dashboard-api/test/uploads.test.js
```

- [ ] 提交：

```bash
git add admin/dashboard/tvc/new cloudflare-dashboard-api
git commit -m "Add resumable TVC video upload"
```

---

## Task 6: 服务器端完整性校验、原子发布与公共缓存失效

**Files:**

- Create: `cloudflare-dashboard-api/src/publish.js`
- Create: `cloudflare-dashboard-api/src/public-cache.js`
- Create: `cloudflare-dashboard-api/test/publish.test.js`
- Modify: `cloudflare-dashboard-api/src/index.js`

**Interfaces:**

```js
export async function publishTvcDraft(request, env, workId, identity)
export async function validatePublishableDraft(env, work, submitted)
export async function invalidatePublicWorksCache(cachesRef = caches)
export const PUBLIC_WORKS_CACHE_KEY = "https://api.kjoe.top/api/public/works";
```

- [ ] **RED — 发布前缺任一字段/媒体、版本冲突或顺序变化都不得写入。**

```js
test("does not publish incomplete drafts", async () => {
  const response = await publish({ poster_mobile_key: null });
  assert.equal(response.status, 422);
  assert.equal(db.batchCalls, 0);
});

test("rejects stale order revision without partial reorder", async () => {
  const response = await publishComplete({ orderRevision: "stale" });
  assert.equal(response.status, 409);
  assert.deepEqual(db.orders, originalOrders);
});

test("invalidates the fixed public API cache key after batch success", async () => {
  await publishComplete(validRequest);
  assert.deepEqual(cache.deleted, ["https://api.kjoe.top/api/public/works"]);
});
```

- [ ] **GREEN — 一次 D1 batch 完成重排、发布、版本和审计。**

服务器重新读取 published TVC order 并比对修订号；`insertBeforeId` 为 null 时追加，否则目标必须仍存在。将新顺序映射为连续整数，并构造：

```js
await env.DB.batch([
  ...orderedIds.map((id, index) => env.DB.prepare("UPDATE works SET sort_order = ? WHERE id = ? AND section = 'tvc'").bind(index, id)),
  env.DB.prepare("UPDATE works SET status = 'published', published_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = ? AND status = 'draft' AND version = ?").bind(workId, version),
  env.DB.prepare("INSERT INTO audit_log (actor_email, action, entity_type, entity_id, details_json) VALUES (?, 'publish', 'work', ?, ?)").bind(identity.email, workId, JSON.stringify({ insertBeforeId })),
]);
```

在 batch 成功后使用固定 API origin cache key 失效；失效失败记录错误并返回成功发布结果，不能回报作品仍是草稿。响应包含新 version、sortOrder 与 `redirectUrl: "/admin/dashboard/?highlight=<encoded-id>"`。

- [ ] 运行发布测试和全部 Worker 回归：

```bash
$NODE --test cloudflare-dashboard-api/test/*.test.js cloudflare-portfolio-api/test/*.test.js
```

- [ ] 提交：

```bash
git add cloudflare-dashboard-api
git commit -m "Add atomic TVC publication"
```

---

## Task 7: 草稿持久化、状态机、预览和确认模型

**Files:**

- Create: `admin/dashboard/tvc/new/draft-persistence.js`
- Create: `admin/dashboard/tvc/new/create-controller.js`
- Create: `admin/dashboard/tvc/new/preview-renderer.js`
- Create: `admin/dashboard/tvc/new/confirmation-panel.js`
- Create: `admin/dashboard/tvc/new/tests/draft-persistence.test.js`
- Create: `admin/dashboard/tvc/new/tests/create-controller.test.js`
- Create: `admin/dashboard/tvc/new/tests/preview-renderer.test.js`
- Create: `admin/dashboard/tvc/new/tests/confirmation-panel.test.js`

**Interfaces:**

```js
export const STORAGE_KEY = "kjoe.dashboard.tvcDraft.v1";
export function loadDraftState(storage)
export function saveDraftState(storage, state)
export function clearDraftState(storage)
export function createTvcController(dependencies)
export function renderBoundPreview(documentRef, work)
export function createPublishConfirmation(documentRef, callbacks)
```

- [ ] **RED — 本地只存元数据，刷新恢复为 needs-reselect，发布绝不自动执行。**

```js
test("persistence strips blobs and file objects", () => {
  saveDraftState(storage, { draftId: "w1", videoFile: file, fingerprint, multipart });
  assert.doesNotMatch(storage.value, /video bytes/);
  assert.equal(JSON.parse(storage.value).videoFile, undefined);
});

test("restored incomplete upload requires the same file", async () => {
  const state = await controller.restore(savedMultipart);
  assert.equal(state.video.status, "needs-reselect");
});

test("opening confirmation never publishes", async () => {
  await controller.openPublishConfirmation();
  assert.equal(api.publishCalls, 0);
});
```

- [ ] **GREEN — 建立单一状态模型和可重试动作。**

控制器公开 `saveDraftText`、`selectPoster`、`selectVideo`、`resumeVideo`、`cancelVideo`、`loadPreview`、`selectPosition`、`openPublishConfirmation`、`confirmPublish`。每个动作只更新自己的状态分支；401/403 锁止写入，409 重新载入 draft/order 并清除旧确认，网络失败保留已完成数据。

预览节点全部用 `createElement`、`textContent` 和属性赋值，不拼接用户输入 HTML。视频 `src` 只使用 Worker 返回且通过 `https://media.kjoe.top/` 前缀校验的 URL。

- [ ] 运行状态层测试：

```bash
$NODE --test admin/dashboard/tvc/new/tests/draft-persistence.test.js admin/dashboard/tvc/new/tests/create-controller.test.js admin/dashboard/tvc/new/tests/preview-renderer.test.js admin/dashboard/tvc/new/tests/confirmation-panel.test.js
```

- [ ] 提交：

```bash
git add admin/dashboard/tvc/new
git commit -m "Add TVC draft workflow state"
```

---

## Task 8: 创建页 UI、桌面/移动端规则和完整流程接线

**Files:**

- Create: `admin/dashboard/tvc/new/index.html`
- Create: `admin/dashboard/tvc/new/create.css`
- Create: `admin/dashboard/tvc/new/main.js`
- Create: `admin/dashboard/tvc/new/tests/page-contract.test.js`
- Modify: `admin/dashboard/dashboard.css`

**Interfaces:**

```js
export function createCreationPage(documentRef, controller)
export function isDesktopUploadViewport(matchMediaImpl = matchMedia)
```

- [ ] **RED — 页面结构、无原生 confirm、移动端不出现文件输入。**

```js
test("creation page renders every approved step", () => {
  const page = createCreationPage(fakeDocument, controller);
  for (const marker of ["data-draft-form", "data-poster-step", "data-video-step", "data-preview", "data-position", "data-publish-panel"]) {
    assert.ok(page.querySelector(`[${marker}]`));
  }
  assert.equal(controller.nativeConfirmCalls, 0);
});

test("mobile mode removes media inputs from the interaction tree", () => {
  const page = renderAtWidth(390);
  assert.equal(page.querySelector('input[type="file"]'), null);
  assert.match(page.textContent, /请在桌面端选择 Poster 和视频/);
});
```

- [ ] **GREEN — 接线创建、上传、预览、位置与确认流程。**

页面沿用 Dashboard 的清晰后台样式，不追求前台视觉统一。步骤区展示独立状态和重试按钮；上传进度同时显示百分比和已传/总字节。位置选择用最新 `/tvc/order` 数据生成“置于 X 之前”和“追加到末尾”，不允许自由输入 ID。

桌面断点使用 `(min-width: 768px)`。小于断点时，JS 不创建 file input，而非仅 CSS 隐藏；已完成草稿仍显示预览、位置和发布确认。所有触控目标最小 44px，焦点可见。

成功发布后只使用 Worker 返回的同源 redirect path：

```js
location.assign(result.redirectUrl);
```

- [ ] 运行全部新前端测试及静态语法检查：

```bash
$NODE --test admin/dashboard/tvc/new/tests/*.test.js admin/dashboard/tests/*.test.js
for file in admin/dashboard/tvc/new/*.js; do $NODE --check "$file"; done
```

- [ ] 提交：

```bash
git add admin/dashboard
git commit -m "Build TVC creation interface"
```

---

## Task 9: 集成回归、浏览器验收与 V0.24 发布准备

**Files:**

- Modify: `README.md`
- Modify: `docs/minimal-admin-dashboard.md`
- Create: `docs/tvc-upload-runbook.md`
- Modify: `index.html`
- Modify: `admin/dashboard/tests/dashboard-contract.test.js`
- Create: `cloudflare-dashboard-api/README.md`

**Interfaces and deployment variables to document:**

```text
ACCESS_TEAM_DOMAIN
ACCESS_AUD
ACCESS_ISSUER
ADMIN_EMAILS
MEDIA_PUBLIC_URL=https://media.kjoe.top
DB binding=existing portfolio D1
MEDIA binding=kjoe-portfolio-media
Worker route=kjoe.top/admin/dashboard/api/*
Public cache key=https://api.kjoe.top/api/public/works
```

- [ ] **RED — 先运行全部功能测试，确认代码仍停留在 V0.23 且不存在由文档文本决定成败的自动化测试。**

版本文字和 README 属于发布清单，由实施者逐项人工核对；自动化测试只验证可观察的程序行为，不用正则读取 HTML/Markdown 文本。

- [ ] 运行完整自动化套件：

```bash
NODE=/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
$NODE --test \
  admin/tests/*.test.js \
  admin/dashboard/tests/*.test.js \
  admin/dashboard/tvc/new/tests/*.test.js \
  cloudflare-portfolio-api/test/*.test.js \
  cloudflare-dashboard-api/test/*.test.js \
  tests/*.test.js
```

- [ ] 用本地 Worker fixtures 验证完整路径：创建 draft → 两张 Poster 绑定 → 分片断线/同文件恢复 → 视频绑定 → 预览 → 选位置 → 打开确认但不发布 → 确认发布 → Dashboard 高亮。

- [ ] 浏览器验收（不连接生产写接口）：

```text
1440px Chrome：全流程、键盘、进度、预览、确认
1280px Safari：Poster 转换、视频元数据、刷新恢复
390 × 844 Safari：无文件输入、可预览完成草稿并确认发布
所有视口：无横向溢出、焦点可见、触控目标 >= 44px
```

- [ ] 回归旧系统：

```text
/admin/ 未改动
api.kjoe.top/api/admin/* 行为未改动
https://api.kjoe.top/api/public/works 可读取
现有 TVC/直播作品顺序与播放未因本地 fixtures 改变
```

- [ ] **GREEN — 仅在上述验证通过后更新版本文档。**

将可见版本由 V0.23 更新为 V0.24，更新变更资产的 cache-busting；runbook 明确部署顺序、Access audience 获取、secrets 设置、精确 Worker route、冒烟检查和回滚步骤。不得在文档中记录真实 secret。

- [ ] 运行最终测试并检查工作区差异：

```bash
$NODE --test admin/tests/*.test.js admin/dashboard/tests/*.test.js admin/dashboard/tvc/new/tests/*.test.js cloudflare-portfolio-api/test/*.test.js cloudflare-dashboard-api/test/*.test.js tests/*.test.js
git diff --check
git status --short
```

- [ ] 提交本地 V0.24 实现：

```bash
git add README.md docs index.html admin cloudflare-dashboard-api
git commit -m "Prepare V0.24 TVC publishing workflow"
```

- [ ] **停止点 — 不执行以下操作，直到用户明确说“发布”。**

```text
不 push GitHub
不部署 Dashboard Worker
不修改 Cloudflare Access
不上传真实媒体
不创建或发布生产作品
```

## Implementation Completion Gate

只有以下条件同时满足，才能报告实现完成：

- [ ] 所有新旧自动化测试通过。
- [ ] Dashboard 数量完全由接口数据计算。
- [ ] 草稿不会因上传完成而自动发布。
- [ ] Poster 两个 WebP 规格都绑定到同一草稿。
- [ ] 视频可在同文件重选后恢复，换文件会被拒绝。
- [ ] 服务器独立验证发布完整性、版本和顺序修订号。
- [ ] 发布写入为一个 D1 batch，公共 cache key 正确失效。
- [ ] 移动端不创建文件输入，但能处理完整草稿的预览和发布。
- [ ] 旧后台、旧管理 API 和公共前台通过回归。
- [ ] V0.24 版本、cache-busting、README 与 runbook 一致。
- [ ] 未经授权没有任何生产写入或部署。
