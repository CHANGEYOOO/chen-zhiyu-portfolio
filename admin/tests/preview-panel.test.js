import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewPanel } from "../preview-panel.js";

const MEDIA_BASE = "https://media.kjoe.top/";

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.style = {};
    this.className = "";
    this.textContent = "";
    this.hidden = false;
    this.id = "";
    this.src = "";
    this.alt = "";
    this.type = "";
    this.controls = false;
    this.preload = "";
    this.loading = "";
  }

  append(...nodes) {
    this.children.push(...nodes);
    return this;
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "id") this.id = String(value);
  }

  getAttribute(name) {
    return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
  }

  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  }

  focus() {
    document.activeElement = this;
  }

  click() {
    (this.listeners.click || []).forEach((listener) => listener({}));
  }

  querySelector(selector) {
    const find = (node) => {
      if (node.matches(selector)) return node;
      for (const child of node.children) {
        const found = find(child);
        if (found) return found;
      }
      return null;
    };
    return find(this);
  }

  matches(selector) {
    if (selector.startsWith("[") && selector.endsWith("]")) {
      return Object.hasOwn(this.attributes, selector.slice(1, -1));
    }
    return false;
  }

  set innerHTML(value) {
    throw new Error("HTML string rendering is forbidden");
  }
}

const fakeDocument = {
  activeElement: null,
  listeners: {},
  createElement(tagName) {
    return new FakeElement(tagName);
  },
  addEventListener(type, listener) {
    (this.listeners[type] ||= []).push(listener);
  },
  removeEventListener(type, listener) {
    const list = this.listeners[type];
    if (!list) return;
    const index = list.indexOf(listener);
    if (index >= 0) list.splice(index, 1);
  },
  keydown(key) {
    (this.listeners.keydown || []).forEach((listener) => listener({ key }));
  },
};

const originalDocument = globalThis.document;
function withFakeDom(run) {
  globalThis.document = fakeDocument;
  fakeDocument.listeners = {};
  fakeDocument.activeElement = null;
  try {
    return run();
  } finally {
    globalThis.document = originalDocument;
  }
}

function buildRoot() {
  const root = new FakeElement("div");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.hidden = true;

  const card = new FakeElement("div");
  card.className = "panel-card";

  const head = new FakeElement("div");
  head.className = "panel-head";
  const heading = new FakeElement("h2");
  heading.setAttribute("id", "preview-title");
  heading.setAttribute("data-preview-heading", "");
  const close = new FakeElement("button");
  close.setAttribute("data-preview-close", "");
  head.append(heading, close);

  const body = new FakeElement("div");
  body.setAttribute("data-preview-body", "");

  card.append(head, body);
  root.append(card);
  return { root, heading, close, body };
}

