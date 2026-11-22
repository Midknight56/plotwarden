// Plots, spaces and codes. Pure.
import { checkText } from "./limits";
import { err, ok } from "./types";
import type { Plot, Result, Space, Uuid } from "./types";

export interface NewPlot {
  plotId: Uuid;
  siteId: Uuid;
  sectionId?: Uuid;
  code: string;
  spaces: { spaceId: Uuid; label?: string }[];
}

/** The form compared for uniqueness: trimmed, composed, case folded. */
export function normalizeCode(code: string): string {
  return code.trim().normalize("NFC").toLowerCase();
}

/** The key that reserves a code in a site. Prior codes use the same key. */
export function codeUniqueKey(code: string): string {
  return `code:${normalizeCode(code)}`;
}

/** Accept 1 to 24 characters after trimming. Return the code as typed, trimmed. */
export function validateCode(code: string): Result<string> {
  const trimmed = code.trim();
  if (trimmed === "") return err("required", { field: "code" });
  const length = checkText("plotCodeChars", trimmed);
  if (!length.ok) return length;
  return ok(trimmed);
}

/** Make a plot with unchecked spaces. The range comes from the adapter. */
export function newPlot(input: NewPlot, range: { min: number; max: number }): Result<Plot> {
  const code = validateCode(input.code);
  if (!code.ok) return code;

  const count = input.spaces.length;
  if (count < range.min || count > range.max) {
    return err("bad_space_count", { min: range.min, max: range.max, count });
  }
  const seen = new Set<Uuid>();
  const spaces: Space[] = [];
  for (const [index, entry] of input.spaces.entries()) {
    if (seen.has(entry.spaceId)) return err("duplicate_id", { id: entry.spaceId });
    seen.add(entry.spaceId);
    const label = entry.label ?? String(index + 1);
    const labelCheck = checkText("nameChars", label);
    if (!labelCheck.ok) return labelCheck;
    spaces.push({ spaceId: entry.spaceId, label, checked: false, retired: false });
  }

  const plot: Plot = {
    plotId: input.plotId,
    siteId: input.siteId,
    code: code.value,
    priorCodes: [],
    spaces,
    archived: false,
  };
  if (input.sectionId !== undefined) plot.sectionId = input.sectionId;
  return ok(plot);
}

/** Find the plot that holds a code now or held it before. */
export function findCodeOwner(
  plots: Iterable<Plot>,
  code: string,
): { plotId: Uuid; via: "code" | "priorCode" } | undefined {
  const wanted = normalizeCode(code);
  let prior: { plotId: Uuid; via: "priorCode" } | undefined;
  for (const plot of plots) {
    if (normalizeCode(plot.code) === wanted) return { plotId: plot.plotId, via: "code" };
    if (prior === undefined && plot.priorCodes.some((p) => normalizeCode(p) === wanted)) {
      prior = { plotId: plot.plotId, via: "priorCode" };
    }
  }
  return prior;
}

/**
 * Give a plot a new code. The plot ID and space IDs stay. The old code moves
 * to `priorCodes`, where it stays searchable and reserved. A plot may take
 * back one of its own prior codes.
 */
export function renamePlot(plot: Plot, newCode: string, allPlots: Iterable<Plot>): Result<Plot> {
  const code = validateCode(newCode);
  if (!code.ok) return code;

  const wanted = normalizeCode(code.value);
  const others = [...allPlots].filter((p) => p.plotId !== plot.plotId);
  const owner = findCodeOwner(others, code.value);
  if (owner !== undefined) {
    return err("code_taken", { code: code.value, plotId: owner.plotId, via: owner.via });
  }

  const sameForm = normalizeCode(plot.code) === wanted;
  const prior = plot.priorCodes.filter((p) => normalizeCode(p) !== wanted);
  if (!sameForm) prior.push(plot.code);
  return ok({ ...plot, code: code.value, priorCodes: prior });
}

/** Retire an empty, checked space with no history. A plot keeps at least one space. */
export function retireSpace(plot: Plot, spaceId: Uuid, hasHistory: boolean): Result<Plot> {
  const space = plot.spaces.find((s) => s.spaceId === spaceId);
  if (space === undefined) return err("no_such_space", { spaceId });
  if (space.retired) return err("already_retired", { spaceId });
  if (hasHistory) return err("space_has_history", { spaceId });
  if (!space.checked) return err("space_unchecked", { spaceId });
  const others = plot.spaces.filter((s) => s.spaceId !== spaceId && !s.retired);
  if (others.length === 0) return err("last_space", { spaceId });
  return ok({
    ...plot,
    spaces: plot.spaces.map((s) => (s.spaceId === spaceId ? { ...s, retired: true } : s)),
  });
}

/** A plot with an open commitment cannot be archived. */
export function canArchive(openCommitments: number): Result<true> {
  return openCommitments > 0 ? err("open_commitment", { count: openCommitments }) : ok(true);
}
