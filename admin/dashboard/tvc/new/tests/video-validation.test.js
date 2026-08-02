import assert from "node:assert/strict";
import test from "node:test";
import { VIDEO_LIMITS, sameFingerprint, validateVideoFile, videoFingerprint } from "../video-validation.js";

function video({ name = "cut.mp4", type = "video/mp4", size = 1024, lastModified = 123 } = {}) {
  const file = new Blob([new Uint8Array(size)], { type });
  Object.defineProperties(file, { name: { value: name }, lastModified: { value: lastModified } });
  return file;
}

test("accepts MP4 and WebM files inside the 1080p envelope", () => {
  const mp4 = video();
  const webm = video({ name: "cut.webm", type: "video/webm" });

  assert.doesNotThrow(() => validateVideoFile(mp4, { width: 1920, height: 1080 }));
  assert.doesNotThrow(() => validateVideoFile(webm, { width: 1080, height: 1920 }));
});

test("rejects unsupported, empty, oversized, or mismatched video files", () => {
  assert.throws(() => validateVideoFile(video({ name: "cut.mov", type: "video/quicktime" }), { width: 1920, height: 1080 }), /MP4 or WebM/);
  assert.throws(() => validateVideoFile(video({ name: "cut.webm", type: "video/mp4" }), { width: 1920, height: 1080 }), /match/);
  assert.throws(() => validateVideoFile(video({ size: 0 }), { width: 1920, height: 1080 }), /empty/);
  assert.throws(() => validateVideoFile(video({ size: VIDEO_LIMITS.maxBytes + 1 }), { width: 1920, height: 1080 }), /2 GiB/);
});

test("rejects video above the 1080p envelope or without readable metadata", () => {
  const mp4 = video();

  assert.throws(() => validateVideoFile(mp4, { width: 2560, height: 1440 }), /1080p/);
  assert.throws(() => validateVideoFile(mp4, { width: 1920, height: 0 }), /metadata/);
});

test("fingerprint uses no file bytes", () => {
  const mp4 = video({ size: 4096, lastModified: 456 });

  assert.deepEqual(videoFingerprint(mp4), {
    name: mp4.name,
    size: mp4.size,
    type: mp4.type,
    lastModified: mp4.lastModified,
  });
});

test("matches fingerprints only when all reselection fields match", () => {
  const fingerprint = { name: "cut.mp4", size: 4096, type: "video/mp4", lastModified: 456 };

  assert.equal(sameFingerprint(fingerprint, { ...fingerprint }), true);
  assert.equal(sameFingerprint(fingerprint, { ...fingerprint, lastModified: 457 }), false);
  assert.equal(sameFingerprint(fingerprint, null), false);
});
