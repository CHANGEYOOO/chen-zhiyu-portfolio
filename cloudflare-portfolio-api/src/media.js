import { json, problem } from "./http.js";
import { validateObjectKey } from "./validation.js";

function id() {
  return crypto.randomUUID();
}

async function body(request) {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return { response: problem(422, "VALIDATION_FAILED", "Request body must be a JSON object") };
    return { value };
  } catch {
    return { response: problem(400, "INVALID_JSON", "Request body must be valid JSON") };
  }
}

function version(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function mediaKey(value, section, workId) {
  return typeof value === "string" && validateObjectKey(value, section, workId) ? value : null;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function exists(media, key) {
  try { return Boolean(await media.head(key)); } catch { return false; }
}

async function audit(env, workId, actor, details) {
  await env.DB.prepare("INSERT INTO audit_log (id, work_id, actor_email, action, details_json) VALUES (?, ?, ?, ?, ?)")
    .bind(id(), workId, actor.email, "ATTACH_MEDIA", JSON.stringify(details)).run();
}

export async function attachMedia(request, env, workId, actor) {
  const parsed = await body(request);
  if (parsed.response) return parsed.response;
  const expectedVersion = version(parsed.value.version);
  if (!expectedVersion) return problem(422, "VALIDATION_FAILED", "version must be a positive integer");
  const work = await env.DB.prepare("SELECT id, section, status, version, poster_key, poster_mobile_key, video_key FROM works WHERE id = ?").bind(workId).first();
  if (!work) return problem(404, "NOT_FOUND", "Work not found");
  if (work.status !== "draft") return problem(409, "MEDIA_REQUIRES_DRAFT", "Media can only be attached while a work is a draft");

  const supplied = ["poster_key", "poster_mobile_key", "video_key", "work_images"].filter((field) => Object.hasOwn(parsed.value, field));
  if (!supplied.length) return problem(422, "INVALID_MEDIA", "At least one media field is required");
  if (work.section === "livestream" && ["poster_key", "poster_mobile_key", "video_key"].some((field) => Object.hasOwn(parsed.value, field))) return problem(422, "INVALID_MEDIA", "Livestream works only accept project images");
  if (work.section === "tvc" && Object.hasOwn(parsed.value, "work_images")) return problem(422, "INVALID_MEDIA", "TVC works do not accept project images");

  const fields = {};
  for (const field of ["poster_key", "poster_mobile_key", "video_key"]) {
    if (!Object.hasOwn(parsed.value, field)) {
      fields[field] = work[field] || null;
      continue;
    }
    const key = mediaKey(parsed.value[field], work.section, workId);
    if (!key || !await exists(env.MEDIA, key)) return problem(422, "INVALID_MEDIA", `${field} must reference a completed upload for this work`);
    fields[field] = key;
  }

  let images = null;
  if (Object.hasOwn(parsed.value, "work_images")) {
    if (!Array.isArray(parsed.value.work_images)) return problem(422, "INVALID_MEDIA", "work_images must be an array");
    images = [];
    for (const image of parsed.value.work_images) {
      const imageKey = mediaKey(image?.image_key, work.section, workId);
      const width = positiveInteger(image?.width);
      const height = positiveInteger(image?.height);
      if (!imageKey || !width || !height || !await exists(env.MEDIA, imageKey)) return problem(422, "INVALID_MEDIA", "Every image must reference a completed upload with dimensions");
      images.push({ image_key: imageKey, width, height });
    }
  }

  const update = await env.DB.prepare("UPDATE works SET poster_key = ?, poster_mobile_key = ?, video_key = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ?")
    .bind(fields.poster_key, fields.poster_mobile_key, fields.video_key, workId, expectedVersion).run();
  if (!update.meta?.changes) return problem(409, "VERSION_CONFLICT", "This work has changed; refresh and try again");

  if (images) {
    const statements = [env.DB.prepare("DELETE FROM work_images WHERE work_id = ?").bind(workId)];
    images.forEach((image, sortOrder) => statements.push(env.DB.prepare("INSERT INTO work_images (id, work_id, image_key, sort_order, width, height) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id(), workId, image.image_key, sortOrder, image.width, image.height)));
    await env.DB.batch(statements);
  }
  const result = { id: workId, section: work.section, status: work.status, version: expectedVersion + 1, ...fields };
  await audit(env, workId, actor, { ...result, work_images: images?.length ?? undefined });
  return json({ data: result });
}
