// T03 (and the grid size part of T32). Requirements P2.
// Corner values are worked by hand from the grid rules in the design:
// origin (100, 100), cells 40 wide and 30 high, no spacing.
import { beforeAll, describe, expect, it } from "vitest";
import { formatCode, gridCommand, parseSkips, planGrid, planRenumber, previewGrid } from "../../template/src/map/generate";
import type { GridPreviewInput } from "../../template/src/map/generate";
import { normalizeCode } from "../../template/src/plot";
import type { ExistingPlot, GridSpec } from "../../template/src/map/generate";

const SECTION = { sectionId: "s1", name: "Paper" };

function spec(patch: Partial<GridSpec> = {}): GridSpec {
  return {
    prefix: "C",
    firstNumber: 1,
    digits: 3,
    rows: 10,
    columns: 20,
    origin: [100, 100],
    cellWidth: 40,
    cellHeight: 30,
    columnSpacing: 0,
    rowSpacing: 0,
    numbering: "across",
    startRow: "south",
    startColumn: "west",
    reverseAlternate: false,
    rotation: 0,
    skip: [],
    ...patch,
  };
}

function plan(patch: Partial<GridSpec> = {}, existing: ExistingPlot[] = []) {
  const result = planGrid(spec(patch), SECTION, existing);
  if (!result.ok) throw new Error(`planGrid refused: ${JSON.stringify(result.error)}`);
  return result.value;
}

function byCode(p: ReturnType<typeof plan>, code: string) {
  const found = p.plots.find((x) => x.code === code);
  if (found === undefined) throw new Error(`no plot ${code}`);
  return found;
}

describe("codes", () => {
  it("pads a number to the digits asked", () => {
    expect(formatCode("C", 7, 3)).toBe("C007");
    expect(formatCode("", 12, 4)).toBe("0012");
  });

  it("writes the whole number when it needs more digits", () => {
    expect(formatCode("P", 100, 2)).toBe("P100");
    expect(formatCode("P", 1000, 3)).toBe("P1000");
  });
});

