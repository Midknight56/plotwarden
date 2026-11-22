// Staged import: preview, row actions and one atomic commit. No React.
// Staging writes nothing. A commit writes every selected row or none.
import type { FieldDef, Register, SheetDef } from "../adapter";
import type { DateOrder, LocalDate } from "../calendar";
import type { DraftEvent, StoredEvent } from "../events";
import { err, ok } from "../types";
import type { DomainError, Result, Uuid } from "../types";
import { codeUniqueKey } from "../plot";
import { toCsv } from "./csvExport";
import { checkCells } from "./mapping";
import type { CellError, MappedRow, MappingColumn } from "./mapping";
import { commit } from "./transaction";
import type { CommitError, UniqueKeyRequest } from "./transaction";

export interface ImportOptions {
  dateOrder?: DateOrder;
  /** Mints the IDs of new records, once, at staging. */
  newId: () => Uuid;
  /** The stored events, so a correction can name the event it corrects. */
  events?: readonly StoredEvent[];
}

export interface ExistingRow {
  recordId: Uuid;
  normalized: Record<string, string>;
}

export type RowOutcome<C> =
  | { ok: true; placement: "placed" | "unplaced"; normalized: Record<string, string>; recordId: Uuid; commands: C[] }
  | { ok: false; errors: Omit<CellError, "row">[] };

export interface CorrectArgs {
  recordId: Uuid;
  sourceRef: string;
  before: Record<string, string>;
  after: Record<string, string>;
  cells: Record<string, string>;
}

/** What one app supplies for one sheet. Its commands are the app's own. */
export interface SheetImporter<S, C extends { type: string }> {
  /** Equals a `SheetDef` name. */
  sheet: string;
  /** The field key that holds the source ref. */
  sourceRefField: string;
  /** The field a refusal of the dry run is shown on, for example the plot. */
  placementField?: string;
  /** Build the lookups once for a whole import. */
  open(state: S, options: ImportOptions): OpenImporter<C>;
}

export interface OpenImporter<C> {
  /** Stored rows of this sheet by exact source ref. */
  existing: ReadonlyMap<string, ExistingRow>;
  stageRow(cells: Record<string, string>): RowOutcome<C>;
  correct(args: CorrectArgs): RowOutcome<C>;
}

export type RowStatus = "ready" | "unchanged" | "unplaced" | "conflict" | "error" | "left_out";
export type ConflictChoice = "keep_current" | "record_correction";

export interface StagedRow<C> {
  rowNumber: number;
  /** The exact source ref, when there is one. */
  sourceRef?: string;
  cells: Record<string, string>;
  status: RowStatus;
  errors: CellError[];
  placement?: "placed" | "unplaced";
  before?: Record<string, string>;
  after?: Record<string, string>;
  choice?: ConflictChoice;
  leftOutReason?: string;
  recordId?: Uuid;
  /** The commands this row writes, when it writes. */
  commands: C[];
}

export interface ImportCounts {
  ready: number;
  unchanged: number;
  unplaced: number;
  conflicts: number;
  errors: number;
  leftOut: number;
}

export interface StageInput<S, C extends { type: string }, E extends { type: string }> {
  register: Register<S, C, E>;
  importer: SheetImporter<S, C>;
  rows: readonly MappedRow[];
  columns: readonly MappingColumn[];
  sheet: SheetDef;
  fields: readonly FieldDef[];
  state: S;
  siteId: Uuid;
  baseRevision: number;
  effectiveOn: LocalDate;
  options: ImportOptions;
}

export interface Selection {
  leftOut: ReadonlyMap<number, string>;
  choices: ReadonlyMap<number, ConflictChoice>;
  fixes: ReadonlyMap<number, Record<string, string>>;
}

export interface StagedImport<S, C extends { type: string }, E extends { type: string }> {
  sheet: string;
  siteId: Uuid;
  baseRevision: number;
  rows: StagedRow<C>[];
  counts: ImportCounts;
  /** Rows that write something. */
  writes: number;
  /** The dry run drafts of the rows that write, in file order. */
  drafts: DraftEvent<E>[];
  input: StageInput<S, C, E>;
  selection: Selection;
}

export type ImportCommit =
  | { ok: true; revision: number; written: number; unplaced: number; replayed: boolean }
  | { ok: false; code: string; error?: CommitError; errors?: number; conflicts?: number };

