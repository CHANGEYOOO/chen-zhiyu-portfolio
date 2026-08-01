import test from "node:test";
import assert from "node:assert/strict";
import { UploadManager, PART_SIZE } from "../upload-manager.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

function video(parts) {
  const file = new Blob(parts.map((size) => new Uint8Array(size)), { type: "video/mp4" });
  Object.defineProperties(file, { name: { value: "clip.mp4" }, lastModified: { value: 1 } });
  return file;
}

function uploadApi(overrides = {}) {
  const calls = { create: 0, parts: [], complete: [], abort: [] };
  return {
    calls,
    async createMultipartUpload() { calls.create += 1; return { uploadId: "upload-1", key: "portfolio/tvc/work-1/clip.mp4", partSize: PART_SIZE, maxConcurrentUploads: 3 }; },
    async uploadPart(uploadId, key, partNumber, bytes) {
      calls.parts.push({ uploadId, key, partNumber, bytes: bytes.byteLength });
      return { partNumber, etag: `etag-${partNumber}` };
    },
    async completeMultipartUpload(uploadId, key, parts) { calls.complete.push({ uploadId, key, parts }); return { publicUrl: "https://media.example.test/clip.mp4" }; },
    async abortMultipartUpload(uploadId, key) { calls.abort.push({ uploadId, key }); },
    ...overrides,
  };
}

test("uploads four video parts with at most three requests in flight", async () => {
  let active = 0;
  let maximum = 0;
  const api = uploadApi({
    async uploadPart(uploadId, key, partNumber, bytes) {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { partNumber, etag: `etag-${partNumber}` };
    },
  });
  const manager = new UploadManager(api, { storage: memoryStorage() });

  await manager.uploadVideo(video([PART_SIZE, PART_SIZE, PART_SIZE, 1024]), { section: "tvc", workId: "work-1" });

  assert.equal(maximum, 3);
  assert.equal(api.calls.create, 1);
});

test("retries only the failed part and keeps acknowledged parts", async () => {
  const attempts = new Map();
  const api = uploadApi({
    async uploadPart(uploadId, key, partNumber) {
      attempts.set(partNumber, (attempts.get(partNumber) || 0) + 1);
      if (partNumber === 2 && attempts.get(partNumber) === 1) throw new Error("temporary failure");
      return { partNumber, etag: `etag-${partNumber}` };
    },
  });
  const manager = new UploadManager(api, { storage: memoryStorage(), retries: 1 });

  await manager.uploadVideo(video([PART_SIZE, PART_SIZE, 1024]), { section: "tvc", workId: "work-1" });

  assert.deepEqual([...attempts.entries()].sort((a, b) => a[0] - b[0]), [[1, 1], [2, 2], [3, 1]]);
  assert.deepEqual(api.calls.complete[0].parts, [
    { partNumber: 1, etag: "etag-1" },
    { partNumber: 2, etag: "etag-2" },
    { partNumber: 3, etag: "etag-3" },
  ]);
});

test("resumes a stored upload id and ETags without reuploading completed parts", async () => {
  const storage = memoryStorage();
  const manager = new UploadManager(uploadApi(), { storage });
  const file = video([PART_SIZE, 1024]);
  const key = manager.resumeKey(file, { section: "tvc", workId: "work-1" });
  storage.setItem(key, JSON.stringify({ uploadId: "upload-resume", objectKey: "portfolio/tvc/work-1/clip.mp4", totalBytes: file.size, etags: { 1: "etag-1" } }));
  const api = uploadApi();
  manager.api = api;

  await manager.uploadVideo(file, { section: "tvc", workId: "work-1" });

  assert.equal(api.calls.create, 0);
  assert.deepEqual(api.calls.parts.map((part) => part.partNumber), [2]);
  assert.deepEqual(api.calls.complete[0].parts, [{ partNumber: 1, etag: "etag-1" }, { partNumber: 2, etag: "etag-2" }]);
});

test("aborts an active multipart upload and clears its resume record", async () => {
  let resolvePart;
  let partSignal;
  const api = uploadApi({
    uploadPart(uploadId, key, partNumber, bytes, signal) {
      partSignal = signal;
      return new Promise((resolve) => { resolvePart = resolve; });
    },
  });
  api.abortMultipartUpload = async (uploadId, key) => {
    api.calls.abort.push({ uploadId, key });
    throw new Error("network closed");
  };
  const storage = memoryStorage();
  const manager = new UploadManager(api, { storage });
  const file = video([PART_SIZE]);
  const promise = manager.uploadVideo(file, { section: "tvc", workId: "work-1" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await manager.abort(file, { section: "tvc", workId: "work-1" });
  resolvePart({ partNumber: 1, etag: "etag-1" });

  await assert.rejects(promise, /aborted/i);
  assert.equal(partSignal.aborted, true);
  assert.equal(api.calls.abort.length, 1);
  assert.equal(storage.getItem(manager.resumeKey(file, { section: "tvc", workId: "work-1" })), null);
});

test("cancels multipart creation before its upload session is returned", async () => {
  let resolveCreate;
  let createSignal;
  const api = uploadApi();
  api.createMultipartUpload = (value, signal) => {
    api.calls.create += 1;
    createSignal = signal;
    return new Promise((resolve) => { resolveCreate = resolve; });
  };
  const manager = new UploadManager(api, { storage: memoryStorage() });
  const file = video([PART_SIZE]);
  const promise = manager.uploadVideo(file, { section: "tvc", workId: "work-1" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  await manager.abort(file, { section: "tvc", workId: "work-1" });
  resolveCreate({ uploadId: "upload-1", key: "portfolio/tvc/work-1/clip.mp4", partSize: PART_SIZE, maxConcurrentUploads: 3 });

  await assert.rejects(promise, /aborted/i);
  assert.equal(createSignal.aborted, true);
  assert.equal(api.calls.parts.length, 0);
  assert.equal(api.calls.complete.length, 0);
  assert.equal(api.calls.abort.length, 1);
});
