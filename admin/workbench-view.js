import { workCompleteness } from "./workbench-state.js";

const MEDIA_BASE = "https://media.kjoe.top/";
const MiB = 1024 * 1024;

const STATUS_LABELS = { draft: "草稿", published: "已发布", archived: "已归档" };
const KIND_LABELS = { poster: "海报", video: "视频", image: "项目图片" };
const EMPTY_STATES = {
  works: { title: "暂无作品", hint: "新增 TVC 或 Livestream 开始管理作品。" },
  filtered: { title: "没有符合筛选条件的作品", hint: "清除筛选或更换搜索关键词。" },
  uploads: { title: "暂无上传任务", hint: "从设备选择图片或视频后，上传进度会显示在这里。" },
  "livestream-images": { title: "尚未添加项目图片", hint: "从设备选择图片；第一张将作为前台封面。" },
  archived: { title: "暂无已归档作品", hint: "归档作品会显示在这里。" },
};

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function sectionLabel(section) {
  return section === "livestream" ? "直播间" : "TVC";
}

function kindLabel(kind) {
  return KIND_LABELS[kind] || kind;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  return bytes >= MiB ? `${(bytes / MiB).toFixed(bytes >= 10 * MiB ? 0 : 1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export function mediaUrl({ image_url, image_key } = {}) {
  if (image_url) return image_url;
  if (image_key) return `${MEDIA_BASE}${image_key.split("/").map(encodeURIComponent).join("/")}`;
  return "";
}

function orderedImages(work) {
  if (!Array.isArray(work.work_images)) return [];
  return [...work.work_images].sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
}

export function workRowModel(work) {
  const isLive = work.section === "livestream";
  const firstImage = orderedImages(work)[0] || {};
  const thumbnailUrl = isLive ? mediaUrl(firstImage) : mediaUrl({ image_url: work.poster_url, image_key: work.poster_key });
  const missing = workCompleteness(work, []).missing;
  const title = work.work_title || "未命名作品";
  return {
    id: work.id,
    title,
    brand: work.brand_name || "",
    workType: work.work_type || "",
    sectionLabel: sectionLabel(work.section),
    status: work.status,
    statusLabel: statusLabel(work.status),
    completenessText: missing.length ? `缺：${missing.join("、")}` : "材料完整",
    missing,
    thumbnailUrl,
    thumbnailAlt: thumbnailUrl ? `《${title}》封面` : "",
    hasThumbnail: Boolean(thumbnailUrl),
  };
}

function uploadStatusText(item, state) {
  switch (state) {
    case "ready":
      return `等待保存 · ${formatBytes(item.total)}`;
    case "processing":
      return "正在处理…";
    case "uploading":
      return `正在上传 · ${formatBytes(item.loaded)} / ${formatBytes(item.total)}`;
    case "paused":
      return "已暂停";
    case "waiting-network":
      return "等待网络恢复…";
    case "failed":
      return item.error || "上传失败，可重试。";
    case "complete":
      return `已完成 · ${formatBytes(item.total)}`;
    case "cancelled":
      return "已取消";
    default:
      return state;
  }
}

export function uploadRowModel(item) {
  const state = item.state || "ready";
  const total = Number(item.total) || 0;
  const loaded = Number(item.loaded) || 0;
  const raw = total > 0 ? Math.round((loaded / total) * 100) : 0;
  return {
    id: item.id,
    fileName: item.file?.name || "未知文件",
    kindLabel: kindLabel(item.kind),
    state,
    statusText: uploadStatusText(item, state),
    progress: Math.min(100, Math.max(0, raw)),
    error: item.error || "",
    canRetry: state === "failed" || state === "cancelled",
    canCancel: ["ready", "processing", "uploading", "waiting-network"].includes(state),
    canPause: state === "uploading",
    canResume: state === "paused",
  };
}

export function emptyStateModel(kind) {
  return { ...(EMPTY_STATES[kind] || { title: "暂无内容", hint: "当前没有可显示的内容。" }) };
}

export function statusSummaryModel(state) {
  const viewLabel = state.view === "editor" ? "编辑器" : "作品列表";
  const dirty = Boolean(state.dirty);
  const activeUploadCount = Number(state.activeUploadCount) || 0;
  const parts = [viewLabel];
  if (dirty) parts.push("有未保存修改");
  if (activeUploadCount > 0) parts.push(`${activeUploadCount} 个上传进行中`);
  if (!dirty && activeUploadCount === 0) parts.push("所有修改已保存");
  return { viewLabel, dirty, activeUploadCount, text: parts.join(" · ") };
}

function actionButton(label, onClick) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", () => onClick());
  return element;
}

function workThumbnail(model) {
  if (!model.hasThumbnail) {
    const placeholder = document.createElement("div");
    placeholder.className = "work-thumb placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    return placeholder;
  }
  const image = document.createElement("img");
  image.className = "work-thumb";
  image.src = model.thumbnailUrl;
  image.alt = model.thumbnailAlt;
  image.loading = "lazy";
  return image;
}

export function renderWorkRows(root, models, handlers = {}) {
  root.replaceChildren();
  for (const model of models) {
    const row = document.createElement("article");
    row.className = "work-row";
    row.dataset.workId = model.id;

    const info = document.createElement("div");
    info.className = "work-info";
    const title = document.createElement("h3");
    title.textContent = model.title;
    const meta = document.createElement("p");
    meta.className = "work-meta";
    meta.textContent = [model.sectionLabel, model.workType, model.statusLabel].filter(Boolean).join(" · ");
    const completeness = document.createElement("p");
    completeness.className = "work-completeness";
    completeness.textContent = model.completenessText;
    info.append(title, meta, completeness);

    const actions = document.createElement("div");
    actions.className = "row-actions";
    if (handlers.onEdit) actions.append(actionButton("编辑", () => handlers.onEdit(model.id)));
    if (handlers.onCopy) actions.append(actionButton("复制", () => handlers.onCopy(model.id)));
    if (model.status === "draft" && handlers.onPublish) actions.append(actionButton("发布", () => handlers.onPublish(model.id)));
    if (model.status === "published" && handlers.onUnpublish) actions.append(actionButton("取消发布", () => handlers.onUnpublish(model.id)));
    if (model.status !== "archived" && handlers.onArchive) actions.append(actionButton("归档", () => handlers.onArchive(model.id)));
    if (model.status === "archived" && handlers.onRestore) actions.append(actionButton("恢复", () => handlers.onRestore(model.id)));

    row.append(workThumbnail(model), info, actions);
    root.append(row);
  }
}

export function renderUploadRows(root, models, handlers = {}) {
  root.replaceChildren();
  for (const model of models) {
    const row = document.createElement("div");
    row.className = "upload-item";
    row.dataset.uploadId = model.id;
    row.dataset.state = model.state;

    const copy = document.createElement("div");
    copy.className = "upload-copy";
    const name = document.createElement("strong");
    name.textContent = model.fileName;
    const status = document.createElement("small");
    status.textContent = model.statusText;
    copy.append(name, status);

    const track = document.createElement("div");
    track.className = "progress-track";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(model.progress));
    const bar = document.createElement("div");
    bar.className = "progress-bar";
    bar.style.width = `${model.progress}%`;
    track.append(bar);

    const actions = document.createElement("div");
    actions.className = "upload-actions";
    if (model.canRetry && handlers.onRetry) actions.append(actionButton("重试", () => handlers.onRetry(model.id)));
    if (model.canPause && handlers.onPause) actions.append(actionButton("暂停", () => handlers.onPause(model.id)));
    if (model.canResume && handlers.onResume) actions.append(actionButton("继续", () => handlers.onResume(model.id)));
    if (model.canCancel && handlers.onCancel) actions.append(actionButton("取消", () => handlers.onCancel(model.id)));

    row.append(copy, track, actions);
    root.append(row);
  }
}
