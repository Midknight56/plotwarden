// T12: status at a date, evidence and counts.
// Expected totals come from tests/fixtures/expected/hand-totals.md, worked by
// hand before any code existed. They are not copied from program output.
import { describe, expect, it } from "vitest";
import { plotSummaryAt, siteTotalsAt, spaceStateAt } from "../../template/src/status";
import type { CoreEvent } from "../../template/src/events";
import {
  burial,
  claimAdded,
  confirmed,
  fid,
  fold,
  lanternFoldEvents,
  paperBookPlots,
  paperBurial,
  plotAdded,
  space,
} from "../helpers/site";

const AS_AT = "2026-04-20";

function summaryOf(events: CoreEvent[], code: string, date = AS_AT) {
  const summary = plotSummaryAt(fold(events), fid(`plot:${code}`), date);
  if (summary === undefined) throw new Error(`no plot ${code}`);
  return summary;
}

describe("T12 Lantern Fold, hand totals section 1", () => {
  const state = () => fold(lanternFoldEvents());

  it("has 12 plots and 13 spaces", () => {
    const totals = siteTotalsAt(state(), AS_AT);
    expect(totals.plots.total).toBe(12);
    expect(totals.spaces.total).toBe(13);
  });

  it("counts plots by primary mark: free 3, reserved 2, taken 6, unusable 1", () => {
    expect(siteTotalsAt(state(), AS_AT).plots.byPrimary).toEqual({ free: 3, reserved: 2, taken: 6, unusable: 1 });
  });

  it("counts spaces by state: free 3, reserved 2, taken 7, unusable 1", () => {
    expect(siteTotalsAt(state(), AS_AT).spaces.byState).toEqual({ free: 3, reserved: 2, taken: 7, unusable: 1 });
  });

  it("shows 3 available spaces, 3 free plots and no plot needing checking", () => {
    const totals = siteTotalsAt(state(), AS_AT);
    expect(totals.availableSpaces).toBe(3);
    expect(totals.freePlots).toBe(3);
    expect(totals.plots.needsChecking).toBe(0);
    expect(totals.spaces.unchecked).toBe(0);
  });

  it("puts each named plot in its named state", () => {
    const named: Record<string, "free" | "reserved" | "taken" | "unusable"> = {
      Y01: "taken",
      Y02: "reserved",
      Y03: "free",
      Y04: "taken",
      Y05: "taken",
      Y06: "taken",
      Y07: "taken",
      Y08: "free",
      Y09: "taken",
      Y10: "free",
      Y11: "reserved",
      Y12: "unusable",
    };
    for (const [code, expected] of Object.entries(named)) {
      expect(summaryOf(lanternFoldEvents(), code).primary, code).toBe(expected);
    }
  });

  it("shows both Y07 spaces used", () => {
    const y07 = summaryOf(lanternFoldEvents(), "Y07");
    expect(y07.spaceCount).toBe(2);
    expect(y07.counts.taken).toBe(2);
    expect(y07.counts.free).toBe(0);
  });
});

describe("T12 evidence, not assumption", () => {
  it("gives a generated, unchecked space no state at all", () => {
    const state = fold([plotAdded("A1")]);
    expect(spaceStateAt(state, space("A1"), AS_AT)).toEqual({ checked: false, retired: false });
  });

  it("never offers an unchecked plot as free, and flags it", () => {
    const summary = summaryOf([plotAdded("A1")], "A1");
    expect(summary.primary).toBeUndefined();
    expect(summary.needsChecking).toBe(true);
    expect(summary.uncheckedCount).toBe(1);
    const totals = siteTotalsAt(fold([plotAdded("A1")]), AS_AT);
    expect(totals.availableSpaces).toBe(0);
    expect(totals.freePlots).toBe(0);
    expect(totals.plots.needsChecking).toBe(1);
  });

  it("makes a space free only after a positive confirm", () => {
    const events = [plotAdded("A1"), confirmed(space("A1"))];
    expect(spaceStateAt(fold(events), space("A1"), AS_AT)?.state).toBe("free");
    expect(siteTotalsAt(fold(events), AS_AT).freePlots).toBe(1);
  });

  it("a burial checks only its own space", () => {
    const events = [plotAdded("A1"), plotAdded("A2"), burial("b1", space("A1"))];
    expect(spaceStateAt(fold(events), space("A1"), AS_AT)?.state).toBe("taken");
    expect(spaceStateAt(fold(events), space("A2"), AS_AT)).toEqual({ checked: false, retired: false });
  });
});

