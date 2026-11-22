// Fast entry: rows beside a page, repeat aids, paste, draft and recovery file. No React.
// Every function returns a new session and touches nothing else.
import { z } from "zod";
import type { FieldDef, SheetDef } from "../adapter";
import type { DateOrder } from "../calendar";
import { LIMITS, checkLimit, checkText } from "../limits";
import { err, ok } from "../types";
import type { Result, Uuid } from "../types";
import { previewRows } from "./csv";
import type { Draft } from "./drafts";
import { checkCells, fieldsForSheet } from "./mapping";
import type { CellError, MappedRow } from "./mapping";

export type Rotation = 0 | 90 | 180 | 270;

export interface PageView {
  /** One based page number of the register. */
  index: number;
  zoom: number;
  rotation: Rotation;
}

export interface EntryRow {
  rowId: string;
  cells: Record<string, string>;
  /** True once the row has been committed. */
  saved: boolean;
}

export interface EntrySession {
  rows: EntryRow[];
  /** Zero based index of the row being typed. */
  currentRow: number;
  /** Where focus should go after a failed review: a one based row and a field key. */
  focus?: { row: number; field: string };
  page: PageView;
  /** The keeper chose "Keep page with register". */
  keepPage: boolean;
  /** A page photo is in use. */
  pageChosen: boolean;
  nextRowId: number;
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.25;

function emptyRow(id: number): EntryRow {
  return { rowId: `row-${id}`, cells: {}, saved: false };
}

export function newSession(): EntrySession {
  return {
    rows: [emptyRow(1)],
    currentRow: 0,
    page: { index: 1, zoom: 1, rotation: 0 },
    keepPage: false,
    pageChosen: false,
    nextRowId: 2,
  };
}

/** Add an empty row after the one given. By default it goes at the end. */
export function addRow(s: EntrySession, afterIndex = s.rows.length - 1): EntrySession {
  const at = Math.min(Math.max(afterIndex + 1, 0), s.rows.length);
  const rows = [...s.rows];
  rows.splice(at, 0, emptyRow(s.nextRowId));
  return { ...s, rows, nextRowId: s.nextRowId + 1 };
}

/** Remove a row. The last row is never removed. */
export function removeRow(s: EntrySession, index: number): EntrySession {
  if (s.rows.length <= 1 || index < 0 || index >= s.rows.length) return s;
  const rows = s.rows.filter((_, i) => i !== index);
  const shifted = index < s.currentRow ? s.currentRow - 1 : s.currentRow;
  return { ...s, rows, currentRow: Math.min(shifted, rows.length - 1) };
}

export function setCell(s: EntrySession, rowIndex: number, field: string, value: string): EntrySession {
  const row = s.rows[rowIndex];
  if (row === undefined) return s;
  const rows = [...s.rows];
  rows[rowIndex] = { ...row, cells: { ...row.cells, [field]: value } };
  return { ...s, rows };
}

export function setCurrentRow(s: EntrySession, rowIndex: number): EntrySession {
  return { ...s, currentRow: Math.min(Math.max(rowIndex, 0), s.rows.length - 1) };
}

/** Copy the repeatable values of one kind from the row above. Never a name, a note or a source ref. */
export function repeatFromAbove(
  s: EntrySession,
  rowIndex: number,
  kind: "section" | "page",
  fields: readonly FieldDef[],
  sourceRefKey = "sourceRef",
): EntrySession {
  const above = s.rows[rowIndex - 1];
  if (rowIndex <= 0 || above === undefined) return s;
  let next = s;
  for (const field of fields) {
    if (field.repeat !== kind || field.key === sourceRefKey) continue;
    const value = above.cells[field.key];
    if (value !== undefined && value !== "") next = setCell(next, rowIndex, field.key, value);
  }
  return next;
}

/** Add one to a run of digits, keeping its width. The result may be one digit longer. */
function incrementDigits(digits: string): string {
  const chars = digits.split("");
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] === "9") {
      chars[i] = "0";
      i -= 1;
    } else {
      chars[i] = String(Number(chars[i]) + 1);
      return chars.join("");
    }
  }
  return `1${chars.join("")}`;
}

/** The plot of the row above, one more, with its prefix and zero padding kept. */
export function fillPlotSequence(s: EntrySession, rowIndex: number, plotKey: string): Result<EntrySession> {
  const above = s.rows[rowIndex - 1];
  const plot = above?.cells[plotKey]?.trim() ?? "";
  if (rowIndex <= 0 || above === undefined || plot === "") return err("no_row_above");
  const match = /^(.*?)(\d+)$/.exec(plot);
  if (match === null) return err("no_trailing_number", { plot });
  const next = `${match[1] as string}${incrementDigits(match[2] as string)}`;
  const length = checkText("plotCodeChars", next, { ref: next });
  if (!length.ok) return length;
  return ok(setCell(s, rowIndex, plotKey, next));
}

