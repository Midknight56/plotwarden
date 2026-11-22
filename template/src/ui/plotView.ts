// The plots of the open register as rows for the screens: code, section, state and one summary line.
// No React, no English: every word is a catalog key.
import type { BaseState } from "../base";
import { isValidLocalDate } from "../calendar";
import type { LocalDate } from "../calendar";
import { plotSummaryAt } from "../status";
import type { ClaimFloor, PlotSummary } from "../status";
import type { Plot } from "../types";
import { plotSummaryText } from "./copy";
import type { T } from "./messages";
import type { AnyApp, OpenRegister } from "./shellContext";

export interface PlotRow {
  plot: Plot;
  summary: PlotSummary;
  sectionName: string | undefined;
  /** "Taken", "Needs checking", "Taken · 1 of 2 spaces used". */
  stateText: string;
  /** "Y07 · Yew Walk · Taken". */
  line: string;
}

const natural = (a: string, b: string): number => a.localeCompare(b, "en", { numeric: true });

export function sectionNameOf(open: OpenRegister, plot: Plot): string | undefined {
  return plot.sectionId === undefined ? undefined : open.state.map.sections[plot.sectionId]?.name;
}

/** A typed view date, read: the date, or the catalog key of what is wrong with it. */
export type AsAtReading = { ok: true; date: LocalDate } | { ok: false; key: "invalidDate" | "asAtLater" };

/** Read the text of the "Show the site as at" field: a real day, YYYY-MM-DD, from year 1000, not after today. */
export function readAsAt(text: string, today: LocalDate): AsAtReading {
  const date = text.trim();
  if (!isValidLocalDate(date) || date < "1000-01-01") return { ok: false, key: "invalidDate" };
  return date > today ? { ok: false, key: "asAtLater" } : { ok: true, date };
}

/** The view date named by the address: a valid day before today, else nothing. Today and later give nothing. */
export function asAtOf(query: URLSearchParams, today: LocalDate): LocalDate | undefined {
  const reading = readAsAt(query.get("asAt") ?? "", today);
  return reading.ok && reading.date < today ? reading.date : undefined;
}

/** The query of a route from its parts, in the order given. A part with no value is left out. "" when none remain. */
export function queryOf(parts: Readonly<Record<string, string | undefined>>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(parts)) if (value !== undefined && value !== "") q.set(key, value);
  const text = q.toString();
  return text === "" ? "" : `?${text}`;
}

/** The adapter's earliest day for a claim with no start, bound to one state. Nothing when the adapter has none. */
export function claimFloorFor(app: AnyApp, state: BaseState): ClaimFloor | undefined {
  const ask = app.adapter.claimFloor;
  return ask === undefined ? undefined : (claim) => ask.call(app.adapter, state, claim);
}

/**
 * Every plot of the register, in code order, with its state on `date`, which is today unless a view date is given.
 * `floor` is read for a past view only.
 */
export function plotRows(open: OpenRegister, t: T, date: LocalDate = open.today, floor?: ClaimFloor): PlotRow[] {
  const rows: PlotRow[] = [];
  for (const plot of Object.values(open.state.core.plots)) {
    const summary = plotSummaryAt(open.state.core, plot.plotId, date, date < open.today ? floor : undefined);
    if (summary === undefined) continue;
    const sectionName = sectionNameOf(open, plot);
    const stateText = plotSummaryText(summary);
    rows.push({
      plot,
      summary,
      sectionName,
      stateText,
      line: t("plotSummaryLine", { code: plot.code, section: sectionName ?? t("noSection"), state: stateText }),
    });
  }
  return rows.sort((a, b) => natural(a.plot.code, b.plot.code));
}

export type StateFilter = "all" | "free" | "reserved" | "taken" | "unusable" | "checking";
export const STATE_FILTERS: readonly StateFilter[] = ["all", "free", "reserved", "taken", "unusable", "checking"];

export function matchesFilter(row: PlotRow, filter: StateFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "checking":
      return row.summary.needsChecking;
    default:
      return row.summary.primary === filter;
  }
}

export function parseFilter(value: string | null): StateFilter {
  return STATE_FILTERS.includes(value as StateFilter) ? (value as StateFilter) : "all";
}

/** The count of plots as a sentence: "1 plot" or "12 plots". */
export function plotCountText(count: number, t: T): string {
  return count === 1 ? t("plotCountOne") : t("plotCountMany", { count });
}