describe("T12 capacity: one burial uses one space", () => {
  const twoSpaces = [plotAdded("D1", 2), confirmed(space("D1", 1), space("D1", 2)), burial("b1", space("D1", 1))];

  it("leaves the other space of the plot free", () => {
    const summary = summaryOf(twoSpaces, "D1");
    expect(summary.spaceCount).toBe(2);
    expect(summary.counts).toEqual({ free: 1, reserved: 0, taken: 1, unusable: 0 });
    expect(summary.primary).toBe("taken");
  });

  it("counts the free space as available but the plot is not a free plot", () => {
    const totals = siteTotalsAt(fold(twoSpaces), AS_AT);
    expect(totals.availableSpaces).toBe(1);
    expect(totals.freePlots).toBe(0);
  });

  it("counts a plot of two checked free spaces as one free plot and two available spaces", () => {
    const events = [plotAdded("D2", 2), confirmed(space("D2", 1), space("D2", 2))];
    const totals = siteTotalsAt(fold(events), AS_AT);
    expect(totals.freePlots).toBe(1);
    expect(totals.availableSpaces).toBe(2);
  });

  it("flags a plot with one unchecked space and never counts it as a free plot", () => {
    const events = [plotAdded("D3", 2), confirmed(space("D3", 1))];
    const summary = summaryOf(events, "D3");
    expect(summary.needsChecking).toBe(true);
    expect(summary.primary).toBe("free");
    const totals = siteTotalsAt(fold(events), AS_AT);
    expect(totals.freePlots).toBe(0);
    expect(totals.availableSpaces).toBe(1);
  });

  it("marks the plot by Taken, then Reserved, then Free, then Unusable", () => {
    const events = [
      plotAdded("M1", 4),
      confirmed(space("M1", 1), space("M1", 2), space("M1", 3), space("M1", 4)),
      claimAdded("u", space("M1", 4), "unusable", { start: "2026-01-01" }),
    ];
    expect(summaryOf(events, "M1").primary).toBe("free");
    const withHold = [...events, claimAdded("h", space("M1", 2), "held", { start: "2026-01-01" })];
    expect(summaryOf(withHold, "M1").primary).toBe("reserved");
    const withBurial = [...withHold, burial("b", space("M1", 1))];
    expect(summaryOf(withBurial, "M1").primary).toBe("taken");
    const onlyUnusable = [plotAdded("M2"), confirmed(space("M2")), claimAdded("u2", space("M2"), "unusable")];
    expect(summaryOf(onlyUnusable, "M2").primary).toBe("unusable");
  });

  it("leaves a retired space out of the counts", () => {
    const events: CoreEvent[] = [
      plotAdded("R1", 2),
      confirmed(space("R1", 1), space("R1", 2)),
      { type: "space_retired", plotId: fid("plot:R1"), spaceId: space("R1", 2) },
    ];
    const summary = summaryOf(events, "R1");
    expect(summary.spaceCount).toBe(1);
    expect(summary.counts.free).toBe(1);
    expect(siteTotalsAt(fold(events), AS_AT).spaces.total).toBe(1);
  });
});

describe("T12 state follows the date", () => {
  const events = [
    plotAdded("A1"),
    confirmed(space("A1")),
    claimAdded("hold", space("A1"), "held", { start: "2026-03-01", endExclusive: "2026-03-10" }),
    claimAdded("t", space("A1"), "taken", { start: "2026-03-10", endExclusive: "2026-05-01", endable: true }),
  ];

  it("reads Free, Reserved, Taken and Free again", () => {
    const state = fold(events);
    const at = (date: string) => spaceStateAt(state, space("A1"), date)?.state;
    expect(at("2026-02-28")).toBe("free");
    expect(at("2026-03-01")).toBe("reserved");
    expect(at("2026-03-09")).toBe("reserved");
    expect(at("2026-03-10")).toBe("taken");
    expect(at("2026-04-30")).toBe("taken");
    expect(at("2026-05-01")).toBe("free");
  });

  it("a burial with no start date covers every date, so nothing is inferred free", () => {
    const state = fold([plotAdded("A1"), burial("b", space("A1"))]);
    expect(spaceStateAt(state, space("A1"), "1500-01-01")?.state).toBe("taken");
    expect(spaceStateAt(state, space("A1"), "2999-01-01")?.state).toBe("taken");
  });

  it("a voided claim covers nothing and the space stays checked", () => {
    const state = fold([
      plotAdded("A1"),
      burial("b", space("A1")),
      { type: "claim_voided", claimId: "b", reason: "Wrong plot" },
    ]);
    expect(spaceStateAt(state, space("A1"), AS_AT)).toEqual({ checked: true, retired: false, state: "free" });
  });

  it("returns nothing for a space that does not exist", () => {
    expect(spaceStateAt(fold([]), fid("no-such-space"), AS_AT)).toBeUndefined();
  });
});

