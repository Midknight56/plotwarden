// The churchyard adapter and its Burials sheet (spec 03, task 3.6): T01 for this adapter and T07 for
// its sheet. Expected counts come from hand-totals.md sections 1 and 4: 8 burials, 7 placed, 1 unplaced.
import { beforeEach, describe, expect, it } from "vitest";
import { defineRegister } from "../../template/src/adapter";
import { BASE_COMMAND_TYPES } from "../../template/src/base";
import type { DateOrder } from "../../template/src/calendar";
import { parseCsv } from "../../template/src/data/csv";
import { chooseConflict, commitImport, stageImport } from "../../template/src/data/importBatch";
import type { StagedImport } from "../../template/src/data/importBatch";
import { applyMapping, fieldsForSheet, suggestMapping } from "../../template/src/data/mapping";
import { siteTotalsAt } from "../../template/src/status";
import { burialsImporter, churchAdapter } from "../../apps/churchyard-register/src/adapter";
import { BURIAL_FIELDS, BURIALS_SHEET } from "../../apps/churchyard-register/src/fields";
import { CHURCH_COMMAND_TYPES } from "../../apps/churchyard-register/src/types";
import type { ChurchCommand, ChurchEvent, ChurchState } from "../../apps/churchyard-register/src/types";
import { ChurchEnv, confirmEmpty, id, layoutYewWalk, plotId, spaceId } from "../helpers/churchEnv";

const HEAD = "Source ref,Recorded name,Name unknown,Section,Plot,Space,Burial date,Page";
const ROWS = [
  "LF-01,Edda Thornwick,,Yew Walk,Y01,,1871,p1",
  "LF-04,Harlan Mossgrove,,Yew Walk,Y04,,1902-03,p1",
  "LF-05,,yes,Yew Walk,Y05,,,p1",
  "LF-06,Ysolde Fenwick,,Yew Walk,Y06,,1938-11-14,p2",
  "LF-07A,Mirel Quillmoss,,Yew Walk,Y07,1,1889-06-02,p2",
  "LF-07B,Torin Pellwick,,Yew Walk,Y07,2,1921,p2",
  "LF-09,Corwin Aldersey,,Yew Walk,Y09,,1955,p3",
  "LF-H1,Perrin Gladwyn,,,,,1790,p3",
];
const csv = (rows: readonly string[]): string => `${[HEAD, ...rows].join("\n")}\n`;

let env: ChurchEnv;
let counter = 0;

type Staged = StagedImport<ChurchState, ChurchCommand, ChurchEvent>;

function stage(text: string, dateOrder?: DateOrder): Staged {
  const read = parseCsv(text);
  if (!read.ok) throw new Error(`csv refused: ${JSON.stringify(read.error)}`);
  const mapping = suggestMapping(read.value.headings, fieldsForSheet(BURIALS_SHEET, BURIAL_FIELDS));
  const mapped = applyMapping(read.value, mapping, BURIALS_SHEET, BURIAL_FIELDS, dateOrder === undefined ? undefined : { dateOrder });
  if (!mapped.ok) throw new Error(`mapping refused: ${JSON.stringify(mapped.error)}`);
  return stageImport({
    register: env.register,
    importer: burialsImporter,
    rows: mapped.value,
    columns: mapping.columns,
    sheet: BURIALS_SHEET,
    fields: BURIAL_FIELDS,
    state: env.state,
    siteId: env.site.id,
    baseRevision: env.revision,
    effectiveOn: "2026-04-20",
    options: { newId: () => id(`import:${++counter}`), events: [], ...(dateOrder === undefined ? {} : { dateOrder }) },
  });
}

async function stageWithEvents(text: string): Promise<Staged> {
  const read = parseCsv(text);
  if (!read.ok) throw new Error("csv refused");
  const mapping = suggestMapping(read.value.headings, fieldsForSheet(BURIALS_SHEET, BURIAL_FIELDS));
  const mapped = applyMapping(read.value, mapping, BURIALS_SHEET, BURIAL_FIELDS);
  if (!mapped.ok) throw new Error("mapping refused");
  return stageImport({
    register: env.register,
    importer: burialsImporter,
    rows: mapped.value,
    columns: mapping.columns,
    sheet: BURIALS_SHEET,
    fields: BURIAL_FIELDS,
    state: env.state,
    siteId: env.site.id,
    baseRevision: env.revision,
    effectiveOn: "2026-04-20",
    options: { newId: () => id(`import:${++counter}`), events: await env.events() },
  });
}

