// ── Task 7A-2: Workbench wiring ──
import { PortfolioApi, PortfolioApiError } from "./api-client.js";
import { DraftStore } from "./draft-store.js";
import { createClientWork, emptyStateKind, lifecycleConfirmation, networkStatusModel, previewLocalUrlKey, publishChangeSummary } from "./admin-controller.js";
import { createWorkbenchState, filterWorks, publishReadiness, hasUnsafeExit, transitionView } from "./workbench-state.js";
import { workRowModel, uploadRowModel, emptyStateModel, renderWorkRows, renderUploadRows, mediaUrl } from "./workbench-view.js";
import { createConfirmPanel } from "./confirm-panel.js";
import { createPreviewPanel } from "./preview-panel.js";
import { saveImageOrder as persistImageOrder } from "./image-order.js";
import { mediaAttachmentPayload } from "./media-attachment.js";
import { SortableList } from "./sortable-list.js";
import { UploadManager } from "./upload-manager.js";

const config = window.PORTFOLIO_ADMIN_CONFIG || {};
const api = new PortfolioApi({ baseUrl: config.apiBaseUrl || "" });
const drafts = new DraftStore();
const uploads = new UploadManager(api);
const MiB = 1024 * 1024;

// ── Workbench state ──
const wbState = createWorkbenchState();
let works = [];
let uploadItems = [];
let existingImages = [];
let orderSaving = false;
let currentFilters = { section: "all", status: "all", query: "" };

// ── DOM ──
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const setup = {
  login: $("[data-login]"),
  loginLink: $("[data-access-login]"),
  workspace: $("[data-workspace]"),
  accessState: $("[data-access-state]"),
  accessEmail: $("[data-access-email]"),
  signout: $("[data-signout]"),
  workBrowser: $("[data-work-browser]"),
  workEditor: $("[data-work-editor]"),
  form: $("[data-editor-form]"),
  workList: $("[data-work-list]"),
  globalFeedback: $("[data-global-feedback]"),
  editorFeedback: $("[data-editor-feedback]"),
  sectionInput: $("[data-section-input]"),
  uploadList: $("[data-upload-list]"),
  imageList: $("[data-image-list]"),
  imageOrderActions: $("[data-image-order-actions]"),
  saveImageOrder: $("[data-save-image-order]"),
  cancelImageOrder: $("[data-cancel-image-order]"),
  imageOrderFeedback: $("[data-image-order-feedback]"),
  searchInput: $("[data-search]"),
  statusFilter: $("[data-status-filter]"),
  sectionFilters: $$("[data-section-filter]"),
  newTvc: $("[data-new-tvc]"),
  newLivestream: $("[data-new-livestream]"),
  mobileActions: $("[data-mobile-actions]"),
  editorBack: $("[data-editor-back]"),
  networkState: $("[data-network-state]"),
  uploadDrawer: $("[data-upload-drawer]"),
};

// ── Panels ──
const confirmPanel = createConfirmPanel({ root: $(".confirm-panel") });
const previewPanel = createPreviewPanel({ root: $(".preview-panel") });

// ── Image sorter ──
const imageSorter = new SortableList({ root: setup.imageList, renderItem: renderImageItem });

// ── Utilities ──
function feedback(element, message = "", kind = "") {
  if (!element) return;
  element.textContent = message;
  if (kind) element.dataset.kind = kind;
  else delete element.dataset.kind;
}

function itemId() {
  return crypto.randomUUID();
}

function setEditorValue(name, value) {
  const input = setup.form.elements[name];
  if (input && value !== undefined && value !== null) input.value = value;
}

// ── View sync ──
function syncView() {
  const isEditor = wbState.view === "editor";
  setup.workEditor.hidden = !isEditor;
  syncMobileActions();
  syncNetworkChip();
  if (!isEditor) renderWorkspace();
}

function syncMobileActions() {
  if (setup.mobileActions) {
    setup.mobileActions.hidden = wbState.view !== "editor";
  }
}

function syncNetworkChip() {
  if (!setup.networkState) return;
  const model = networkStatusModel(navigator.onLine);
  setup.networkState.textContent = model.label;
  setup.networkState.dataset.state = model.state;
}

