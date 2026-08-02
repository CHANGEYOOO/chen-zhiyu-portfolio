import test from "node:test";
import assert from "node:assert/strict";
import { moveItem, SortableList } from "../sortable-list.js";

const images = [
  { id: "image-a", sort_order: 7 },
  { id: "image-b", sort_order: 3 },
  { id: "image-c", sort_order: 12 },
];

function ids(items) {
  return items.map((item) => item.id);
}

test("moves a dragged item into its requested position without mutating the source", () => {
  const moved = moveItem(images, 2, 0);

  assert.deepEqual(ids(moved), ["image-c", "image-a", "image-b"]);
  assert.deepEqual(ids(images), ["image-a", "image-b", "image-c"]);
});

test("leaves the first and last items in place when a move exceeds the list boundary", () => {
  assert.deepEqual(ids(moveItem(images, 0, -1)), ["image-a", "image-b", "image-c"]);
  assert.deepEqual(ids(moveItem(images, 2, 3)), ["image-a", "image-b", "image-c"]);
});

test("moves items up and down with continuous sort_order values", () => {
  const list = new SortableList({ items: images });

  list.moveUp(2);
  list.moveDown(1);

  assert.deepEqual(ids(list.items), ["image-a", "image-b", "image-c"]);
  assert.deepEqual(list.items.map((item) => item.sort_order), [0, 1, 2]);
});

test("marks only the first ordered image as the cover", () => {
  const list = new SortableList({ items: images });

  assert.deepEqual(list.entries.map(({ item, isFirst }) => [item.id, isFirst]), [
    ["image-a", true],
    ["image-b", false],
    ["image-c", false],
  ]);
});

test("emits a change and becomes dirty when pointer ordering changes locally", () => {
  const list = new SortableList({ items: images });
  let detail;
  list.addEventListener("change", (event) => { detail = event.detail; });

  list.move(2, 0, "pointer");

  assert.equal(list.dirty, true);
  assert.equal(detail.source, "pointer");
  assert.deepEqual(ids(detail.items), ["image-c", "image-a", "image-b"]);
});

test("cancel restores the last server order and clears dirty state", () => {
  const list = new SortableList({ items: images });
  list.move(1, 0, "pointer");

  list.cancel();

  assert.equal(list.dirty, false);
  assert.deepEqual(ids(list.items), ["image-a", "image-b", "image-c"]);
  assert.deepEqual(list.items.map((item) => item.sort_order), [0, 1, 2]);
});
