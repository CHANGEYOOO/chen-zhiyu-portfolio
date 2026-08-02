import test from "node:test";
import assert from "node:assert/strict";
import { WorksDataError, buildWorksModel } from "../works-model.js";

function work(overrides = {}) {
  return {
    id: "work-1",
    section: "tvc",
    brand_name: "Brand",
    work_title: "Title",
    work_type: "TVC",
    sort_order: 0,
    ...overrides,
  };
}

test("groups 30 TVC and 8 Livestream works and reports expected counts", () => {
  const works = [
    ...Array.from({ length: 30 }, (_, index) => work({ id: `tvc-${index}`, sort_order: 29 - index })),
    ...Array.from({ length: 8 }, (_, index) => work({ id: `live-${index}`, section: "livestream", work_type: "Set Design", sort_order: 7 - index })),
  ];
  const model = buildWorksModel({ works });
  assert.equal(model.groups.tvc.length, 30);
  assert.equal(model.groups.livestream.length, 8);
  assert.deepEqual(model.counts, { total: 38, tvc: 30, livestream: 8 });
  assert.equal(model.warning, "");
  assert.equal(model.groups.tvc[0].sort_order, 0);
  assert.equal(model.groups.livestream[0].sort_order, 0);
});

test("returns an empty model for an empty works array", () => {
  const model = buildWorksModel({ works: [] });
  assert.equal(model.isEmpty, true);
  assert.deepEqual(model.counts, { total: 0, tvc: 0, livestream: 0 });
  assert.match(model.warning, /预期 38 个/);
});

test("warns when valid data does not match the expected 30 plus 8 counts", () => {
  const model = buildWorksModel({ works: [work()] });
  assert.match(model.warning, /实际 1 个/);
  assert.equal(model.groups.tvc.length, 1);
});

test("rejects an invalid top-level payload", () => {
  assert.throws(() => buildWorksModel({}), WorksDataError);
  assert.throws(() => buildWorksModel(null), WorksDataError);
});

for (const field of ["id", "work_title", "work_type"]) {
  test(`rejects a work with invalid ${field}`, () => {
    assert.throws(() => buildWorksModel({ works: [work({ [field]: "" })] }), WorksDataError);
  });
}

test("uses a visible placeholder when a published work has no brand", () => {
  const model = buildWorksModel({ works: [work({ section: "livestream", brand_name: null })] });
  assert.equal(model.groups.livestream[0].brand_name, "—");
});

test("rejects unknown sections and invalid sort orders", () => {
  assert.throws(() => buildWorksModel({ works: [work({ section: "other" })] }), WorksDataError);
  assert.throws(() => buildWorksModel({ works: [work({ sort_order: -1 })] }), WorksDataError);
  assert.throws(() => buildWorksModel({ works: [work({ sort_order: 1.5 })] }), WorksDataError);
});
