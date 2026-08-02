import { validateDraftFields } from "./form-model.js";

const API_PREFIX = "/admin/dashboard/api";

export class DashboardApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "DashboardApiError";
    this.status = status;
    this.code = code;
    this.isAuth = status === 401 || status === 403;
    this.isConflict = status === 409;
  }
}

function clientValidation(fields) {
  try {
    return validateDraftFields(fields);
  } catch (error) {
    throw new DashboardApiError(error.message, 422, "VALIDATION_FAILED");
  }
}

export function createDashboardApi(fetchImpl = fetch) {
  function url(path) {
    return `${API_PREFIX}${path.startsWith("/") ? path : `/${path}`}`;
  }

  async function request(path, options = {}) {
    const response = await fetchImpl(url(path), {
      ...options,
      credentials: "same-origin",
      headers: { accept: "application/json", ...options.headers },
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new DashboardApiError(payload?.error?.message || "请求失败，请稍后重试。", response.status, payload?.error?.code);
    return payload?.data ?? payload;
  }

  function draftRequest(path, method, fields) {
    return request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fields),
    });
  }

  return {
    url,
    request,
    async createDraft(fields) {
      return draftRequest("/works", "POST", clientValidation(fields));
    },
    getDraft(workId) {
      return request(`/works/${encodeURIComponent(workId)}`);
    },
    updateDraft(workId, fields) {
      const draft = clientValidation(fields);
      if (!Number.isSafeInteger(fields?.version) || fields.version <= 0) {
        return Promise.reject(new DashboardApiError("version must be a positive integer", 422, "VALIDATION_FAILED"));
      }
      return draftRequest(`/works/${encodeURIComponent(workId)}`, "PUT", { ...draft, version: fields.version });
    },
    getTvcOrder() {
      return request("/tvc/order");
    },
  };
}
