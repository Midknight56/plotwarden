// T04 (drawing drafts: add, undo, close, cancel). Requirements P4.8.
import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, draftAdd, draftCancel, draftClose, draftLast, draftUndo } from "../../template/src/map/edit";
import type { ShapeDraft } from "../../template/src/map/edit";

function build(points: [number, number][]): ShapeDraft {
  let draft: ShapeDraft = EMPTY_DRAFT;
  for (const p of points) {
    const r = draftAdd(draft, p);
    if (!r.ok) throw new Error(`refused ${JSON.stringify(p)}: ${r.error.code}`);
    draft = r.value;
  }
  return draft;
}

describe("a drawing draft", () => {
  it("starts empty", () => {
    expect(EMPTY_DRAFT.points).toEqual([]);
    expect(draftLast(EMPTY_DRAFT)).toBeUndefined();
  });

  it("adds points in order and never changes the draft it was given", () => {
    const one = build([[10, 10]]);
    const two = draftAdd(one, [20, 10]);
    expect(two.ok && two.value.points).toEqual([[10, 10], [20, 10]]);
    expect(one.points).toEqual([[10, 10]]);
  });

  it("names the last point", () => {
    expect(draftLast(build([[1, 2], [3, 4]]))).toEqual([3, 4]);
  });

  it("undoes the last point only", () => {
    const draft = build([[0, 0], [10, 0], [10, 10]]);
    expect(draftUndo(draft).points).toEqual([[0, 0], [10, 0]]);
    expect(draft.points.length).toBe(3);
  });

  it("does nothing when there is no point to undo", () => {
    expect(draftUndo(EMPTY_DRAFT).points).toEqual([]);
  });

  it("is cancelled to an empty draft", () => {
    expect(draftCancel().points).toEqual([]);
  });

  it("refuses a point equal to the last, and a point out of range", () => {
    const draft = build([[5, 5]]);
    const same = draftAdd(draft, [5, 5]);
    expect(!same.ok && same.error.code).toBe("not_distinct");
    expect(draftAdd(draft, [10001, 5]).ok).toBe(false);
    expect(draftAdd(draft, [5, -1]).ok).toBe(false);
    expect(draftAdd(draft, [1.5, 1]).ok).toBe(false);
  });

  it("takes 256 points and refuses the 257th", () => {
    const points: [number, number][] = Array.from({ length: 256 }, (_, i) => [i * 10, 5]);
    const draft = build(points);
    expect(draft.points.length).toBe(256);
    const over = draftAdd(draft, [3000, 5]);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.detail).toMatchObject({ item: "polygonVertices", limit: 256, value: 257 });
  });
});

describe("closing a draft", () => {
  it("needs three points for a shape", () => {
    const r = draftClose(build([[0, 0], [10, 0]]), "polygon");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("too_few_points");
  });

  it("gives the points of a good shape", () => {
    const r = draftClose(build([[0, 0], [10, 0], [10, 10], [0, 10]]), "polygon");
    expect(r).toEqual({ ok: true, value: [[0, 0], [10, 0], [10, 10], [0, 10]] });
  });

  it("names a crossing outline", () => {
    const r = draftClose(build([[0, 0], [10, 10], [10, 0], [0, 10]]), "polygon");
    expect(!r.ok && r.error.code).toBe("self_crossing");
  });

  it("needs two points for a path", () => {
    expect(draftClose(build([[0, 0]]), "path").ok).toBe(false);
    expect(draftClose(build([[0, 0], [5, 5]]), "path")).toEqual({ ok: true, value: [[0, 0], [5, 5]] });
  });

  it("leaves the draft as it was", () => {
    const draft = build([[0, 0], [10, 0]]);
    draftClose(draft, "polygon");
    expect(draft.points.length).toBe(2);
  });
});
