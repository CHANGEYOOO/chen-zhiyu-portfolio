function requiredText(fields, name) {
  const value = fields[name];
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} is required`);
  return value.trim();
}

export function validateDraftFields(fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw new TypeError("Draft fields must be an object");
  return {
    brandName: requiredText(fields, "brandName"),
    workTitle: requiredText(fields, "workTitle"),
    workType: requiredText(fields, "workType"),
  };
}
