import test from "node:test";
import assert from "node:assert/strict";
import {
  workRowModel,
  uploadRowModel,
  emptyStateModel,
  statusSummaryModel,
  renderWorkRows,
  renderUploadRows,
} from "../workbench-view.js";

const MiB = 1024 * 1024;
const MEDIA_BASE = "https://media.kjoe.top/";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.style = {};
    this.className = "";
    this.textContent = "";
    this.type = "";
    this.src = "";
    this.alt = "";
    this.loading = "";
    this.hidden = false;
    this.disabled = false;
  }

  append(...nodes) {
    this.children.push(...nodes);
    return this;
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  }

  click() {
    (this.listeners.click || []).forEach((listener) => listener({}));
  }

  set innerHTML(value) {
    throw new Error("HTML string rendering is forbidden");
  }
}

function fakeDocument() {
  return { createElement: (tagName) => new FakeElement(tagName) };
}

const originalDocument = globalThis.document;
function withFakeDom(run) {
  globalThis.document = fakeDocument();
  try {
    return run();
  } finally {
    globalThis.document = originalDocument;
  }
}

function rowActions(row) {
  return row.children.find((node) => node.className === "row-actions").children.map((button) => button.textContent);
}

function uploadActions(row) {
  return row.children.find((node) => node.className === "upload-actions").children.map((button) => button.textContent);
}

test("workRowModel labels a TVC work with exact section, status, and text labels", () => {
  const model = workRowModel({
    id: "tvc-1",
    section: "tvc",
    status: "published",
    brand_name: "Nike",
    work_title: "Just Do It Film",
    work_type: "TVC",
  });
  assert.equal(model.id, "tvc-1");
  assert.equal(model.sectionLabel, "TVC");
  assert.equal(model.statusLabel, "已发布");
  assert.equal(model.title, "Just Do It Film");
  assert.equal(model.brand, "Nike");
  assert.equal(model.workType, "TVC");
});

test("workRowModel labels livestream sections and every status exactly", () => {
  assert.equal(workRowModel({ id: "live-1", section: "livestream", status: "draft" }).sectionLabel, "直播间");
  assert.equal(workRowModel({ id: "a", status: "draft" }).statusLabel, "草稿");
  assert.equal(workRowModel({ id: "b", status: "published" }).statusLabel, "已发布");
  assert.equal(workRowModel({ id: "c", status: "archived" }).statusLabel, "已归档");
  assert.equal(workRowModel({ id: "d", status: "queued" }).statusLabel, "queued");
});

test("workRowModel reports media completeness text from work fields", () => {
  assert.equal(
    workRowModel({ id: "a", section: "tvc", brand_name: "Nike", work_title: "Film", work_type: "TVC", poster_key: "p", video_key: "v" }).completenessText,
    "材料完整",
  );
  assert.equal(
    workRowModel({ id: "b", section: "tvc", work_title: "Film", work_type: "TVC" }).completenessText,
    "缺：品牌名、海报、视频",
  );
  assert.equal(
    workRowModel({ id: "c", section: "livestream", work_images: [] }).completenessText,
    "缺：直播名、类型、项目图片",
  );
  assert.equal(
    workRowModel({ id: "d", section: "livestream", work_title: "Show", work_type: "直播", work_images: [{ image_key: "i.webp" }] }).completenessText,
    "材料完整",
  );
});

test("workRowModel uses the poster as the TVC thumbnail", () => {
  const withUrl = workRowModel({ id: "tvc-1", section: "tvc", work_title: "Film", poster_url: `${MEDIA_BASE}posters/film.webp` });
  assert.equal(withUrl.thumbnailUrl, `${MEDIA_BASE}posters/film.webp`);
  assert.equal(withUrl.hasThumbnail, true);
  assert.equal(withUrl.thumbnailAlt, "《Film》封面");

  const withKey = workRowModel({ id: "tvc-2", section: "tvc", work_title: "Keyed", poster_key: "portfolio/tvc/a b.webp" });
  assert.equal(withKey.thumbnailUrl, `${MEDIA_BASE}portfolio/tvc/a%20b.webp`);

  const withoutPoster = workRowModel({ id: "tvc-3", section: "tvc", work_title: "Empty" });
  assert.equal(withoutPoster.thumbnailUrl, "");
  assert.equal(withoutPoster.hasThumbnail, false);
});

