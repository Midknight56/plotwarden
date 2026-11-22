// T08 (fast entry: repeat aids never copy a person, paste, keyboard rows, pinned page, draft and resume).
// Requirements P11.
import { describe, expect, it } from "vitest";
import type { FieldDef, SheetDef } from "../../template/src/adapter";
import { buildRecoveryFile } from "../../template/src/data/drafts";
import {
  addRow,
  choosePage,
  closePage,
  fillPlotSequence,
  firstProblem,
  focusProblem,
  fromDraft,
  markSaved,
  newSession,
  nextPage,
  parseDraftFile,
  pasteCells,
  previousPage,
  removeRow,
  repeatFromAbove,
  rotatePage,
  rowsToMapped,
  setCell,
  setCurrentRow,
  toDraft,
  zoomIn,
  zoomOut,
} from "../../template/src/data/fastEntry";
import type { EntrySession } from "../../template/src/data/fastEntry";
import { stageImport } from "../../template/src/data/importBatch";
import { canonicalJson } from "../../template/src/events";
import { LIMITS } from "../../template/src/limits";
import { PaperEnv, burialsImporter, paperAdapter } from "../helpers/paperAdapter";
import { fid } from "../helpers/site";

const FIELDS: FieldDef[] = [
  { key: "sourceRef", label: "Source ref", type: "text" },
  { key: "name", label: "Name", type: "text" },
  { key: "section", label: "Section", type: "text", repeat: "section" },
  { key: "plot", label: "Plot", type: "text" },
  { key: "burialDate", label: "Burial date", type: "date" },
  { key: "page", label: "Page", type: "text", repeat: "page" },
  { key: "note", label: "Note", type: "text" },
];
const SHEET: SheetDef = {
  name: "Burials",
  required: ["Source ref", "Name"],
  optional: ["Section", "Plot", "Burial date", "Page", "Note"],
};

function withRows(rows: Record<string, string>[]): EntrySession {
  let s = newSession();
  rows.forEach((cells, i) => {
    if (i > 0) s = addRow(s);
    for (const [k, v] of Object.entries(cells)) s = setCell(s, i, k, v);
  });
  return s;
}

describe("a new session", () => {
  it("holds one empty row on page 1 at 100 percent, with no page photo", () => {
    const s = newSession();
    expect(s.rows.length).toBe(1);
    expect(s.rows[0]).toMatchObject({ cells: {}, saved: false });
    expect(s.currentRow).toBe(0);
    expect(s.page).toEqual({ index: 1, zoom: 1, rotation: 0 });
    expect(s.pageChosen).toBe(false);
  });
});

describe("rows", () => {
  it("adds a row after the one given, with its own ID, without changing the session it was given", () => {
    const s = withRows([{ sourceRef: "R1" }, { sourceRef: "R3" }]);
    const next = addRow(s, 0);
    expect(next.rows.map((r) => r.cells["sourceRef"])).toEqual(["R1", undefined, "R3"]);
    expect(new Set(next.rows.map((r) => r.rowId)).size).toBe(3);
    expect(s.rows.length).toBe(2);
  });

  it("adds at the end by default", () => {
    expect(addRow(newSession()).rows.length).toBe(2);
  });

  it("removes a row and never the last one", () => {
    const s = withRows([{ sourceRef: "R1" }, { sourceRef: "R2" }]);
    expect(removeRow(s, 0).rows.map((r) => r.cells["sourceRef"])).toEqual(["R2"]);
    expect(removeRow(removeRow(s, 0), 0).rows.length).toBe(1);
  });

  it("keeps the current row in range after a removal", () => {
    let s = withRows([{ sourceRef: "R1" }, { sourceRef: "R2" }, { sourceRef: "R3" }]);
    s = setCurrentRow(s, 2);
    expect(removeRow(s, 2).currentRow).toBe(1);
  });

  it("sets one cell and nothing else", () => {
    const s = withRows([{ sourceRef: "R1", name: "A" }]);
    const next = setCell(s, 0, "name", "B");
    expect(next.rows[0]?.cells).toEqual({ sourceRef: "R1", name: "B" });
    expect(s.rows[0]?.cells["name"]).toBe("A");
  });
});

