export const DESKTOP_CARD_SCALE = 3.06;
export const MOBILE_CARD_SCALE = 6.2;
const DESKTOP_ANCHOR_Y = 3.82;

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

export function getDragTarget(point, offset) {
  return {
    x: point.x - offset.x,
    y: point.y - offset.y,
    z: point.z - offset.z,
  };
}

export function getDesktopLayout(cardGeometry) {
  const cardBodyY = -cardGeometry.colliderCenterY;
  const jointY = cardBodyY + cardGeometry.attachmentY;
  const ropeDrop = DESKTOP_ANCHOR_Y - jointY;
  return {
    anchorY: DESKTOP_ANCHOR_Y,
    cardBodyY,
    jointY,
    segmentYs: [
      DESKTOP_ANCHOR_Y - ropeDrop / 3,
      DESKTOP_ANCHOR_Y - (ropeDrop * 2) / 3,
    ],
  };
}
