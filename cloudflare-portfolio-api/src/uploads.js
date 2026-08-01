import { json, problem } from "./http.js";
import { validateObjectKey } from "./validation.js";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const SECTIONS = new Set(["tvc", "livestream"]);
const MiB = 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * MiB;
const MAX_VIDEO_BYTES = 2 * 1024 * MiB;
const PART_SIZE = 10 * MiB;
const MAX_PART_NUMBER = 10_000;
const MAX_CONCURRENT_UPLOADS = 3;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function nonNegativeInteger(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function positiveInteger(value) {
  const number = nonNegativeInteger(value);
  return number && number > 0 ? number : null;
}

function contentLength(request) {
  const header = request.headers.get("content-length");
  return header === null ? null : nonNegativeInteger(header);
}

function safeSegment(value) {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
}

function safeFileName(value) {
  const name = text(value);
  if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\")) return null;
  const normalized = name.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  const cleaned = normalized.replace(/^[.-]+|[.-]+$/g, "");
  return cleaned && cleaned.length <= 180 ? cleaned : null;
}

function workLocation(section, workId, fileName) {
  if (!SECTIONS.has(section) || !safeSegment(workId) || !safeFileName(fileName)) return null;
  const key = `portfolio/${section}/${workId}/${crypto.randomUUID()}-${safeFileName(fileName)}`;
  return validateObjectKey(key, section, workId) ? { key, fileName: safeFileName(fileName) } : null;
}

function publicUrl(env, key) {
  const origin = text(env.MEDIA_PUBLIC_URL) || "https://media.kjoe.top";
  return `${origin.replace(/\/+$/, "")}/${key}`;
}

function metadata(contentType, location, extra = {}) {
  return {
    httpMetadata: { contentType },
    customMetadata: {
      section: location.section,
      workId: location.workId,
      fileName: location.fileName,
      ...extra,
    },
  };
}

async function jsonBody(request) {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return { response: problem(422, "VALIDATION_FAILED", "Request body must be a JSON object") };
    return { value };
  } catch {
    return { response: problem(400, "INVALID_JSON", "Request body must be valid JSON") };
  }
}

function requestLocation(request) {
  const section = text(request.headers.get("x-section"));
  const workId = text(request.headers.get("x-work-id"));
  const fileName = request.headers.get("x-file-name");
  const created = workLocation(section, workId, fileName);
  return created ? { ...created, section, workId } : null;
}

function requestMultipartKey(request) {
  const key = text(request.headers.get("x-upload-key"));
  const match = key.match(/^portfolio\/(tvc|livestream)\/([^/]+)\/([^/]+)$/);
  if (!match || !validateObjectKey(key, match[1], match[2])) return null;
  return key;
}

function validUploadId(uploadId) {
  return typeof uploadId === "string" && /^[a-zA-Z0-9_-]{1,512}$/.test(uploadId);
}

function completedMedia(object, env, key, fallbackContentType) {
  const contentType = object?.httpMetadata?.contentType || fallbackContentType;
  return {
    key,
    publicUrl: publicUrl(env, key),
    size: object?.size,
    contentType,
  };
}

export async function uploadImage(request, env) {
  const contentType = text(request.headers.get("content-type")).toLowerCase();
  if (!IMAGE_TYPES.has(contentType)) return problem(422, "UNSUPPORTED_MEDIA_TYPE", "Images must be JPEG, PNG, or WebP");
  const location = requestLocation(request);
  const width = positiveInteger(request.headers.get("x-width"));
  const height = positiveInteger(request.headers.get("x-height"));
  if (!location || !width || !height) return problem(422, "VALIDATION_FAILED", "section, work id, safe file name, width, and height are required");
  const declaredLength = contentLength(request);
  if (declaredLength === null && request.headers.has("content-length")) return problem(422, "VALIDATION_FAILED", "content-length must be a non-negative integer");
  if (declaredLength !== null && declaredLength > MAX_IMAGE_BYTES) return problem(413, "FILE_TOO_LARGE", "Images must not exceed 20 MiB");

  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return problem(422, "VALIDATION_FAILED", "Image body is required");
  if (bytes.byteLength > MAX_IMAGE_BYTES) return problem(413, "FILE_TOO_LARGE", "Images must not exceed 20 MiB");
  await env.MEDIA.put(location.key, bytes, metadata(contentType, location, { width: String(width), height: String(height) }));
  return json({ data: completedMedia({ size: bytes.byteLength, httpMetadata: { contentType } }, env, location.key, contentType) }, { status: 201 });
}

