import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import {
  abortVideoMultipart,
  completeVideoMultipart,
  createVideoMultipart,
  getVideoMultipart,
  uploadVideoPart,
} from "../src/uploads.js";
import { accessEnv, withJwks } from "./helpers/access.js";

const MiB = 1024 * 1024;
const identity = { email: "admin@example.com", sub: "user-123" };

function jsonRequest(value) {
  return new Request("https://dashboard.example.test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

function partRequest(bytes) {
  return new Request("https://dashboard.example.test", {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: bytes,
  });
}

function uploadDb({ work = { id: "work-1", section: "tvc", status: "draft" } } = {}) {
  const sessions = new Map();
  const audits = [];
  const queries = [];
  return {
    sessions,
    audits,
    queries,
    prepare(sql) {
      return {
        bind(...params) {
          queries.push({ sql, params });
          return {
            async first() {
              if (sql.startsWith("SELECT id, section, status FROM works")) {
                return work?.section === "tvc" && work.status === "draft" ? { ...work } : null;
              }
              if (sql.startsWith("SELECT upload_id, object_key")) return sessions.get(params[0]) ? { ...sessions.get(params[0]) } : null;
              throw new Error(`Unexpected select: ${sql}`);
            },
            async run() {
              if (sql.startsWith("INSERT INTO upload_sessions")) {
                const [uploadId, objectKey, workId, totalBytes, contentType, actorEmail] = params;
                sessions.set(uploadId, {
                  upload_id: uploadId,
                  object_key: objectKey,
                  section: "tvc",
                  work_id: workId,
                  total_bytes: totalBytes,
                  content_type: contentType,
                  actor_email: actorEmail,
                  status: "active",
                });
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith("UPDATE upload_sessions SET status")) {
                const session = sessions.get(params[1]);
                if (!session) return { meta: { changes: 0 } };
                session.status = params[0];
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith("INSERT INTO audit_log")) {
                audits.push({ workId: params[1], actorEmail: params[2], action: params[3], details: JSON.parse(params[4]) });
                return { meta: { changes: 1 } };
              }
              throw new Error(`Unexpected write: ${sql}`);
            },
          };
        },
      };
    },
  };
}

function mediaBinding() {
  const uploads = new Map();
  const calls = [];
  return {
    calls,
    async createMultipartUpload(key, options) {
      const uploadId = `upload-${uploads.size + 1}`;
      uploads.set(uploadId, { key, options, parts: new Map(), aborted: false });
      calls.push({ method: "create", key, options, uploadId });
      return { key, uploadId };
    },
    resumeMultipartUpload(key, uploadId) {
      const upload = uploads.get(uploadId);
      calls.push({ method: "resume", key, uploadId });
      return {
        async uploadPart(partNumber, body) {
          if (!upload || upload.key !== key || upload.aborted) throw new Error("unknown upload");
          const bytes = new Uint8Array(await new Response(body).arrayBuffer());
          upload.parts.set(partNumber, bytes);
          calls.push({ method: "part", key, uploadId, partNumber, bytes: bytes.byteLength });
          return { partNumber, etag: `etag-${partNumber}` };
        },
        async complete(parts) {
          if (!upload || upload.key !== key || upload.aborted) throw new Error("unknown upload");
          calls.push({ method: "complete", key, uploadId, parts });
          return { key, size: [...upload.parts.values()].reduce((total, bytes) => total + bytes.byteLength, 0), httpMetadata: upload.options.httpMetadata };
        },
        async abort() {
          if (!upload || upload.key !== key || upload.aborted) throw new Error("unknown upload");
          upload.aborted = true;
          calls.push({ method: "abort", key, uploadId });
        },
      };
    },
  };
}

async function createUpload(db, media, body = {}) {
  const response = await createVideoMultipart(jsonRequest({
    fileName: "cut.mp4",
    contentType: "video/mp4",
    totalBytes: 1,
    ...body,
  }), { DB: db, MEDIA: media }, "work-1", identity);
  assert.equal(response.status, 201);
  return (await response.json()).data;
}

test("creates a multipart session only for an active TVC draft under a server-generated video key", async () => {
  const db = uploadDb();
  const media = mediaBinding();

  const data = await createUpload(db, media);

  assert.match(data.key, /^portfolio\/tvc\/work-1\/video-[0-9a-f-]+\.mp4$/);
  assert.equal(data.partSize, 10 * MiB);
  assert.equal(data.maxConcurrentUploads, 3);
  assert.deepEqual(db.sessions.get(data.uploadId), {
    upload_id: data.uploadId,
    object_key: data.key,
    section: "tvc",
    work_id: "work-1",
    total_bytes: 1,
    content_type: "video/mp4",
    actor_email: "admin@example.com",
    status: "active",
  });
  assert.deepEqual(media.calls[0].options.customMetadata, { section: "tvc", workId: "work-1", kind: "video", totalBytes: "1" });
  assert.deepEqual(db.audits, [{
    workId: "work-1",
    actorEmail: "admin@example.com",
    action: "CREATE_TVC_VIDEO_MULTIPART",
    details: { uploadId: data.uploadId, key: data.key, totalBytes: 1, contentType: "video/mp4" },
  }]);
});

test("rejects a non-draft work, unsupported video type, or video above 2 GiB before creating multipart media", async () => {
  const unavailableDb = uploadDb({ work: { id: "work-1", section: "tvc", status: "published" } });
  const unavailableMedia = mediaBinding();
  const missingDraft = await createVideoMultipart(jsonRequest({ fileName: "cut.mp4", contentType: "video/mp4", totalBytes: 1 }), { DB: unavailableDb, MEDIA: unavailableMedia }, "work-1", identity);

  const db = uploadDb();
  const media = mediaBinding();
  const invalidType = await createVideoMultipart(jsonRequest({ fileName: "cut.mov", contentType: "video/quicktime", totalBytes: 1 }), { DB: db, MEDIA: media }, "work-1", identity);
  const tooLarge = await createVideoMultipart(jsonRequest({ fileName: "cut.mp4", contentType: "video/mp4", totalBytes: 2 * 1024 * MiB + 1 }), { DB: db, MEDIA: media }, "work-1", identity);

  assert.equal(missingDraft.status, 404);
  assert.equal(invalidType.status, 422);
  assert.equal(tooLarge.status, 413);
  assert.equal(unavailableMedia.calls.length, 0);
  assert.equal(media.calls.length, 0);
});

test("derives the part object key from its D1 session and not a browser header", async () => {
  const db = uploadDb();
  const media = mediaBinding();
  const session = await createUpload(db, media);

  const response = await uploadVideoPart(partRequest(new Uint8Array([1])), { DB: db, MEDIA: media }, "work-1", session.uploadId, "1", identity);

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, { partNumber: 1, etag: "etag-1" });
  assert.deepEqual(media.calls.at(-1), { method: "part", key: session.key, uploadId: session.uploadId, partNumber: 1, bytes: 1 });
});

test("rejects multipart status and parts for a different actor or URL work", async () => {
  const db = uploadDb();
  const media = mediaBinding();
  const session = await createUpload(db, media);
  const other = { email: "other@example.com", sub: "user-456" };

  const actorResponse = await getVideoMultipart(new Request("https://dashboard.example.test"), { DB: db, MEDIA: media }, "work-1", session.uploadId, other);
  const workResponse = await uploadVideoPart(partRequest(new Uint8Array([1])), { DB: db, MEDIA: media }, "work-2", session.uploadId, "1", identity);

  assert.equal(actorResponse.status, 403);
  assert.equal(workResponse.status, 404);
  assert.equal(media.calls.filter((call) => call.method === "part").length, 0);
});

test("stops a multipart session when its TVC draft is no longer active", async () => {
  const work = { id: "work-1", section: "tvc", status: "draft" };
  const db = uploadDb({ work });
  const media = mediaBinding();
  const session = await createUpload(db, media);
  work.status = "published";

  const response = await getVideoMultipart(new Request("https://dashboard.example.test"), { DB: db, MEDIA: media }, "work-1", session.uploadId, identity);

  assert.equal(response.status, 404);
  assert.equal(media.calls.filter((call) => call.method === "resume").length, 0);
});

test("completes only continuous parts, marks the session complete, and writes its audit record", async () => {
  const db = uploadDb();
  const media = mediaBinding();
  const session = await createUpload(db, media, { totalBytes: 10 * MiB + 1 });
  await uploadVideoPart(partRequest(new Uint8Array(10 * MiB)), { DB: db, MEDIA: media }, "work-1", session.uploadId, "1", identity);
  await uploadVideoPart(partRequest(new Uint8Array([2])), { DB: db, MEDIA: media }, "work-1", session.uploadId, "2", identity);

  const missing = await completeVideoMultipart(jsonRequest({ parts: [{ partNumber: 2, etag: "etag-2" }] }), { DB: db, MEDIA: media }, "work-1", session.uploadId, identity);
  const response = await completeVideoMultipart(jsonRequest({ parts: [{ partNumber: 1, etag: "etag-1" }, { partNumber: 2, etag: "etag-2" }] }), { DB: db, MEDIA: media }, "work-1", session.uploadId, identity);

  assert.equal(missing.status, 422);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.key, session.key);
  assert.equal(db.sessions.get(session.uploadId).status, "completed");
  assert.deepEqual(db.audits, [
    {
      workId: "work-1",
      actorEmail: "admin@example.com",
      action: "CREATE_TVC_VIDEO_MULTIPART",
      details: { uploadId: session.uploadId, key: session.key, totalBytes: 10 * MiB + 1, contentType: "video/mp4" },
    },
    {
      workId: "work-1",
      actorEmail: "admin@example.com",
      action: "COMPLETE_TVC_VIDEO_MULTIPART",
      details: { uploadId: session.uploadId, key: session.key, parts: 2 },
    },
  ]);
  assert.equal(media.calls.filter((call) => call.method === "complete").length, 1);
});

