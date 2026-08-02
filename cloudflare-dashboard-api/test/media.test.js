import assert from "node:assert/strict";
import test from "node:test";
import { attachDraftMedia, uploadPoster } from "../src/media.js";

const identity = { email: "admin@example.com", sub: "user-123" };
const desktopKey = "portfolio/tvc/work-1/poster-desktop-11111111-1111-4111-8111-111111111111.webp";
const mobileKey = "portfolio/tvc/work-1/poster-mobile-22222222-2222-4222-8222-222222222222.webp";

function request(value) {
  return new Request("https://dashboard.example.test", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

function mediaDb({ version = 1 } = {}) {
  const work = { id: "work-1", section: "tvc", status: "draft", version, poster_key: null, poster_mobile_key: null };
  const updates = [];
  const audits = [];
  return {
    work,
    updates,
    audits,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.startsWith("SELECT id, section, status, version")) return { ...work };
              return null;
            },
            async run() {
              if (sql.startsWith("UPDATE works SET poster_key")) {
                updates.push(params);
                if (params.at(-1) !== work.version) return { meta: { changes: 0 } };
                Object.assign(work, { poster_key: params[0], poster_mobile_key: params[1], version: work.version + 1 });
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith("INSERT INTO audit_log")) {
                audits.push(params);
                return { meta: { changes: 1 } };
              }
              throw new Error(`Unexpected statement: ${sql}`);
            },
          };
        },
      };
    },
  };
}

test("uploads only a WebP poster under a server generated draft key with ownership metadata", async () => {
  const db = mediaDb();
  const puts = [];
  const response = await uploadPoster(new Request("https://dashboard.example.test", {
    method: "POST",
    headers: { "content-type": "image/webp" },
    body: new Blob(["poster"], { type: "image/webp" }),
  }), { DB: db, MEDIA: { async put(key, body, options) { puts.push({ key, body, options }); } } }, "work-1", "desktop", identity);

  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.match(data.key, /^portfolio\/tvc\/work-1\/poster-desktop-[a-z0-9-]+\.webp$/);
  assert.equal(data.variant, "desktop");
  assert.equal(puts.length, 1);
  assert.equal(puts[0].options.httpMetadata.contentType, "image/webp");
  assert.deepEqual(puts[0].options.customMetadata, { section: "tvc", workId: "work-1", variant: "desktop" });
});

test("rejects an invalid poster variant or non-WebP upload without writing R2", async () => {
  const db = mediaDb();
  const puts = [];
  const media = { async put(...args) { puts.push(args); } };

  const invalidVariant = await uploadPoster(new Request("https://dashboard.example.test", { method: "POST", headers: { "content-type": "image/webp" }, body: "x" }), { DB: db, MEDIA: media }, "work-1", "wide", identity);
  const invalidType = await uploadPoster(new Request("https://dashboard.example.test", { method: "POST", headers: { "content-type": "image/jpeg" }, body: "x" }), { DB: db, MEDIA: media }, "desktop", identity);

  assert.equal(invalidVariant.status, 422);
  assert.equal(invalidType.status, 422);
  assert.equal(puts.length, 0);
});

test("binds only desktop and mobile server-generated objects owned by the active draft", async () => {
  const db = mediaDb();
  const heads = [];
  const response = await attachDraftMedia(request({ version: 1, poster_key: desktopKey, poster_mobile_key: mobileKey }), {
    DB: db,
    MEDIA: { async head(key) { heads.push(key); return { customMetadata: { section: "tvc", workId: "work-1", variant: key.includes("desktop") ? "desktop" : "mobile" } }; } },
  }, "work-1", identity);

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { id: "work-1", section: "tvc", status: "draft", version: 2, poster_key: desktopKey, poster_mobile_key: mobileKey });
  assert.deepEqual(heads, [desktopKey, mobileKey]);
  assert.equal(db.updates.length, 1);
});

test("rejects arbitrary keys and objects whose metadata belongs to another work", async () => {
  const db = mediaDb();
  const wrongKey = await attachDraftMedia(request({ version: 1, poster_key: "portfolio/tvc/work-2/poster-desktop-thing.webp", poster_mobile_key: mobileKey }), { DB: db, MEDIA: { async head() { return null; } } }, "work-1", identity);
  const wrongOwner = await attachDraftMedia(request({ version: 1, poster_key: desktopKey, poster_mobile_key: mobileKey }), {
    DB: db,
    MEDIA: { async head() { return { customMetadata: { section: "tvc", workId: "work-2", variant: "desktop" } }; } },
  }, "work-1", identity);

  assert.equal(wrongKey.status, 422);
  assert.equal(wrongOwner.status, 422);
  assert.equal(db.updates.length, 0);
});

test("rejects a same-work poster key that was not generated with the server UUID format", async () => {
  const db = mediaDb();
  const response = await attachDraftMedia(request({
    version: 1,
    poster_key: "portfolio/tvc/work-1/poster-desktop-client-name.webp",
    poster_mobile_key: mobileKey,
  }), {
    DB: db,
    MEDIA: { async head(key) { return { customMetadata: { section: "tvc", workId: "work-1", variant: key.includes("desktop") ? "desktop" : "mobile" } }; } },
  }, "work-1", identity);

  assert.equal(response.status, 422);
  assert.equal(db.updates.length, 0);
});

test("does not bind a newer draft over a stale optimistic version", async () => {
  const db = mediaDb({ version: 2 });
  const response = await attachDraftMedia(request({ version: 1, poster_key: desktopKey, poster_mobile_key: mobileKey }), {
    DB: db,
    MEDIA: { async head(key) { return { customMetadata: { section: "tvc", workId: "work-1", variant: key.includes("desktop") ? "desktop" : "mobile" } }; } },
  }, "work-1", identity);

  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "VERSION_CONFLICT");
});
