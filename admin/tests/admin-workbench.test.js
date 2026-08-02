import test from "node:test";
import assert from "node:assert/strict";

// ── 7A-2 wiring contracts: integration chains between modules ──

import { createClientWork, emptyStateKind, lifecycleConfirmation, networkStatusModel, previewLocalUrlKey, publishChangeSummary } from "../admin-controller.js";
import { createWorkbenchState, filterWorks, workCompleteness, publishReadiness, hasUnsafeExit, transitionView } from "../workbench-state.js";
import { workRowModel, emptyStateModel, statusSummaryModel } from "../workbench-view.js";

// ── createClientWork → filterWorks → workRowModel chain ──

test("createClientWork → filterWorks → workRowModel integrates the work list pipeline", () => {
  const tvc = createClientWork("tvc", "tvc-new");
  tvc.brand_name = "Nike";
  tvc.work_title = "Run Free";
  tvc.work_type = "TVC";
  tvc.status = "draft";

  const live = createClientWork("livestream", "live-new");
  live.work_title = "Night Show";
  live.work_type = "直播";

  const works = [tvc, live];

  assert.deepEqual(filterWorks(works, { section: "tvc" }).map((w) => w.id), ["tvc-new"]);
  assert.deepEqual(filterWorks(works, { section: "livestream" }).map((w) => w.id), ["live-new"]);
  assert.deepEqual(filterWorks(works, { query: "run" }).map((w) => w.id), ["tvc-new"]);
  assert.deepEqual(filterWorks(works, { status: "draft" }).map((w) => w.id), ["tvc-new", "live-new"]);

  const model = workRowModel(tvc);
  assert.equal(model.id, "tvc-new");
  assert.equal(model.sectionLabel, "TVC");
  assert.equal(model.title, "Run Free");
  assert.equal(model.brand, "Nike");
  assert.match(model.completenessText, /缺/);
});

// ── emptyStateKind → emptyStateModel chain ──

test("emptyStateKind → emptyStateModel produces the correct rendering model for each empty scenario", () => {
  const fixture = (overrides = {}) => ({
    total: 0,
    filteredCount: 0,
    statusFilter: "all",
    section: "",
    imageCount: 0,
    ...overrides,
  });

  assert.equal(emptyStateKind(fixture({ total: 0 })), "works");
  assert.deepEqual(emptyStateModel("works"), { title: "暂无作品", hint: "新增 TVC 或 Livestream 开始管理作品。" });

  assert.equal(emptyStateKind(fixture({ total: 5, filteredCount: 0 })), "filtered");
  assert.deepEqual(emptyStateModel("filtered"), { title: "没有符合筛选条件的作品", hint: "清除筛选或更换搜索关键词。" });

  assert.equal(emptyStateKind(fixture({ total: 5, filteredCount: 0, statusFilter: "archived" })), "archived");
  assert.deepEqual(emptyStateModel("archived"), { title: "暂无已归档作品", hint: "归档作品会显示在这里。" });

  assert.equal(emptyStateKind(fixture({ section: "livestream", imageCount: 0, total: 5 })), "livestream-images");
  assert.deepEqual(emptyStateModel("livestream-images"), { title: "尚未添加项目图片", hint: "从设备选择图片；第一张将作为前台封面。" });
});

// ── lifecycleConfirmation → confirm panel contract ──

test("lifecycleConfirmation returns the confirm panel parameters for every lifecycle action", () => {
  const work = { work_title: "Test Film", status: "draft" };

  const publish = lifecycleConfirmation("publish", work);
  assert.equal(publish.title, "发布作品？");
  assert.match(publish.message, /Test Film/);
  assert.equal(publish.confirmLabel, "确认发布");
  assert.equal(publish.tone, "");
  assert.equal(publish.nextStatus, "published");

  const unpublish = lifecycleConfirmation("unpublish", { ...work, status: "published" });
  assert.equal(unpublish.nextStatus, "draft");
  assert.equal(unpublish.tone, "danger");

  const archive = lifecycleConfirmation("archive", { ...work, status: "published" });
  assert.equal(archive.nextStatus, "archived");
  assert.equal(archive.tone, "danger");

  const restore = lifecycleConfirmation("restore", { ...work, status: "archived" });
  assert.equal(restore.nextStatus, "draft");
  assert.equal(restore.tone, "");
});

test("lifecycleConfirmation rejects publish on archived and unsupported actions", () => {
  assert.throws(() => lifecycleConfirmation("publish", { status: "archived" }), /归档|恢复/);
  assert.throws(() => lifecycleConfirmation("delete", {}), TypeError);
  assert.throws(() => lifecycleConfirmation("copy", {}), TypeError);
});

// ── publishReadiness → publishChangeSummary publish flow ──

test("publishReadiness → publishChangeSummary integrates the publish guard and changelog", () => {
  const saved = { brand_name: "Nike", work_title: "Night Film", work_type: "TVC", status: "draft" };
  const draft = { brand_name: "Nike", work_title: "Dawn Film", work_type: "TVC", status: "draft" };

  const readiness = publishReadiness({ section: "tvc", ...saved }, []);
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.missing, ["海报", "视频"]);

  const ready = publishReadiness({ section: "tvc", brand_name: "Nike", work_title: "Film", work_type: "TVC", poster_key: "p", video_key: "v" }, []);
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.missing, []);

  const summary = publishChangeSummary(saved, draft);
  assert.deepEqual(summary, ["片名：Night Film → Dawn Film"]);
});