describe("10 rows by 20 columns with prefix C", () => {
  it("gives 200 distinct codes from C001 to C200", () => {
    const p = plan();
    expect(p.count).toBe(200);
    expect(p.first).toBe("C001");
    expect(p.last).toBe("C200");
    expect(new Set(p.plots.map((x) => x.code)).size).toBe(200);
    expect(p.plots[0]?.code).toBe("C001");
    expect(p.plots[199]?.code).toBe("C200");
    expect(p.plots.map((x) => x.number)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
  });

  it("starts at the south west corner and numbers across", () => {
    const p = plan();
    expect(byCode(p, "C001").footprint).toEqual([[100, 100], [140, 100], [140, 130], [100, 130]]);
    expect(byCode(p, "C002").footprint).toEqual([[140, 100], [180, 100], [180, 130], [140, 130]]);
    expect(byCode(p, "C021").footprint).toEqual([[100, 130], [140, 130], [140, 160], [100, 160]]);
  });

  it("can start at the north row", () => {
    // Rows run 100 to 400. The northern row is y 370 to 400.
    expect(byCode(plan({ startRow: "north" }), "C001").footprint).toEqual([[100, 370], [140, 370], [140, 400], [100, 400]]);
  });

  it("can start at the east column", () => {
    // Columns run 100 to 900. The eastern column is x 860 to 900.
    expect(byCode(plan({ startColumn: "east" }), "C001").footprint).toEqual([[860, 100], [900, 100], [900, 130], [860, 130]]);
  });

  it("numbers down a column first when asked", () => {
    const p = plan({ numbering: "down" });
    expect(byCode(p, "C002").row).toBe(2);
    expect(byCode(p, "C002").column).toBe(1);
    expect(byCode(p, "C002").footprint).toEqual([[100, 130], [140, 130], [140, 160], [100, 160]]);
    expect(byCode(p, "C011").column).toBe(2);
    expect(byCode(p, "C011").row).toBe(1);
  });

  it("reverses every second row", () => {
    const p = plan({ reverseAlternate: true });
    expect(byCode(p, "C020").column).toBe(20);
    expect(byCode(p, "C021").column).toBe(20);
    expect(byCode(p, "C021").row).toBe(2);
    expect(byCode(p, "C040").column).toBe(1);
    expect(byCode(p, "C041").column).toBe(1);
    expect(byCode(p, "C041").row).toBe(3);
    expect(byCode(p, "C021").footprint).toEqual([[860, 130], [900, 130], [900, 160], [860, 160]]);
  });

  it("reverses every second column when numbering down", () => {
    const p = plan({ numbering: "down", reverseAlternate: true });
    expect(byCode(p, "C011").row).toBe(10);
    expect(byCode(p, "C011").column).toBe(2);
    expect(byCode(p, "C020").row).toBe(1);
  });

  it("leaves spacing between cells", () => {
    const p = plan({ columnSpacing: 10, rowSpacing: 5 });
    expect(byCode(p, "C002").footprint[0]).toEqual([150, 100]);
    expect(byCode(p, "C021").footprint[0]).toEqual([100, 135]);
  });
});

describe("gaps", () => {
  it("keeps every other number when a place is skipped", () => {
    const p = plan({ skip: [{ row: 1, column: 2 }] });
    expect(p.count).toBe(199);
    expect(p.plots.some((x) => x.code === "C002")).toBe(false);
    expect(byCode(p, "C003").column).toBe(3);
    expect(p.first).toBe("C001");
    expect(p.last).toBe("C200");
    expect(p.skipped).toEqual([{ row: 1, column: 2, number: 2 }]);
  });

  it("drops a corner place and its code", () => {
    const p = plan({ skip: [{ row: 10, column: 20 }] });
    expect(p.count).toBe(199);
    expect(p.last).toBe("C199");
    expect(p.skipped).toEqual([{ row: 10, column: 20, number: 200 }]);
  });

  it("reads skip ranges", () => {
    expect(parseSkips("10/20", 10, 20)).toEqual({ ok: true, value: [{ row: 10, column: 20 }] });
    const block = parseSkips("9-10/19-20", 10, 20);
    expect(block.ok && block.value.length).toBe(4);
    const row = parseSkips("1/*", 10, 20);
    expect(row.ok && row.value.length).toBe(20);
    const two = parseSkips("1/1; 2/2", 10, 20);
    expect(two.ok && two.value).toEqual([{ row: 1, column: 1 }, { row: 2, column: 2 }]);
    expect(parseSkips("", 10, 20)).toEqual({ ok: true, value: [] });
  });

  it("refuses a skip outside the grid or not understood", () => {
    for (const text of ["11/1", "0/1", "1/21", "a/b", "1", "3-1/1", "1/1/1"]) {
      expect(parseSkips(text, 10, 20).ok, text).toBe(false);
    }
  });
});

describe("digits and length", () => {
  it("does not cut a number that is longer than the digits", () => {
    const p = plan({ prefix: "P", firstNumber: 99, digits: 2, rows: 1, columns: 3 });
    expect(p.plots.map((x) => x.code)).toEqual(["P99", "P100", "P101"]);
  });

  it("refuses a code longer than 24 characters", () => {
    const r = planGrid(spec({ prefix: "A".repeat(22), rows: 1, columns: 1 }), SECTION, []);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("over_limit");
      expect(r.error.detail?.["item"]).toBe("plotCodeChars");
    }
  });

  it("accepts a code of exactly 24 characters", () => {
    const r = planGrid(spec({ prefix: "A".repeat(21), rows: 1, columns: 1 }), SECTION, []);
    expect(r.ok).toBe(true);
  });
});

