// The period report data and the lists behind it (spec 03, task 3.7; T21 for the churchyard, C6).
// Expected numbers are from hand-totals.md sections 1 and 4. Burials count by their own date.
import { beforeEach, describe, expect, it } from "vitest";
import { siteTotalsAt } from "../../template/src/status";
import { findEventId, openSpaces, periodReport, plotChoices, unplacedBurials } from "../../apps/churchyard-register/src/history";
import { ChurchEnv, id, layoutYewWalk, plotId, spaceId } from "../helpers/churchEnv";
import { buildFold } from "../helpers/lanternFold";

let env: ChurchEnv;

const refs = (list: { sourceRef: string }[]): string[] => list.map((b) => b.sourceRef).sort();
const report = (from: string, through: string, asOf = "2026-04-20") => periodReport(env.state, { from, through, asOf, revision: env.revision });

beforeEach(async () => {
  env = await ChurchEnv.create();
  await buildFold(env);
});

describe("the fold at the review date (hand totals section 1)", () => {
  it("has 12 plots: free 3, reserved 2, taken 6, unusable 1, and 13 spaces", () => {
    const totals = siteTotalsAt(env.state.core, "2026-04-20");
    expect(totals.plots.byPrimary).toEqual({ free: 3, reserved: 2, taken: 6, unusable: 1 });
    expect(totals.spaces.total).toBe(13);
    expect(totals.spaces.byState).toEqual({ free: 3, reserved: 2, taken: 7, unusable: 1 });
    expect(totals.availableSpaces).toBe(3);
    expect(totals.freePlots).toBe(3);
  });
});

describe("period A, 1880-01-01 through 1950-12-31 (hand totals 4.2)", () => {
  it("counts 4 inside, 1 date incomplete and 3 outside, and no reservation", () => {
    const r = report("1880-01-01", "1950-12-31");
    expect(refs(r.burials.inside)).toEqual(["LF-04", "LF-06", "LF-07A", "LF-07B"]);
    expect(refs(r.burials.incomplete)).toEqual(["LF-05"]);
    expect(r.burials.outside).toBe(3);
    expect(r.reservationsMade).toHaveLength(0);
    expect(r.reservationsReleased).toHaveLength(0);
    expect(r.empty).toBe(false);
  });
});

describe("period B, 1938-06-01 through 1955-06-30 (hand totals 4.3)", () => {
  it("counts 1 inside, 2 date incomplete (unknown, and a year that straddles the end) and 5 outside", () => {
    const r = report("1938-06-01", "1955-06-30");
    expect(refs(r.burials.inside)).toEqual(["LF-06"]);
    expect(refs(r.burials.incomplete)).toEqual(["LF-05", "LF-09"]);
    expect(r.burials.outside).toBe(5);
  });
});

describe("reservations by the day they were made or released (hand totals 4.4)", () => {
  it("counts the two made between 2025-09-01 and 2026-02-28, and one made in 2026", () => {
    const both = report("2025-09-01", "2026-02-28");
    expect(both.reservationsMade.map((r) => r.sourceRef).sort()).toEqual(["LF-R1", "LF-R2"]);
    expect(both.months["2025-09"]?.made).toBe(1);
    expect(both.months["2026-02"]?.made).toBe(1);
    const later = report("2026-01-01", "2026-12-31");
    expect(later.reservationsMade.map((r) => r.sourceRef)).toEqual(["LF-R2"]);
  });

  it("shows no burial inside 2025-01-01 to 2025-08-31, one incomplete and seven outside", () => {
    const r = report("2025-01-01", "2025-08-31");
    expect(r.burials.inside).toHaveLength(0);
    expect(refs(r.burials.incomplete)).toEqual(["LF-05"]);
    expect(r.burials.outside).toBe(7);
    expect(r.reservationsMade).toHaveLength(0);
    expect(r.empty).toBe(false);
  });

  it("counts a release on its own day, and the plot states then are free 4, reserved 1, taken 6, unusable 1", async () => {
    await env.must([{ type: "release_reservation", reservationId: id("reservation:LF-R1"), reason: "No longer needed" }], "2026-03-01");
    const r = report("2026-03-01", "2026-03-31");
    expect(r.reservationsReleased.map((x) => x.sourceRef)).toEqual(["LF-R1"]);
    expect(r.reservationsMade).toHaveLength(0);
    expect(r.months["2026-03"]?.released).toBe(1);
    expect(siteTotalsAt(env.state.core, "2026-04-20").plots.byPrimary).toEqual({ free: 4, reserved: 1, taken: 6, unusable: 1 });
    // The count follows the event date, not today's state: the reservation still counts as made in 2025.
    expect(report("2025-09-01", "2025-09-30").reservationsMade).toHaveLength(1);
  });
});

