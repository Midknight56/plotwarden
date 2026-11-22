// The paper register in a fake database, for the unit tests. The adapter is in paperKind.ts.
// Test helper. The template never imports it.
import { IDBFactory } from "fake-indexeddb";
import type { Register } from "../../template/src/adapter";
import type { DateOrder, LocalDate } from "../../template/src/calendar";
import { parseCsv } from "../../template/src/data/csv";
import { openRegisterDb } from "../../template/src/data/db";
import { keySourceOfDraft, stageImport, uniqueKeysFor } from "../../template/src/data/importBatch";
import type { StagedImport } from "../../template/src/data/importBatch";
import { applyMapping, fieldsForSheet, suggestMapping } from "../../template/src/data/mapping";
import { commit, readEvents, saveNewSite } from "../../template/src/data/transaction";
import type { BlobWrite, CommitResult } from "../../template/src/data/transaction";
import type { DraftEvent } from "../../template/src/events";
import { gridCommand, planGrid } from "../../template/src/map/generate";
import type { GridSpec } from "../../template/src/map/generate";
import { createSite, mintId } from "../../template/src/site";
import type { Site, Uuid } from "../../template/src/types";
import { FIXED_NOW, fixedClock } from "./clock";
import { PAPER_KIND, burialsImporter, paperAdapter, paperRegister } from "./paperKind";
import type { PaperCommand, PaperEvent, PaperState } from "./paperKind";

export * from "./paperKind";
/** Spec for the 10 by 20 paper book grid: C001 to C200 in section Paper. */
export const PAPER_GRID: GridSpec = {
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
};

export interface DispatchResult {
  result: CommitResult;
  state: PaperState;
}

/** A register in a fresh fake database, with its state kept in step with each commit. */
export class PaperEnv {
  state: PaperState;
  revision = 0;
  private constructor(
    readonly db: IDBDatabase,
    readonly site: Site,
    readonly register: Register<PaperState, PaperCommand, PaperEvent>,
  ) {
    this.state = register.initialState(site);
  }

  static async create(title = "Paper Book"): Promise<PaperEnv> {
    const opened = await openRegisterDb(new IDBFactory());
    if (!opened.ok) throw new Error("could not open storage");
    const made = createSite({
      id: mintId(),
      lineageId: mintId(),
      siteKey: mintId(),
      kind: PAPER_KIND,
      title,
      zone: "Europe/London",
      createdAt: FIXED_NOW,
    });
    if (!made.ok) throw new Error("could not make a site");
    const saved = await saveNewSite(opened.value, made.value);
    if (!saved.ok) throw new Error("could not save the site");
    return new PaperEnv(opened.value, made.value, paperRegister());
  }

  /** Decide, commit and keep the state. A refusal or a failed commit changes nothing. */
  async dispatch(commands: PaperCommand[], on: LocalDate = "2026-04-20", opId: Uuid = mintId(), blobs: BlobWrite[] = []): Promise<DispatchResult> {
    let state = this.state;
    const drafts: DraftEvent<PaperEvent>[] = [];
    for (const command of commands) {
      const decided = this.register.run(state, command, on);
      if (!decided.ok) throw new Error(`refused: ${JSON.stringify(decided.error)}`);
      for (const d of decided.value) {
        drafts.push(d);
        state = paperAdapter.apply(state, d.event);
      }
    }
    const sectionNames = new Map(Object.values(state.map.sections).map((s) => [s.sectionId, s.name]));
    const result = await commit(this.db, {
      siteId: this.site.id,
      expectedRevision: this.revision,
      opId,
      commands,
      events: drafts as DraftEvent[],
      blobs,
      uniqueKeys: uniqueKeysFor(drafts.map((d) => keySourceOfDraft(d as DraftEvent)), sectionNames),
      now: fixedClock(FIXED_NOW),
    });
    if (result.ok) {
      this.state = state;
      this.revision = result.revision;
    }
    return { result, state: this.state };
  }

  /** Make the 10 by 20 grid in section Paper. */
  async applyGrid(spec: GridSpec = PAPER_GRID): Promise<void> {
    const section = { sectionId: mintId(), name: "Paper" };
    const planned = planGrid(spec, section, []);
    if (!planned.ok) throw new Error(`grid refused: ${JSON.stringify(planned.error)}`);
    await this.dispatch([gridCommand(planned.value, section, mintId)]);
  }

  /** Replay the stored events into a state, as a reload would. */
  async reload(): Promise<PaperState> {
    const events = await readEvents(this.db, this.site.id);
    const replayed = this.register.replay(this.site, events);
    if (!replayed.ok) throw new Error(`replay refused: ${JSON.stringify(replayed.error)}`);
    return replayed.value;
  }

  async eventCount(): Promise<number> {
    return (await readEvents(this.db, this.site.id)).length;
  }
}

export function paperState(env: PaperEnv): PaperState {
  return env.state;
}

/** Read CSV text, map its columns by heading and stage it against the register, as the screens do. */
export function stageCsvText(env: PaperEnv, text: string, dateOrder?: DateOrder): StagedImport<PaperState, PaperCommand, PaperEvent> {
  const read = parseCsv(text);
  if (!read.ok) throw new Error(`csv refused: ${JSON.stringify(read.error)}`);
  const sheet = paperAdapter.sheets[0]!;
  const mapping = suggestMapping(read.value.headings, fieldsForSheet(sheet, paperAdapter.fields));
  const mapped = applyMapping(read.value, mapping, sheet, paperAdapter.fields, dateOrder === undefined ? undefined : { dateOrder });
  if (!mapped.ok) throw new Error(`mapping refused: ${JSON.stringify(mapped.error)}`);
  let n = 0;
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
    effectiveOn: "2026-04-20",
    options: { newId: () => `00000000-0000-4000-8000-${(0x100000 + ++n).toString(16).padStart(12, "0")}`, ...(dateOrder === undefined ? {} : { dateOrder }) },
  });
}
