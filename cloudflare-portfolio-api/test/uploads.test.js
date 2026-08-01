import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import worker from "../src/index.js";

const MiB = 1024 * 1024;

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

function mediaBinding() {
  const calls = [];
  const uploads = new Map();
  return {
    calls,
    async put(key, body, options) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      calls.push({ method: "put", key, bytes, options });
      return { key };
    },
    async createMultipartUpload(key, options) {
      const uploadId = `upload-${uploads.size + 1}`;
      uploads.set(uploadId, { key, options, parts: new Map(), aborted: false });
      calls.push({ method: "createMultipartUpload", key, options, uploadId });
      return { key, uploadId };
    },
    resumeMultipartUpload(key, uploadId) {
      const upload = uploads.get(uploadId);
      calls.push({ method: "resumeMultipartUpload", key, uploadId });
      return {
        async uploadPart(partNumber, body) {
          if (!upload || upload.key !== key || upload.aborted) throw new Error("Unknown multipart upload");
          const bytes = new Uint8Array(await new Response(body).arrayBuffer());
          upload.parts.set(partNumber, bytes);
          calls.push({ method: "uploadPart", key, uploadId, partNumber, bytes });
          return { partNumber, etag: `etag-${partNumber}` };
        },
        async complete(parts) {
          if (!upload || upload.key !== key || upload.aborted) throw new Error("Unknown multipart upload");
          calls.push({ method: "complete", key, uploadId, parts });
          return { key, size: [...upload.parts.values()].reduce((total, part) => total + part.byteLength, 0), httpMetadata: upload.options.httpMetadata };
        },
        async abort() {
          if (!upload || upload.key !== key || upload.aborted) throw new Error("Unknown multipart upload");
          upload.aborted = true;
          calls.push({ method: "abort", key, uploadId });
        },
      };
    },
  };
}

function uploadDb() {
  const sessions = new Map();
  return {
    sessions,
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async run() {
              if (sql.startsWith("INSERT INTO upload_sessions")) {
                const [uploadId, key, section, workId, totalBytes, contentType, actorEmail] = params;
                sessions.set(uploadId, { upload_id: uploadId, object_key: key, section, work_id: workId, total_bytes: totalBytes, content_type: contentType, actor_email: actorEmail, status: "active" });
              }
              if (sql.startsWith("UPDATE upload_sessions SET status =")) sessions.get(params[1]).status = params[0];
              return { success: true, meta: { changes: 1 } };
            },
            async first() {
              if (sql.startsWith("SELECT upload_id")) return sessions.get(params[0]) || null;
              return null;
            },
          };
        },
      };
    },
  };
}

function accessEnv() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const media = mediaBinding();
  const db = uploadDb();
  return {
    media,
    env: {
      ADMIN_EMAILS: "admin@example.com",
      ACCESS_AUD: "portfolio-admin",
      ACCESS_JWKS_URL: "https://access.example.test/certs",
      MEDIA_PUBLIC_URL: "https://media.example.test",
      MEDIA: media,
      DB: db,
    },
    token() {
      return signedToken({ aud: "portfolio-admin", email: "admin@example.com", sub: "user-123", exp: Math.floor(Date.now() / 1000) + 300 }, privateKey);
    },
    jwks: { keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" }] },
  };
}

async function request(t, access, path, init = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(access.jwks);
  t.after(() => { globalThis.fetch = originalFetch; });
  const headers = new Headers(init.headers);
  headers.set("Cf-Access-Jwt-Assertion", access.token());
  return worker.fetch(new Request(`https://api.example.test${path}`, { ...init, headers }), access.env);
}

function imageHeaders(overrides = {}) {
  return {
    "content-type": "image/webp",
    "x-work-id": "work-1",
    "x-section": "tvc",
    "x-file-name": "hero.webp",
    "x-width": "1920",
    "x-height": "1080",
    ...overrides,
  };
}

async function createUpload(t, access, body = {}) {
  const response = await request(t, access, "/api/admin/uploads/multipart/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ section: "tvc", workId: "work-1", fileName: "cut.mp4", contentType: "video/mp4", totalBytes: 11 * MiB, ...body }),
  });
  assert.equal(response.status, 201);
  return response.json();
}

test("rejects unsupported image MIME types before writing media", async (t) => {
  const access = accessEnv();
  const response = await request(t, access, "/api/admin/uploads/image", {
    method: "POST",
    headers: imageHeaders({ "content-type": "image/gif" }),
    body: new Uint8Array([1]),
  });

  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "UNSUPPORTED_MEDIA_TYPE");
  assert.equal(access.media.calls.length, 0);
});

test("rejects an image larger than 20 MiB", async (t) => {
  const access = accessEnv();
  const response = await request(t, access, "/api/admin/uploads/image", {
    method: "POST",
    headers: imageHeaders({ "content-length": String(20 * MiB + 1) }),
    body: new Uint8Array(1),
  });

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "FILE_TOO_LARGE");
  assert.equal(access.media.calls.length, 0);
});

