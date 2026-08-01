import { PortfolioApi, PortfolioApiError } from "./api-client.js";
import { DraftStore } from "./draft-store.js";
import { mediaAttachmentPayload } from "./media-attachment.js";
import { SortableList } from "./sortable-list.js";
import { UploadManager } from "./upload-manager.js";

const config = window.PORTFOLIO_ADMIN_CONFIG || {};
const api = new PortfolioApi({ baseUrl: config.apiBaseUrl || "" });
const drafts = new DraftStore();
const uploads = new UploadManager(api);
const MiB = 1024 * 1024;

const setup = {
  login: document.querySelector("[data-login]"),
  loginLink: document.querySelector("[data-access-login]"),
  workspace: document.querySelector("[data-workspace]"),
  accessState: document.querySelector("[data-access-state]"),
  accessEmail: document.querySelector("[data-access-email]"),
  signout: document.querySelector("[data-signout]"),
  editor: document.querySelector("[data-editor]"),
  form: document.querySelector("[data-editor-form]"),
  workList: document.querySelector("[data-work-list]"),
  globalFeedback: document.querySelector("[data-global-feedback]"),
  editorFeedback: document.querySelector("[data-editor-feedback]"),
  sectionInput: document.querySelector("[data-section-input]"),
  uploadList: document.querySelector("[data-upload-list]"),
  imageList: document.querySelector("[data-image-list]"),
  imageOrderActions: document.querySelector("[data-image-order-actions]"),
  saveImageOrder: document.querySelector("[data-save-image-order]"),
  cancelImageOrder: document.querySelector("[data-cancel-image-order]"),
  imageOrderFeedback: document.querySelector("[data-image-order-feedback]"),
};

const state = {
  works: [],
  filter: "all",
  editorWorkId: "",
  newWorkId: "",
  existingImages: [],
  uploadItems: [],
  orderSaving: false,
};

const imageSorter = new SortableList({ root: setup.imageList, renderItem: renderImageItem });

function feedback(element, message = "", kind = "") {
  if (!element) return;
  element.textContent = message;
  if (kind) element.dataset.kind = kind;
  else delete element.dataset.kind;
}

function statusLabel(status) {
  return { draft: "草稿", published: "已发布", archived: "已归档" }[status] || status;
}

function sectionLabel(section) {
  return section === "livestream" ? "直播间" : "TVC";
}

function mediaUrl(work) {
  if (work.poster_url) return work.poster_url;
  if (work.poster_key) return `https://media.kjoe.top/${work.poster_key.split("/").map(encodeURIComponent).join("/")}`;
  return "";
}

function imageUrl(image) {
  if (image.image_url) return image.image_url;
  if (image.image_key) return `https://media.kjoe.top/${image.image_key.split("/").map(encodeURIComponent).join("/")}`;
  return "";
}

