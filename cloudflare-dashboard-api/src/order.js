import { json } from "./http.js";

function base64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function orderRevision(ids) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ids.join("\n")));
  return base64url(new Uint8Array(digest));
}

export async function getTvcOrder(_request, env) {
  const result = await env.DB.prepare("SELECT id, brand_name, work_title FROM works WHERE section = 'tvc' AND status = 'published' ORDER BY sort_order, id")
    .bind().all();
  const items = result.results.map((work) => ({ id: work.id, label: `${work.brand_name} — ${work.work_title}` }));
  return json({ data: { items, orderRevision: await orderRevision(items.map((item) => item.id)) } });
}