/** Fill rows from a rectangular paste, starting at one cell. */
export function pasteCells(
  s: EntrySession,
  rowIndex: number,
  startField: string,
  text: string,
  fields: readonly FieldDef[],
): Result<EntrySession> {
  const start = fields.findIndex((f) => f.key === startField);
  if (start < 0) return err("unknown_field", { field: startField });
  if (text.trim() === "") return err("empty_paste");
  const records = previewRows(text, "tab", LIMITS.csvDataRows + 2);
  const width = records[0]?.length ?? 0;
  if (width === 0) return err("empty_paste");
  if (records.some((r) => r.length !== width)) return err("not_rectangular");
  if (start + width > fields.length) return err("paste_too_wide", { width, room: fields.length - start });
  const total = Math.max(s.rows.length, rowIndex + records.length);
  const rowLimit = checkLimit("csvDataRows", total);
  if (!rowLimit.ok) return rowLimit;
  for (const [r, record] of records.entries()) {
    for (const cell of record) {
      const long = checkText("csvCellChars", cell, { row: rowIndex + r + 1 });
      if (!long.ok) return long;
    }
  }

  let next = s;
  while (next.rows.length < rowIndex + records.length) next = addRow(next);
  for (const [r, record] of records.entries()) {
    for (const [c, cell] of record.entries()) {
      next = setCell(next, rowIndex + r, (fields[start + c] as FieldDef).key, cell);
    }
  }
  return ok(next);
}

function withPage(s: EntrySession, patch: Partial<PageView>): EntrySession {
  return { ...s, page: { ...s.page, ...patch } };
}

export function nextPage(s: EntrySession): EntrySession {
  return withPage(s, { index: s.page.index + 1 });
}

export function previousPage(s: EntrySession): EntrySession {
  return withPage(s, { index: Math.max(1, s.page.index - 1) });
}

const roundQuarter = (n: number): number => Math.round(n * 100) / 100;

export function zoomIn(s: EntrySession): EntrySession {
  return withPage(s, { zoom: Math.min(ZOOM_MAX, roundQuarter(s.page.zoom + ZOOM_STEP)) });
}

export function zoomOut(s: EntrySession): EntrySession {
  return withPage(s, { zoom: Math.max(ZOOM_MIN, roundQuarter(s.page.zoom - ZOOM_STEP)) });
}

export function rotatePage(s: EntrySession): EntrySession {
  return withPage(s, { rotation: ((s.page.rotation + 90) % 360) as Rotation });
}

/** A page photo is chosen. */
export function choosePage(s: EntrySession): EntrySession {
  return { ...s, pageChosen: true };
}

export function setKeepPage(s: EntrySession, keep: boolean): EntrySession {
  return { ...s, keepPage: keep };
}

/** Close the page. The image is released unless the keeper chose to keep it. */
export function closePage(s: EntrySession): { session: EntrySession; releaseImage: boolean } {
  if (!s.pageChosen || s.keepPage) return { session: s, releaseImage: false };
  return { session: { ...s, pageChosen: false }, releaseImage: true };
}

/** The unsaved, non empty rows as mapped rows, numbered by their place on screen. */
export function rowsToMapped(
  s: EntrySession,
  sheet: SheetDef,
  fields: readonly FieldDef[],
  options?: { dateOrder?: DateOrder },
): MappedRow[] {
  const sheetFields = fieldsForSheet(sheet, fields);
  const headings: Record<string, string> = {};
  for (const f of sheetFields) headings[f.key] = f.label;
  const rows: MappedRow[] = [];
  for (const [i, row] of s.rows.entries()) {
    if (row.saved || Object.values(row.cells).every((v) => v.trim() === "")) continue;
    const cells: Record<string, string> = {};
    for (const f of sheetFields) cells[f.key] = row.cells[f.key] ?? "";
    const rowNumber = i + 1;
    rows.push({ rowNumber, cells, errors: checkCells(rowNumber, cells, headings, sheet, fields, options) });
  }
  return rows;
}