test("workRowModel falls back to the first ordered livestream image as the thumbnail", () => {
  const model = workRowModel({
    id: "live-1",
    section: "livestream",
    work_title: "Night Show",
    work_images: [
      { image_url: `${MEDIA_BASE}second.webp`, sort_order: 1 },
      { image_url: `${MEDIA_BASE}first.webp`, sort_order: 0 },
      { image_key: "third.webp", sort_order: 2 },
    ],
  });
  assert.equal(model.thumbnailUrl, `${MEDIA_BASE}first.webp`);
  assert.equal(model.hasThumbnail, true);
  assert.equal(model.thumbnailAlt, "《Night Show》封面");

  const noImages = workRowModel({ id: "live-2", section: "livestream", work_title: "Empty" });
  assert.equal(noImages.thumbnailUrl, "");
  assert.equal(noImages.hasThumbnail, false);
});

test("uploadRowModel labels upload kinds exactly", () => {
  assert.equal(uploadRowModel({ id: "a", kind: "poster", state: "ready" }).kindLabel, "海报");
  assert.equal(uploadRowModel({ id: "b", kind: "video", state: "ready" }).kindLabel, "视频");
  assert.equal(uploadRowModel({ id: "c", kind: "image", state: "ready" }).kindLabel, "项目图片");
  assert.equal(uploadRowModel({ id: "d", kind: "other", state: "ready" }).kindLabel, "other");
});

test("uploadRowModel reports exact status text for every state", () => {
  const file = (size) => ({ name: "film.mp4", size });
  assert.equal(uploadRowModel({ id: "a", file: file(0), kind: "video", state: "ready", total: 0 }).statusText, "等待保存 · 0 B");
  assert.equal(uploadRowModel({ id: "b", file: file(3 * MiB), kind: "video", state: "processing", total: 3 * MiB }).statusText, "正在处理…");
  assert.equal(
    uploadRowModel({ id: "c", file: file(3 * MiB), kind: "video", state: "uploading", loaded: MiB, total: 3 * MiB }).statusText,
    "正在上传 · 1.0 MB / 3.0 MB",
  );
  assert.equal(uploadRowModel({ id: "d", file: file(MiB), kind: "video", state: "paused", total: MiB }).statusText, "已暂停");
  assert.equal(uploadRowModel({ id: "e", file: file(MiB), kind: "video", state: "waiting-network", total: MiB }).statusText, "等待网络恢复…");
  assert.equal(uploadRowModel({ id: "f", file: file(MiB), kind: "video", state: "failed", total: MiB }).statusText, "上传失败，可重试。");
  assert.equal(uploadRowModel({ id: "g", file: file(MiB), kind: "video", state: "failed", total: MiB, error: "网络超时" }).statusText, "网络超时");
  assert.equal(uploadRowModel({ id: "h", file: file(12 * MiB), kind: "video", state: "complete", total: 12 * MiB }).statusText, "已完成 · 12 MB");
  assert.equal(uploadRowModel({ id: "i", file: file(MiB), kind: "video", state: "cancelled", total: MiB }).statusText, "已取消");
});

test("uploadRowModel clamps progress percentage to 0..100", () => {
  assert.equal(uploadRowModel({ id: "a", state: "uploading", loaded: 50, total: 100 }).progress, 50);
  assert.equal(uploadRowModel({ id: "b", state: "uploading", loaded: 1, total: 3 }).progress, 33);
  assert.equal(uploadRowModel({ id: "c", state: "uploading", loaded: 150, total: 100 }).progress, 100);
  assert.equal(uploadRowModel({ id: "d", state: "uploading", loaded: -5, total: 100 }).progress, 0);
  assert.equal(uploadRowModel({ id: "e", state: "uploading", loaded: 0, total: 0 }).progress, 0);
  assert.equal(uploadRowModel({ id: "f", state: "complete", loaded: 100, total: 100 }).progress, 100);
});

test("uploadRowModel exposes retry, cancel, pause, and resume affordances by state", () => {
  const flags = (state, extra = {}) => {
    const model = uploadRowModel({ id: "u", kind: "video", state, total: 10, ...extra });
    return [model.canRetry, model.canCancel, model.canPause, model.canResume];
  };
  assert.deepEqual(flags("ready"), [false, true, false, false]);
  assert.deepEqual(flags("processing"), [false, true, false, false]);
  assert.deepEqual(flags("uploading"), [false, true, true, false]);
  assert.deepEqual(flags("waiting-network"), [false, true, false, false]);
  assert.deepEqual(flags("paused"), [false, false, false, true]);
  assert.deepEqual(flags("failed"), [true, false, false, false]);
  assert.deepEqual(flags("cancelled"), [true, false, false, false]);
  assert.deepEqual(flags("complete"), [false, false, false, false]);
});

