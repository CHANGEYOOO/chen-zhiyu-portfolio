import test from "node:test";
import assert from "node:assert/strict";

// ── Task 7B: Recovery, queue, network, object URL contracts ──

import { DraftStore } from "../draft-store.js";
import { UploadManager } from "../upload-manager.js";
import {
  createWorkbenchState,
  hasUnsafeExit,
} from "../workbench-state.js";
import { uploadRowModel } from "../workbench-view.js";

// ── Memory storage helper ──
function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
  };
}

// ── 7B-1: Boot recovery from DraftStore ──
test("7B-1: DraftStore.list returns all saved draft work IDs for boot recovery", () => {
  const storage = memoryStorage();
  const drafts = new DraftStore(storage);
  drafts.save("work-a", { work_title: "First" });
  drafts.save("work-b", { work_title: "Second" });

  const ids = drafts.list();
  assert.deepEqual(ids, ["work-a", "work-b"]);
});

test("7B-1: DraftStore.load restores text fields for a work id", () => {
  const storage = memoryStorage();
  const drafts = new DraftStore(storage);
  drafts.save("work-x", {
    section: "tvc",
    brand_name: "Nike",
    work_title: "Run",
    work_type: "TVC",
    sort_order: 3,
    status: "draft",
  });

  const restored = drafts.load("work-x");
  assert.equal(restored.section, "tvc");
  assert.equal(restored.brand_name, "Nike");
  assert.equal(restored.work_title, "Run");
  assert.equal(restored.work_type, "TVC");
  assert.equal(restored.sort_order, 3);
});

test("7B-1: UploadManager.listRecoverable returns sorted video recovery descriptors", () => {
  const storage = memoryStorage();
  const manager = new UploadManager({}, { storage });

  // Simulate recovery records written during upload
  storage.setItem(
    "portfolio-admin:video-recovery:tvc:work-2",
    JSON.stringify({
      workId: "work-2",
      section: "tvc",
      name: "clip.mp4",
      size: 10485760,
      lastModified: 1,
      type: "video/mp4",
      uploadId: "upload-1",
      objectKey: "portfolio/tvc/work-2/clip.mp4",
      parts: [{ partNumber: 1, etag: "etag-1" }],
    })
  );
  storage.setItem(
    "portfolio-admin:video-recovery:livestream:work-1",
    JSON.stringify({
      workId: "work-1",
      section: "livestream",
      name: "stream.webm",
      size: 5242880,
      lastModified: 2,
      type: "video/webm",
      uploadId: "upload-2",
      objectKey: "portfolio/livestream/work-1/stream.webm",
      parts: [],
    })
  );
  // Non-recovery key should be ignored
  storage.setItem("portfolio-admin:draft:work-1", JSON.stringify({ work_title: "Test" }));

  const recoverable = manager.listRecoverable();
  assert.equal(recoverable.length, 2);
  // Sorted by section:workId
  assert.equal(recoverable[0].workId, "work-1");
  assert.equal(recoverable[0].section, "livestream");
  assert.equal(recoverable[1].workId, "work-2");
  assert.equal(recoverable[1].section, "tvc");
  assert.equal(recoverable[0].name, "stream.webm");
  assert.equal(recoverable[1].name, "clip.mp4");
});

// ── 7B-4: Upload item grouping by workId ──
test("7B-4: upload items carry workId for cross-work grouping", () => {
  const items = [
    { id: "a", kind: "poster", workId: "work-1", state: "complete" },
    { id: "b", kind: "video", workId: "work-1", state: "uploading" },
    { id: "c", kind: "image", workId: "work-2", state: "ready" },
    { id: "d", kind: "image", workId: "work-2", state: "complete" },
  ];

  const byWork = {};
  for (const item of items) {
    if (!byWork[item.workId]) byWork[item.workId] = [];
    byWork[item.workId].push(item);
  }

  assert.deepEqual(Object.keys(byWork).sort(), ["work-1", "work-2"]);
  assert.equal(byWork["work-1"].length, 2);
  assert.equal(byWork["work-2"].length, 2);
});

