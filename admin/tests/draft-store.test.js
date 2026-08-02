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
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
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

test("lists saved draft work ids sorted and excludes recovery records", () => {
  const localStorage = storage();
  const drafts = new DraftStore(localStorage);
  drafts.save("work-2", { work_title: "Second" });
  drafts.saveRecovery("work-1", { name: "clip.mp4" });
  drafts.save("work-1", { work_title: "First" });

  assert.deepEqual(drafts.list(), ["work-1", "work-2"]);
  assert.equal(drafts.loadRecovery("work-1").name, "clip.mp4");
});

test("persists a recovery record without file bytes", () => {
  const localStorage = storage();
  const drafts = new DraftStore(localStorage);
  drafts.saveRecovery("work-1", {
    name: "clip.mp4",
    size: 3,
    file: new Blob([new Uint8Array([1, 2, 3])]),
  });

  assert.deepEqual(drafts.loadRecovery("work-1"), { name: "clip.mp4", size: 3 });
  assert.deepEqual(localStorage.dump("portfolio-admin:recovery:work-1"), { name: "clip.mp4", size: 3 });
  assert.equal(drafts.load("work-1"), null);
  assert.deepEqual(drafts.list(), []);
});

test("clears a saved recovery record", () => {
  const localStorage = storage();
  const drafts = new DraftStore(localStorage);
  drafts.saveRecovery("work-1", { name: "clip.mp4" });

  drafts.clearRecovery("work-1");

  assert.equal(drafts.loadRecovery("work-1"), null);
});

test("discards a corrupted recovery record on load", () => {
  const localStorage = storage();
  localStorage.setItem("portfolio-admin:recovery:work-1", "{oops");
  const drafts = new DraftStore(localStorage);

  assert.equal(drafts.loadRecovery("work-1"), null);
  assert.equal(localStorage.getItem("portfolio-admin:recovery:work-1"), null);
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