test("emptyStateModel returns exact copy for each supported kind", () => {
  assert.deepEqual(emptyStateModel("works"), { title: "暂无作品", hint: "新增 TVC 或 Livestream 开始管理作品。" });
  assert.deepEqual(emptyStateModel("filtered"), { title: "没有符合筛选条件的作品", hint: "清除筛选或更换搜索关键词。" });
  assert.deepEqual(emptyStateModel("uploads"), { title: "暂无上传任务", hint: "从设备选择图片或视频后，上传进度会显示在这里。" });
  assert.deepEqual(emptyStateModel("livestream-images"), { title: "尚未添加项目图片", hint: "从设备选择图片；第一张将作为前台封面。" });
  assert.deepEqual(emptyStateModel("archived"), { title: "暂无已归档作品", hint: "归档作品会显示在这里。" });
  const first = emptyStateModel("works");
  const second = emptyStateModel("works");
  assert.notEqual(first, second);
});

test("emptyStateModel falls back for unknown kinds", () => {
  assert.deepEqual(emptyStateModel("unknown"), { title: "暂无内容", hint: "当前没有可显示的内容。" });
  assert.deepEqual(emptyStateModel(undefined), { title: "暂无内容", hint: "当前没有可显示的内容。" });
});

test("statusSummaryModel summarizes the workbench state", () => {
  assert.deepEqual(statusSummaryModel({ view: "editor", dirty: true, activeUploadCount: 2 }), {
    viewLabel: "编辑器",
    dirty: true,
    activeUploadCount: 2,
    text: "编辑器 · 有未保存修改 · 2 个上传进行中",
  });
  assert.deepEqual(statusSummaryModel({ view: "workspace", dirty: false, activeUploadCount: 0 }), {
    viewLabel: "作品列表",
    dirty: false,
    activeUploadCount: 0,
    text: "作品列表 · 所有修改已保存",
  });
  assert.deepEqual(statusSummaryModel({ view: "editor", dirty: false, activeUploadCount: 1 }), {
    viewLabel: "编辑器",
    dirty: false,
    activeUploadCount: 1,
    text: "编辑器 · 1 个上传进行中",
  });
  assert.deepEqual(statusSummaryModel({ view: "workspace", dirty: true, activeUploadCount: 0 }), {
    viewLabel: "作品列表",
    dirty: true,
    activeUploadCount: 0,
    text: "作品列表 · 有未保存修改",
  });
});

test("statusSummaryModel normalizes dirty and upload count", () => {
  const model = statusSummaryModel({ view: "other", dirty: 1, activeUploadCount: "2" });
  assert.equal(model.viewLabel, "作品列表");
  assert.equal(model.dirty, true);
  assert.equal(model.activeUploadCount, 2);
  assert.equal(model.text, "作品列表 · 有未保存修改 · 2 个上传进行中");
});

test("renderWorkRows renders semantic rows from models without HTML strings", () => {
  withFakeDom(() => {
    const root = new FakeElement("ul");
    const model = workRowModel({
      id: "tvc-1",
      section: "tvc",
      status: "published",
      brand_name: "Nike",
      work_title: "Just Do It",
      work_type: "TVC",
      poster_key: "portfolio/tvc/p.webp",
      video_key: "portfolio/tvc/v.mp4",
    });
    renderWorkRows(root, [model], {});
    assert.equal(root.children.length, 1);
    const row = root.children[0];
    assert.equal(row.tagName, "article");
    assert.equal(row.className, "work-row");
    assert.equal(row.dataset.workId, "tvc-1");
    const info = row.children[1];
    assert.equal(info.children[0].textContent, "Just Do It");
    assert.match(info.children[1].textContent, /TVC/);
    assert.match(info.children[1].textContent, /已发布/);
    assert.equal(info.children[2].textContent, "材料完整");
  });
});

test("renderWorkRows renders meaningful thumbnails as images with alt and placeholders as decorative divs", () => {
  withFakeDom(() => {
    const root = new FakeElement("ul");
    const withPoster = workRowModel({ id: "tvc-1", section: "tvc", work_title: "Film", poster_url: `${MEDIA_BASE}p.webp` });
    const without = workRowModel({ id: "tvc-2", section: "tvc", work_title: "No Media" });
    renderWorkRows(root, [withPoster, without], {});
    const image = root.children[0].children[0];
    assert.equal(image.tagName, "img");
    assert.equal(image.src, `${MEDIA_BASE}p.webp`);
    assert.equal(image.alt, "《Film》封面");
    assert.equal(image.loading, "lazy");
    const placeholder = root.children[1].children[0];
    assert.equal(placeholder.tagName, "div");
    assert.match(placeholder.className, /placeholder/);
    assert.equal(placeholder.attributes["aria-hidden"], "true");
    assert.equal(root.children[1].children.some((node) => node.tagName === "img"), false);
  });
});