describe("rotation", () => {
  it("turns a quarter turn about the origin", () => {
    const p = plan({ rows: 2, columns: 2, cellWidth: 10, cellHeight: 10, rotation: 90, origin: [100, 100] });
    expect(byCode(p, "C001").footprint).toEqual([[100, 100], [100, 110], [90, 110], [90, 100]]);
  });

  it("keeps a shared edge shared after rounding", () => {
    const p = plan({ rotation: 37, origin: [5000, 5000], cellWidth: 40, cellHeight: 30 });
    const key = (pt: readonly [number, number]) => `${pt[0]},${pt[1]}`;
    const c1 = byCode(p, "C001").footprint;
    const c2 = byCode(p, "C002").footprint;
    const c21 = byCode(p, "C021").footprint;
    expect(key(c1[1] as [number, number])).toBe(key(c2[0] as [number, number]));
    expect(key(c1[2] as [number, number])).toBe(key(c2[3] as [number, number]));
    expect(key(c1[3] as [number, number])).toBe(key(c21[0] as [number, number]));
    const corners = new Set(p.plots.flatMap((x) => x.footprint.map(key)));
    expect(corners.size).toBe(11 * 21);
  });

  it("refuses a plot that would leave the site and names its code", () => {
    const r = planGrid(spec({ rotation: 90 }), SECTION, []);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("out_of_bounds");
      // Rows run north from y 100. After a quarter turn the fourth row (C061) is the first to reach a negative east value.
      expect(r.error.detail?.["code"]).toBe("C061");
    }
  });

  it("refuses an unrotated grid that runs past 10,000", () => {
    const r = planGrid(spec({ origin: [9900, 100], columns: 20 }), SECTION, []);
    expect(r.ok).toBe(false);
  });
});

describe("size and capacity", () => {
  it("accepts 100 rows by 20 columns, which fills the site", () => {
    const r = planGrid(spec({ rows: 100, columns: 20, cellWidth: 20, cellHeight: 20 }), SECTION, []);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.count).toBe(2000);
  });

  it("refuses one plot more than the site holds", () => {
    const r = planGrid(spec({ rows: 100, columns: 21, cellWidth: 20, cellHeight: 20 }), SECTION, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detail?.["item"]).toBe("plotsPerSite");
  });

  it("refuses 101 rows and 101 columns by name", () => {
    const rows = planGrid(spec({ rows: 101, columns: 1 }), SECTION, []);
    expect(!rows.ok && rows.error.detail?.["item"]).toBe("gridRows");
    const columns = planGrid(spec({ rows: 1, columns: 101 }), SECTION, []);
    expect(!columns.ok && columns.error.detail?.["item"]).toBe("gridColumns");
  });

  it("refuses zero rows and zero columns", () => {
    expect(planGrid(spec({ rows: 0 }), SECTION, []).ok).toBe(false);
    expect(planGrid(spec({ columns: 0 }), SECTION, []).ok).toBe(false);
  });

  it("counts the plots already in the site", () => {
    const existing: ExistingPlot[] = [{ plotId: "x", code: "Z1", priorCodes: [], sectionId: "other", sectionName: "Other" }];
    const r = planGrid(spec({ rows: 100, columns: 20, cellWidth: 20, cellHeight: 20 }), SECTION, existing);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detail?.["item"]).toBe("plotsPerSite");
  });
});

