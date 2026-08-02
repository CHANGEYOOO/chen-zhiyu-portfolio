import { createSign, generateKeyPairSync } from "node:crypto";

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

export function accessEnv({ adminEmails = "admin@example.com", audience = "dashboard-admin", issuer = "https://access.example.test" } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const env = {
    ADMIN_EMAILS: adminEmails,
    ACCESS_AUD: audience,
    ACCESS_ISSUER: issuer,
    ACCESS_JWKS_URL: "https://access.example.test/certs",
  };
  const jwks = { keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" }] };

  return {
    env,
    jwks,
    signedRequest(claims = {}) {
      const token = signedToken({
        aud: audience,
        email: "admin@example.com",
        exp: Math.floor(Date.now() / 1000) + 300,
        iss: issuer,
        sub: "user-123",
        ...claims,
      }, privateKey);
      return new Request("https://dashboard.example.test/admin/dashboard/api/session", {
        headers: { "Cf-Access-Jwt-Assertion": token },
      });
    },
  };
}

export function withJwks(t, jwks) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(jwks);
  t.after(() => { globalThis.fetch = originalFetch; });
}
