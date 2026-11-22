// A staged import as a draft: the table, its column choices and the keeper's fixes, so a refresh or a stale save loses none.
// A draft holds raw input only. It never holds a command and never changes a revision or an event.
//
// Layout of the draft, all of it plain text so it can be a `plot.draft.v1` file:
//   rawRows[r]            the data row r as { "0": cell, "1": cell, ... }
//   mapping.screen        "import"
//   mapping.sheet         the sheet name
//   mapping.separator     comma, semicolon or tab
//   mapping.order         "", "dmy" or "mdy"
//   mapping["heading:i"]  the heading of column i
//   mapping["field:i"]    the register field of column i, absent for an ignored column
//   mapping["out:n"]      the reason row n was left out
//   mapping["choice:n"]   keep_current or record_correction for conflict row n
//   mapping["fix:n"]      the cells of row n after the keeper fixed it, as JSON text
import type { Uuid } from "../types";
import type { CsvTable, Separator } from "./csv";
import type { Draft } from "./drafts";
import type { ConflictChoice, Selection } from "./importBatch";
import type { MappingColumn } from "./mapping";

/** The draft's screen. It keeps an import draft apart from the rows of fast entry. */
export const IMPORT_SCREEN = "import";

export interface ImportSource {
  sheet: string;
  table: CsvTable;
  columns: MappingColumn[];
  dateOrder: "" | "dmy" | "mdy";
}

export interface ImportDraftMeta {
  draftId: Uuid;
  siteId: Uuid;
  kind: string;
  baseRevision: number;
  savedAt: string;
}

export type RestoredImport = { source: ImportSource; selection: Selection };

const SEPARATORS: readonly Separator[] = ["comma", "semicolon", "tab"];
const CHOICES: readonly ConflictChoice[] = ["keep_current", "record_correction"];

export function importToDraft(source: ImportSource, selection: Selection, meta: ImportDraftMeta): Draft {
  const mapping: Record<string, string> = {
    screen: IMPORT_SCREEN,
    sheet: source.sheet,
    separator: source.table.separator,
    order: source.dateOrder,
  };
  source.table.headings.forEach((heading, i) => {
    mapping[`heading:${i}`] = heading;
  });
  for (const column of source.columns) if (column.fieldKey !== undefined) mapping[`field:${column.index}`] = column.fieldKey;
  for (const [row, reason] of selection.leftOut) mapping[`out:${row}`] = reason;
  for (const [row, choice] of selection.choices) mapping[`choice:${row}`] = choice;
  for (const [row, cells] of selection.fixes) mapping[`fix:${row}`] = JSON.stringify(cells);
  return {
    draftId: meta.draftId,
    siteId: meta.siteId,
    kind: meta.kind,
    baseRevision: meta.baseRevision,
    rawRows: source.table.rows.map((cells) => Object.fromEntries(cells.map((cell, i) => [String(i), cell]))),
    mapping,
    currentRow: 0,
    commands: [],
    pageImageNeedsReselect: false,
    savedAt: meta.savedAt,
  };
}

const rowNumberOf = (key: string, prefix: string): number | undefined => {
  const n = Number(key.slice(prefix.length));
  return Number.isInteger(n) && n >= 1 ? n : undefined;
};

/** Read a draft back. Anything that is not whole and well formed gives nothing, never a half read import. */
export function importFromDraft(draft: Pick<Draft, "rawRows" | "mapping">): RestoredImport | undefined {
  const m = draft.mapping;
  if (m["screen"] !== IMPORT_SCREEN) return undefined;
  const sheet = m["sheet"];
  const separator = SEPARATORS.find((s) => s === m["separator"]);
  const order = m["order"];
  if (sheet === undefined || sheet === "" || separator === undefined || (order !== "" && order !== "dmy" && order !== "mdy")) return undefined;

  const headings: string[] = [];
  for (let i = 0; m[`heading:${i}`] !== undefined; i += 1) headings.push(m[`heading:${i}`] as string);
  if (headings.length === 0) return undefined;

  const rows: string[][] = [];
  for (const raw of draft.rawRows) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const record = raw as Record<string, unknown>;
    const cells: string[] = [];
    for (let i = 0; i < headings.length; i += 1) {
      const cell = record[String(i)];
      if (cell !== undefined && typeof cell !== "string") return undefined;
      cells.push(cell ?? "");
    }
    rows.push(cells);
  }

  const columns: MappingColumn[] = headings.map((heading, index) => {
    const fieldKey = m[`field:${index}`];
    return fieldKey === undefined ? { index, heading } : { index, heading, fieldKey };
  });

  const selection: { leftOut: Map<number, string>; choices: Map<number, ConflictChoice>; fixes: Map<number, Record<string, string>> } = {
    leftOut: new Map(),
    choices: new Map(),
    fixes: new Map(),
  };
  for (const [key, value] of Object.entries(m)) {
    if (key.startsWith("out:")) {
      const row = rowNumberOf(key, "out:");
      if (row === undefined || row > rows.length) return undefined;
      selection.leftOut.set(row, value);
    } else if (key.startsWith("choice:")) {
      const row = rowNumberOf(key, "choice:");
      const choice = CHOICES.find((c) => c === value);
      if (row === undefined || row > rows.length || choice === undefined) return undefined;
      selection.choices.set(row, choice);
    } else if (key.startsWith("fix:")) {
      const row = rowNumberOf(key, "fix:");
      if (row === undefined || row > rows.length) return undefined;
      const cells = parseCells(value);
      if (cells === undefined) return undefined;
      selection.fixes.set(row, cells);
    }
  }
  return { source: { sheet, table: { headings, rows, separator }, columns, dateOrder: order }, selection };
}

function parseCells(text: string): Record<string, string> | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const cells: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") return undefined;
    cells[key] = value;
  }
  return cells;
}
