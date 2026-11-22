// T07 (repair 07, finding 5): a staged import is kept as a draft, so a refresh or a stale save loses neither its rows
// nor its fixes. Requirements R9.5, R9.6, R26.7 and R27.1. The sheet is Burials on the paper test adapter.
import { describe, expect, it } from "vitest";
import { parseCsv } from "../../template/src/data/csv";
import type { CsvTable } from "../../template/src/data/csv";
import { buildRecoveryFile } from "../../template/src/data/drafts";
import { parseDraftFile } from "../../template/src/data/fastEntry";
import { chooseConflict, commitImport, fixRow, leaveOut, restageWith, stageImport } from "../../template/src/data/importBatch";
import type { StagedImport } from "../../template/src/data/importBatch";
import { IMPORT_SCREEN, importFromDraft, importToDraft } from "../../template/src/data/importDraft";
import type { ImportSource } from "../../template/src/data/importDraft";
import { applyMapping, fieldsForSheet, suggestMapping } from "../../template/src/data/mapping";
import { fid } from "../helpers/site";
import { PaperEnv, burialsImporter, paperAdapter, stageCsvText } from "../helpers/paperAdapter";
import type { PaperCommand, PaperEvent, PaperState } from "../helpers/paperAdapter";

const SECTION = "00000000-0000-4000-8000-0000000000e1";
const ON = "2026-04-20";
type Staged = StagedImport<PaperState, PaperCommand, PaperEvent>;

const counter = () => {
  let n = 0x2000;
  return () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
};

async function siteWithPlots(): Promise<PaperEnv> {
  const env = await PaperEnv.create();
  const codes = ["P01", "P02", "P03", "P04", "P05", "P06"];
  await env.dispatch([
    {
      type: "layout_apply",
      sections: [{ sectionId: SECTION, name: "Paper" }],
      plots: codes.map((code) => ({ plotId: fid(`plot:${code}`), code, sectionId: SECTION, spaces: [{ spaceId: fid(`space:${code}`) }] })),
    },
  ]);
  return env;
}

const HEAD = "Source ref,Name,Section,Plot,Burial date,Page\n";
const FILE =
  HEAD +
  [
    "R1,Alder Ashgrove,Paper,P01,1850,P1",
    "R2,Brindle Ashgrove,Paper,P02,1851-02,P1",
    "R3,Cove Ashgrove,,,unknown,P1",
    "R4,Dunmore Ashgrove,Paper,P99,1853,P1",
    "R5,Elspin Ashgrove,Paper,P03,1854-03-03,P1",
    "R6,Fenn Ashgrove,Paper,P04,1855,P1",
  ].join("\n") +
  "\n";

function readTable(text: string): CsvTable {
  const read = parseCsv(text, { separator: "comma" });
  if (!read.ok) throw new Error(`csv refused: ${JSON.stringify(read.error)}`);
  return read.value;
}

function stageSource(env: PaperEnv, source: ImportSource, selection?: Parameters<typeof restageWith>[1]): Staged {
  const sheet = paperAdapter.sheets[0]!;
  const mapped = applyMapping(source.table, { columns: source.columns }, sheet, paperAdapter.fields);
  if (!mapped.ok) throw new Error(`mapping refused: ${JSON.stringify(mapped.error)}`);
  const input = {
    register: env.register,
    importer: burialsImporter,
    rows: mapped.value,
    columns: source.columns,
    sheet,
    fields: paperAdapter.fields,
    state: env.state,
    siteId: env.site.id,
    baseRevision: env.revision,
    effectiveOn: ON,
    options: { newId: counter() },
  };
  return selection === undefined ? stageImport(input) : restageWith(input, selection);
}

function sourceOf(text: string): ImportSource {
  const table = readTable(text);
  const fields = fieldsForSheet(paperAdapter.sheets[0]!, paperAdapter.fields);
  return { sheet: "Burials", table, columns: suggestMapping(table.headings, fields).columns, dateOrder: "" };
}

const META = { draftId: "00000000-0000-4000-8000-0000000000d1", siteId: "00000000-0000-4000-8000-0000000000a1", kind: "paper", baseRevision: 3, savedAt: "2026-04-20T09:00:00.000Z" };

/** The part of a staged import that a keeper chose, row by row. */
const summary = (staged: Staged) => staged.rows.map((r) => [r.rowNumber, r.status, r.leftOutReason ?? "", r.sourceRef ?? "", JSON.stringify(r.cells)]);

