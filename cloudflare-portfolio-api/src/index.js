import { json, problem } from "./http.js";
import { requireAccess } from "./auth.js";
import { getPublicWorks } from "./public.js";
import { attachMedia } from "./media.js";
import { archiveWork, createWork, getWork, listWorks, saveImageOrder, saveWorkOrder, updateWork } from "./works.js";
import { abortMultipartUpload, completeMultipartUpload, createMultipartUpload, getMultipartUpload, uploadImage, uploadMultipartPart } from "./uploads.js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === "GET" && pathname === "/health") {
      return json({ ok: true });
    }

    if (request.method === "GET" && pathname === "/api/public/works") return getPublicWorks(request, env);

    if (!pathname.startsWith("/api/admin/")) return problem(404, "NOT_FOUND", "Route not found");
    const access = await requireAccess(request, env);
    if (access.response) return access.response;
    const { identity } = access;

    if (request.method === "GET" && pathname === "/api/admin/session") {
      return json({ data: { email: identity.email, logoutUrl: "/cdn-cgi/access/logout" } });
    }

    if (request.method === "POST" && pathname === "/api/admin/uploads/image") return uploadImage(request, env, identity);
    if (request.method === "POST" && pathname === "/api/admin/uploads/multipart/create") return createMultipartUpload(request, env, identity);

    const multipartPartMatch = pathname.match(/^\/api\/admin\/uploads\/multipart\/([^/]+)\/parts\/(\d+)$/);
    if (multipartPartMatch && request.method === "PUT") return uploadMultipartPart(request, env, decodeURIComponent(multipartPartMatch[1]), multipartPartMatch[2], identity);
    const multipartCompleteMatch = pathname.match(/^\/api\/admin\/uploads\/multipart\/([^/]+)\/complete$/);
    if (multipartCompleteMatch && request.method === "POST") return completeMultipartUpload(request, env, decodeURIComponent(multipartCompleteMatch[1]), identity);
    const multipartMatch = pathname.match(/^\/api\/admin\/uploads\/multipart\/([^/]+)$/);
    if (multipartMatch) {
      const uploadId = decodeURIComponent(multipartMatch[1]);
      if (request.method === "GET") return getMultipartUpload(request, env, uploadId, identity);
      if (request.method === "DELETE") return abortMultipartUpload(request, env, uploadId, identity);
    }

    if (request.method === "GET" && pathname === "/api/admin/works") return listWorks(request, env, identity);
    if (request.method === "POST" && pathname === "/api/admin/works") return createWork(request, env, identity);
    if (request.method === "PUT" && pathname === "/api/admin/order/works") return saveWorkOrder(request, env, identity);

    const workMatch = pathname.match(/^\/api\/admin\/works\/([^/]+)$/);
    if (workMatch) {
      const workId = decodeURIComponent(workMatch[1]);
      if (request.method === "GET") return getWork(request, env, workId, identity);
      if (request.method === "PUT") return updateWork(request, env, workId, identity);
    }
    const mediaMatch = pathname.match(/^\/api\/admin\/works\/([^/]+)\/media$/);
    if (mediaMatch && request.method === "PUT") return attachMedia(request, env, decodeURIComponent(mediaMatch[1]), identity);
    const archiveMatch = pathname.match(/^\/api\/admin\/works\/([^/]+)\/archive$/);
    if (archiveMatch && request.method === "POST") return archiveWork(request, env, decodeURIComponent(archiveMatch[1]), identity);
    const imageOrderMatch = pathname.match(/^\/api\/admin\/works\/([^/]+)\/order\/images$/);
    if (imageOrderMatch && request.method === "PUT") return saveImageOrder(request, env, decodeURIComponent(imageOrderMatch[1]), identity);

    return problem(404, "NOT_FOUND", "Route not found");
  },
};