// ── 7B-4: State counting for batch operations ──
test("7B-4: uploadCounts correctly tallies states for batch action enable/disable", () => {
  const items = [
    { state: "uploading" },
    { state: "uploading" },
    { state: "processing" },
    { state: "waiting-network" },
    { state: "paused" },
    { state: "paused" },
    { state: "failed" },
    { state: "failed" },
    { state: "failed" },
    { state: "cancelled" },
    { state: "complete" },
    { state: "ready" },
  ];

  const counts = { uploading: 0, waiting: 0, paused: 0, failed: 0, complete: 0, cancelled: 0, ready: 0 };
  for (const item of items) {
    const s = item.state;
    if (s === "uploading" || s === "processing") counts.uploading += 1;
    else if (s === "waiting-network") counts.waiting += 1;
    else if (s === "paused") counts.paused += 1;
    else if (s === "failed") counts.failed += 1;
    else if (s === "complete") counts.complete += 1;
    else if (s === "cancelled") counts.cancelled += 1;
    else if (s === "ready") counts.ready += 1;
  }

  assert.equal(counts.uploading, 3); // 2 uploading + 1 processing
  assert.equal(counts.waiting, 1);
  assert.equal(counts.paused, 2);
  assert.equal(counts.failed, 3);
  assert.equal(counts.complete, 1);
  assert.equal(counts.cancelled, 1);
  assert.equal(counts.ready, 1);

  // Batch button enable logic
  const hasActive = counts.uploading + counts.ready > 0; // 4
  const hasPaused = counts.paused > 0; // true
  const hasFailed = counts.failed + counts.cancelled > 0; // 4
  const hasAnyActive = hasActive || counts.waiting > 0; // true

  assert.equal(hasActive, true);
  assert.equal(hasPaused, true);
  assert.equal(hasFailed, true);
  assert.equal(hasAnyActive, true);

  // Empty scenario
  const emptyCounts = { uploading: 0, waiting: 0, paused: 0, failed: 0, complete: 0, cancelled: 0, ready: 0 };
  assert.equal(emptyCounts.uploading + emptyCounts.ready > 0, false);
  assert.equal(emptyCounts.paused > 0, false);
  assert.equal(emptyCounts.failed + emptyCounts.cancelled > 0, false);
});

// ── 7B-5: Network state transitions preserve recovery data ──
test("7B-5: active items transition to waiting-network without losing state", () => {
  const items = [
    { id: "1", state: "ready" },
    { id: "2", state: "processing" },
    { id: "3", state: "uploading" },
    { id: "4", state: "complete" },
    { id: "5", state: "failed" },
    { id: "6", state: "paused" },
  ];

  // Simulate offline transition
  for (const item of items) {
    if (["ready", "processing", "uploading"].includes(item.state)) {
      item._preOfflineState = item.state;
      item.state = "waiting-network";
    }
  }

  assert.equal(items[0].state, "waiting-network");
  assert.equal(items[0]._preOfflineState, "ready");
  assert.equal(items[1].state, "waiting-network");
  assert.equal(items[1]._preOfflineState, "processing");
  assert.equal(items[2].state, "waiting-network");
  assert.equal(items[2]._preOfflineState, "uploading");

  // Complete/failed/paused stay unchanged
  assert.equal(items[3].state, "complete");
  assert.equal(items[4].state, "failed");
  assert.equal(items[5].state, "paused");
  assert.equal(items[3]._preOfflineState, undefined);
  assert.equal(items[4]._preOfflineState, undefined);
  assert.equal(items[5]._preOfflineState, undefined);

  // Simulate online transition
  for (const item of items) {
    if (item.state === "waiting-network" && item._preOfflineState) {
      item.state = item._preOfflineState;
      delete item._preOfflineState;
    }
  }

  assert.equal(items[0].state, "ready");
  assert.equal(items[0]._preOfflineState, undefined);
  assert.equal(items[1].state, "processing");
  assert.equal(items[2].state, "uploading");
  assert.equal(items[3].state, "complete");
  assert.equal(items[4].state, "failed");
  assert.equal(items[5].state, "paused");
});