/** Join the parts that are given with a slash. For a row that has no source ref of its own. */
export function buildSourceRef(book: string, page: string, entry: string): Result<string> {
  const parts = [book, page, entry].map((p) => p.trim()).filter((p) => p !== "");
  if (parts.length === 0) return err("required", { field: "sourceRef" });
  return ok(parts.join("/"));
}

function sameCells(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if ((a[key] ?? "") !== (b[key] ?? "")) return false;
  return true;
}

/** A refusal of the dry run, shown on the placement field of the row. */
function refusal(error: DomainError, row: number, field: string, heading: string, value: string): CellError {
  const cell: CellError = {
    row,
    field: error.fields?.[0]?.field ?? field,
    heading,
    value,
    code: error.code,
    fix: error.route ?? "choose_another_plot",
  };
  if (error.detail !== undefined) cell.detail = { ...error.detail };
  return cell;
}

function run<S, C extends { type: string }, E extends { type: string }>(
  input: StageInput<S, C, E>,
  selection: Selection,
): StagedImport<S, C, E> {
  const { register, importer } = input;
  const open = importer.open(input.state, input.options);
  const headings: Record<string, string> = {};
  for (const column of input.columns) if (column.fieldKey !== undefined) headings[column.fieldKey] = column.heading;
  const placementField = importer.placementField ?? importer.sourceRefField;
  const labelOf = (key: string) => input.fields.find((f) => f.key === key)?.label ?? key;

  let evolving = input.state;
  const rows: StagedRow<C>[] = [];
  const drafts: DraftEvent<E>[] = [];
  const firstRowOfRef = new Map<string, number>();

  const dryRun = (commands: C[]): { ok: true; drafts: DraftEvent<E>[]; state: S } | { ok: false; error: DomainError } => {
    let s = evolving;
    const out: DraftEvent<E>[] = [];
    for (const command of commands) {
      const decided = register.run(s, command, input.effectiveOn);
      if (!decided.ok) return { ok: false, error: decided.error };
      for (const draft of decided.value) {
        out.push(draft);
        s = register.adapter.apply(s, draft.event);
      }
    }
    return { ok: true, drafts: out, state: s };
  };

  for (const mapped of input.rows) {
    const n = mapped.rowNumber;
    const fixed = selection.fixes.get(n);
    const cells = fixed ?? mapped.cells;
    const row: StagedRow<C> = { rowNumber: n, cells, status: "ready", errors: [], commands: [] };
    const ref = cells[importer.sourceRefField];
    if (ref !== undefined && ref.trim() !== "") row.sourceRef = ref;
    rows.push(row);

    const reason = selection.leftOut.get(n);
    if (reason !== undefined) {
      row.status = "left_out";
      row.leftOutReason = reason;
      continue;
    }

    const cellErrors = fixed === undefined ? mapped.errors : checkCells(n, cells, headings, input.sheet, input.fields, input.options.dateOrder === undefined ? undefined : { dateOrder: input.options.dateOrder });
    if (cellErrors.length > 0) {
      row.status = "error";
      row.errors = cellErrors;
      continue;
    }
    if (row.sourceRef === undefined) {
      row.status = "error";
      row.errors = [
        { row: n, field: importer.sourceRefField, heading: headings[importer.sourceRefField] ?? labelOf(importer.sourceRefField), value: ref ?? "", code: "required", fix: "enter_value" },
      ];
      continue;
    }
    const first = firstRowOfRef.get(row.sourceRef);
    if (first !== undefined) {
      row.status = "error";
      row.errors = [
        {
          row: n,
          field: importer.sourceRefField,
          heading: headings[importer.sourceRefField] ?? labelOf(importer.sourceRefField),
          value: row.sourceRef,
          code: "duplicate_source_ref",
          fix: "remove_duplicate",
          detail: { firstRow: first },
        },
      ];
      continue;
    }
    firstRowOfRef.set(row.sourceRef, n);

    const staged = open.stageRow(cells);
    if (!staged.ok) {
      row.status = "error";
      row.errors = staged.errors.map((e) => ({ ...e, row: n }));
      continue;
    }
    row.recordId = staged.recordId;
    row.placement = staged.placement;

    const placementValue = cells[placementField] ?? "";
    const placementHeading = headings[placementField] ?? labelOf(placementField);
    const stored = open.existing.get(row.sourceRef);
    let toWrite: C[] | undefined;

    if (stored === undefined) {
      row.status = staged.placement === "placed" ? "ready" : "unplaced";
      toWrite = staged.commands;
    } else if (sameCells(stored.normalized, staged.normalized)) {
      row.status = "unchanged";
      row.recordId = stored.recordId;
    } else {
      row.status = "conflict";
      row.recordId = stored.recordId;
      row.before = stored.normalized;
      row.after = staged.normalized;
      const choice = selection.choices.get(n);
      if (choice !== undefined) {
        row.choice = choice;
        if (choice === "record_correction") {
          const correction = open.correct({
            recordId: stored.recordId,
            sourceRef: row.sourceRef,
            before: stored.normalized,
            after: staged.normalized,
            cells,
          });
          if (!correction.ok) {
            row.status = "error";
            row.errors = correction.errors.map((e) => ({ ...e, row: n }));
            continue;
          }
          row.placement = correction.placement;
          toWrite = correction.commands;
        }
      }
    }

    if (toWrite !== undefined) {
      const result = dryRun(toWrite);
      if (!result.ok) {
        row.status = "error";
        row.errors = [refusal(result.error, n, placementField, placementHeading, placementValue)];
        continue;
      }
      evolving = result.state;
      drafts.push(...result.drafts);
      row.commands = toWrite;
    }
  }

  const counts: ImportCounts = { ready: 0, unchanged: 0, unplaced: 0, conflicts: 0, errors: 0, leftOut: 0 };
  for (const row of rows) {
    switch (row.status) {
      case "ready":
        counts.ready += 1;
        break;
      case "unplaced":
        counts.unplaced += 1;
        break;
      case "unchanged":
        counts.unchanged += 1;
        break;
      case "error":
        counts.errors += 1;
        break;
      case "left_out":
        counts.leftOut += 1;
        break;
      case "conflict":
        if (row.choice === undefined) counts.conflicts += 1;
        else if (row.choice === "keep_current") counts.unchanged += 1;
        else if (row.placement === "unplaced") counts.unplaced += 1;
        else counts.ready += 1;
        break;
    }
  }

  return {
    sheet: importer.sheet,
    siteId: input.siteId,
    baseRevision: input.baseRevision,
    rows,
    counts,
    writes: rows.filter((r) => r.commands.length > 0).length,
    drafts,
    input,
    selection,
  };
}

