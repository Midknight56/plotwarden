// T16 (codes) and R3: plot codes, prior codes, spaces, retire and archive.
import { describe, expect, it } from "vitest";
import {
  canArchive,
  codeUniqueKey,
  findCodeOwner,
  newPlot,
  normalizeCode,
  renamePlot,
  retireSpace,
  validateCode,
  type NewPlot,
} from "../../template/src/plot";
import type { Plot } from "../../template/src/types";
import { mintId } from "../../template/src/site";

const SITE = "5a1e0000-0000-4000-8000-000000000001";
const CHURCH = { min: 1, max: 12 };
const GARDEN = { min: 1, max: 1 };

function spaces(n: number) {
  return Array.from({ length: n }, () => ({ spaceId: mintId() }));
}

function plot(code: string, n = 1, range = CHURCH): Plot {
  const input: NewPlot = { plotId: mintId(), siteId: SITE, code, spaces: spaces(n) };
  const result = newPlot(input, range);
  if (!result.ok) throw new Error(`fixture plot refused: ${JSON.stringify(result.error)}`);
  return result.value;
}

describe("plot codes", () => {
  it("compares the trimmed, case folded form", () => {
    expect(normalizeCode("  Y07 ")).toBe("y07");
    expect(normalizeCode("Y07")).toBe(normalizeCode("y07"));
    expect(normalizeCode("É1")).toBe(normalizeCode("é1"));
    expect(normalizeCode("007")).not.toBe(normalizeCode("7"));
  });

  it("accepts 1 to 24 characters and keeps the text as typed", () => {
    expect(validateCode("Y07")).toEqual({ ok: true, value: "Y07" });
    expect(validateCode("  C001 ")).toEqual({ ok: true, value: "C001" });
    expect(validateCode("007")).toEqual({ ok: true, value: "007" });
    expect(validateCode("a".repeat(24)).ok).toBe(true);
  });

  it("refuses an empty code and a code over 24 characters", () => {
    const empty = validateCode("   ");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.code).toBe("required");
    const long = validateCode("a".repeat(25));
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.error.detail?.item).toBe("plotCodeChars");
  });

  it("builds the unique key from the normalised form", () => {
    expect(codeUniqueKey(" Y07")).toBe("code:y07");
    expect(codeUniqueKey("y07")).toBe(codeUniqueKey("Y07"));
  });
});

describe("new plots and spaces", () => {
  it("keeps leading zeros and gives each space its own ID and label", () => {
    const p = plot("007", 2);
    expect(p.code).toBe("007");
    expect(p.spaces.map((s) => s.label)).toEqual(["1", "2"]);
    expect(new Set(p.spaces.map((s) => s.spaceId)).size).toBe(2);
    expect(p.priorCodes).toEqual([]);
    expect(p.archived).toBe(false);
  });

  it("starts every space unchecked and active", () => {
    const p = plot("Y01", 3);
    for (const s of p.spaces) {
      expect(s.checked).toBe(false);
      expect(s.retired).toBe(false);
    }
  });

  it("accepts 1 to 12 spaces for a churchyard and refuses 0 and 13", () => {
    expect(newPlot({ plotId: mintId(), siteId: SITE, code: "A", spaces: spaces(12) }, CHURCH).ok).toBe(true);
    for (const n of [0, 13]) {
      const result = newPlot({ plotId: mintId(), siteId: SITE, code: "A", spaces: spaces(n) }, CHURCH);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("bad_space_count");
        expect(result.error.detail).toMatchObject({ min: 1, max: 12, count: n });
      }
    }
  });

  it("gives a garden plot exactly one space", () => {
    expect(newPlot({ plotId: mintId(), siteId: SITE, code: "B01", spaces: spaces(1) }, GARDEN).ok).toBe(true);
    expect(newPlot({ plotId: mintId(), siteId: SITE, code: "B01", spaces: spaces(2) }, GARDEN).ok).toBe(false);
  });

  it("refuses a repeated space ID", () => {
    const id = mintId();
    const result = newPlot(
      { plotId: mintId(), siteId: SITE, code: "A", spaces: [{ spaceId: id }, { spaceId: id }] },
      CHURCH,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("duplicate_id");
  });

  it("refuses a bad code", () => {
    const result = newPlot({ plotId: mintId(), siteId: SITE, code: "", spaces: spaces(1) }, CHURCH);
    expect(result.ok).toBe(false);
  });
});