async function commitStaged(staged: Staged) {
  const out = await commitImport(env.db, staged, { opId: id(`op:${++counter}`) });
  await env.sync();
  return out;
}

beforeEach(async () => {
  counter = 0;
  env = await ChurchEnv.create();
  await layoutYewWalk(env);
});

describe("the churchyard adapter (T01)", () => {
  it("is accepted by defineRegister with churchyard spaces 1 to 12 and every command named", () => {
    const made = defineRegister(churchAdapter);
    expect(made.ok).toBe(true);
    expect(churchAdapter.kind).toBe("churchyard");
    expect(churchAdapter.spacesPerPlot).toEqual({ min: 1, max: 12 });
    for (const type of [...BASE_COMMAND_TYPES, ...CHURCH_COMMAND_TYPES]) expect(churchAdapter.commands).toContain(type);
    expect(churchAdapter.theme).toMatchObject({ ink: "#22252C", paper: "#FAF5E9" });
  });

  it("names the Burials sheet fields with the headings of the plan", () => {
    expect(churchAdapter.sheets.map((s) => s.name)).toEqual(["Burials"]);
    expect(BURIAL_FIELDS.map((f) => f.label)).toEqual(["Source ref", "Recorded name", "Name unknown", "Section", "Plot", "Space", "Burial date", "Page"]);
    expect(BURIAL_FIELDS.find((f) => f.key === "section")?.repeat).toBe("section");
    expect(BURIAL_FIELDS.find((f) => f.key === "recordedName")?.repeat).toBeUndefined();
  });
});

