export function mediaAttachmentPayload(section, existingImages, uploadItems) {
  if (section === "livestream") {
    const uploaded = uploadItems.filter((item) => item.kind === "image" && item.result)
      .map((item) => ({ image_key: item.result.key, width: item.result.width, height: item.result.height }));
    if (!uploaded.length) return {};
    return {
      work_images: [...existingImages.map(({ image_key, width, height }) => ({ image_key, width, height })), ...uploaded]
        .map((image, sort_order) => ({ ...image, sort_order })),
    };
  }
  const poster = uploadItems.find((item) => item.kind === "poster" && item.result)?.result;
  const video = uploadItems.find((item) => item.kind === "video" && item.result)?.result;
  return {
    ...(poster?.desktop?.key ? { poster_key: poster.desktop.key, poster_mobile_key: poster.mobile?.key || null } : {}),
    ...(video?.key ? { video_key: video.key } : {}),
  };
}
