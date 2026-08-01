import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.PORTFOLIO_ADMIN_CONFIG;
const setup = document.querySelector("[data-setup]");
const login = document.querySelector("[data-login]");
const workspace = document.querySelector("[data-workspace]");
const editor = document.querySelector("[data-editor]");
const editorForm = document.querySelector("[data-editor-form]");
const workList = document.querySelector("[data-work-list]");
const signout = document.querySelector("[data-signout]");
const globalFeedback = document.querySelector("[data-global-feedback]");
const loginFeedback = document.querySelector("[data-login-feedback]");
const editorFeedback = document.querySelector("[data-editor-feedback]");
const sectionInput = editorForm?.elements.section;
const imageList = document.querySelector("[data-image-list]");

const state = {
  client: null,
  works: [],
  filter: "all",
  editorImages: [],
  editorWorkId: "",
};

function feedback(element, message = "", kind = "") {
  if (!element) return;
  element.textContent = message;
  if (kind) element.dataset.kind = kind;
  else delete element.dataset.kind;
}

function hasConfig() {
  return Boolean(config?.supabaseUrl && config?.supabaseAnonKey && !config.supabaseUrl.includes("你的项目"));
}

function statusLabel(status) {
  return { draft: "草稿", published: "已发布", archived: "已归档" }[status] || status;
}

function sectionLabel(section) {
  return section === "livestream" ? "直播间" : "TVC";
}

function safeFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "upload";
}

function isAllowedImage(file, maxBytes) {
  return ["image/webp", "image/jpeg", "image/png"].includes(file.type) && file.size <= maxBytes;
}

function resetForm(work = null) {
  editorForm.reset();
  state.editorWorkId = work?.id || crypto.randomUUID();
  state.editorImages = [...(work?.work_images || [])].sort((a, b) => a.sort_order - b.sort_order);
  editorForm.elements.id.value = state.editorWorkId;
  editorForm.elements.section.value = work?.section || "tvc";
  editorForm.elements.brand_name.value = work?.brand_name || "";
  editorForm.elements.work_title.value = work?.work_title || "";
  editorForm.elements.work_type.value = work?.work_type || "";
  editorForm.elements.video_url.value = work?.video_url || "";
  editorForm.elements.poster_url.value = work?.poster_url || "";
  editorForm.elements.sort_order.value = work?.sort_order ?? state.works.length;
  editorForm.elements.status.value = work?.status || "draft";
  document.querySelector("[data-editor-title]").textContent = work ? "编辑作品" : "新增作品";
  feedback(editorFeedback);
  syncSectionFields();
  renderImageList();
}

function syncSectionFields() {
  const isLive = sectionInput.value === "livestream";
  document.querySelectorAll(".tvc-only").forEach((element) => { element.hidden = isLive; });
  document.querySelector(".livestream-only").hidden = !isLive;
  if (isLive) editorForm.elements.brand_name.value = "";
}

