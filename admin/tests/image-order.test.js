import test from "node:test";
import assert from "node:assert/strict";
import { saveImageOrder } from "../image-order.js";
import { SortableList } from "../sortable-list.js";

function createList() {
  return new SortableList({ items: [
    { id: "image-a" },
    { id: "image-b" },
    { id: "image-c" },
  ] });
}

test("keeps the dirty local order when explicit image-order saving fails", async () => {
  const list = createList();
  list.move(2, 0, "pointer");

  await assert.rejects(
    saveImageOrder({ saveImageOrder: async () => { throw new Error("network unavailable"); } }, "work-1", list),
    /network unavailable/,
  );

  assert.equal(list.dirty, true);
  assert.deepEqual(list.items.map((item) => item.id), ["image-c", "image-a", "image-b"]);
});

test("pointer, keyboard, and touch reorders stay local until the explicit save handler runs", async () => {
  const list = createList();
  let saves = 0;
  const api = { saveImageOrder: async () => { saves += 1; } };

  list.move(2, 0, "pointer");
  list.move(0, 1, "keyboard");
  list.move(1, 2, "touch");

  assert.equal(saves, 0);
  await saveImageOrder(api, "work-1", list);
  assert.equal(saves, 1);
  assert.equal(list.dirty, false);
});

test("locks local ordering while an explicit save request is pending", async () => {
  const list = createList();
  list.move(2, 0, "pointer");
  let completeRequest;
  const saving = saveImageOrder({ saveImageOrder: () => new Promise((resolve) => { completeRequest = resolve; }) }, "work-1", list);

  assert.equal(list.disabled, true);
  assert.equal(list.move(0, 1, "keyboard"), false);
  assert.deepEqual(list.items.map((item) => item.id), ["image-c", "image-a", "image-b"]);

  completeRequest();
  await saving;
  assert.equal(list.disabled, false);
  assert.equal(list.dirty, false);
});