function syncSectionFields() {
  const isLive = setup.sectionInput.value === "livestream";
  $$(".tvc-only").forEach((el) => { el.hidden = isLive; });
  $$(".livestream-only").forEach((el) => { el.hidden = !isLive; });
  if (isLive) setEditorValue("brand_name", "");
  saveDraft();
}

// ── Draft helpers ──
function formDraft() {
  const form = new FormData(setup.form);
  return {
    section: form.get("section"),
    brand_name: form.get("brand_name"),
    work_title: form.get("work_title"),
    work_type: form.get("work_type"),
    sort_order: form.get("sort_order"),
    status: form.get("status"),
    image_order: existingImages.map((img) => img.id),
  };
}

function saveDraft() {
  if (wbState.editorWorkId) {
    drafts.save(wbState.editorWorkId, formDraft());
    wbState.dirty = true;
  }
}

function restoreDraft(workId) {
  const saved = drafts.load(workId);
  if (!saved) return;
  ["section", "brand_name", "work_title", "work_type", "sort_order", "status"].forEach((name) => setEditorValue(name, saved[name]));
  existingImages = drafts.orderImages(existingImages, saved.image_order);
}

// ── Workspace rendering ──
function currentFilterState() {
  return {
    section: currentFilters.section,
    status: currentFilters.status,
    query: String(setup.searchInput?.value ?? "").trim().toLowerCase(),
  };
}

function renderWorkspace() {
  if (!setup.workList) return;
  const filters = currentFilterState();
  currentFilters = { ...filters };
  const filtered = filterWorks(works, filters);
  const total = works.length;
  const filteredCount = filtered.length;

  const activeWork = works.find((w) => w.id === wbState.editorWorkId);
  const imageCount = (activeWork?.section === "livestream" && Array.isArray(activeWork?.work_images))
    ? activeWork.work_images.length
    : 0;

  const kind = emptyStateKind({ total, filteredCount, statusFilter: filters.status, section: activeWork?.section, imageCount });

  if (kind) {
    const model = emptyStateModel(kind);
    setup.workList.replaceChildren();
    const el = document.createElement("div");
    el.className = "empty-state";
    const h3 = document.createElement("h3");
    h3.textContent = model.title;
    const p = document.createElement("p");
    p.textContent = model.hint;
    el.append(h3, p);
    setup.workList.append(el);
    feedback(setup.globalFeedback, total === 0 ? "0 个作品" : `${total} 个作品，当前筛选无结果`);
    return;
  }

  const models = filtered.map((work) => workRowModel(work));
  renderWorkRows(setup.workList, models, {
    onEdit: (id) => openEditor(id),
    onCopy: (id) => handleCopy(id),
    onPublish: (id) => handlePublish(id),
    onUnpublish: (id) => handleUnpublish(id),
    onArchive: (id) => handleArchive(id),
    onRestore: (id) => handleRestore(id),
  });
  feedback(setup.globalFeedback, `${filteredCount} 个作品`);
}

// ── Editor open/close ──
function openEditor(workId) {
  const work = workId ? works.find((w) => w.id === workId) : null;
  const isNew = !work;
  const editWork = work || createClientWork("tvc", itemId());

  wbState.dirty = false;
  wbState.activeUploadCount = uploadItems.filter((item) =>
    ["ready", "processing", "uploading", "waiting-network"].includes(item.state)
  ).length;

  transitionView(wbState, { type: "OPEN_EDITOR", workId: editWork.id });
  resetForm(editWork, isNew);
  syncView();
}

function closeEditor() {
  if (hasUnsafeExit(wbState)) {
    confirmPanel.open({
      title: "放弃修改？",
      message: "当前编辑有未保存的修改或正在进行的上传，返回列表将保留本地草稿。",
      confirmLabel: "确认返回",
      tone: "danger",
      onConfirm: () => {
        saveDraft();
        wbState.dirty = false;
        transitionView(wbState, { type: "CLOSE_EDITOR" });
        syncView();
      },
    });
  } else {
    transitionView(wbState, { type: "CLOSE_EDITOR" });
    syncView();
  }
}

