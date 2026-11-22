// Limits from 00-contracts design D12. Pure.
// Tests import these constants from here.
import { err, ok } from "./types";
import type { Result } from "./types";

export type LimitItem =
  | "plotsPerSite"
  | "sectionsPerSite"
  | "spacesPerChurchyardPlot"
  | "domainRecordsPerSite"
  | "eventsPerSite"
  | "gridRows"
  | "gridColumns"
  | "polygonVertices"
  | "csvBytes"
  | "csvDataRows"
  | "csvColumns"
  | "csvCellChars"
  | "nameChars"
  | "plotCodeChars"
  | "sourceRefChars"
  | "noteChars"
  | "moneyMinorUnits"
  | "photoBytes"
  | "photoMegapixels"
  | "photosPerRecord"
  | "photoStoredLongEdge"
  | "archiveCompressedBytes"
  | "archiveDecodedBytes"
  | "archiveAttachmentEntries"
  | "archivePhotoBytesPerSite"
  | "reviewPacketBytes"
  | "reviewIssues"
  | "slipDecisions"
  | "siteAliasChars"
  | "reviewLabelChars";

export type TextItem =
  | "nameChars"
  | "plotCodeChars"
  | "sourceRefChars"
  | "noteChars"
  | "csvCellChars"
  | "siteAliasChars"
  | "reviewLabelChars";

const MiB = 1024 * 1024;

/** The last legal value of each item. */
export const LIMITS: Readonly<Record<LimitItem, number>> = Object.freeze({
  plotsPerSite: 2000,
  sectionsPerSite: 100,
  spacesPerChurchyardPlot: 12,
  domainRecordsPerSite: 20_000,
  eventsPerSite: 100_000,
  gridRows: 100,
  gridColumns: 100,
  polygonVertices: 256,
  csvBytes: 5 * MiB,
  csvDataRows: 5000,
  csvColumns: 40,
  csvCellChars: 4000,
  nameChars: 100,
  plotCodeChars: 24,
  sourceRefChars: 100,
  noteChars: 4000,
  moneyMinorUnits: 99_999_999,
  photoBytes: 12 * MiB,
  photoMegapixels: 24,
  photosPerRecord: 8,
  photoStoredLongEdge: 2400,
  archiveCompressedBytes: 128 * MiB,
  archiveDecodedBytes: 160 * MiB,
  archiveAttachmentEntries: 5000,
  archivePhotoBytesPerSite: 96 * MiB,
  reviewPacketBytes: 2 * MiB,
  reviewIssues: 2000,
  slipDecisions: 2000,
  siteAliasChars: 40,
  reviewLabelChars: 40,
});

export const COORDINATE_MIN = 0;
export const COORDINATE_MAX = 10_000;

/** Where a failing value came from, so the message can name it. */
export interface LimitWhere {
  ref?: string;
  row?: number;
}

function overLimit(item: LimitItem, value: number, where?: LimitWhere) {
  return err("over_limit", {
    item,
    limit: LIMITS[item],
    value,
    ref: where?.ref,
    row: where?.row,
  });
}

/** Accept a count or size up to its limit. One over is refused before commit. */
export function checkLimit(item: LimitItem, value: number, where?: LimitWhere): Result<true> {
  if (!Number.isInteger(value) || value < 0) {
    return err("bad_value", { item, value, ref: where?.ref, row: where?.row });
  }
  if (value > LIMITS[item]) return overLimit(item, value, where);
  return ok(true);
}

/** Measure text in Unicode code points, not UTF-16 units. */
export function checkText(item: TextItem, text: string, where?: LimitWhere): Result<true> {
  let count = 0;
  for (const _ of text) {
    count += 1;
    // Stop early on a huge string. Any count above the limit is refused alike.
    if (count > LIMITS[item]) break;
  }
  return checkLimit(item, count, where);
}

/** A coordinate is an integer from 0 to 10,000. Origin south west. */
export function checkCoordinate(value: number): Result<true> {
  if (!Number.isInteger(value)) return err("bad_value", { item: "coordinate", value });
  if (value < COORDINATE_MIN || value > COORDINATE_MAX) {
    return err("over_limit", {
      item: "coordinate",
      limit: COORDINATE_MAX,
      value,
    });
  }
  return ok(true);
}

/**
 * A site holds at most 20,000 domain records, archived and voided ones included. `existing` is how many it holds
 * and `adding` is how many the command makes. One over is refused before commit and names the item.
 */
export function checkRecordRoom(existing: number, adding = 1): Result<true> {
  return checkLimit("domainRecordsPerSite", existing + adding);
}

/** Rows and columns from 1 to 100 whose product fits the remaining plot capacity. */
export function checkGridSize(rows: number, columns: number, existingPlots: number): Result<true> {
  if (!Number.isInteger(rows) || rows < 1) return err("bad_value", { item: "gridRows", value: rows });
  if (!Number.isInteger(columns) || columns < 1) {
    return err("bad_value", { item: "gridColumns", value: columns });
  }
  const rowCheck = checkLimit("gridRows", rows);
  if (!rowCheck.ok) return rowCheck;
  const columnCheck = checkLimit("gridColumns", columns);
  if (!columnCheck.ok) return columnCheck;
  return checkLimit("plotsPerSite", existingPlots + rows * columns);
}
