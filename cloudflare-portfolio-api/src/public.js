import { json } from "./http.js";

const CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";
const MEDIA_ORIGIN = "https://media.kjoe.top";

function cacheForPublicWorks() {
  return globalThis.caches?.default;
}

function cacheKey(request) {
  const url = new URL(request.url);
  return new Request(`${url.origin}/api/public/works`);
}

function mediaUrl(key) {
  if (typeof key !== "string" || !key) return null;
  return `${MEDIA_ORIGIN}/${key.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`;
}

function publicWork(work, images) {
  return {
    id: work.id,
    section: work.section,
    brand_name: work.brand_name,
    work_title: work.work_title,
    work_type: work.work_type,
    poster_url: mediaUrl(work.poster_key),
    video_url: mediaUrl(work.video_key),
    sort_order: work.sort_order,
    work_images: images.map((image) => ({
      id: image.id,
      image_url: mediaUrl(image.image_key),
      width: image.width,
      height: image.height,
      sort_order: image.sort_order,
    })),
  };
}

async function etag(payload) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return `"${[...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}"`;
}

function matchesEtag(request, value) {
  return request.headers.get("if-none-match")?.split(",").map((tag) => tag.trim()).includes(value) || request.headers.get("if-none-match") === "*";
}

function notModified(value) {
  return new Response(null, { status: 304, headers: { etag: value, "cache-control": CACHE_CONTROL } });
}

export async function getPublicWorks(request, env) {
  const cache = cacheForPublicWorks();
  const key = cacheKey(request);
  const cached = cache && await cache.match(key);
  if (cached) {
    const value = cached.headers.get("etag");
    return value && matchesEtag(request, value) ? notModified(value) : cached;
  }

  const works = await env.DB.prepare("SELECT id, section, brand_name, work_title, work_type, poster_key, video_key, sort_order FROM works WHERE status = 'published' ORDER BY section, sort_order, created_at").bind().all();
  const images = await env.DB.prepare("SELECT image.id, image.work_id, image.image_key, image.width, image.height, image.sort_order FROM work_images AS image JOIN works AS work ON work.id = image.work_id WHERE work.status = 'published' ORDER BY image.work_id, image.sort_order, image.created_at").bind().all();
  const byWork = new Map();
  for (const image of images.results) {
    const current = byWork.get(image.work_id) || [];
    current.push(image);
    byWork.set(image.work_id, current);
  }
  const payload = { works: works.results.map((work) => publicWork(work, byWork.get(work.id) || [])), generatedAt: new Date().toISOString() };
  const serialized = JSON.stringify(payload);
  const value = await etag(serialized);
  const response = json(payload, { headers: { etag: value, "cache-control": CACHE_CONTROL } });
  if (cache) await cache.put(key, response.clone());
  return matchesEtag(request, value) ? notModified(value) : response;
}

export async function invalidatePublicWorksCache(request) {
  const cache = cacheForPublicWorks();
  if (cache) await cache.delete(cacheKey(request));
}
