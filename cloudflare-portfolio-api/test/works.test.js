import test from "node:test";
import assert from "node:assert/strict";
import { archiveWork, saveImageOrder, saveWorkOrder, updateWork } from "../src/works.js";

function d1(result = { success: true, meta: { changes: 1 } }) {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      return {
        bind(...params) {
          statements.push({ sql, params });
          return {
            async run() { return result; },
            async first() { return null; },
            async all() { return { results: [] }; },
          };
        },
      };
    },
    async batch(batch) { return Promise.all(batch.map((statement) => statement.run())); },
  };
}

function imageOrderD1(initialOrders) {
  const orders = new Map(Object.entries(initialOrders));
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() {
              if (params.length === 1) return { results: [...orders.keys()].map((id) => ({ id })) };
              return { results: params.slice(1).map((id) => orders.has(id) ? { id } : null).filter(Boolean) };
            },
            async run() {
              if (sql.includes("SET sort_order = sort_order +")) {
                const maximum = Math.max(...orders.values());
                for (const imageId of params.slice(2)) orders.set(imageId, orders.get(imageId) + maximum + 1);
                return { success: true, meta: { changes: params.length - 2 } };
              }
              if (sql.startsWith("UPDATE work_images SET sort_order = ?")) {
                const [sortOrder, imageId] = params;
                if ([...orders.entries()].some(([id, current]) => id !== imageId && current === sortOrder)) throw new Error("UNIQUE constraint failed: work_images.work_id, work_images.sort_order");
                orders.set(imageId, sortOrder);
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
    orders,
  };
}

test("reports a version conflict instead of overwriting a newer work", async () => {
  const db = d1({ success: true, meta: { changes: 0 } });
  const response = await updateWork(new Request("https://api.example.test", {
    method: "PUT",
    body: JSON.stringify({ section: "tvc", brand_name: "Brand", work_title: "Film", work_type: "TVC", status: "draft", version: 1 }),
  }), { DB: db }, "work-1", { email: "admin@example.com" });

  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "VERSION_CONFLICT");
});

test("removes persisted Livestream image rows when the work changes to TVC", async () => {
  const db = d1();
  await updateWork(new Request("https://api.example.test", {
    method: "PUT",
    body: JSON.stringify({ section: "tvc", brand_name: "Brand", work_title: "Film", work_type: "TVC", status: "draft", version: 1 }),
  }), { DB: db }, "work-1", { email: "admin@example.com" });

  assert.ok(db.statements.some((statement) => statement.sql.startsWith("DELETE FROM work_images WHERE work_id = ?") && statement.params[0] === "work-1"));
});

test("rejects a section order containing a work from another section before batching", async () => {
  const db = d1();
  db.prepare = (sql) => ({
    bind(...params) {
      db.statements.push({ sql, params });
      return {
        async all() { return { results: [{ id: "tvc-1", section: "tvc" }] }; },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
    },
  });
  let batches = 0;
  db.batch = async () => { batches += 1; return []; };

  const response = await saveWorkOrder(new Request("https://api.example.test", {
    method: "PUT",
    body: JSON.stringify({ section: "tvc", ids: ["tvc-1", "live-1"] }),
  }), { DB: db }, { email: "admin@example.com" });

  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "INVALID_ORDER");
  assert.equal(batches, 0);
});

test("saves a validated section order in a single D1 batch", async () => {
  const db = d1();
  db.prepare = (sql) => ({
    bind(...params) {
      db.statements.push({ sql, params });
      return {
        async all() { return { results: [{ id: "tvc-1", section: "tvc" }, { id: "tvc-2", section: "tvc" }] }; },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
    },
  });
  let receivedBatch = [];
  db.batch = async (batch) => { receivedBatch = batch; return Promise.all(batch.map((statement) => statement.run())); };

  const response = await saveWorkOrder(new Request("https://api.example.test", {
    method: "PUT",
    body: JSON.stringify({ section: "tvc", ids: ["tvc-2", "tvc-1"] }),
  }), { DB: db }, { email: "admin@example.com" });

  assert.equal(response.status, 200);
  assert.equal(receivedBatch.length, 3);
  assert.deepEqual((await response.json()).data.ids, ["tvc-2", "tvc-1"]);
});

test("renumbers images through a temporary range before swapping their order", async () => {
  const db = imageOrderD1({ "image-a": 0, "image-b": 1 });
  const response = await saveImageOrder(new Request("https://api.example.test", {
    method: "PUT",
    body: JSON.stringify({ ids: ["image-b", "image-a"] }),
  }), { DB: db }, "work-1", { email: "admin@example.com" });

  assert.equal(response.status, 200);
  assert.equal(db.orders.get("image-b"), 0);
  assert.equal(db.orders.get("image-a"), 1);
});

test("rejects a partial image order before it can collide with an omitted image", async () => {
  const db = imageOrderD1({ "image-a": 0, "image-b": 1, "image-c": 2 });
  const response = await saveImageOrder(new Request("https://api.example.test", {
    method: "PUT",
    body: JSON.stringify({ ids: ["image-b", "image-c"] }),
  }), { DB: db }, "work-1", { email: "admin@example.com" });

  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "INVALID_ORDER");
  assert.deepEqual(Object.fromEntries(db.orders), { "image-a": 0, "image-b": 1, "image-c": 2 });
});

test("returns a validation error when archiving with a null JSON body", async () => {
  const response = await archiveWork(new Request("https://api.example.test", {
    method: "POST",
    body: "null",
  }), { DB: d1() }, "work-1", { email: "admin@example.com" });

  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
});

test("returns a validation error when ordering works with an array JSON body", async () => {
  const response = await saveWorkOrder(new Request("https://api.example.test", {
    method: "PUT",
    body: "[]",
  }), { DB: d1() }, { email: "admin@example.com" });

  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "VALIDATION_FAILED");
});
