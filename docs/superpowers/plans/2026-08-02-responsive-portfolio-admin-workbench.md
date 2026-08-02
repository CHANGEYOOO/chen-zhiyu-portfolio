# Responsive Portfolio Admin Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the migrated modal-based portfolio admin with a responsive desktop/mobile workbench that supports complete local image and multipart video upload workflows, sorting, preview, draft recovery, publishing, and recoverable failure states.

**Architecture:** Keep the existing vanilla HTML/CSS/JavaScript and Cloudflare Access/D1/R2/Worker API. Split pure state and view-model logic out of `admin.js`, extend the existing upload manager instead of replacing it, and render one responsive shell that becomes a list/editor split view at 1024px and a list-to-full-screen-editor flow below 1024px.

**Tech Stack:** Semantic HTML, native CSS, ES modules, Node built-in test runner, Cloudflare Worker API, D1, R2 multipart upload, localStorage.

## Global Constraints

- Do not introduce a framework, build step, package manager dependency, or remote font.
- New media input must only accept local files; do not add URL fields.
- Desktop and mobile must both support image and video uploads.
- TVC fields remain brand name, film title, work type, poster, and video.
- Livestream fields remain livestream name, type, and an unlimited business count of ordered images; the first image is the cover.
- Preserve the existing API routes, D1 schema, R2 bucket, Access authentication, current work data, and front-end static fallback.
- Do not physically delete D1 records or R2 objects; implement archive/restore semantics only.
- Keep existing multipart constants at 10 MiB parts and at most 3 concurrent parts unless a current test proves otherwise.
- Do not promise background upload after iOS terminates the browser; provide recoverable resume after reopening and reselecting the same file.
- Keep all primary touch targets at least 44×44px and account for `env(safe-area-inset-bottom)`.
- Support `prefers-reduced-motion` and use only short state transitions.
- Do not publish production changes in this plan.

---

## File Map

**Create:**

- `admin/workbench-state.js` — filters, selection, dirty state, publish readiness, and view-mode transitions.
- `admin/workbench-view.js` — DOM rendering for work rows, status summaries, empty states, and upload queue items.
- `admin/confirm-panel.js` — accessible non-native confirmation panel controller.
- `admin/preview-panel.js` — read-only TVC/Livestream preview controller.
- `admin/tests/workbench-state.test.js` — pure state and publish-readiness tests.
- `admin/tests/workbench-view.test.js` — view-model and text-output tests without third-party DOM libraries.
- `admin/tests/confirm-panel.test.js` — confirmation lifecycle and action tests with a small fake element harness.
- `admin/tests/preview-panel.test.js` — preview model tests.

**Modify:**

- `admin/index.html` — semantic workbench shell, list/editor views, upload drawer, preview, confirmation panel.
- `admin/admin.css` — responsive workbench visual system and state styles.
- `admin/admin.js` — orchestration, event binding, save/upload/publish flows, network and leave protection.
- `admin/upload-manager.js` — pause, resume, waiting-network, persisted recovery descriptors, list/recover APIs.
- `admin/draft-store.js` — dirty metadata, pending upload descriptors, and recovery helpers.
- `admin/api-client.js` — explicit unpublish/restore-compatible update helpers and normalized auth/conflict errors.
- `admin/sortable-list.js` — mobile long-press safety and work-list reuse where needed.
- Existing tests under `admin/tests/` — preserve and extend current contracts.
- `prototype/docs/portfolio-admin-user-guide.md` if present in this worktree, otherwise create `docs/portfolio-admin-user-guide.md` — updated operating instructions.
- `docs/cloudflare-admin-deployment.md` — record that this is an admin-page-only redesign with no Worker route change.
- `/Users/joekuni/Documents/New project/前端工程师同步日志｜2026-08-01.md` — append the final implementation and verification summary.

---

### Task 1: Workbench state model

**Files:**

- Create: `admin/workbench-state.js`
- Create: `admin/tests/workbench-state.test.js`

**Interfaces:**

- Produces: `createWorkbenchState()`, `filterWorks(works, filters)`, `workCompleteness(work, uploads)`, `publishReadiness(work, uploads)`, `hasUnsafeExit(state)`, `transitionView(state, action)`.
- Consumes: work records already returned by `PortfolioApi.listWorks()` and upload item shapes already used by `admin.js`.

- [ ] **Step 1: Write failing state tests**

Cover exact behavior:

