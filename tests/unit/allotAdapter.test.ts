// The allotment adapter and its two sheets (spec 04, task 4.7): T01 for this adapter and T07 for its
// sheets. Expected values come from hand-totals.md sections 2.1, 5.1 and 5.3.
import { beforeEach, describe, expect, it } from "vitest";
import { defineRegister } from "../../template/src/adapter";
import { BASE_COMMAND_TYPES } from "../../template/src/base";
import { parseCsv } from "../../template/src/data/csv";
import { chooseConflict, commitImport, stageImport } from "../../template/src/data/importBatch";
import type { StagedImport } from "../../template/src/data/importBatch";
import { applyMapping, fieldsForSheet, suggestMapping } from "../../template/src/data/mapping";
import type { SheetDef } from "../../template/src/adapter";
import type { SheetImporter } from "../../template/src/data/importBatch";
import type { FieldDef } from "../../template/src/adapter";
import { churchRegister } from "../../apps/churchyard-register/src/adapter";
import { allotAdapter, allotRecords, tenanciesImporter, waitingImporter } from "../../apps/allotment-register/src/adapter";
import { ALLOT_COPY } from "../../apps/allotment-register/src/copy";
import { ALL_FIELDS, TENANCIES_SHEET_DEF, WAITING_SHEET_DEF } from "../../apps/allotment-register/src/fields";
import { queueView, tenanciesCovering } from "../../apps/allotment-register/src/rules";
import { ALLOT_COMMAND_TYPES } from "../../apps/allotment-register/src/types";
import type { AllotCommand, AllotEvent, AllotState } from "../../apps/allotment-register/src/types";
import { GardenEnv, id, plotId } from "../helpers/gardenEnv";
import { layoutBeds } from "../helpers/thimbleBeds";

type Staged = StagedImport<AllotState, AllotCommand, AllotEvent>;

let env: GardenEnv;
let counter = 0;

function stageSheet(text: string, sheet: SheetDef, importer: SheetImporter<AllotState, AllotCommand>, fields: FieldDef[] = ALL_FIELDS, events: Awaited<ReturnType<GardenEnv["events"]>> = []): Staged {
  const read = parseCsv(text);
  if (!read.ok) throw new Error(`csv refused: ${JSON.stringify(read.error)}`);
  const mapping = suggestMapping(read.value.headings, fieldsForSheet(sheet, fields));
  const mapped = applyMapping(read.value, mapping, sheet, fields);
  if (!mapped.ok) throw new Error(`mapping refused: ${JSON.stringify(mapped.error)}`);
  return stageImport({
    register: env.register,
    importer,
    rows: mapped.value,
    columns: mapping.columns,
    sheet,
    fields,
    state: env.state,
    siteId: env.site.id,
    baseRevision: env.revision,
    effectiveOn: "2026-04-20",
    options: { newId: () => id(`import:${++counter}`), events },
  });
}

const WAIT_HEAD = "Source ref,Applicant,Contact details,Joined date,Preferred section,Tie order";
const waitCsv = (rows: readonly string[]): string => `${[WAIT_HEAD, ...rows].join("\n")}\n`;
const stageWaiting = (rows: readonly string[], events: Awaited<ReturnType<GardenEnv["events"]>> = []): Staged => stageSheet(waitCsv(rows), WAITING_SHEET_DEF, waitingImporter, ALL_FIELDS, events);

const TEN_HEAD = "Source ref,Plot,Plot holder,Contact details,Tenancy begins,Tenancy ends";
const tenCsv = (rows: readonly string[]): string => `${[TEN_HEAD, ...rows].join("\n")}\n`;
const stageTenancies = (rows: readonly string[]): Staged => stageSheet(tenCsv(rows), TENANCIES_SHEET_DEF, tenanciesImporter);

async function commitStaged(staged: Staged) {
  const out = await commitImport(env.db, staged, { opId: id(`op:${++counter}`) });
  await env.sync();
  return out;
}

beforeEach(async () => {
  counter = 0;
  env = await GardenEnv.create();
  await layoutBeds(env);
});