function itemId() {
  return crypto.randomUUID();
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  return bytes >= MiB ? `${(bytes / MiB).toFixed(bytes >= 10 * MiB ? 0 : 1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function setEditorValue(name, value) {
  const input = setup.form.elements[name];
  if (input && value !== undefined && value !== null) input.value = value;
}

function draftValue() {
  const form = new FormData(setup.form);
  return {
    section: form.get("section"),
    brand_name: form.get("brand_name"),
    work_title: form.get("work_title"),
    work_type: form.get("work_type"),
    sort_order: form.get("sort_order"),
    status: form.get("status"),
    image_order: state.existingImages.map((image) => image.id),
  };
}

function saveDraft() {
  if (state.editorWorkId) drafts.save(state.editorWorkId, draftValue());
}

function restoreDraft(workId) {
  const saved = drafts.load(workId);
  if (!saved) return;
  ["section", "brand_name", "work_title", "work_type", "sort_order", "status"].forEach((name) => setEditorValue(name, saved[name]));
  state.existingImages = drafts.orderImages(state.existingImages, saved.image_order);
}

function renderImageItem({ item, index, isFirst }) {
  const row = document.createElement("article");
  row.className = "image-item";
  row.dataset.imageId = item.id;

  const image = document.createElement("img");
  image.src = imageUrl(item);
  image.alt = `项目图片 ${index + 1}`;
  image.loading = "lazy";

  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "drag-handle";
  handle.dataset.sortHandle = "";
  handle.setAttribute("aria-label", `拖动第 ${index + 1} 张图片，或按上下方向键调整顺序`);
  handle.textContent = "拖动";

  const actions = document.createElement("div");
  actions.className = "image-actions";
  [["up", "上移", index === 0], ["down", "下移", index === state.existingImages.length - 1]].forEach(([direction, label, disabled]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.sortMove = direction;
    button.textContent = label;
    button.disabled = disabled;
    button.setAttribute("aria-label", `将第 ${index + 1} 张图片${label}`);
    actions.append(button);
  });

  row.append(image, handle, actions);
  if (isFirst) {
    const cover = document.createElement("span");
    cover.className = "cover-marker";
    cover.textContent = "封面";
    row.append(cover);
  }
  return row;
}

function syncImageOrderUi() {
  const hasImages = imageSorter.items.length > 0;
  const dirty = imageSorter.dirty;
  setup.imageList.dataset.orderDirty = String(dirty);
  setup.imageOrderActions.hidden = !hasImages;
  setup.saveImageOrder.disabled = !dirty || state.orderSaving;
  setup.cancelImageOrder.disabled = !dirty || state.orderSaving;
}

async function saveImageOrder() {
  if (!state.editorWorkId || !imageSorter.dirty || state.orderSaving) return;
  state.orderSaving = true;
  syncImageOrderUi();
  feedback(setup.imageOrderFeedback, "正在保存排序…");
  try {
    const orderedImages = imageSorter.items;
    await api.saveImageOrder(state.editorWorkId, orderedImages.map((image) => image.id));
    imageSorter.commit();
    state.existingImages = imageSorter.items;
    const work = state.works.find((item) => item.id === state.editorWorkId);
    if (work) work.work_images = state.existingImages;
    saveDraft();
    feedback(setup.imageOrderFeedback, "排序已保存。", "success");
  } catch (error) {
    feedback(setup.imageOrderFeedback, error.message || "排序保存失败，请稍后重试。", "error");
  } finally {
    state.orderSaving = false;
    syncImageOrderUi();
  }
}

function cancelImageOrder() {
  if (!imageSorter.cancel()) return;
  state.existingImages = imageSorter.items;
  saveDraft();
  feedback(setup.imageOrderFeedback, "已恢复到服务器排序。");
}

function resetForm(work = null) {
  setup.form.reset();
  state.newWorkId = work ? "" : state.newWorkId || crypto.randomUUID();
  state.editorWorkId = work?.id || state.newWorkId;
  state.existingImages = [...(work?.work_images || [])].sort((left, right) => left.sort_order - right.sort_order);
  imageSorter.replaceServerItems(state.existingImages);
  state.uploadItems = [];
  setEditorValue("id", state.editorWorkId);
  setEditorValue("section", work?.section || "tvc");
  setEditorValue("brand_name", work?.brand_name || "");
  setEditorValue("work_title", work?.work_title || "");
  setEditorValue("work_type", work?.work_type || "");
  setEditorValue("sort_order", work?.sort_order ?? state.works.length);
  setEditorValue("status", work?.status || "draft");
  restoreDraft(state.editorWorkId);
  imageSorter.setItems(state.existingImages);
  document.querySelector("[data-editor-title]").textContent = work ? "编辑作品" : "新增作品";
  feedback(setup.editorFeedback);
  feedback(setup.imageOrderFeedback);
  syncSectionFields();
  syncImageOrderUi();
  renderUploadItems();
}

function syncSectionFields() {
  const isLive = setup.sectionInput.value === "livestream";
  document.querySelectorAll(".tvc-only").forEach((element) => { element.hidden = isLive; });
  document.querySelectorAll(".livestream-only").forEach((element) => { element.hidden = !isLive; });
  if (isLive) setEditorValue("brand_name", "");
  saveDraft();
}

function addFiles(files, kind, replace = false) {
  if (replace) state.uploadItems = state.uploadItems.filter((item) => item.kind !== kind);
  for (const file of files) state.uploadItems.push({ id: itemId(), file, kind, state: "ready", loaded: 0, total: file.size, result: null, error: "" });
  renderUploadItems();
}

function itemMessage(item) {
  if (item.state === "complete") return `已完成 · ${formatBytes(item.total)}`;
  if (item.state === "uploading") return `正在上传 · ${formatBytes(item.loaded)} / ${formatBytes(item.total)}`;
  if (item.state === "failed") return item.error || "上传失败，可重试。";
  if (item.state === "cancelled") return "已取消";
  return `等待保存 · ${formatBytes(item.total)}`;
}

function renderUploadItems() {
  setup.uploadList.replaceChildren();
  if (!state.uploadItems.length) {
    const empty = document.createElement("p");
    empty.className = "upload-empty";
    empty.textContent = "选择本地文件后，会在这里显示上传进度。";
    setup.uploadList.append(empty);
    return;
  }
  for (const item of state.uploadItems) {
    const row = document.createElement("div");
    row.className = "upload-item";
    row.dataset.state = item.state;
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = item.file.name;
    const status = document.createElement("small");
    status.textContent = itemMessage(item);
    copy.append(name, status);
    const actions = document.createElement("div");
    actions.className = "upload-actions";
    if (item.state === "failed" || item.state === "cancelled") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "重试";
      retry.addEventListener("click", () => {
        uploadSelectedItem(item).catch((error) => feedback(setup.editorFeedback, error.message || "上传失败，请稍后重试。", "error"));
      });
      actions.append(retry);
    }
    if (item.state === "ready" || item.state === "uploading") {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = "取消";
      cancel.addEventListener("click", () => cancelItem(item));
      actions.append(cancel);
    }
    row.append(copy, actions);
    setup.uploadList.append(row);
  }
}

function selectedContext() {
  return { section: setup.form.elements.section.value, workId: state.editorWorkId };
}

function validateImage(file) {
  if (!["image/webp", "image/jpeg", "image/png"].includes(file.type)) throw new Error("图片必须是 WebP、JPG 或 PNG 文件。");
  if (file.size > 20 * MiB) throw new Error("图片不能超过 20 MB。");
}

async function dimensions(file) {
  const bitmap = await createImageBitmap(file);
  try { return { width: bitmap.width, height: bitmap.height }; } finally { bitmap.close(); }
}

function encodedImage(canvas, name) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(new File([blob], name, { type: "image/webp" })) : reject(new Error("封面编码失败，请重试。")), "image/webp", 0.86);
  });
}

async function posterVariants(file) {
  validateImage(file);
  const bitmap = await createImageBitmap(file);
  try {
    const render = async (width, height, name) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const scale = Math.max(width / bitmap.width, height / bitmap.height);
      const drawWidth = bitmap.width * scale;
      const drawHeight = bitmap.height * scale;
      canvas.getContext("2d").drawImage(bitmap, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      return encodedImage(canvas, name);
    };
    return { desktop: await render(1600, 900, "poster-desktop.webp"), mobile: await render(960, 540, "poster-mobile.webp") };
  } finally {
    bitmap.close();
  }
}

async function uploadSelectedItem(item) {
  if (!state.editorWorkId) return;
  item.state = "uploading";
  item.error = "";
  item.loaded = 0;
  item.controller = new AbortController();
  renderUploadItems();
  try {
    const context = selectedContext();
    if (item.kind === "video") {
      item.result = await uploads.uploadVideo(item.file, context, (progress) => {
        item.loaded = progress.loaded;
        item.total = progress.total;
        if (progress.state === "cancelled") item.state = "cancelled";
        renderUploadItems();
      });
    } else if (item.kind === "poster") {
      const variants = await posterVariants(item.file);
      const [desktop, mobile] = await Promise.all([
        api.uploadImage(variants.desktop, { ...context, width: 1600, height: 900, signal: item.controller.signal }),
        api.uploadImage(variants.mobile, { ...context, width: 960, height: 540, signal: item.controller.signal }),
      ]);
      item.result = { desktop, mobile };
    } else {
      validateImage(item.file);
      const size = await dimensions(item.file);
      item.result = await api.uploadImage(item.file, { ...context, ...size, signal: item.controller.signal });
    }
    item.loaded = item.total;
    item.state = "complete";
  } catch (error) {
    item.state = /aborted/i.test(error.message) ? "cancelled" : "failed";
    item.error = error.message || "上传失败，可重试。";
    throw error;
  } finally {
    delete item.controller;
    renderUploadItems();
  }
}

async function cancelItem(item) {
  item.controller?.abort();
  if (item.kind === "video") await uploads.abort(item.file, selectedContext());
  item.state = "cancelled";
  renderUploadItems();
}

function recordFromForm(status) {
  const form = new FormData(setup.form);
  const section = String(form.get("section"));
  const value = {
    section,
    brand_name: section === "tvc" ? String(form.get("brand_name") || "").trim() : null,
    work_title: String(form.get("work_title") || "").trim(),
    work_type: String(form.get("work_type") || "").trim(),
    status,
    sort_order: Number(form.get("sort_order") || 0),
  };
  if (!value.work_title || !value.work_type || (section === "tvc" && !value.brand_name)) throw new Error("请填写所有必填展示文字。");
  return value;
}

function mediaFields() {
  return mediaAttachmentPayload(setup.form.elements.section.value, state.existingImages, state.uploadItems);
}

async function saveWork(event) {
  event.preventDefault();
  feedback(setup.editorFeedback, "正在保存…");
  try {
    const desired = recordFromForm(String(setup.form.elements.status.value));
    let current = state.works.find((work) => work.id === state.editorWorkId);
    const acceptsItem = (item) => desired.section === "tvc" ? item.kind !== "image" : item.kind === "image";
    const hasMediaItems = state.uploadItems.some(acceptsItem);
    if (!current) {
      current = await api.createWork({ ...desired, status: "draft" });
      state.works.push(current);
      state.editorWorkId = current.id;
      state.newWorkId = current.id;
      setEditorValue("id", current.id);
    }
    if (hasMediaItems && current.status !== "draft") {
      current = await api.updateWork(current.id, { ...desired, status: "draft", version: current.version });
    }
    const candidates = state.uploadItems.filter((item) => acceptsItem(item) && item.state !== "complete" && item.state !== "cancelled");
    const results = await Promise.allSettled(candidates.map(uploadSelectedItem));
    const failed = results.filter((result) => result.status === "rejected");
    const attachment = mediaFields();
    if (Object.keys(attachment).length) current = await api.attachMedia(current.id, { ...attachment, version: current.version });
    const saved = await api.updateWork(current.id, { ...desired, version: current.version });
    drafts.remove(current.id);
    if (failed.length) {
      feedback(setup.editorFeedback, `${failed.length} 个文件上传失败；已完成的文件已保留，可单独重试。`, "error");
      state.works = state.works.map((work) => work.id === saved.id ? saved : work);
      return;
    }
    setup.editor.close();
    state.newWorkId = "";
    await loadWorks();
    feedback(setup.globalFeedback, "已保存", "success");
  } catch (error) {
    feedback(setup.editorFeedback, error.message || "保存失败，请稍后重试。", "error");
  }
}

async function loadWorks() {
  feedback(setup.globalFeedback, "正在载入作品…");
  state.works = await api.listWorks();
  renderWorks();
  feedback(setup.globalFeedback, `${state.works.length} 个作品`);
}

function renderWorks() {
  setup.workList.replaceChildren();
  const filtered = state.works.filter((work) => state.filter === "all" || work.section === state.filter);
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "form-feedback";
    empty.textContent = "还没有符合条件的作品。";
    setup.workList.append(empty);
    return;
  }
  for (const work of filtered) {
    const row = document.createElement("article");
    row.className = "work-row";
    const image = document.createElement("img");
    image.src = mediaUrl(work);
    image.alt = "";
    image.loading = "lazy";
    const info = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = work.work_title;
    const meta = document.createElement("p");
    meta.textContent = `${sectionLabel(work.section)} · ${work.work_type} · ${statusLabel(work.status)}`;
    info.append(title, meta);
    const actions = document.createElement("div");
    actions.className = "row-actions";
    [["编辑", () => { resetForm(work); setup.editor.showModal(); }], ["复制", () => { resetForm({ ...work, id: "", status: "draft", work_title: `${work.work_title} 副本` }); setup.editor.showModal(); }]].forEach(([label, handler]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", handler);
      actions.append(button);
    });
    row.append(image, info, actions);
    setup.workList.append(row);
  }
}

async function boot() {
  setup.loginLink.href = config.accessLoginUrl || window.location.href;
  try {
    const session = await api.session();
    setup.accessEmail.textContent = session.email;
    setup.signout.href = session.logoutUrl;
    setup.accessState.hidden = false;
    setup.workspace.hidden = false;
    await loadWorks();
  } catch (error) {
    if (error instanceof PortfolioApiError && error.status === 401) {
      setup.login.hidden = false;
      return;
    }
    feedback(setup.globalFeedback, error.message || "后台连接失败。", "error");
  }
}

document.querySelectorAll("[data-section-filter]").forEach((button) => button.addEventListener("click", () => {
  state.filter = button.dataset.sectionFilter;
  document.querySelectorAll("[data-section-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
  renderWorks();
}));
document.querySelector("[data-new-work]")?.addEventListener("click", () => { resetForm(); setup.editor.showModal(); });
setup.sectionInput?.addEventListener("change", syncSectionFields);
setup.form?.addEventListener("input", saveDraft);
setup.form?.addEventListener("submit", saveWork);
setup.form?.elements.poster_file?.addEventListener("change", (event) => addFiles([...event.target.files].filter(Boolean), "poster", true));
setup.form?.elements.video_file?.addEventListener("change", (event) => addFiles([...event.target.files].filter(Boolean), "video", true));
setup.form?.elements.image_files?.addEventListener("change", (event) => addFiles([...event.target.files].filter(Boolean), "image"));
document.querySelector(".close-button")?.addEventListener("click", () => setup.editor.close());
setup.editor?.addEventListener("close", () => { saveDraft(); feedback(setup.editorFeedback); });
imageSorter.addEventListener("change", (event) => {
  state.existingImages = event.detail.items;
  syncImageOrderUi();
  saveDraft();
});
setup.saveImageOrder?.addEventListener("click", saveImageOrder);
setup.cancelImageOrder?.addEventListener("click", cancelImageOrder);

boot();
