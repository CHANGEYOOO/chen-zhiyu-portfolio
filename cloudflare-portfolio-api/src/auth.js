import { problem } from "./http.js";

const textDecoder = new TextDecoder();

function base64urlJson(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return JSON.parse(textDecoder.decode(Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))));
}

function configuredAudiences(env) {
  return String(env.ACCESS_AUD || "").split(",").map((value) => value.trim()).filter(Boolean);
}

function configuredAdmins(env) {
  return new Set(String(env.ADMIN_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function jwksUrl(env) {
  if (env.ACCESS_JWKS_URL) return env.ACCESS_JWKS_URL;
  if (env.ACCESS_TEAM_DOMAIN) return `https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`;
  return null;
}

function bytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function loadJwk(header, env) {
  const url = jwksUrl(env);
  if (!url) throw new Error("Cloudflare Access JWKS is not configured");
  const response = await fetch(url);
  if (!response.ok) throw new Error("Cloudflare Access JWKS request failed");
  const { keys } = await response.json();
  const key = keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!key) throw new Error("Cloudflare Access signing key was not found");
  return key;
}

async function verifyAssertion(token, env) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed Cloudflare Access assertion");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = base64urlJson(encodedHeader);
  const payload = base64urlJson(encodedPayload);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Unsupported Cloudflare Access assertion algorithm");

  const key = await crypto.subtle.importKey(
    "jwk",
    await loadJwk(header, env),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    bytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!valid) throw new Error("Invalid Cloudflare Access assertion signature");

  const now = Math.floor(Date.now() / 1000);
  const audiences = configuredAudiences(env);
  const tokenAudiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.length || !tokenAudiences.some((audience) => audiences.includes(audience))) throw new Error("Invalid Cloudflare Access audience");
  if (typeof payload.exp !== "number" || payload.exp <= now || (typeof payload.nbf === "number" && payload.nbf > now)) throw new Error("Expired or inactive Cloudflare Access assertion");
  if (env.ACCESS_ISSUER && payload.iss !== env.ACCESS_ISSUER) throw new Error("Invalid Cloudflare Access issuer");
  if (typeof payload.email !== "string" || !payload.email.trim() || typeof payload.sub !== "string" || !payload.sub) throw new Error("Cloudflare Access assertion lacks identity claims");

  return { email: payload.email.trim().toLowerCase(), sub: payload.sub };
}

export async function requireAccess(request, env) {
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!assertion) return { response: problem(401, "UNAUTHORIZED", "Cloudflare Access authentication is required") };

  let identity;
  try {
    identity = await verifyAssertion(assertion, env);
  } catch {
    return { response: problem(401, "UNAUTHORIZED", "Invalid Cloudflare Access assertion") };
  }

  if (!configuredAdmins(env).has(identity.email)) return { response: problem(403, "FORBIDDEN", "Administrator access is required") };
  return { identity };
}
