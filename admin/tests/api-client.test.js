import test from "node:test";
import assert from "node:assert/strict";
import { PortfolioApi, PortfolioApiError } from "../api-client.js";

test("always sends same-origin credentials even if a caller supplies another mode", async () => {
  let options;
  const api = new PortfolioApi({
    fetchImpl: async (url, value) => {
      options = value;
      return Response.json({ data: { ok: true } });
    },
  });

  await api.request("/api/admin/session", { credentials: "include" });

  assert.equal(options.credentials, "same-origin");
});

test("maps 401 responses to isAuth and preserves the server message", async () => {
  const api = new PortfolioApi({
    fetchImpl: async () =>
      Response.json({ error: { code: "UNAUTHORIZED", message: "登录已过期，请重新登录。" } }, { status: 401 }),
  });

  await assert.rejects(api.session(), (error) => {
    assert.ok(error instanceof PortfolioApiError);
    assert.equal(error.name, "PortfolioApiError");
    assert.equal(error.status, 401);
    assert.equal(error.code, "UNAUTHORIZED");
    assert.equal(error.isAuth, true);
    assert.equal(error.isConflict, false);
    assert.equal(error.message, "登录已过期，请重新登录。");
    return true;
  });
});

test("maps 409 version-mismatch responses to isConflict and preserves the server message", async () => {
  const api = new PortfolioApi({
    fetchImpl: async () =>
      Response.json({ error: { code: "VERSION_CONFLICT", message: "该作品已被修改，请刷新后重试。" } }, { status: 409 }),
  });

  await assert.rejects(api.updateWork("w1", { status: "published", version: 1 }), (error) => {
    assert.ok(error instanceof PortfolioApiError);
    assert.equal(error.status, 409);
    assert.equal(error.code, "VERSION_CONFLICT");
    assert.equal(error.isConflict, true);
    assert.equal(error.isAuth, false);
    assert.equal(error.message, "该作品已被修改，请刷新后重试。");
    return true;
  });
});

test("non-auth, non-conflict errors leave both lifecycle flags false", async () => {
  const api = new PortfolioApi({
    fetchImpl: async () => Response.json({ error: { code: "NOT_FOUND", message: "作品不存在" } }, { status: 404 }),
  });

  await assert.rejects(api.getWork("missing"), (error) => {
    assert.ok(error instanceof PortfolioApiError);
    assert.equal(error.isAuth, false);
    assert.equal(error.isConflict, false);
    return true;
  });
});

test("setWorkStatus sends the complete Worker update shape without mutating the work", async () => {
  let url;
  let options;
  const api = new PortfolioApi({
    fetchImpl: async (requestUrl, requestOptions) => {
      url = requestUrl;
      options = requestOptions;
      return Response.json({ data: { id: "w1", status: "published", version: 3 } });
    },
  });
  const work = {
    id: "w1",
    section: "tvc",
    brand_name: "Nike",
    work_title: "Air Max",
    work_type: "TVC",
    status: "draft",
    version: 2,
    sort_order: 4,
    poster_key: "portfolio/tvc/w1/poster.jpg",
    work_images: [{ id: "image-1" }],
    updated_at: "2026-08-02T10:00:00Z",
  };
  const original = structuredClone(work);

  const result = await api.setWorkStatus(work, "published", 3);

  assert.equal(url, "/api/admin/works/w1");
  assert.equal(options.method, "PUT");
  assert.deepEqual(JSON.parse(options.body), {
    section: "tvc",
    brand_name: "Nike",
    work_title: "Air Max",
    work_type: "TVC",
    status: "published",
    version: 3,
  });
  assert.deepEqual(work, original);
  assert.equal(result.id, "w1");
  assert.equal(result.status, "published");
});

test("setWorkStatus defaults version to the current work version", async () => {
  let body;
  const api = new PortfolioApi({
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return Response.json({ data: { id: "live-1", status: "draft", version: 8 } });
    },
  });
  const work = {
    id: "live-1",
    section: "livestream",
    brand_name: null,
    work_title: "夏日直播间",
    work_type: "直播",
    status: "archived",
    version: 7,
    work_images: [{ id: "image-1" }],
  };

  await api.setWorkStatus(work, "draft");

  assert.deepEqual(body, {
    section: "livestream",
    brand_name: null,
    work_title: "夏日直播间",
    work_type: "直播",
    status: "draft",
    version: 7,
  });
  assert.deepEqual(work.work_images, [{ id: "image-1" }]);
});
