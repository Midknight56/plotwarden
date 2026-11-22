// Dates and time. Pure: no React, no IndexedDB, no app.
// Calendar arithmetic uses UTC year, month and day numbers, so a daylight
// saving change can never move a date.
import { err, ok } from "./types";
import type { Result } from "./types";

/** A calendar date in the site zone, written YYYY-MM-DD. */
export type LocalDate = string;

/** A UTC instant with an offset, written as ISO 8601. */
export type IsoInstant = string;

/** A burial date at the precision it was recorded. Wire form of design D4. */
export type PartialDate =
  | { p: "unknown" }
  | { p: "year"; y: number }
  | { p: "month"; y: number; m: number }
  | { p: "day"; y: number; m: number; d: number };

/** A half open span `[start, endExclusive)`. A missing end is unbounded. */
export interface Interval {
  start?: LocalDate;
  endExclusive?: LocalDate;
}

export interface DateEntry {
  value: PartialDate;
  /** The entry exactly as typed. */
  text: string;
}

/** The day and month order chosen once for a whole import. */
export type DateOrder = "dmy" | "mdy";

export const MIN_YEAR = 1000;
export const MAX_YEAR = 9999;

/** English month names. Display words that use them live in `ui/copy.ts`. */
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_LOOKUP: Record<string, number> = {};
MONTH_NAMES.forEach((name, index) => {
  const lower = name.toLowerCase();
  MONTH_LOOKUP[lower] = index + 1;
  MONTH_LOOKUP[lower.slice(0, 3)] = index + 1;
});
MONTH_LOOKUP["sept"] = 9;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function validYMD(y: number, m: number, d: number): boolean {
  return (
    Number.isInteger(y) &&
    Number.isInteger(m) &&
    Number.isInteger(d) &&
    y >= MIN_YEAR &&
    y <= MAX_YEAR &&
    m >= 1 &&
    m <= 12 &&
    d >= 1 &&
    d <= daysInMonth(y, m)
  );
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function format(y: number, m: number, d: number): LocalDate {
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidLocalDate(s: string): boolean {
  const match = LOCAL_DATE.exec(s);
  if (!match) return false;
  return validYMD(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function parseLocalDate(s: string): Result<LocalDate> {
  return isValidLocalDate(s) ? ok(s) : err("invalid_date");
}

/** Dates in the form YYYY-MM-DD sort as text. Both must be valid. */
export function compareLocalDate(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function dayNumber(date: LocalDate): number {
  const match = LOCAL_DATE.exec(date);
  if (!match) throw new RangeError(`Not a local date: ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
}

export function addDays(date: LocalDate, n: number): LocalDate {
  const moved = new Date((dayNumber(date) + n) * 86_400_000);
  return format(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

/** The number of calendar days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return dayNumber(b) - dayNumber(a);
}

function partial(value: PartialDate, text: string): Result<DateEntry> {
  return ok({ value, text });
}

/**
 * Read a date entry at the precision it was typed. Never fills a missing month
 * or day, never guesses a day and month order, never guesses a century.
 */
export function parseDateEntry(text: string, opts?: { order?: DateOrder }): Result<DateEntry> {
  const t = text.trim().toLowerCase();
  if (t === "" || t === "unknown" || t === "date unknown") return partial({ p: "unknown" }, text);

  let match = /^(\d{4})$/.exec(t);
  if (match) {
    const y = Number(match[1]);
    return y >= MIN_YEAR && y <= MAX_YEAR ? partial({ p: "year", y }, text) : err("invalid_date");
  }

  match = /^(\d{4})-(\d{2})$/.exec(t);
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]);
    return validYMD(y, m, 1) ? partial({ p: "month", y, m }, text) : err("invalid_date");
  }

  match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    return validYMD(y, m, d) ? partial({ p: "day", y, m, d }, text) : err("invalid_date");
  }

  match = /^(?:(\d{1,2})\s+)?([a-z]+)\.?\s+(\d{4})$/.exec(t);
  if (match) {
    const m = MONTH_LOOKUP[match[2] ?? ""];
    const y = Number(match[3]);
    if (m === undefined) return err("invalid_date");
    if (match[1] === undefined) {
      return validYMD(y, m, 1) ? partial({ p: "month", y, m }, text) : err("invalid_date");
    }
    const d = Number(match[1]);
    return validYMD(y, m, d) ? partial({ p: "day", y, m, d }, text) : err("invalid_date");
  }

  match = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{2}|\d{4})$/.exec(t);
  if (match) {
    const year = match[4] ?? "";
    if (year.length === 2) return err("date_year_needed");
    const order = opts?.order;
    if (order === undefined) return err("date_ambiguous");
    const first = Number(match[1]);
    const second = Number(match[3]);
    const y = Number(year);
    const d = order === "dmy" ? first : second;
    const m = order === "dmy" ? second : first;
    return validYMD(y, m, d) ? partial({ p: "day", y, m, d }, text) : err("invalid_date");
  }

  return err("invalid_date");
}

/** The first and last day a date could mean. Unknown could mean any day. */
export function coveredInterval(v: PartialDate): { first: LocalDate; last: LocalDate } | undefined {
  switch (v.p) {
    case "unknown":
      return undefined;
    case "year":
      return { first: format(v.y, 1, 1), last: format(v.y, 12, 31) };
    case "month":
      return { first: format(v.y, v.m, 1), last: format(v.y, v.m, daysInMonth(v.y, v.m)) };
    case "day":
      return { first: format(v.y, v.m, v.d), last: format(v.y, v.m, v.d) };
  }
}

/**
 * Inside when every day it could mean is inside the period, outside when none
 * is, otherwise incomplete. An unknown date is always incomplete.
 */
export function classifyInPeriod(
  v: PartialDate,
  period: { from: LocalDate; through: LocalDate },
): "inside" | "outside" | "incomplete" {
  const span = coveredInterval(v);
  if (span === undefined) return "incomplete";
  if (span.last < period.from || span.first > period.through) return "outside";
  if (span.first >= period.from && span.last <= period.through) return "inside";
  return "incomplete";
}

const PRECISION_RANK = { day: 0, month: 1, year: 2, unknown: 3 } as const;

/** Order by earliest possible day, then finer precision, then write order. Unknown last. */
export function sortPartialDates<T extends { date: PartialDate; seq: number }>(items: readonly T[]): T[] {
  const key = (item: T) => {
    const span = coveredInterval(item.date);
    return { first: span?.first ?? "\uffff", rank: PRECISION_RANK[item.date.p], seq: item.seq };
  };
  return [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka.first !== kb.first) return ka.first < kb.first ? -1 : 1;
    if (ka.rank !== kb.rank) return ka.rank - kb.rank;
    return ka.seq - kb.seq;
  });
}

function isEmptyInterval(i: Interval): boolean {
  return i.start !== undefined && i.endExclusive !== undefined && i.start >= i.endExclusive;
}

/** True when `date` is in `[start, endExclusive)`. */
export function intervalCovers(i: Interval, date: LocalDate): boolean {
  if (i.start !== undefined && date < i.start) return false;
  if (i.endExclusive !== undefined && date >= i.endExclusive) return false;
  return true;
}

/** True when two half open spans share at least one day. */
export function intervalsOverlap(a: Interval, b: Interval): boolean {
  if (isEmptyInterval(a) || isEmptyInterval(b)) return false;
  const aStartsBeforeBEnds = a.start === undefined || b.endExclusive === undefined || a.start < b.endExclusive;
  const bStartsBeforeAEnds = b.start === undefined || a.endExclusive === undefined || b.start < a.endExclusive;
  return aStartsBeforeBEnds && bStartsBeforeAEnds;
}

export function isValidZone(zone: string): boolean {
  if (zone === "") return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const zoneFormats = new Map<string, Intl.DateTimeFormat>();

/** The local calendar date of an instant in a zone. Used to show a write time. */
export function localDateOf(instant: IsoInstant, zone: string): LocalDate {
  const time = Date.parse(instant);
  if (Number.isNaN(time)) throw new RangeError(`Not an instant: ${instant}`);
  let formatter = zoneFormats.get(zone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    zoneFormats.set(zone, formatter);
  }
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(time))) parts[part.type] = part.value;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** A write time: UTC with an offset. */
export function writeTime(d: Date): IsoInstant {
  return d.toISOString().replace(/Z$/, "+00:00");
}