```js
assert.deepEqual(filterWorks(works, { section: "tvc", status: "published", query: "nike" }).map((work) => work.id), ["tvc-1"]);
assert.equal(publishReadiness({ section: "tvc", brand_name: "Nike", work_title: "Film", work_type: "TVC", poster_key: "p", video_key: "v" }, []).ready, true);
assert.deepEqual(publishReadiness({ section: "livestream", work_title: "Show", work_type: "直播", work_images: [] }, []).missing, ["项目图片"]);
assert.equal(hasUnsafeExit({ dirty: true, activeUploadCount: 0 }), true);
assert.equal(transitionView(createWorkbenchState(), { type: "OPEN_EDITOR", workId: "w1" }).view, "editor");
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test admin/tests/workbench-state.test.js
```

Expected: FAIL because `workbench-state.js` does not exist.

- [ ] **Step 3: Implement the pure state model**

Use plain objects; do not read or write DOM or localStorage. `publishReadiness()` must return `{ ready, missing }`, and `filterWorks()` must match brand name, work title, and work type case-insensitively.

- [ ] **Step 4: Run focused and existing tests**

Run:

```bash
/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test admin/tests/workbench-state.test.js admin/tests/draft-store.test.js admin/tests/image-order.test.js
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add admin/workbench-state.js admin/tests/workbench-state.test.js
git commit -m "Add portfolio workbench state model"
```

### Task 2: Recoverable draft and upload descriptors

**Files:**

- Modify: `admin/draft-store.js`
- Modify: `admin/upload-manager.js`
- Modify: `admin/tests/draft-store.test.js`
- Modify: `admin/tests/upload-manager.test.js`

**Interfaces:**

- `DraftStore.save(workId, value)` continues to save serializable form data.
- Add `DraftStore.list()`, `DraftStore.saveRecovery(workId, value)`, `DraftStore.loadRecovery(workId)`, `DraftStore.clearRecovery(workId)`.
- Add `UploadManager.pause(file, context)`, `UploadManager.resume(file, context, onProgress)`, `UploadManager.listRecoverable()`, `UploadManager.setOnline(online)`.
- Progress callback states are exactly: `ready`, `processing`, `uploading`, `paused`, `waiting-network`, `failed`, `complete`, `cancelled`.

- [ ] **Step 1: Extend failing tests**

Add tests proving:

```js
manager.setOnline(false);
await assert.rejects(manager.uploadVideo(file, context, onProgress), /waiting for network/i);
assert.equal(events.at(-1).state, "waiting-network");

const paused = manager.uploadVideo(file, context, onProgress);
await manager.pause(file, context);
await assert.rejects(paused, /paused/i);
assert.equal(events.at(-1).state, "paused");
assert.equal(manager.listRecoverable().length, 1);
```

Also assert that a recovery record excludes the `File` object and includes file name, size, lastModified, type, uploadId, objectKey, completed parts, section, and workId.

- [ ] **Step 2: Run tests and verify failure**

```bash
/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test admin/tests/draft-store.test.js admin/tests/upload-manager.test.js
```

Expected: FAIL for missing methods and states.

- [ ] **Step 3: Implement pause/network/recovery behavior**

Pause must abort active requests without calling the Worker abort endpoint or deleting persisted multipart state. Cancel must retain the existing abort behavior. Resume must validate `name`, `size`, `lastModified`, and `type` before reusing a session.

- [ ] **Step 4: Run tests**

Use the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin/draft-store.js admin/upload-manager.js admin/tests/draft-store.test.js admin/tests/upload-manager.test.js
git commit -m "Add recoverable portfolio uploads"
```

### Task 3: View models and semantic rendering helpers

**Files:**

- Create: `admin/workbench-view.js`
- Create: `admin/tests/workbench-view.test.js`

**Interfaces:**

- Produces `workRowModel(work)`, `uploadRowModel(item)`, `emptyStateModel(kind)`, `statusSummaryModel(state)`, and DOM render functions `renderWorkRows(root, models, handlers)` and `renderUploadRows(root, models, handlers)`.
- Handlers are passed in as `{ onEdit, onCopy, onPublish, onUnpublish, onArchive, onRestore, onPause, onResume, onRetry, onCancel }`.

- [ ] **Step 1: Write failing view-model tests**

Verify exact labels, media completeness text, status text, progress percentage clamping, and that Livestream first-image fallback becomes the thumbnail.

- [ ] **Step 2: Run and verify failure**

```bash
/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test admin/tests/workbench-view.test.js
```

- [ ] **Step 3: Implement view models and DOM render functions**

Do not build HTML strings from user content. Create elements and assign `textContent`. Meaningful thumbnails require descriptive alt text; decorative placeholders use CSS backgrounds.

- [ ] **Step 4: Run focused tests**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add admin/workbench-view.js admin/tests/workbench-view.test.js
git commit -m "Add responsive admin view models"
```

### Task 4: Replace the modal shell with the responsive workbench

**Files:**

- Modify: `admin/index.html`
- Modify: `admin/admin.css`

**Interfaces:**