describe("preview against stored plots", () => {
  let planned: ReturnType<typeof plan>;
  let existing: ExistingPlot[];

  beforeAll(() => {
    planned = plan();
    existing = makeExisting(planned);
  });

  function makeExisting(base: ReturnType<typeof plan>): ExistingPlot[] {
    const fp = (code: string) => byCode(base, code).footprint;
    return [
    { plotId: "p1", code: "C001", priorCodes: [], sectionId: "s1", sectionName: "Paper", footprint: fp("C001") },
    {
      plotId: "p2",
      code: "c002",
      priorCodes: [],
      sectionId: "s1",
      sectionName: "Paper",
      footprint: [[1, 1], [2, 1], [2, 2], [1, 2]],
    },
    { plotId: "p3", code: "C003", priorCodes: [], sectionId: "s2", sectionName: "North" },
    { plotId: "p4", code: "C004", priorCodes: [], sectionId: "s1", sectionName: "Paper" },
    { plotId: "p5", code: "X9", priorCodes: ["C005"], sectionId: "s2", sectionName: "North" },
    ];
  }

  it("separates added, retained, moved and collisions", () => {
    const p = plan({}, existing);
    expect(p.retained.map((r) => [r.plot.code, r.plotId])).toEqual([["C001", "p1"]]);
    expect(p.moved.map((r) => [r.plot.code, r.plotId])).toEqual([["C002", "p2"], ["C004", "p4"]]);
    expect(p.collisions.map((c) => [c.code, c.sectionName])).toEqual([["C003", "North"], ["C005", "North"]]);
    expect(p.added.length).toBe(195);
    expect(p.added.some((x) => ["C001", "C002", "C003", "C004", "C005"].includes(x.code))).toBe(false);
    expect(p.count).toBe(200);
  });

  it("reports zero added when the same plan is made after it was applied", () => {
    const applied: ExistingPlot[] = planned.plots.map((x, i) => ({
      plotId: `id${i}`,
      code: x.code,
      priorCodes: [],
      sectionId: "s1",
      sectionName: "Paper",
      footprint: x.footprint,
    }));
    const again = plan({}, applied);
    expect(again.added.length).toBe(0);
    expect(again.retained.length).toBe(200);
    expect(again.moved.length).toBe(0);
    expect(again.collisions.length).toBe(0);
  });
});

describe("the apply command", () => {
  it("holds one new plot and one new space per added place, with fresh IDs", () => {
    let n = 0;
    const newId = () => `id-${++n}`;
    const command = gridCommand(plan(), SECTION, newId);
    expect(command.type).toBe("layout_apply");
    if (command.type !== "layout_apply") return;
    expect(command.sections).toEqual([{ sectionId: "s1", name: "Paper" }]);
    expect(command.plots?.length).toBe(200);
    const ids = command.plots?.flatMap((x) => [x.plotId, ...x.spaces.map((s) => s.spaceId)]) ?? [];
    // 200 plots, each with one plot ID and one space ID.
    expect(ids.length).toBe(400);
    expect(new Set(ids).size).toBe(400);
    expect(command.plots?.[0]).toMatchObject({ code: "C001", sectionId: "s1" });
    expect(command.moves ?? []).toEqual([]);
  });

  it("includes a moved plot only when the keeper approved it", () => {
    const p = plan({}, [
      { plotId: "p2", code: "C002", priorCodes: [], sectionId: "s1", sectionName: "Paper", footprint: [[1, 1], [2, 1], [2, 2], [1, 2]] },
    ]);
    let n = 0;
    const none = gridCommand(p, SECTION, () => `a${++n}`);
    expect(none.type === "layout_apply" && (none.moves ?? []).length).toBe(0);
    const approved = gridCommand(p, SECTION, () => `b${++n}`, ["p2"]);
    expect(approved.type === "layout_apply" && approved.moves).toEqual([{ plotId: "p2", footprint: byCode(p, "C002").footprint }]);
  });

  it("holds no plot at all when everything is already stored", () => {
    const applied: ExistingPlot[] = plan().plots.map((x, i) => ({
      plotId: `id${i}`,
      code: x.code,
      priorCodes: [],
      sectionId: "s1",
      sectionName: "Paper",
      footprint: x.footprint,
    }));
    const command = gridCommand(plan({}, applied), SECTION, () => "unused");
    expect(command.type === "layout_apply" && (command.plots ?? []).length).toBe(0);
  });
});

