const EXPECTED_COUNTS = Object.freeze({ total: 38, tvc: 30, livestream: 8 });
const SECTIONS = new Set(["tvc", "livestream"]);

export class WorksDataError extends Error {
  constructor(message) {
    super(message);
    this.name = "WorksDataError";
  }
}

function requiredString(value, field, index) {
  if (typeof value !== "string" || !value.trim()) {
    throw new WorksDataError(`作品 ${index + 1} 的 ${field} 无效`);
  }
  return value.trim();
}

function optionalString(value, fallback = "—") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeWork(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorksDataError(`作品 ${index + 1} 格式无效`);
  }
  const section = requiredString(value.section, "section", index);
  if (!SECTIONS.has(section)) throw new WorksDataError(`作品 ${index + 1} 的 section 无效`);
  if (!Number.isInteger(value.sort_order) || value.sort_order < 0) {
    throw new WorksDataError(`作品 ${index + 1} 的 sort_order 无效`);
  }
  return {
    id: requiredString(value.id, "id", index),
    section,
    brand_name: optionalString(value.brand_name),
    work_title: requiredString(value.work_title, "work_title", index),
    work_type: requiredString(value.work_type, "work_type", index),
    sort_order: value.sort_order,
  };
}

export function buildWorksModel(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.works)) {
    throw new WorksDataError("作品接口返回格式无效");
  }
  const works = payload.works.map(normalizeWork);
  const groups = {
    tvc: works.filter((item) => item.section === "tvc").sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)),
    livestream: works.filter((item) => item.section === "livestream").sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)),
  };
  const counts = { total: works.length, tvc: groups.tvc.length, livestream: groups.livestream.length };
  const matches = counts.total === EXPECTED_COUNTS.total && counts.tvc === EXPECTED_COUNTS.tvc && counts.livestream === EXPECTED_COUNTS.livestream;
  const warning = matches ? "" : `作品数量异常：预期 38 个（TVC 30、Livestream 8），实际 ${counts.total} 个（TVC ${counts.tvc}、Livestream ${counts.livestream}）。`;
  return { groups, counts, isEmpty: works.length === 0, warning };
}