- Preserve existing `data-*` hooks required by JavaScript until Task 7 rewires them.
- Add stable hooks: `data-workbench`, `data-work-browser`, `data-work-editor`, `data-upload-drawer`, `data-editor-back`, `data-mobile-actions`, `data-network-state`, `data-search`, `data-status-filter`, `data-new-tvc`, `data-new-livestream`.

- [ ] **Step 1: Write the semantic HTML shell**

Required structure:

```html
<header class="admin-topbar">…</header>
<main class="workbench" data-workbench>
  <section class="work-browser" data-work-browser>…</section>
  <section class="work-editor" data-work-editor hidden>…</section>
  <aside class="upload-drawer" data-upload-drawer hidden>…</aside>
</main>
```

Remove the `<dialog class="editor">` primary editor. Keep preview and confirmation overlays as dedicated accessible components, not nested dialogs.

- [ ] **Step 2: Implement desktop and mobile CSS**

At `min-width: 1024px`, render a two-column grid between 34/66 and 40/60. Below 1024px, show one full-width view at a time. Add the fixed mobile action bar with safe-area padding, 44px touch targets, status chips with text labels, upload progress bars, empty states, focus rings, and reduced-motion rules.

- [ ] **Step 3: Run static checks**

```bash
/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node -e "const fs=require('fs');const html=fs.readFileSync('admin/index.html','utf8');if(!html.includes('data-workbench')||html.includes('class=\"editor\"'))process.exit(1)"
git diff --check
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add admin/index.html admin/admin.css
git commit -m "Build responsive portfolio admin shell"
```

### Task 5: Confirmation and preview panels

**Files:**

- Create: `admin/confirm-panel.js`
- Create: `admin/preview-panel.js`
- Create: `admin/tests/confirm-panel.test.js`
- Create: `admin/tests/preview-panel.test.js`
- Modify: `admin/index.html`
- Modify: `admin/admin.css`

**Interfaces:**

- `createConfirmPanel({ root })` returns `{ open({ title, message, confirmLabel, tone, onConfirm }), close() }`.
- `createPreviewPanel({ root })` returns `{ open({ work, images, localUrls }), close() }`.
- Confirmation never calls `window.confirm`; preview is read-only.

- [ ] **Step 1: Write failing tests**

Test that confirm invokes the supplied callback only after confirmation, restores focus to the opener, and changes the dangerous label. Test TVC and Livestream preview models including first-image cover and ordered images.

- [ ] **Step 2: Run and verify failure**

```bash
/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test admin/tests/confirm-panel.test.js admin/tests/preview-panel.test.js
```

- [ ] **Step 3: Implement panels and markup**

Use a top-level fixed panel with `role="dialog"`, `aria-modal="true"`, labelled headings, Escape handling, explicit close buttons, and focus restoration. Do not use nested modals.

- [ ] **Step 4: Run tests and static checks**

Expected: PASS and `git diff --check` clean.

- [ ] **Step 5: Commit**

```bash
git add admin/confirm-panel.js admin/preview-panel.js admin/tests/confirm-panel.test.js admin/tests/preview-panel.test.js admin/index.html admin/admin.css
git commit -m "Add admin preview and confirmation panels"
```

### Task 6: API error and lifecycle normalization

**Files:**

- Modify: `admin/api-client.js`
- Modify: `admin/tests/api-client.test.js`

**Interfaces:**

- `PortfolioApiError` exposes `status`, `code`, `isAuth`, and `isConflict`.
- Add `setWorkStatus(workId, status, version)` as an explicit wrapper over `updateWork`.
- Existing API method signatures remain compatible.

- [ ] **Step 1: Write failing API tests**

Assert 401 maps to `isAuth === true`, 409/version mismatch maps to `isConflict === true`, and `setWorkStatus()` sends only status and version.

- [ ] **Step 2: Run and verify failure**

```bash
/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test admin/tests/api-client.test.js
```

- [ ] **Step 3: Implement normalization**

Do not change server routes. Preserve the server-provided Chinese error message when present.

- [ ] **Step 4: Run tests and commit**

```bash
/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test admin/tests/api-client.test.js
git add admin/api-client.js admin/tests/api-client.test.js
git commit -m "Normalize portfolio admin lifecycle errors"
```

### Task 7: Rewire the admin controller

**Files:**

- Modify: `admin/admin.js`
- Modify: `admin/index.html`
- Modify: `admin/admin.css`
- Test: all `admin/tests/*.test.js`

**Interfaces:**

- Consume Tasks 1–6 modules without duplicating their logic in `admin.js`.
- Preserve existing poster variant generation and media attachment payload behavior.

- [ ] **Step 1: Replace modal state with workbench selection state**

