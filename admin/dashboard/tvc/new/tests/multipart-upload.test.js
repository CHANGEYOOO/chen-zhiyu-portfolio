import assert from "node:assert/strict";
import test from "node:test";
import { createMultipartUploader } from "../multipart-upload.js";
import { videoFingerprint } from "../video-validation.js";

const metadata = { width: 1920, height: 1080 };

function video(size = 20, { name = "cut.mp4", type = "video/mp4", lastModified = 123 } = {}) {
  const file = new Blob([new Uint8Array(size)], { type });
  Object.defineProperties(file, { name: { value: name }, lastModified: { value: lastModified } });
  return file;
}

function sessionWithParts(file, partNumbers = []) {
  return {
    workId: "work-1",
    uploadId: "upload-1",
    key: "portfolio/tvc/work-1/video-upload-1.mp4",
    totalBytes: file.size,
    fingerprint: videoFingerprint(file),
    parts: partNumbers.map((partNumber) => ({ partNumber, etag: `etag-${partNumber}` })),
  };
}

function uploadApi(overrides = {}) {
  const state = { created: 0, active: 0, maximumObservedConcurrency: 0, uploaded: [], completed: [], aborted: new Set() };
  return {
    state,
    async createVideoMultipart(workId, file) {
      state.created += 1;
      return { uploadId: "upload-1", key: `portfolio/tvc/${workId}/video-upload-1.mp4`, totalBytes: file.size, partSize: 4 };
    },
    async getVideoMultipart(workId, uploadId) {
      return {
        workId,
        uploadId,
        key: `portfolio/tvc/${workId}/video-upload-1.mp4`,
        totalBytes: 20,
        contentType: "video/mp4",
        partSize: 4,
        maxConcurrentUploads: 3,
      };
    },
    async uploadVideoPart(_workId, _uploadId, partNumber, bytes, signal) {
      state.active += 1;
      state.maximumObservedConcurrency = Math.max(state.maximumObservedConcurrency, state.active);
      await new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        setTimeout(resolve, 5);
      });
      state.active -= 1;
      state.uploaded.push({ partNumber, bytes: bytes.byteLength });
      return { partNumber, etag: `etag-${partNumber}` };
    },
    async completeVideoMultipart(_workId, _uploadId, parts) {
      state.completed.push(parts);
      return { key: "portfolio/tvc/work-1/video-upload-1.mp4" };
    },
    async abortVideoMultipart(_workId, uploadId) {
      state.aborted.add(uploadId);
    },
    ...overrides,
  };
}

test("uploads at most three parts and resumes acknowledged etags", async () => {
  const file = video();
  const api = uploadApi();
  const persisted = [];
  const uploader = createMultipartUploader({ api, partSize: 4, concurrency: 3, persist: (session) => persisted.push(session) });

  const result = await uploader.resume(file, sessionWithParts(file, [1, 2]), { metadata });

  assert.equal(api.state.maximumObservedConcurrency, 3);
  assert.deepEqual(result.parts.map((part) => part.partNumber), [1, 2, 3, 4, 5]);
  assert.deepEqual(api.state.uploaded.map((part) => part.partNumber).sort(), [3, 4, 5]);
  assert.deepEqual(persisted.at(-1).parts.map((part) => part.partNumber), [1, 2, 3, 4, 5]);
});

test("retries a network failure up to three times with all jittered retry delays before completing", async () => {
  const file = video(3);
  let attempts = 0;
  const delays = [];
  const api = uploadApi({
    async createVideoMultipart(workId, file) {
      api.state.created += 1;
      return { uploadId: "upload-1", key: `portfolio/tvc/${workId}/video-upload-1.mp4`, totalBytes: file.size, partSize: 3 };
    },
    async uploadVideoPart(_workId, _uploadId, partNumber) {
      attempts += 1;
      if (attempts < 4) throw Object.assign(new Error("network unavailable"), { code: "NETWORK_ERROR" });
      return { partNumber, etag: `etag-${partNumber}` };
    },
  });
  const uploader = createMultipartUploader({ api, partSize: 3, random: () => 0, sleep: async (delay) => delays.push(delay) });

  const result = await uploader.start(file, { workId: "work-1", metadata });

  assert.equal(attempts, 4);
  assert.deepEqual(delays, [250, 500, 1000]);
  assert.deepEqual(result.parts, [{ partNumber: 1, etag: "etag-1" }]);
  assert.deepEqual(api.state.completed, [[{ partNumber: 1, etag: "etag-1" }]]);
});

