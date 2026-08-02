/* Optional published-content adapter. Leave the URL empty to keep the bundled fallback data. */
const defaultPublicApiUrl = "https://api.kjoe.top/api/public/works";
const configuredPublicApiUrl = window.PORTFOLIO_PUBLIC_API_URL;

function text(value) {
  return typeof value === "string" ? value : "";
}

function mediaUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "media.kjoe.top" ? value : "";
  } catch {
    return "";
  }
}

function dimensionsFor(image) {
  return Number.isInteger(image.width) && image.width > 0 && Number.isInteger(image.height) && image.height > 0
    ? [image.width, image.height]
    : undefined;
}

function imageName(url) {
  return new URL(url).pathname.split("/").pop() || "项目图片";
}

function normalizeLivestreamImages(images, imageDimensions) {
  if (!Array.isArray(images)) return [];
  return images
    .slice()
    .sort((first, second) => Number(first?.sort_order) - Number(second?.sort_order))
    .reduce((normalized, image) => {
      const url = mediaUrl(image?.image_url);
      if (!url) return normalized;
      const dimensions = dimensionsFor(image);
      if (dimensions) imageDimensions[url] = dimensions;
      normalized.push({ url, dimensions, name: imageName(url) });
      return normalized;
    }, []);
}

window.PORTFOLIO_CONTENT = {
  publicApiUrl: typeof configuredPublicApiUrl === "string" ? configuredPublicApiUrl : defaultPublicApiUrl,
  async loadPublished() {
    if (!this.publicApiUrl) return null;
    try {
      const response = await fetch(this.publicApiUrl, { headers: { Accept: "application/json" } });
      if (!response.ok) return null;
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.works)) return null;
      const imageDimensions = {};
      const tvc = [];
      const livestream = [];

      payload.works.forEach((work) => {
        if (!work || typeof work !== "object") return;
        if (work.section === "tvc") {
          const id = text(work.id);
          const poster = mediaUrl(work.poster_url);
          if (!id || !poster) return;
          tvc.push({
            id,
            brand: text(work.brand_name),
            title: text(work.work_title),
            category: text(work.work_type),
            poster,
            video: mediaUrl(work.video_url),
          });
          return;
        }
        if (work.section === "livestream") {
          const id = text(work.id);
          if (!id) return;
          const images = normalizeLivestreamImages(work.work_images, imageDimensions);
          if (!images.length) return;
          livestream.push({
            id,
            title: text(work.work_title),
            category: text(work.work_type),
            directory: id,
            images,
          });
        }
      });

      if (!tvc.length && !livestream.length) return null;
      return { tvc, livestream, imageDimensions };
    } catch {
      return null;
    }
  },
};
