import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "cloudflare-portfolio-api/seed/works.json");
const indexPath = resolve(root, "index.html");
const livestreamSourcePath = resolve(root, "assets/data/livestream-projects.json");
const allowedMediaHost = "https://media.kjoe.top";

function fail(message) {
  throw new Error(message);
}

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isMediaKey(value) {
  return isText(value)
    && !value.includes("://")
    && !value.includes("?")
    && !value.includes("#")
    && value.startsWith("media-v0.21/");
}

function contiguous(values) {
  return values.every((value, index) => value === index);
}

function readJson(path, description) {
  if (!existsSync(path)) fail(`${description} does not exist: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`Cannot parse ${description}: ${error.message}`);
  }
}

function readManifest() {
  if (process.argv.includes("--stdin")) {
    try {
      return JSON.parse(readFileSync(0, "utf8"));
    } catch (error) {
      fail(`Cannot parse Manifest from stdin: ${error.message}`);
    }
  }
  return readJson(manifestPath, "Manifest");
}

function decodeText(value) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function sourceMediaKey(url, description) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail(`Invalid ${description} URL in index.html`);
  }
  if (parsed.origin !== allowedMediaHost) fail(`Invalid ${description} host in index.html: ${parsed.origin}`);
  return parsed.pathname.replace(/^\/+/, "");
}

function extractTvcSource(indexHtml) {
  const videoBase = indexHtml.match(/data-video-base="([^"]+)"/)?.[1];
  if (!videoBase) fail("Missing TVC video base in index.html");
  const cards = [...indexHtml.matchAll(/<article class="work-card" data-work="([^"]+)">([\s\S]*?)<\/article>/g)];
  return cards.map(([_, id, card], sortOrder) => {
    const meta = card.match(/<p class="work-meta-line">([\s\S]*?)<\/p>/)?.[1];
    const spans = meta ? [...meta.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((match) => decodeText(match[1])) : [];
    const desktop = card.match(/<img[^>]+src="([^"]+)"/)?.[1];
    const mobile = card.match(/<source[^>]+srcset="([^"]+)"/)?.[1];
    const title = card.match(/<h3>([\s\S]*?)<\/h3>/)?.[1];
    if (!desktop || !mobile || !title || spans.length !== 2 || !spans.every(Boolean)) fail(`Incomplete TVC source card: ${id}`);
    return {
      id,
      brand_name: spans[0],
      work_title: decodeText(title),
      work_type: spans[1],
      poster_key: sourceMediaKey(desktop, `desktop poster for ${id}`),
      poster_mobile_key: sourceMediaKey(mobile, `mobile poster for ${id}`),
      video_key: sourceMediaKey(new URL(`${id}.mp4`, videoBase).href, `video for ${id}`),
      sort_order: sortOrder,
    };
  });
}

function validateManifest(manifest, authoritativeProjects, sourceTvc) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) fail("Manifest must be an object");
  if (manifest.media_host !== allowedMediaHost) fail(`Invalid media host: ${manifest.media_host}`);
  if (!Array.isArray(manifest.works)) fail("Manifest works must be an array");

  const tvc = manifest.works.filter((work) => work.section === "tvc");
  const livestream = manifest.works.filter((work) => work.section === "livestream");
  if (tvc.length !== 30 || livestream.length !== 8 || manifest.works.length !== 38) {
    fail(`Expected exactly TVC=30 and Livestream=8; got TVC=${tvc.length}, Livestream=${livestream.length}`);
  }

  const ids = new Set();
  const imageIds = new Set();
  for (const work of manifest.works) {
    if (!isText(work.id) || ids.has(work.id)) fail(`Duplicate or missing work id: ${work.id}`);
    ids.add(work.id);
    if (!isText(work.work_title) || !isText(work.work_type)) fail(`Missing required text for ${work.id}`);
    if (!Number.isInteger(work.sort_order)) fail(`Missing sort_order for ${work.id}`);

    if (work.section === "tvc") {
      if (!isText(work.brand_name)) fail(`Missing brand_name for ${work.id}`);
      for (const field of ["poster_key", "poster_mobile_key", "video_key"]) {
        if (!isMediaKey(work[field])) fail(`Missing or invalid ${field} for ${work.id}`);
      }
      if (!Array.isArray(work.images) || work.images.length !== 0) fail(`TVC ${work.id} must not contain project images`);
      continue;
    }

    if (work.section !== "livestream") fail(`Invalid section for ${work.id}: ${work.section}`);
    if (work.brand_name !== null || work.poster_key !== null || work.poster_mobile_key !== null || work.video_key !== null) {
      fail(`Livestream ${work.id} must use null D1 media fields`);
    }
    if (!isMediaKey(work.cover_key)) fail(`Missing or invalid cover_key for ${work.id}`);
    if (!Array.isArray(work.images) || work.images.length === 0) fail(`Livestream ${work.id} is missing images`);
    if (work.cover_key !== work.images[0]?.image_key) fail(`Livestream ${work.id} cover does not match its first image`);

    const workImageIds = new Set();
    for (const image of work.images) {
      if (!isText(image.id) || workImageIds.has(image.id) || imageIds.has(image.id)) fail(`Duplicate or missing image id for ${work.id}`);
      workImageIds.add(image.id);
      imageIds.add(image.id);
      if (!isMediaKey(image.image_key)) fail(`Missing or invalid image_key for ${image.id}`);
      if (!Number.isInteger(image.sort_order) || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width <= 0 || image.height <= 0) {
        fail(`Missing dimensions or order for ${image.id}`);
      }
    }
    if (!contiguous(work.images.map((image) => image.sort_order))) fail(`Image order is not contiguous for ${work.id}`);
  }

  for (const group of [tvc, livestream]) {
    if (!contiguous(group.map((work) => work.sort_order))) fail(`Work order is not contiguous for ${group[0]?.section || "empty section"}`);
  }

  if (sourceTvc.length !== 30) fail(`Expected 30 TVC cards in index.html, found ${sourceTvc.length}`);
  for (const [index, work] of tvc.entries()) {
    const source = sourceTvc[index];
    for (const field of ["id", "brand_name", "work_title", "work_type", "poster_key", "poster_mobile_key", "video_key", "sort_order"]) {
      if (work[field] !== source[field]) fail(`TVC source mismatch for ${work.id}: ${field}`);
    }
  }

  const authoritativeById = new Map(authoritativeProjects.map((project) => [project.id, project]));
  const totalSourceImages = authoritativeProjects.reduce((total, project) => total + project.images.length, 0);
  const totalManifestImages = livestream.reduce((total, work) => total + work.images.length, 0);
  if (totalManifestImages !== totalSourceImages) fail(`Livestream image total mismatch: manifest=${totalManifestImages}, source=${totalSourceImages}`);
  for (const [index, work] of livestream.entries()) {
    const source = authoritativeById.get(work.id);
    if (!source) fail(`Livestream ${work.id} is not present in the authoritative JSON`);
    if (work.id !== authoritativeProjects[index]?.id) fail(`Livestream source order mismatch for ${work.id}`);
    if (work.work_title !== source.title || work.work_type !== source.category) fail(`Livestream text mismatch for ${work.id}`);
    const release = work.cover_key.split("/")[0];
    for (const [imageIndex, image] of work.images.entries()) {
      const expectedKey = `${release}/assets/images/livestream/${source.directory}/${source.images[imageIndex]}`;
      if (image.image_key !== expectedKey) fail(`Livestream image key mismatch for ${work.id} at index ${imageIndex}`);
    }
  }

  return { tvc: tvc.length, livestream: livestream.length, images: totalManifestImages };
}

try {
  const manifest = readManifest();
  const indexHtml = readFileSync(indexPath, "utf8");
  const authoritativeProjects = readJson(livestreamSourcePath, "Authoritative Livestream source");
  const summary = validateManifest(manifest, authoritativeProjects, extractTvcSource(indexHtml));
  console.log(`Cloudflare import manifest valid: TVC=${summary.tvc} Livestream=${summary.livestream} Images=${summary.images}`);
} catch (error) {
  console.error(`Cloudflare import manifest invalid: ${error.message}`);
  process.exitCode = 1;
}