const NO_SELECTION: Selection = { leftOut: new Map(), choices: new Map(), fixes: new Map() };

/** Stage every row. Nothing is stored. */
export function stageImport<S, C extends { type: string }, E extends { type: string }>(
  input: StageInput<S, C, E>,
): StagedImport<S, C, E> {
  return run(input, NO_SELECTION);
}

function withSelection<S, C extends { type: string }, E extends { type: string }>(
  staged: StagedImport<S, C, E>,
  change: (s: { leftOut: Map<number, string>; choices: Map<number, ConflictChoice>; fixes: Map<number, Record<string, string>> }) => void,
): StagedImport<S, C, E> {
  const next = {
    leftOut: new Map(staged.selection.leftOut),
    choices: new Map(staged.selection.choices),
    fixes: new Map(staged.selection.fixes),
  };
  change(next);
  return run(staged.input, next);
}

/** Replace the cells of one row. The row is checked again with the rows after it. */
export function fixRow<S, C extends { type: string }, E extends { type: string }>(
  staged: StagedImport<S, C, E>,
  rowNumber: number,
  cells: Record<string, string>,
): StagedImport<S, C, E> {
  return withSelection(staged, (s) => s.fixes.set(rowNumber, { ...cells }));
}

export function leaveOut<S, C extends { type: string }, E extends { type: string }>(
  staged: StagedImport<S, C, E>,
  rowNumber: number,
  reason: string,
): StagedImport<S, C, E> {
  return withSelection(staged, (s) => s.leftOut.set(rowNumber, reason));
}

export function restoreRow<S, C extends { type: string }, E extends { type: string }>(
  staged: StagedImport<S, C, E>,
  rowNumber: number,
): StagedImport<S, C, E> {
  return withSelection(staged, (s) => s.leftOut.delete(rowNumber));
}

export function chooseConflict<S, C extends { type: string }, E extends { type: string }>(
  staged: StagedImport<S, C, E>,
  rowNumber: number,
  choice: ConflictChoice,
): StagedImport<S, C, E> {
  return withSelection(staged, (s) => s.choices.set(rowNumber, choice));
}

