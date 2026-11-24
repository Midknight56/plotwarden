// T18 (offer). Requirements A2, R9, R12.5 to R12.8, R13.1 to R13.3. The expected values come from
// hand-totals.md sections 2.2, 2.6 and 5.3. Dates: offer 2026-04-04, reply by 2026-04-18,
// accepted 2026-04-10, fixed review date 2026-04-20.
import { beforeEach, describe, expect, it } from "vitest";
import { siteTotalsAt, spaceStateAt } from "../../template/src/status";
import { isOverdue, nextApplicant, offerPlan, queueView } from "../../apps/allotment-register/src/rules";
import type { AllotCommand } from "../../apps/allotment-register/src/types";
import { GardenEnv, id, plotId, sectionId, spaceId } from "../helpers/gardenEnv";
import { SHADY, SUNNY, app, buildBeds, claim, layoutBeds, person, tenancy } from "../helpers/thimbleBeds";

const OFFER = (name = "b03-tavi", extra: Partial<Extract<AllotCommand, { type: "make_offer" }>> = {}): AllotCommand => ({
  type: "make_offer",
  offerId: id(`offer:${name}`),
  applicationId: app("tavi"),
  spaceId: spaceId("B03"),
  claimId: claim(`hold:${name}`),
  replyBy: "2026-04-18",
  ...extra,
});

const ACCEPT = (offer = "b03-tavi", extra: Partial<Extract<AllotCommand, { type: "accept_offer" }>> = {}): AllotCommand => ({
  type: "accept_offer",
  offerId: id(`offer:${offer}`),
  tenancyId: tenancy("B03"),
  claimId: claim("tenancy:B03"),
  ...extra,
});

let env: GardenEnv;
const totals = (date = "2026-04-20") => siteTotalsAt(env.state.core, date);