function renderImageList() {
  if (!imageList) return;
  imageList.replaceChildren();
  state.editorImages.forEach((image, index) => {
    const item = document.createElement("div");
    item.className = "image-item";
    const img = document.createElement("img");
    img.src = image.image_url;
    img.alt = `项目图片 ${index + 1}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `移除项目图片 ${index + 1}`);
    remove.addEventListener("click", () => {
      state.editorImages.splice(index, 1);
      renderImageList();
    });
    item.append(img, remove);
    imageList.append(item);
  });
}

async function uploadFile(file, workId, kind) {
  const maxBytes = kind === "poster" ? 10 * 1024 * 1024 : 20 * 1024 * 1024;
  if (!isAllowedImage(file, maxBytes)) {
    throw new Error(`${kind === "poster" ? "封面" : "项目图片"}必须是 webp、jpg 或 png，且不超过 ${kind === "poster" ? "10" : "20"} MB。`);
  }
  const path = `${sectionInput.value}/${workId}/${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await state.client.storage.from("portfolio-media").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  const { data } = state.client.storage.from("portfolio-media").getPublicUrl(path);
  return data.publicUrl;
}

async function loadWorks() {
  feedback(globalFeedback, "正在载入作品…");
  const { data, error } = await state.client.from("works").select("*, work_images(*)").order("section").order("sort_order");
  if (error) throw error;
  state.works = data || [];
  renderWorks();
  feedback(globalFeedback, `${state.works.length} 个作品`);
}

function renderWorks() {
  workList.replaceChildren();
  const filtered = state.works.filter((work) => state.filter === "all" || work.section === state.filter);
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "form-feedback";
    empty.textContent = "还没有符合条件的作品。";
    workList.append(empty);
    return;
  }
  filtered.forEach((work) => {
    const row = document.createElement("article");
    row.className = "work-row";
    const image = document.createElement("img");
    image.src = work.poster_url;
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
    [
      ["编辑", () => { resetForm(work); editor.showModal(); }],
      ["复制", () => { resetForm({ ...work, id: "", status: "draft", work_title: `${work.work_title} 副本`, work_images: work.work_images || [] }); editor.showModal(); }],
    ].forEach(([label, handler]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("click", handler);
      actions.append(button);
    });
    row.append(image, info, actions);
    workList.append(row);
  });
}

async function saveWork(event) {
  event.preventDefault();
  feedback(editorFeedback, "正在保存…");
  const form = new FormData(editorForm);
  const section = form.get("section");
  const workId = form.get("id");
  const posterFile = form.get("poster_file");
  const imageFiles = [...(form.get("image_files") ? form.getAll("image_files") : [])].filter((file) => file.size);
  try {
    let posterUrl = String(form.get("poster_url") || "").trim();
    if (posterFile?.size) posterUrl = await uploadFile(posterFile, workId, "poster");
    if (!posterUrl) throw new Error("请上传封面或填写封面地址。");
    const record = {
      id: workId,
      section,
      brand_name: section === "tvc" ? String(form.get("brand_name") || "").trim() : null,
      work_title: String(form.get("work_title") || "").trim(),
      work_type: String(form.get("work_type") || "").trim(),
      poster_url: posterUrl,
      video_url: section === "tvc" ? String(form.get("video_url") || "").trim() || null : null,
      sort_order: Number(form.get("sort_order") || 0),
      status: form.get("status"),
    };
    if (!record.work_title || !record.work_type || (section === "tvc" && !record.brand_name)) throw new Error("请填写所有必填展示文字。");
    const { error } = await state.client.from("works").upsert(record);
    if (error) throw error;
    if (section === "livestream" && imageFiles.length) {
      const uploaded = [];
      for (const [index, file] of imageFiles.entries()) uploaded.push({ image_url: await uploadFile(file, workId, "project"), sort_order: state.editorImages.length + index });
      state.editorImages.push(...uploaded);
    }
    const { error: deleteError } = await state.client.from("work_images").delete().eq("work_id", workId);
    if (deleteError) throw deleteError;
    if (section === "livestream" && state.editorImages.length) {
      const images = state.editorImages.map((image, index) => ({ work_id: workId, image_url: image.image_url, sort_order: index }));
      const { error: imageError } = await state.client.from("work_images").insert(images);
      if (imageError) throw imageError;
    }
    editor.close();
    await loadWorks();
    feedback(globalFeedback, "已保存", "success");
  } catch (error) {
    feedback(editorFeedback, error.message || "保存失败，请稍后重试。", "error");
  }
}

async function boot() {
  if (!hasConfig()) {
    setup.hidden = false;
    return;
  }
  state.client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  const { data: { session } } = await state.client.auth.getSession();
  if (!session) {
    login.hidden = false;
    return;
  }
  workspace.hidden = false;
  signout.hidden = false;
  await loadWorks();
}

document.querySelector("[data-login-form]")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  feedback(loginFeedback, "正在登录…");
  const form = new FormData(event.currentTarget);
  const { error } = await state.client.auth.signInWithPassword({ email: form.get("email"), password: form.get("password") });
  if (error) { feedback(loginFeedback, error.message, "error"); return; }
  login.hidden = true;
  workspace.hidden = false;
  signout.hidden = false;
  await loadWorks();
});

signout?.addEventListener("click", async () => {
  await state.client.auth.signOut();
  window.location.reload();
});

document.querySelectorAll("[data-section-filter]").forEach((button) => button.addEventListener("click", () => {
  state.filter = button.dataset.sectionFilter;
  document.querySelectorAll("[data-section-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
  renderWorks();
}));

document.querySelector("[data-new-work]")?.addEventListener("click", () => { resetForm(); editor.showModal(); });
sectionInput?.addEventListener("change", syncSectionFields);
editorForm?.addEventListener("submit", saveWork);
document.querySelector(".close-button")?.addEventListener("click", () => editor.close());
editor?.addEventListener("close", () => feedback(editorFeedback));

boot().catch((error) => feedback(globalFeedback, error.message || "后台连接失败。", "error"));
