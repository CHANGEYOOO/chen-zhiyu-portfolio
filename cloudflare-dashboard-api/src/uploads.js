import { json, problem } from "./http.js";

const VIDEO_TYPES = new Map([
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
]);
const PART_SIZE = 10 * 1024 ** 2;
const MAX_VIDEO_BYTES = 2 * 1024 ** 3;
const MAX_PARTS = 10_000;
const MAX_CONCURRENT_UPLOADS = 3;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function validUploadId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\u0000-\u001F\u007F]/.test(value);
}

function extension(name) {
  const match = text(name).toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] || "";
}

function expectedPartSize(totalBytes, partNumber) {
  const totalParts = Math.ceil(totalBytes / PART_SIZE);
  if (partNumber > totalParts) return null;
  return partNumber === totalParts ? totalBytes - PART_SIZE * (totalParts - 1) : PART_SIZE;
}

async function requestBody(request) {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return { response: problem(422, "VALIDATION_FAILED", "Request body must be a JSON object") };
    return { value };
  } catch {
    return { response: problem(400, "INVALID_JSON", "Request body must be valid JSON") };
  }
}

async function activeDraft(env, workId) {
  return env.DB.prepare("SELECT id, section, status FROM works WHERE id = ? AND section = 'tvc' AND status = 'draft'")
    .bind(workId).first();
}

async function audit(env, workId, identity, action, details) {
  await env.DB.prepare("INSERT INTO audit_log (id, work_id, actor_email, action, details_json) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), workId, identity.email, action, JSON.stringify(details)).run();
}

async function loadActiveSession(env, workId, uploadId, identity) {
  if (!validUploadId(uploadId)) return { response: problem(422, "VALIDATION_FAILED", "Invalid multipart upload id") };
  const session = await env.DB.prepare("SELECT upload_id, object_key, section, work_id, total_bytes, content_type, actor_email, status FROM upload_sessions WHERE upload_id = ?")
    .bind(uploadId).first();
  if (!session || session.section !== "tvc" || session.work_id !== workId) return { response: problem(404, "NOT_FOUND", "Multipart upload session not found") };
  if (session.actor_email !== identity.email) return { response: problem(403, "FORBIDDEN", "Multipart upload session belongs to another administrator") };
  if (session.status !== "active") return { response: problem(409, "UPLOAD_NOT_ACTIVE", "Multipart upload is no longer active") };
  if (!await activeDraft(env, workId)) return { response: problem(404, "NOT_FOUND", "TVC draft not found") };
  return { session };
}

async function resumableSession(env, workId, uploadId, identity) {
  const loaded = await loadActiveSession(env, workId, uploadId, identity);
  if (loaded.response) return loaded;
  return { ...loaded, upload: env.MEDIA.resumeMultipartUpload(loaded.session.object_key, uploadId) };
}

async function multipartOperation(operation) {
  try {
    return { value: await operation() };
  } catch {
    return { response: problem(409, "MULTIPART_UPLOAD_UNAVAILABLE", "Multipart upload is unavailable or has expired") };
  }
}

function validCompletedParts(value, totalBytes) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_PARTS) return null;
  const parts = value.map((part) => ({ partNumber: positiveInteger(part?.partNumber), etag: text(part?.etag) }));
  if (parts.some((part) => !part.partNumber || part.partNumber > MAX_PARTS || !part.etag)) return null;
  if (parts.some((part, index) => part.partNumber !== index + 1)) return null;
  return parts.length === Math.ceil(totalBytes / PART_SIZE) ? parts : null;
}

