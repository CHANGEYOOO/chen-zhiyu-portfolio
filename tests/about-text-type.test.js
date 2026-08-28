const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const script = readFileSync(path.join(root, "script.js"), "utf8");
const reactEntry = readFileSync(path.join(root, "livestream-react", "main.jsx"), "utf8");
const textType = readFileSync(path.join(root, "livestream-react", "TextType.jsx"), "utf8");

test("About types its non-name copy on visibility while preserving the static name", () => {
  const aboutMarkup = html.match(/<section class="about"[\s\S]*?<\/section>\s*<section class="content-section contact"/)[0];

  assert.match(aboutMarkup, /data-text-type/);
  assert.doesNotMatch(aboutMarkup.match(/<h3 class="about-name"[\s\S]*?<\/h3>/)[0], /data-text-type/);
  assert.match(script, /mountTextType/);
  assert.match(reactEntry, /import TextType from "\.\/TextType\.jsx"/);
});

test("Contact types every copy surface without replacing its Stroke Text title", () => {
  const contactMarkup = html.match(/<section class="content-section contact"[\s\S]*?<\/section>/)[0];

  assert.match(contactMarkup, /class="eyebrow section-heading-label" data-text-type/);
  assert.match(contactMarkup, /class="section-heading-description" data-text-type/);
  assert.match(contactMarkup, /class="contact-role" data-text-type/);
  assert.match(contactMarkup, /class="contact-feedback"[^>]* data-text-type/);
  assert.match(contactMarkup, /id="contact-title"><span data-stroke-heading>CONTACT<\/span>/);
  assert.doesNotMatch(contactMarkup.match(/id="contact-title"[\s\S]*?<\/h2>/)[0], /data-text-type/);
});

test("About TextType resets after leaving the viewport so reverse scrolling replays it", () => {
  assert.match(textType, /setVisible\(entry\.isIntersecting\)/);
  assert.match(textType, /if \(entry\.isIntersecting\) setCount\(0\)/);
  assert.doesNotMatch(textType, /setVisible\(true\);\s*observer\.disconnect\(\);/);
});
