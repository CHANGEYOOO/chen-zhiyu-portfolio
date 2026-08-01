/* Optional published-content adapter. Leave the URL empty to keep the bundled fallback data. */
window.PORTFOLIO_CONTENT = {
  publicApiUrl: "",
  async loadPublished() {
    if (!this.publicApiUrl) return null;
    const response = await fetch(this.publicApiUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Published works request failed: ${response.status}`);
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : payload.works || [];
    const dimensions = payload.imageDimensions || {};
    return {
      tvc: rows.filter((row) => row.section === "tvc" && row.status === "published").map((row) => ({
        id: row.id,
        brand: row.brand_name || "",
        title: row.work_title || "",
        category: row.work_type || "",
        poster: row.poster_url || "",
        video: row.video_url || "",
      })),
      livestream: rows.filter((row) => row.section === "livestream" && row.status === "published").map((row) => ({
        id: row.id,
        title: row.work_title || "",
        category: row.work_type || "",
        directory: row.id,
        images: (row.work_images || []).sort((a, b) => a.sort_order - b.sort_order).map((image) => ({
          url: image.image_url,
          dimensions: image.width && image.height ? [image.width, image.height] : dimensions[image.image_url],
          name: image.image_url.split("/").pop() || "项目图片",
        })),
      })),
      imageDimensions: dimensions,
    };
  },
};
