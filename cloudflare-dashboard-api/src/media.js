import { json, problem } from "./http.js";

const VARIANTS = new Set(["desktop", "mobile"]);
const KEY_PATTERN = /^portfolio\/tvc\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,127})\/poster-(desktop|mobile)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;

async function requestBody(request) {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return { response: problem(422, "VALIDATION_FAILED", "Request body must be a JSON object") };
    return { value };
  } catch {
    return { response: problem(400, "INVALID_JSON", "Request body must be valid JSON") };
  }
}

function activeDraft(env, workId) {
  return env.DB.prepare("SELECT id, section, status, version, poster_key, poster_mobile_key FROM works WHERE id = ? AND section = 'tvc' AND status = 'draft'")
    .bind(workId).first();
}

function validVersion(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function expectedKey(key, workId, variant) {
  const match = typeof key === "string" && key.match(KEY_PATTERN);
  return Boolean(match && match[1] === workId && match[2] === variant);
}

function webpContainer(bytes) {
  return bytes.byteLength >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

async function audit(env, workId, identity, action, details) {
  await env.DB.prepare("INSERT INTO audit_log (id, work_id, actor_email, action, details_json) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), workId, identity.email, action, JSON.stringify(details)).run();
}

export async function uploadPoster(request, env, workId, variant, identity) {
  if (!VARIANTS.has(variant)) return problem(422, "INVALID_POSTER", "Poster variant must be desktop or mobile");
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "image/webp") {
    return problem(422, "INVALID_POSTER", "Poster uploads must be WebP images");
  }
  const work = await activeDraft(env, workId);
  if (!work) return problem(404, "NOT_FOUND", "TVC draft not found");

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!webpContainer(bytes)) return problem(422, "INVALID_POSTER", "Poster upload must contain a WebP container");
  const key = `portfolio/tvc/${workId}/poster-${variant}-${crypto.randomUUID()}.webp`;
  await env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: "image/webp" },
    customMetadata: { section: "tvc", workId, variant },
  });
  await audit(env, workId, identity, "UPLOAD_TVC_POSTER", { key, variant });
  return json({ data: { key, variant } }, { status: 201 });
}

async function ownedPoster(media, key, workId, variant) {
  if (!expectedKey(key, workId, variant)) return false;
  try {
    const object = await media.head(key);
    const metadata = object?.customMetadata;
    return metadata?.section === "tvc" && metadata?.workId === workId && metadata?.variant === variant;
  } catch {
    return false;
  }
}

export async function attachDraftMedia(request, env, workId, identity) {
  const parsed = await requestBody(request);
  if (parsed.response) return parsed.response;
  const { version, poster_key: posterKey, poster_mobile_key: posterMobileKey } = parsed.value;
  if (!validVersion(version)) return problem(422, "VALIDATION_FAILED", "version must be a positive integer");
  const work = await activeDraft(env, workId);
  if (!work) return problem(404, "NOT_FOUND", "TVC draft not found");
  if (!await ownedPoster(env.MEDIA, posterKey, workId, "desktop") || !await ownedPoster(env.MEDIA, posterMobileKey, workId, "mobile")) {
    return problem(422, "INVALID_MEDIA", "Poster keys must reference owned completed desktop and mobile uploads");
  }

  const result = await env.DB.prepare("UPDATE works SET poster_key = ?, poster_mobile_key = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND section = 'tvc' AND status = 'draft' AND version = ?")
    .bind(posterKey, posterMobileKey, workId, version).run();
  if (!result.meta?.changes) return problem(409, "VERSION_CONFLICT", "This work has changed; refresh and try again");
  const data = { id: workId, section: "tvc", status: "draft", version: version + 1, poster_key: posterKey, poster_mobile_key: posterMobileKey };
  await audit(env, workId, identity, "ATTACH_TVC_POSTERS", data);
  return json({ data });
}