describe("the allotment adapter (T01)", () => {
  it("is accepted by defineRegister with one space per plot and every command named", () => {
    expect(defineRegister(allotAdapter).ok).toBe(true);
    expect(allotAdapter.kind).toBe("allotment");
    expect(allotAdapter.usesCurrency).toBe(true);
    expect(allotAdapter.spacesPerPlot).toEqual({ min: 1, max: 1 });
    for (const type of [...BASE_COMMAND_TYPES, ...ALLOT_COMMAND_TYPES]) expect(allotAdapter.commands).toContain(type);
    expect(allotAdapter.theme).toMatchObject({ ink: "#1B312A", paper: "#F7F5E8", plotShape: "bed" });
  });

  it("hands its whole copy catalog to the shell, so the library and every screen use garden words", () => {
    expect(allotAdapter.labels).toBe(ALLOT_COPY);
    expect(allotAdapter.labels["libraryPrompt"]).toBe("Offer the next free plot or start your register.");
    expect(allotAdapter.labels["openWalkthrough"]).toBe("Open Thimble Beds");
  });

  it("names two sheets with the headings of the plan", () => {
    expect(allotAdapter.sheets.map((s) => s.name)).toEqual(["Waiting list", "Tenancies"]);
    expect(WAITING_SHEET_DEF.required).toEqual(["Source ref", "Applicant", "Joined date"]);
    expect(WAITING_SHEET_DEF.optional).toEqual(["Contact details", "Preferred section", "Tie order"]);
    expect(TENANCIES_SHEET_DEF.required).toEqual(["Source ref", "Plot", "Plot holder", "Tenancy begins"]);
    expect(TENANCIES_SHEET_DEF.optional).toEqual(["Contact details", "Tenancy ends"]);
    for (const sheet of [WAITING_SHEET_DEF, TENANCIES_SHEET_DEF]) {
      const labels = new Set(ALL_FIELDS.map((f) => f.label));
      for (const heading of [...sheet.required, ...(sheet.optional ?? [])]) expect(labels.has(heading), heading).toBe(true);
    }
  });

  it("gives a garden plot exactly one space and refuses two (A8.3)", async () => {
    const out = await env.dispatch([{ type: "layout_apply", plots: [{ plotId: "p-two", code: "Z01", spaces: [{ spaceId: "s1" }, { spaceId: "s2" }] }] } as AllotCommand]);
    expect(out.ok).toBe(false);
    expect(Object.keys(env.state.core.plots)).toHaveLength(6);
    for (const plot of Object.values(env.state.core.plots)) expect(plot.spaces).toHaveLength(1);
  });

  it("refuses a churchyard command as unknown, and the churchyard refuses a garden command (A8.4)", async () => {
    const bury = await env.dispatch([{ type: "record_burial", burialId: "b", sourceRef: "x", recordedName: "Nobody", date: { p: "unknown" }, dateText: "" } as unknown as AllotCommand]);
    expect(bury.ok).toBe(false);
    if (!bury.ok) expect(bury.error.code).toBe("unknown_command");
    const church = churchRegister();
    const site = { ...env.site, kind: "churchyard" };
    const run = church.run(church.initialState(site), { type: "make_offer", offerId: "o" } as never, "2026-04-20");
    expect(run.ok).toBe(false);
    if (!run.ok) expect(run.error.code).toBe("unknown_command");
  });

  it("does not open a churchyard site, and its state starts empty with the site currency", () => {
    expect(env.register.accepts({ ...env.site, kind: "churchyard" }).ok).toBe(false);
    expect(env.register.accepts(env.site).ok).toBe(true);
    expect(allotAdapter.initialState(env.site)).toMatchObject({ currency: "GBP", nextSequence: 1, applications: {}, tenancies: {}, offers: {}, ledger: {}, seasons: {} });
  });
});

