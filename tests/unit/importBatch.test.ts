// T07 (staged import: atomic, stable source refs, changed rows, left out rows). Requirements P9.
// The sheet is Burials on the paper test adapter. The 200 row book is in paperBook.test.ts.
import { describe, expect, it } from "vitest";
import { parseCsv } from "../../template/src/data/csv";
import {
  buildSourceRef,
  canCommit,
  chooseConflict,
  commitImport,
  fixRow,
  keySourceOfDraft,
  leaveOut,
  leftOutCsv,
  restoreRow,
  stageImport,
  uniqueKeysFor,
} from "../../template/src/data/importBatch";
import type { StagedImport } from "../../template/src/data/importBatch";
import { applyMapping, fieldsForSheet, suggestMapping } from "../../template/src/data/mapping";
import { requestResult } from "../../template/src/data/db";
import type { DateOrder } from "../../template/src/calendar";
import { mintId } from "../../template/src/site";
import { fid } from "../helpers/site";
import { failingDb, quotaError } from "../helpers/failStorage";
import { PaperEnv, burialsImporter, paperAdapter } from "../helpers/paperAdapter";
import type { PaperCommand, PaperEvent, PaperState } from "../helpers/paperAdapter";

const SECTION = "00000000-0000-4000-8000-0000000000e1";
const ON = "2026-04-20";
type Staged = StagedImport<PaperState, PaperCommand, PaperEvent>;

function counter(start = 0x1000) {
  let n = start;
  return () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
}

async function siteWithPlots(): Promise<PaperEnv> {
  const env = await PaperEnv.create();
  const codes = ["P01", "P02", "P03", "P04", "P05", "P06"];
  await env.dispatch([
    {
      type: "layout_apply",
      sections: [{ sectionId: SECTION, name: "Paper" }],
      plots: codes.map((code) => ({
        plotId: fid(`plot:${code}`),
        code,
        sectionId: SECTION,
        spaces: [{ spaceId: fid(`space:${code}`) }],
      })),
    },
  ]);
  return env;
}

function stageText(env: PaperEnv, text: string, dateOrder?: DateOrder): Staged {
  const read = parseCsv(text, { separator: "comma" });
  if (!read.ok) throw new Error(`csv refused: ${JSON.stringify(read.error)}`);
  const sheet = paperAdapter.sheets[0]!;
  const fields = fieldsForSheet(sheet, paperAdapter.fields);
  const mapping = suggestMapping(read.value.headings, fields);
  const options = dateOrder === undefined ? undefined : { dateOrder };
  const mapped = applyMapping(read.value, mapping, sheet, paperAdapter.fields, options);
  if (!mapped.ok) throw new Error(`mapping refused: ${JSON.stringify(mapped.error)}`);
  return stageImport({
    register: env.register,
    importer: burialsImporter,
    rows: mapped.value,
    columns: mapping.columns,
    sheet,
    fields: paperAdapter.fields,
    state: env.state,
    siteId: env.site.id,
    baseRevision: env.revision,
    effectiveOn: ON,
    options: { newId: counter(), ...(dateOrder === undefined ? {} : { dateOrder }) },
  });
}

async function commitAndSync(env: PaperEnv, staged: Staged, opId: string = mintId()) {
  const result = await commitImport(env.db, staged, { opId });
  if (result.ok && !result.replayed) {
    env.state = await env.reload();
    env.revision = result.revision;
  }
  return result;
}

const HEAD = "Source ref,Name,Section,Plot,Burial date,Page\n";
const FILE_A =
  HEAD +
  [
    "R1,Alder Ashgrove,Paper,P01,1850,P1",
    "R2,Brindle Ashgrove,Paper,P02,1851-02,P1",
    "R3,Cove Ashgrove,,,unknown,P1",
    "R4,Dunmore Ashgrove,Paper,P99,1853,P1",
    "R5,Elspin Ashgrove,Paper,P03,1854-03-03,P1",
  ].join("\n") +
  "\n";