describe("T16 rename keeps identity and reserves the old code", () => {
  it("keeps the plot ID and every space ID, and adds the old code to priorCodes", () => {
    const p = plot("Y07", 2);
    const result = renamePlot(p, "Z01", [p]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.plotId).toBe(p.plotId);
      expect(result.value.spaces.map((s) => s.spaceId)).toEqual(p.spaces.map((s) => s.spaceId));
      expect(result.value.code).toBe("Z01");
      expect(result.value.priorCodes).toEqual(["Y07"]);
    }
  });

  it("does not change the plot it was given", () => {
    const p = plot("Y07");
    renamePlot(p, "Z01", [p]);
    expect(p.code).toBe("Y07");
    expect(p.priorCodes).toEqual([]);
  });

  it("refuses a code that is another plot's current code", () => {
    const a = plot("Y07");
    const b = plot("Y08");
    const result = renamePlot(a, " y08", [a, b]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("code_taken");
      expect(result.error.detail).toMatchObject({ code: "y08", plotId: b.plotId });
    }
  });

  it("refuses a code that is another plot's prior code", () => {
    const a = plot("Y07");
    const b = plot("Y08");
    const renamed = renamePlot(b, "Z08", [a, b]);
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    const result = renamePlot(a, "y08", [a, renamed.value]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("code_taken");
  });

  it("changing only the case keeps one spelling and adds no prior code", () => {
    const p = plot("y07");
    const result = renamePlot(p, "Y07", [p]);
    expect(result.ok && result.value.code).toBe("Y07");
    expect(result.ok && result.value.priorCodes).toEqual([]);
  });

  it("lets a plot take back its own prior code and drops it from the prior list", () => {
    const p = plot("Y07");
    const first = renamePlot(p, "Z01", [p]);
    if (!first.ok) throw new Error("setup");
    const back = renamePlot(first.value, "Y07", [first.value]);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(back.value.code).toBe("Y07");
      expect(back.value.priorCodes).toEqual(["Z01"]);
    }
  });

  it("refuses a bad new code", () => {
    const p = plot("Y07");
    expect(renamePlot(p, "", [p]).ok).toBe(false);
    expect(renamePlot(p, "a".repeat(25), [p]).ok).toBe(false);
  });

  it("finds an owner by current or prior code, in the same normal form", () => {
    const a = plot("Y07");
    const renamed = renamePlot(a, "Z01", [a]);
    if (!renamed.ok) throw new Error("setup");
    const plots = [renamed.value];
    expect(findCodeOwner(plots, " z01")).toEqual({ plotId: a.plotId, via: "code" });
    expect(findCodeOwner(plots, "y07")).toEqual({ plotId: a.plotId, via: "priorCode" });
    expect(findCodeOwner(plots, "Q99")).toBeUndefined();
  });
});

describe("retiring a space and archiving a plot", () => {
  it("retires a checked space with no history when another space stays", () => {
    const p = plot("Y07", 2);
    const checked: Plot = { ...p, spaces: p.spaces.map((s) => ({ ...s, checked: true })) };
    const result = retireSpace(checked, checked.spaces[1]!.spaceId, false);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.spaces[1]!.retired).toBe(true);
      expect(result.value.spaces[0]!.retired).toBe(false);
      expect(result.value.spaces[1]!.spaceId).toBe(checked.spaces[1]!.spaceId);
    }
  });

  it("refuses a space with history", () => {
    const p = plot("Y07", 2);
    const checked: Plot = { ...p, spaces: p.spaces.map((s) => ({ ...s, checked: true })) };
    const result = retireSpace(checked, checked.spaces[1]!.spaceId, true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("space_has_history");
  });

  it("refuses an unchecked space", () => {
    const p = plot("Y07", 2);
    const result = retireSpace(p, p.spaces[1]!.spaceId, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("space_unchecked");
  });

  it("refuses to retire the last active space", () => {
    const p = plot("Y07", 1);
    const checked: Plot = { ...p, spaces: p.spaces.map((s) => ({ ...s, checked: true })) };
    const result = retireSpace(checked, checked.spaces[0]!.spaceId, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("last_space");
  });

  it("refuses an unknown space", () => {
    const p = plot("Y07", 2);
    const result = retireSpace(p, mintId(), false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("no_such_space");
  });

  it("refuses to archive a plot with an open commitment", () => {
    const result = canArchive(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("open_commitment");
    expect(canArchive(0).ok).toBe(true);
  });
});
