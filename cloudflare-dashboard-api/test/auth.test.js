import assert from "node:assert/strict";
import test from "node:test";
import { requireDashboardAccess } from "../src/auth.js";
import { accessEnv, withJwks } from "./helpers/access.js";

test("rejects a dashboard request without an Access assertion", async () => {
  const { env } = accessEnv();
  const result = await requireDashboardAccess(new Request("https://dashboard.example.test/admin/dashboard/api/session"), env);

  assert.equal(result.response.status, 401);
  assert.equal((await result.response.json()).error.code, "UNAUTHORIZED");
});

test("accepts only the configured audience and admin email", async (t) => {
  const access = accessEnv();
  withJwks(t, access.jwks);

  const wrongAudience = await requireDashboardAccess(access.signedRequest({ aud: "wrong" }), access.env);
  const otherEmail = await requireDashboardAccess(access.signedRequest({ email: "other@example.com" }), access.env);

  assert.equal(wrongAudience.response.status, 403);
  assert.equal(otherEmail.response.status, 403);
});

test("rejects a signed assertion from a different issuer or an expired assertion", async (t) => {
  const access = accessEnv();
  withJwks(t, access.jwks);

  const wrongIssuer = await requireDashboardAccess(access.signedRequest({ iss: "https://other.example.test" }), access.env);
  const expired = await requireDashboardAccess(access.signedRequest({ exp: Math.floor(Date.now() / 1000) - 1 }), access.env);

  assert.equal(wrongIssuer.response.status, 403);
  assert.equal(expired.response.status, 403);
});