const FILE_GOOD =
  HEAD +
  ["R1,Alder Ashgrove,Paper,P01,1850,P1", "R2,Brindle Ashgrove,Paper,P02,1851-02,P1", "R3,Cove Ashgrove,,,unknown,P1", "R5,Elspin Ashgrove,Paper,P03,1854-03-03,P1"].join("\n") +
  "\n";

describe("staging", () => {
  it("counts ready, unplaced and errors, and the counts add up to the rows", async () => {
    const env = await siteWithPlots();
    const staged = stageText(env, FILE_A);
    expect(staged.counts).toEqual({ ready: 3, unchanged: 0, unplaced: 1, conflicts: 0, errors: 1, leftOut: 0 });
    expect(Object.values(staged.counts).reduce((a, b) => a + b, 0)).toBe(5);
    expect(staged.rows.map((r) => r.status)).toEqual(["ready", "ready", "unplaced", "error", "ready"]);
    // R1, R2, R3 and R5 write. R4 is an error and writes nothing.
    expect(staged.writes).toBe(4);
  });

  it("names the failing row, heading, value and fix", async () => {
    const env = await siteWithPlots();
    const row = stageText(env, FILE_A).rows[3];
    expect(row?.errors).toEqual([
      { row: 4, field: "plot", heading: "Plot", value: "P99", code: "unknown_plot", fix: "check_plot_code" },
    ]);
  });

  it("writes nothing: the state, the revision and the stored events are unchanged", async () => {
    const env = await siteWithPlots();
    const before = structuredClone(env.state);
    const revision = env.revision;
    const events = await env.eventCount();
    stageText(env, FILE_GOOD);
    expect(env.state).toEqual(before);
    expect(env.revision).toBe(revision);
    expect(await env.eventCount()).toBe(events);
  });

  it("keeps a row with no location as Location to confirm and never gives it a plot", async () => {
    const env = await siteWithPlots();
    const staged = stageText(env, HEAD + "R9,P01,,,1850,P1\n");
    expect(staged.rows[0]).toMatchObject({ status: "unplaced", placement: "unplaced" });
    const command = staged.rows[0]?.commands[0];
    expect(command).toMatchObject({ type: "record_burial", name: "P01" });
    expect((command as { plotId?: string }).plotId).toBeUndefined();
    expect((command as { spaceId?: string }).spaceId).toBeUndefined();
  });

  it("identifies a row by its exact source ref: R1 and r1 are two records", async () => {
    const env = await siteWithPlots();
    const staged = stageText(env, HEAD + "R1,A One,,,1850,\nr1,A Two,,,1850,\n");
    expect(staged.counts.unplaced).toBe(2);
  });

  it("keeps two people with one name apart", async () => {
    const env = await siteWithPlots();
    const staged = stageText(env, HEAD + "R10,Mirel Quillmoss,Paper,P01,1850,P1\nR11,Mirel Quillmoss,Paper,P02,1851,P2\n");
    expect(staged.counts).toMatchObject({ ready: 2, conflicts: 0, errors: 0 });
    const result = await commitAndSync(env, staged);
    expect(result.ok).toBe(true);
    const people = Object.values(env.state.burials);
    expect(people.length).toBe(2);
    expect(new Set(people.map((b) => b.burialId)).size).toBe(2);
    expect(people.map((b) => b.name)).toEqual(["Mirel Quillmoss", "Mirel Quillmoss"]);
  });

  it("dry runs each row on the rows before it, so a second claim on one plot is an error on that row", async () => {
    const env = await siteWithPlots();
    const staged = stageText(env, HEAD + "R1,A,Paper,P01,1850,\nR2,B,Paper,P01,1851,\n");
    expect(staged.rows.map((r) => r.status)).toEqual(["ready", "error"]);
    expect(staged.rows[1]?.errors[0]).toMatchObject({ field: "plot", code: "space_taken", detail: { sourceRef: "R1" } });
  });

  it("reads a date with the order chosen for the whole import", async () => {
    const env = await siteWithPlots();
    const text = HEAD + "R1,A,Paper,P01,03/04/2026,\n";
    const read = parseCsv(text, { separator: "comma" });
    if (!read.ok) throw new Error("csv");
    const sheet = paperAdapter.sheets[0]!;
    const fields = fieldsForSheet(sheet, paperAdapter.fields);
    const mapping = suggestMapping(read.value.headings, fields);
    const without = applyMapping(read.value, mapping, sheet, paperAdapter.fields);
    expect(without.ok && without.value[0]?.errors[0]?.code).toBe("date_ambiguous");
    const staged = stageText(env, text, "dmy");
    expect(staged.counts.ready).toBe(1);
    const command = staged.rows[0]?.commands[0] as { dateText: string; start?: string };
    expect(command.dateText).toBe("03/04/2026");
    expect(command.start).toBe("2026-04-03");
  });
});

