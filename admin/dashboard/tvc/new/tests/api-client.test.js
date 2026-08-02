import assert from "node:assert/strict";
import test from "node:test";
import { createDashboardApi, DashboardApiError } from "../api-client.js";

const validDraft = { brandName: "Nike", workTitle: "Run", workType: "TVC" };

test("uses only same-origin Dashboard API URLs", () => {
  const api = createDashboardApi(async () => Response.json({ data: {} }));
  assert.equal(api.url("/works"), "/admin/dashboard/api/works");
  assert.equal(api.url("works/work-1"), "/admin/dashboard/api/works/work-1");
});

test("sends a normalized TVC draft create request with same-origin credentials", async () => {
  let observed;
  const api = createDashboardApi(async (url, options) => {
    observed = { url, options };
    return Response.json({ data: { id: "work-1" } });
  });

  const result = await api.createDraft({ ...validDraft, brandName: " Nike " });

  assert.deepEqual(result, { id: "work-1" });
  assert.equal(observed.url, "/admin/dashboard/api/works");
  assert.equal(observed.options.method, "POST");
  assert.equal(observed.options.credentials, "same-origin");
  assert.deepEqual(JSON.parse(observed.options.body), validDraft);
});

test("rejects invalid local draft fields with the unified API error", async () => {
  const api = createDashboardApi(async () => {
    throw new Error("fetch must not run for invalid fields");
  });

  await assert.rejects(() => api.createDraft({ ...validDraft, workTitle: "" }), (error) => {
    assert.ok(error instanceof DashboardApiError);
    assert.equal(error.status, 422);
    assert.equal(error.code, "VALIDATION_FAILED");
    return true;
  });
});

test("normalizes Worker error responses into DashboardApiError", async () => {
  const api = createDashboardApi(async () => Response.json({
    error: { code: "VERSION_CONFLICT", message: "This work has changed; refresh and try again" },
  }, { status: 409 }));

  await assert.rejects(() => api.updateDraft("work-1", { ...validDraft, version: 1 }), (error) => {
    assert.ok(error instanceof DashboardApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "VERSION_CONFLICT");
    assert.equal(error.isConflict, true);
    return true;
  });
});

test("normalizes network failures without leaking the fetch diagnostic", async () => {
  const api = createDashboardApi(async () => {
    throw new TypeError("fetch failed: private connection diagnostic");
  });

  await assert.rejects(() => api.getTvcOrder(), (error) => {
    assert.ok(error instanceof DashboardApiError);
    assert.equal(error.status, 0);
    assert.equal(error.code, "NETWORK_ERROR");
    assert.doesNotMatch(error.message, /private connection diagnostic/);
    return true;
  });
});

test("uploads converted WebP poster variants and binds their returned server keys", async () => {
  const calls = [];
  const api = createDashboardApi(async (url, options) => {
    calls.push({ url, options });
    if (options.method === "POST") return Response.json({ data: { key: `portfolio/tvc/work-1/poster-${url.endsWith("desktop") ? "desktop" : "mobile"}.webp` } });
    return Response.json({ data: { version: 2 } });
  });
  const desktop = new Blob(["desktop"], { type: "image/webp" });
  const mobile = new Blob(["mobile"], { type: "image/webp" });

  const uploads = await api.uploadPosters("work-1", [
    { variant: "desktop", blob: desktop },
    { variant: "mobile", blob: mobile },
  ]);
  await api.attachPosterMedia("work-1", { version: 1, poster_key: uploads.desktop.key, poster_mobile_key: uploads.mobile.key });

  assert.equal(calls[0].url, "/admin/dashboard/api/works/work-1/posters/desktop");
  assert.equal(calls[0].options.headers["content-type"], "image/webp");
  assert.equal(calls[0].options.body, desktop);
  assert.equal(calls[1].url, "/admin/dashboard/api/works/work-1/posters/mobile");
  assert.equal(calls[2].url, "/admin/dashboard/api/works/work-1/media");
  assert.deepEqual(JSON.parse(calls[2].options.body), { version: 1, poster_key: uploads.desktop.key, poster_mobile_key: uploads.mobile.key });
});
