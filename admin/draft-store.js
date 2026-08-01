const PREFIX = "portfolio-admin:draft:";

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
}