describe("repeat aids", () => {
  const above = () =>
    withRows([
      { sourceRef: "R1", name: "Mirel Quillmoss", section: "Paper", plot: "C001", page: "P3", note: "private note" },
      { sourceRef: "R2" },
    ]);

  it("repeats the section only, and never a name, a note, a source ref or a plot", () => {
    const next = repeatFromAbove(above(), 1, "section", FIELDS);
    expect(next.rows[1]?.cells).toEqual({ sourceRef: "R2", section: "Paper" });
  });

  it("repeats the page only", () => {
    const next = repeatFromAbove(above(), 1, "page", FIELDS);
    expect(next.rows[1]?.cells).toEqual({ sourceRef: "R2", page: "P3" });
  });

  it("never copies the source ref, even if a field is flagged by mistake", () => {
    const flagged: FieldDef[] = FIELDS.map((f) => (f.key === "sourceRef" ? { ...f, repeat: "section" as const } : f));
    const next = repeatFromAbove(above(), 1, "section", flagged);
    expect(next.rows[1]?.cells["sourceRef"]).toBe("R2");
  });

  it("does nothing on the first row", () => {
    const s = above();
    expect(repeatFromAbove(s, 0, "section", FIELDS)).toEqual(s);
  });

  it("fills an empty target and replaces a value the keeper has not typed again", () => {
    const s = setCell(above(), 1, "section", "Old");
    expect(repeatFromAbove(s, 1, "section", FIELDS).rows[1]?.cells["section"]).toBe("Paper");
  });
});

describe("fill plot sequence", () => {
  const next = (above: string) => {
    const s = withRows([{ plot: above }, {}]);
    const r = fillPlotSequence(s, 1, "plot");
    return r.ok ? r.value.rows[1]?.cells["plot"] : r.error.code;
  };

  it("adds one to the trailing number and keeps the prefix and the padding", () => {
    expect(next("C009")).toBe("C010");
    expect(next("C001")).toBe("C002");
    expect(next("Y07")).toBe("Y08");
    expect(next("B03")).toBe("B04");
    expect(next("007")).toBe("008");
    expect(next("A1B2")).toBe("A1B3");
  });

  it("lets the number grow past its width", () => {
    expect(next("C099")).toBe("C100");
    expect(next("C9")).toBe("C10");
  });

  it("refuses a plot with no trailing number, a blank plot and the first row", () => {
    expect(next("Yew")).toBe("no_trailing_number");
    expect(next("")).toBe("no_row_above");
    const first = fillPlotSequence(newSession(), 0, "plot");
    expect(!first.ok && first.error.code).toBe("no_row_above");
  });

  it("refuses a result longer than 24 characters", () => {
    const code = `${"A".repeat(21)}999`;
    expect(next(code)).toBe("over_limit");
  });
});