describe("importing the Waiting list sheet: stable ties (T07, T17, hand totals 5.3)", () => {
  it("stages Tavi and Olin writing nothing, then commits them in one revision with sequences in file order", async () => {
    const eventsBefore = (await env.events()).length;
    const staged = stageWaiting(["WL-1,Tavi Bramblequill,tavi.bramblequill@example.invalid,2026-01-10,,", "WL-2,Olin Reedwhorl,olin.reedwhorl@example.invalid,2026-01-10,,"]);
    expect(staged.counts).toEqual({ ready: 2, unchanged: 0, unplaced: 0, conflicts: 0, errors: 0, leftOut: 0 });
    expect((await env.events()).length).toBe(eventsBefore);
    const revision = env.revision;
    const out = await commitStaged(staged);
    expect(out).toMatchObject({ ok: true, written: 2 });
    expect(env.revision).toBe(revision + 1);
    expect(queueView(env.state).map((r) => [r.name, r.sequence])).toEqual([["Tavi Bramblequill", 1], ["Olin Reedwhorl", 2]]);
    expect(env.state.applications[queueView(env.state)[0]?.applicationId as string]?.sourceRef).toBe("WL-1");
  });

  it("gives equal dates the order of the file when there is no Tie order, once", async () => {
    await commitStaged(stageWaiting(["D,Dale Dunmore,,2026-02-01,,", "E,Eden Eastlake,,2026-02-01,,"]));
    expect(queueView(env.state).map((r) => r.name)).toEqual(["Dale Dunmore", "Eden Eastlake"]);
    // A second import later never touches the first two sequences.
    await commitStaged(stageWaiting(["F,Fern Fairweather,,2026-02-01,,"]));
    expect(queueView(env.state).map((r) => [r.name, r.sequence])).toEqual([["Dale Dunmore", 1], ["Eden Eastlake", 2], ["Fern Fairweather", 3]]);
  });

  it("lets a Tie order column decide equal dates, whatever the order of the rows in the file", async () => {
    await commitStaged(stageWaiting(["D,Dale Dunmore,,2026-02-01,,2", "E,Eden Eastlake,,2026-02-01,,1"]));
    expect(queueView(env.state).map((r) => r.name)).toEqual(["Eden Eastlake", "Dale Dunmore"]);
    expect(queueView(env.state).map((r) => r.sequence)).toEqual([1, 2]);
  });

  it("puts an earlier joined date first even when it is lower in the file (out of order import)", async () => {
    await commitStaged(stageWaiting(["A,Alder Ashby,,2026-03-01,,", "B,Birch Bunting,,2026-01-05,,"]));
    expect(queueView(env.state).map((r) => r.name)).toEqual(["Birch Bunting", "Alder Ashby"]);
  });

  it("shows a repeated place as a row error instead of writing it", () => {
    const staged = stageWaiting(["D,Dale Dunmore,,2026-02-01,,", "E,Eden Eastlake,,2026-02-01,,1"]);
    expect(staged.counts.errors).toBe(1);
    expect(staged.rows[1]?.errors[0]?.code).toBe("sequence_used");
    expect(staged.writes).toBe(1);
  });

  it("imports the same file again, in any order, and adds nothing", async () => {
    const rows = ["WL-1,Tavi Bramblequill,,2026-01-10,,", "WL-2,Olin Reedwhorl,,2026-01-10,,"];
    await commitStaged(stageWaiting(rows));
    const again = stageWaiting(rows);
    expect(again.counts).toMatchObject({ ready: 0, unchanged: 2, conflicts: 0, errors: 0 });
    expect(again.writes).toBe(0);
    const reversed = stageWaiting([...rows].reverse());
    expect(reversed.counts).toMatchObject({ unchanged: 2, ready: 0 });
    expect(reversed.writes).toBe(0);
    expect(queueView(env.state).map((r) => [r.name, r.sequence])).toEqual([["Tavi Bramblequill", 1], ["Olin Reedwhorl", 2]]);
  });

  it("holds a changed joined date as a conflict, and a correction keeps the sequence", async () => {
    await commitStaged(stageWaiting(["WL-1,Tavi Bramblequill,,2026-01-10,,", "WL-2,Olin Reedwhorl,,2026-01-10,,"]));
    const events = await env.events();
    let staged = stageWaiting(["WL-1,Tavi Bramblequill,,2026-01-15,,"], events);
    expect(staged.counts.conflicts).toBe(1);
    expect(staged.writes).toBe(0);
    staged = chooseConflict(staged, staged.rows[0]?.rowNumber as number, "record_correction");
    expect(staged.counts).toMatchObject({ conflicts: 0, errors: 0 });
    expect(staged.writes).toBe(1);
    const out = await commitStaged(staged);
    expect(out).toMatchObject({ ok: true });
    expect(queueView(env.state).map((r) => [r.name, r.sequence])).toEqual([["Olin Reedwhorl", 2], ["Tavi Bramblequill", 1]]);
    expect((await env.events()).find((e) => e.type === "joined_on_corrected")?.corrects).toBeDefined();
  });

  it("refuses to correct a name by import, and says to keep the current row", async () => {
    await commitStaged(stageWaiting(["WL-1,Tavi Bramblequill,,2026-01-10,,"]));
    let staged = stageWaiting(["WL-1,Tavi Bramblequil,,2026-01-10,,"], await env.events());
    expect(staged.counts.conflicts).toBe(1);
    staged = chooseConflict(staged, staged.rows[0]?.rowNumber as number, "record_correction");
    expect(staged.counts.errors).toBe(1);
    expect(staged.rows[0]?.errors[0]?.code).toBe("cannot_correct");
  });

  it("finds a preferred section by its name and refuses one that is not in the register", () => {
    const ok = stageWaiting(["WL-1,Tavi Bramblequill,,2026-01-10,shady row,"]);
    expect(ok.counts.ready).toBe(1);
    const bad = stageWaiting(["WL-1,Tavi Bramblequill,,2026-01-10,Rooftop,"]);
    expect(bad.counts.errors).toBe(1);
    expect(bad.rows[0]?.errors[0]).toMatchObject({ field: "preferredSection", code: "unknown_section" });
  });

  it("names the row, heading and value of a missing applicant or an impossible date, and writes nothing", async () => {
    const staged = stageWaiting(["WL-1,,,2026-01-10,,", "WL-2,Olin Reedwhorl,,2026-02-30,,"]);
    expect(staged.counts.errors).toBe(2);
    expect(staged.rows[0]?.errors[0]).toMatchObject({ field: "applicant", code: "required", heading: "Applicant" });
    expect(staged.rows[1]?.errors[0]).toMatchObject({ field: "joinedOn", heading: "Joined date", value: "2026-02-30" });
    expect(staged.writes).toBe(0);
    expect(Object.keys(env.state.applications)).toHaveLength(0);
  });

  it("keeps two applicants with the same name apart, with their own rows", async () => {
    await commitStaged(stageWaiting(["WL-1,Tavi Bramblequill,,2026-01-10,,", "WL-9,Tavi Bramblequill,,2026-03-01,,"]));
    expect(queueView(env.state)).toHaveLength(2);
    expect(Object.keys(env.state.people)).toHaveLength(2);
  });
});

