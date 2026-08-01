import { json, problem } from "./http.js";
import { requireAccess } from "./auth.js";
import { archiveWork, createWork, getWork, listWorks, saveImageOrder, saveWorkOrder, updateWork } from "./works.js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === "GET" && pathname === "/health") {
      return json({ ok: true });
    }

    if (!pathname.startsWith("/api/admin/")) return problem(404, "NOT_FOUND", "Route not found");
    const access = await requireAccess(request, env);
    if (access.response) return access.response;
    const { identity } = access;

    if (request.method === "GET" && pathname === "/api/admin/works") return listWorks(request, env, identity);
    if (request.method === "POST" && pathname === "/api/admin/works") return createWork(request, env, identity);
    if (request.method === "PUT" && pathname === "/api/admin/order/works") return saveWorkOrder(request, env, identity);

    const workMatch = pathname.match(/^\/api\/admin\/works\/([^/]+)$/);
    if (workMatch) {
      const workId = decodeURIComponent(workMatch[1]);
      if (request.method === "GET") return getWork(request, env, workId, identity);
      if (request.method === "PUT") return updateWork(request, env, workId, identity);
    }
    const archiveMatch = pathname.match(/^\/api\/admin\/works\/([^/]+)\/archive$/);
    if (archiveMatch && request.method === "POST") return archiveWork(request, env, decodeURIComponent(archiveMatch[1]), identity);
    const imageOrderMatch = pathname.match(/^\/api\/admin\/works\/([^/]+)\/order\/images$/);
    if (imageOrderMatch && request.method === "PUT") return saveImageOrder(request, env, decodeURIComponent(imageOrderMatch[1]), identity);

    return problem(404, "NOT_FOUND", "Route not found");
  },
};
