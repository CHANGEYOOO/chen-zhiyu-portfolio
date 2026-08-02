import test from "node:test";
import assert from "node:assert/strict";
import { validateObjectKey, validateWork } from "../src/validation.js";

test("accepts the minimum TVC record", () => {
  const result = validateWork({ section: "tvc", brand_name: "Brand", work_title: "Film", work_type: "TVC", status: "draft" });
  assert.equal(result.ok, true);
});

test("rejects a livestream without title", () => {
  assert.equal(validateWork({ section: "livestream", work_title: "", work_type: "直播间", status: "draft" }).ok, false);
});

test("rejects object key traversal", () => {
  assert.equal(validateObjectKey("portfolio/tvc/id/../secret", "tvc", "id"), false);
});

test("rejects encoded object key traversal", () => {
  assert.equal(validateObjectKey("portfolio/tvc/id/%2e%2e/secret", "tvc", "id"), false);
});