describe("a missing or repeated source ref", () => {
  it("is an error on that row, and can be fixed by typing one", async () => {
    const env = await siteWithPlots();
    const staged = stageText(env, HEAD + "R1,A,Paper,P01,1850,\n,B,Paper,P02,1851,P1\n");
    expect(staged.rows[1]).toMatchObject({ rowNumber: 2, status: "error" });
    expect(staged.rows[1]?.errors[0]).toMatchObject({ row: 2, field: "sourceRef", code: "required" });
    expect(staged.counts).toMatchObject({ ready: 1, errors: 1 });
    expect(canCommit(staged)).toBe(false);

    const cells = { ...(staged.rows[1]?.cells as Record<string, string>), sourceRef: "R2" };
    const fixed = fixRow(staged, 2, cells);
    expect(fixed.rows[1]?.status).toBe("ready");
    expect(fixed.counts).toMatchObject({ ready: 2, errors: 0 });
    expect(canCommit(fixed)).toBe(true);
  });

  it("builds a ref from book, page and entry", () => {
    expect(buildSourceRef("B1", "P3", "E7")).toEqual({ ok: true, value: "B1/P3/E7" });
    expect(buildSourceRef(" B1 ", "", "E7")).toEqual({ ok: true, value: "B1/E7" });
    const none = buildSourceRef(" ", "", "");
    expect(!none.ok && none.error.code).toBe("required");
  });

  it("marks a repeat within the file on the later row and names the first", async () => {
    const env = await siteWithPlots();
    const staged = stageText(env, HEAD + "R1,A,Paper,P01,1850,\nR1,B,Paper,P02,1851,\n");
    expect(staged.rows.map((r) => r.status)).toEqual(["ready", "error"]);
    expect(staged.rows[1]?.errors[0]).toMatchObject({ code: "duplicate_source_ref", detail: { firstRow: 1 } });
  });

  it("a fixed row is checked again, so a bad fix stays an error", async () => {
    const env = await siteWithPlots();
    const staged = stageText(env, HEAD + ",B,Paper,P02,1851,\n");
    const bad = fixRow(staged, 1, { ...(staged.rows[0]?.cells as Record<string, string>), sourceRef: "", burialDate: "03/04/26" });
    expect(bad.rows[0]?.status).toBe("error");
    expect(bad.rows[0]?.errors.map((e) => e.code)).toEqual(["required", "date_year_needed"]);
  });
});

