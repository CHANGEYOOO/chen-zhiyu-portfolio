import test from "node:test";
import assert from "node:assert/strict";
import { attachMedia } from "../src/media.js";

function mediaDb(section = "tvc") {
  const work = { id: "work-1", section, status: "draft", version: 1 };
  const images = [];
  return {
    work,
    images,
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
                const [posterKey, posterMobileKey, videoKey, workId, version] = params;
                if (workId !== work.id || version !== work.version) return { meta: { changes: 0 } };
                Object.assign(work, { poster_key: posterKey, poster_mobile_key: posterMobileKey, video_key: videoKey, version: version + 1 });
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith("DELETE FROM work_images")) {
                images.length = 0;
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith("INSERT INTO work_images")) {
                const [id, workId, imageKey, sortOrder, width, height] = params;
                images.push({ id, work_id: workId, image_key: imageKey, sort_order: sortOrder, width, height });
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith("INSERT INTO audit_log")) return { meta: { changes: 1 } };
              throw new Error(`Unexpected run: ${sql}`);
            },
          };
        },
      };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); },
  };
}

test("attaches completed desktop/mobile poster and video keys to a draft TVC", async () => {
  const db = mediaDb();
  const media = { async head(key) { return { key }; } };
  const response = await attachMedia(new Request("https://api.example.test", {
    method: "PUT",
    body: JSON.stringify({
      version: 1,
      poster_key: "portfolio/tvc/work-1/poster-desktop.webp",
      poster_mobile_key: "portfolio/tvc/work-1/poster-mobile.webp",
      video_key: "portfolio/tvc/work-1/film.mp4",
    }),
  }), { DB: db, MEDIA: media }, "work-1", { email: "admin@example.com" });

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, {
    id: "work-1",
    section: "tvc",
    status: "draft",
    version: 2,
    poster_key: "portfolio/tvc/work-1/poster-desktop.webp",
    poster_mobile_key: "portfolio/tvc/work-1/poster-mobile.webp",
    video_key: "portfolio/tvc/work-1/film.mp4",
  });
});

test("rejects media keys outside the draft work prefix", async () => {
  const db = mediaDb();
  const response = await attachMedia(new Request("https://api.example.test", {
    method: "PUT",
    body: JSON.stringify({ version: 1, poster_key: "portfolio/tvc/another-work/poster.webp" }),
  }), { DB: db, MEDIA: { async head() { return { key: "ignored" }; } } }, "work-1", { email: "admin@example.com" });

  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "INVALID_MEDIA");
});

test("replaces draft livestream project images with completed local uploads in submitted order", async () => {
  const db = mediaDb("livestream");
  const response = await attachMedia(new Request("https://api.example.test", {
    method: "PUT",
    body: JSON.stringify({
      version: 1,
      work_images: [
        { image_key: "portfolio/livestream/work-1/first.webp", width: 1600, height: 900 },
        { image_key: "portfolio/livestream/work-1/second.webp", width: 960, height: 540 },
      ],
    }),
  }), { DB: db, MEDIA: { async head(key) { return { key }; } } }, "work-1", { email: "admin@example.com" });

  assert.equal(response.status, 200);
  assert.deepEqual(db.images.map(({ work_id, image_key, sort_order, width, height }) => ({ work_id, image_key, sort_order, width, height })), [
    { work_id: "work-1", image_key: "portfolio/livestream/work-1/first.webp", sort_order: 0, width: 1600, height: 900 },
    { work_id: "work-1", image_key: "portfolio/livestream/work-1/second.webp", sort_order: 1, width: 960, height: 540 },
  ]);
});
