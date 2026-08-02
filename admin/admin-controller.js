// Task 7A-1 pure controller contract: DOM-free helpers consumed by the workbench wiring.

const STATUS_LABELS = { draft: "草稿", published: "已发布", archived: "已归档" };
const TEXT_FIELD_LABELS = { brand_name: "品牌", work_title: "片名", work_type: "类型" };
const TEXT_FIELDS = ["brand_name", "work_title", "work_type"];

export function createClientWork(section, id) {
  if (section !== "tvc" && section !== "livestream") {
    throw new TypeError(`createClientWork 仅接受 tvc 或 livestream，收到：${section}`);
  }
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError("createClientWork 需要一个非空的稳定 work id");
  }
  const work = {
    id,
    section,
    status: "draft",
    version: 0,
    brand_name: section === "livestream" ? null : "",
    work_title: "",
    work_type: "",
  };
  Object.defineProperty(work, "section", {
    value: section,
    enumerable: true,
    writable: false,
    configurable: false,
  });
  return work;
}

export function emptyStateKind({ total = 0, filteredCount = 0, statusFilter = "all", section = "", imageCount = 0 } = {}) {
  if (section === "livestream" && imageCount === 0) return "livestream-images";
  if (total === 0) return "works";
  if (filteredCount === 0 && statusFilter === "archived") return "archived";
  if (filteredCount === 0) return "filtered";
  return null;
}

export function networkStatusModel(online) {
  return online
    ? { state: "online", label: "网络正常" }
    : { state: "offline", label: "离线，上传将等待网络" };
}

export function previewLocalUrlKey({ workId, kind, image, index }) {
  if (kind === "poster") return `${workId}:poster`;
  if (kind === "video") return `${workId}:video`;
  if (kind === "image") return `${workId}:image:${image?.id ?? image?.sort_order ?? index}`;
  return "";
}

export function lifecycleConfirmation(action, work = {}) {
  const displayName = work.work_title ? `《${work.work_title}》` : "该作品";
  switch (action) {
    case "publish":
      if (work.status === "archived") {
        throw new Error("已归档作品不能直接发布，请先恢复为草稿。");
      }
      return {
        title: "发布作品？",
        message: `${displayName} 将公开显示在前台。`,
        confirmLabel: "确认发布",
        tone: "",
        nextStatus: "published",
      };
    case "unpublish":
      return {
        title: "取消发布？",
        message: `${displayName} 将回到草稿状态，不再显示在前台。`,
        confirmLabel: "确认取消发布",
        tone: "danger",
        nextStatus: "draft",
      };
    case "archive":
      return {
        title: "归档作品？",
        message: `${displayName} 将标记为已归档，不再显示在前台；可在“已归档”筛选下恢复。`,
        confirmLabel: "确认归档",
        tone: "danger",
        nextStatus: "archived",
      };
    case "restore":
      return {
        title: "恢复作品？",
        message: `${displayName} 将恢复为草稿，可继续编辑后再发布。`,
        confirmLabel: "确认恢复",
        tone: "",
        nextStatus: "draft",
      };
    default:
      throw new TypeError(`lifecycleConfirmation 不支持的操作：${action}`);
  }
}

export function publishChangeSummary(saved = {}, draft = {}) {
  const lines = [];
  for (const field of TEXT_FIELDS) {
    const before = saved[field] ?? "";
    const after = draft[field] ?? "";
    if (before !== after) {
      lines.push(`${TEXT_FIELD_LABELS[field]}：${before || "—"} → ${after || "—"}`);
    }
  }
  const beforeStatus = saved.status ?? "draft";
  const afterStatus = draft.status ?? "draft";
  if (beforeStatus !== afterStatus) {
    lines.push(`状态：${STATUS_LABELS[beforeStatus] || beforeStatus} → ${STATUS_LABELS[afterStatus] || afterStatus}`);
  }
  return lines.length > 0 ? lines : ["没有文字变更"];
}
