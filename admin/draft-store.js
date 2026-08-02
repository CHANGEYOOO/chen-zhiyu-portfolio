const PREFIX = "portfolio-admin:draft:";
const RECOVERY_PREFIX = "portfolio-admin:recovery:";

function isFileValue(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function serializable(value) {
  if (isFileValue(value) || value === undefined || typeof value === "function") return undefined;
  if (Array.isArray(value)) return value.map(serializable).filter((item) => item !== undefined);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .map(([key, item]) => [key, serializable(item)])
      .filter(([key, item]) => item !== undefined && !(Array.isArray(value[key]) && value[key].some(isFileValue) && item.length === 0)));
  }
  return value;
}

export class DraftStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  key(workId) {
    return `${PREFIX}${workId}`;
  }

  recoveryKey(workId) {
    return `${RECOVERY_PREFIX}${workId}`;
  }

  list() {
    const workIds = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (key && key.startsWith(PREFIX)) workIds.push(key.slice(PREFIX.length));
    }
    return workIds.sort();
  }

  save(workId, value) {
    this.storage.setItem(this.key(workId), JSON.stringify(serializable(value)));
  }

  load(workId) {
    const value = this.storage.getItem(this.key(workId));
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      this.remove(workId);
      return null;
    }
  }

  remove(workId) {
    this.storage.removeItem(this.key(workId));
  }

  saveRecovery(workId, value) {
    this.storage.setItem(this.recoveryKey(workId), JSON.stringify(serializable(value)));
  }

  loadRecovery(workId) {
    const value = this.storage.getItem(this.recoveryKey(workId));
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      this.clearRecovery(workId);
      return null;
    }
  }

  clearRecovery(workId) {
    this.storage.removeItem(this.recoveryKey(workId));
  }

  orderImages(images, order) {
    if (!Array.isArray(order)) return [...images];
    const byId = new Map(images.map((image) => [image.id, image]));
    const ordered = order.map((id) => byId.get(id)).filter(Boolean);
    const seen = new Set(ordered.map((image) => image.id));
    return [...ordered, ...images.filter((image) => !seen.has(image.id))];
  }
}
