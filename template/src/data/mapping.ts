// Column mapping and cell checks. No React, no storage.
// Headings are normalised for matching only. Every cell keeps its original text.
import type { FieldDef, SheetDef } from "../adapter";
import { parseDateEntry } from "../calendar";
import type { DateOrder } from "../calendar";
import { LIMITS } from "../limits";
import { parseMoney } from "../money";
import { err, ok } from "../types";
import type { Result } from "../types";
import type { CsvTable } from "./csv";

export interface MappingColumn {
  index: number;
  heading: string;
  /** The register field this column fills. Absent means "Ignore column". */
  fieldKey?: string;
}

export interface Mapping {
  columns: MappingColumn[];
}

export interface CellError {
  /** The data row, counted from 1. */
  row: number;
  field: string;
  heading: string;
  value: string;
  code: string;
  /** A suggested fix, as a code the screen turns into words. */
  fix: string;
  /** Extra facts for the message, for example the source ref that holds a plot. */
  detail?: Record<string, string | number | boolean | undefined>;
}

export interface MappedRow {
  rowNumber: number;
  /** Original text, keyed by field key. Mapped columns only. */
  cells: Record<string, string>;
  errors: CellError[];
}

export interface MapOptions {
  dateOrder?: DateOrder;
}

/** Lower case, accents and everything but letters and digits removed. For matching only. */
export function normaliseHeading(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Other headings that mean the source ref, a concept the template owns. */
const SOURCE_REF_ALIASES = new Set(["ref", "reference", "sourcereference", "entryref", "bookref"]);

/** The fields a sheet can fill: its required and optional headings, in sheet order. */
export function fieldsForSheet(sheet: SheetDef, fields: readonly FieldDef[]): FieldDef[] {
  const byLabel = new Map(fields.map((f) => [normaliseHeading(f.label), f]));
  const found: FieldDef[] = [];
  for (const label of [...sheet.required, ...(sheet.optional ?? [])]) {
    const field = byLabel.get(normaliseHeading(label));
    if (field !== undefined && !found.includes(field)) found.push(field);
  }
  return found;
}

export function suggestMapping(headings: readonly string[], fields: readonly FieldDef[]): Mapping {
  const byLabel = new Map<string, FieldDef>();
  for (const f of fields) {
    byLabel.set(normaliseHeading(f.label), f);
    byLabel.set(normaliseHeading(f.key), f);
  }
  return {
    columns: headings.map((heading, index) => {
      const normal = normaliseHeading(heading);
      let field = byLabel.get(normal);
      if (field === undefined && SOURCE_REF_ALIASES.has(normal)) field = fields.find((f) => f.key === "sourceRef");
      return field === undefined ? { index, heading } : { index, heading, fieldKey: field.key };
    }),
  };
}

export function checkMapping(
  mapping: Mapping,
  sheet: SheetDef,
  fields: readonly FieldDef[],
  table?: CsvTable,
): Result<true> {
  const allowed = new Map(fieldsForSheet(sheet, fields).map((f) => [f.key, f]));
  const taken = new Map<string, MappingColumn>();
  for (const column of mapping.columns) {
    if (column.fieldKey === undefined) continue;
    const field = allowed.get(column.fieldKey);
    if (field === undefined) return err("unknown_field", { field: column.fieldKey, heading: column.heading });
    const first = taken.get(column.fieldKey);
    if (first !== undefined) {
      const detail: Record<string, string | number> = {
        field: field.label,
        heading: column.heading,
        other: first.heading,
        fix: "ignore_one_column",
      };
      if (table !== undefined) {
        detail["row"] = 1;
        detail["value"] = table.rows[0]?.[column.index] ?? "";
      }
      return err("duplicate_mapping", detail);
    }
    taken.set(column.fieldKey, column);
  }
  for (const label of sheet.required) {
    const field = fieldsForSheet({ name: sheet.name, required: [label] }, fields)[0];
    if (field === undefined || !taken.has(field.key)) return err("missing_required_column", { field: label });
  }
  return ok(true);
}

const DATE_FIXES: Record<string, string> = {
  date_year_needed: "use_four_digit_year",
  date_ambiguous: "choose_date_order",
  invalid_date: "use_valid_date",
};

/** The problem with one non blank cell, as a code and a fix, or undefined when it is good. */
function cellProblem(field: FieldDef, text: string, options: MapOptions | undefined): { code: string; fix: string } | undefined {
  const max = field.maxChars ?? LIMITS.noteChars;
  if ([...text].length > max) return { code: "over_limit", fix: "shorten" };
  switch (field.type) {
    case "date": {
      const order = options?.dateOrder;
      const parsed = parseDateEntry(text, order === undefined ? undefined : { order });
      if (parsed.ok) return undefined;
      return { code: parsed.error.code, fix: DATE_FIXES[parsed.error.code] ?? "use_year_first" };
    }
    case "number":
      return /^\d+$/.test(text.trim()) ? undefined : { code: "not_a_number", fix: "use_digits" };
    case "money": {
      const parsed = parseMoney(text);
      if (parsed.ok) return undefined;
      return parsed.error.code === "over_limit"
        ? { code: "over_limit", fix: "use_smaller_amount" }
        : { code: parsed.error.code, fix: "use_two_decimals" };
    }
    case "choice": {
      const wanted = text.trim().toLowerCase();
      return (field.choices ?? []).some((c) => c.toLowerCase() === wanted) ? undefined : { code: "not_a_choice", fix: "use_listed_choice" };
    }
    case "text":
      return undefined;
  }
}

/**
 * Check the cells of one row. `headings` gives the file heading of each field,
 * for the message. Used for a whole table and again after a row is fixed.
 */
export function checkCells(
  rowNumber: number,
  cells: Record<string, string>,
  headings: Record<string, string>,
  sheet: SheetDef,
  fields: readonly FieldDef[],
  options?: MapOptions,
): CellError[] {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const required = new Set(sheet.required.map(normaliseHeading));
  const errors: CellError[] = [];
  for (const [key, text] of Object.entries(cells)) {
    const field = byKey.get(key);
    if (field === undefined) continue;
    const problem =
      text.trim() === ""
        ? required.has(normaliseHeading(field.label))
          ? { code: "required", fix: "enter_value" }
          : undefined
        : cellProblem(field, text, options);
    if (problem !== undefined) {
      errors.push({ row: rowNumber, field: key, heading: headings[key] ?? field.label, value: text, ...problem });
    }
  }
  return errors;
}

/**
 * Turn a table into rows keyed by field. Cell errors do not stop the read:
 * each is listed with its row, heading, value and a fix. A mapping that is
 * itself wrong (a missing or doubled column) refuses the whole table.
 */
export function applyMapping(
  table: CsvTable,
  mapping: Mapping,
  sheet: SheetDef,
  fields: readonly FieldDef[],
  options?: MapOptions,
): Result<MappedRow[]> {
  const checked = checkMapping(mapping, sheet, fields, table);
  if (!checked.ok) return checked;
  const used = mapping.columns.filter((c): c is MappingColumn & { fieldKey: string } => c.fieldKey !== undefined);
  const headings: Record<string, string> = {};
  for (const column of used) headings[column.fieldKey] = column.heading;

  const rows: MappedRow[] = table.rows.map((raw, i) => {
    const rowNumber = i + 1;
    const cells: Record<string, string> = {};
    for (const column of used) cells[column.fieldKey] = raw[column.index] ?? "";
    return { rowNumber, cells, errors: checkCells(rowNumber, cells, headings, sheet, fields, options) };
  });
  return ok(rows);
}