describe("committing", () => {
  it("refuses while a row is an error: nothing is written and the revision is the same", async () => {
    const env = await siteWithPlots();
    const staged = stageText(env, FILE_A);
    const events = await env.eventCount();
    const result = await commitImport(env.db, staged, { opId: fid("op1") });
    expect(result).toMatchObject({ ok: false, code: "import_has_errors", errors: 1 });
    expect(await env.eventCount()).toBe(events);
    expect(await env.reload()).toEqual(env.state);
  });

  it("writes every selected row in one revision, once", async () => {
    const env = await siteWithPlots();
    const before = env.revision;
    const staged = leaveOut(stageText(env, FILE_A), 4, "Plot not in the book");
    expect(staged.counts).toEqual({ ready: 3, unchanged: 0, unplaced: 1, conflicts: 0, errors: 0, leftOut: 1 });
    expect(canCommit(staged)).toBe(true);
    const result = await commitAndSync(env, staged);
    expect(result).toMatchObject({ ok: true, revision: before + 1, written: 4, unplaced: 1, replayed: false });
    expect(Object.keys(env.state.burials).length).toBe(4);
    expect(Object.values(env.state.burials).map((b) => b.sourceRef).sort()).toEqual(["R1", "R2", "R3", "R5"]);
    const placed = Object.values(env.state.burials).filter((b) => b.spaceId !== undefined);
    expect(placed.length).toBe(3);
  });

  it("returns the earlier result for a second press with the same operation ID", async () => {
    const env = await siteWithPlots();
    const staged = stageText(env, FILE_GOOD);
    const first = await commitAndSync(env, staged, fid("same-op"));
    const events = await env.eventCount();
    const second = await commitImport(env.db, staged, { opId: fid("same-op") });
    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(second).toMatchObject({ ok: true, replayed: true, revision: (first as { revision: number }).revision });
    expect(await env.eventCount()).toBe(events);
  });

  it("reserves a unique key for each new source ref", async () => {
    const env = await siteWithPlots();
    await commitAndSync(env, stageText(env, FILE_GOOD));
    const rows = (await requestResult(env.db.transaction("uniqueKeys").objectStore("uniqueKeys").getAll())) as { key: string; owner: string }[];
    const keys = rows.map((r) => r.key);
    for (const ref of ["R1", "R2", "R3", "R5"]) expect(keys).toContain(`source:Burials:${ref}`);
    expect(keys).toContain("code:p01");
  });

  it("writes nothing when the storage fails part way, and keeps the staged rows for a retry", async () => {
    const env = await siteWithPlots();
    const staged = stageText(env, FILE_GOOD);
    const events = await env.eventCount();
    const broken = failingDb(env.db, { store: "events", method: "add", error: quotaError(), skip: 2 });
    const result = await commitImport(broken, staged, { opId: fid("op-quota") });
    expect(result).toMatchObject({ ok: false, code: "quota" });
    expect(await env.eventCount()).toBe(events);
    expect(await env.reload()).toEqual(env.state);
    expect(staged.counts.ready).toBe(3);
    const retry = await commitAndSync(env, staged, fid("op-quota"));
    expect(retry).toMatchObject({ ok: true, replayed: false });
    expect(Object.keys(env.state.burials).length).toBe(4);
  });

  it("refuses a stale revision, writes nothing and says which revision is stored", async () => {
    const env = await siteWithPlots();
    const staged = stageText(env, FILE_GOOD);
    const other = await PaperEnv.create(); // a different register must not matter
    expect(other.revision).toBe(0);
    await env.dispatch([{ type: "layout_apply", north: 20 }]);
    const events = await env.eventCount();
    const result = await commitImport(env.db, staged, { opId: fid("op-stale") });
    expect(result).toMatchObject({ ok: false, code: "stale_revision", error: { current: env.revision } });
    expect(await env.eventCount()).toBe(events);
  });

  it("refuses to commit when nothing would be written", async () => {
    const env = await siteWithPlots();
    const staged = stageText(env, HEAD);
    expect(canCommit(staged)).toBe(false);
    expect(await commitImport(env.db, staged, { opId: fid("none") })).toMatchObject({ ok: false, code: "nothing_to_import" });
  });
});

