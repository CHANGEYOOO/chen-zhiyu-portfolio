import { json, problem } from "./http.js";

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === "GET" && pathname === "/health") {
      return json({ ok: true });
    }

    return problem(404, "NOT_FOUND", "Route not found");
  },
};
