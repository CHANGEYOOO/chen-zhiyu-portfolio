const SECTIONS = new Set(["tvc", "livestream"]);
const STATUSES = new Set(["draft", "published", "archived"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateWork(input) {
  const value = {
    section: text(input?.section),
    brand_name: text(input?.brand_name) || null,
    work_title: text(input?.work_title),
    work_type: text(input?.work_type),
    status: text(input?.status),
  };
  const errors = [];

  if (!SECTIONS.has(value.section)) errors.push("section must be tvc or livestream");
  if (!STATUSES.has(value.status)) errors.push("status must be draft, published, or archived");
  if (!value.work_title) errors.push("work_title is required");
  if (!value.work_type) errors.push("work_type is required");
  if (value.section === "tvc" && !value.brand_name) errors.push("brand_name is required for tvc");
  if (value.section === "livestream") value.brand_name = null;

  return errors.length ? { ok: false, errors } : { ok: true, value };
}

export function validateObjectKey(key, section, workId) {
  if (!SECTIONS.has(section) || typeof workId !== "string" || !workId) return false;
  if (typeof key !== "string" || !key.startsWith(`portfolio/${section}/${workId}/`)) return false;

  const segments = key.split("/");
  return segments.every((segment) => {
    try {
      const decoded = decodeURIComponent(segment);
      return decoded && decoded !== "." && decoded !== ".." && !decoded.includes("/") && !decoded.includes("\\");
    } catch {
      return false;
    }
  });
}
