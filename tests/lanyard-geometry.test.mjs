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

test("drag resistance approaches but never crosses the camera-safe card bounds", async () => {
  const geometry = await loadGeometry();
  assert.ok(geometry, "Lanyard geometry helpers must exist");

  const card = geometry.getCardGeometry(geometry.DESKTOP_CARD_SCALE);
  const bounds = geometry.getVisibleDragBounds({
    fov: 20,
    distance: 22,
    aspect: 1.6,
    radius: card.radius,
    margin: 0.18,
  });

  assert.ok(bounds.minY < 0 && bounds.maxY > 0);
  assert.ok(geometry.rubberBandLimit(-100, bounds.minY, bounds.maxY, 0.65) >= bounds.minY);
  assert.ok(geometry.rubberBandLimit(100, bounds.minY, bounds.maxY, 0.65) <= bounds.maxY);
});
