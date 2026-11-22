// T01 and T07 for the churchyard register: the same suite as the market and paper adapters, unchanged,
// with its import checks. The suite is not edited for this adapter. It is given a script, refusals,
// canaries and a sheet. The visitor projection must be closed (or absent) and free of every canary.
import { describe, expect, it } from "vitest";
import { parseFamily } from "../../template/src/output/privacy";
import { burialsImporter, churchAdapter } from "../../apps/churchyard-register/src/adapter";
import { BURIALS_SHEET } from "../../apps/churchyard-register/src/fields";
import type { ChurchCommand, ChurchEvent, ChurchState } from "../../apps/churchyard-register/src/types";
import { conformanceChecks, runConformance, type ConformanceCase } from "./suite";

const ON = "2026-04-20";
const SECTION = "section-yew";

const plot = (n: number, spaces = 1) => ({
  plotId: `plot-Y0${n}`,
  code: `Y0${n}`,
  sectionId: SECTION,
  spaces: Array.from({ length: spaces }, (_, i) => ({ spaceId: `space-Y0${n}-${i + 1}` })),
  footprint: [
    [100 + 50 * n, 100],
    [140 + 50 * n, 100],
    [140 + 50 * n, 130],
    [100 + 50 * n, 130],
  ] as [number, number][],
});

function churchCase(): ConformanceCase<ChurchState, ChurchCommand, ChurchEvent> {
  return {
    name: "churchyard",
    adapter: churchAdapter,
    script: [
      { command: { type: "layout_apply", sections: [{ sectionId: SECTION, name: "Yew Walk" }], plots: [plot(1), plot(2, 2), plot(3), plot(4)] }, on: ON },
      { command: { type: "confirm_empty", spaceIds: ["space-Y01-1", "space-Y04-1"] }, on: ON },
      {
        command: {
          type: "record_burial",
          burialId: "burial-a",
          sourceRef: "LF-01",
          recordedName: "Torin Pellwick",
          date: { p: "year", y: 1921 },
          dateText: "1921",
          plotId: "plot-Y02",
          spaceId: "space-Y02-1",
          claimId: "claim-a",
        },
        on: ON,
      },
      {
        command: {
          type: "record_reservation",
          reservationId: "reservation-a",
          holderId: "holder-a",
          holderName: "Wren Ashgrove",
          contact: "wren.ashgrove@example.invalid",
          spaceId: "space-Y04-1",
          claimId: "claim-r",
          start: "2026-02-14",
          sourceRef: "LF-R2",
        },
        on: ON,
      },
    ],
    refusals: [
      { command: { type: "layout_apply", plots: [{ ...plot(5), code: "y01" }] }, code: "code_taken" },
      { command: { type: "make_tea" } as unknown as ChurchCommand, code: "unknown_command" },
      { command: { type: "record_burial", burialId: "b-blank", sourceRef: "LF-90", date: { p: "unknown" }, dateText: "" }, code: "invalid_input" },
      {
        command: {
          type: "record_burial",
          burialId: "b-dup",
          sourceRef: "LF-91",
          recordedName: "Someone Else",
          date: { p: "unknown" },
          dateText: "",
          plotId: "plot-Y02",
          spaceId: "space-Y02-1",
          claimId: "claim-dup",
        },
        code: "space_taken",
      },
    ],
    canaries: ["Torin Pellwick", "Wren Ashgrove", "wren.ashgrove@example.invalid"],
    asOf: ON,
    parseVisitor: (value) => ({ ok: value === null || parseFamily(value).ok }),
    otherKind: "allotment",
    entry: {
      sheet: BURIALS_SHEET,
      importer: burialsImporter,
      rows: [
        { sourceRef: "R1", recordedName: "Alder Ashgrove", section: "Yew Walk", plot: "Y01", burialDate: "1850" },
        { sourceRef: "R2", recordedName: "Brindle Ashgrove", section: "", plot: "", burialDate: "1851" },
        { sourceRef: "R3", recordedName: "Cove Ashgrove", section: "Yew Walk", plot: "Y02", space: "2", burialDate: "1852" },
      ],
    },
  };
}

describe("the churchyard register has every check, including the import checks", () => {
  it("lists the checks by name", () => {
    const names = conformanceChecks(churchCase()).map((c) => c.name);
    expect(names).toHaveLength(13);
    expect(names.slice(-2)).toEqual(["staging an import writes nothing, and the import is one revision", "an import repeated adds nothing"]);
  });
});

runConformance(churchCase());