describe("paste", () => {
  const keys = FIELDS;

  it("fills rows from the current row, adding rows as needed", () => {
    const s = newSession();
    const r = pasteCells(s, 0, "sourceRef", "R1\tAlder\nR2\tBrindle\nR3\tCove\n", keys);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value.rows.map((x) => [x.cells["sourceRef"], x.cells["name"]])).toEqual([["R1", "Alder"], ["R2", "Brindle"], ["R3", "Cove"]]);
  });

  it("starts at the field given and leaves the others as they were", () => {
    const s = withRows([{ sourceRef: "R1", name: "A", note: "keep" }, { sourceRef: "R2", name: "B" }]);
    const r = pasteCells(s, 0, "section", "Paper\tC001\nPaper\tC002", keys);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value.rows[0]?.cells).toEqual({ sourceRef: "R1", name: "A", note: "keep", section: "Paper", plot: "C001" });
    expect(r.value.rows[1]?.cells).toEqual({ sourceRef: "R2", name: "B", section: "Paper", plot: "C002" });
  });

  it("starts at a row in the middle", () => {
    const s = withRows([{ sourceRef: "R1" }, { sourceRef: "R2" }]);
    const r = pasteCells(s, 1, "name", "B\nC\nD", keys);
    if (!r.ok) throw new Error("refused");
    expect(r.value.rows.map((x) => x.cells["name"])).toEqual([undefined, "B", "C", "D"]);
    expect(r.value.rows[0]?.cells["sourceRef"]).toBe("R1");
  });

  it("keeps a quoted cell that holds a tab or a line break", () => {
    const r = pasteCells(newSession(), 0, "name", '"Line one\nLine two"\t"A\tB"', keys);
    if (!r.ok) throw new Error("refused");
    expect(r.value.rows[0]?.cells).toEqual({ name: "Line one\nLine two", section: "A\tB" });
  });

  it("keeps empty cells as empty text and leading zeros as they are", () => {
    const r = pasteCells(newSession(), 0, "sourceRef", "001\t\tPaper", keys);
    if (!r.ok) throw new Error("refused");
    expect(r.value.rows[0]?.cells).toEqual({ sourceRef: "001", name: "", section: "Paper" });
  });

  it("refuses a block wider than the fields that remain", () => {
    const r = pasteCells(newSession(), 0, "note", "a\tb", keys);
    expect(!r.ok && r.error.code).toBe("paste_too_wide");
  });

  it("refuses a block that is not a rectangle", () => {
    const r = pasteCells(newSession(), 0, "sourceRef", "a\tb\nc", keys);
    expect(!r.ok && r.error.code).toBe("not_rectangular");
  });

  it("refuses a field it does not know and an empty paste", () => {
    expect(pasteCells(newSession(), 0, "nope", "a", keys).ok).toBe(false);
    expect(pasteCells(newSession(), 0, "name", "", keys).ok).toBe(false);
  });

  it("changes nothing when it refuses", () => {
    const s = withRows([{ sourceRef: "R1" }]);
    const copy = structuredClone(s);
    pasteCells(s, 0, "note", "a\tb", keys);
    expect(s).toEqual(copy);
  });

  it("takes rows up to 5,000 and refuses more", () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => `R${i}`).join("\n");
    const fits = pasteCells(newSession(), 0, "sourceRef", rows(LIMITS.csvDataRows), keys);
    expect(fits.ok && fits.value.rows.length).toBe(LIMITS.csvDataRows);
    const over = pasteCells(newSession(), 0, "sourceRef", rows(LIMITS.csvDataRows + 1), keys);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.detail).toMatchObject({ item: "csvDataRows", limit: 5000 });
  });
});

describe("the pinned page", () => {
  it("moves to the next and previous page, never below page 1, and keeps every row", () => {
    const s = withRows([{ sourceRef: "R1" }, { sourceRef: "R2" }]);
    const two = nextPage(s);
    expect(two.page.index).toBe(2);
    expect(two.rows).toEqual(s.rows);
    expect(previousPage(two).page.index).toBe(1);
    expect(previousPage(s).page.index).toBe(1);
  });

  it("zooms in steps of a quarter between one half and four", () => {
    let s = newSession();
    s = zoomIn(s);
    expect(s.page.zoom).toBe(1.25);
    for (let i = 0; i < 20; i += 1) s = zoomIn(s);
    expect(s.page.zoom).toBe(4);
    for (let i = 0; i < 30; i += 1) s = zoomOut(s);
    expect(s.page.zoom).toBe(0.5);
  });

  it("turns a quarter at a time", () => {
    let s = newSession();
    const turns = [90, 180, 270, 0].map(() => {
      s = rotatePage(s);
      return s.page.rotation;
    });
    expect(turns).toEqual([90, 180, 270, 0]);
  });

  it("never keeps the page: there is no keep flag, and closing always lets the photo go", () => {
    const fresh = newSession();
    expect("keepPage" in fresh).toBe(false);
    const chosen = choosePage(fresh);
    expect(chosen.pageChosen).toBe(true);
    expect("keepPage" in chosen).toBe(false);
    const released = closePage(chosen);
    expect(released.releaseImage).toBe(true);
    expect(released.session.pageChosen).toBe(false);
    expect("keepPage" in released.session).toBe(false);
  });

  it("has nothing to release when no page was chosen", () => {
    expect(closePage(newSession()).releaseImage).toBe(false);
  });
});

