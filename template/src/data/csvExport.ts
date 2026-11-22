// Writing CSV for a spreadsheet. Only the CSV export escapes formula text.
// A private backup keeps every string exactly as it was entered.
import type { FieldDef, SheetDef } from "../adapter";
import { fieldsForSheet } from "./mapping";

export interface GuideWords {
  heading: string;
  needed: string;
  format: string;
  yes: string;
  no: string;
  /** May hold {max}. */
  text: string;
  date: string;
  number: string;
  money: string;
  /** May hold {choices}. */
  choice: string;
}

/** A first character a spreadsheet may read as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Prefix formula text with an apostrophe, then quote the cell if it needs it. */
export function escapeCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** A byte order mark, then CRLF separated lines. */
export function toCsv(headings: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [headings, ...rows].map((row) => row.map(escapeCell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function formatOf(field: FieldDef, words: GuideWords): string {
  switch (field.type) {
    case "text":
      return words.text.replace("{max}", String(field.maxChars ?? 100));
    case "date":
      return words.date;
    case "number":
      return words.number;
    case "money":
      return words.money;
    case "choice":
      return words.choice.replace("{choices}", (field.choices ?? []).join(", "));
  }
}

/** The "Download column guide" file for one sheet. */
export function columnGuide(sheet: SheetDef, fields: readonly FieldDef[], words: GuideWords): string {
  const required = new Set(sheet.required);
  const rows = fieldsForSheet(sheet, fields).map((field) => [
    field.label,
    required.has(field.label) ? words.yes : words.no,
    formatOf(field, words),
  ]);
  return toCsv([words.heading, words.needed, words.format], rows);
}
