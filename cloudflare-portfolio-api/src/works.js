import { json, problem } from "./http.js";
import { invalidatePublicWorksCache } from "./public.js";
import { validateWork } from "./validation.js";

function id() {
  return crypto.randomUUID();
}

async function body(request) {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { response: problem(422, "VALIDATION_FAILED", "Request body must be a JSON object") };
    }
    return { value };
  } catch {
    return { response: problem(400, "INVALID_JSON", "Request body must be valid JSON") };
  }
}

function version(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function audit(env, workId, actor, action, details) {
  await env.DB.prepare("INSERT INTO audit_log (id, work_id, actor_email, action, details_json) VALUES (?, ?, ?, ?, ?)")
    .bind(id(), workId, actor.email, action, JSON.stringify(details)).run();
}

function validationProblem(result) {
  return problem(422, "VALIDATION_FAILED", result.errors.join("; "));
}

export async function listWorks(_request, env) {
  const works = await env.DB.prepare("SELECT * FROM works ORDER BY section, sort_order, created_at").bind().all();
  const images = await env.DB.prepare("SELECT * FROM work_images ORDER BY work_id, sort_order, created_at").bind().all();
  const groupedImages = new Map();
  for (const image of images.results) {
    const list = groupedImages.get(image.work_id) || [];
    list.push(image);
    groupedImages.set(image.work_id, list);
  }
  return json({ data: works.results.map((work) => ({ ...work, work_images: groupedImages.get(work.id) || [] })) });
}

export async function getWork(_request, env, workId) {
  const work = await env.DB.prepare("SELECT * FROM works WHERE id = ?").bind(workId).first();
  if (!work) return problem(404, "NOT_FOUND", "Work not found");
  const images = await env.DB.prepare("SELECT * FROM work_images WHERE work_id = ? ORDER BY sort_order, created_at").bind(workId).all();
  return json({ data: { ...work, work_images: images.results } });
}

export async function createWork(request, env, actor) {
  const parsed = await body(request);
  if (parsed.response) return parsed.response;
  const validated = validateWork(parsed.value);
  if (!validated.ok) return validationProblem(validated);
  const workId = id();
  const value = validated.value;
  await env.DB.prepare("INSERT INTO works (id, section, brand_name, work_title, work_type, status, sort_order, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'published' THEN CURRENT_TIMESTAMP ELSE NULL END)")
    .bind(workId, value.section, value.brand_name, value.work_title, value.work_type, value.status, Number.isSafeInteger(parsed.value.sort_order) ? parsed.value.sort_order : 0, value.status).run();
  await invalidatePublicWorksCache(request);
  await audit(env, workId, actor, "CREATE_WORK", value);
  return getWork(request, env, workId);
}

export async function updateWork(request, env, workId, actor) {
  const parsed = await body(request);
  if (parsed.response) return parsed.response;
  const validated = validateWork(parsed.value);
  if (!validated.ok) return validationProblem(validated);
  const expectedVersion = version(parsed.value.version);
  if (!expectedVersion) return problem(422, "VALIDATION_FAILED", "version must be a positive integer");
  const value = validated.value;
  const result = await env.DB.prepare("UPDATE works SET section = ?, brand_name = ?, work_title = ?, work_type = ?, status = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP, published_at = CASE WHEN ? = 'published' AND published_at IS NULL THEN CURRENT_TIMESTAMP WHEN ? <> 'published' THEN NULL ELSE published_at END WHERE id = ? AND version = ?")
    .bind(value.section, value.brand_name, value.work_title, value.work_type, value.status, value.status, value.status, workId, expectedVersion).run();
  if (!result.meta?.changes) return problem(409, "VERSION_CONFLICT", "This work has changed; refresh and try again");
  await invalidatePublicWorksCache(request);
  await audit(env, workId, actor, "UPDATE_WORK", { ...value, version: expectedVersion });
  return getWork(request, env, workId);
}

export async function archiveWork(request, env, workId, actor) {
  const parsed = await body(request);
  if (parsed.response) return parsed.response;
  const expectedVersion = version(parsed.value.version);
  if (!expectedVersion) return problem(422, "VALIDATION_FAILED", "version must be a positive integer");
  const result = await env.DB.prepare("UPDATE works SET status = 'archived', version = version + 1, updated_at = CURRENT_TIMESTAMP, published_at = NULL WHERE id = ? AND version = ?")
    .bind(workId, expectedVersion).run();
  if (!result.meta?.changes) return problem(409, "VERSION_CONFLICT", "This work has changed; refresh and try again");
  await invalidatePublicWorksCache(request);
  await audit(env, workId, actor, "ARCHIVE_WORK", { version: expectedVersion });
  return getWork(request, env, workId);
}

function orderIds(value) {
  return Array.isArray(value) && value.length && value.every((item) => typeof item === "string" && item) && new Set(value).size === value.length ? value : null;
}

async function validateWorkOrder(env, section, ids) {
  const placeholders = ids.map(() => "?").join(", ");
  const found = await env.DB.prepare(`SELECT id, section FROM works WHERE id IN (${placeholders})`).bind(...ids).all();
  return found.results.length === ids.length && found.results.every((work) => work.section === section);
}

export async function saveWorkOrder(request, env, actor) {
  const parsed = await body(request);
  if (parsed.response) return parsed.response;
  const { section } = parsed.value;
  const ids = orderIds(parsed.value.ids);
  if (!new Set(["tvc", "livestream"]).has(section) || !ids) return problem(422, "INVALID_ORDER", "section and unique work ids are required");
  if (!await validateWorkOrder(env, section, ids)) return problem(422, "INVALID_ORDER", "Every work must belong to the selected section");
  const statements = ids.map((workId, sortOrder) => env.DB.prepare("UPDATE works SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(sortOrder, workId));
  statements.push(env.DB.prepare("INSERT INTO audit_log (id, actor_email, action, details_json) VALUES (?, ?, ?, ?)").bind(id(), actor.email, "ORDER_WORKS", JSON.stringify({ section, ids })));
  await env.DB.batch(statements);
  await invalidatePublicWorksCache(request);
  return json({ data: { section, ids } });
}

export async function saveImageOrder(request, env, workId, actor) {
  const parsed = await body(request);
  if (parsed.response) return parsed.response;
  const ids = orderIds(parsed.value.ids);
  if (!ids) return problem(422, "INVALID_ORDER", "Unique image ids are required");
  const placeholders = ids.map(() => "?").join(", ");
  const existing = await env.DB.prepare("SELECT id FROM work_images WHERE work_id = ?").bind(workId).all();
  const existingIds = new Set(existing.results.map((image) => image.id));
  if (existingIds.size !== ids.length || !ids.every((imageId) => existingIds.has(imageId))) return problem(422, "INVALID_ORDER", "Submitted ids must include every image for the selected work");
  const temporaryOrder = env.DB.prepare(`UPDATE work_images SET sort_order = sort_order + (SELECT COALESCE(MAX(sort_order), 0) - COALESCE(MIN(sort_order), 0) + 1 FROM work_images WHERE work_id = ?) WHERE work_id = ? AND id IN (${placeholders})`)
    .bind(workId, workId, ...ids);
  const statements = [temporaryOrder, ...ids.map((imageId, sortOrder) => env.DB.prepare("UPDATE work_images SET sort_order = ? WHERE id = ? AND work_id = ?").bind(sortOrder, imageId, workId))];
  statements.push(env.DB.prepare("INSERT INTO audit_log (id, work_id, actor_email, action, details_json) VALUES (?, ?, ?, ?, ?)").bind(id(), workId, actor.email, "ORDER_IMAGES", JSON.stringify({ ids })));
  await env.DB.batch(statements);
  await invalidatePublicWorksCache(request);
  return json({ data: { work_id: workId, ids } });
}