describe("importing the Burials sheet (T07)", () => {
  it("stages the eight Lantern Fold rows writing nothing, then commits them in one revision", async () => {
    const eventsBefore = (await env.events()).length;
    const staged = stage(csv(ROWS));
    expect(staged.counts).toEqual({ ready: 7, unchanged: 0, unplaced: 1, conflicts: 0, errors: 0, leftOut: 0 });
    expect((await env.events()).length).toBe(eventsBefore);
    const revisionBefore = env.revision;
    const out = await commitStaged(staged);
    expect(out).toMatchObject({ ok: true, written: 8, unplaced: 1 });
    expect(env.revision).toBe(revisionBefore + 1);
    expect(Object.keys(env.state.burials)).toHaveLength(8);
    const totals = siteTotalsAt(env.state.core, "2026-04-20");
    expect(totals.plots.byPrimary.taken).toBe(6);
    expect(totals.spaces.byState.taken).toBe(7);
    expect(Object.values(env.state.burials).filter((b) => b.spaceId === undefined)).toHaveLength(1);
  });

  it("keeps partial dates and unknown identity from the sheet", async () => {
    await commitStaged(stage(csv(ROWS)));
    const byRef = (ref: string) => Object.values(env.state.burials).find((b) => b.sourceRef === ref);
    expect(byRef("LF-01")?.date).toEqual({ p: "year", y: 1871 });
    expect(byRef("LF-04")?.date).toEqual({ p: "month", y: 1902, m: 3 });
    expect(byRef("LF-06")?.date).toEqual({ p: "day", y: 1938, m: 11, d: 14 });
    expect(byRef("LF-05")).toMatchObject({ nameUnknown: true, date: { p: "unknown" } });
    expect(byRef("LF-05")?.recordedName).toBeUndefined();
    expect(byRef("LF-07B")).toMatchObject({ spaceId: spaceId("Y07", 2), page: "p2" });
  });

  it("repeats safely: the same file, and the same rows reversed, add nothing", async () => {
    await commitStaged(stage(csv(ROWS)));
    const eventsBefore = (await env.events()).length;
    const again = stage(csv(ROWS));
    expect(again.counts).toEqual({ ready: 0, unchanged: 8, unplaced: 0, conflicts: 0, errors: 0, leftOut: 0 });
    const reversed = stage(csv([...ROWS].reverse()));
    expect(reversed.counts).toEqual({ ready: 0, unchanged: 8, unplaced: 0, conflicts: 0, errors: 0, leftOut: 0 });
    const out = await commitStaged(again);
    expect(out.ok).toBe(false);
    expect((await env.events()).length).toBe(eventsBefore);
  });

  it("treats a burial entered by hand with the same words as already in the register", async () => {
    await confirmEmpty(env, ["Y02"]);
    await env.must([
      { type: "record_burial", burialId: id("burial:hand"), sourceRef: "LF-01", recordedName: "Edda Thornwick", date: { p: "year", y: 1871 }, dateText: "1871", plotId: plotId("Y01"), spaceId: spaceId("Y01"), claimId: id("claim:hand"), page: "p1" },
    ]);
    const staged = stage(csv([ROWS[0] as string]));
    expect(staged.counts.unchanged).toBe(1);
  });

  it("shows a changed row as a conflict, writes nothing until the keeper chooses, and then names the original event", async () => {
    await commitStaged(stage(csv(ROWS)));
    const changed = ROWS.map((r) => r.replace("Edda Thornwick", "Edda Thornwik"));
    const staged = await stageWithEvents(csv(changed));
    expect(staged.counts).toMatchObject({ unchanged: 7, conflicts: 1 });
    const conflict = staged.rows.find((r) => r.status === "conflict");
    expect(conflict?.before?.["recordedName"]).toBe("Edda Thornwick");
    expect(conflict?.after?.["recordedName"]).toBe("Edda Thornwik");
    const eventsBefore = (await env.events()).length;
    const blocked = await commitImport(env.db, staged, { opId: id("op:blocked") });
    expect(blocked.ok).toBe(false);
    expect((await env.events()).length).toBe(eventsBefore);

    const chosen = chooseConflict(staged, conflict?.rowNumber as number, "record_correction");
    expect(chosen.counts).toMatchObject({ ready: 1, conflicts: 0 });
    await commitStaged(chosen);
    const original = await env.eventIdOf("burial_recorded", Object.values(env.state.burials).find((b) => b.sourceRef === "LF-01")?.burialId as string);
    const fix = (await env.events()).find((e) => e.type === "burial_corrected");
    expect(fix?.corrects).toBe(original);
    expect(fix?.sourceRef).toBe("LF-01");
    expect(Object.values(env.state.burials).find((b) => b.sourceRef === "LF-01")?.recordedName).toBe("Edda Thornwik");
  });

  it("refuses a row with an unknown plot, no name and no flag, both, or no source ref, and writes nothing", async () => {
    const bad = csv([
      "LF-20,Some One,,Yew Walk,ZZ9,,1900,",
      "LF-21,,,Yew Walk,Y02,,1900,",
      "LF-22,Some One,yes,Yew Walk,Y02,,1900,",
      ",Some One,,Yew Walk,Y02,,1900,",
      "LF-24,Some One,,Yew Walk,Y07,,1900,",
    ]);
    const staged = stage(bad);
    expect(staged.counts.errors).toBe(5);
    const codes = staged.rows.map((r) => r.errors[0]?.code);
    expect(codes).toEqual(["unknown_plot", "required", "name_and_unknown", "required", "space_needed"]);
    const eventsBefore = (await env.events()).length;
    const out = await commitImport(env.db, staged, { opId: id("op:bad") });
    expect(out.ok).toBe(false);
    expect((await env.events()).length).toBe(eventsBefore);
  });

  it("refuses a second burial in the same space as an error that names the first source ref", async () => {
    const staged = stage(csv(["LF-30,One,,Yew Walk,Y01,,1900,", "LF-31,Two,,Yew Walk,Y01,,1901,"]));
    expect(staged.counts).toMatchObject({ ready: 1, errors: 1 });
    expect(staged.rows[1]?.errors[0]?.code).toBe("space_taken");
  });

  it("does not guess a date that could be read two ways, or one with a two digit year", async () => {
    const ambiguous = stage(csv(["LF-40,One,,Yew Walk,Y01,,03/04/2026,"]));
    expect(ambiguous.counts.errors).toBe(1);
    expect(ambiguous.rows[0]?.errors[0]?.code).toBe("date_ambiguous");
    const short = stage(csv(["LF-41,One,,Yew Walk,Y01,,03/04/26,"]));
    expect(short.counts.errors).toBe(1);
    expect(short.rows[0]?.errors[0]?.code).toBe("date_year_needed");
    const ordered = stage(csv(["LF-42,One,,Yew Walk,Y01,,03/04/2026,"]), "dmy");
    expect(ordered.counts.errors).toBe(0);
  });

  it("finds a plot by an earlier code", async () => {
    await env.must([{ type: "rename_plot", plotId: plotId("Y01"), code: "Y01A" }]);
    const staged = stage(csv(["LF-50,One,,Yew Walk,Y01,,1900,"]));
    expect(staged.counts).toMatchObject({ ready: 1, errors: 0 });
  });

  it("puts a row with no plot in the unplaced list, to place later", async () => {
    const staged = stage(csv(["LF-60,One,,,,,1900,"]));
    expect(staged.counts).toMatchObject({ ready: 0, unplaced: 1 });
  });
});
