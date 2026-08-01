import test from "node:test";
import assert from "node:assert/strict";
import { updateWork, saveWorkOrder } from "../src/works.js";

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

test("reports a version conflict instead of overwriting a newer work", async () => {
  const db = d1({ success: true, meta: { changes: 0 } });
  const response = await updateWork(new Request("https://api.example.test", {
    method: "PUT",
    body: JSON.stringify({ section: "tvc", brand_name: "Brand", work_title: "Film", work_type: "TVC", status: "draft", version: 1 }),
  }), { DB: db }, "work-1", { email: "admin@example.com" });

  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "VERSION_CONFLICT");
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