describe("T12 Thimble Beds, hand totals section 2", () => {
  const b = (n: number) => `B0${n}`;
  const base: CoreEvent[] = [
    ...[1, 2, 3, 4, 5, 6].map((n) => plotAdded(b(n))),
    confirmed(space(b(3)), space(b(5)), space(b(6))),
    burial("t:B01", space(b(1)), { endable: true, start: "2024-04-01" }),
    burial("t:B02", space(b(2)), { endable: true, start: "2025-04-01" }),
    burial("t:B04", space(b(4)), { endable: true, start: "2025-04-01" }),
    claimAdded("u:B06", space(b(6)), "unusable", { start: "2025-01-01" }),
  ];

  it("starts with taken 3, free 2, unusable 1", () => {
    const totals = siteTotalsAt(fold(base), "2026-04-01");
    expect(totals.plots.byPrimary).toEqual({ free: 2, reserved: 0, taken: 3, unusable: 1 });
  });

  it("holds B03 after the offer: free plots 1", () => {
    const offered = [...base, claimAdded("offer:B03", space(b(3)), "held", { start: "2026-04-04" })];
    const totals = siteTotalsAt(fold(offered), "2026-04-05");
    expect(totals.freePlots).toBe(1);
    expect(totals.plots.byPrimary).toEqual({ free: 1, reserved: 1, taken: 3, unusable: 1 });
  });

  it("after accept: taken 4, free 1, unusable 1", () => {
    const accepted: CoreEvent[] = [
      ...base,
      claimAdded("offer:B03", space(b(3)), "held", { start: "2026-04-04", endExclusive: "2026-04-10" }),
      burial("t:B03", space(b(3)), { endable: true, start: "2026-04-10" }),
    ];
    const totals = siteTotalsAt(fold(accepted), "2026-04-20");
    expect(totals.plots.byPrimary).toEqual({ free: 1, reserved: 0, taken: 4, unusable: 1 });
  });

  it("handover on 2026-05-01 leaves B02 taken on both sides of the day", () => {
    const handedOver: CoreEvent[] = [
      ...base.filter((e) => !(e.type === "claim_added" && e.claim.claimId === "t:B02")),
      burial("t:B02:old", space(b(2)), { endable: true, start: "2025-04-01", endExclusive: "2026-05-01" }),
      burial("t:B02:new", space(b(2)), { endable: true, start: "2026-05-01" }),
    ];
    const state = fold(handedOver);
    expect(spaceStateAt(state, space(b(2)), "2026-04-30")?.state).toBe("taken");
    expect(spaceStateAt(state, space(b(2)), "2026-05-01")?.state).toBe("taken");
  });

  it("ending a tenancy with no successor leaves B02 free from that day", () => {
    const ended: CoreEvent[] = [
      ...base.filter((e) => !(e.type === "claim_added" && e.claim.claimId === "t:B02")),
      burial("t:B02", space(b(2)), { endable: true, start: "2025-04-01", endExclusive: "2026-05-01" }),
    ];
    const state = fold(ended);
    expect(spaceStateAt(state, space(b(2)), "2026-04-30")?.state).toBe("taken");
    expect(spaceStateAt(state, space(b(2)), "2026-05-01")?.state).toBe("free");
  });
});

describe("T12 paper book, hand totals section 3", () => {
  const placed198 = () => [...paperBookPlots(), ...Array.from({ length: 198 }, (_, i) => paperBurial(i + 1))];

  it("has 200 plots and 200 spaces", () => {
    const totals = siteTotalsAt(fold(paperBookPlots()), AS_AT);
    expect(totals.plots.total).toBe(200);
    expect(totals.spaces.total).toBe(200);
  });

  it("after the corrected import: taken 198, unchecked 2, free plots 0", () => {
    const totals = siteTotalsAt(fold(placed198()), AS_AT);
    expect(totals.plots.byPrimary.taken).toBe(198);
    expect(totals.plots.needsChecking).toBe(2);
    expect(totals.freePlots).toBe(0);
    expect(totals.availableSpaces).toBe(0);
  });

  it("placing R199 on C199: taken 199, unchecked 1", () => {
    const totals = siteTotalsAt(fold([...placed198(), paperBurial(199)]), AS_AT);
    expect(totals.plots.byPrimary.taken).toBe(199);
    expect(totals.plots.needsChecking).toBe(1);
  });
});

describe("T12 totals can be limited to some plots", () => {
  it("counts only the plots the filter keeps", () => {
    const state = fold(lanternFoldEvents());
    const onlyTaken = siteTotalsAt(state, AS_AT, (plot) => plot.code === "Y07" || plot.code === "Y03");
    expect(onlyTaken.plots.total).toBe(2);
    expect(onlyTaken.freePlots).toBe(1);
  });
});
