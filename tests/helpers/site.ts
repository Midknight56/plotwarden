// Fixture builders worked from tests/fixtures/expected/hand-totals.md.
// Test helper. The template never imports it.
//
// The events are written by hand, not made by `decideCore`, so the status
// tests do not depend on the command code.
import type { LocalDate } from "../../template/src/calendar";
import { applyCore, emptyCoreState } from "../../template/src/events";
import type { CoreEvent } from "../../template/src/events";
import type { CoreState } from "../../template/src/types";

export const SITE_ID = "51e00000-0000-4000-8000-000000000001";

const registry = new Map<string, string>();

/** A stable fake UUID for a name, so fixtures read well and repeat. */
export function fid(name: string): string {
  let value = registry.get(name);
  if (value === undefined) {
    value = `00000000-0000-4000-8000-${(registry.size + 1).toString(16).padStart(12, "0")}`;
    registry.set(name, value);
  }
  return value;
}

export function fold(events: readonly CoreEvent[], siteId = SITE_ID): CoreState {
  return events.reduce(applyCore, emptyCoreState(siteId));
}

export function plotAdded(code: string, spaceCount = 1): CoreEvent {
  return {
    type: "plot_added",
    plotId: fid(`plot:${code}`),
    code,
    spaces: Array.from({ length: spaceCount }, (_, i) => ({
      spaceId: fid(`space:${code}:${i + 1}`),
      label: String(i + 1),
    })),
  };
}

export function space(code: string, n = 1): string {
  return fid(`space:${code}:${n}`);
}

export function confirmed(...spaceIds: string[]): CoreEvent {
  return { type: "spaces_confirmed_empty", spaceIds };
}

export interface ClaimOpts {
  start?: LocalDate;
  endExclusive?: LocalDate;
  endable?: boolean;
  ref?: string;
  sourceRef?: string;
  reason?: string;
}

export function claimAdded(
  claimId: string,
  spaceId: string,
  mode: "taken" | "held" | "unusable",
  opts: ClaimOpts = {},
): CoreEvent {
  const claim: Extract<CoreEvent, { type: "claim_added" }>["claim"] = {
    claimId,
    spaceId,
    mode,
    endable: opts.endable ?? mode !== "taken",
  };
  if (opts.start !== undefined) claim.start = opts.start;
  if (opts.endExclusive !== undefined) claim.endExclusive = opts.endExclusive;
  if (opts.ref !== undefined) claim.ref = opts.ref;
  if (opts.sourceRef !== undefined) claim.sourceRef = opts.sourceRef;
  if (opts.reason !== undefined) claim.reason = opts.reason;
  return { type: "claim_added", claim };
}

/** A burial: taken and not endable. */
export function burial(claimId: string, spaceId: string, opts: ClaimOpts = {}): CoreEvent {
  return claimAdded(claimId, spaceId, "taken", { endable: false, ...opts });
}

/**
 * Lantern Fold: Yew Walk Y01 to Y12, all spaces checked, Y07 with two spaces.
 * Free Y03, Y08, Y10. Reserved Y02, Y11. Taken Y01, Y04, Y05, Y06, Y07, Y09.
 * Unusable Y12. Y07 holds two burials.
 */
export function lanternFoldEvents(): CoreEvent[] {
  const events: CoreEvent[] = [];
  for (let n = 1; n <= 12; n++) {
    const code = `Y${String(n).padStart(2, "0")}`;
    events.push(plotAdded(code, code === "Y07" ? 2 : 1));
  }
  const free = ["Y03", "Y08", "Y10"];
  const reserved = ["Y02", "Y11"];
  const taken = ["Y01", "Y04", "Y05", "Y06", "Y09"];
  events.push(confirmed(...free.map((c) => space(c)), ...reserved.map((c) => space(c)), space("Y12")));
  for (const code of taken) events.push(burial(`burial:${code}`, space(code), { sourceRef: `book 1 ${code}` }));
  events.push(burial("burial:Y07:1", space("Y07", 1), { sourceRef: "book 1 Y07a" }));
  events.push(burial("burial:Y07:2", space("Y07", 2), { sourceRef: "book 1 Y07b" }));
  for (const code of reserved) {
    events.push(claimAdded(`hold:${code}`, space(code), "held", { start: "2026-03-01", sourceRef: `hold ${code}` }));
  }
  events.push(claimAdded("unusable:Y12", space("Y12"), "unusable", { start: "2026-01-01", reason: "Tree root" }));
  return events;
}

/** The generated paper book: C001 to C200, one space each, all unchecked. */
export function paperBookPlots(): CoreEvent[] {
  return Array.from({ length: 200 }, (_, i) => plotAdded(`C${String(i + 1).padStart(3, "0")}`));
}

/** A burial for reference R00n placed at plot C00n. */
export function paperBurial(n: number): CoreEvent {
  const code = `C${String(n).padStart(3, "0")}`;
  return burial(`burial:R${String(n).padStart(3, "0")}`, space(code), {
    sourceRef: `R${String(n).padStart(3, "0")}`,
  });
}
