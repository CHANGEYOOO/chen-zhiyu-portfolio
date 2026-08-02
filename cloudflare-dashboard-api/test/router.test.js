import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { accessEnv, withJwks } from "./helpers/access.js";
import { d1 } from "./helpers/d1.js";
import { r2 } from "./helpers/r2.js";
import { safeWorkId } from "../src/validation.js";

function env() {
  return { DB: d1(), MEDIA: r2() };
}

function request(path, init) {
  return new Request(`https://dashboard.example.test${path}`, init);
}

test("rejects requests outside the exact dashboard API prefix", async () => {
  const response = await worker.fetch(request("/api/admin/works"), env());

  assert.equal(response.status, 404);
});

test("requires Access before handling a dashboard business route", async () => {
  const response = await worker.fetch(request("/admin/dashboard/api/session"), env());

  assert.equal(response.status, 401);
});

test("returns the verified identity from the isolated dashboard session route", async (t) => {
  const access = accessEnv();
  withJwks(t, access.jwks);

  const response = await worker.fetch(access.signedRequest(), { ...access.env, DB: d1(), MEDIA: r2() });

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { email: "admin@example.com", logoutUrl: "/cdn-cgi/access/logout" });
});

test("does not treat unlisted methods or nested routes as dashboard API routes", async (t) => {
  const access = accessEnv();
  withJwks(t, access.jwks);

  const post = await worker.fetch(new Request("https://dashboard.example.test/admin/dashboard/api/session", {
    method: "POST",
    headers: access.signedRequest().headers,
  }), access.env);
  const nested = await worker.fetch(new Request("https://dashboard.example.test/admin/dashboard/api/session/extra", {
    headers: access.signedRequest().headers,
  }), access.env);

  assert.equal(post.status, 404);
  assert.equal(nested.status, 404);
});

test("accepts only dashboard-safe work identifiers", () => {
  assert.equal(safeWorkId("work-123"), true);
  assert.equal(safeWorkId("<script>"), false);
  assert.equal(safeWorkId("a".repeat(129)), false);
});