function resetForm(work, isNew = false) {
  setup.form.reset();
  wbState.dirty = isNew;
  existingImages = [...(work?.work_images || [])].sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
  imageSorter.replaceServerItems(existingImages);

  setEditorValue("id", work.id);
  setEditorValue("section", work.section || "tvc");
  setEditorValue("brand_name", work.brand_name || "");
  setEditorValue("work_title", work.work_title || "");
  setEditorValue("work_type", work.work_type || "");
  setEditorValue("sort_order", work.sort_order ?? works.length);
  setEditorValue("status", work.status || "draft");

  if (!isNew) restoreDraft(work.id);

  imageSorter.setItems(existingImages);
  $("[data-editor-title]").textContent = isNew ? "新增作品" : "编辑作品";

  // Keep uploads for existing work, reset for new
  if (isNew) {
    uploadItems = [];
  }

  feedback(setup.editorFeedback);
  feedback(setup.imageOrderFeedback);
  syncSectionFields();
  syncImageOrderUi();
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
  if (!value.work_title || !value.work_type || (section === "tvc" && !value.brand_name)) {
    throw new Error("请填写所有必填展示文字。");
  }
  return value;
}

// ── Image item rendering ──
function renderImageItem({ item, index, isFirst }) {
  const row = document.createElement("article");
  row.className = "image-item";
  row.dataset.imageId = item.id;

  const image = document.createElement("img");
  image.src = mediaUrl(item);
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
  [["up", "上移", index === 0], ["down", "下移", index === existingImages.length - 1]].forEach(([direction, label, disabled]) => {
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
  setup.saveImageOrder.disabled = !dirty || orderSaving;
  setup.cancelImageOrder.disabled = !dirty || orderSaving;
}

async function saveImageOrder() {
  if (!wbState.editorWorkId || !imageSorter.dirty || orderSaving) return;
  orderSaving = true;
  syncImageOrderUi();
  feedback(setup.imageOrderFeedback, "正在保存排序…");
  try {
    existingImages = await persistImageOrder(api, wbState.editorWorkId, imageSorter);
    const work = works.find((item) => item.id === wbState.editorWorkId);
    if (work) work.work_images = existingImages;
    saveDraft();
    feedback(setup.imageOrderFeedback, "排序已保存。", "success");
  } catch (error) {
    feedback(setup.imageOrderFeedback, error.message || "排序保存失败，请稍后重试。", "error");
  } finally {
    orderSaving = false;
    syncImageOrderUi();
  }
}

function cancelImageOrder() {
  if (!imageSorter.cancel()) return;
  existingImages = imageSorter.items;
  saveDraft();
  feedback(setup.imageOrderFeedback, "已恢复到服务器排序。");
}

// ── Save (text only, no upload trigger) ──
async function handleSave(event) {
  if (event) event.preventDefault();
  feedback(setup.editorFeedback, "正在保存…");
  try {
    const desired = recordFromForm(String(setup.form.elements.status.value));
    let current = works.find((work) => work.id === wbState.editorWorkId);
    let saved;
    if (!current) {
      saved = await api.createWork({ ...desired, status: "draft" });
      works.push(saved);
      wbState.editorWorkId = saved.id;
      setEditorValue("id", saved.id);
    } else {
      saved = await api.updateWork(current.id, { ...desired, version: current.version });
    }
    // Refresh work from server
    const refreshed = await api.getWork(saved.id);
    works = works.map((w) => w.id === refreshed.id ? refreshed : w);
    wbState.dirty = false;
    feedback(setup.editorFeedback, "文字已保存。", "success");
    renderWorkspace();
  } catch (error) {
    feedback(setup.editorFeedback, error.message || "保存失败，请稍后重试。", "error");
  }
}

// ── Preview ──
async function handlePreview() {
  const current = works.find((w) => w.id === wbState.editorWorkId);
  if (!current) {
    feedback(setup.editorFeedback, "请先保存再预览。", "error");
    return;
  }

  // Build localUrls from completed uploadItems using previewLocalUrlKey scoped keys
  const localUrls = {};
  for (const item of uploadItems) {
    if (item.state !== "complete" || !item.result || !item.file) continue;
    if (item.kind === "poster") {
      localUrls[previewLocalUrlKey({ workId: current.id, kind: "poster" })] = URL.createObjectURL(item.file);
    }
    if (item.kind === "video") {
      localUrls[previewLocalUrlKey({ workId: current.id, kind: "video" })] = URL.createObjectURL(item.file);
    }
    if (item.kind === "image" && item.result) {
      const idx = uploadItems.indexOf(item);
      const key = previewLocalUrlKey({ workId: current.id, kind: "image", image: item.result, index: idx });
      localUrls[key] = URL.createObjectURL(item.file);
    }
  }

  confirmPanel.close();
  previewPanel.open({
    work: current,
    images: existingImages,
    localUrls,
  });
}

// ── Publish ──
async function handlePublish(workId) {
  const id = workId || wbState.editorWorkId;
  const work = works.find((w) => w.id === id);
  if (!work) return;

  const readiness = publishReadiness(work, uploadItems);
  if (!readiness.ready) {
    const target = workId ? setup.globalFeedback : setup.editorFeedback;
    feedback(target, `发布前需要补充：${readiness.missing.join("、")}`, "error");
    return;
  }

  let changeSummary;
  try {
    const serverWork = await api.getWork(work.id);
    changeSummary = publishChangeSummary(serverWork, work);
  } catch {
    changeSummary = ["首次发布"];
  }

  const confirmation = lifecycleConfirmation("publish", work);
  confirmation.message = `${confirmation.message}\n\n变更摘要：\n${changeSummary.map((line) => `• ${line}`).join("\n")}`;

  previewPanel.close();
  confirmPanel.close();
  confirmPanel.open({
    ...confirmation,
    onConfirm: async () => {
      try {
        const updated = await api.setWorkStatus(work, "published");
        works = works.map((w) => w.id === updated.id ? updated : w);
        wbState.dirty = false;
        renderWorkspace();
        const target = workId ? setup.globalFeedback : setup.editorFeedback;
        feedback(target, `《${updated.work_title || "作品"}》已发布。`, "success");
      } catch (error) {
        const target = workId ? setup.globalFeedback : setup.editorFeedback;
        feedback(target, error.message || "发布失败。", "error");
      }
    },
  });
}

// ── Copy ──
async function handleCopy(workId) {
  const work = works.find((w) => w.id === workId);
  if (!work) return;
  confirmPanel.close();
  confirmPanel.open({
    title: "复制作品？",
    message: `将创建《${work.work_title || "未命名作品"}》的副本作为新草稿。`,
    confirmLabel: "确认复制",
    tone: "",
    onConfirm: async () => {
      try {
        const copy = await api.createWork({
          section: work.section,
          brand_name: work.brand_name,
          work_title: `${work.work_title || "未命名作品"} 副本`,
          work_type: work.work_type,
          status: "draft",
          sort_order: works.length,
        });
        works.push(copy);
        renderWorkspace();
        feedback(setup.globalFeedback, `已创建《${copy.work_title}》副本。`, "success");
      } catch (error) {
        feedback(setup.globalFeedback, error.message || "复制失败。", "error");
      }
    },
  });
}

// ── Unpublish ──
async function handleUnpublish(workId) {
  const work = works.find((w) => w.id === workId);
  if (!work) return;
  const confirmation = lifecycleConfirmation("unpublish", work);
  confirmPanel.close();
  confirmPanel.open({
    ...confirmation,
    onConfirm: async () => {
      try {
        const updated = await api.setWorkStatus(work, "draft");
        works = works.map((w) => w.id === updated.id ? updated : w);
        renderWorkspace();
        feedback(setup.globalFeedback, `《${updated.work_title || "作品"}》已取消发布。`, "success");
      } catch (error) {
        feedback(setup.globalFeedback, error.message || "取消发布失败。", "error");
      }
    },
  });
}

// ── Archive ──
async function handleArchive(workId) {
  const work = works.find((w) => w.id === workId);
  if (!work) return;
  const confirmation = lifecycleConfirmation("archive", work);
  confirmPanel.close();
  confirmPanel.open({
    ...confirmation,
    onConfirm: async () => {
      try {
        const updated = await api.setWorkStatus(work, "archived");
        works = works.map((w) => w.id === updated.id ? updated : w);
        renderWorkspace();
        feedback(setup.globalFeedback, `《${updated.work_title || "作品"}》已归档。`, "success");
      } catch (error) {
        feedback(setup.globalFeedback, error.message || "归档失败。", "error");
      }
    },
  });
}

// ── Restore ──
async function handleRestore(workId) {
  const work = works.find((w) => w.id === workId);
  if (!work) return;
  const confirmation = lifecycleConfirmation("restore", work);
  confirmPanel.close();
  confirmPanel.open({
    ...confirmation,
    onConfirm: async () => {
      try {
        const updated = await api.setWorkStatus(work, "draft");
        works = works.map((w) => w.id === updated.id ? updated : w);
        renderWorkspace();
        feedback(setup.globalFeedback, `《${updated.work_title || "作品"}》已恢复为草稿。`, "success");
      } catch (error) {
        feedback(setup.globalFeedback, error.message || "恢复失败。", "error");
      }
    },
  });
}

// ── New work (TVC / Livestream) ──
function handleNewWork(section) {
  const id = itemId();
  const work = createClientWork(section, id);
  // Push client work locally; server creation happens on first save
  works.push(work);
  uploadItems = [];
  wbState.dirty = true;
  transitionView(wbState, { type: "OPEN_EDITOR", workId: id });
  resetForm(work, true);
  syncView();
}

// ── Upload helpers (preserved for 7B reuse; not bound to save button) ──
function addFiles(files, kind, replace = false) {
  if (replace) uploadItems = uploadItems.filter((item) => item.kind !== kind);
  for (const file of files) {
    uploadItems.push({
      id: itemId(),
      file,
      kind,
      state: "ready",
      loaded: 0,
      total: file.size,
      result: null,
      error: "",
      workId: wbState.editorWorkId,
    });
  }
  wbState.activeUploadCount = uploadItems.filter((item) =>
    ["ready", "processing", "uploading", "waiting-network"].includes(item.state)
  ).length;
  renderUploadItems();
}

function renderUploadItems() {
  if (!setup.uploadList) return;
  if (!uploadItems.length) {
    const model = emptyStateModel("uploads");
    setup.uploadList.replaceChildren();
    const el = document.createElement("div");
    el.className = "empty-state";
    const h3 = document.createElement("h3");
    h3.textContent = model.title;
    const p = document.createElement("p");
    p.textContent = model.hint;
    el.append(h3, p);
    setup.uploadList.append(el);
    return;
  }
  const models = uploadItems.map((item) => uploadRowModel(item));
  renderUploadRows(setup.uploadList, models, {
    onRetry: (id) => {
      const item = uploadItems.find((i) => i.id === id);
      if (item) uploadSelectedItem(item).catch((error) => feedback(setup.editorFeedback, error.message || "上传失败。", "error"));
    },
    onPause: (id) => {
      const item = uploadItems.find((i) => i.id === id);
      if (item) { uploads.pause(item.file, selectedContext()); renderUploadItems(); }
    },
    onResume: (id) => {
      const item = uploadItems.find((i) => i.id === id);
      if (item) {
        uploads.resume(item.file, selectedContext(), (progress) => {
          item.loaded = progress.loaded;
          item.total = progress.total;
          if (progress.state) item.state = progress.state;
          renderUploadItems();
        }).catch((error) => feedback(setup.editorFeedback, error.message || "上传失败。", "error"));
      }
    },
    onCancel: (id) => {
      const item = uploadItems.find((i) => i.id === id);
      if (item) cancelItem(item);
    },
  });
}

function selectedContext() {
  return { section: setup.form.elements.section.value, workId: wbState.editorWorkId };
}

// ── Poster variant generation (preserved for 7B) ──
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

// ── Media attachment payload (preserved for 7B) ──
function mediaFields() {
  return mediaAttachmentPayload(setup.form.elements.section.value, imageSorter.serverItems, uploadItems);
}

// ── Upload selected item (preserved for 7B) ──
async function uploadSelectedItem(item) {
  if (!wbState.editorWorkId) return;
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
    wbState.activeUploadCount = uploadItems.filter((i) =>
      ["ready", "processing", "uploading", "waiting-network"].includes(i.state)
    ).length;
    renderUploadItems();
  }
}

async function cancelItem(item) {
  item.controller?.abort();
  if (item.kind === "video") await uploads.abort(item.file, selectedContext());
  item.state = "cancelled";
  wbState.activeUploadCount = uploadItems.filter((i) =>
    ["ready", "processing", "uploading", "waiting-network"].includes(i.state)
  ).length;
  renderUploadItems();
}

// ── Load works ──
async function loadWorks() {
  feedback(setup.globalFeedback, "正在载入作品…");
  try {
    works = await api.listWorks();
    renderWorkspace();
  } catch (error) {
    feedback(setup.globalFeedback, error.message || "后台连接失败。", "error");
  }
}

// ── Boot ──
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

// ── Event wiring ──

// Section filters
setup.sectionFilters.forEach((button) => button.addEventListener("click", () => {
  currentFilters.section = button.dataset.sectionFilter;
  setup.sectionFilters.forEach((item) => item.classList.toggle("is-active", item === button));
  renderWorkspace();
}));

// Status filter
setup.statusFilter?.addEventListener("change", () => {
  currentFilters.status = setup.statusFilter.value;
  renderWorkspace();
});

// Search with debounce
let searchTimer;
setup.searchInput?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentFilters.query = setup.searchInput.value.trim().toLowerCase();
    renderWorkspace();
  }, 250);
});

