// T34 (the unchanged conformance part, spec 06 task 6.9): the third use. The market stall register in
// `examples/market` runs the same conformance suite as the two apps, with its import checks, and the suite
// is not changed for it. No file under template/ names it.
import { describe, expect, it } from "vitest";
import { marketAdapter, stallsImporter } from "../../examples/market/src/adapter";
import { STALLS_SHEET_DEF } from "../../examples/market/src/fields";
import type { MarketCommand, MarketEvent, MarketState } from "../../examples/market/src/types";
import { parseAvailability } from "../../template/src/output/privacy";
import { conformanceChecks, runConformance, type ConformanceCase } from "./suite";

const ON = "2026-04-20";
const SECTION = "section-row-a";
const plot = (code: string) => ({ plotId: `plot-${code}`, code, sectionId: SECTION, spaces: [{ spaceId: `space-${code}` }] });
const TRADER = "Rosa Pennywhistle";
const OTHER_TRADER = "Pim Cartwhistle";

function marketCase(): ConformanceCase<MarketState, MarketCommand, MarketEvent> {
  return {
    name: "market stalls",
    adapter: marketAdapter,
    script: [
      { command: { type: "layout_apply", sections: [{ sectionId: SECTION, name: "Row A" }], plots: [plot("S1"), plot("S2"), plot("S3"), plot("S4")] }, on: ON },
      { command: { type: "confirm_empty", spaceIds: ["space-S1", "space-S2", "space-S3", "space-S4"] }, on: ON },
      { command: { type: "set_frontage", plotId: "plot-S1", frontageCm: 200 }, on: ON },
      { command: { type: "set_frontage", plotId: "plot-S2", frontageCm: 250 }, on: ON },
      { command: { type: "reserve_stall", reservationId: "res-1", claimId: "claim-1", plotId: "plot-S2", trader: TRADER, neededCm: 240, start: "2026-04-01" }, on: ON },
    ],
    refusals: [
      { command: { type: "reserve_stall", reservationId: "res-2", claimId: "claim-2", plotId: "plot-S1", trader: OTHER_TRADER, neededCm: 240, start: ON }, code: "stall_too_narrow" },
      { command: { type: "reserve_stall", reservationId: "res-3", claimId: "claim-3", plotId: "plot-S3", trader: OTHER_TRADER, neededCm: 100, start: ON }, code: "frontage_unknown" },
      { command: { type: "reserve_stall", reservationId: "res-4", claimId: "claim-4", plotId: "plot-S2", trader: OTHER_TRADER, neededCm: 100, start: ON }, code: "claim_overlap" },
      { command: { type: "reserve_stall", reservationId: "res-5", claimId: "claim-5", plotId: "plot-S1", trader: " ", neededCm: 100, start: ON }, code: "invalid_input" },
      { command: { type: "layout_apply", plots: [{ ...plot("s1"), plotId: "plot-dup" }] }, code: "code_taken" },
      { command: { type: "make_tea" } as unknown as MarketCommand, code: "unknown_command" },
    ],
    canaries: [TRADER, OTHER_TRADER],
    asOf: ON,
    parseVisitor: parseAvailability,
    otherKind: "allotment",
    entry: {
      sheet: STALLS_SHEET_DEF,
      importer: stallsImporter,
      rows: [
        { stallCode: "S3", frontage: "300" },
        { stallCode: "S4", frontage: "180" },
      ],
    },
  };
}

describe("the market register has every check of the suite, including the import checks", () => {
  it("lists the checks by name, the same 13 as the paper register", () => {
    const names = conformanceChecks(marketCase()).map((c) => c.name);
    expect(names).toHaveLength(13);
    expect(names.slice(-4)).toEqual([
      "backs up and restores as a new register that replays to the same state",
      "refuses a backup of another kind or a broken file, and writes nothing",
      "staging an import writes nothing, and the import is one revision",
      "an import repeated adds nothing",
    ]);
  });
});

runConformance(marketCase());