describe("corrections rebuild the totals and stay visible (C6.1)", () => {
  it("moves a burial into a period when its date is corrected, and keeps the correction on the burial", async () => {
    expect(refs(report("1880-01-01", "1950-12-31").burials.inside)).not.toContain("LF-01");
    const original = await env.eventIdOf("burial_recorded", id("burial:LF-01"));
    await env.must([{ type: "correct_burial", burialId: id("burial:LF-01"), date: { p: "year", y: 1881 }, dateText: "1881", correctsEventId: original, reason: "Misread 1871", correctionRef: "LF page 1" }]);
    const r = report("1880-01-01", "1950-12-31");
    expect(refs(r.burials.inside)).toContain("LF-01");
    expect(r.basis).toBe("current_corrections");
    expect(env.state.burials[id("burial:LF-01")]?.correctionRefs).toEqual(["LF page 1"]);
  });

  it("leaves a voided burial out of every count", async () => {
    const original = await env.eventIdOf("burial_recorded", id("burial:LF-04"));
    const claimEvent = await env.eventIdOf("claim_added", id("claim:LF-04"));
    await env.must([{ type: "void_burial", burialId: id("burial:LF-04"), correctsEventId: original, claimEventId: claimEvent, reason: "Entered twice", correctionRef: "p" }]);
    const r = report("1880-01-01", "1950-12-31");
    expect(r.burials.inside).toHaveLength(3);
    expect(r.burials.outside).toBe(3);
    expect(r.burials.inside.length + r.burials.incomplete.length + r.burials.outside).toBe(7);
  });

  it("counts a month that straddles the period edge as date incomplete", () => {
    const r = report("1902-03-15", "1902-12-31");
    expect(refs(r.burials.incomplete)).toEqual(["LF-04", "LF-05"]);
  });

  it("carries the revision and the as at date the report was made for", () => {
    const r = report("1880-01-01", "1950-12-31");
    expect(r).toMatchObject({ revision: env.revision, asOf: "2026-04-20", from: "1880-01-01", through: "1950-12-31" });
  });
});

describe("an empty register (C6.5)", () => {
  it("has no events in any period", async () => {
    const empty = await ChurchEnv.create();
    const r = periodReport(empty.state, { from: "2025-01-01", through: "2025-12-31", asOf: "2026-04-20", revision: 0 });
    expect(r.empty).toBe(true);
    expect(r.burials.inside).toHaveLength(0);
    expect(r.burials.incomplete).toHaveLength(0);
  });
});