describe("making an offer (hand totals 2.2)", () => {
  beforeEach(async () => {
    env = await GardenEnv.create();
    await buildBeds(env);
  });

  it("starts as the hand totals say: B03 free, Tavi first, Olin second", () => {
    expect(totals().plots.byPrimary).toEqual({ free: 2, reserved: 0, taken: 3, unusable: 1 });
    expect(queueView(env.state).map((r) => r.name)).toEqual(["Tavi Bramblequill", "Olin Reedwhorl"]);
    expect(nextApplicant(env.state)?.name).toBe("Tavi Bramblequill");
  });

  it("holds B03 for Tavi in one revision, drops it from the free plots and moves Olin up as next applicant", async () => {
    const before = env.revision;
    await env.must([OFFER()], "2026-04-04");
    expect(env.revision).toBe(before + 1);
    const events = await env.events();
    const stored = events.filter((e) => e.opId === lastOp(events));
    expect(stored.map((e) => e.type)).toEqual(["claim_added", "offer_made"]);
    expect(spaceStateAt(env.state.core, spaceId("B03"), "2026-04-20")?.state).toBe("reserved");
    expect(totals("2026-04-20").plots.byPrimary).toEqual({ free: 1, reserved: 1, taken: 3, unusable: 1 });
    expect(totals("2026-04-20").freePlots).toBe(1);
    expect(env.state.applications[app("tavi")]).toMatchObject({ state: "offered", offerId: id("offer:b03-tavi") });
    expect(queueView(env.state).map((r) => [r.name, r.pending])).toEqual([
      ["Tavi Bramblequill", true],
      ["Olin Reedwhorl", false],
    ]);
    expect(nextApplicant(env.state)?.name).toBe("Olin Reedwhorl");
    expect(env.state.offers[id("offer:b03-tavi")]).toMatchObject({ offeredOn: "2026-04-04", replyBy: "2026-04-18", state: "open", skipped: [] });
  });

  it("keeps the plot free before the offer date: the hold starts on the offer date", async () => {
    await env.must([OFFER()], "2026-04-04");
    expect(spaceStateAt(env.state.core, spaceId("B03"), "2026-04-03")?.state).toBe("free");
    expect(spaceStateAt(env.state.core, spaceId("B03"), "2026-04-04")?.state).toBe("reserved");
  });

  it("refuses a second open offer on the same plot, and a second open offer for the same application", async () => {
    await env.must([OFFER()], "2026-04-04");
    const revision = env.revision;
    const samePlot = await env.dispatch([OFFER("b03-olin", { applicationId: app("olin") })], "2026-04-05");
    expect(samePlot.ok).toBe(false);
    if (!samePlot.ok) expect(samePlot.error.code).toBe("offer_open");
    const sameApplication = await env.dispatch([OFFER("b05-tavi", { spaceId: spaceId("B05") })], "2026-04-05");
    expect(sameApplication.ok).toBe(false);
    if (!sameApplication.ok) expect(sameApplication.error.code).toBe("offer_open");
    expect(env.revision).toBe(revision);
    expect(Object.keys(env.state.offers)).toEqual([id("offer:b03-tavi")]);
  });

  it("refuses a plot that is taken, unusable or not yet checked, and says which plot", async () => {
    const taken = await env.dispatch([OFFER("b01", { spaceId: spaceId("B01") })], "2026-04-04");
    expect(taken.ok).toBe(false);
    if (!taken.ok) expect(taken.error.code).toBe("plot_not_free");
    const unusable = await env.dispatch([OFFER("b06", { spaceId: spaceId("B06") })], "2026-04-04");
    expect(unusable.ok).toBe(false);
    if (!unusable.ok) expect(unusable.error.code).toBe("plot_not_free");
    const gone = await env.dispatch([OFFER("none", { spaceId: "no-such-space" })], "2026-04-04");
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.error.code).toBe("no_such_space");
    expect(Object.keys(env.state.offers)).toEqual([]);
  });

  it("refuses a reply date before the offer date and a bad date, and accepts no reply date", async () => {
    const early = await env.dispatch([OFFER("e", { replyBy: "2026-04-03" })], "2026-04-04");
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error.fields).toEqual([{ field: "replyBy", code: "bad_interval" }]);
    const bad = await env.dispatch([OFFER("e", { replyBy: "2026-02-30" })], "2026-04-04");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.fields).toEqual([{ field: "replyBy", code: "invalid_date" }]);
    const { replyBy: _replyBy, ...none } = OFFER("n") as Extract<AllotCommand, { type: "make_offer" }>;
    await env.must([none], "2026-04-04");
    expect(env.state.offers[id("offer:n")]?.replyBy).toBeUndefined();
  });

  it("refuses an application that is not waiting, and an unknown one", async () => {
    const unknown = await env.dispatch([OFFER("x", { applicationId: "nobody" })], "2026-04-04");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("no_such_application");
    await env.must([{ type: "withdraw_applicant", applicationId: app("tavi"), reason: "Moved away" }]);
    const gone = await env.dispatch([OFFER("x")], "2026-04-04");
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.error.code).toBe("not_waiting");
  });

  it("checks the whole timeline: an offer that would run into a later tenancy is refused with its source ref", async () => {
    await env.must([{ type: "add_claim", claimId: claim("later:B05"), spaceId: spaceId("B05"), mode: "taken", start: "2026-09-01", endable: true, sourceRef: "TB-LATE" }]);
    const out = await env.dispatch([OFFER("b05", { spaceId: spaceId("B05") })], "2026-04-04");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("plot_not_free");
      expect(out.error.detail?.["sourceRef"]).toBe("TB-LATE");
      expect(out.error.detail?.["start"]).toBe("2026-09-01");
    }
  });
});

/** The opId of the last stored event. */
function lastOp(events: { opId: string }[]): string {
  return (events[events.length - 1] as { opId: string }).opId;
}