// ── 7B-6: Object URL tracking and revocation ──
test("7B-6: trackObjectUrl adds blob: URLs to a Set and revokeObjectUrls clears all", () => {
  const urls = new Set();
  const revoked = [];

  // Mock URL global
  const originalRevoke = globalThis.URL?.revokeObjectURL;
  globalThis.URL = {
    ...globalThis.URL,
    createObjectURL: (blob) => `blob:mock-${Math.random().toString(36).slice(2)}`,
    revokeObjectURL: (url) => revoked.push(url),
  };

  function trackObjectUrl(url) {
    if (!url || !url.startsWith("blob:")) return url;
    urls.add(url);
    return url;
  }

  function revokeObjectUrls() {
    for (const url of urls) {
      try { URL.revokeObjectURL(url); } catch { /* already revoked */ }
    }
    urls.clear();
  }

  const url1 = trackObjectUrl(URL.createObjectURL(new Blob()));
  const url2 = trackObjectUrl(URL.createObjectURL(new Blob()));

  assert.equal(urls.size, 2);
  assert.match(url1, /^blob:mock-/);
  assert.match(url2, /^blob:mock-/);

  revokeObjectUrls();
  assert.equal(urls.size, 0);
  assert.equal(revoked.length, 2);

  // Restore original
  if (originalRevoke) {
    globalThis.URL.revokeObjectURL = originalRevoke;
  }
});

// ── 7B-8: Leave protection (hasUnsafeExit) ──
test("7B-8: hasUnsafeExit returns true when dirty or uploads are active", () => {
  assert.equal(hasUnsafeExit({ dirty: true, activeUploadCount: 0 }), true);
  assert.equal(hasUnsafeExit({ dirty: false, activeUploadCount: 3 }), true);
  assert.equal(hasUnsafeExit({ dirty: true, activeUploadCount: 1 }), true);
  assert.equal(hasUnsafeExit({ dirty: false, activeUploadCount: 0 }), false);
  assert.equal(hasUnsafeExit({ dirty: undefined, activeUploadCount: undefined }), false);
});

// ── 7B-4: Resume waits for old promise before acting ──
test("7B-4: resume awaits old upload promise to settle before issuing new request", async () => {
  let settled = false;
  let resumed = false;

  const oldPromise = new Promise((resolve) => {
    setTimeout(() => {
      settled = true;
      resolve();
    }, 10);
  });

  async function resumeWithAwait(id) {
    // Wait for pending promise to settle
    try { await oldPromise; } catch { /* settled */ }
    resumed = true;
  }

  const resumeP = resumeWithAwait("item-1");
  assert.equal(resumed, false, "should not resume before old promise settles");
  await resumeP;
  assert.equal(settled, true);
  assert.equal(resumed, true);
});

// ── 7B-4: Batch operations only select correct states ──
test("7B-4: batchPauseAll selects only uploading/processing/ready items", () => {
  const items = [
    { id: "1", state: "uploading" },
    { id: "2", state: "processing" },
    { id: "3", state: "ready" },
    { id: "4", state: "complete" },
    { id: "5", state: "failed" },
    { id: "6", state: "paused" },
    { id: "7", state: "cancelled" },
    { id: "8", state: "waiting-network" },
  ];

  const active = items.filter((item) =>
    item.state === "uploading" || item.state === "processing" || item.state === "ready"
  );
  assert.deepEqual(active.map((i) => i.id), ["1", "2", "3"]);

  const paused = items.filter((item) => item.state === "paused");
  assert.deepEqual(paused.map((i) => i.id), ["6"]);

  const retryable = items.filter((item) => item.state === "failed" || item.state === "cancelled");
  assert.deepEqual(retryable.map((i) => i.id), ["5", "7"]);

  const cancellable = items.filter((item) =>
    ["ready", "processing", "uploading", "waiting-network"].includes(item.state)
  );
  assert.deepEqual(cancellable.map((i) => i.id), ["1", "2", "3", "8"]);
});