// New TVC / Livestream
setup.newTvc?.addEventListener("click", () => handleNewWork("tvc"));
setup.newLivestream?.addEventListener("click", () => handleNewWork("livestream"));

// Section change
setup.sectionInput?.addEventListener("change", syncSectionFields);

// Form input → draft
setup.form?.addEventListener("input", saveDraft);

// Form submit → text-only save
setup.form?.addEventListener("submit", handleSave);

// File inputs (preserved for 7B)
setup.form?.elements.poster_file?.addEventListener("change", (event) => addFiles([...event.target.files].filter(Boolean), "poster", true));
setup.form?.elements.video_file?.addEventListener("change", (event) => addFiles([...event.target.files].filter(Boolean), "video", true));
setup.form?.elements.image_files?.addEventListener("change", (event) => addFiles([...event.target.files].filter(Boolean), "image"));

// Editor close button → closeEditor (with unsafe exit check)
$(".work-editor .close-button")?.addEventListener("click", closeEditor);

// Mobile back button
setup.editorBack?.addEventListener("click", closeEditor);

// Editor preview button
$("[data-editor-preview]")?.addEventListener("click", handlePreview);

// Editor publish button
$("[data-editor-publish]")?.addEventListener("click", () => handlePublish());

// Mobile save button
$("[data-mobile-save]")?.addEventListener("click", () => setup.form.requestSubmit());

// Mobile preview button
$("[data-mobile-preview]")?.addEventListener("click", handlePreview);

// Mobile publish button
$("[data-mobile-publish]")?.addEventListener("click", () => handlePublish());

// Image sorter events
imageSorter.addEventListener("change", (event) => {
  existingImages = event.detail.items;
  syncImageOrderUi();
  saveDraft();
});
setup.saveImageOrder?.addEventListener("click", saveImageOrder);
setup.cancelImageOrder?.addEventListener("click", cancelImageOrder);

// Network events
window.addEventListener("online", () => {
  uploads.setOnline(true);
  syncNetworkChip();
});
window.addEventListener("offline", () => {
  uploads.setOnline(false);
  syncNetworkChip();
});

// Before unload guard
window.addEventListener("beforeunload", (event) => {
  if (hasUnsafeExit(wbState)) {
    event.preventDefault();
    event.returnValue = "";
  }
});

// Initial network state
uploads.setOnline(navigator.onLine);
syncNetworkChip();

// Keep upload drawer hidden (7B placeholder)
if (setup.uploadDrawer) setup.uploadDrawer.hidden = true;

boot();