describe("repeating a file", () => {
  async function imported() {
    const env = await siteWithPlots();
    await commitAndSync(env, stageText(env, FILE_GOOD));
    return env;
  }

  it("is Already in register for every row, with nothing new and nothing to write", async () => {
    const env = await imported();
    const again = stageText(env, FILE_GOOD);
    expect(again.counts).toEqual({ ready: 0, unchanged: 4, unplaced: 0, conflicts: 0, errors: 0, leftOut: 0 });
    expect(again.writes).toBe(0);
    expect(again.drafts).toEqual([]);
    expect(canCommit(again)).toBe(false);
  });

  it("gives the same answer in any row order", async () => {
    const env = await imported();
    const lines = FILE_GOOD.trim().split("\n");
    const reversed = [lines[0], ...lines.slice(1).reverse()].join("\n") + "\n";
    const again = stageText(env, reversed);
    expect(again.counts).toEqual({ ready: 0, unchanged: 4, unplaced: 0, conflicts: 0, errors: 0, leftOut: 0 });
  });

  it("does not depend on the line number: a row moved to the top is the same row", async () => {
    const env = await imported();
    const lines = FILE_GOOD.trim().split("\n");
    const moved = [lines[0], lines[4], lines[1], lines[2], lines[3]].join("\n") + "\n";
    expect(stageText(env, moved).counts.unchanged).toBe(4);
  });

  it("ignores spacing around a value, but keeps the source ref exact", async () => {
    const env = await imported();
    const spaced = HEAD + "R1,  Alder   Ashgrove ,Paper, P01 ,1850,P1\n";
    expect(stageText(env, spaced).counts).toMatchObject({ unchanged: 1, conflicts: 0 });
  });

  it("shows a changed row as a conflict with its before and after, and writes nothing yet", async () => {
    const env = await imported();
    const changed = FILE_GOOD.replace("Brindle Ashgrove", "Brindle Ashgrove Smith");
    const staged = stageText(env, changed);
    expect(staged.counts).toEqual({ ready: 0, unchanged: 3, unplaced: 0, conflicts: 1, errors: 0, leftOut: 0 });
    const row = staged.rows.find((r) => r.status === "conflict");
    expect(row?.sourceRef).toBe("R2");
    expect(row?.before?.["name"]).toBe("Brindle Ashgrove");
    expect(row?.after?.["name"]).toBe("Brindle Ashgrove Smith");
    expect(canCommit(staged)).toBe(false);
    const events = await env.eventCount();
    expect(await commitImport(env.db, staged, { opId: fid("c1") })).toMatchObject({ ok: false, code: "import_has_conflicts", conflicts: 1 });
    expect(await env.eventCount()).toBe(events);
  });

  it("keeps the current row when told to, and then has nothing to write", async () => {
    const env = await imported();
    const staged = chooseConflict(stageText(env, FILE_GOOD.replace("Brindle Ashgrove", "Brindle Ashgrove Smith")), 2, "keep_current");
    expect(staged.counts).toMatchObject({ conflicts: 0, unchanged: 4, ready: 0 });
    expect(canCommit(staged)).toBe(false);
  });

  it("records a correction when told to, in one revision, and changes only that row", async () => {
    const env = await imported();
    const before = structuredClone(env.state.burials);
    const staged = chooseConflict(stageText(env, FILE_GOOD.replace("Brindle Ashgrove", "Brindle Ashgrove Smith")), 2, "record_correction");
    expect(staged.counts).toMatchObject({ conflicts: 0, unchanged: 3, ready: 1 });
    expect(canCommit(staged)).toBe(true);
    const revision = env.revision;
    const result = await commitAndSync(env, staged);
    expect(result).toMatchObject({ ok: true, revision: revision + 1, written: 1 });
    const after = env.state.burials;
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    const changed = Object.values(after).filter((b) => b.name !== before[b.burialId]?.name);
    expect(changed.map((b) => [b.sourceRef, b.name])).toEqual([["R2", "Brindle Ashgrove Smith"]]);
  });

  it("places an unplaced burial through a correction when the plot is filled in", async () => {
    const env = await imported();
    const placed = FILE_GOOD.replace("R3,Cove Ashgrove,,,unknown,P1", "R3,Cove Ashgrove,Paper,P04,unknown,P1");
    const staged = chooseConflict(stageText(env, placed), 3, "record_correction");
    const result = await commitAndSync(env, staged);
    expect(result.ok).toBe(true);
    const burial = Object.values(env.state.burials).find((b) => b.sourceRef === "R3");
    expect(burial?.plotId).toBe(fid("plot:P04"));
    expect(burial?.spaceId).toBe(fid("space:P04"));
  });

  it("refuses to move a placed burial by import and names the route", async () => {
    const env = await imported();
    const moved = FILE_GOOD.replace("R1,Alder Ashgrove,Paper,P01", "R1,Alder Ashgrove,Paper,P05");
    const staged = chooseConflict(stageText(env, moved), 1, "record_correction");
    // The refusal shows on the row as an error, with the route, and the import cannot commit.
    const row = staged.rows.find((r) => r.sourceRef === "R1");
    expect(row).toMatchObject({ status: "error", choice: "record_correction" });
    expect(row?.errors[0]).toMatchObject({ code: "taken_needs_correction", fix: "correct_entry" });
    expect(staged.counts.errors).toBe(1);
    expect(canCommit(staged)).toBe(false);
  });
});

