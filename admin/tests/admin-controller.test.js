import test from "node:test";
import assert from "node:assert/strict";
import {
  createClientWork,
  emptyStateKind,
  lifecycleConfirmation,
  networkStatusModel,
  previewLocalUrlKey,
  publishChangeSummary,
} from "../admin-controller.js";

test("createClientWork returns a stable draft TVC work with empty text fields", () => {
  const work = createClientWork("tvc", "w-tvc-1");
  assert.deepEqual(work, {
    id: "w-tvc-1",
    section: "tvc",
    status: "draft",
    version: 0,
    brand_name: "",
    work_title: "",
    work_type: "",
  });
  assert.equal(createClientWork("tvc", "same").id, "same");
});

test("createClientWork returns a stable draft livestream work with null brand", () => {
  const work = createClientWork("livestream", "w-live-1");
  assert.equal(work.id, "w-live-1");
  assert.equal(work.section, "livestream");
  assert.equal(work.status, "draft");
  assert.equal(work.version, 0);
  assert.equal(work.brand_name, null);
  assert.equal(work.work_title, "");
  assert.equal(work.work_type, "");
});

test("createClientWork rejects any section outside tvc/livestream", () => {
  assert.throws(() => createClientWork("film", "w1"), /tvc|livestream/);
  assert.throws(() => createClientWork("", "w1"), /tvc|livestream/);
  assert.throws(() => createClientWork(undefined, "w1"), /tvc|livestream/);
});

test("createClientWork locks the section so it can never be switched", () => {
  const work = createClientWork("tvc", "w1");
  const descriptor = Object.getOwnPropertyDescriptor(work, "section");
  assert.equal(descriptor.writable, false);
  assert.equal(descriptor.configurable, false);
  assert.throws(() => {
    work.section = "livestream";
  }, TypeError);
  assert.equal(work.section, "tvc");
});

test("emptyStateKind prioritizes a livestream with no images", () => {
  assert.equal(emptyStateKind({ section: "livestream", imageCount: 0, total: 0 }), "livestream-images");
  assert.equal(emptyStateKind({ section: "livestream", imageCount: 0, total: 5, filteredCount: 2 }), "livestream-images");
  assert.equal(emptyStateKind({ section: "livestream", imageCount: 0, total: 5, filteredCount: 0, statusFilter: "archived" }), "livestream-images");
  assert.equal(emptyStateKind({ section: "livestream", imageCount: 1, total: 3, filteredCount: 1 }), null);
});

test("emptyStateKind falls through to works, archived, filtered, or null", () => {
  assert.equal(emptyStateKind({ total: 0, filteredCount: 0 }), "works");
  assert.equal(emptyStateKind({ total: 0, filteredCount: 0, statusFilter: "archived" }), "works");
  assert.equal(emptyStateKind({ total: 5, filteredCount: 0, statusFilter: "archived" }), "archived");
  assert.equal(emptyStateKind({ total: 5, filteredCount: 0, statusFilter: "draft" }), "filtered");
  assert.equal(emptyStateKind({ total: 5, filteredCount: 0, statusFilter: "all" }), "filtered");
  assert.equal(emptyStateKind({ total: 5, filteredCount: 3 }), null);
  assert.equal(emptyStateKind({}), "works");
});

test("networkStatusModel maps online state to the exact label contract", () => {
  assert.deepEqual(networkStatusModel(true), { state: "online", label: "网络正常" });
  assert.deepEqual(networkStatusModel(false), { state: "offline", label: "离线，上传将等待网络" });
});

