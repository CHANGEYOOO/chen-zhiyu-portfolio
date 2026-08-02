import { requireDashboardAccess } from "./auth.js";
import { json, problem } from "./http.js";
import { getTvcOrder } from "./order.js";
import { attachDraftMedia, uploadPoster } from "./media.js";
import { createTvcDraft, getTvcDraft, updateTvcDraft } from "./works.js";
import { safeWorkId } from "./validation.js";

const API_PREFIX = "/admin/dashboard/api/";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith(API_PREFIX)) return problem(404, "NOT_FOUND", "Route not found");

    const access = await requireDashboardAccess(request, env);
    if (access.response) return access.response;

    if (request.method === "GET" && pathname === "/admin/dashboard/api/session") {
      return json({ data: { email: access.identity.email, logoutUrl: "/cdn-cgi/access/logout" } });
    }

    if (request.method === "GET" && pathname === "/admin/dashboard/api/tvc/order") {
      return getTvcOrder(request, env);
    }

    if (request.method === "POST" && pathname === "/admin/dashboard/api/works") {
      return createTvcDraft(request, env, access.identity);
    }

    const workMatch = pathname.match(/^\/admin\/dashboard\/api\/works\/([^/]+)$/);
    if (workMatch && safeWorkId(workMatch[1])) {
      if (request.method === "GET") return getTvcDraft(request, env, workMatch[1], access.identity);
      if (request.method === "PUT") return updateTvcDraft(request, env, workMatch[1], access.identity);
    }

    const posterMatch = pathname.match(/^\/admin\/dashboard\/api\/works\/([^/]+)\/posters\/(desktop|mobile)$/);
    if (posterMatch && safeWorkId(posterMatch[1]) && request.method === "POST") {
      return uploadPoster(request, env, posterMatch[1], posterMatch[2], access.identity);
    }

    const mediaMatch = pathname.match(/^\/admin\/dashboard\/api\/works\/([^/]+)\/media$/);
    if (mediaMatch && safeWorkId(mediaMatch[1]) && request.method === "PUT") {
      return attachDraftMedia(request, env, mediaMatch[1], access.identity);
    }

    return problem(404, "NOT_FOUND", "Route not found");
  },
};