describe("review", () => {
  it("numbers rows by their place on screen and leaves out empty and saved rows", () => {
    let s = withRows([{ sourceRef: "R1", name: "A" }, {}, { sourceRef: "R3", name: "C" }, { sourceRef: "R4", name: "D" }]);
    s = markSaved(s, [4]);
    const mapped = rowsToMapped(s, SHEET, FIELDS);
    expect(mapped.map((m) => m.rowNumber)).toEqual([1, 3]);
    expect(mapped[0]?.cells).toMatchObject({ sourceRef: "R1", name: "A" });
  });

  it("lists cell errors the same way an import does", () => {
    const s = withRows([{ sourceRef: "", name: "A", burialDate: "03/04/26" }]);
    const mapped = rowsToMapped(s, SHEET, FIELDS);
    expect(mapped[0]?.errors.map((e) => [e.field, e.code])).toEqual([["sourceRef", "required"], ["burialDate", "date_year_needed"]]);
    expect(mapped[0]?.errors[0]).toMatchObject({ row: 1, heading: "Source ref" });
  });

  it("reaches the same staged counts as the same rows imported from a file", async () => {
    const env = await PaperEnv.create();
    await env.dispatch([
      {
        type: "layout_apply",
        sections: [{ sectionId: "s", name: "Paper" }],
        plots: ["P01", "P02"].map((code) => ({ plotId: fid(`plot:${code}`), code, sectionId: "s", spaces: [{ spaceId: fid(`space:${code}`) }] })),
      },
    ]);
    const s = withRows([
      { sourceRef: "R1", name: "A", section: "Paper", plot: "P01", burialDate: "1850" },
      { sourceRef: "R2", name: "B", section: "Paper", plot: "P99", burialDate: "1851" },
      { sourceRef: "R3", name: "C", burialDate: "unknown" },
    ]);
    const sheet = paperAdapter.sheets[0]!;
    const rows = rowsToMapped(s, sheet, paperAdapter.fields);
    let n = 0;
    const staged = stageImport({
      register: env.register,
      importer: burialsImporter,
      rows,
      columns: sheet.required.concat(sheet.optional ?? []).map((_, index) => ({ index, heading: "x" })),
      sheet,
      fields: paperAdapter.fields,
      state: env.state,
      siteId: env.site.id,
      baseRevision: env.revision,
      effectiveOn: "2026-04-20",
      options: { newId: () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}` },
    });
    expect(staged.counts).toEqual({ ready: 1, unchanged: 0, unplaced: 1, conflicts: 0, errors: 1, leftOut: 0 });
  });

  it("finds the first problem by row, then by the order of the fields", () => {
    const errors = [
      { row: 3, field: "name", heading: "Name", value: "", code: "required", fix: "enter_value" },
      { row: 2, field: "plot", heading: "Plot", value: "x", code: "unknown_plot", fix: "check_plot_code" },
      { row: 2, field: "sourceRef", heading: "Source ref", value: "", code: "required", fix: "enter_value" },
    ];
    expect(firstProblem(errors, FIELDS)).toEqual({ row: 2, field: "sourceRef" });
    expect(firstProblem([], FIELDS)).toBeUndefined();
  });

  it("keeps every row, the page, the zoom, the rotation and the current row when a row fails", () => {
    let s = withRows([{ sourceRef: "R1", name: "A" }, { sourceRef: "R2", name: "B", plot: "P99" }]);
    s = rotatePage(zoomIn(nextPage(nextPage(s))));
    s = choosePage(setCurrentRow(s, 1));
    const before = structuredClone(s);
    const after = focusProblem(s, { row: 2, field: "plot" });
    expect(after.focus).toEqual({ row: 2, field: "plot" });
    expect({ ...after, focus: undefined }).toEqual({ ...before, focus: undefined });
    expect(after.page).toEqual({ index: 3, zoom: 1.25, rotation: 90 });
    expect(after.currentRow).toBe(1);
    expect(after.pageChosen).toBe(true);
  });

  it("clears the focus target when there is no problem", () => {
    const s = focusProblem(newSession(), { row: 1, field: "name" });
    expect(focusProblem(s, undefined).focus).toBeUndefined();
  });

  it("marks only the rows that were committed as saved", () => {
    const s = withRows([{ sourceRef: "R1" }, { sourceRef: "R2" }, { sourceRef: "R3" }]);
    const next = markSaved(s, [1, 3]);
    expect(next.rows.map((r) => r.saved)).toEqual([true, false, true]);
  });
});

describe("interrupting and coming back", () => {
  const meta = { draftId: "d1", siteId: "00000000-0000-4000-8000-0000000000a1", kind: "paper", baseRevision: 4, savedAt: "2026-04-20T09:30:00+00:00" };

  function interrupted(): EntrySession {
    let s = withRows([{ sourceRef: "R1", name: "A", plot: "C001" }, { sourceRef: "R2", name: "B" }, { sourceRef: "R3" }]);
    s = markSaved(s, [1]);
    s = nextPage(nextPage(setCurrentRow(s, 2)));
    return choosePage(s);
  }

  it("makes a draft of the unsaved rows, the mapping, the current row and the page number", () => {
    const draft = toDraft(interrupted(), meta);
    expect(draft).toMatchObject({ draftId: "d1", siteId: meta.siteId, kind: "paper", baseRevision: 4, currentRow: 1, commands: [] });
    expect(draft.rawRows).toEqual([{ sourceRef: "R2", name: "B" }, { sourceRef: "R3" }]);
    expect(draft.mapping["page"]).toBe("3");
  });

  it("says the page photo must be chosen again whenever one was chosen, because it is never stored", () => {
    expect(toDraft(interrupted(), meta).pageImageNeedsReselect).toBe(true);
    expect(toDraft(newSession(), meta).pageImageNeedsReselect).toBe(false);
  });

  it("comes back as a session with the same rows, current row and page", () => {
    const back = fromDraft(toDraft(interrupted(), meta));
    expect(back.rows.map((r) => r.cells)).toEqual([{ sourceRef: "R2", name: "B" }, { sourceRef: "R3" }]);
    expect(back.currentRow).toBe(1);
    expect(back.page.index).toBe(3);
    expect(back.pageChosen).toBe(false);
    expect(back.rows.every((r) => !r.saved)).toBe(true);
  });

  it("gives at least one row for an empty draft", () => {
    expect(fromDraft({ rawRows: [], mapping: {}, currentRow: 0, pageImageNeedsReselect: false }).rows.length).toBe(1);
  });

  it("reads a recovery file for a draft preview and applies no command", () => {
    const file = buildRecoveryFile(toDraft(interrupted(), meta));
    expect(file.filename).toBe("register-recovery.json");
    const r = parseDraftFile(file.text, { kind: "paper", siteId: meta.siteId });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value.rawRows).toEqual([{ sourceRef: "R2", name: "B" }, { sourceRef: "R3" }]);
    expect(r.value.pageImageNeedsReselect).toBe(true);
    expect(r.value.baseRevision).toBe(4);
  });

  it("refuses the wrong kind, the wrong site, a newer version and another kind of file", () => {
    const body = JSON.parse(buildRecoveryFile(toDraft(interrupted(), meta)).text) as Record<string, unknown>;
    const text = (patch: Record<string, unknown>) => canonicalJson({ ...body, ...patch });
    const code = (t: string, expected = { kind: "paper", siteId: meta.siteId }) => {
      const r = parseDraftFile(t, expected);
      return r.ok ? "ok" : r.error.code;
    };
    expect(code(text({}))).toBe("ok");
    expect(code(text({}), { kind: "garden", siteId: meta.siteId })).toBe("wrong_kind");
    expect(code(text({}), { kind: "paper", siteId: "00000000-0000-4000-8000-0000000000a2" })).toBe("foreign_site");
    expect(code(text({ format: "plot.draft.v2" }))).toBe("newer_version");
    expect(code(text({ format: "plot.layout.v1" }))).toBe("wrong_file");
    expect(code("{}")).toBe("wrong_file");
    expect(code("not json")).toBe("bad_draft_file");
    expect(code(text({ extra: 1 }))).toBe("bad_draft_file");
    expect(code(text({ baseRevision: -1 }))).toBe("bad_draft_file");
    expect(code(text({ rawRows: "x" }))).toBe("bad_draft_file");
  });
});
