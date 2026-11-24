// T19 (tenancy). Requirements A3, R10, R13.4, R13.5, R8.1, R31.10. The expected values come from
// hand-totals.md sections 2.5 and 5.1. Spans are half open: a tenancy ends at the start of its end date.
import { beforeEach, describe, expect, it } from "vitest";
import { siteTotalsAt, spaceStateAt } from "../../template/src/status";
import { ALLOT_COPY } from "../../apps/allotment-register/src/copy";
import { tenanciesCovering, tenancyGroups } from "../../apps/allotment-register/src/rules";
import type { AllotCommand } from "../../apps/allotment-register/src/types";
import { GardenEnv, id, plotId, spaceId } from "../helpers/gardenEnv";
import { buildTenanted, claim, person, tenancy } from "../helpers/thimbleBeds";

let env: GardenEnv;
beforeEach(async () => {
  env = await GardenEnv.create();
  await buildTenanted(env);
});

const stateOn = (code: string, date: string) => spaceStateAt(env.state.core, spaceId(code), date)?.state;
const holdersOn = (code: string, date: string) => tenanciesCovering(env.state, plotId(code), date).map((t) => env.state.people[t.personId]?.displayName);

const record = (code: string, name: string, start: string, extra: Partial<Extract<AllotCommand, { type: "record_tenancy" }>> = {}): AllotCommand => ({
  type: "record_tenancy",
  tenancyId: id(`tenancy:${code}:${name}:${start}`),
  claimId: id(`claim:${code}:${name}:${start}`),
  personId: person(name),
  holderName: name,
  spaceId: spaceId(code),
  start,
  ...extra,
});

