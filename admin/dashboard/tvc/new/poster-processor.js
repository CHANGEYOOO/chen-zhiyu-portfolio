export const POSTER_OUTPUTS = Object.freeze({
  desktop: Object.freeze({ width: 1600, height: 900 }),
  mobile: Object.freeze({ width: 960, height: 540 }),
});

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function validatePosterSource({ type, size, width, height }) {
  if (!ACCEPTED_TYPES.has(type)) throw new TypeError("Poster must be a JPEG, PNG, or WebP image");
  if (!Number.isFinite(size) || size <= 0 || size > MAX_SOURCE_BYTES) throw new TypeError("Poster must be no larger than 20 MiB");
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1600 || height < 900) {
    throw new TypeError("Poster must be at least 1600 × 900 pixels");
  }
  if (Math.abs(width / height / (16 / 9) - 1) > 0.01) throw new TypeError("Poster must use a 16:9 ratio");
}

async function createVariant(bitmap, variant, target, adapters) {
  const canvas = adapters.createCanvas(target.width, target.height);
  const context = canvas.getContext("2d");
  const scale = Math.max(target.width / bitmap.width, target.height / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  context.drawImage(bitmap, (target.width - drawWidth) / 2, (target.height - drawHeight) / 2, drawWidth, drawHeight);
  const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.86 });
  return { variant, width: target.width, height: target.height, type: blob.type, blob };
}

export async function createPosterVariants(file, adapters = {
  createImageBitmap: globalThis.createImageBitmap,
  createCanvas(width, height) { return new OffscreenCanvas(width, height); },
}) {
  const bitmap = await adapters.createImageBitmap(file);
  try {
    return await Promise.all(Object.entries(POSTER_OUTPUTS).map(([variant, target]) => createVariant(bitmap, variant, target, adapters)));
  } finally {
    bitmap.close?.();
  }
}
