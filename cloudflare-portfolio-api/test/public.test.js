import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { updateWork } from "../src/works.js";

function publicDb() {
  const works = [
    { id: "draft", section: "tvc", brand_name: "Hidden", work_title: "Draft", work_type: "TVC", poster_key: "portfolio/tvc/draft.webp", video_key: "portfolio/tvc/draft.mp4", sort_order: 0, status: "draft", version: 4 },
    { id: "tvc-later", section: "tvc", brand_name: "Brand B", work_title: "Second", work_type: "TVC", poster_key: "portfolio/tvc/second poster.webp", video_key: "portfolio/tvc/second.mp4", sort_order: 2, status: "published", version: 8 },
    { id: "tvc-first", section: "tvc", brand_name: "Brand A", work_title: "First", work_type: "TVC", poster_key: "portfolio/tvc/first.webp", poster_mobile_key: "portfolio/tvc/first-mobile.webp", video_key: "portfolio/tvc/first.mp4", sort_order: 1, status: "published", version: 2 },
    { id: "archived", section: "livestream", brand_name: null, work_title: "Archived", work_type: "Set", poster_key: null, video_key: null, sort_order: 0, status: "archived", version: 7 },
    { id: "live", section: "livestream", brand_name: null, work_title: "Live", work_type: "Set", poster_key: null, video_key: null, sort_order: 0, status: "published", version: 3 },
  ];
  const images = [
    { id: "late", work_id: "live", image_key: "portfolio/livestream/live/late image.webp", width: 2000, height: 1000, sort_order: 2 },
    { id: "first", work_id: "live", image_key: "portfolio/livestream/live/first.webp", width: 1200, height: 800, sort_order: 1 },
    { id: "hidden", work_id: "archived", image_key: "portfolio/livestream/archived/no.webp", width: 1, height: 1, sort_order: 0 },
  ];
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() {
              if (sql.includes("FROM works WHERE status = 'published'")) {
                return { results: works.filter((work) => work.status === "published").sort((a, b) => a.section.localeCompare(b.section) || a.sort_order - b.sort_order) };
              }
              if (sql.includes("FROM work_images AS image")) {
                return { results: images.filter((image) => works.find((work) => work.id === image.work_id)?.status === "published").sort((a, b) => a.work_id.localeCompare(b.work_id) || a.sort_order - b.sort_order) };
              }
              return { results: [] };
            },
            async run() { return { success: true, meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
}

function cacheBinding() {
  const entries = new Map();
  const deletes = [];
  return {
    deletes,
    async match(request) { return entries.get(request.url)?.clone(); },
    async put(request, response) { entries.set(request.url, response.clone()); },
    async delete(request) { deletes.push(request.url); return entries.delete(request.url); },
  };
}

function withWorkerCache(t) {
  const original = globalThis.caches;
  const cache = cacheBinding();
  globalThis.caches = { default: cache };
  t.after(() => { globalThis.caches = original; });
  return cache;
}

test("exposes only ordered published works with normalized media URLs", async (t) => {
  withWorkerCache(t);
  const response = await worker.fetch(new Request("https://api.example.test/api/public/works"), { DB: publicDb() });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "public, max-age=60, stale-while-revalidate=300");
  assert.match(response.headers.get("etag"), /^"[a-f0-9]{64}"$/);
  const payload = await response.json();
  assert.match(payload.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(payload.works.map((work) => work.id), ["live", "tvc-first", "tvc-later"]);
  assert.deepEqual(Object.keys(payload.works[1]).sort(), ["brand_name", "id", "poster_mobile_url", "poster_url", "section", "sort_order", "video_url", "work_images", "work_title", "work_type"]);
  assert.equal(payload.works[1].poster_url, "https://media.kjoe.top/portfolio/tvc/first.webp");
  assert.equal(payload.works[1].poster_mobile_url, "https://media.kjoe.top/portfolio/tvc/first-mobile.webp");
  assert.equal(payload.works[2].poster_url, "https://media.kjoe.top/portfolio/tvc/second%20poster.webp");
  assert.equal(payload.works[0].work_images[0].image_url, "https://media.kjoe.top/portfolio/livestream/live/first.webp");
  assert.deepEqual(payload.works[0].work_images.map((image) => image.id), ["first", "late"]);
  assert.equal("status" in payload.works[1], false);
  assert.equal("version" in payload.works[1], false);
});

test("returns 304 when If-None-Match matches the cached published response", async (t) => {
  withWorkerCache(t);
  const env = { DB: publicDb() };
  const first = await worker.fetch(new Request("https://api.example.test/api/public/works"), env);
  const etag = first.headers.get("etag");
  const second = await worker.fetch(new Request("https://api.example.test/api/public/works", { headers: { "If-None-Match": etag } }), env);

  assert.equal(second.status, 304);
  assert.equal(second.headers.get("etag"), etag);
  assert.equal(await second.text(), "");
});

test("invalidates the public cache after a work publication change", async (t) => {
  const cache = withWorkerCache(t);
  const db = {
    prepare() {
      return {
        bind() {
          return {
            async run() { return { success: true, meta: { changes: 1 } }; },
            async first() { return { id: "work-1", section: "tvc", brand_name: "Brand", work_title: "Film", work_type: "TVC", status: "published" }; },
            async all() { return { results: [] }; },
          };
        },
      };
    },
  };
  const response = await updateWork(new Request("https://api.example.test", {
    method: "PUT",
    body: JSON.stringify({ section: "tvc", brand_name: "Brand", work_title: "Film", work_type: "TVC", status: "published", version: 1 }),
  }), { DB: db }, "work-1", { email: "admin@example.com" });

  assert.equal(response.status, 200);
  assert.deepEqual(cache.deletes, ["https://api.example.test/api/public/works"]);
});
