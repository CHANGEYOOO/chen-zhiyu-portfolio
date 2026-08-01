import test from "node:test";
import assert from "node:assert/strict";
import { DraftStore } from "../draft-store.js";

function storage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) || null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
    dump(key) { return JSON.parse(values.get(key)); },
  };
}

test("restores text and order metadata without serializing file bytes", () => {
  const localStorage = storage();
  const drafts = new DraftStore(localStorage);

  drafts.save("work-1", {
    work_title: "A film",
    sort_order: 4,
    image_order: ["image-b", "image-a"],
    files: [new Blob([new Uint8Array([1, 2, 3])])],
  });

  assert.deepEqual(drafts.load("work-1"), {
    work_title: "A film",
    sort_order: 4,
    image_order: ["image-b", "image-a"],
  });
  assert.deepEqual(localStorage.dump("portfolio-admin:draft:work-1"), {
    work_title: "A film",
    sort_order: 4,
    image_order: ["image-b", "image-a"],
  });
});

test("removes a saved draft", () => {
  const localStorage = storage();
  const drafts = new DraftStore(localStorage);
  drafts.save("work-1", { work_title: "A film" });

  drafts.remove("work-1");

  assert.equal(drafts.load("work-1"), null);
});

test("restores saved image order for persisted project images after reload", () => {
  const localStorage = storage();
  const drafts = new DraftStore(localStorage);
  drafts.save("work-1", { image_order: ["image-2", "image-1"] });

  const ordered = drafts.orderImages([
    { id: "image-1", image_key: "first.webp" },
    { id: "image-2", image_key: "second.webp" },
  ], drafts.load("work-1").image_order);

  assert.deepEqual(ordered.map((image) => image.id), ["image-2", "image-1"]);
});
