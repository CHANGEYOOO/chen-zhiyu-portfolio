import { requireDashboardAccess } from "./auth.js";
import { json, problem } from "./http.js";
import { getTvcOrder } from "./order.js";
import { attachDraftMedia, uploadPoster } from "./media.js";
import { abortVideoMultipart, completeVideoMultipart, createVideoMultipart, getVideoMultipart, uploadVideoPart } from "./uploads.js";
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

    const multipartCreateMatch = pathname.match(/^\/admin\/dashboard\/api\/works\/([^/]+)\/video\/multipart$/);
    if (multipartCreateMatch && safeWorkId(multipartCreateMatch[1]) && request.method === "POST") {
      return createVideoMultipart(request, env, multipartCreateMatch[1], access.identity);
    }

    const multipartPartMatch = pathname.match(/^\/admin\/dashboard\/api\/works\/([^/]+)\/video\/multipart\/([^/]+)\/parts\/(\d+)$/);
    if (multipartPartMatch && safeWorkId(multipartPartMatch[1]) && request.method === "PUT") {
      return uploadVideoPart(request, env, multipartPartMatch[1], decodeURIComponent(multipartPartMatch[2]), multipartPartMatch[3], access.identity);
    }

    const multipartCompleteMatch = pathname.match(/^\/admin\/dashboard\/api\/works\/([^/]+)\/video\/multipart\/([^/]+)\/complete$/);
    if (multipartCompleteMatch && safeWorkId(multipartCompleteMatch[1]) && request.method === "POST") {
      return completeVideoMultipart(request, env, multipartCompleteMatch[1], decodeURIComponent(multipartCompleteMatch[2]), access.identity);
    }

    const multipartMatch = pathname.match(/^\/admin\/dashboard\/api\/works\/([^/]+)\/video\/multipart\/([^/]+)$/);
    if (multipartMatch && safeWorkId(multipartMatch[1])) {
      const uploadId = decodeURIComponent(multipartMatch[2]);
      if (request.method === "GET") return getVideoMultipart(request, env, multipartMatch[1], uploadId, access.identity);
      if (request.method === "DELETE") return abortVideoMultipart(request, env, multipartMatch[1], uploadId, access.identity);
    }

    return problem(404, "NOT_FOUND", "Route not found");
  },
};
