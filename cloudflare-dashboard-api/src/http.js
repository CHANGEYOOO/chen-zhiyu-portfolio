export function json(payload, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

export function problem(status, code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return json({ error }, { status });
}