describe("recording a tenancy by hand (A3.1)", () => {
  it("has the three holders of hand totals 5.1, each with a source ref and a start", () => {
    expect(Object.values(env.state.tenancies).map((t) => [env.state.core.plots[t.plotId]?.code, env.state.people[t.personId]?.displayName, t.start, t.sourceRef])).toEqual([
      ["B01", "Marlo Fennick", "2024-04-01", "TB-T1"],
      ["B02", "Ada Stonecrop", "2025-04-01", "TB-T2"],
      ["B04", "Ilse Burrowby", "2023-04-01", "TB-T4"],
    ]);
    expect(siteTotalsAt(env.state.core, "2026-04-20").plots.byPrimary).toEqual({ free: 2, reserved: 0, taken: 3, unusable: 1 });
  });

  it("marks only its own plot checked, and is Free before it begins", async () => {
    expect(env.state.core.plots[plotId("B05")]?.spaces[0]?.checked).toBe(true);
    await env.must([record("B05", "Wick Dunmore", "2026-06-01", { sourceRef: "TB-T9" })]);
    expect(stateOn("B05", "2026-05-31")).toBe("free");
    expect(stateOn("B05", "2026-06-01")).toBe("taken");
  });

  it("keeps a tenancy open until it is ended, and a closed one to the day before its end date", async () => {
    await env.must([record("B05", "Wick Dunmore", "2025-04-01", { endExclusive: "2026-03-01", sourceRef: "TB-T9" })]);
    expect(stateOn("B05", "2026-02-28")).toBe("taken");
    expect(stateOn("B05", "2026-03-01")).toBe("free");
    expect(stateOn("B02", "2030-01-01")).toBe("taken");
  });

  it("needs a name for a new holder and a valid start, and says which field", async () => {
    const noName = await env.dispatch([record("B05", "Wick Dunmore", "2026-06-01", { holderName: undefined })]);
    expect(noName.ok).toBe(false);
    if (!noName.ok) expect(noName.error.fields).toEqual([{ field: "holder", code: "required" }]);
    const noStart = await env.dispatch([record("B05", "Wick Dunmore", "")]);
    expect(noStart.ok).toBe(false);
    if (!noStart.ok) expect(noStart.error.fields).toEqual([{ field: "start", code: "required" }]);
    const badEnd = await env.dispatch([record("B05", "Wick Dunmore", "2026-06-01", { endExclusive: "2026-06-01" })]);
    expect(badEnd.ok).toBe(false);
    if (!badEnd.ok) expect(badEnd.error.fields).toEqual([{ field: "end", code: "bad_interval" }]);
    expect(Object.keys(env.state.tenancies)).toHaveLength(3);
  });

  it("accepts a holder who is already in the register with no name, and keeps one tenancy per plot", async () => {
    await env.must([record("B05", "Marlo Fennick", "2026-06-01", { holderName: undefined, sourceRef: "TB-T10" })]);
    const marlo = Object.values(env.state.tenancies).filter((t) => t.personId === person("Marlo Fennick"));
    expect(marlo.map((t) => env.state.core.plots[t.plotId]?.code).sort()).toEqual(["B01", "B05"]);
    expect(Object.values(env.state.people).filter((p) => p.displayName === "Marlo Fennick")).toHaveLength(1);
  });

  it("refuses a plot that does not exist", async () => {
    const out = await env.dispatch([record("B05", "Wick Dunmore", "2026-06-01", { spaceId: "no-such-space" })]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("no_such_space");
  });
});

describe("one tenancy per plot at any date (A3.2, R10.2)", () => {
  it("refuses an overlap, names the other source ref and dates, and writes nothing", async () => {
    const revision = env.revision;
    const out = await env.dispatch([record("B02", "Wick Dunmore", "2026-03-01", { sourceRef: "TB-NEW" })]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("tenancy_overlap");
      expect(out.error.detail).toMatchObject({ sourceRef: "TB-T2", start: "2025-04-01" });
    }
    expect(env.revision).toBe(revision);
    expect(Object.keys(env.state.tenancies)).toHaveLength(3);
  });

  it("lets one tenancy end on the day the next begins, because the end day is not covered", async () => {
    await env.must([record("B05", "Wick Dunmore", "2025-01-01", { endExclusive: "2026-05-01", sourceRef: "TB-T9" })]);
    await env.must([record("B05", "Hale Pennywort", "2026-05-01", { sourceRef: "TB-T11" })]);
    expect(holdersOn("B05", "2026-04-30")).toEqual(["Wick Dunmore"]);
    expect(holdersOn("B05", "2026-05-01")).toEqual(["Hale Pennywort"]);
  });

  it("checks the whole timeline for a backdated tenancy, including a tenancy that starts later", async () => {
    await env.must([record("B05", "Hale Pennywort", "2026-09-01", { sourceRef: "TB-LATER" })]);
    const run = await env.dispatch([record("B05", "Wick Dunmore", "2026-01-01", { sourceRef: "TB-OLD" })]);
    expect(run.ok).toBe(false);
    if (!run.ok) {
      expect(run.error.code).toBe("tenancy_overlap");
      expect(run.error.detail).toMatchObject({ sourceRef: "TB-LATER", start: "2026-09-01" });
    }
    await env.must([record("B05", "Wick Dunmore", "2026-01-01", { endExclusive: "2026-09-01", sourceRef: "TB-OLD" })]);
    expect(holdersOn("B05", "2026-08-31")).toEqual(["Wick Dunmore"]);
    expect(holdersOn("B05", "2026-09-01")).toEqual(["Hale Pennywort"]);
  });

  it("refuses a tenancy on a plot that is unusable on those days", async () => {
    const out = await env.dispatch([record("B06", "Wick Dunmore", "2026-06-01", { sourceRef: "TB-U" })]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("plot_not_free");
  });
});

describe("ending a tenancy with no successor (A3.3, hand totals 2.5)", () => {
  it("leaves B02 Free from the end date and keeps the holder in history", async () => {
    await env.must([{ type: "end_tenancy", tenancyId: tenancy("B02"), reason: "Gave up the plot" }], "2026-05-01");
    expect(stateOn("B02", "2026-04-30")).toBe("taken");
    expect(stateOn("B02", "2026-05-01")).toBe("free");
    expect(env.state.tenancies[tenancy("B02")]?.endExclusive).toBe("2026-05-01");
    expect(holdersOn("B02", "2026-05-01")).toEqual([]);
    expect(holdersOn("B02", "2026-04-30")).toEqual(["Ada Stonecrop"]);
    expect(siteTotalsAt(env.state.core, "2026-05-01").plots.byPrimary).toEqual({ free: 3, reserved: 0, taken: 2, unusable: 1 });
    expect((await env.events()).map((e) => e.type)).toContain("tenancy_ended");
  });

  it("refuses a second end, an unknown tenancy and an end before the start", async () => {
    await env.must([{ type: "end_tenancy", tenancyId: tenancy("B02") }], "2026-05-01");
    const again = await env.dispatch([{ type: "end_tenancy", tenancyId: tenancy("B02") }], "2026-06-01");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("tenancy_ended");
    const unknown = await env.dispatch([{ type: "end_tenancy", tenancyId: "nothing" }], "2026-06-01");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("no_such_tenancy");
    const early = await env.dispatch([{ type: "end_tenancy", tenancyId: tenancy("B01") }], "2024-03-31");
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.fields).toEqual([{ field: "end", code: "bad_interval" }]);
  });

  it("can start a new tenancy later, and the plot is Free in the gap", async () => {
    await env.must([{ type: "end_tenancy", tenancyId: tenancy("B02") }], "2026-05-01");
    await env.must([record("B02", "Hale Pennywort", "2026-06-01", { sourceRef: "TB-T12" })]);
    expect(stateOn("B02", "2026-05-15")).toBe("free");
    expect(stateOn("B02", "2026-06-01")).toBe("taken");
  });
});

describe("handing a plot over on a day (A3.4, hand totals 2.5)", () => {
  const D = "2026-05-01";
  const HAND = (extra: Partial<Extract<AllotCommand, { type: "hand_over" }>> = {}): AllotCommand => ({
    type: "hand_over",
    tenancyId: tenancy("B02"),
    newTenancyId: id("tenancy:B02:new"),
    claimId: claim("tenancy:B02:new"),
    personId: person("Hale Pennywort"),
    holderName: "Hale Pennywort",
    sourceRef: "TB-HO-1",
    ...extra,
  });

  it("ends the outgoing tenancy at the start of D and starts the incoming one on D, in one revision", async () => {
    const before = env.revision;
    await env.must([HAND()], D);
    expect(env.revision).toBe(before + 1);
    expect(holdersOn("B02", "2026-04-30")).toEqual(["Ada Stonecrop"]);
    expect(holdersOn("B02", D)).toEqual(["Hale Pennywort"]);
    expect(tenanciesCovering(env.state, plotId("B02"), "2026-04-30")).toHaveLength(1);
    expect(tenanciesCovering(env.state, plotId("B02"), D)).toHaveLength(1);
    expect(env.state.tenancies[tenancy("B02")]?.endExclusive).toBe(D);
    expect(env.state.tenancies[id("tenancy:B02:new")]).toMatchObject({ start: D, handoverFrom: tenancy("B02"), sourceRef: "TB-HO-1" });
    expect(stateOn("B02", D)).toBe("taken");
    const events = await env.events();
    const batch = events.filter((e) => e.opId === events[events.length - 1]?.opId).map((e) => e.type);
    expect(batch).toEqual(["claim_ended", "claim_added", "tenancy_ended", "tenancy_started"]);
  });

  it("leaves the plot Free for a gap when the new holder starts later by two commands", async () => {
    await env.must([{ type: "end_tenancy", tenancyId: tenancy("B02") }], D);
    await env.must([record("B02", "Hale Pennywort", "2026-05-08", { sourceRef: "TB-T13" })]);
    expect(stateOn("B02", "2026-05-07")).toBe("free");
    expect(holdersOn("B02", "2026-05-08")).toEqual(["Hale Pennywort"]);
  });

  it("takes a new holder's name, or an existing person with no name", async () => {
    const noName = await env.dispatch([HAND({ holderName: undefined })], D);
    expect(noName.ok).toBe(false);
    if (!noName.ok) expect(noName.error.fields).toEqual([{ field: "holder", code: "required" }]);
    await env.must([HAND({ personId: person("Marlo Fennick"), holderName: undefined })], D);
    expect(holdersOn("B02", D)).toEqual(["Marlo Fennick"]);
  });

  it("refuses a handover before the outgoing tenancy began, an unknown tenancy and a tenancy that already ended", async () => {
    const early = await env.dispatch([HAND()], "2025-03-31");
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.fields).toEqual([{ field: "end", code: "bad_interval" }]);
    const unknown = await env.dispatch([HAND({ tenancyId: "nothing" })], D);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("no_such_tenancy");
    await env.must([{ type: "end_tenancy", tenancyId: tenancy("B02") }], "2026-04-01");
    const ended = await env.dispatch([HAND()], D);
    expect(ended.ok).toBe(false);
    if (!ended.ok) expect(ended.error.code).toBe("tenancy_ended");
  });

  it("refuses a handover whose incoming tenancy would run into a tenancy that starts later, and changes nothing", async () => {
    await env.must([record("B05", "Wick Dunmore", "2026-02-01", { endExclusive: "2026-09-01", sourceRef: "TB-A" })]);
    await env.must([record("B05", "Hale Pennywort", "2026-09-01", { sourceRef: "TB-B" })]);
    const revision = env.revision;
    const events = (await env.events()).length;
    const out = await env.dispatch([HAND({ tenancyId: id("tenancy:B05:Wick Dunmore:2026-02-01"), newTenancyId: id("tenancy:B05:new"), claimId: id("claim:B05:new") })], D);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("tenancy_overlap");
      expect(out.error.detail).toMatchObject({ sourceRef: "TB-B", start: "2026-09-01" });
    }
    expect(env.revision).toBe(revision);
    expect((await env.events()).length).toBe(events);
    expect(env.state.tenancies[id("tenancy:B05:Wick Dunmore:2026-02-01")]?.endExclusive).toBe("2026-09-01");
  });
  it("shows two tenancies on one plot as two records, one per holder, with their own dates", async () => {
    await env.must([HAND()], D);
    const rows = Object.values(env.state.tenancies)
      .filter((t) => t.plotId === plotId("B02"))
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((t) => [env.state.people[t.personId]?.displayName, t.start, t.endExclusive]);
    expect(rows).toEqual([
      ["Ada Stonecrop", "2025-04-01", D],
      ["Hale Pennywort", D, undefined],
    ]);
  });
});

