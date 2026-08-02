import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkbenchState,
  filterWorks,
  workCompleteness,
  publishReadiness,
  hasUnsafeExit,
  transitionView,
} from "../workbench-state.js";

test("filters works by section, status, and query", () => {
  const works = [
    { id: "tvc-1", section: "tvc", status: "published", brand_name: "Nike", work_title: "Just Do It Film", work_type: "TVC" },
    { id: "tvc-2", section: "tvc", status: "draft", brand_name: "Nike", work_title: "Draft Cut", work_type: "TVC" },
    { id: "tvc-3", section: "tvc", status: "published", brand_name: "Adidas", work_title: "Field Notes", work_type: "Documentary" },
    { id: "live-1", section: "livestream", status: "published", brand_name: null, work_title: "Nike Live", work_type: "直播" },
  ];
  assert.deepEqual(filterWorks(works, { section: "tvc", status: "published", query: "nike" }).map((work) => work.id), ["tvc-1"]);
});

test("query matches brand name, work title, and work type case-insensitively", () => {
  const works = [
    { id: "brand", brand_name: "NIKE" },
    { id: "title", work_title: "Nike Film" },
    { id: "type", work_type: "NIKE TVC" },
    { id: "other", brand_name: "Adidas", work_title: "Field", work_type: "TVC" },
  ];
  assert.deepEqual(filterWorks(works, { query: "nike" }).map((work) => work.id), ["brand", "title", "type"]);
});

test("section and status filters apply independently and no filters return everything", () => {
  const works = [
    { id: "a", section: "tvc", status: "draft" },
    { id: "b", section: "tvc", status: "published" },
    { id: "c", section: "livestream", status: "published" },
  ];
  assert.deepEqual(filterWorks(works, { section: "tvc" }).map((work) => work.id), ["a", "b"]);
  assert.deepEqual(filterWorks(works, { status: "published" }).map((work) => work.id), ["b", "c"]);
  assert.deepEqual(filterWorks(works, {}).map((work) => work.id), ["a", "b", "c"]);
});

test("publishReadiness accepts a complete TVC work", () => {
  assert.equal(publishReadiness({ section: "tvc", brand_name: "Nike", work_title: "Film", work_type: "TVC", poster_key: "p", video_key: "v" }, []).ready, true);
});

test("publishReadiness reports missing TVC fields in text-then-media order", () => {
  assert.deepEqual(publishReadiness({ section: "tvc", brand_name: "Nike", work_title: "Film", work_type: "TVC" }, []).missing, ["海报", "视频"]);
  assert.deepEqual(publishReadiness({ section: "tvc" }, []).missing, ["品牌名", "影片名", "作品类型", "海报", "视频"]);
});

test("publishReadiness reports missing livestream fields in text-then-media order", () => {
  assert.deepEqual(publishReadiness({ section: "livestream", work_title: "Show", work_type: "直播", work_images: [] }, []).missing, ["项目图片"]);
  assert.deepEqual(publishReadiness({ section: "livestream", work_images: [] }, []).missing, ["直播名", "类型", "项目图片"]);
});

test("complete uploads satisfy missing media for the matching work", () => {
  const work = { id: "w1", section: "tvc", brand_name: "Nike", work_title: "Film", work_type: "TVC" };
  const uploads = [
    { id: "poster-1", kind: "poster", state: "complete", result: { desktop: { key: "posters/p.webp" }, mobile: { key: "posters/pm.webp" } } },
    { id: "video-1", kind: "video", state: "complete", result: { key: "videos/v.mp4" } },
  ];
  assert.deepEqual(publishReadiness(work, uploads), { ready: true, missing: [] });
});

test("incomplete uploads and other works' uploads do not satisfy media", () => {
  const work = { id: "w1", section: "tvc", brand_name: "Nike", work_title: "Film", work_type: "TVC" };
  const uploads = [
    { id: "u1", kind: "poster", state: "uploading", result: null },
    { id: "u2", kind: "video", state: "failed", result: { key: "videos/old.mp4" } },
    { id: "u3", kind: "poster", workId: "other-work", state: "complete", result: { desktop: { key: "posters/other.webp" } } },
  ];
  assert.deepEqual(publishReadiness(work, uploads).missing, ["海报", "视频"]);
});

test("complete livestream image uploads satisfy the image requirement", () => {
  const work = { id: "w2", section: "livestream", work_title: "Show", work_type: "直播", work_images: [] };
  const uploads = [{ id: "img-1", kind: "image", state: "complete", result: { key: "images/1.webp", width: 960, height: 540 } }];
  assert.deepEqual(publishReadiness(work, uploads), { ready: true, missing: [] });
});

test("workCompleteness reports complete when nothing is missing", () => {
  const work = { section: "tvc", brand_name: "Nike", work_title: "Film", work_type: "TVC", poster_key: "p", video_key: "v" };
  assert.deepEqual(workCompleteness(work, []), { complete: true, missing: [] });
});

test("workCompleteness reports the same missing labels as publishReadiness", () => {
  const work = { section: "tvc", brand_name: "Nike", work_title: "Film", work_type: "TVC" };
  assert.deepEqual(workCompleteness(work, []), { complete: false, missing: ["海报", "视频"] });
});

test("hasUnsafeExit flags dirty state and active uploads", () => {
  assert.equal(hasUnsafeExit({ dirty: true, activeUploadCount: 0 }), true);
  assert.equal(hasUnsafeExit({ dirty: false, activeUploadCount: 0 }), false);
  assert.equal(hasUnsafeExit({ dirty: false, activeUploadCount: 2 }), true);
  assert.equal(hasUnsafeExit({ dirty: true, activeUploadCount: 1 }), true);
});

test("OPEN_EDITOR opens the editor with the selected work without mutating state", () => {
  const state = createWorkbenchState();
  const initialView = state.view;
  const next = transitionView(state, { type: "OPEN_EDITOR", workId: "w1" });
  assert.equal(transitionView(createWorkbenchState(), { type: "OPEN_EDITOR", workId: "w1" }).view, "editor");
  assert.equal(next.view, "editor");
  assert.equal(next.editorWorkId, "w1");
  assert.equal(state.view, initialView);
  assert.equal(state.editorWorkId, "");
});

test("CLOSE_EDITOR returns to the workspace view", () => {
  const initial = createWorkbenchState();
  const opened = transitionView(initial, { type: "OPEN_EDITOR", workId: "w1" });
  const closed = transitionView(opened, { type: "CLOSE_EDITOR" });
  assert.equal(closed.view, initial.view);
});
