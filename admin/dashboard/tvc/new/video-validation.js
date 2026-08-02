const VIDEO_TYPES = new Map([
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
]);

export const VIDEO_LIMITS = Object.freeze({
  maxBytes: 2 * 1024 ** 3,
  maxLongEdge: 1920,
  maxShortEdge: 1080,
});

function fileExtension(name) {
  const match = typeof name === "string" && name.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] || "";
}

export function validateVideoFile(file, metadata) {
  const expectedExtension = VIDEO_TYPES.get(file?.type?.toLowerCase());
  if (!expectedExtension) throw new TypeError("Video files must be MP4 or WebM");
  if (fileExtension(file.name) !== expectedExtension) throw new TypeError("Video filename and MIME type must match");
  if (!Number.isFinite(file.size) || file.size <= 0) throw new TypeError("Video file must not be empty");
  if (file.size > VIDEO_LIMITS.maxBytes) throw new RangeError("Video files must not exceed 2 GiB");

  const width = metadata?.width;
  const height = metadata?.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new TypeError("Video metadata could not be read");
  }
  if (Math.max(width, height) > VIDEO_LIMITS.maxLongEdge || Math.min(width, height) > VIDEO_LIMITS.maxShortEdge) {
    throw new RangeError("Video must fit inside the 1080p (1920 × 1080) envelope");
  }
}

export function videoFingerprint(file) {
  return {
    name: file?.name,
    size: file?.size,
    type: file?.type,
    lastModified: file?.lastModified,
  };
}

export function sameFingerprint(left, right) {
  return Boolean(left && right
    && left.name === right.name
    && left.size === right.size
    && left.type === right.type
    && left.lastModified === right.lastModified);
}