describe("skips and reasons (hand totals 5.3)", () => {
  // Application IDs sort C, B, A: the reverse of the sequence order.
  const A = { applicationId: "app-c-a", personId: "person-a", name: "Apple Ashgrove" };
  const B = { applicationId: "app-b-b", personId: "person-b", name: "Birch Bramwell" };
  const C = { applicationId: "app-a-c", personId: "person-c", name: "Clover Corbett" };
  const offerTo = (who: typeof A, code: string, extra: Partial<Extract<AllotCommand, { type: "make_offer" }>> = {}): AllotCommand => ({
    type: "make_offer",
    offerId: `offer-${who.applicationId}-${code}`,
    applicationId: who.applicationId,
    spaceId: spaceId(code),
    claimId: `hold-${who.applicationId}-${code}`,
    ...extra,
  });

  beforeEach(async () => {
    env = await GardenEnv.create();
    await layoutBeds(env, { geometry: false });
    await env.must([{ type: "confirm_empty", spaceIds: ["B03", "B05"].map(spaceId) }]);
    await env.must([
      { type: "add_applicant", ...A, joinedOn: "2026-01-10", preferredSectionId: sectionId(SHADY) },
      { type: "add_applicant", ...B, joinedOn: "2026-01-10" },
      { type: "add_applicant", ...C, joinedOn: "2026-01-12", preferredSectionId: sectionId(SUNNY) },
    ]);
  });

  it("orders A, B, C and plans B03 (Sunny Row): the first fit is B and A does not fit", () => {
    expect(queueView(env.state).map((r) => r.applicationId)).toEqual([A.applicationId, B.applicationId, C.applicationId]);
    const plan = offerPlan(env.state, plotId("B03"), B.applicationId);
    expect(plan.firstFit?.applicationId).toBe(B.applicationId);
    expect(plan.skipped).toEqual([{ applicationId: A.applicationId, kind: "preference" }]);
  });

  it("offers B03 to B with no reason typed, because A is passed over only by preference", async () => {
    await env.must([offerTo(B, "B03")]);
    expect(env.state.offers[`offer-${B.applicationId}-B03`]?.skipped).toEqual([{ applicationId: A.applicationId, kind: "preference" }]);
  });

  it("needs a reason to offer B03 to C, who is behind B, and records it for B", async () => {
    const revision = env.revision;
    const none = await env.dispatch([offerTo(C, "B03")]);
    expect(none.ok).toBe(false);
    if (!none.ok) {
      expect(none.error.code).toBe("skip_reason_required");
      expect(none.error.detail?.["applicationId"]).toBe(B.applicationId);
      expect(none.error.fields?.[0]?.field).toBe(`skipReason:${B.applicationId}`);
    }
    const blankReason = await env.dispatch([offerTo(C, "B03", { skipReasons: { [B.applicationId]: "   " } })]);
    expect(blankReason.ok).toBe(false);
    expect(env.revision).toBe(revision);
    expect(Object.keys(env.state.offers)).toEqual([]);

    await env.must([offerTo(C, "B03", { skipReasons: { [B.applicationId]: "Asked for a Sunny Row bed in writing" } })]);
    expect(env.state.offers[`offer-${C.applicationId}-B03`]?.skipped).toEqual([
      { applicationId: A.applicationId, kind: "preference" },
      { applicationId: B.applicationId, kind: "exceptional", reason: "Asked for a Sunny Row bed in writing" },
    ]);
    expect((await env.events()).filter((e) => e.type === "offer_made")).toHaveLength(1);
  });

  it("records a pending applicant as passed over with no reason needed", async () => {
    await env.must([offerTo(A, "B05")]);
    const plan = offerPlan(env.state, plotId("B03"), B.applicationId);
    expect(plan.skipped).toEqual([{ applicationId: A.applicationId, kind: "pending" }]);
    expect(plan.firstFit?.applicationId).toBe(B.applicationId);
    await env.must([offerTo(B, "B03")]);
    expect(env.state.offers[`offer-${B.applicationId}-B03`]?.skipped).toEqual([{ applicationId: A.applicationId, kind: "pending" }]);
  });

  it("has no skip when the first in order is chosen, and none for those behind", () => {
    expect(offerPlan(env.state, plotId("B05"), A.applicationId).skipped).toEqual([]);
    expect(offerPlan(env.state, plotId("B05"), A.applicationId).firstFit?.applicationId).toBe(A.applicationId);
  });
});