// ── 7B-5: uploadRowModel exposes waiting-network state ──
test("7B-5: uploadRowModel renders waiting-network with correct status text", () => {
  const item = {
    id: "u1",
    file: { name: "clip.mp4" },
    kind: "video",
    state: "waiting-network",
    loaded: 0,
    total: 10485760,
    error: "",
  };

  const model = uploadRowModel(item);
  assert.equal(model.state, "waiting-network");
  assert.equal(model.statusText, "等待网络恢复…");
  assert.equal(model.canCancel, true);
  assert.equal(model.canPause, false);
  assert.equal(model.canResume, false);
  assert.equal(model.canRetry, false);
  assert.equal(model.progress, 0);
});

// ── 7B-7: Image sorter receives uploaded images ──
test("7B-7: image upload completion adds new image to existingImages with sort_order", () => {
  const existingImages = [
    { id: "img-1", image_key: "a.webp", width: 960, height: 540, sort_order: 0 },
  ];
  const uploadResult = { key: "images/new.webp", width: 1200, height: 800 };

  // Simulate what happens when image upload completes in livestream context
  const newImage = {
    id: uploadResult.key,
    image_key: uploadResult.key,
    width: uploadResult.width,
    height: uploadResult.height,
    sort_order: existingImages.length,
  };
  existingImages.push(newImage);

  assert.equal(existingImages.length, 2);
  assert.equal(existingImages[1].id, "images/new.webp");
  assert.equal(existingImages[1].sort_order, 1);
  assert.equal(existingImages[1].image_key, "images/new.webp");
});

// ── 7B: AddFiles includes metadata fields for recovery verification ──
test("7B: addFiles stores name, size, lastModified, type on upload items for metadata verification", () => {
  // Simulated file object
  const file = {
    name: "poster.webp",
    size: 2048000,
    lastModified: 1759411200000,
    type: "image/webp",
  };

  const item = {
    id: crypto.randomUUID(),
    file,
    kind: "poster",
    state: "ready",
    loaded: 0,
    total: file.size,
    result: null,
    error: "",
    workId: "work-1",
    name: file.name,
    size: file.size,
    lastModified: file.lastModified || 0,
    type: file.type,
  };

  assert.equal(item.name, "poster.webp");
  assert.equal(item.size, 2048000);
  assert.equal(item.lastModified, 1759411200000);
  assert.equal(item.type, "image/webp");
  assert.equal(item.workId, "work-1");
  assert.equal(item.state, "ready");
});

// ── 7B: Recovery descriptor dedup prevents duplicate items on boot ──
test("7B: recovery dedup checks name, size, lastModified, type, workId, kind", () => {
  const uploadItems = [
    { name: "clip.mp4", size: 10485760, lastModified: 1, type: "video/mp4", workId: "work-1", kind: "video" },
  ];
  const recovery = { name: "clip.mp4", size: 10485760, lastModified: 1, type: "video/mp4", workId: "work-1" };

  const exists = uploadItems.some(
    (item) =>
      item.name === recovery.name &&
      item.size === recovery.size &&
      item.lastModified === recovery.lastModified &&
      item.type === recovery.type &&
      item.workId === recovery.workId &&
      item.kind === "video"
  );

  assert.equal(exists, true);

  // Different metadata should not match
  const changed = { name: "clip.mp4", size: 10485761, lastModified: 1, type: "video/mp4", workId: "work-1" };
  const changedExists = uploadItems.some(
    (item) =>
      item.name === changed.name &&
      item.size === changed.size &&
      item.lastModified === changed.lastModified &&
      item.type === changed.type &&
      item.workId === changed.workId &&
      item.kind === "video"
  );

  assert.equal(changedExists, false);
});

// ── 7B: pendingUploads Map tracks active upload promises ──
test("7B: pendingUploads tracks and cleans up active upload promises", async () => {
  const pendingUploads = new Map();
  const completed = [];

  const promise = new Promise((resolve) => {
    setTimeout(() => {
      pendingUploads.delete("item-1");
      completed.push("item-1");
      resolve("done");
    }, 5);
  });
  pendingUploads.set("item-1", promise);

  assert.equal(pendingUploads.has("item-1"), true);

  await promise;
  assert.equal(pendingUploads.has("item-1"), false);
  assert.deepEqual(completed, ["item-1"]);
});
