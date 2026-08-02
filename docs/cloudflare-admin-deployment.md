# Cloudflare portfolio admin deployment

Deployment record: 2026-08-02

## Provisioned resources

- Worker: `kjoe-portfolio-api` (deployed to production on the `api.kjoe.top/*` route).
- Worker compatibility date: `2026-08-01`.
- D1: `kjoe-portfolio-content` (`42b6c0fa-8994-4dfc-97eb-c3449e559bb8`), created in APAC.
- R2 binding: `MEDIA` -> existing `kjoe-portfolio-media` bucket.
- D1 binding: `DB` -> `kjoe-portfolio-content`.
- Production route configured in `cloudflare-portfolio-api/wrangler.toml`: `api.kjoe.top/*`.

## Database state

Applied remotely, in order:

1. `migrations/0001_portfolio.sql`
2. `migrations/0002_upload_sessions.sql`
3. `migrations/0003_media_variants.sql`

The validated manifest was imported successfully. Wrangler/D1 rejects the source file's `BEGIN` / `COMMIT` wrapper, so the same 93 unmodified upsert statements were executed without comments or that wrapper.

Verified remote counts:

- TVC: 30
- Livestream: 8
- Livestream images: 55

## Access and deployment status

Both production surfaces are now protected by Cloudflare Access with email OTP and an Allow policy restricted to the confirmed administrator account:

- `https://kjoe.top/admin*` — browser admin page;
- `https://api.kjoe.top/api/admin/*` — API admin routes.

The team previously had the Cloudflare account identity provider enabled, which caused a non-member Cloudflare account to receive `That account does not have access.` The Cloudflare identity provider was removed and the built-in `One-time PIN` provider was enabled. Both production login pages now show an email field and `Send login code`.

The API Worker has the Access audience allowlist, administrator email allowlist, and Access team-domain configuration stored as Wrangler Worker Secrets. None of those values are present in tracked files or browser configuration.

The Worker code deployment is version `8bea271a-ccbf-4e29-a3f4-7ee26750be9d`; the subsequent production versions are secret-only changes and continue routing 100% of traffic to the Worker. The production route remains `api.kjoe.top/*`.

Production checks completed after authorization:

- `GET https://api.kjoe.top/api/public/works` → `200`, JSON payload, CORS for `https://kjoe.top`;
- `GET https://api.kjoe.top/api/admin/works` → `302` to the Cloudflare Access login and includes the Access resource-metadata header.

No disposable upload or archive test was created, so no test object needs cleanup. Authenticated admin CRUD, image/multipart upload, media Range, and archive-draft checks remain optional follow-up QA when a disposable test record is explicitly approved.

## Follow-up QA (optional)

1. Sign in to the protected admin page with email OTP.
2. If desired, approve one disposable test record and verify `/api/admin/session`, image upload, multipart-video upload, media Range, and archive behavior.
3. Remove only the disposable database record and its test objects after verification; do not delete production works or the R2 bucket.

## Rollback

After a deployment, list available Worker versions in the Cloudflare dashboard, select the previously healthy version ID, then run:

```bash
wrangler rollback <previous-version-id> --name kjoe-portfolio-api --message "Restore previous portfolio API"
```

The D1 import is idempotent and does not delete source media. Do not delete the D1 database, the R2 bucket, Supabase resources, or test objects as part of rollback.

---

## Responsive Portfolio Admin Workbench 实施记录

日期：2026-08-02  
分支：`codex/cinematic-v2`  
提交范围：`cd7c53c..d4a06ad`

### 改动文件清单

| 文件 | 变更类型 |
|---|---|
| `admin/admin-controller.js` | 新增（111 行）：纯函数控制器合约 |
| `admin/admin.css` | 修改（+154 行）：响应式工作台样式 |
| `admin/admin.js` | 修改（+1170/−341 行）：重构为模块化工作台主入口 |
| `admin/api-client.js` | 修改（+6 行）：适配新接口 |
| `admin/confirm-panel.js` | 新增（50 行）：自定义确认弹窗 |
| `admin/draft-store.js` | 新增（33 行）：草稿 localStorage 持久化 |
| `admin/index.html` | 修改（+143 行）：工作台双栏布局与上传抽屉 |
| `admin/preview-panel.js` | 新增（167 行）：只读预览面板 |
| `admin/upload-manager.js` | 修改（+88 行）：分片续传、断网恢复与队列管理 |
| `admin/workbench-state.js` | 新增（86 行）：视图状态与发布完备性检查 |
| `admin/workbench-view.js` | 新增（217 行）：DOM 渲染视图模型 |
| `admin/tests/*`（13 个测试文件） | 新增/更新：共计 2769 行，136 个测试 |

### 测试命令与结果

```bash
node --test admin/tests/*.test.js
```

结果：136/136 通过，0 失败。

### 响应式设计要点

- **桌面端（≥1024px）**：左侧作品列表 + 右侧编辑面板，底部浮层上传队列，操作按钮置于编辑器内。
- **移动端（<1024px / 390×844 设计基准）**：单栏切换布局，底部固定操作栏提供返回、保存、预览、发布按钮；触摸目标最小 44×44px；上传队列与确认弹窗适配窄屏。
- **可访问性**：所有交互元素支持 `:focus-visible` 焦点指示，弹窗使用 `role="dialog"` 与 `aria-modal`，屏幕阅读器专用 `.sr-only` 类，状态变更通过 `aria-live` 播报。
- **减少动效**：`prefers-reduced-motion: reduce` 下关闭过渡动画。

### 部署状态

- **未部署 Worker**：本次仅为前端管理页面代码变更，Worker `kjoe-portfolio-api` 未重新部署，版本 ID 保持不变。
- **未改生产路由**：`api.kjoe.top/*` 路由与 Cloudflare Access 配置未变更。
- **未做物理删除**：后台不提供作品删除操作，仅支持草稿 ↔ 已发布 ↔ 已归档状态流转。

### 已知限制

- **iOS 后台上传**：iOS Safari 在锁屏或后台时可能暂停网页运行，导致视频分片上传中断；建议上传大文件时保持浏览器前台。

### 下一步（可选 QA）

1. 桌面端 1440px 视口下登录管理后台，验证新增/编辑流程与 Sticky 编辑器滚动行为。
2. 移动端 390×844 浏览器（iOS Safari / Chrome）验证触摸排序、文件选择与底部操作栏。
