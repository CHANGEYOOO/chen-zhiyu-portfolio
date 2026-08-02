const MEDIA_BASE = "https://media.kjoe.top/";

function sectionLabel(section) {
  return section === "livestream" ? "直播间" : "TVC";
}

function composeMediaUrl(key) {
  return `${MEDIA_BASE}${key.split("/").map(encodeURIComponent).join("/")}`;
}

// localUrls maps a media slot to a blob URL created by the caller. Stable
// scoped keys win: `${work.id}:poster`, `${work.id}:video`, and
// `${work.id}:image:${image.id ?? image.sort_order ?? index}`. Legacy keys
// (the media source string, i.e. the file name for local files) remain as a
// fallback for callers without a stable work/image scope.
function resolvePoster(work, localUrls) {
  if (!work) return "";
  if (work.id && localUrls[`${work.id}:poster`]) return localUrls[`${work.id}:poster`];
  if (work.poster_url && localUrls[work.poster_url]) return localUrls[work.poster_url];
  if (work.poster_url) return work.poster_url;
  if (work.poster_key) return composeMediaUrl(work.poster_key);
  return "";
}

function resolveVideo(work, localUrls) {
  if (!work) return "";
  if (work.id && localUrls[`${work.id}:video`]) return localUrls[`${work.id}:video`];
  if (work.video_url && localUrls[work.video_url]) return localUrls[work.video_url];
  if (work.video_url) return work.video_url;
  if (work.video_key) return composeMediaUrl(work.video_key);
  return "";
}

function resolveImage(image, localUrls, workId, index) {
  if (!image) return "";
  const scopeKey = workId ? `${workId}:image:${image.id ?? image.sort_order ?? index}` : "";
  if (scopeKey && localUrls[scopeKey]) return localUrls[scopeKey];
  if (image.image_url && localUrls[image.image_url]) return localUrls[image.image_url];
  if (image.image_url) return image.image_url;
  if (image.image_key) return composeMediaUrl(image.image_key);
  return "";
}

function orderedImages(images) {
  return [...images].sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
}

function element(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function createPreviewPanel({ root }) {
  const body = root.querySelector("[data-preview-body]");
  const closeButton = root.querySelector("[data-preview-close]");
  const heading = root.querySelector("[data-preview-heading]");

  let opener = null;

  function handleKeydown(event) {
    if (event.key === "Escape") close();
  }

  function renderTvcCover(work, title, localUrls) {
    const src = resolvePoster(work, localUrls);
    if (!src) {
      const empty = element("div", "preview-cover preview-empty");
      empty.textContent = "暂无封面";
      return empty;
    }
    const cover = element("img", "preview-cover");
    cover.src = src;
    cover.alt = `《${title}》封面`;
    return cover;
  }

  function renderVideo(work, localUrls) {
    const src = resolveVideo(work, localUrls);
    if (!src) return null;
    const video = element("video", "preview-video");
    video.src = src;
    video.controls = true;
    video.preload = "metadata";
    return video;
  }

  function renderLiveCover(work, first, title, localUrls) {
    const src = resolveImage(first, localUrls, work?.id, 0);
    if (!src) {
      const empty = element("div", "preview-cover preview-empty");
      empty.textContent = "暂无封面";
      return empty;
    }
    const figure = element("figure", "preview-cover-figure");
    const cover = element("img", "preview-cover");
    cover.src = src;
    cover.alt = `《${title}》封面`;
    const label = element("figcaption", "preview-cover-label");
    label.textContent = "封面";
    figure.append(cover, label);
    return figure;
  }

  function renderGallery(work, ordered, title, localUrls) {
    const gallery = element("div", "preview-gallery");
    ordered.forEach((image, index) => {
      const src = resolveImage(image, localUrls, work?.id, index);
      if (!src) return;
      const img = element("img", "preview-gallery-image");
      img.src = src;
      img.alt = `《${title}》图片 ${index + 1}`;
      img.loading = "lazy";
      gallery.append(img);
    });
    return gallery;
  }

  function render(work, images, localUrls) {
    if (!body) return;
    const isLive = work?.section === "livestream";
    const title = work?.work_title || "未命名作品";
    const list = Array.isArray(images) ? images : work?.work_images || [];
    const ordered = orderedImages(list);

    const meta = element("div", "preview-meta");
    const section = element("p", "preview-section");
    section.textContent = sectionLabel(work?.section);
    const workTitle = element("h3", "preview-work-title");
    workTitle.textContent = title;
    const facts = element("p", "preview-facts");
    const brand = String(work?.brand_name || "").trim();
    const type = String(work?.work_type || "").trim();
    facts.textContent = isLive ? type : [brand, type].filter(Boolean).join(" · ");
    meta.append(section, workTitle, facts);

    const cover = isLive ? renderLiveCover(work, ordered[0], title, localUrls) : renderTvcCover(work, title, localUrls);
    const video = isLive ? null : renderVideo(work, localUrls);
    const gallery = isLive && ordered.length > 0 ? renderGallery(work, ordered, title, localUrls) : null;
    body.replaceChildren(...[meta, cover, video, gallery].filter(Boolean));
  }

  function open({ work = {}, images, localUrls = {} }) {
    opener = document.activeElement;
    render(work, images, localUrls);
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    if (heading?.id) root.setAttribute("aria-labelledby", heading.id);
    root.hidden = false;
    document.removeEventListener("keydown", handleKeydown);
    document.addEventListener("keydown", handleKeydown);
    closeButton?.focus?.();
  }

  function close() {
    if (root.hidden) return;
    root.hidden = true;
    document.removeEventListener("keydown", handleKeydown);
    const restore = opener;
    opener = null;
    if (restore && typeof restore.focus === "function") restore.focus();
  }

  closeButton?.addEventListener("click", close);

  return { open, close };
}