test("rejects duplicate or more than 10000 completion parts without changing an active session", async () => {
  const db = uploadDb();
  const media = mediaBinding();
  const session = await createUpload(db, media);
  const duplicate = await completeVideoMultipart(jsonRequest({ parts: [{ partNumber: 1, etag: "one" }, { partNumber: 1, etag: "again" }] }), { DB: db, MEDIA: media }, "work-1", session.uploadId, identity);
  const excessive = await completeVideoMultipart(jsonRequest({ parts: Array.from({ length: 10_001 }, (_value, index) => ({ partNumber: index + 1, etag: `etag-${index + 1}` })) }), { DB: db, MEDIA: media }, "work-1", session.uploadId, identity);

  assert.equal(duplicate.status, 422);
  assert.equal(excessive.status, 422);
  assert.equal(db.sessions.get(session.uploadId).status, "active");
  assert.equal(media.calls.filter((call) => call.method === "complete").length, 0);
});

test("aborts an active session and makes further parts unavailable", async () => {
  const db = uploadDb();
  const media = mediaBinding();
  const session = await createUpload(db, media);

  const aborted = await abortVideoMultipart(new Request("https://dashboard.example.test", { method: "DELETE" }), { DB: db, MEDIA: media }, "work-1", session.uploadId, identity);
  const laterPart = await uploadVideoPart(partRequest(new Uint8Array([1])), { DB: db, MEDIA: media }, "work-1", session.uploadId, "1", identity);

  assert.equal(aborted.status, 204);
  assert.equal(db.sessions.get(session.uploadId).status, "aborted");
  assert.equal(laterPart.status, 409);
  assert.equal(media.calls.filter((call) => call.method === "abort").length, 1);
  assert.deepEqual(db.audits, [
    {
      workId: "work-1",
      actorEmail: "admin@example.com",
      action: "CREATE_TVC_VIDEO_MULTIPART",
      details: { uploadId: session.uploadId, key: session.key, totalBytes: 1, contentType: "video/mp4" },
    },
    {
      workId: "work-1",
      actorEmail: "admin@example.com",
      action: "ABORT_TVC_VIDEO_MULTIPART",
      details: { uploadId: session.uploadId, key: session.key },
    },
  ]);
});

test("routes exact work-bound multipart creation through Dashboard Access", async (t) => {
  const access = accessEnv();
  withJwks(t, access.jwks);
  const db = uploadDb();
  const media = mediaBinding();
  const headers = new Headers(access.signedRequest().headers);
  headers.set("content-type", "application/json");

  const created = await worker.fetch(new Request("https://dashboard.example.test/admin/dashboard/api/works/work-1/video/multipart", {
    method: "POST",
    headers,
    body: JSON.stringify({ fileName: "cut.mp4", contentType: "video/mp4", totalBytes: 1 }),
  }), { ...access.env, DB: db, MEDIA: media });
  const unknown = await worker.fetch(new Request("https://dashboard.example.test/admin/dashboard/api/works/work-1/video/multipart/extra", {
    method: "POST",
    headers,
    body: "{}",
  }), { ...access.env, DB: db, MEDIA: media });

  assert.equal(created.status, 201);
  assert.equal(unknown.status, 404);
});
