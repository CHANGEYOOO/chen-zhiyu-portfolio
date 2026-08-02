import test from "node:test";
import assert from "node:assert/strict";
import { createConfirmPanel } from "../confirm-panel.js";

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
    this.type = "";
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
  const title = new FakeElement("h2");
  title.setAttribute("id", "confirm-title");
  title.setAttribute("data-confirm-title", "");
  const close = new FakeElement("button");
  close.setAttribute("data-confirm-close", "");
  head.append(title, close);

  const message = new FakeElement("p");
  message.setAttribute("data-confirm-message", "");

  const actions = new FakeElement("div");
  actions.className = "panel-actions";
  const cancel = new FakeElement("button");
  cancel.setAttribute("data-confirm-cancel", "");
  const confirm = new FakeElement("button");
  confirm.setAttribute("data-confirm-action", "");
  actions.append(cancel, confirm);

  card.append(head, message, actions);
  root.append(card);
  return { root, title, message, close, cancel, confirm };
}

test("confirm panel shows title, message, and the dangerous confirm label", () => {
  withFakeDom(() => {
    const { root, title, message, confirm } = buildRoot();
    const panel = createConfirmPanel({ root });

    panel.open({
      title: "删除作品？",
      message: "此操作无法撤销。",
      confirmLabel: "确认删除",
      tone: "danger",
      onConfirm: () => {},
    });

    assert.equal(root.hidden, false);
    assert.equal(title.textContent, "删除作品？");
    assert.equal(message.textContent, "此操作无法撤销。");
    assert.equal(confirm.textContent, "确认删除");
    assert.equal(root.dataset.tone, "danger");
  });
});

test("confirm callback runs only after the confirm button is clicked", () => {
  withFakeDom(() => {
    const { root, confirm } = buildRoot();
    const panel = createConfirmPanel({ root });
    let calls = 0;

    panel.open({ title: "发布？", message: "将公开到前台。", confirmLabel: "确认发布", onConfirm: () => { calls += 1; } });
    assert.equal(calls, 0);
    assert.equal(root.hidden, false);

    confirm.click();

    assert.equal(calls, 1);
    assert.equal(root.hidden, true);

    confirm.click();
    assert.equal(calls, 1, "callback must not fire again after close");
  });
});

test("cancel, close button, and Escape never invoke the callback", () => {
  withFakeDom(() => {
    const { root, close, cancel } = buildRoot();
    const panel = createConfirmPanel({ root });
    let calls = 0;
    const openPanel = () => panel.open({ title: "归档？", message: "将移出列表。", confirmLabel: "确认归档", onConfirm: () => { calls += 1; } });

    openPanel();
    cancel.click();
    assert.equal(calls, 0);
    assert.equal(root.hidden, true);

    openPanel();
    close.click();
    assert.equal(calls, 0);
    assert.equal(root.hidden, true);

    openPanel();
    fakeDocument.keydown("Escape");
    assert.equal(calls, 0);
    assert.equal(root.hidden, true);
  });
});

test("closing restores focus to the element that opened the panel", () => {
  withFakeDom(() => {
    const { root, cancel } = buildRoot();
    const panel = createConfirmPanel({ root });
    const opener = new FakeElement("button");
    opener.focus();
    assert.equal(fakeDocument.activeElement, opener);

    panel.open({ title: "删除？", message: "不可恢复。", confirmLabel: "确认删除", onConfirm: () => {} });
    assert.equal(fakeDocument.activeElement, cancel, "focus moves into the dialog on open");

    fakeDocument.keydown("Escape");
    assert.equal(root.hidden, true);
    assert.equal(fakeDocument.activeElement, opener, "focus returns to the opener after close");
  });
});

test("each open uses only the latest callback", () => {
  withFakeDom(() => {
    const { root, confirm } = buildRoot();
    const panel = createConfirmPanel({ root });
    let first = 0;
    let second = 0;

    panel.open({ title: "A", message: "", confirmLabel: "确认", onConfirm: () => { first += 1; } });
    panel.close();
    panel.open({ title: "B", message: "", confirmLabel: "确认", onConfirm: () => { second += 1; } });
    confirm.click();

    assert.equal(first, 0);
    assert.equal(second, 1);
  });
});

test("panel keeps dialog semantics: role, aria-modal, and labelled heading", () => {
  withFakeDom(() => {
    const { root, title } = buildRoot();
    const panel = createConfirmPanel({ root });

    panel.open({ title: "发布？", message: "", confirmLabel: "确认发布", onConfirm: () => {} });

    assert.equal(root.getAttribute("role"), "dialog");
    assert.equal(root.getAttribute("aria-modal"), "true");
    assert.equal(root.getAttribute("aria-labelledby"), title.id);
    assert.equal(title.id, "confirm-title");
  });
});

test("confirmation never calls window.confirm and never nests a dialog element", () => {
  withFakeDom(() => {
    const { root, confirm } = buildRoot();
    const panel = createConfirmPanel({ root });
    let nativeConfirmCalls = 0;
    const originalWindow = globalThis.window;
    globalThis.window = { confirm: () => { nativeConfirmCalls += 1; return true; } };
    try {
      panel.open({ title: "删除？", message: "", confirmLabel: "确认删除", onConfirm: () => {} });
      confirm.click();
    } finally {
      globalThis.window = originalWindow;
    }

    assert.equal(nativeConfirmCalls, 0);
    const walk = (node) => [node, ...node.children.flatMap(walk)];
    assert.equal(walk(root).some((node) => node.tagName === "dialog"), false);
  });
});