describe("importing the Tenancies sheet (T07, A3.1)", () => {
  const ROWS = ["TB-T1,B01,Marlo Fennick,,2024-04-01,", "TB-T2,B02,Ada Stonecrop,ada.stonecrop@example.invalid,2025-04-01,", "TB-T4,B04,Ilse Burrowby,,2023-04-01,"];

  it("writes the three historical tenancies with their source refs in one revision", async () => {
    const revision = env.revision;
    const staged = stageTenancies(ROWS);
    expect(staged.counts).toMatchObject({ ready: 3, errors: 0 });
    const out = await commitStaged(staged);
    expect(out).toMatchObject({ ok: true, written: 3 });
    expect(env.revision).toBe(revision + 1);
    expect(Object.values(env.state.tenancies).map((t) => [env.state.core.plots[t.plotId]?.code, t.start, t.sourceRef])).toEqual([
      ["B01", "2024-04-01", "TB-T1"],
      ["B02", "2025-04-01", "TB-T2"],
      ["B04", "2023-04-01", "TB-T4"],
    ]);
    expect(tenanciesCovering(env.state, plotId("B02"), "2026-04-20")).toHaveLength(1);
  });

  it("adds nothing when the same file is imported again, in any order", async () => {
    await commitStaged(stageTenancies(ROWS));
    expect(stageTenancies(ROWS).counts).toMatchObject({ unchanged: 3, ready: 0 });
    expect(stageTenancies([...ROWS].reverse()).writes).toBe(0);
    expect(Object.keys(env.state.tenancies)).toHaveLength(3);
  });

  it("shows a tenancy that overlaps another as a row error, naming the plot, and writes none of the file", async () => {
    await commitStaged(stageTenancies([ROWS[1] as string]));
    const staged = stageTenancies(["TB-NEW,B01,Wick Dunmore,,2026-01-01,", "TB-OVER,B02,Wick Dunmore,,2026-03-01,"]);
    expect(staged.counts).toMatchObject({ ready: 1, errors: 1 });
    expect(staged.rows[1]?.errors[0]?.code).toBe("tenancy_overlap");
    const out = await commitImport(env.db, staged, { opId: id("op:blocked") });
    expect(out.ok).toBe(false);
    expect(Object.keys(env.state.tenancies)).toHaveLength(1);
  });

  it("needs a plot that exists, a holder and a start date", () => {
    const staged = stageTenancies(["TB-1,Z99,Wick Dunmore,,2026-01-01,", "TB-2,B01,,,2026-01-01,", "TB-3,B01,Wick Dunmore,,,"]);
    expect(staged.counts.errors).toBe(3);
    expect(staged.rows[0]?.errors[0]).toMatchObject({ field: "plot", code: "unknown_plot" });
    expect(staged.rows[1]?.errors[0]).toMatchObject({ field: "holder", code: "required" });
    expect(staged.rows[2]?.errors[0]).toMatchObject({ field: "start", code: "required" });
  });

  it("makes one person of a holder who has two plots and the same contact, and two of the same name with no contact", async () => {
    await commitStaged(stageTenancies(["TB-1,B01,Marlo Fennick,marlo@example.invalid,2024-04-01,", "TB-2,B03,Marlo Fennick,marlo@example.invalid,2025-04-01,", "TB-3,B04,Ilse Burrowby,,2023-04-01,", "TB-4,B05,Ilse Burrowby,,2024-04-01,"]));
    expect(Object.keys(env.state.people)).toHaveLength(3);
    const marlo = Object.values(env.state.tenancies).filter((t) => env.state.people[t.personId]?.displayName === "Marlo Fennick");
    expect(marlo).toHaveLength(2);
    expect(new Set(marlo.map((t) => t.personId)).size).toBe(1);
  });

  it("refuses a changed row as a conflict and cannot correct it by import", async () => {
    await commitStaged(stageTenancies(ROWS));
    let staged = stageTenancies(["TB-T1,B01,Marlo Fennick,,2024-05-01,"]);
    expect(staged.counts.conflicts).toBe(1);
    staged = chooseConflict(staged, staged.rows[0]?.rowNumber as number, "record_correction");
    expect(staged.rows[0]?.errors[0]?.code).toBe("cannot_correct");
  });
});

describe("the names the search reads", () => {
  it("lists each tenant by their plot and each applicant with no plot", async () => {
    await commitStaged(stageTenancies(["TB-T1,B01,Marlo Fennick,,2024-04-01,"]));
    await commitStaged(stageWaiting(["WL-1,Tavi Bramblequill,,2026-01-10,,"]));
    const records = allotRecords(env.state);
    expect(records.map((r) => [r.plotId === undefined ? "waiting" : env.state.core.plots[r.plotId]?.code, r.name.display])).toEqual([
      ["B01", "Marlo Fennick"],
      ["waiting", "Tavi Bramblequill"],
    ]);
  });
});
