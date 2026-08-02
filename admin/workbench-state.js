const WORKSPACE_VIEW = "workspace";
const EDITOR_VIEW = "editor";

export function createWorkbenchState() {
  return {
    view: WORKSPACE_VIEW,
    editorWorkId: "",
    dirty: false,
    activeUploadCount: 0,
  };
}

function textValue(work, field) {
  return String(work[field] ?? "").trim();
}

function matchesQuery(work, query) {
  return ["brand_name", "work_title", "work_type"].some((field) => textValue(work, field).toLowerCase().includes(query));
}

export function filterWorks(works, filters = {}) {
  const query = String(filters.query ?? "").trim().toLowerCase();
  return works.filter((work) => {
    if (filters.section && filters.section !== "all" && work.section !== filters.section) return false;
    if (filters.status && filters.status !== "all" && work.status !== filters.status) return false;
    if (query && !matchesQuery(work, query)) return false;
    return true;
  });
}

function uploadSatisfies(item, work, kind) {
  if (!item || item.kind !== kind || item.state !== "complete" || !item.result) return false;
  if (item.workId && item.workId !== work.id) return false;
  if (kind === "poster") return Boolean(item.result.desktop?.key);
  if (kind === "video") return Boolean(item.result.key);
  if (kind === "image") return Boolean(item.result.key);
  return false;
}

function mediaSatisfied(work, uploads, kind, field) {
  if (textValue(work, field)) return true;
  return uploads.some((item) => uploadSatisfies(item, work, kind));
}

function missingItems(work, uploads) {
  const isLive = work.section === "livestream";
  const requiredText = isLive
    ? [["直播名", "work_title"], ["类型", "work_type"]]
    : [["品牌名", "brand_name"], ["影片名", "work_title"], ["作品类型", "work_type"]];
  const missing = requiredText
    .filter(([, field]) => !textValue(work, field))
    .map(([label]) => label);
  if (isLive) {
    const hasImages = Array.isArray(work.work_images) && work.work_images.length > 0;
    if (!hasImages && !uploads.some((item) => uploadSatisfies(item, work, "image"))) missing.push("项目图片");
  } else {
    if (!mediaSatisfied(work, uploads, "poster", "poster_key")) missing.push("海报");
    if (!mediaSatisfied(work, uploads, "video", "video_key")) missing.push("视频");
  }
  return missing;
}

export function publishReadiness(work, uploads = []) {
  const missing = missingItems(work, uploads);
  return { ready: missing.length === 0, missing };
}

export function workCompleteness(work, uploads = []) {
  const missing = missingItems(work, uploads);
  return { complete: missing.length === 0, missing };
}

export function hasUnsafeExit(state) {
  return Boolean(state.dirty) || (state.activeUploadCount ?? 0) > 0;
}

export function transitionView(state, action) {
  switch (action.type) {
    case "OPEN_EDITOR":
      return { ...state, view: EDITOR_VIEW, editorWorkId: action.workId };
    case "CLOSE_EDITOR":
      return { ...state, view: WORKSPACE_VIEW };
    default:
      return state;
  }
}