Selecting or creating a work opens the editor view. Desktop keeps the browser visible; mobile hides it and shows the editor. Back returns to the list after checking `hasUnsafeExit()`.

- [ ] **Step 2: Add filters and search**

Wire section, status, and query inputs through `filterWorks()`. Render counts and dedicated empty states. Add explicit “新增 TVC” and “新增 Livestream” actions; lock section after initial creation.

- [ ] **Step 3: Separate save, preview, and publish**

`saveDraft()` persists text without waiting for queued uploads. `preview` combines saved media with `URL.createObjectURL()` local previews. `publish` calls `publishReadiness()`, shows missing items or a change summary, then saves status `published` only after confirmation.

- [ ] **Step 4: Wire lifecycle actions**

Implement copy, unpublish to draft, archive, and restore to draft through the confirmation panel. No physical delete button or request is allowed.

- [ ] **Step 5: Wire global upload queue**

Uploads continue when changing selected works. Queue actions call pause/resume/retry/cancel. Group items by work id. Network events call `uploads.setOnline(navigator.onLine)` and move active tasks to `waiting-network` without discarding recovery data.

- [ ] **Step 6: Add recovery and leave protection**

On boot, restore drafts and upload descriptors. When a user reselects a file, verify metadata before continuing. Add `beforeunload` only when `hasUnsafeExit()` is true. Revoke object URLs when removed or page unloads.

- [ ] **Step 7: Preserve image ordering contracts**

Keep drag and up/down controls, explicit save/cancel ordering, first-image cover marker, and locked order while saving.

- [ ] **Step 8: Run the complete admin test suite**

```bash
/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test admin/tests/*.test.js
```

Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add admin/admin.js admin/index.html admin/admin.css
git commit -m "Wire responsive portfolio admin workflows"
```

### Task 8: Accessibility and responsive browser verification

**Files:**

- Modify only files required by findings from this task.

**Interfaces:**

- No new public interfaces; this task validates the complete workbench.

- [ ] **Step 1: Run static and unit verification**

```bash
/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check admin/admin.js
/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test admin/tests/*.test.js
git diff --check
```

- [ ] **Step 2: Verify desktop at 1440px**

Confirm split list/editor layout, visible status/search/filter controls, persistent upload drawer, save/preview/publish separation, focus order, no native dialogs, and no horizontal overflow.

- [ ] **Step 3: Verify mobile at 390×844**

Confirm local image/video file inputs are usable, editor is full-screen, bottom action bar respects safe area, touch targets are at least 44px, image reorder works by buttons and touch, queue actions remain reachable, and no content is obscured by the keyboard or fixed controls.

- [ ] **Step 4: Verify reduced motion and keyboard use**

Confirm no required information depends on hover; Tab/Shift+Tab, Enter, Space, Escape, and arrow/button reorder paths work; status changes do not over-announce.

- [ ] **Step 5: Fix only verified findings and rerun checks**

Any code change must be accompanied by the closest existing or new focused test when the behavior is testable without a browser.

- [ ] **Step 6: Commit**

```bash
git add admin
git commit -m "Polish responsive portfolio admin accessibility"
```

### Task 9: Documentation and handoff

**Files:**

- Create or modify: `docs/portfolio-admin-user-guide.md`
- Modify: `docs/cloudflare-admin-deployment.md`
- Modify: `/Users/joekuni/Documents/New project/前端工程师同步日志｜2026-08-01.md`

**Interfaces:**

- Documentation must describe only verified behavior and must not expose Worker secrets.

- [ ] **Step 1: Update the user guide**

Document desktop and phone flows for TVC, Livestream, image ordering, upload pause/resume, reselecting a file after reopening, preview, publish, unpublish, archive, and restore.

- [ ] **Step 2: Update deployment and synchronization records**

Record changed files, test commands, browser viewports, known iOS background-upload limitation, and that no production deployment or media deletion occurred.

- [ ] **Step 3: Run final verification**

```bash
/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --check admin/admin.js
/Users/joekuni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test admin/tests/*.test.js
git diff --check
git status --short
```

- [ ] **Step 4: Commit repository documentation**

Stage only repository files. The workspace-level synchronization log remains outside this Git repository and must not be included in the repository commit.

```bash
git add docs/portfolio-admin-user-guide.md docs/cloudflare-admin-deployment.md
git commit -m "Document responsive portfolio admin workflow"
```

## Completion Gate

Implementation is complete only when:

- all nine tasks are committed separately or with a clearly documented justified merge of adjacent tasks;
- all Node tests pass;
- desktop and 390×844 browser verification pass;
- no current work data, R2 object, D1 record, Supabase resource, Access policy, DNS record, or production route was deleted;
- no production publish occurred;
- the workspace synchronization log contains the verified implementation summary.
