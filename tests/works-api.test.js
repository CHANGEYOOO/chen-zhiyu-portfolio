import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const adapterPath = new URL("../assets/data/works-api.js", import.meta.url);
const adapterSource = await readFile(adapterPath, "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function loadAdapter(fetchImpl, configuredEndpoint) {
  const window = {};
  if (configuredEndpoint !== undefined) {
    window.PORTFOLIO_PUBLIC_API_URL = configuredEndpoint;
  }
  vm.runInNewContext(adapterSource, { window, fetch: fetchImpl, URL });
  return window.PORTFOLIO_CONTENT;
}

const media = (path) => `https://media.kjoe.top/${path}`;

test("normalizes Cloudflare works while retaining only renderer fields and trusted media", async () => {
  const requests = [];
  const content = loadAdapter(async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        generatedAt: "2026-08-02T00:00:00.000Z",
        works: [
          {
            id: "tvc-1",
            section: "tvc",
            brand_name: "Brand A",
            work_title: "Film A",
            work_type: "Campaign",
            poster_url: media("portfolio/tvc/a.webp"),
            video_url: media("portfolio/tvc/a.mp4"),
            status: "published",
            private_note: "must not reach the page",
          },
          {
            id: "live-1",
            section: "livestream",
            work_title: "Live A",
            work_type: "Set Design",
            work_images: [
              { id: "late", image_url: media("portfolio/livestream/live-1/late.webp"), width: 2000, height: 1000, sort_order: 2, internal: "ignore" },
              { id: "first", image_url: media("portfolio/livestream/live-1/first.webp"), width: 1200, height: 800, sort_order: 1 },
            ],
          },
        ],
      }),
    };
  });

  const published = await content.loadPublished();

  assert.deepEqual(plain(requests), [{
    url: "https://api.kjoe.top/api/public/works",
    options: { headers: { Accept: "application/json" } },
  }]);
  assert.deepEqual(plain(published), {
    tvc: [{
      id: "tvc-1",
      brand: "Brand A",
      title: "Film A",
      category: "Campaign",
      poster: media("portfolio/tvc/a.webp"),
      video: media("portfolio/tvc/a.mp4"),
    }],
    livestream: [{
      id: "live-1",
      title: "Live A",
      category: "Set Design",
      directory: "live-1",
      images: [
        { url: media("portfolio/livestream/live-1/first.webp"), dimensions: [1200, 800], name: "first.webp" },
        { url: media("portfolio/livestream/live-1/late.webp"), dimensions: [2000, 1000], name: "late.webp" },
      ],
    }],
    imageDimensions: {
      [media("portfolio/livestream/live-1/first.webp")]: [1200, 800],
      [media("portfolio/livestream/live-1/late.webp")]: [2000, 1000],
    },
  });
});

test("rejects untrusted media URLs without exposing them to the renderer", async () => {
  const content = loadAdapter(async () => ({
    ok: true,
    json: async () => ({
      works: [
        {
          id: "unsafe-tvc",
          section: "tvc",
          brand_name: "Brand",
          work_title: "Unsafe",
          work_type: "TVC",
          poster_url: "https://evil.example/poster.webp",
          video_url: "javascript:alert(1)",
        },
        {
          id: "unsafe-live",
          section: "livestream",
          work_title: "Unsafe live",
          work_type: "Set",
          work_images: [
            { image_url: "data:image/svg+xml,<svg/>", width: 1, height: 1, sort_order: 0 },
            { image_url: media("portfolio/livestream/unsafe-live/allowed.webp"), width: 600, height: 400, sort_order: 1 },
          ],
        },
      ],
    }),
  }));

  const published = await content.loadPublished();

  assert.deepEqual(plain(published.tvc), []);
  assert.deepEqual(plain(published.livestream[0].images), [{
    url: media("portfolio/livestream/unsafe-live/allowed.webp"),
    dimensions: [600, 400],
    name: "allowed.webp",
  }]);
});

test("returns null when the API is disabled, unavailable, or malformed", async () => {
  const disabled = loadAdapter(async () => {
    throw new Error("disabled adapter must not fetch");
  }, "");
  assert.equal(await disabled.loadPublished(), null);

  const unavailable = loadAdapter(async () => {
    throw new Error("network unavailable");
  });
  assert.equal(await unavailable.loadPublished(), null);

  const malformed = loadAdapter(async () => ({ ok: true, json: async () => ({ works: "not an array" }) }));
  assert.equal(await malformed.loadPublished(), null);

  const unusable = loadAdapter(async () => ({
    ok: true,
    json: async () => ({
      works: [
        { id: "missing-media", section: "tvc", work_title: "No poster" },
        { id: "missing-images", section: "livestream", work_title: "No images", work_images: [] },
      ],
    }),
  }));
  assert.equal(await unusable.loadPublished(), null);
});