describe("leaving a row out", () => {
  it("moves it to the left out list, revises the counts and can put it back", async () => {
    const env = await siteWithPlots();
    const staged = stageText(env, FILE_A);
    const left = leaveOut(staged, 4, "Not in the book");
    expect(left.rows[3]).toMatchObject({ status: "left_out", leftOutReason: "Not in the book" });
    expect(left.counts).toMatchObject({ errors: 0, leftOut: 1, ready: 3, unplaced: 1 });
    const back = restoreRow(left, 4);
    expect(back.rows[3]?.status).toBe("error");
    expect(back.counts).toMatchObject({ errors: 1, leftOut: 0 });
  });

  it("re runs the later rows: leaving out the first claim frees the plot for the second", async () => {
    const env = await siteWithPlots();
    const staged = stageText(env, HEAD + "R1,A,Paper,P01,1850,\nR2,B,Paper,P01,1851,\n");
    expect(staged.counts.errors).toBe(1);
    const left = leaveOut(staged, 1, "Duplicate plot");
    expect(left.rows.map((r) => r.status)).toEqual(["left_out", "ready"]);
    expect(left.counts).toMatchObject({ errors: 0, ready: 1, leftOut: 1 });
  });

  it("offers the source refs and reasons as a private download", async () => {
    const env = await siteWithPlots();
    const staged = leaveOut(stageText(env, FILE_A), 4, 'Plot "P99" is not in the book, check page 2');
    const text = leftOutCsv(staged, ["Row", "Source ref", "Reason"]);
    expect(text).toBe('\uFEFFRow,Source ref,Reason\r\n4,R4,"Plot ""P99"" is not in the book, check page 2"\r\n');
  });

  it("never writes a left out row", async () => {
    const env = await siteWithPlots();
    const staged = leaveOut(stageText(env, FILE_A), 4, "x");
    await commitAndSync(env, staged);
    expect(Object.values(env.state.burials).some((b) => b.sourceRef === "R4")).toBe(false);
  });
});

describe("unique keys", () => {
  it("reserves a code, a renamed code and an exact source ref", () => {
    const keys = uniqueKeysFor(
      [
        { type: "plot_added", fields: { plotId: "p1", code: " C001 ", sectionId: "s1" }, entityIds: ["p1", "sp1"] },
        { type: "plot_renamed", fields: { plotId: "p1", code: "N001" }, entityIds: ["p1"] },
        { type: "burial_recorded", fields: { sheet: "Burials", sourceRef: " r1 " }, entityIds: ["b1"], sourceRef: " r1 " },
        { type: "north_set", fields: { degrees: 5 }, entityIds: [] },
      ],
      new Map([["s1", "Paper"]]),
    );
    expect(keys).toEqual([
      { key: "code:c001", owner: "p1", label: "Paper" },
      { key: "code:n001", owner: "p1" },
      { key: "source:Burials: r1 ", owner: "b1" },
    ]);
  });

  it("reads a draft and a stored event the same way", () => {
    const draft = { event: { type: "burial_recorded", sheet: "Burials", sourceRef: "R9" }, entityIds: ["b9"], sourceRef: "R9", payloadVersion: 1 };
    expect(uniqueKeysFor([keySourceOfDraft(draft)])).toEqual([{ key: "source:Burials:R9", owner: "b9" }]);
  });
});
