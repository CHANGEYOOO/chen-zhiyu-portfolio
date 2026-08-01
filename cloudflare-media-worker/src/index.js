const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

function parseRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header || "");
  if (!match) return null;

  const [, startValue, endValue] = match;
  if (!startValue && !endValue) return null;

  const start = startValue ? Number(startValue) : Math.max(0, size - Number(endValue));
  const end = endValue ? Number(endValue) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= size) return null;

  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!key || key.includes("..")) return new Response("Not Found", { status: 404 });

    const metadata = await env.MEDIA.head(key);
    if (!metadata) return new Response("Not Found", { status: 404 });

    const range = parseRange(request.headers.get("Range"), metadata.size);
    if (request.headers.has("Range") && !range) {
      return new Response("Range Not Satisfiable", { status: 416, headers: { "Content-Range": `bytes */${metadata.size}` } });
    }

    const object = await env.MEDIA.get(key, range ? { range } : undefined);
    if (!object) return new Response("Not Found", { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", IMMUTABLE_CACHE);
    headers.set("accept-ranges", "bytes");
    headers.set("x-content-type-options", "nosniff");

    if (range) {
      headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`);
      headers.set("content-length", String(range.length));
      return new Response(request.method === "HEAD" ? null : object.body, { status: 206, headers });
    }

    headers.set("content-length", String(metadata.size));
    return new Response(request.method === "HEAD" ? null : object.body, { headers });
  },
};