/** The first error by row and then by the order of the fields. */
export function firstProblem(errors: readonly CellError[], fields: readonly FieldDef[]): { row: number; field: string } | undefined {
  const order = (key: string) => {
    const i = fields.findIndex((f) => f.key === key);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sorted = [...errors].sort((a, b) => a.row - b.row || order(a.field) - order(b.field));
  const first = sorted[0];
  return first === undefined ? undefined : { row: first.row, field: first.field };
}

/** After a failed review: point focus at the first problem and change nothing else. */
export function focusProblem(s: EntrySession, problem: { row: number; field: string } | undefined): EntrySession {
  const { focus: _focus, ...rest } = s;
  return problem === undefined ? rest : { ...rest, focus: problem };
}

/** Mark rows saved once a commit has completed. Row numbers are one based. */
export function markSaved(s: EntrySession, rowNumbers: readonly number[]): EntrySession {
  const done = new Set(rowNumbers);
  return { ...s, rows: s.rows.map((r, i) => (done.has(i + 1) ? { ...r, saved: true } : r)) };
}

export function toDraft(
  s: EntrySession,
  meta: { draftId: Uuid; siteId: Uuid; kind: string; baseRevision: number; savedAt: string },
): Draft {
  const unsaved = s.rows.filter((r) => !r.saved);
  const before = s.rows.slice(0, s.currentRow).filter((r) => !r.saved).length;
  return {
    draftId: meta.draftId,
    siteId: meta.siteId,
    kind: meta.kind,
    baseRevision: meta.baseRevision,
    rawRows: unsaved.map((r) => ({ ...r.cells })),
    mapping: { page: String(s.page.index), zoom: String(s.page.zoom), rotation: String(s.page.rotation) },
    currentRow: Math.min(before, Math.max(unsaved.length - 1, 0)),
    commands: [],
    pageImageNeedsReselect: s.pageChosen && !s.keepPage,
    savedAt: meta.savedAt,
  };
}

export function fromDraft(draft: Pick<Draft, "rawRows" | "mapping" | "currentRow" | "pageImageNeedsReselect">): EntrySession {
  let s = newSession();
  const rows: EntryRow[] = [];
  for (const raw of draft.rawRows) {
    const cells: Record<string, string> = {};
    if (raw !== null && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) if (typeof v === "string") cells[k] = v;
    }
    rows.push({ rowId: `row-${s.nextRowId}`, cells, saved: false });
    s = { ...s, nextRowId: s.nextRowId + 1 };
  }
  if (rows.length === 0) rows.push(emptyRow(s.nextRowId));
  const index = Number(draft.mapping["page"]);
  const zoom = Number(draft.mapping["zoom"]);
  const rotation = Number(draft.mapping["rotation"]);
  return {
    ...s,
    rows,
    nextRowId: s.nextRowId + 1,
    currentRow: Math.min(Math.max(draft.currentRow, 0), rows.length - 1),
    page: {
      index: Number.isInteger(index) && index >= 1 ? index : 1,
      zoom: zoom >= ZOOM_MIN && zoom <= ZOOM_MAX ? zoom : 1,
      rotation: [0, 90, 180, 270].includes(rotation) ? (rotation as Rotation) : 0,
    },
  };
}

export type RecoveredDraft = Omit<Draft, "draftId" | "savedAt">;

const draftSchema = z.strictObject({
  format: z.literal("plot.draft.v1"),
  kind: z.string().min(1),
  siteId: z.string().min(1),
  baseRevision: z.number().int().min(0),
  rawRows: z.array(z.record(z.string(), z.string())).max(LIMITS.csvDataRows),
  mapping: z.record(z.string(), z.string()),
  currentRow: z.number().int().min(0),
  commands: z.array(z.unknown()),
  pageImageNeedsReselect: z.boolean(),
});

/** Read a `plot.draft.v1` file for a draft preview. It applies no command and writes nothing. */
export function parseDraftFile(text: string, expected: { kind: string; siteId: Uuid; screen?: string }): Result<RecoveredDraft> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return err("bad_draft_file", { reason: "not_json" });
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return err("wrong_file");
  const format = (raw as Record<string, unknown>)["format"];
  if (typeof format !== "string") return err("wrong_file");
  const version = /^plot\.draft\.v(\d+)$/.exec(format);
  if (version === null) return err("wrong_file");
  if (Number(version[1]) > 1) return err("newer_version");
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) return err("bad_draft_file", { reason: "structure", path: parsed.error.issues[0]?.path.join(".") });
  const file = parsed.data;
  if (file.kind !== expected.kind) return err("wrong_kind");
  if (file.siteId !== expected.siteId) return err("foreign_site");
  // A draft belongs to the screen that made it. Fast entry has no screen name.
  if (file.mapping["screen"] !== expected.screen) return err("wrong_kind");
  return ok({
    kind: file.kind,
    siteId: file.siteId,
    baseRevision: file.baseRevision,
    rawRows: file.rawRows,
    mapping: file.mapping,
    currentRow: file.currentRow,
    commands: file.commands,
    pageImageNeedsReselect: file.pageImageNeedsReselect,
  });
}