test("renderWorkRows wires only applicable handlers and passes the work id", () => {
  withFakeDom(() => {
    const called = [];
    const handlers = {
      onEdit: (id) => called.push(["edit", id]),
      onCopy: (id) => called.push(["copy", id]),
      onPublish: (id) => called.push(["publish", id]),
      onUnpublish: (id) => called.push(["unpublish", id]),
      onArchive: (id) => called.push(["archive", id]),
      onRestore: (id) => called.push(["restore", id]),
    };
    const root = new FakeElement("ul");
    renderWorkRows(root, [
      workRowModel({ id: "w1", section: "tvc", status: "draft" }),
      workRowModel({ id: "w2", section: "tvc", status: "published" }),
      workRowModel({ id: "w3", section: "tvc", status: "archived" }),
    ], handlers);
    assert.deepEqual(rowActions(root.children[0]), ["编辑", "复制", "发布", "归档"]);
    assert.deepEqual(rowActions(root.children[1]), ["编辑", "复制", "取消发布", "归档"]);
    assert.deepEqual(rowActions(root.children[2]), ["编辑", "复制", "发布", "恢复"]);
    const published = root.children[1];
    published.children.find((node) => node.className === "row-actions").children[2].click();
    assert.deepEqual(called, [["unpublish", "w2"]]);
  });
});

test("renderWorkRows skips action buttons for missing handlers", () => {
  withFakeDom(() => {
    const root = new FakeElement("ul");
    renderWorkRows(root, [workRowModel({ id: "w1", section: "tvc", status: "draft" })], {});
    assert.deepEqual(rowActions(root.children[0]), []);
  });
});

test("renderUploadRows renders name, status text, progress bar, and state", () => {
  withFakeDom(() => {
    const root = new FakeElement("div");
    const model = uploadRowModel({ id: "u1", file: { name: "film.mp4", size: 3 * MiB }, kind: "video", state: "uploading", loaded: MiB, total: 3 * MiB });
    renderUploadRows(root, [model], {});
    const row = root.children[0];
    assert.equal(row.className, "upload-item");
    assert.equal(row.dataset.uploadId, "u1");
    assert.equal(row.dataset.state, "uploading");
    const copy = row.children[0];
    assert.equal(copy.children[0].textContent, "film.mp4");
    assert.equal(copy.children[1].textContent, "正在上传 · 1.0 MB / 3.0 MB");
    const track = row.children[1];
    assert.equal(track.attributes["role"], "progressbar");
    assert.equal(track.attributes["aria-valuenow"], "33");
    assert.equal(track.children[0].style.width, "33%");
  });
});

test("renderUploadRows wires pause, resume, retry, and cancel by state", () => {
  withFakeDom(() => {
    const called = [];
    const handlers = {
      onPause: (id) => called.push(["pause", id]),
      onResume: (id) => called.push(["resume", id]),
      onRetry: (id) => called.push(["retry", id]),
      onCancel: (id) => called.push(["cancel", id]),
    };
    const root = new FakeElement("div");
    renderUploadRows(root, [
      uploadRowModel({ id: "u1", file: { name: "a.mp4", size: MiB }, kind: "video", state: "uploading", total: MiB }),
      uploadRowModel({ id: "u2", file: { name: "b.mp4", size: MiB }, kind: "video", state: "paused", total: MiB }),
      uploadRowModel({ id: "u3", file: { name: "c.mp4", size: MiB }, kind: "video", state: "failed", total: MiB }),
      uploadRowModel({ id: "u4", file: { name: "d.mp4", size: MiB }, kind: "video", state: "waiting-network", total: MiB }),
      uploadRowModel({ id: "u5", file: { name: "e.mp4", size: MiB }, kind: "video", state: "complete", total: MiB }),
    ], handlers);
    assert.deepEqual(uploadActions(root.children[0]), ["暂停", "取消"]);
    assert.deepEqual(uploadActions(root.children[1]), ["继续"]);
    assert.deepEqual(uploadActions(root.children[2]), ["重试"]);
    assert.deepEqual(uploadActions(root.children[3]), ["取消"]);
    assert.deepEqual(uploadActions(root.children[4]), []);
    root.children[0].children.find((node) => node.className === "upload-actions").children[0].click();
    assert.deepEqual(called, [["pause", "u1"]]);
  });
});

test("renderUploadRows renders no action buttons when handlers are absent", () => {
  withFakeDom(() => {
    const root = new FakeElement("div");
    renderUploadRows(root, [uploadRowModel({ id: "u1", file: { name: "a.mp4", size: MiB }, kind: "video", state: "failed", total: MiB })], {});
    assert.deepEqual(uploadActions(root.children[0]), []);
  });
});
