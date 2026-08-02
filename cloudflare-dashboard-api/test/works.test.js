import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { createTvcDraft, getTvcDraft, updateTvcDraft } from "../src/works.js";
import { getTvcOrder, orderRevision } from "../src/order.js";

function request(method, path, value) {
  return new Request(`https://dashboard.example.test${path}`, {
    method,
    headers: value === undefined ? undefined : { "content-type": "application/json" },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
}

function draftDb({ work = null, published = [] } = {}) {
  const inserted = [];
  const updates = [];
  const queries = [];
  return {
    inserted,
    updates,
    queries,
    prepare(sql) {
      return {
        bind(...params) {
          queries.push({ sql, params });
          return {
            async run() {
              if (sql.startsWith("INSERT INTO works")) {
                inserted.push({
                  id: params[0],
                  section: params[1],
                  brand_name: params[2],
                  work_title: params[3],
                  work_type: params[4],
                  status: params[5],
                });
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith("UPDATE works")) {
                updates.push({ sql, params });
                return { meta: { changes: work?.version === params.at(-1) ? 1 : 0 } };
              }
              return { meta: { changes: 1 } };
            },
            async first() {
              if (sql.includes("section = 'tvc' AND status = 'draft'") && (work?.section !== "tvc" || work?.status !== "draft")) return null;
              return work;
            },
            async all() {
              return { results: [...published].sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id)) };
            },
          };
        },
      };
    },
  };
}

const identity = { email: "admin@example.com", sub: "user-123" };

test("creates a server-id TVC draft while ignoring client-controlled fields", async () => {
  const db = draftDb();
  const response = await createTvcDraft(request("POST", "/works", {
    id: "client-selected-id",
    section: "livestream",
    status: "published",
    posterKey: "untrusted.webp",
    sortOrder: 99,
    brandName: " Nike ",
    workTitle: " Run ",
    workType: " TVC ",
  }), { DB: db }, identity);

  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.match(data.id, /^[a-zA-Z0-9_-]+$/);
  assert.notEqual(data.id, "client-selected-id");
  assert.deepEqual(db.inserted[0], {
    id: data.id,
    section: "tvc",
    brand_name: "Nike",
    work_title: "Run",
    work_type: "TVC",
    status: "draft",
  });
  assert.equal(data.section, "tvc");
  assert.equal(data.status, "draft");
});

test("gets only an active TVC draft", async () => {
  const db = draftDb({
    work: { id: "work-1", section: "tvc", status: "draft", version: 3, brand_name: "Nike", work_title: "Run", work_type: "TVC" },
  });
  const response = await getTvcDraft(request("GET", "/works/work-1"), { DB: db }, "work-1", identity);

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, {
    id: "work-1", section: "tvc", status: "draft", version: 3,
    brandName: "Nike", workTitle: "Run", workType: "TVC",
  });
});

test("does not expose a published work through the draft endpoint", async () => {
  const db = draftDb({
    work: { id: "work-1", section: "tvc", status: "published", version: 3, brand_name: "Nike", work_title: "Run", work_type: "TVC" },
  });
  const response = await getTvcDraft(request("GET", "/works/work-1"), { DB: db }, "work-1", identity);

  assert.equal(response.status, 404);
});

test("updates only the active draft with an optimistic version", async () => {
  const db = draftDb({
    work: { id: "work-1", section: "tvc", status: "draft", version: 1, brand_name: "Old", work_title: "Old", work_type: "TVC" },
  });
  const response = await updateTvcDraft(request("PUT", "/works/work-1", {
    version: 2, brandName: "A", workTitle: "B", workType: "TVC", status: "published",
  }), { DB: db }, "work-1", identity);

  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "VERSION_CONFLICT");
  assert.equal(db.updates.length, 1);
  assert.match(db.updates[0].sql, /section = 'tvc' AND status = 'draft'/);
});

test("returns only published TVCs in deterministic order with a server revision", async () => {
  const db = draftDb({
    published: [
      { id: "work-2", brand_name: "Second", work_title: "Film", sort_order: 4 },
      { id: "work-1", brand_name: "First", work_title: "Film", sort_order: 4 },
    ],
  });
  const response = await getTvcOrder(request("GET", "/tvc/order"), { DB: db });

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, {
    items: [
      { id: "work-1", label: "First — Film" },
      { id: "work-2", label: "Second — Film" },
    ],
    orderRevision: "O0yV99NAACO43mfHnedDtwjdxqRD72EH6u4la-coZ8Y",
  });
  assert.match(db.queries[0].sql, /section = 'tvc' AND status = 'published' ORDER BY sort_order, id/);
});

test("derives the order revision from the complete ordered id list", async () => {
  assert.equal(await orderRevision(["work-2", "work-1"]), "WFJM7HgYaAg2nP1Zy31Vtgoj1i5lgAfR-RUhBMtZpJk");
  assert.equal(await orderRevision([]), "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU");
});

test("keeps business routes behind Dashboard Access", async () => {
  const db = draftDb();
  const response = await worker.fetch(request("POST", "/admin/dashboard/api/works", {
    brandName: "Nike", workTitle: "Run", workType: "TVC",
  }), { DB: db });

  assert.equal(response.status, 401);
  assert.equal(db.inserted.length, 0);
});
