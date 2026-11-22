// A tiny market stall adapter. It proves the template needs no change for a
// third use. It adds one command and one visitor view, and reuses the core.
// Test helper. The template never imports it.
import type { RegisterAdapter } from "../../template/src/adapter";
import type { LocalDate } from "../../template/src/calendar";
import { CORE_COMMAND_TYPES, decideCore, validateCore, type CoreCommand } from "../../template/src/commands";
import { applyCore, emptyCoreState, type CoreEvent } from "../../template/src/events";
import { plotSummaryAt } from "../../template/src/status";
import type { CoreState, Uuid } from "../../template/src/types";

export type MarketCommand =
  | CoreCommand
  | { type: "reserve_stall"; claimId: Uuid; spaceId: Uuid; trader: string; start: LocalDate };

export const MARKET_KIND = "market";

const CONTEXT = { spacesPerPlot: { min: 1, max: 1 } };

function mintPublicId(): string {
  return globalThis.crypto.randomUUID();
}

export const marketAdapter: RegisterAdapter<CoreState, MarketCommand, CoreEvent> = {
  kind: MARKET_KIND,
  version: 1,
  spacesPerPlot: { min: 1, max: 1 },
  fields: [
    { key: "code", label: "Stall code", type: "text", required: true, maxChars: 24 },
    { key: "trader", label: "Trader", type: "text", maxChars: 100 },
  ],
  sheets: [{ name: "stalls", required: ["code"] }],
  commands: [...CORE_COMMAND_TYPES, "reserve_stall"],
  initialState: (site) => emptyCoreState(site.id),
  validate(command, state) {
    if (command.type !== "reserve_stall") return validateCore(command, state);
    return command.trader.trim() === "" ? [{ field: "trader", code: "required" }] : [];
  },
  decide(state, command, effectiveOn) {
    if (command.type !== "reserve_stall") return decideCore(state, command, effectiveOn, CONTEXT);
    return decideCore(
      state,
      {
        type: "add_claim",
        claimId: command.claimId,
        spaceId: command.spaceId,
        mode: "held",
        start: command.start,
        endable: true,
        ref: command.trader,
      },
      effectiveOn,
      CONTEXT,
    );
  },
  apply: applyCore,
  project(snapshot, audience, asOf) {
    if (audience === "private") return snapshot;
    if (audience === "committee") return null;
    // The visitor file is built field by field from the free stalls only.
    const freePlots = Object.values(snapshot.plots)
      .filter((plot) => {
        const summary = plotSummaryAt(snapshot, plot.plotId, asOf);
        return summary !== undefined && summary.spaceCount > 0 && !summary.needsChecking && summary.counts.free === summary.spaceCount;
      })
      .map((plot) => ({ id: mintPublicId(), code: plot.code, sectionId: "row-a" }));
    return {
      format: "plot.availability.v1",
      asOf,
      siteTitle: "Stall Row",
      north: 0,
      gate: { name: "Main Gate", x: 0, y: 0 },
      paths: [],
      sections: [{ id: "row-a", label: "Row A" }],
      freePlots,
      neutralGround: [],
      instructions: "Ask at the gate.",
    };
  },
  reports: [],
  reviewFacts: () => [],
  labels: {},
  theme: { ink: "#22252C", paper: "#FAF5E9" },
};