export async function createVideoMultipart(request, env, workId, identity) {
  const parsed = await requestBody(request);
  if (parsed.response) return parsed.response;
  const contentType = text(parsed.value.contentType).toLowerCase();
  const expectedExtension = VIDEO_TYPES.get(contentType);
  const totalBytes = positiveInteger(parsed.value.totalBytes);
  if (!expectedExtension || extension(parsed.value.fileName) !== expectedExtension || !totalBytes) {
    return problem(422, "VALIDATION_FAILED", "A valid MP4 or WebM filename, MIME type, and totalBytes are required");
  }
  if (totalBytes > MAX_VIDEO_BYTES) return problem(413, "FILE_TOO_LARGE", "Videos must not exceed 2 GiB");
  const work = await activeDraft(env, workId);
  if (!work) return problem(404, "NOT_FOUND", "TVC draft not found");

  const key = `portfolio/tvc/${workId}/video-${crypto.randomUUID()}${expectedExtension}`;
  const upload = await env.MEDIA.createMultipartUpload(key, {
    httpMetadata: { contentType },
    customMetadata: { section: "tvc", workId, kind: "video", totalBytes: String(totalBytes) },
  });
  try {
    await env.DB.prepare("INSERT INTO upload_sessions (upload_id, object_key, section, work_id, total_bytes, content_type, actor_email) VALUES (?, ?, 'tvc', ?, ?, ?, ?)")
      .bind(upload.uploadId, key, workId, totalBytes, contentType, identity.email).run();
  } catch (error) {
    await upload.abort?.();
    throw error;
  }
  await audit(env, workId, identity, "CREATE_TVC_VIDEO_MULTIPART", { uploadId: upload.uploadId, key, totalBytes, contentType });
  return json({ data: { uploadId: upload.uploadId, key, totalBytes, contentType, partSize: PART_SIZE, maxConcurrentUploads: MAX_CONCURRENT_UPLOADS } }, { status: 201 });
}

export async function getVideoMultipart(_request, env, workId, uploadId, identity) {
  const loaded = await loadActiveSession(env, workId, uploadId, identity);
  if (loaded.response) return loaded.response;
  const { session } = loaded;
  return json({ data: {
    uploadId: session.upload_id,
    key: session.object_key,
    totalBytes: session.total_bytes,
    contentType: session.content_type,
    partSize: PART_SIZE,
    maxConcurrentUploads: MAX_CONCURRENT_UPLOADS,
  } });
}

export async function uploadVideoPart(request, env, workId, uploadId, partNumber, identity) {
  const part = positiveInteger(partNumber);
  if (!part || part > MAX_PARTS) return problem(422, "INVALID_PART_NUMBER", "partNumber must be between 1 and 10000");
  const resumable = await resumableSession(env, workId, uploadId, identity);
  if (resumable.response) return resumable.response;
  const bytes = new Uint8Array(await request.arrayBuffer());
  const expectedSize = expectedPartSize(resumable.session.total_bytes, part);
  if (!bytes.byteLength) return problem(422, "VALIDATION_FAILED", "Multipart part body is required");
  if (bytes.byteLength > PART_SIZE) return problem(413, "PART_TOO_LARGE", "Multipart parts must not exceed 10 MiB");
  if (bytes.byteLength !== expectedSize) return problem(422, "INVALID_PART_SIZE", "Multipart part size does not match the declared upload size");
  const uploaded = await multipartOperation(() => resumable.upload.uploadPart(part, bytes));
  if (uploaded.response) return uploaded.response;
  return json({ data: { partNumber: uploaded.value.partNumber, etag: uploaded.value.etag } });
}

export async function completeVideoMultipart(request, env, workId, uploadId, identity) {
  const resumable = await resumableSession(env, workId, uploadId, identity);
  if (resumable.response) return resumable.response;
  const parsed = await requestBody(request);
  if (parsed.response) return parsed.response;
  const parts = validCompletedParts(parsed.value.parts, resumable.session.total_bytes);
  if (!parts) return problem(422, "MISSING_PARTS", "parts must be complete, unique, and numbered consecutively from 1");
  const completed = await multipartOperation(() => resumable.upload.complete(parts));
  if (completed.response) return completed.response;
  if (completed.value.size !== resumable.session.total_bytes) return problem(409, "MULTIPART_SIZE_MISMATCH", "Completed upload size does not match its declared total");
  await env.DB.prepare("UPDATE upload_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE upload_id = ?")
    .bind("completed", uploadId).run();
  await audit(env, workId, identity, "COMPLETE_TVC_VIDEO_MULTIPART", { uploadId, key: resumable.session.object_key, parts: parts.length });
  return json({ data: { key: resumable.session.object_key, size: completed.value.size, contentType: resumable.session.content_type } });
}

export async function abortVideoMultipart(_request, env, workId, uploadId, identity) {
  const resumable = await resumableSession(env, workId, uploadId, identity);
  if (resumable.response) return resumable.response;
  const aborted = await multipartOperation(() => resumable.upload.abort());
  if (aborted.response) return aborted.response;
  await env.DB.prepare("UPDATE upload_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE upload_id = ?")
    .bind("aborted", uploadId).run();
  await audit(env, workId, identity, "ABORT_TVC_VIDEO_MULTIPART", { uploadId, key: resumable.session.object_key });
  return new Response(null, { status: 204 });
}
