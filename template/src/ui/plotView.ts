// The plots of the open register as rows for the screens: code, section, state and one summary line.
// No React, no English: every word is a catalog key.
import { plotSummaryAt } from "../status";
import type { PlotSummary } from "../status";
import type { Plot } from "../types";
import { plotSummaryText } from "./copy";
import type { T } from "./messages";
import type { OpenRegister } from "./shellContext";

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

/** Every plot of the register, in code order, with its state at today's date. */
export function plotRows(open: OpenRegister, t: T): PlotRow[] {
  const rows: PlotRow[] = [];
  for (const plot of Object.values(open.state.core.plots)) {
    const summary = plotSummaryAt(open.state.core, plot.plotId, open.today);
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
