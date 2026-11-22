// Space and plot state at a date, totals and claim overlap. Pure.
// A space is Free only with positive evidence: it is checked, active and no
// claim covers it. A missing field never makes a space free.
import { intervalCovers, intervalsOverlap } from "./calendar";
import type { Interval, LocalDate } from "./calendar";
import type { Claim, CoreState, PhysicalState, Plot, Space, Uuid } from "./types";

export interface SpaceView {
  checked: boolean;
  retired: boolean;
  /** Absent for an unchecked or retired space. */
  state?: PhysicalState;
}

export interface PlotSummary {
  plotId: Uuid;
  code: string;
  /** Active (not retired) spaces. */
  spaceCount: number;
  /** Counts over checked, active spaces. */
  counts: Record<PhysicalState, number>;
  uncheckedCount: number;
  /** Taken, then Reserved, then Free, then Unusable, over checked spaces. */
  primary?: PhysicalState;
  needsChecking: boolean;
}

export interface SiteTotals {
  plots: { total: number; byPrimary: Record<PhysicalState, number>; needsChecking: number };
  spaces: { total: number; byState: Record<PhysicalState, number>; unchecked: number };
  /** Checked free spaces only. */
  availableSpaces: number;
  /** Plots whose every active space is checked and free. */
  freePlots: number;
}

const PRIMARY_ORDER: readonly PhysicalState[] = ["taken", "reserved", "free", "unusable"];

function zeroCounts(): Record<PhysicalState, number> {
  return { free: 0, reserved: 0, taken: 0, unusable: 0 };
}

export function claimInterval(claim: Claim): Interval {
  const span: Interval = {};
  if (claim.start !== undefined) span.start = claim.start;
  if (claim.endExclusive !== undefined) span.endExclusive = claim.endExclusive;
  return span;
}

function viewOf(space: Space, claims: readonly Claim[], date: LocalDate): SpaceView {
  if (space.retired) return { checked: space.checked, retired: true };
  if (!space.checked) return { checked: false, retired: false };
  const covering = claims.filter((c) => c.voided !== true && intervalCovers(claimInterval(c), date));
  let state: PhysicalState = "free";
  if (covering.some((c) => c.mode === "taken")) state = "taken";
  else if (covering.some((c) => c.mode === "held")) state = "reserved";
  else if (covering.some((c) => c.mode === "unusable")) state = "unusable";
  return { checked: true, retired: false, state };
}

function claimsBySpace(state: CoreState): Map<Uuid, Claim[]> {
  const map = new Map<Uuid, Claim[]>();
  for (const claim of Object.values(state.claims)) {
    const list = map.get(claim.spaceId);
    if (list === undefined) map.set(claim.spaceId, [claim]);
    else list.push(claim);
  }
  return map;
}

function summarise(plot: Plot, bySpace: Map<Uuid, Claim[]>, date: LocalDate): PlotSummary {
  const counts = zeroCounts();
  let unchecked = 0;
  let active = 0;
  for (const space of plot.spaces) {
    const view = viewOf(space, bySpace.get(space.spaceId) ?? [], date);
    if (view.retired) continue;
    active += 1;
    if (view.state === undefined) unchecked += 1;
    else counts[view.state] += 1;
  }
  const summary: PlotSummary = {
    plotId: plot.plotId,
    code: plot.code,
    spaceCount: active,
    counts,
    uncheckedCount: unchecked,
    needsChecking: unchecked > 0,
  };
  const primary = PRIMARY_ORDER.find((s) => counts[s] > 0);
  if (primary !== undefined) summary.primary = primary;
  return summary;
}

/** The state of one space at a date. Undefined when no such space exists. */
export function spaceStateAt(state: CoreState, spaceId: Uuid, date: LocalDate): SpaceView | undefined {
  for (const plot of Object.values(state.plots)) {
    const space = plot.spaces.find((s) => s.spaceId === spaceId);
    if (space === undefined) continue;
    const claims = Object.values(state.claims).filter((c) => c.spaceId === spaceId);
    return viewOf(space, claims, date);
  }
  return undefined;
}

export function plotSummaryAt(state: CoreState, plotId: Uuid, date: LocalDate): PlotSummary | undefined {
  const plot = state.plots[plotId];
  if (plot === undefined) return undefined;
  return summarise(plot, claimsBySpace(state), date);
}

/** Totals at a date. `include` limits them to some plots, for one section for example. */
export function siteTotalsAt(state: CoreState, date: LocalDate, include?: (plot: Plot) => boolean): SiteTotals {
  const bySpace = claimsBySpace(state);
  const totals: SiteTotals = {
    plots: { total: 0, byPrimary: zeroCounts(), needsChecking: 0 },
    spaces: { total: 0, byState: zeroCounts(), unchecked: 0 },
    availableSpaces: 0,
    freePlots: 0,
  };
  for (const plot of Object.values(state.plots)) {
    if (include !== undefined && !include(plot)) continue;
    const summary = summarise(plot, bySpace, date);
    totals.plots.total += 1;
    if (summary.primary !== undefined) totals.plots.byPrimary[summary.primary] += 1;
    if (summary.needsChecking) totals.plots.needsChecking += 1;
    totals.spaces.total += summary.spaceCount;
    totals.spaces.unchecked += summary.uncheckedCount;
    for (const s of PRIMARY_ORDER) totals.spaces.byState[s] += summary.counts[s];
    totals.availableSpaces += summary.counts.free;
    if (summary.spaceCount > 0 && summary.uncheckedCount === 0 && summary.counts.free === summary.spaceCount) {
      totals.freePlots += 1;
    }
  }
  return totals;
}

/**
 * Every claim on a space whose span shares a day with `span`. This is the dry
 * run over the whole timeline: it includes claims that start later.
 */
export function overlappingClaims(state: CoreState, spaceId: Uuid, span: Interval, ignoreClaimId?: Uuid): Claim[] {
  return Object.values(state.claims)
    .filter(
      (c) =>
        c.spaceId === spaceId &&
        c.claimId !== ignoreClaimId &&
        c.voided !== true &&
        intervalsOverlap(claimInterval(c), span),
    )
    .sort((a, b) => {
      const sa = a.start ?? "";
      const sb = b.start ?? "";
      if (sa !== sb) return sa < sb ? -1 : 1;
      return a.claimId < b.claimId ? -1 : a.claimId > b.claimId ? 1 : 0;
    });
}
