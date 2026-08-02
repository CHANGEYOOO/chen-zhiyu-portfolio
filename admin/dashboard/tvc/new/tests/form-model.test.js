import assert from "node:assert/strict";
import test from "node:test";
import { validateDraftFields } from "../form-model.js";

test("normalizes the three required draft text fields", () => {
  assert.deepEqual(validateDraftFields({
    brandName: " Nike ",
    workTitle: " Run ",
    workType: " TVC ",
  }), {
    brandName: "Nike",
    workTitle: "Run",
    workType: "TVC",
  });
});

for (const field of ["brandName", "workTitle", "workType"]) {
  test(`rejects a missing ${field} rather than creating an incomplete draft`, () => {
    assert.throws(() => validateDraftFields({
      brandName: "Nike",
      workTitle: "Run",
      workType: "TVC",
      [field]: " ",
    }), new RegExp(field));
  });
}

test("rejects non-object draft fields", () => {
  assert.throws(() => validateDraftFields(null), /draft fields/i);
  assert.throws(() => validateDraftFields([]), /draft fields/i);
});