test("does not retry a non-retryable part failure", async () => {
  const file = video(3);
  let attempts = 0;
  const api = uploadApi({
    async createVideoMultipart(workId, file) {
      api.state.created += 1;
      return { uploadId: "upload-1", key: `portfolio/tvc/${workId}/video-upload-1.mp4`, totalBytes: file.size, partSize: 3 };
    },
    async uploadVideoPart() {
      attempts += 1;
      throw Object.assign(new Error("bad request"), { status: 400 });
    },
  });
  const uploader = createMultipartUploader({ api, partSize: 3, sleep: async () => assert.fail("non-retryable failures must not sleep") });

  await assert.rejects(uploader.start(file, { workId: "work-1", metadata }), /bad request/);
  assert.equal(attempts, 1);
  assert.equal(api.state.completed.length, 0);
});

test("requires reselecting the same fingerprint before a saved session can resume", async () => {
  const original = video();
  const different = video(20, { lastModified: 124 });
  const api = uploadApi();
  const uploader = createMultipartUploader({ api, partSize: 4 });

  await assert.rejects(uploader.resume(different, sessionWithParts(original, [1]), { metadata }), /same file/);
  assert.equal(api.state.uploaded.length, 0);
  assert.equal(api.state.completed.length, 0);
});

test("cancelling an active upload aborts its local requests and remote session", async () => {
  const file = video(4);
  let observedSignal;
  const api = uploadApi({
    uploadVideoPart(_workId, _uploadId, _partNumber, _bytes, signal) {
      observedSignal = signal;
      return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    },
  });
  const uploader = createMultipartUploader({ api, partSize: 4 });

  const pending = uploader.start(file, { workId: "work-1", metadata });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await uploader.cancel("work-1");

  await assert.rejects(pending, /cancelled/i);
  assert.equal(observedSignal.aborted, true);
  assert.equal(api.state.aborted.has("upload-1"), true);
});

test("cancellation still settles locally when the remote abort endpoint is unavailable", async () => {
  const file = video(4);
  let observedSignal;
  const api = uploadApi({
    uploadVideoPart(_workId, _uploadId, _partNumber, _bytes, signal) {
      observedSignal = signal;
      return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    },
    async abortVideoMultipart(_workId, uploadId) {
      api.state.aborted.add(uploadId);
      throw new Error("abort endpoint unavailable");
    },
  });
  const uploader = createMultipartUploader({ api, partSize: 4 });

  const pending = uploader.start(file, { workId: "work-1", metadata });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await assert.doesNotReject(uploader.cancel("work-1"));

  await assert.rejects(pending, /cancelled/i);
  assert.equal(observedSignal.aborted, true);
  assert.equal(api.state.aborted.has("upload-1"), true);
});

test("validates the selected video before a multipart session is created", async () => {
  const api = uploadApi();
  const uploader = createMultipartUploader({ api, partSize: 4 });

  await assert.rejects(uploader.start(video(4, { name: "cut.mov", type: "video/quicktime" }), { workId: "work-1", metadata }), /MP4 or WebM/);
  assert.equal(api.state.created, 0);
});

test("rejects a server multipart part size that differs from the local slicing contract", async () => {
  const api = uploadApi({
    async createVideoMultipart(workId, file) {
      api.state.created += 1;
      return { uploadId: "upload-1", key: `portfolio/tvc/${workId}/video-upload-1.mp4`, totalBytes: file.size, partSize: 5 };
    },
  });
  const uploader = createMultipartUploader({ api, partSize: 4 });

  await assert.rejects(uploader.start(video(4), { workId: "work-1", metadata }), /part size/);
  assert.equal(api.state.uploaded.length, 0);
  assert.equal(api.state.completed.length, 0);
});
