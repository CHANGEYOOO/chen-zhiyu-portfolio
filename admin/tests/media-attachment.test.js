import test from "node:test";
import assert from "node:assert/strict";
import { mediaAttachmentPayload } from "../media-attachment.js";

test("does not attach media when a published Livestream receives a text-only edit", () => {
  const payload = mediaAttachmentPayload("livestream", [
    { image_key: "portfolio/livestream/work-1/existing.webp", width: 1600, height: 900, sort_order: 0 },
  ], []);

  assert.deepEqual(payload, {});
});

test("keeps existing Livestream images when a newly uploaded image is attached", () => {
  const payload = mediaAttachmentPayload("livestream", [
    { image_key: "portfolio/livestream/work-1/existing.webp", width: 1600, height: 900, sort_order: 0 },
  ], [
    { kind: "image", result: { key: "portfolio/livestream/work-1/new.webp", width: 960, height: 540 } },
  ]);

  assert.deepEqual(payload, {
    work_images: [
      { image_key: "portfolio/livestream/work-1/existing.webp", width: 1600, height: 900, sort_order: 0 },
      { image_key: "portfolio/livestream/work-1/new.webp", width: 960, height: 540, sort_order: 1 },
    ],
  });
});
