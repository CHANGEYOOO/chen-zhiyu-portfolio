import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import worker from "../src/index.js";

function base64url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function signedToken(payload, privateKey) {
  const header = base64url({ alg: "RS256", kid: "test-key", typ: "JWT" });
  const body = base64url(payload);
  const signingInput = `${header}.${body}`;
  const signature = createSign("RSA-SHA256").update(signingInput).end().sign(privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

function accessEnv(adminEmails) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    env: {
      ADMIN_EMAILS: adminEmails,
      ACCESS_AUD: "portfolio-admin",
      ACCESS_JWKS_URL: "https://access.example.test/certs",
      DB: { prepare() { throw new Error("DB should not be used"); } },
    },
    token(email) {
      return signedToken({ aud: "portfolio-admin", email, sub: "user-123", exp: Math.floor(Date.now() / 1000) + 300 }, privateKey);
    },
    jwks: { keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" }] },
  };
}

test("rejects an admin route without a Cloudflare Access assertion even when an email header is supplied", async () => {
  const { env } = accessEnv("admin@example.com");
  const response = await worker.fetch(new Request("https://api.example.test/api/admin/works", {
    headers: { "Cf-Access-Authenticated-User-Email": "admin@example.com" },
  }), env);

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "UNAUTHORIZED");
});

test("rejects a verified identity outside the administrator allowlist", async (t) => {
  const access = accessEnv("admin@example.com");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(access.jwks);
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await worker.fetch(new Request("https://api.example.test/api/admin/works", {
    headers: { "Cf-Access-Jwt-Assertion": access.token("viewer@example.com") },
  }), access.env);

  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "FORBIDDEN");
});
