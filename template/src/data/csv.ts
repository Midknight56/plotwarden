// A strict CSV reader. No React, no storage. It stops at the first exceeded bound.
// Every cell keeps its exact text. Trimming is for matching, never for reading.
import { LIMITS } from "../limits";
import { err, ok } from "../types";
import type { DomainError, Result } from "../types";

export type Separator = "comma" | "semicolon" | "tab";

export const SEPARATOR_CHAR: Readonly<Record<Separator, string>> = { comma: ",", semicolon: ";", tab: "\t" };

export interface CsvTable {
  headings: string[];
  rows: string[][];
  separator: Separator;
}

export interface SeparatorGuess {
  /** `unclear` when two separators both fit. */
  separator: Separator | "unclear";
  /** The first rows read each way, for the screen to show. Only when unclear. */
  previews?: { comma: string[][]; semicolon: string[][] };
}

/** Remove one byte order mark and decode as UTF 8. Anything else is refused. */
export function readCsvBytes(bytes: Uint8Array): Result<string> {
  if (bytes.length > LIMITS.csvBytes) {
    return err("over_limit", { item: "csvBytes", limit: LIMITS.csvBytes, value: bytes.length });
  }
  const start = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  try {
    return ok(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(start)));
  } catch {
    return err("not_utf8");
  }
}

interface Scan {
  records: string[][];
  error?: DomainError;
}

function failure(code: string, detail: Record<string, string | number>): { ok: false; error: DomainError } {
  return err(code, detail);
}

/**
 * One pass over the text. Strict mode returns the first error. Lenient mode
 * keeps going, for a preview. Record 0 is the heading row.
 */
function scan(text: string, sep: string, strict: boolean, maxRecords = Number.POSITIVE_INFINITY): Scan {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let cellChars = 0;
  let state: "start" | "unquoted" | "quoted" | "after" = "start";
  let started = false;
  const rowNumber = () => records.length;

  const fail = (code: string, detail: Record<string, string | number> = {}): Scan => ({
    records,
    error: failure(code, { row: rowNumber(), ...detail }).error,
  });

  const endCell = (): Scan | undefined => {
    row.push(cell);
    cell = "";
    cellChars = 0;
    if (strict && row.length > LIMITS.csvColumns) {
      return fail("over_limit", { item: "csvColumns", limit: LIMITS.csvColumns, value: row.length });
    }
    return undefined;
  };

  const endRecord = (): Scan | undefined => {
    records.push(row);
    row = [];
    state = "start";
    started = false;
    if (!strict) return undefined;
    const dataRows = records.length - 1;
    if (dataRows > LIMITS.csvDataRows) {
      return { records, error: failure("over_limit", { item: "csvDataRows", limit: LIMITS.csvDataRows, value: dataRows, row: dataRows }).error };
    }
    const heading = records[0] as string[];
    const last = records[records.length - 1] as string[];
    if (records.length > 1 && last.length !== heading.length) {
      return { records, error: failure("row_width", { row: records.length - 1, expected: heading.length, found: last.length }).error };
    }
    return undefined;
  };

  const append = (ch: string): Scan | undefined => {
    cell += ch;
    // A low surrogate completes a character the high surrogate already counted.
    const code = ch.charCodeAt(0);
    if (!(code >= 0xdc00 && code <= 0xdfff)) cellChars += 1;
    if (strict && cellChars > LIMITS.csvCellChars) {
      return fail("over_limit", { item: "csvCellChars", limit: LIMITS.csvCellChars, value: cellChars });
    }
    return undefined;
  };

  const n = text.length;
  for (let i = 0; i < n; i += 1) {
    if (records.length >= maxRecords) break;
    const c = text[i] as string;
    const isEol = c === "\n" || c === "\r";
    let problem: Scan | undefined;
    switch (state) {
      case "start":
        if (c === '"') {
          state = "quoted";
          started = true;
        } else if (c === sep) {
          started = true;
          problem = endCell();
        } else if (isEol) {
          if (c === "\r" && text[i + 1] === "\n") i += 1;
          if (started) {
            problem = endCell() ?? endRecord();
          }
        } else {
          state = "unquoted";
          started = true;
          problem = append(c);
        }
        break;
      case "unquoted":
        if (c === '"') {
          if (strict) return fail("stray_quote");
          problem = append(c);
        } else if (c === sep) {
          problem = endCell();
          state = "start";
        } else if (isEol) {
          if (c === "\r" && text[i + 1] === "\n") i += 1;
          problem = endCell() ?? endRecord();
        } else {
          problem = append(c);
        }
        break;
      case "quoted":
        if (c === '"') {
          if (text[i + 1] === '"') {
            problem = append('"');
            i += 1;
          } else {
            state = "after";
          }
        } else {
          problem = append(c);
        }
        break;
      case "after":
        if (c === sep) {
          problem = endCell();
          state = "start";
        } else if (isEol) {
          if (c === "\r" && text[i + 1] === "\n") i += 1;
          problem = endCell() ?? endRecord();
        } else if (strict) {
          return fail("text_after_quote");
        } else {
          state = "unquoted";
          problem = append(c);
        }
        break;
    }
    if (problem !== undefined) return problem;
  }

  if (records.length < maxRecords) {
    if (state === "quoted") {
      if (strict) return fail("unclosed_quote");
      const problem = endCell() ?? endRecord();
      if (problem !== undefined) return problem;
    } else if (started) {
      const problem = endCell() ?? endRecord();
      if (problem !== undefined) return problem;
    }
  }
  return { records };
}