test("stores a valid image under a server-generated portfolio key with HTTP metadata", async (t) => {
  const access = accessEnv();
  const response = await request(t, access, "/api/admin/uploads/image", {
    method: "POST",
    headers: imageHeaders(),
    body: new Uint8Array([1, 2, 3]),
  });

  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.match(data.key, /^portfolio\/tvc\/work-1\/[0-9a-f-]+-hero\.webp$/);
  assert.equal(data.publicUrl, `https://media.example.test/${data.key}`);
  assert.equal(data.size, 3);
  assert.equal(data.contentType, "image/webp");
  assert.equal(access.media.calls[0].options.httpMetadata.contentType, "image/webp");
  assert.equal(access.media.calls[0].options.customMetadata.width, "1920");
});

test("rejects multipart videos larger than 2 GiB", async (t) => {
  const access = accessEnv();
  const response = await request(t, access, "/api/admin/uploads/multipart/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ section: "tvc", workId: "work-1", fileName: "cut.mp4", contentType: "video/mp4", totalBytes: 2 * 1024 * MiB + 1 }),
  });

  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "FILE_TOO_LARGE");
  assert.equal(access.media.calls.length, 0);
});

test("rejects a multipart key outside its portfolio work directory", async (t) => {
  const access = accessEnv();
  const upload = await createUpload(t, access);
  const response = await request(t, access, `/api/admin/uploads/multipart/${upload.data.uploadId}/parts/1`, {
    method: "PUT",
    headers: { "x-upload-key": "portfolio/tvc/another-work/cut.mp4", "content-type": "video/mp4" },
    body: new Uint8Array(1),
  });

  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "INVALID_OBJECT_KEY");
});

test("rejects invalid multipart part numbers", async (t) => {
  const access = accessEnv();
  const upload = await createUpload(t, access);
  const response = await request(t, access, `/api/admin/uploads/multipart/${upload.data.uploadId}/parts/0`, {
    method: "PUT",
    headers: { "x-upload-key": upload.data.key, "content-type": "video/mp4" },
    body: new Uint8Array(1),
  });

  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "INVALID_PART_NUMBER");
});

test("rejects a multipart part that exceeds its stored total size", async (t) => {
  const access = accessEnv();
  const upload = await createUpload(t, access);
  const response = await request(t, access, `/api/admin/uploads/multipart/${upload.data.uploadId}/parts/2`, {
    method: "PUT",
    headers: { "x-upload-key": upload.data.key, "content-type": "video/mp4" },
    body: new Uint8Array(2 * MiB),
  });

  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "INVALID_PART_SIZE");
});

test("rejects multipart completion with missing part numbers", async (t) => {
  const access = accessEnv();
  const upload = await createUpload(t, access);
  const response = await request(t, access, `/api/admin/uploads/multipart/${upload.data.uploadId}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-upload-key": upload.data.key },
    body: JSON.stringify({ parts: [{ partNumber: 1, etag: "etag-1" }, { partNumber: 3, etag: "etag-3" }] }),
  });

  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "MISSING_PARTS");
});

test("completes multipart uploads and returns the public media URL", async (t) => {
  const access = accessEnv();
  const upload = await createUpload(t, access);
  await request(t, access, `/api/admin/uploads/multipart/${upload.data.uploadId}/parts/1`, {
    method: "PUT",
    headers: { "x-upload-key": upload.data.key, "content-type": "video/mp4" },
    body: new Uint8Array(10 * MiB),
  });
  await request(t, access, `/api/admin/uploads/multipart/${upload.data.uploadId}/parts/2`, {
    method: "PUT",
    headers: { "x-upload-key": upload.data.key, "content-type": "video/mp4" },
    body: new Uint8Array(MiB),
  });
  const response = await request(t, access, `/api/admin/uploads/multipart/${upload.data.uploadId}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-upload-key": upload.data.key },
    body: JSON.stringify({ parts: [{ partNumber: 1, etag: "etag-1" }, { partNumber: 2, etag: "etag-2" }] }),
  });

  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.key, upload.data.key);
  assert.equal(data.publicUrl, `https://media.example.test/${data.key}`);
  assert.equal(data.size, 11 * MiB);
  assert.equal(data.contentType, "video/mp4");
  assert.equal(access.media.calls.filter((call) => call.method === "uploadPart").length, 2);
  assert.equal(access.media.calls.find((call) => call.method === "complete").parts.length, 2);
});

test("aborts an active multipart upload", async (t) => {
  const access = accessEnv();
  const upload = await createUpload(t, access);
  const response = await request(t, access, `/api/admin/uploads/multipart/${upload.data.uploadId}`, {
    method: "DELETE",
    headers: { "x-upload-key": upload.data.key },
  });

  assert.equal(response.status, 204);
  assert.deepEqual(access.media.calls.at(-1), { method: "abort", key: upload.data.key, uploadId: upload.data.uploadId });
});
