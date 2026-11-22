// T01 and T34 for the paper register: the same suite as the market adapter, with its import checks.
// The suite is not changed for the paper register. It is given a sheet and some rows.
import { describe, expect, it } from "vitest";
import { BURIALS, burialsImporter, paperAdapter } from "../helpers/paperKind";
import type { PaperCommand, PaperEvent, PaperState } from "../helpers/paperKind";
import { conformanceChecks, runConformance, type ConformanceCase } from "./suite";

const ON = "2026-04-20";
const SECTION = "section-paper";

const plot = (n: number) => ({
  plotId: `plot-C00${n}`,
  code: `C00${n}`,
  sectionId: SECTION,
  spaces: [{ spaceId: `space-C00${n}` }],
  footprint: [
    [100 + 50 * n, 100],
    [140 + 50 * n, 100],
    [140 + 50 * n, 130],
    [100 + 50 * n, 130],
  ] as [number, number][],
});

function paperCase(): ConformanceCase<PaperState, PaperCommand, PaperEvent> {
  return {
    name: "paper book",
    adapter: paperAdapter,
    script: [
      { command: { type: "layout_apply", sections: [{ sectionId: SECTION, name: "Paper" }], plots: [plot(1), plot(2), plot(3)] }, on: ON },
      { command: { type: "confirm_empty", spaceIds: ["space-C001"] }, on: ON },
    ],
    refusals: [
      { command: { type: "layout_apply", plots: [{ ...plot(4), code: "c001" }] }, code: "code_taken" },
      { command: { type: "make_tea" } as unknown as PaperCommand, code: "unknown_command" },
      {
        command: { type: "record_burial", burialId: "b-blank", sourceRef: "R9", name: " ", dateText: "", page: "", normalized: {} },
        code: "invalid_input",
      },
    ],
    canaries: ["Alder Ashgrove", "Brindle Ashgrove"],
    asOf: ON,
    parseVisitor: (value) => ({ ok: value === null }),
    otherKind: "allotment",
    entry: {
      sheet: paperAdapter.sheets.find((s) => s.name === BURIALS) as NonNullable<(typeof paperAdapter.sheets)[number]>,
      importer: burialsImporter,
      rows: [
        { sourceRef: "R1", name: "Alder Ashgrove", section: "Paper", plot: "C002", burialDate: "1850", page: "P1" },
        { sourceRef: "R2", name: "Brindle Ashgrove", section: "", plot: "", burialDate: "1851", page: "P1" },
        { sourceRef: "R3", name: "Cove Ashgrove", section: "Paper", plot: "C003", burialDate: "1852", page: "P2" },
      ],
    },
  };
}

describe("the paper register has every check, including the import checks", () => {
  it("lists the checks by name", () => {
    const names = conformanceChecks(paperCase()).map((c) => c.name);
    expect(names).toHaveLength(13);
    expect(names.slice(-4)).toEqual([
      "backs up and restores as a new register that replays to the same state",
      "refuses a backup of another kind or a broken file, and writes nothing",
      "staging an import writes nothing, and the import is one revision",
      "an import repeated adds nothing",
    ]);
  });
});

runConformance(paperCase());