describe("a staged import as a draft (R9.5, R26.7)", () => {
  it("keeps the rows, the column choices, the left out rows and the fixed cells, and stages the same again", async () => {
    const env = await siteWithPlots();
    const source = sourceOf(FILE);
    let staged = stageSource(env, source);
    expect(staged.counts.errors).toBe(1);
    // The keeper fixes row 4 and leaves row 6 out.
    const row4 = staged.rows[3]!;
    staged = fixRow(staged, 4, { ...row4.cells, plot: "P04" });
    staged = leaveOut(staged, 6, "Not ours");
    expect(staged.counts).toEqual({ ready: 4, unchanged: 0, unplaced: 1, conflicts: 0, errors: 0, leftOut: 1 });

    const draft = importToDraft(source, staged.selection, META);
    expect(draft.kind).toBe("paper");
    expect(draft.siteId).toBe(META.siteId);
    expect(draft.commands).toEqual([]);
    expect(draft.mapping["screen"]).toBe(IMPORT_SCREEN);
    expect(draft.rawRows).toHaveLength(6);
    expect(draft.currentRow).toBe(0);

    const back = importFromDraft(draft);
    if (back === undefined) throw new Error("the draft did not read back");
    expect(back.source.sheet).toBe("Burials");
    expect(back.source.table.headings).toEqual(source.table.headings);
    expect(back.source.table.rows).toEqual(source.table.rows);
    expect(back.source.columns).toEqual(source.columns);
    expect([...back.selection.leftOut]).toEqual([[6, "Not ours"]]);
    expect([...back.selection.fixes.keys()]).toEqual([4]);

    const again = stageSource(env, back.source, back.selection);
    expect(again.counts).toEqual(staged.counts);
    expect(summary(again)).toEqual(summary(staged));
    expect(again.writes).toBe(staged.writes);
  });

  it("keeps a conflict choice and the date order", async () => {
    const env = await siteWithPlots();
    const first = leaveOut(stageSource(env, sourceOf(FILE)), 4, "Wrong book");
    const written = await commitImport(env.db, first, { opId: "00000000-0000-4000-8000-0000000000c1" });
    if (!written.ok) throw new Error(`first import refused: ${JSON.stringify(written)}`);
    env.state = await env.reload();
    env.revision = written.revision;
    // The same source refs with a changed name are conflicts.
    const source: ImportSource = { ...sourceOf(FILE.replace("Alder Ashgrove", "Alder Ashgrove Jr")), dateOrder: "dmy" };
    let staged = stageSource(env, source);
    expect(staged.counts.conflicts).toBe(1);
    staged = chooseConflict(staged, 1, "record_correction");
    const back = importFromDraft(importToDraft(source, staged.selection, META));
    expect(back?.source.dateOrder).toBe("dmy");
    expect([...(back?.selection.choices ?? [])]).toEqual([[1, "record_correction"]]);
    const again = stageSource(env, back!.source, back!.selection);
    expect(again.counts).toEqual(staged.counts);
  });

  it("restages against a newer state, with every fix kept and the rows re-checked", async () => {
    const env = await siteWithPlots();
    const source = sourceOf(FILE);
    let staged = stageSource(env, source);
    staged = fixRow(staged, 4, { ...staged.rows[3]!.cells, plot: "P05" });
    expect(staged.rows[3]?.status).toBe("ready");
    // Another tab takes P05 first, so the fixed row now fails its dry run. Nothing is silently dropped.
    const other = stageCsvText(env, `${HEAD}R90,Other Person,Paper,P05,1900,P2\n`);
    const done = await commitImport(env.db, other, { opId: "00000000-0000-4000-8000-0000000000c2" });
    if (!done.ok) throw new Error(`other tab refused: ${JSON.stringify(done)}`);
    env.state = await env.reload();
    env.revision = done.revision;
    const latest = stageSource(env, source, staged.selection);
    expect(latest.rows[3]?.cells["plot"]).toBe("P05");
    expect(latest.rows[3]?.status).toBe("error");
    expect(latest.rows[5]?.status).toBe("ready");
    expect(latest.baseRevision).toBe(env.revision);
    expect(latest.baseRevision).not.toBe(staged.baseRevision);
  });

  it("writes a recovery file that holds the same input, the fixed name and no site name or command", async () => {
    const env = await siteWithPlots();
    const source = sourceOf(FILE);
    const staged = leaveOut(stageSource(env, source), 4, "Wrong book");
    const file = buildRecoveryFile(importToDraft(source, staged.selection, META));
    expect(file.filename).toBe("register-recovery.json");
    const body = JSON.parse(file.text) as { format: string; commands: unknown[]; mapping: Record<string, string> };
    expect(body.format).toBe("plot.draft.v1");
    expect(body.commands).toEqual([]);
    expect(file.text).not.toContain("Lantern");
    const read = parseDraftFile(file.text, { kind: "paper", siteId: META.siteId, screen: IMPORT_SCREEN });
    expect(read.ok).toBe(true);
    if (read.ok) expect(importFromDraft(read.value)?.selection.leftOut.get(4)).toBe("Wrong book");
  });

  it("is refused by fast entry, and a fast entry draft is refused as an import (the screen decides)", () => {
    const draft = importToDraft(sourceOf(FILE), { leftOut: new Map(), choices: new Map(), fixes: new Map() }, META);
    const text = buildRecoveryFile(draft).text;
    const asEntry = parseDraftFile(text, { kind: "paper", siteId: META.siteId });
    expect(asEntry.ok).toBe(false);
    const entry = buildRecoveryFile({ ...draft, mapping: { page: "1", zoom: "1", rotation: "0" } }).text;
    expect(parseDraftFile(entry, { kind: "paper", siteId: META.siteId, screen: IMPORT_SCREEN }).ok).toBe(false);
    expect(parseDraftFile(entry, { kind: "paper", siteId: META.siteId }).ok).toBe(true);
  });

  it("reads nothing from a draft that is not an import, or whose columns are damaged", () => {
    expect(importFromDraft({ rawRows: [{ "0": "a" }], mapping: { page: "1" } })).toBeUndefined();
    const good = importToDraft(sourceOf(FILE), { leftOut: new Map(), choices: new Map(), fixes: new Map() }, META);
    expect(importFromDraft({ rawRows: good.rawRows, mapping: { ...good.mapping, "choice:2": "invent_a_choice" } })).toBeUndefined();
    expect(importFromDraft({ rawRows: good.rawRows, mapping: { ...good.mapping, "fix:2": "{not json" } })).toBeUndefined();
    expect(importFromDraft({ rawRows: good.rawRows, mapping: { ...good.mapping, sheet: "" } })).toBeUndefined();
  });
});