describe("accepting an offer (A2.4, hand totals 2.2)", () => {
  beforeEach(async () => {
    env = await GardenEnv.create();
    await buildBeds(env);
    await env.must([OFFER()], "2026-04-04");
  });

  it("commits the tenancy, the queue exit and the Taken state in one revision", async () => {
    const before = env.revision;
    await env.must([ACCEPT()], "2026-04-10");
    expect(env.revision).toBe(before + 1);
    const events = await env.events();
    const last = events.filter((e) => e.opId === events[events.length - 1]?.opId);
    expect(last.map((e) => e.type)).toEqual(["claim_ended", "claim_added", "offer_accepted"]);
    expect(totals().plots.byPrimary).toEqual({ free: 1, reserved: 0, taken: 4, unusable: 1 });
    expect(Object.values(env.state.tenancies).filter((t) => t.plotId === plotId("B03"))).toEqual([
      expect.objectContaining({ personId: person("Tavi Bramblequill"), start: "2026-04-10", fromOffer: id("offer:b03-tavi") }),
    ]);
    expect(env.state.tenancies[tenancy("B03")]?.endExclusive).toBeUndefined();
    expect(queueView(env.state).map((r) => [r.name, r.position])).toEqual([["Olin Reedwhorl", 1]]);
    expect(env.state.applications[app("tavi")]?.state).toBe("housed");
    expect(env.state.offers[id("offer:b03-tavi")]).toMatchObject({ state: "accepted", tenancyId: tenancy("B03") });
    expect(spaceStateAt(env.state.core, spaceId("B03"), "2026-04-09")?.state).toBe("reserved");
    expect(spaceStateAt(env.state.core, spaceId("B03"), "2026-04-10")?.state).toBe("taken");
  });

  it("refuses a second accept and keeps exactly one tenancy and one revision", async () => {
    await env.must([ACCEPT()], "2026-04-10");
    const revision = env.revision;
    const again = await env.dispatch([ACCEPT("b03-tavi", { tenancyId: id("tenancy:again"), claimId: id("claim:again") })], "2026-04-10");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("offer_closed");
    const repeat = await env.dispatch([ACCEPT()], "2026-04-10");
    expect(repeat.ok).toBe(false);
    expect(env.revision).toBe(revision);
    expect(Object.values(env.state.tenancies).filter((t) => t.plotId === plotId("B03"))).toHaveLength(1);
  });

  it("accepts on the offer date itself, with a hold that covers no day", async () => {
    await env.must([ACCEPT()], "2026-04-04");
    expect(spaceStateAt(env.state.core, spaceId("B03"), "2026-04-03")?.state).toBe("free");
    expect(spaceStateAt(env.state.core, spaceId("B03"), "2026-04-04")?.state).toBe("taken");
    expect(env.state.core.claims[claim("hold:b03-tavi")]?.endExclusive).toBe("2026-04-04");
  });

  it("refuses a tenancy that would begin before the offer", async () => {
    const out = await env.dispatch([ACCEPT()], "2026-04-03");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.fields).toEqual([{ field: "start", code: "bad_interval" }]);
    expect(env.state.offers[id("offer:b03-tavi")]?.state).toBe("open");
    expect(Object.keys(env.state.tenancies).includes(tenancy("B03"))).toBe(false);
  });

  it("refuses an unknown offer", async () => {
    const out = await env.dispatch([ACCEPT("nothing")], "2026-04-10");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("no_such_offer");
  });
});

describe("declining an offer (A2.5)", () => {
  beforeEach(async () => {
    env = await GardenEnv.create();
    await buildBeds(env);
    await env.must([OFFER()], "2026-04-04");
  });

  it("asks for Keep place or Leave list and writes nothing without a choice", async () => {
    const revision = env.revision;
    const out = await env.dispatch([{ type: "decline_offer", offerId: id("offer:b03-tavi") }], "2026-04-10");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.fields).toEqual([{ field: "choice", code: "required" }]);
    expect(env.revision).toBe(revision);
    expect(env.state.offers[id("offer:b03-tavi")]?.state).toBe("open");
  });

  it("Keep place frees the plot and puts Tavi back first", async () => {
    await env.must([{ type: "decline_offer", offerId: id("offer:b03-tavi"), choice: "keep_place" }], "2026-04-10");
    expect(spaceStateAt(env.state.core, spaceId("B03"), "2026-04-10")?.state).toBe("free");
    expect(spaceStateAt(env.state.core, spaceId("B03"), "2026-04-09")?.state).toBe("reserved");
    expect(queueView(env.state).map((r) => [r.name, r.position, r.pending])).toEqual([
      ["Tavi Bramblequill", 1, false],
      ["Olin Reedwhorl", 2, false],
    ]);
    expect(env.state.offers[id("offer:b03-tavi")]).toMatchObject({ state: "declined", closed: { on: "2026-04-10", choice: "keep_place" } });
    expect(totals().freePlots).toBe(2);
  });

  it("Leave list frees the plot and takes Tavi out of the queue, keeping the history", async () => {
    await env.must([{ type: "decline_offer", offerId: id("offer:b03-tavi"), choice: "leave_list", reason: "Found a plot elsewhere" }], "2026-04-10");
    expect(queueView(env.state).map((r) => r.name)).toEqual(["Olin Reedwhorl"]);
    expect(env.state.applications[app("tavi")]).toMatchObject({ state: "withdrawn", withdrawn: { on: "2026-04-10", reason: "Found a plot elsewhere" } });
    expect((await env.events()).map((e) => e.type)).toContain("offer_made");
    expect((await env.events()).map((e) => e.type)).toContain("offer_declined");
  });

  it("declines on the day of the offer, and refuses a second decline", async () => {
    await env.must([{ type: "decline_offer", offerId: id("offer:b03-tavi"), choice: "keep_place" }], "2026-04-04");
    expect(spaceStateAt(env.state.core, spaceId("B03"), "2026-04-04")?.state).toBe("free");
    const again = await env.dispatch([{ type: "decline_offer", offerId: id("offer:b03-tavi"), choice: "keep_place" }], "2026-04-05");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("offer_closed");
  });

  it("lets the same plot be offered again after a decline", async () => {
    await env.must([{ type: "decline_offer", offerId: id("offer:b03-tavi"), choice: "keep_place" }], "2026-04-10");
    // Tavi kept her place and is first again, so offering the plot to Olin passes her over and needs a reason.
    const bare = await env.dispatch([OFFER("b03-olin", { applicationId: app("olin") })], "2026-04-11");
    expect(bare.ok).toBe(false);
    if (!bare.ok) expect(bare.error.code).toBe("skip_reason_required");
    await env.must([OFFER("b03-olin", { applicationId: app("olin"), skipReasons: { [app("tavi")]: "Tavi asked to wait for a Shady Row bed" } })], "2026-04-11");
    expect(spaceStateAt(env.state.core, spaceId("B03"), "2026-04-20")?.state).toBe("reserved");
    expect(env.state.offers[id("offer:b03-olin")]?.skipped).toEqual([{ applicationId: app("tavi"), kind: "exceptional", reason: "Tavi asked to wait for a Shady Row bed" }]);
  });
});

