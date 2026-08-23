export const DESKTOP_CARD_SCALE = 3.06;

const CARD_MESH_OFFSET_Y = -1.2;
const CARD_HALF_WIDTH = 0.35820895433425903;
const CARD_BOTTOM_Y = 0.02290511131286621;
const CARD_HOOK_TOP_Y = 1.2293701171875;

export function getCardGeometry(scale) {
  const halfWidth = CARD_HALF_WIDTH * scale;
  const colliderBottom = CARD_MESH_OFFSET_Y + CARD_BOTTOM_Y * scale;
  const attachmentY = CARD_MESH_OFFSET_Y + CARD_HOOK_TOP_Y * scale;
  const colliderHalfHeight = (attachmentY - colliderBottom) / 2;
  const colliderCenterY = colliderBottom + colliderHalfHeight;
  const radius = Math.hypot(halfWidth, Math.max(Math.abs(colliderBottom), Math.abs(attachmentY)));

  return {
    attachmentY,
    colliderBottom,
    colliderCenterY,
    colliderHalfHeight,
    colliderTop: attachmentY,
    halfWidth,
    radius,
  };
}

export function getVisibleDragBounds({ fov, distance, aspect, radius, margin }) {
  const verticalHalf = Math.tan((fov * Math.PI) / 360) * distance;
  const horizontalHalf = verticalHalf * aspect;
  return {
    minX: -horizontalHalf + radius + margin,
    maxX: horizontalHalf - radius - margin,
    minY: -verticalHalf + radius + margin,
    maxY: verticalHalf - radius - margin,
  };
}

export function rubberBandLimit(value, min, max, zone) {
  if (min >= max) return (min + max) / 2;
  const innerMin = min + zone;
  const innerMax = max - zone;
  if (value < innerMin) {
    return innerMin - zone * (1 - Math.exp(-(innerMin - value) / zone));
  }
  if (value > innerMax) {
    return innerMax + zone * (1 - Math.exp(-(value - innerMax) / zone));
  }
  return value;
}
