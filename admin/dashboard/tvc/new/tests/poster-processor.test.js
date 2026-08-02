import assert from "node:assert/strict";
import test from "node:test";
import { POSTER_OUTPUTS, createPosterVariants, validatePosterSource } from "../poster-processor.js";

function fakeCanvasAdapters() {
  const canvases = [];
  return {
    canvases,
    async createImageBitmap() {
      return { width: 2000, height: 1000, close() {} };
    },
    createCanvas(width, height) {
      const operations = [];
      const canvas = {
        width,
        height,
        getContext() {
          return { drawImage(...args) { operations.push(args); } };
        },
        async convertToBlob(options) {
          return new Blob(["poster"], { type: options.type });
        },
      };
      canvases.push({ canvas, operations });
      return canvas;
    },
  };
}

const validSource = { type: "image/jpeg", size: 20 * 1024 * 1024, width: 1600, height: 900 };

test("exports the exact desktop and mobile output sizes", () => {
  assert.deepEqual(POSTER_OUTPUTS, {
    desktop: { width: 1600, height: 900 },
    mobile: { width: 960, height: 540 },
  });
});

test("rejects unsupported MIME types and sources over 20 MiB", () => {
  assert.throws(() => validatePosterSource({ ...validSource, type: "image/gif" }), /JPEG, PNG, or WebP/);
  assert.throws(() => validatePosterSource({ ...validSource, size: 20 * 1024 * 1024 + 1 }), /20 MiB/);
});

test("rejects undersized or non-16:9 posters", () => {
  assert.throws(() => validatePosterSource({ type: "image/jpeg", size: 100, width: 1200, height: 800 }), /1600 × 900/);
  assert.throws(() => validatePosterSource({ type: "image/jpeg", size: 100, width: 1600, height: 1000 }), /16:9/);
  assert.doesNotThrow(() => validatePosterSource({ ...validSource, width: 2000, height: 1114 }));
  assert.throws(() => validatePosterSource({ ...validSource, width: 2000, height: 1100 }), /16:9/);
});

test("produces exact desktop and mobile WebP variants with centered cover crops", async () => {
  const adapters = fakeCanvasAdapters();
  const result = await createPosterVariants(new Blob(["source"], { type: "image/jpeg" }), adapters);

  assert.deepEqual(result.map(({ variant, width, height, type }) => ({ variant, width, height, type })), [
    { variant: "desktop", width: 1600, height: 900, type: "image/webp" },
    { variant: "mobile", width: 960, height: 540, type: "image/webp" },
  ]);
  assert.deepEqual(adapters.canvases.map(({ canvas, operations }) => ({
    width: canvas.width,
    height: canvas.height,
    draw: operations[0].slice(1),
  })), [
    { width: 1600, height: 900, draw: [-100, 0, 1800, 900] },
    { width: 960, height: 540, draw: [-60, 0, 1080, 540] },
  ]);
});