describe("reply date, overdue and release (A2.6, hand totals 2.6)", () => {
  beforeEach(async () => {
    env = await GardenEnv.create();
    await buildBeds(env);
    await env.must([OFFER()], "2026-04-04");
  });

  it("is overdue from the day after the reply date, not on it", () => {
    const offer = env.state.offers[id("offer:b03-tavi")];
    expect(offer).toBeDefined();
    if (offer === undefined) return;
    expect(isOverdue(offer, "2026-04-17")).toBe(false);
    expect(isOverdue(offer, "2026-04-18")).toBe(false);
    expect(isOverdue(offer, "2026-04-19")).toBe(true);
    expect(isOverdue(offer, "2026-04-20")).toBe(true);
    expect(isOverdue({ ...offer, state: "accepted" }, "2026-04-20")).toBe(false);
  });

  it("never withdraws anyone by itself: the offer, the hold and the queue place stay at the review date", () => {
    expect(env.state.offers[id("offer:b03-tavi")]?.state).toBe("open");
    expect(spaceStateAt(env.state.core, spaceId("B03"), "2026-04-20")?.state).toBe("reserved");
    expect(queueView(env.state).map((r) => r.name)).toEqual(["Tavi Bramblequill", "Olin Reedwhorl"]);
  });

  it("is never overdue with no reply date, and cannot be released", async () => {
    const { replyBy: _r, ...noReply } = OFFER("open-ended", { applicationId: app("olin"), spaceId: spaceId("B05") }) as Extract<AllotCommand, { type: "make_offer" }>;
    await env.must([noReply], "2026-04-04");
    const offer = env.state.offers[id("offer:open-ended")];
    expect(offer && isOverdue(offer, "2030-01-01")).toBe(false);
    const out = await env.dispatch([{ type: "release_offer", offerId: id("offer:open-ended") }], "2030-01-01");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("not_overdue");
  });

  it("refuses to release an offer that is not yet overdue", async () => {
    const out = await env.dispatch([{ type: "release_offer", offerId: id("offer:b03-tavi") }], "2026-04-18");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("not_overdue");
    expect(env.state.offers[id("offer:b03-tavi")]?.state).toBe("open");
  });

  it("releases an overdue offer, frees the plot and keeps Tavi's place in the queue", async () => {
    await env.must([{ type: "release_offer", offerId: id("offer:b03-tavi") }], "2026-04-20");
    expect(spaceStateAt(env.state.core, spaceId("B03"), "2026-04-20")?.state).toBe("free");
    expect(queueView(env.state).map((r) => [r.name, r.position])).toEqual([
      ["Tavi Bramblequill", 1],
      ["Olin Reedwhorl", 2],
    ]);
    expect(env.state.offers[id("offer:b03-tavi")]).toMatchObject({ state: "released", closed: { on: "2026-04-20", withdrew: false } });
  });

  it("releases and withdraws only when the keeper chooses it, and then asks for a reason", async () => {
    const noReason = await env.dispatch([{ type: "release_offer", offerId: id("offer:b03-tavi"), withdraw: true }], "2026-04-20");
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.error.fields).toEqual([{ field: "reason", code: "required" }]);
    await env.must([{ type: "release_offer", offerId: id("offer:b03-tavi"), withdraw: true, reason: "No reply after two letters" }], "2026-04-20");
    expect(queueView(env.state).map((r) => r.name)).toEqual(["Olin Reedwhorl"]);
    expect(env.state.applications[app("tavi")]?.state).toBe("withdrawn");
  });

  it("cannot withdraw a request while its offer is open", async () => {
    const out = await env.dispatch([{ type: "withdraw_applicant", applicationId: app("tavi"), reason: "Moved away" }], "2026-04-20");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("offer_open");
  });
});

