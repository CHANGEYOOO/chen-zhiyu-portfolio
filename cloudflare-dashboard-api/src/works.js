import { json, problem } from "./http.js";

function draftFields(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = {};
  for (const [input, column] of [["brandName", "brand_name"], ["workTitle", "work_title"], ["workType", "work_type"]]) {
    if (typeof value[input] !== "string" || !value[input].trim()) return null;
    fields[column] = value[input].trim();
  }
  return fields;
}

async function requestBody(request) {
  try {
    const value = await request.json();
    return { value };
  } catch {
    return { response: problem(400, "INVALID_JSON", "Request body must be valid JSON") };
  }
}

function data(work) {
  return {
    id: work.id,
    section: work.section,
    status: work.status,
    version: work.version,
    brandName: work.brand_name,
    workTitle: work.work_title,
    workType: work.work_type,
  };
}

async function audit(env, workId, identity, action, details) {
  await env.DB.prepare("INSERT INTO audit_log (id, work_id, actor_email, action, details_json) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), workId, identity.email, action, JSON.stringify(details)).run();
}

function validVersion(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export async function createTvcDraft(request, env, identity) {
  const parsed = await requestBody(request);
  if (parsed.response) return parsed.response;
  const fields = draftFields(parsed.value);
  if (!fields) return problem(422, "VALIDATION_FAILED", "brandName, workTitle, and workType are required text fields");

  const work = {
    id: crypto.randomUUID(),
    section: "tvc",
    status: "draft",
    version: 1,
    ...fields,
  };
  await env.DB.prepare("INSERT INTO works (id, section, brand_name, work_title, work_type, status) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(work.id, work.section, work.brand_name, work.work_title, work.work_type, work.status).run();
  await audit(env, work.id, identity, "CREATE_TVC_DRAFT", fields);
  return json({ data: data(work) }, { status: 201 });
}

export async function getTvcDraft(_request, env, workId, _identity) {
  const work = await env.DB.prepare("SELECT id, section, status, version, brand_name, work_title, work_type FROM works WHERE id = ? AND section = 'tvc' AND status = 'draft'")
    .bind(workId).first();
  if (!work) return problem(404, "NOT_FOUND", "TVC draft not found");
  return json({ data: data(work) });
}

export async function updateTvcDraft(request, env, workId, identity) {
  const parsed = await requestBody(request);
  if (parsed.response) return parsed.response;
  const fields = draftFields(parsed.value);
  if (!fields) return problem(422, "VALIDATION_FAILED", "brandName, workTitle, and workType are required text fields");
  if (!validVersion(parsed.value.version)) return problem(422, "VALIDATION_FAILED", "version must be a positive integer");

  const result = await env.DB.prepare("UPDATE works SET brand_name = ?, work_title = ?, work_type = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND section = 'tvc' AND status = 'draft' AND version = ?")
    .bind(fields.brand_name, fields.work_title, fields.work_type, workId, parsed.value.version).run();
  if (!result.meta?.changes) return problem(409, "VERSION_CONFLICT", "This work has changed; refresh and try again");

  await audit(env, workId, identity, "UPDATE_TVC_DRAFT", { ...fields, version: parsed.value.version });
  return json({ data: data({ id: workId, section: "tvc", status: "draft", version: parsed.value.version + 1, ...fields }) });
}
