import { requireDashboardAccess } from "./auth.js";
import { json, problem } from "./http.js";

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

    return problem(404, "NOT_FOUND", "Route not found");
  },
};