function headingLineCounts(text: string): Record<Separator, number> {
  const counts: Record<Separator, number> = { comma: 0, semicolon: 0, tab: 0 };
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i] as string;
    if (c === '"') quoted = !quoted;
    else if (!quoted) {
      if (c === "\n" || c === "\r") break;
      if (c === ",") counts.comma += 1;
      else if (c === ";") counts.semicolon += 1;
      else if (c === "\t") counts.tab += 1;
    }
  }
  return counts;
}

/** The first rows read with a separator. It never fails. For the live preview. */
export function previewRows(text: string, separator: Separator, count = 5): string[][] {
  return scan(text, SEPARATOR_CHAR[separator], false, count).records;
}

function fits(text: string, separator: Separator): boolean {
  const rows = previewRows(text, separator, 6);
  const first = rows[0];
  return first !== undefined && first.length >= 2 && rows.every((r) => r.length === first.length);
}

export function detectSeparator(text: string): SeparatorGuess {
  const counts = headingLineCounts(text);
  if (counts.tab > 0) return { separator: "tab" };
  if (counts.comma === 0 && counts.semicolon === 0) return { separator: "comma" };
  if (counts.semicolon === 0) return { separator: "comma" };
  if (counts.comma === 0) return { separator: "semicolon" };
  const comma = fits(text, "comma");
  const semicolon = fits(text, "semicolon");
  if (comma && !semicolon) return { separator: "comma" };
  if (semicolon && !comma) return { separator: "semicolon" };
  return {
    separator: "unclear",
    previews: { comma: previewRows(text, "comma"), semicolon: previewRows(text, "semicolon") },
  };
}

function utf8Length(text: string): number {
  if (text.length * 3 <= LIMITS.csvBytes) return text.length * 3;
  return new TextEncoder().encode(text).length;
}

/**
 * Read a CSV. With no separator given, it is detected, and an unclear one
 * is an error with the code `separator_unclear`.
 */
export function parseCsv(text: string, options?: { separator?: Separator }): Result<CsvTable> {
  // The cheap bound first: a text that cannot be over the limit is not encoded.
  if (utf8Length(text) > LIMITS.csvBytes) {
    const bytes = new TextEncoder().encode(text).length;
    if (bytes > LIMITS.csvBytes) return err("over_limit", { item: "csvBytes", limit: LIMITS.csvBytes, value: bytes });
  }
  let separator = options?.separator;
  if (separator === undefined) {
    const guess = detectSeparator(text);
    if (guess.separator === "unclear") return err("separator_unclear");
    separator = guess.separator;
  }
  const scanned = scan(text, SEPARATOR_CHAR[separator], true);
  if (scanned.error !== undefined) return { ok: false, error: scanned.error };
  const [headings, ...rows] = scanned.records;
  if (headings === undefined) return err("empty_file");
  return ok({ headings, rows, separator });
}