export function canCommit<S, C extends { type: string }, E extends { type: string }>(staged: StagedImport<S, C, E>): boolean {
  return staged.counts.errors === 0 && staged.counts.conflicts === 0 && staged.writes > 0;
}

/** The private download of left out rows: row, source ref and reason. */
export function leftOutCsv<S, C extends { type: string }, E extends { type: string }>(
  staged: StagedImport<S, C, E>,
  headings: readonly [string, string, string],
): string {
  const rows = staged.rows
    .filter((r) => r.status === "left_out")
    .map((r) => [String(r.rowNumber), r.sourceRef ?? "", r.leftOutReason ?? ""]);
  return toCsv(headings, rows);
}

export interface KeySource {
  type: string;
  /** The event body, without its type. */
  fields: Record<string, unknown>;
  entityIds: readonly string[];
  sourceRef?: string;
}

const text = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** Unique keys for plot codes and source refs. Used by commits and by restore. */
export function uniqueKeysFor(
  events: readonly KeySource[],
  sectionNames?: ReadonlyMap<string, string>,
): UniqueKeyRequest[] {
  const keys: UniqueKeyRequest[] = [];
  const seen = new Set<string>();
  const add = (request: UniqueKeyRequest) => {
    const id = `${request.key}\u0000${request.owner}`;
    if (seen.has(id)) return;
    seen.add(id);
    keys.push(request);
  };
  for (const event of events) {
    const code = text(event.fields["code"]);
    const plotId = text(event.fields["plotId"]);
    if ((event.type === "plot_added" || event.type === "plot_renamed") && code !== undefined && plotId !== undefined) {
      const request: UniqueKeyRequest = { key: codeUniqueKey(code), owner: plotId };
      const section = text(event.fields["sectionId"]);
      const label = section === undefined ? undefined : sectionNames?.get(section);
      if (label !== undefined) request.label = label;
      add(request);
    }
    const sheet = text(event.fields["sheet"]);
    const owner = event.entityIds[0];
    if (sheet !== undefined && event.sourceRef !== undefined && owner !== undefined) {
      add({ key: `source:${sheet}:${event.sourceRef}`, owner });
    }
  }
  return keys;
}

export function keySourceOfDraft(draft: DraftEvent): KeySource {
  const { type, ...fields } = draft.event as { type: string } & Record<string, unknown>;
  const source: KeySource = { type, fields, entityIds: draft.entityIds };
  if (draft.sourceRef !== undefined) source.sourceRef = draft.sourceRef;
  return source;
}

export function keySourceOfStored(event: StoredEvent): KeySource {
  const source: KeySource = {
    type: event.type,
    fields: (event.payload ?? {}) as Record<string, unknown>,
    entityIds: event.entityIds,
  };
  if (event.sourceRef !== undefined) source.sourceRef = event.sourceRef;
  return source;
}

/**
 * Write every selected row in one commit, or none. A second call with the same
 * operation ID returns the earlier result. A failure keeps the staged rows.
 */
export async function commitImport<S, C extends { type: string }, E extends { type: string }>(
  db: IDBDatabase,
  staged: StagedImport<S, C, E>,
  options: { opId: Uuid; now?: () => Date; newId?: () => string },
): Promise<ImportCommit> {
  if (staged.counts.errors > 0) return { ok: false, code: "import_has_errors", errors: staged.counts.errors };
  if (staged.counts.conflicts > 0) return { ok: false, code: "import_has_conflicts", conflicts: staged.counts.conflicts };
  if (staged.writes === 0) return { ok: false, code: "nothing_to_import" };

  const writing = staged.rows.filter((r) => r.commands.length > 0);
  const input: Parameters<typeof commit>[1] = {
    siteId: staged.siteId,
    expectedRevision: staged.baseRevision,
    opId: options.opId,
    commands: writing.flatMap((r) => r.commands),
    events: staged.drafts as DraftEvent[],
    uniqueKeys: uniqueKeysFor(staged.drafts.map((d) => keySourceOfDraft(d as DraftEvent))),
  };
  if (options.now !== undefined) input.now = options.now;
  if (options.newId !== undefined) input.newId = options.newId;
  const result = await commit(db, input);
  if (!result.ok) return { ok: false, code: result.error.code, error: result.error };
  return {
    ok: true,
    revision: result.revision,
    written: writing.length,
    unplaced: writing.filter((r) => r.placement === "unplaced").length,
    replayed: result.replayed,
  };
}
