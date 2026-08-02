import { buildWorksModel } from "./works-model.js";

export const PUBLIC_WORKS_URL = "https://api.kjoe.top/api/public/works";

export function highlightedWorkId(search = "") {
  const value = new URLSearchParams(search).get("highlight") || "";
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value) ? value : "";
}

export class DashboardRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "DashboardRequestError";
  }
}

export async function requestPublishedWorks(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(PUBLIC_WORKS_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new DashboardRequestError(`作品接口请求失败：HTTP ${response.status}`);
  return response.json();
}

export function createDashboardController({ request, buildModel, view, logger = console }) {
  return {
    async load() {
      view.showLoading();
      try {
        view.showModel(buildModel(await request()));
      } catch (error) {
        logger.error("Dashboard load failed", error);
        view.showError("作品数据加载失败，请稍后重试。");
      }
    },
  };
}

function setText(element, value) {
  if (element) element.textContent = String(value);
}

function row(documentRef, work, index, highlightId) {
  const item = documentRef.createElement("tr");
  item.dataset.workId = work.id;
  if (work.id === highlightId) {
    item.classList.add("is-highlighted");
    item.tabIndex = -1;
  }
  for (const value of [index + 1, work.brand_name, work.work_title, work.work_type]) {
    const cell = documentRef.createElement("td");
    cell.textContent = String(value);
    item.appendChild(cell);
  }
  return item;
}

export function renderDashboardActions(documentRef, root) {
  const link = documentRef.createElement("a");
  link.className = "btn btn-dark";
  link.href = "/admin/dashboard/tvc/new/";
  link.textContent = "新增 TVC";
  root.replaceChildren(link);
}

export function createDomView(documentRef, { highlightId = "" } = {}) {
  const status = documentRef.querySelector("[data-dashboard-status]");
  const warning = documentRef.querySelector("[data-dashboard-warning]");
  const retry = documentRef.querySelector("[data-retry]");
  const bodies = {
    tvc: documentRef.querySelector('[data-works-body="tvc"]'),
    livestream: documentRef.querySelector('[data-works-body="livestream"]'),
  };
  return {
    showLoading() {
      status.hidden = false;
      status.dataset.kind = "loading";
      status.textContent = "正在读取作品数据…";
      warning.hidden = true;
      retry.hidden = true;
    },
    showModel(model) {
      setText(documentRef.querySelector('[data-count="total"]'), model.counts.total);
      setText(documentRef.querySelector('[data-count="tvc"]'), model.counts.tvc);
      setText(documentRef.querySelector('[data-count="livestream"]'), model.counts.livestream);
      let highlightedRow = null;
      for (const section of ["tvc", "livestream"]) {
        const rows = model.groups[section].map((work, index) => row(documentRef, work, index, highlightId));
        bodies[section].replaceChildren(...rows);
        highlightedRow ||= rows.find((item) => item.dataset.workId === highlightId);
      }
      status.hidden = false;
      status.dataset.kind = "success";
      status.textContent = model.isEmpty ? "当前没有已发布作品。" : `已载入 ${model.counts.total} 个作品。`;
      warning.textContent = model.warning;
      warning.hidden = !model.warning;
      retry.hidden = true;
      if (highlightedRow) {
        highlightedRow.focus({ preventScroll: true });
        highlightedRow.scrollIntoView({ block: "center" });
      }
    },
    showError(message) {
      status.hidden = false;
      status.dataset.kind = "error";
      status.textContent = message;
      warning.hidden = true;
      retry.hidden = false;
    },
  };
}

if (typeof document !== "undefined") {
  const actions = document.querySelector("[data-dashboard-actions]");
  if (actions) renderDashboardActions(document, actions);
  const controller = createDashboardController({
    request: requestPublishedWorks,
    buildModel: buildWorksModel,
    view: createDomView(document, { highlightId: highlightedWorkId(location.search) }),
  });
  document.querySelector("[data-retry]")?.addEventListener("click", () => controller.load());
  controller.load();
}
