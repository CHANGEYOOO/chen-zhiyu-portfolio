function normalizedItems(items) {
  return items.map((item, sort_order) => ({ ...item, sort_order }));
}

function sameOrder(left, right) {
  return left.length === right.length && left.every((item, index) => item.id === right[index]?.id);
}

function changeEvent(detail) {
  if (typeof CustomEvent === "function") return new CustomEvent("change", { detail });
  const event = new Event("change");
  Object.defineProperty(event, "detail", { value: detail });
  return event;
}

export function moveItem(items, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return [...items];
  const ordered = [...items];
  const [item] = ordered.splice(from, 1);
  ordered.splice(to, 0, item);
  return ordered;
}

export class SortableList extends EventTarget {
  constructor({ root = null, items = [], renderItem = null } = {}) {
    super();
    this.root = root;
    this.renderItem = renderItem;
    this._serverItems = normalizedItems(items);
    this._items = normalizedItems(items);
    this.dragIndex = null;
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerEnd = this.handlePointerEnd.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleClick = this.handleClick.bind(this);
    if (this.root) this.bindRoot();
    this.render();
  }

  get items() {
    return normalizedItems(this._items);
  }

  get entries() {
    return this.items.map((item, index) => ({ item, index, isFirst: index === 0 }));
  }

  get dirty() {
    return !sameOrder(this._items, this._serverItems);
  }

  bindRoot() {
    this.root.addEventListener("pointerdown", this.handlePointerDown);
    this.root.addEventListener("pointermove", this.handlePointerMove);
    this.root.addEventListener("pointerup", this.handlePointerEnd);
    this.root.addEventListener("pointercancel", this.handlePointerEnd);
    this.root.addEventListener("keydown", this.handleKeyDown);
    this.root.addEventListener("click", this.handleClick);
  }

  replaceServerItems(items) {
    this._serverItems = normalizedItems(items);
    this._items = normalizedItems(items);
    this.render();
  }

  setItems(items) {
    this._items = normalizedItems(items);
    this.render();
  }

  commit() {
    this._serverItems = normalizedItems(this._items);
  }

  moveUp(index) {
    return this.move(index, index - 1, "button");
  }

  moveDown(index) {
    return this.move(index, index + 1, "button");
  }

  move(from, to, source = "programmatic") {
    const ordered = moveItem(this._items, from, to);
    if (sameOrder(ordered, this._items)) return false;
    const movedId = this._items[from].id;
    this._items = normalizedItems(ordered);
    this.render();
    if (source !== "pointer") this.focusHandle(movedId);
    this.dispatchEvent(changeEvent({ items: this.items, dirty: this.dirty, source }));
    return true;
  }

  cancel() {
    if (sameOrder(this._items, this._serverItems)) return false;
    this._items = normalizedItems(this._serverItems);
    this.render();
    this.dispatchEvent(changeEvent({ items: this.items, dirty: false, source: "cancel" }));
    return true;
  }

  render() {
    if (!this.root || !this.renderItem) return;
    this.root.replaceChildren();
    for (const entry of this.entries) {
      const row = this.renderItem(entry);
      row.dataset.sortableIndex = String(entry.index);
      row.classList.add("sortable-list-item");
      const handle = row.querySelector("[data-sort-handle]");
      if (handle) handle.setAttribute("aria-grabbed", String(this.dragIndex === entry.index));
      this.root.append(row);
    }
  }

  closest(target, selector) {
    return target && typeof target.closest === "function" ? target.closest(selector) : null;
  }

  indexFor(target) {
    const row = this.closest(target, "[data-sortable-index]");
    if (!row || !this.root?.contains(row)) return null;
    const index = Number(row.dataset.sortableIndex);
    return Number.isInteger(index) ? index : null;
  }

  targetAt(event) {
    const documentTarget = typeof document !== "undefined" && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)
      ? document.elementFromPoint(event.clientX, event.clientY)
      : null;
    return documentTarget || event.target;
  }

  handlePointerDown(event) {
    const handle = this.closest(event.target, "[data-sort-handle]");
    const index = this.indexFor(handle);
    if (!handle || index === null) return;
    event.preventDefault();
    this.dragIndex = index;
    this.root.dataset.sortDragging = "true";
    this.root.setPointerCapture?.(event.pointerId);
    handle.setAttribute("aria-grabbed", "true");
  }

  handlePointerMove(event) {
    if (this.dragIndex === null) return;
    const targetIndex = this.indexFor(this.targetAt(event));
    if (targetIndex === null || targetIndex === this.dragIndex) return;
    if (this.move(this.dragIndex, targetIndex, "pointer")) this.dragIndex = targetIndex;
  }

  handlePointerEnd(event) {
    if (this.dragIndex === null) return;
    this.root.releasePointerCapture?.(event.pointerId);
    this.dragIndex = null;
    delete this.root.dataset.sortDragging;
    this.render();
  }

  handleKeyDown(event) {
    const handle = this.closest(event.target, "[data-sort-handle]");
    const index = this.indexFor(handle);
    if (!handle || index === null) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.move(index, index - 1, "keyboard");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      this.move(index, index + 1, "keyboard");
    }
  }

  handleClick(event) {
    const button = this.closest(event.target, "[data-sort-move]");
    const index = this.indexFor(button);
    if (!button || index === null) return;
    if (button.dataset.sortMove === "up") this.moveUp(index);
    if (button.dataset.sortMove === "down") this.moveDown(index);
  }

  focusHandle(id) {
    this.root?.querySelector(`[data-image-id="${CSS.escape(id)}"] [data-sort-handle]`)?.focus();
  }
}