function find(className, node) {
  const walk = (current) => {
    if (current.className === className) return current;
    for (const child of current.children) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk(node);
}

function findAll(className, node) {
  const found = [];
  const walk = (current) => {
    if (current.className === className) found.push(current);
    current.children.forEach(walk);
  };
  walk(node);
  return found;
}

test("TVC preview shows the poster as the first cover and an ordered read-only view", () => {
  withFakeDom(() => {
    const { root, body } = buildRoot();
    const panel = createPreviewPanel({ root });
    const work = {
      section: "tvc",
      brand_name: "KJOE",
      work_title: "夜晚航线",
      work_type: "品牌片",
      poster_url: "https://media.kjoe.top/tvc/poster.webp",
      video_url: "https://media.kjoe.top/tvc/clip.mp4",
    };

    panel.open({ work, images: [], localUrls: {} });

    assert.equal(root.hidden, false);
    const cover = find("preview-cover", body);
    assert.equal(cover.src, work.poster_url);
    assert.equal(cover.alt, "《夜晚航线》封面");
    const video = find("preview-video", body);
    assert.equal(video.src, work.video_url);
    assert.equal(video.controls, true);
    const facts = find("preview-facts", body);
    assert.equal(facts.textContent, "KJOE · 品牌片");
    assert.equal(findAll("preview-gallery-image", body).length, 0);
  });
});

test("TVC poster key composes a media URL when no poster_url is present", () => {
  withFakeDom(() => {
    const { root, body } = buildRoot();
    const panel = createPreviewPanel({ root });

    panel.open({
      work: { section: "tvc", work_title: "夜晚航线", work_type: "品牌片", poster_key: "portfolio/tvc/poster.webp" },
      images: [],
      localUrls: {},
    });

    assert.equal(find("preview-cover", body).src, `${MEDIA_BASE}portfolio/tvc/poster.webp`);
  });
});

test("Livestream preview sorts images and uses the first image as the cover", () => {
  withFakeDom(() => {
    const { root, body } = buildRoot();
    const panel = createPreviewPanel({ root });
    const work = { section: "livestream", work_title: "深夜直播间", work_type: "日播间" };
    const images = [
      { image_url: "https://media.kjoe.top/live/b.webp", sort_order: 2 },
      { image_url: "https://media.kjoe.top/live/a.webp", sort_order: 1 },
      { image_url: "https://media.kjoe.top/live/c.webp", sort_order: 3 },
    ];

    panel.open({ work, images, localUrls: {} });

    const cover = find("preview-cover", body);
    assert.equal(cover.src, "https://media.kjoe.top/live/a.webp");
    assert.equal(cover.alt, "《深夜直播间》封面");
    const label = find("preview-cover-label", body);
    assert.equal(label.textContent, "封面");
    const gallery = findAll("preview-gallery-image", body);
    assert.deepEqual(gallery.map((img) => img.src), [
      "https://media.kjoe.top/live/a.webp",
      "https://media.kjoe.top/live/b.webp",
      "https://media.kjoe.top/live/c.webp",
    ]);
    assert.deepEqual(gallery.map((img) => img.alt), ["《深夜直播间》图片 1", "《深夜直播间》图片 2", "《深夜直播间》图片 3"]);
    assert.equal(find("preview-video", body), null);
  });
});

test("Livestream falls back to work.work_images and image_key composition", () => {
  withFakeDom(() => {
    const { root, body } = buildRoot();
    const panel = createPreviewPanel({ root });
    const work = {
      section: "livestream",
      work_title: "深夜直播间",
      work_type: "日播间",
      work_images: [{ image_key: "portfolio/live/one.webp", sort_order: 1 }],
    };

    panel.open({ work });

    assert.equal(find("preview-cover", body).src, `${MEDIA_BASE}portfolio/live/one.webp`);
    assert.equal(findAll("preview-gallery-image", body).length, 1);
  });
});

test("localUrls replace saved media strings with blob previews", () => {
  withFakeDom(() => {
    const { root, body } = buildRoot();
    const panel = createPreviewPanel({ root });
    const localUrls = {
      "poster-local.webp": "blob:poster",
      "photo-local.webp": "blob:photo",
    };

    panel.open({
      work: { section: "tvc", work_title: "草稿", work_type: "品牌片", poster_url: "poster-local.webp" },
      localUrls,
    });
    assert.equal(find("preview-cover", body).src, "blob:poster");

    panel.open({
      work: { section: "livestream", work_title: "草稿", work_type: "日播间" },
      images: [
        { image_url: "photo-local.webp", sort_order: 1 },
        { image_url: "photo-local.webp", sort_order: 2 },
      ],
      localUrls,
    });
    assert.equal(find("preview-cover", body).src, "blob:photo");
    assert.deepEqual(findAll("preview-gallery-image", body).map((img) => img.src), ["blob:photo", "blob:photo"]);
  });
});

test("preview is read-only: renders no editing controls", () => {
  withFakeDom(() => {
    const { root, body } = buildRoot();
    const panel = createPreviewPanel({ root });
    const work = { section: "tvc", work_title: "夜晚航线", work_type: "品牌片", poster_url: "https://media.kjoe.top/tvc/poster.webp" };

    panel.open({ work, images: [], localUrls: {} });

    const walk = (node) => [node, ...node.children.flatMap(walk)];
    const tags = walk(body).map((node) => node.tagName);
    assert.equal(tags.includes("input"), false);
    assert.equal(tags.includes("select"), false);
    assert.equal(tags.includes("textarea"), false);
    assert.equal(tags.includes("button"), false);
    assert.equal(walk(body).some((node) => node.contentEditable), false);
  });
});

test("preview close button and Escape close and restore focus to the opener", () => {
  withFakeDom(() => {
    const { root, close } = buildRoot();
    const panel = createPreviewPanel({ root });
    const opener = new FakeElement("button");
    opener.focus();

    panel.open({ work: { section: "tvc", work_title: "夜晚航线", work_type: "品牌片" }, images: [], localUrls: {} });
    assert.equal(fakeDocument.activeElement, close, "focus moves to the close button on open");

    fakeDocument.keydown("Escape");
    assert.equal(root.hidden, true);
    assert.equal(fakeDocument.activeElement, opener);

    panel.open({ work: { section: "tvc", work_title: "夜晚航线", work_type: "品牌片" }, images: [], localUrls: {} });
    close.click();
    assert.equal(root.hidden, true);
    assert.equal(fakeDocument.activeElement, opener);
  });
});

test("preview keeps dialog semantics and labels the heading", () => {
  withFakeDom(() => {
    const { root, heading } = buildRoot();
    const panel = createPreviewPanel({ root });

    panel.open({ work: { section: "tvc", work_title: "夜晚航线", work_type: "品牌片" }, images: [], localUrls: {} });

    assert.equal(root.getAttribute("role"), "dialog");
    assert.equal(root.getAttribute("aria-modal"), "true");
    assert.equal(root.getAttribute("aria-labelledby"), heading.id);
  });
});