describe("tenure at a date is replayed, not stored", () => {
  it("reads the same after a reload", async () => {
    await env.must([{ type: "end_tenancy", tenancyId: tenancy("B02") }], "2026-05-01");
    const reloaded = await env.reload();
    expect(reloaded).toEqual(env.state);
    expect(tenanciesCovering(reloaded, plotId("B02"), "2026-04-30")).toHaveLength(1);
    expect(tenanciesCovering(reloaded, plotId("B02"), "2026-05-01")).toHaveLength(0);
  });
});

describe("a tenancy that starts after today is listed as starting later (spec 06, Z23.4, B4)", () => {
  const NEW = id("tenancy:B02:new");
  const hand = (): AllotCommand => ({
    type: "hand_over",
    tenancyId: tenancy("B02"),
    newTenancyId: NEW,
    claimId: claim("tenancy:B02:new"),
    personId: person("May Holder"),
    holderName: "May Holder",
  });
  const codes = (list: { plotId: string; tenancyId: string }[]) => list.map((x) => `${env.state.core.plots[x.plotId]?.code}:${x.tenancyId === NEW ? "new" : "old"}`);

  it("keeps Ada the one current holder of B02 until 2026-05-01, and lists May Holder as starting later", async () => {
    await env.must([hand()], "2026-05-01");
    const groups = tenancyGroups(env.state, "2026-04-20");
    expect(codes(groups.current)).toEqual(["B01:old", "B02:old", "B04:old"]);
    expect(codes(groups.later)).toEqual(["B02:new"]);
    expect(groups.past).toEqual([]);
    expect(groups.later.map((x) => x.start)).toEqual(["2026-05-01"]);
  });

  it("moves May Holder to current and Ada to past on the day, and lists nothing as later", async () => {
    await env.must([hand()], "2026-05-01");
    const groups = tenancyGroups(env.state, "2026-05-01");
    expect(codes(groups.current)).toEqual(["B01:old", "B02:new", "B04:old"]);
    expect(codes(groups.past)).toEqual(["B02:old"]);
    expect(groups.later).toEqual([]);
  });

  it("calls a tenancy current on its first day, and not before it", async () => {
    await env.must([record("B05", "Wick Dunmore", "2026-06-01", { sourceRef: "TB-T9" })]);
    expect(tenancyGroups(env.state, "2026-05-31").later.map((x) => x.start)).toEqual(["2026-06-01"]);
    expect(tenancyGroups(env.state, "2026-06-01").later).toEqual([]);
    expect(tenancyGroups(env.state, "2026-06-01").current.map((x) => env.state.core.plots[x.plotId]?.code)).toContain("B05");
  });

  it("puts a tenancy that has an end date in the future and has started in current, and one that has ended in past", async () => {
    await env.must([record("B05", "Wick Dunmore", "2025-04-01", { endExclusive: "2026-09-01", sourceRef: "TB-T9" })]);
    expect(codes(tenancyGroups(env.state, "2026-08-31").current)).toContain("B05:old");
    expect(codes(tenancyGroups(env.state, "2026-09-01").past)).toEqual(["B05:old"]);
  });

  it("has words for the group and for the day", () => {
    expect(ALLOT_COPY["tenanciesLater"]).toBe("Starts later");
    expect(ALLOT_COPY["tenancyStarts"]).toBe("Starts {date}");
  });
});