describe("open spaces and the unplaced list (hand totals 4.6 and 4.7)", () => {
  it("lists the three free spaces only, and none for the part occupied plot Y07", () => {
    const open = openSpaces(env.state, "2026-04-20");
    expect(open.map((o) => o.code)).toEqual(["Y03", "Y08", "Y10"]);
    expect(open.every((o) => o.occupied.length === 0)).toBe(true);
  });

  it("lists the unplaced burial apart from the states", () => {
    expect(unplacedBurials(env.state).map((b) => b.sourceRef)).toEqual(["LF-H1"]);
    expect(siteTotalsAt(env.state.core, "2026-04-20").plots.total).toBe(12);
  });

  it("places the unplaced burial in Y03: taken 7, free 2, nothing unplaced", async () => {
    await env.must([{ type: "place_burial", burialId: id("burial:LF-H1"), plotId: plotId("Y03"), spaceId: spaceId("Y03"), claimId: id("claim:LF-H1") }]);
    expect(siteTotalsAt(env.state.core, "2026-04-20").plots.byPrimary).toEqual({ free: 2, reserved: 2, taken: 7, unusable: 1 });
    expect(unplacedBurials(env.state)).toHaveLength(0);
    expect(openSpaces(env.state, "2026-04-20").map((o) => o.code)).toEqual(["Y08", "Y10"]);
  });

  it("describes a free space in a part occupied plot: Z01 space 2 is free and space 1 holds a burial", async () => {
    const fresh = await ChurchEnv.create();
    await layoutYewWalk(fresh, { extra: [{ code: "Z01", spaces: 2 }] });
    await fresh.must([{ type: "confirm_empty", spaceIds: [spaceId("Z01", 2)] }]);
    await fresh.must([
      { type: "record_burial", burialId: id("burial:Z"), sourceRef: "Z-1", recordedName: "Ann Hartley", date: { p: "year", y: 1900 }, dateText: "1900", plotId: plotId("Z01"), spaceId: spaceId("Z01", 1), claimId: id("claim:Z") },
    ]);
    const open = openSpaces(fresh.state, "2026-04-20");
    expect(open).toEqual([{ plotId: plotId("Z01"), code: "Z01", spaceLabel: "2", occupied: ["1"] }]);
    const totals = siteTotalsAt(fresh.state.core, "2026-04-20");
    expect(totals.availableSpaces).toBe(1);
    expect(totals.freePlots).toBe(0);
  });
});

describe("lists the screens use", () => {
  it("finds the stored event that recorded a burial and the one that added its claim", async () => {
    const events = await env.events();
    const recorded = findEventId(events, "burial_recorded", id("burial:LF-01"));
    const claim = findEventId(events, "claim_added", id("claim:LF-01"));
    expect(recorded).toBe(await env.eventIdOf("burial_recorded", id("burial:LF-01")));
    expect(claim).toBe(await env.eventIdOf("claim_added", id("claim:LF-01")));
    expect(findEventId(events, "burial_recorded", id("burial:none"))).toBeUndefined();
  });

  it("offers every plot in code order with its spaces and what each holds, for the choosers", () => {
    const plots = plotChoices(env.state, "2026-04-20");
    expect(plots.map((p) => p.code)).toEqual(["Y01", "Y02", "Y03", "Y04", "Y05", "Y06", "Y07", "Y08", "Y09", "Y10", "Y11", "Y12"]);
    const y07 = plots.find((p) => p.code === "Y07");
    expect(y07?.sectionName).toBe("Yew Walk");
    expect(y07?.spaces.map((s) => [s.label, s.state])).toEqual([["1", "taken"], ["2", "taken"]]);
    expect(plots.find((p) => p.code === "Y03")?.spaces[0]).toMatchObject({ state: "free", checked: true });
    expect(plots.find((p) => p.code === "Y02")?.spaces[0]?.state).toBe("reserved");
  });

  it("names the burials and the reservation of a plot", () => {
    const y07 = plotChoices(env.state, "2026-04-20").find((p) => p.code === "Y07");
    expect(y07?.burials.map((b) => b.sourceRef).sort()).toEqual(["LF-07A", "LF-07B"]);
    const y02 = plotChoices(env.state, "2026-04-20").find((p) => p.code === "Y02");
    expect(y02?.reservations.map((r) => r.sourceRef)).toEqual(["LF-R1"]);
  });
});
