import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

async function loadGeometry() {
  return import(pathToFileURL(resolve(root, "livestream-react/lanyard-geometry.mjs"))).catch(() => null);
}

test("the enlarged card derives its hook joint and collision bounds from one scale", async () => {
  const geometry = await loadGeometry();
  assert.ok(geometry, "Lanyard geometry helpers must exist");

  const card = geometry.getCardGeometry(geometry.DESKTOP_CARD_SCALE);
  assert.equal(geometry.DESKTOP_CARD_SCALE, 3.06);
  assert.ok(Math.abs(card.attachmentY - 2.5618725585937503) < 1e-9);
  assert.ok(Math.abs(card.colliderTop - card.attachmentY) < 1e-9);
  assert.ok(card.radius > 2.7 && card.radius < 2.9);
});

test("desktop drag keeps the pointer target unrestricted", async () => {
  const geometry = await loadGeometry();
  assert.ok(geometry, "Lanyard geometry helpers must exist");

  const target = geometry.getDragTarget(
    { x: 120, y: -85, z: 12 },
    { x: 3, y: -5, z: 2 },
  );

  assert.deepEqual(target, { x: 117, y: -80, z: 10 });
});

test("desktop anchor touches the top edge while the card hangs at page center", async () => {
  const geometry = await loadGeometry();
  assert.ok(geometry, "Lanyard geometry helpers must exist");

  const card = geometry.getCardGeometry(geometry.DESKTOP_CARD_SCALE);
  const layout = geometry.getDesktopLayout(card);

  assert.equal(layout.anchorY, 3.82);
  assert.ok(Math.abs(layout.cardBodyY + card.colliderCenterY) < 1e-9);
  assert.ok(Math.abs(layout.jointY - (layout.cardBodyY + card.attachmentY)) < 1e-9);
});

test("mobile card scale fills the same content width as the About copy", async () => {
  const geometry = await loadGeometry();
  assert.ok(geometry, "Lanyard geometry helpers must exist");

  assert.equal(geometry.MOBILE_CARD_SCALE, 6.2);
  const card = geometry.getCardGeometry(geometry.MOBILE_CARD_SCALE);
  const visibleWidth = 2 * Math.tan((20 * Math.PI) / 360) * 22 * 0.6;
  assert.ok((card.halfWidth * 2) / visibleWidth > 0.94);
});