// ── previewLocalUrlKey → local URL map construction ──

test("previewLocalUrlKey generates consistent scoped keys for local URL map building", () => {
  const workId = "w-test-1";
  const localUrls = {};

  localUrls[previewLocalUrlKey({ workId, kind: "poster" })] = "blob:poster";
  localUrls[previewLocalUrlKey({ workId, kind: "video" })] = "blob:video";
  localUrls[previewLocalUrlKey({ workId, kind: "image", image: { id: "img-1" }, index: 0 })] = "blob:img-1";
  localUrls[previewLocalUrlKey({ workId, kind: "image", image: { sort_order: 3 }, index: 1 })] = "blob:img-3";

  assert.deepEqual(localUrls, {
    "w-test-1:poster": "blob:poster",
    "w-test-1:video": "blob:video",
    "w-test-1:image:img-1": "blob:img-1",
    "w-test-1:image:3": "blob:img-3",
  });
});

// ── networkStatusModel → status chip map ──

test("networkStatusModel maps online/offline to exact chip labels", () => {
  assert.deepEqual(networkStatusModel(true), { state: "online", label: "网络正常" });
  assert.deepEqual(networkStatusModel(false), { state: "offline", label: "离线，上传将等待网络" });
});

// ── hasUnsafeExit → view transition guard ──

test("hasUnsafeExit guards editor exit when dirty or uploads are active", () => {
  assert.equal(hasUnsafeExit({ dirty: true, activeUploadCount: 0 }), true);
  assert.equal(hasUnsafeExit({ dirty: false, activeUploadCount: 3 }), true);
  assert.equal(hasUnsafeExit({ dirty: false, activeUploadCount: 0 }), false);
});

// ── transitionView state machine ──

test("transitionView OPEN_EDITOR and CLOSE_EDITOR preserve state shape", () => {
  const initial = createWorkbenchState();
  assert.equal(initial.view, "workspace");
  assert.equal(initial.editorWorkId, "");

  const editing = transitionView(initial, { type: "OPEN_EDITOR", workId: "w1" });
  assert.equal(editing.view, "editor");
  assert.equal(editing.editorWorkId, "w1");

  const back = transitionView(editing, { type: "CLOSE_EDITOR" });
  assert.equal(back.view, "workspace");
});

// ── workCompleteness → workRowModel completeness chain ──

test("workCompleteness → workRowModel.completenessText uses the same missing labels", () => {
  const work = { id: "tvc-1", section: "tvc", work_title: "Film", work_type: "TVC" };
  const completeness = workCompleteness(work, []);
  const model = workRowModel(work);

  assert.equal(completeness.complete, false);
  assert.match(model.completenessText, /缺：品牌名、海报、视频/);

  const full = { id: "tvc-1", section: "tvc", brand_name: "Nike", work_title: "Film", work_type: "TVC", poster_key: "p", video_key: "v" };
  assert.equal(workCompleteness(full, []).complete, true);
  assert.equal(workRowModel(full).completenessText, "材料完整");
});

// ── createClientWork locks section ──

test("createClientWork locks section via writable:false and configurable:false", () => {
  const work = createClientWork("tvc", "w1");
  const desc = Object.getOwnPropertyDescriptor(work, "section");
  assert.equal(desc.writable, false);
  assert.equal(desc.configurable, false);
  assert.equal(work.section, "tvc");
  assert.throws(() => { work.section = "livestream"; }, TypeError);
  assert.equal(work.section, "tvc");
});

// ── statusSummaryModel → workbench view label contract ──

test("statusSummaryModel integrates view/dirty/uploads into a single status line", () => {
  const editorDirty = statusSummaryModel({ view: "editor", dirty: true, activeUploadCount: 0 });
  assert.equal(editorDirty.text, "编辑器 · 有未保存修改");

  const workspaceClean = statusSummaryModel({ view: "workspace", dirty: false, activeUploadCount: 0 });
  assert.equal(workspaceClean.text, "作品列表 · 所有修改已保存");
});

// ── filterWorks with all three filters combined ──

test("filterWorks combines section, status, and query in a single call", () => {
  const works = [
    { id: "a", section: "tvc", status: "draft", brand_name: "Nike" },
    { id: "b", section: "tvc", status: "published", brand_name: "Adidas" },
    { id: "c", section: "livestream", status: "published", work_title: "Nike Live" },
  ];
  const result = filterWorks(works, { section: "tvc", status: "published", query: "adidas" });
  assert.deepEqual(result.map((w) => w.id), ["b"]);
});

// ── publishReadiness + upload satisfaction for livestream images ──

test("publishReadiness with uploads satisfies livestream image requirement via complete uploads", () => {
  const work = { id: "live-1", section: "livestream", work_title: "Show", work_type: "直播", work_images: [] };
  const uploads = [{ id: "img-1", kind: "image", state: "complete", result: { key: "images/1.webp", width: 960, height: 540 } }];
  const readiness = publishReadiness(work, uploads);
  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.missing, []);
});

// ── publishChangeSummary with no changes ──

test("publishChangeSummary returns no-change message when saved and draft are identical", () => {
  const data = { brand_name: "Nike", work_title: "Film", work_type: "TVC", status: "draft" };
  assert.deepEqual(publishChangeSummary(data, { ...data }), ["没有文字变更"]);
  assert.deepEqual(publishChangeSummary({}, {}), ["没有文字变更"]);
});