test("previewLocalUrlKey uses the workId-scoped key per kind", () => {
  assert.equal(previewLocalUrlKey({ workId: "w1", kind: "poster" }), "w1:poster");
  assert.equal(previewLocalUrlKey({ workId: "w1", kind: "video" }), "w1:video");
  assert.equal(previewLocalUrlKey({ workId: "w1", kind: "image", image: { id: "img-9" }, index: 0 }), "w1:image:img-9");
  assert.equal(previewLocalUrlKey({ workId: "w1", kind: "image", image: { id: 0, sort_order: 5 }, index: 1 }), "w1:image:0");
  assert.equal(previewLocalUrlKey({ workId: "w1", kind: "image", image: { sort_order: 3 }, index: 1 }), "w1:image:3");
  assert.equal(previewLocalUrlKey({ workId: "w1", kind: "image", image: {}, index: 2 }), "w1:image:2");
  assert.equal(previewLocalUrlKey({ workId: "w1", kind: "other" }), "");
});

test("lifecycleConfirmation returns title/message/confirmLabel/tone/nextStatus", () => {
  const work = { work_title: "夜晚航线", status: "draft" };
  const publish = lifecycleConfirmation("publish", work);
  assert.equal(publish.title, "发布作品？");
  assert.match(publish.message, /夜晚航线/);
  assert.equal(publish.confirmLabel, "确认发布");
  assert.equal(publish.nextStatus, "published");

  const unpublish = lifecycleConfirmation("unpublish", { work_title: "夜晚航线", status: "published" });
  assert.equal(unpublish.nextStatus, "draft");
  assert.equal(unpublish.confirmLabel, "确认取消发布");
  assert.equal(unpublish.tone, "danger");

  const archive = lifecycleConfirmation("archive", { work_title: "夜晚航线", status: "published" });
  assert.equal(archive.nextStatus, "archived");
  assert.equal(archive.confirmLabel, "确认归档");
  assert.equal(archive.tone, "danger");

  const restore = lifecycleConfirmation("restore", { work_title: "夜晚航线", status: "archived" });
  assert.equal(restore.nextStatus, "draft");
  assert.equal(restore.confirmLabel, "确认恢复");
});

test("lifecycleConfirmation rejects publishing an archived work", () => {
  assert.throws(() => lifecycleConfirmation("publish", { status: "archived", work_title: "旧片" }), /归档|恢复/);
});

test("lifecycleConfirmation rejects unsupported actions", () => {
  assert.throws(() => lifecycleConfirmation("copy", {}), TypeError);
  assert.throws(() => lifecycleConfirmation("delete", {}), TypeError);
});

test("publishChangeSummary reports only real text and status changes", () => {
  const saved = { brand_name: "Nike", work_title: "夜晚航线", work_type: "品牌片", status: "draft" };
  const draft = { brand_name: "Nike", work_title: "黎明航线", work_type: "品牌片", status: "draft" };
  assert.deepEqual(publishChangeSummary(saved, draft), ["片名：夜晚航线 → 黎明航线"]);
});

test("publishChangeSummary covers brand, title, type, and status in order", () => {
  const saved = { brand_name: "A", work_title: "一", work_type: "TVC", status: "draft" };
  const draft = { brand_name: "B", work_title: "二", work_type: "纪录", status: "published" };
  assert.deepEqual(publishChangeSummary(saved, draft), [
    "品牌：A → B",
    "片名：一 → 二",
    "类型：TVC → 纪录",
    "状态：草稿 → 已发布",
  ]);
});

test("publishChangeSummary renders empty values as dashes and null as empty", () => {
  assert.deepEqual(publishChangeSummary({ work_title: "" }, { work_title: "片" }), ["片名：— → 片"]);
  assert.deepEqual(publishChangeSummary({ brand_name: null }, { brand_name: "Nike" }), ["品牌：— → Nike"]);
});

test("publishChangeSummary returns the no-change placeholder", () => {
  const saved = { brand_name: "Nike", work_title: "片", work_type: "TVC", status: "draft" };
  assert.deepEqual(publishChangeSummary(saved, { ...saved }), ["没有文字变更"]);
  assert.deepEqual(publishChangeSummary({}, {}), ["没有文字变更"]);
  assert.deepEqual(publishChangeSummary({ brand_name: null }, { brand_name: null }), ["没有文字变更"]);
});