describe("history is only ever added to (undo only through an event)", () => {
  it("keeps every earlier event byte for byte after an offer is made, declined and made again", async () => {
    env = await GardenEnv.create();
    await buildBeds(env);
    await env.must([OFFER()], "2026-04-04");
    const first = JSON.stringify(await env.events());
    await env.must([{ type: "decline_offer", offerId: id("offer:b03-tavi"), choice: "keep_place" }], "2026-04-10");
    await env.must([OFFER("again")], "2026-04-11");
    const all = await env.events();
    expect(JSON.stringify(all.slice(0, JSON.parse(first).length))).toBe(first);
    expect(all.map((e) => e.seq)).toEqual(all.map((_e, i) => i + 1));
    const reloaded = await env.reload();
    expect(reloaded).toEqual(env.state);
  });
});

describe("an offer dated before the applicant joined (spec 06, Z23.3, B3)", () => {
  const LATE = app("late");
  const LATE_JOINED = "2027-01-01";
  const skips = { [app("tavi")]: "Late applicant first", [app("olin")]: "Late applicant first" };
  const lateOffer = (extra: Partial<Extract<AllotCommand, { type: "make_offer" }>> = {}): AllotCommand => OFFER("b03-late", { applicationId: LATE, replyBy: undefined, skipReasons: skips, ...extra });

  beforeEach(async () => {
    env = await GardenEnv.create();
    await buildBeds(env);
    await env.must([{ type: "add_applicant", applicationId: LATE, personId: person("Late Joiner"), name: "Late Joiner", joinedOn: LATE_JOINED }], "2026-04-20");
  });

  it("refuses an offer on 2026-04-20 to an applicant who joined on 2027-01-01, names the joined date, and changes nothing", async () => {
    const revision = env.revision;
    const events = (await env.events()).length;
    const out = await env.dispatch([lateOffer()], "2026-04-20");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("offer_before_joined");
      expect(out.error.detail).toMatchObject({ joinedOn: LATE_JOINED });
    }
    expect(env.revision).toBe(revision);
    expect((await env.events()).length).toBe(events);
    expect(Object.keys(env.state.offers)).toEqual([]);
    expect(env.state.applications[LATE]?.state).toBe("waiting");
    expect(spaceStateAt(env.state.core, spaceId("B03"), "2026-04-20")?.state).toBe("free");
  });

  it("refuses the day before the applicant joined and allows the day they joined", async () => {
    const before = await env.dispatch([lateOffer()], "2026-12-31");
    expect(before.ok).toBe(false);
    if (!before.ok) expect(before.error.code).toBe("offer_before_joined");
    const on = await env.dispatch([lateOffer()], LATE_JOINED);
    expect(on).toMatchObject({ ok: true });
    expect(env.state.offers[id("offer:b03-late")]).toMatchObject({ offeredOn: LATE_JOINED, state: "open" });
  });

  it("allows an offer to an applicant who joined earlier, as before", async () => {
    await env.must([OFFER()], "2026-04-04");
    expect(env.state.offers[id("offer:b03-tavi")]?.offeredOn).toBe("2026-04-04");
  });

  it("is a refusal of the rules, so it holds outside the browser too: the register's own run says no", () => {
    const decided = env.register.run(env.state, lateOffer(), "2026-04-20");
    expect(decided.ok).toBe(false);
  });
});
