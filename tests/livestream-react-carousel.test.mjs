import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCarouselItems, countLivestreamImages } from "../livestream-react/model.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const projects = JSON.parse(readFileSync(resolve(root, "assets/data/livestream-projects.json"), "utf8"));
const dimensions = JSON.parse(readFileSync(resolve(root, "assets/data/livestream-image-dimensions.json"), "utf8"));
const main = readFileSync(resolve(root, "livestream-react/main.jsx"), "utf8");

test("mounts one CircularGallery per project", () => {
  assert.match(main, /import CircularGallery from "\.\/CircularGallery\.jsx"/);
  assert.match(main, /<CircularGallery[\s\S]*buildCarouselItems\(project, imageDimensions\)/);
});

test("builds one React carousel item per source image in source order", () => {
  const items = buildCarouselItems(projects[0], dimensions);

  assert.equal(items.length, projects[0].images.length);
  assert.deepEqual(items.map((item) => item.image.split("/").pop()), projects[0].images);
  assert.deepEqual(items[0].dimensions, [937, 512]);
  assert.equal(items[0].aspectRatio, 937 / 512);
});

test("keeps the complete livestream dataset at eight projects and 55 images", () => {
  assert.equal(projects.length, 8);
  assert.equal(countLivestreamImages(projects), 55);
});
