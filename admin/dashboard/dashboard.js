import { buildWorksModel } from "./works-model.js";

export const PUBLIC_WORKS_URL = "https://api.kjoe.top/api/public/works";

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

function row(documentRef, work, index) {
  const item = documentRef.createElement("tr");
  for (const value of [index + 1, work.brand_name, work.work_title, work.work_type]) {
    const cell = documentRef.createElement("td");
    cell.textContent = String(value);
    item.appendChild(cell);
  }
  return item;
}

export function createDomView(documentRef) {
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
      for (const section of ["tvc", "livestream"]) {
        bodies[section].replaceChildren(...model.groups[section].map((work, index) => row(documentRef, work, index)));
      }
      status.hidden = false;
      status.dataset.kind = "success";
      status.textContent = model.isEmpty ? "当前没有已发布作品。" : `已载入 ${model.counts.total} 个作品。`;
      warning.textContent = model.warning;
      warning.hidden = !model.warning;
      retry.hidden = true;
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
  const controller = createDashboardController({
    request: requestPublishedWorks,
    buildModel: buildWorksModel,
    view: createDomView(document),
  });
  document.querySelector("[data-retry]")?.addEventListener("click", () => controller.load());
  controller.load();
}
