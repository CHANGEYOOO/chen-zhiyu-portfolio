export const DESKTOP_CARD_SCALE = 3.06;
export const MOBILE_CARD_SCALE = 6.2;

const CARD_MESH_OFFSET_Y = -1.2;
const CARD_HALF_WIDTH = 0.35820895433425903;
const CARD_BOTTOM_Y = 0.02290511131286621;
const CARD_PHOTO_TOP_Y = 1.0229052305221558;
const CARD_HOOK_TOP_Y = 1.2293701171875;

export function getCardGeometry(scale) {
  const halfWidth = CARD_HALF_WIDTH * scale;
  const colliderBottom = CARD_MESH_OFFSET_Y + CARD_BOTTOM_Y * scale;
  const attachmentY = CARD_MESH_OFFSET_Y + CARD_HOOK_TOP_Y * scale;
  const colliderHalfHeight = (attachmentY - colliderBottom) / 2;
  const colliderCenterY = colliderBottom + colliderHalfHeight;
  const photoCenterY = CARD_MESH_OFFSET_Y + ((CARD_BOTTOM_Y + CARD_PHOTO_TOP_Y) / 2) * scale;
  const radius = Math.hypot(halfWidth, Math.max(Math.abs(colliderBottom), Math.abs(attachmentY)));

  return {
    attachmentY,
    colliderBottom,
    colliderCenterY,
    colliderHalfHeight,
    colliderTop: attachmentY,
    halfWidth,
    photoCenterY,
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

export function getLanyardPlacement(
  cardGeometry,
  { fov = 20, distance = 22, photoTargetRatio = 0.44 } = {},
) {
  const viewHalfHeight = Math.tan((fov * Math.PI) / 360) * distance;
  const photoTargetY = viewHalfHeight * (1 - photoTargetRatio * 2);
  const cardBodyY = photoTargetY - cardGeometry.photoCenterY;
  const jointY = cardBodyY + cardGeometry.attachmentY;
  const segmentLength = 1;
  const anchorY = jointY + segmentLength * 3;
  return {
    anchorY,
    cardBodyY,
    jointY,
    segmentLength,
    segmentYs: [
      anchorY - segmentLength,
      anchorY - segmentLength * 2,
    ],
  };
}

export function getLanyardPhysics(isMobile) {
  return {
    angularDamping: 4,
    curvePoints: isMobile ? 16 : 32,
    linearDamping: 4,
    maxSpeed: 50,
    minSpeed: 0,
    timeStep: isMobile ? 1 / 30 : 1 / 60,
  };
}