describe("bulk renumber", () => {
  it("lists every old and new code in order", () => {
    const steps = planRenumber(
      [
        { plotId: "a", code: "C001" },
        { plotId: "b", code: "C002" },
        { plotId: "c", code: "C003" },
      ],
      { prefix: "N", firstNumber: 10, digits: 3 },
    );
    expect(steps).toEqual({
      ok: true,
      value: [
        { plotId: "a", from: "C001", to: "N010" },
        { plotId: "b", from: "C002", to: "N011" },
        { plotId: "c", from: "C003", to: "N012" },
      ],
    });
  });

  it("leaves out a plot whose code does not change", () => {
    const steps = planRenumber([{ plotId: "a", code: "C001" }, { plotId: "b", code: "C009" }], {
      prefix: "C",
      firstNumber: 1,
      digits: 3,
    });
    expect(steps).toEqual({ ok: true, value: [{ plotId: "b", from: "C009", to: "C002" }] });
  });

  it("refuses a new code longer than 24 characters", () => {
    expect(planRenumber([{ plotId: "a", code: "C1" }], { prefix: "A".repeat(23), firstNumber: 1, digits: 3 }).ok).toBe(false);
  });
});

// P22 (task 18): the live preview of the form. Expected values are worked by hand from the numbering rules.
// A 10 by 20 grid has 200 places numbered 1 to 200. With numbering across and no reversal, place 200 is row 10,
// column 20. With reverse alternate rows, row 10 is a second line (an even row), so it runs east to west and
// number 200 sits at column 1. With numbering down, column 20 is the 20th line (even): with reversal it runs
// from the south up, so number 200 sits at row 1.
describe("previewGrid (P22)", () => {
  function input(patch: Partial<GridPreviewInput> = {}): GridPreviewInput {
    return {
      prefix: "C",
      firstNumber: 1,
      digits: 3,
      rows: 10,
      columns: 20,
      numbering: "across",
      startRow: "south",
      startColumn: "west",
      reverseAlternate: false,
      skip: [],
      ...patch,
    };
  }

  function preview(patch: Partial<GridPreviewInput> = {}, taken?: ReadonlySet<string>) {
    const result = previewGrid(input(patch), taken);
    if (!result.ok) throw new Error(`previewGrid refused: ${JSON.stringify(result.error)}`);
    return result.value;
  }

  it("gives 200, C001 and C200 for 10 by 20 with prefix C", () => {
    const p = preview();
    expect(p.count).toBe(200);
    expect(p.first).toBe("C001");
    expect(p.last).toBe("C200");
    expect(p.skipped).toBe(0);
    expect(p.cells).toHaveLength(200);
  });

  it("needs no size, position or spacing, so only the rows, columns and prefix make the three lines", () => {
    const p = preview({ firstNumber: 1, digits: 3, rows: 10, columns: 20, prefix: "C" });
    expect([p.count, p.first, p.last]).toEqual([200, "C001", "C200"]);
  });

  it("numbers down: 3 rows by 4 columns from 5 with 2 digits and prefix P gives P05 to P16", () => {
    const p = preview({ prefix: "P", firstNumber: 5, digits: 2, rows: 3, columns: 4, numbering: "down" });
    expect([p.count, p.first, p.last]).toEqual([12, "P05", "P16"]);
    // Down: the first line is column 1, from the start row. The south start row is row 1, so row 1 column 1 is 5,
    // row 2 column 1 is 6, row 3 column 1 is 7, and row 1 column 2 is 8.
    const at = (row: number, column: number) => p.cells.find((c) => c.row === row && c.column === column)?.number;
    expect([at(1, 1), at(2, 1), at(3, 1), at(1, 2)]).toEqual([5, 6, 7, 8]);
  });

  it("numbers across: row 1 column 20 is 20 and row 2 column 1 is 21", () => {
    const p = preview();
    const at = (row: number, column: number) => p.cells.find((c) => c.row === row && c.column === column)?.number;
    expect([at(1, 1), at(1, 20), at(2, 1)]).toEqual([1, 20, 21]);
  });

  it("reverses the second row, so row 2 column 20 is 21 and row 2 column 1 is 40", () => {
    const p = preview({ reverseAlternate: true });
    const at = (row: number, column: number) => p.cells.find((c) => c.row === row && c.column === column)?.number;
    expect([at(2, 20), at(2, 1), at(3, 1)]).toEqual([21, 40, 41]);
    expect([p.count, p.first, p.last]).toEqual([200, "C001", "C200"]);
  });

  it("leaves the first number gap when the first place is skipped", () => {
    const p = preview({ skip: [{ row: 1, column: 1 }] });
    expect([p.count, p.first, p.last, p.skipped]).toEqual([199, "C002", "C200", 1]);
  });

  it("gives C199 as the last code when place 10/20 is skipped across", () => {
    const p = preview({ skip: [{ row: 10, column: 20 }] });
    expect([p.count, p.first, p.last]).toEqual([199, "C001", "C199"]);
  });

  it("keeps C200 as the last code when 10/1 is skipped across, and gives C199 when the rows reverse", () => {
    const skip = [{ row: 10, column: 1 }];
    expect(preview({ skip }).last).toBe("C200");
    expect(preview({ skip, reverseAlternate: true }).last).toBe("C199");
  });

  it("follows numbering down: 10/20 gives C199, 1/20 keeps C200, and 1/20 with reversal gives C199", () => {
    expect(preview({ numbering: "down", skip: [{ row: 10, column: 20 }] }).last).toBe("C199");
    expect(preview({ numbering: "down", skip: [{ row: 1, column: 20 }] }).last).toBe("C200");
    expect(preview({ numbering: "down", reverseAlternate: true, skip: [{ row: 1, column: 20 }] }).last).toBe("C199");
  });

  it("gives no first or last code when every place is skipped", () => {
    const skips = parseSkips("*/*", 10, 20);
    if (!skips.ok) throw new Error("skips refused");
    const p = preview({ skip: skips.value });
    expect(p.count).toBe(0);
    expect(p.first).toBeUndefined();
    expect(p.last).toBeUndefined();
    expect(p.skipped).toBe(200);
  });

  it("counts only codes that no plot holds, by the normalised code, and still names the first and last planned code", () => {
    const taken = new Set([normalizeCode("C001"), normalizeCode("c002"), normalizeCode("C200")]);
    const p = preview({}, taken);
    expect(p.count).toBe(197);
    expect([p.first, p.last]).toEqual(["C001", "C200"]);
  });

  it("writes the whole number when it needs more digits", () => {
    const p = preview({ firstNumber: 950, digits: 3, rows: 10, columns: 20 });
    expect([p.first, p.last]).toEqual(["C950", "C1149"]);
  });

  it("refuses a size outside 1 to 100 and a code longer than 24 characters, naming the item", () => {
    const zero = previewGrid(input({ rows: 0 }));
    expect(zero.ok).toBe(false);
    const wide = previewGrid(input({ columns: 101 }));
    expect(wide.ok).toBe(false);
    const long = previewGrid(input({ prefix: "A".repeat(22) }));
    expect(long).toMatchObject({ ok: false, error: { code: "over_limit" } });
  });

  it("gives the same count, first and last as planGrid for the same form", () => {
    const cases: { patch: Partial<GridSpec>; form: Partial<GridPreviewInput> }[] = [
      { patch: {}, form: {} },
      { patch: { numbering: "down" }, form: { numbering: "down" } },
      { patch: { reverseAlternate: true, skip: [{ row: 10, column: 1 }] }, form: { reverseAlternate: true, skip: [{ row: 10, column: 1 }] } },
      { patch: { numbering: "down", reverseAlternate: true, startRow: "north", startColumn: "east", skip: [{ row: 1, column: 20 }, { row: 5, column: 5 }] }, form: { numbering: "down", reverseAlternate: true, startRow: "north", startColumn: "east", skip: [{ row: 1, column: 20 }, { row: 5, column: 5 }] } },
      { patch: { firstNumber: 40, digits: 2, prefix: "Q", rows: 4, columns: 7 }, form: { firstNumber: 40, digits: 2, prefix: "Q", rows: 4, columns: 7 } },
    ];
    for (const { patch, form } of cases) {
      const planned = plan(patch);
      const p = preview(form);
      expect([p.count, p.first, p.last], JSON.stringify(form)).toEqual([planned.count, planned.first, planned.last]);
    }
  });
});
