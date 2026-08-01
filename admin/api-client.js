export class PortfolioApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "PortfolioApiError";
    this.status = status;
    this.code = code;
  }
}

export class PortfolioApi {
  constructor({ baseUrl = "", fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetch = fetchImpl;
  }

  async request(path, options = {}) {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      ...options,
      credentials: "same-origin",
      headers: { accept: "application/json", ...options.headers },
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new PortfolioApiError(payload?.error?.message || "请求失败，请稍后重试。", response.status, payload?.error?.code);
    return payload?.data ?? payload;
  }

  session() { return this.request("/api/admin/session"); }
  listWorks() { return this.request("/api/admin/works"); }
  getWork(workId) { return this.request(`/api/admin/works/${encodeURIComponent(workId)}`); }
  createWork(value) { return this.request("/api/admin/works", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); }
  updateWork(workId, value) { return this.request(`/api/admin/works/${encodeURIComponent(workId)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); }
  attachMedia(workId, value) { return this.request(`/api/admin/works/${encodeURIComponent(workId)}/media`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value) }); }
  archiveWork(workId, version) { return this.request(`/api/admin/works/${encodeURIComponent(workId)}/archive`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version }) }); }
  saveWorkOrder(section, ids) { return this.request("/api/admin/order/works", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ section, ids }) }); }
  saveImageOrder(workId, ids) { return this.request(`/api/admin/works/${encodeURIComponent(workId)}/order/images`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) }); }

  uploadImage(file, { section, workId, width, height, signal }) {
    return this.request("/api/admin/uploads/image", {
      method: "POST",
      signal,
      headers: {
        "content-type": file.type,
        "x-section": section,
        "x-work-id": workId,
        "x-file-name": file.name,
        "x-width": String(width),
        "x-height": String(height),
      },
      body: file,
    });
  }

  createMultipartUpload(value) {
    return this.request("/api/admin/uploads/multipart/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
  }

  uploadPart(uploadId, key, partNumber, bytes, signal) {
    return this.request(`/api/admin/uploads/multipart/${encodeURIComponent(uploadId)}/parts/${partNumber}`, {
      method: "PUT",
      signal,
      headers: { "content-type": "application/octet-stream", "x-upload-key": key },
      body: bytes,
    });
  }

  completeMultipartUpload(uploadId, key, parts) {
    return this.request(`/api/admin/uploads/multipart/${encodeURIComponent(uploadId)}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-upload-key": key },
      body: JSON.stringify({ parts }),
    });
  }

  abortMultipartUpload(uploadId, key) {
    return this.request(`/api/admin/uploads/multipart/${encodeURIComponent(uploadId)}`, {
      method: "DELETE",
      headers: { "x-upload-key": key },
    });
  }
}
