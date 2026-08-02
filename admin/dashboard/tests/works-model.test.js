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

function tvc(id, sort_order) {
  return work({ id, sort_order });
}

function livestream(id, sort_order) {
  return work({ id, section: "livestream", work_type: "Set Design", sort_order });
}

test("groups returned TVC and Livestream works and reports their counts", () => {
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
  assert.equal(model.warning, "");
});

test("counts are derived only from returned works", () => {
  const model = buildWorksModel({ works: [tvc("a", 0), livestream("b", 0)] });
  assert.deepEqual(model.counts, { total: 2, tvc: 1, livestream: 1 });
  assert.equal(model.warning, "");
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