export async function createMultipartUpload(request, env, actor) {
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  const section = text(parsed.value.section);
  const workId = text(parsed.value.workId);
  const location = workLocation(section, workId, parsed.value.fileName);
  const contentType = text(parsed.value.contentType).toLowerCase();
  const totalBytes = positiveInteger(parsed.value.totalBytes);
  if (!location || !VIDEO_TYPES.has(contentType) || !totalBytes) return problem(422, "VALIDATION_FAILED", "A valid section, workId, fileName, video contentType, and totalBytes are required");
  if (totalBytes > MAX_VIDEO_BYTES) return problem(413, "FILE_TOO_LARGE", "Videos must not exceed 2 GiB");

  const upload = await env.MEDIA.createMultipartUpload(location.key, metadata(contentType, { ...location, section, workId }, { totalBytes: String(totalBytes) }));
  try {
    await env.DB.prepare("INSERT INTO upload_sessions (upload_id, object_key, section, work_id, total_bytes, content_type, actor_email) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(upload.uploadId, location.key, section, workId, totalBytes, contentType, actor.email).run();
  } catch (error) {
    await upload.abort();
    throw error;
  }
  return json({ data: { uploadId: upload.uploadId, key: location.key, partSize: PART_SIZE, maxConcurrentUploads: MAX_CONCURRENT_UPLOADS } }, { status: 201 });
}

async function resumableUpload(request, env, uploadId, actor) {
  const key = requestMultipartKey(request);
  if (!key) return { response: problem(422, "INVALID_OBJECT_KEY", "x-upload-key must be a portfolio object key") };
  if (!validUploadId(uploadId)) return { response: problem(422, "VALIDATION_FAILED", "Invalid multipart upload id") };
  const session = await env.DB.prepare("SELECT upload_id, object_key, total_bytes, content_type, actor_email, status FROM upload_sessions WHERE upload_id = ?")
    .bind(uploadId).first();
  if (!session || session.object_key !== key || session.actor_email !== actor.email) return { response: problem(422, "INVALID_OBJECT_KEY", "x-upload-key does not belong to this multipart upload") };
  if (session.status !== "active") return { response: problem(409, "UPLOAD_NOT_ACTIVE", "Multipart upload is no longer active") };
  return { key, session, upload: env.MEDIA.resumeMultipartUpload(key, uploadId) };
}

function expectedPartSize(totalBytes, partNumber) {
  const expectedParts = Math.ceil(totalBytes / PART_SIZE);
  if (partNumber > expectedParts) return null;
  return partNumber < expectedParts ? PART_SIZE : totalBytes - PART_SIZE * (expectedParts - 1);
}

async function multipartFailure(operation) {
  try {
    return { value: await operation() };
  } catch {
    return { response: problem(409, "MULTIPART_UPLOAD_UNAVAILABLE", "Multipart upload is unavailable or has expired") };
  }
}

export async function uploadMultipartPart(request, env, uploadId, partNumber, actor) {
  const part = positiveInteger(partNumber);
  if (!part || part > MAX_PART_NUMBER) return problem(422, "INVALID_PART_NUMBER", "partNumber must be between 1 and 10000");
  const resumable = await resumableUpload(request, env, uploadId, actor);
  if (resumable.response) return resumable.response;
  const declaredLength = contentLength(request);
  if (declaredLength === null && request.headers.has("content-length")) return problem(422, "VALIDATION_FAILED", "content-length must be a non-negative integer");
  if (declaredLength !== null && declaredLength > PART_SIZE) return problem(413, "PART_TOO_LARGE", "Multipart parts must not exceed 10 MiB");
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return problem(422, "VALIDATION_FAILED", "Multipart part body is required");
  if (bytes.byteLength > PART_SIZE) return problem(413, "PART_TOO_LARGE", "Multipart parts must not exceed 10 MiB");
  if (bytes.byteLength !== expectedPartSize(resumable.session.total_bytes, part)) return problem(422, "INVALID_PART_SIZE", "Multipart part size does not match the declared upload size");
  const uploaded = await multipartFailure(() => resumable.upload.uploadPart(part, bytes));
  if (uploaded.response) return uploaded.response;
  const result = uploaded.value;
  return json({ data: { partNumber: result.partNumber, etag: result.etag } });
}

export async function getMultipartUpload(request, env, uploadId, actor) {
  const resumable = await resumableUpload(request, env, uploadId, actor);
  if (resumable.response) return resumable.response;
  return json({ data: { uploadId, key: resumable.key, totalBytes: resumable.session.total_bytes, partSize: PART_SIZE, maxConcurrentUploads: MAX_CONCURRENT_UPLOADS } });
}

function validCompletedParts(value) {
  if (!Array.isArray(value) || !value.length) return null;
  const parts = value.map((part) => ({ partNumber: positiveInteger(part?.partNumber), etag: text(part?.etag) }));
  if (parts.some((part) => !part.partNumber || !part.etag)) return null;
  if (parts.some((part, index) => part.partNumber !== index + 1)) return null;
  return parts;
}

function videoContentTypeForKey(key) {
  return key.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4";
}

export async function completeMultipartUpload(request, env, uploadId, actor) {
  const resumable = await resumableUpload(request, env, uploadId, actor);
  if (resumable.response) return resumable.response;
  const parsed = await jsonBody(request);
  if (parsed.response) return parsed.response;
  const parts = validCompletedParts(parsed.value.parts);
  if (!parts || parts.length !== Math.ceil(resumable.session.total_bytes / PART_SIZE)) return problem(422, "MISSING_PARTS", "parts must be sorted, complete, and numbered consecutively from 1");
  const completed = await multipartFailure(() => resumable.upload.complete(parts));
  if (completed.response) return completed.response;
  const object = completed.value;
  if (object.size !== resumable.session.total_bytes) return problem(409, "MULTIPART_SIZE_MISMATCH", "Completed upload size does not match its declared total");
  await env.DB.prepare("UPDATE upload_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE upload_id = ?").bind("completed", uploadId).run();
  const contentType = resumable.session.content_type || videoContentTypeForKey(resumable.key);
  return json({ data: completedMedia(object, env, resumable.key, contentType) });
}

export async function abortMultipartUpload(request, env, uploadId, actor) {
  const resumable = await resumableUpload(request, env, uploadId, actor);
  if (resumable.response) return resumable.response;
  const aborted = await multipartFailure(() => resumable.upload.abort());
  if (aborted.response) return aborted.response;
  await env.DB.prepare("UPDATE upload_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE upload_id = ?").bind("aborted", uploadId).run();
  return new Response(null, { status: 204 });
}
