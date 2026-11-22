// T14 reservation rules (spec 03, C2). Expected values come from hand-totals.md sections 1 and 4.
// A reservation holder is a living person kept apart from every burial. A request holds nothing.
import { beforeEach, describe, expect, it } from "vitest";
import { historyOf } from "../../template/src/events";
import { siteTotalsAt, spaceStateAt } from "../../template/src/status";
import type { ChurchCommand } from "../../apps/churchyard-register/src/types";
import { ChurchEnv, confirmEmpty, id, layoutYewWalk, plotId, spaceId } from "../helpers/churchEnv";

type Reserve = Extract<ChurchCommand, { type: "record_reservation" }>;
type Bury = Extract<ChurchCommand, { type: "record_burial" }>;

const reserve = (ref: string, code: string, start: string, over: Partial<Reserve> = {}): Reserve => ({
  type: "record_reservation",
  reservationId: id(`reservation:${ref}`),
  holderId: id(`holder:${ref}`),
  holderName: "Odalys Fennimore",
  contact: "wren.ashgrove@example.invalid",
  spaceId: spaceId(code),
  claimId: id(`claim:${ref}`),
  start,
  sourceRef: ref,
  ...over,
});

const bury = (ref: string, code: string, over: Partial<Bury> = {}): Bury => ({
  type: "record_burial",
  burialId: id(`burial:${ref}`),
  sourceRef: ref,
  recordedName: "Mirel Quillmoss",
  date: { p: "day", y: 2026, m: 4, d: 2 },
  dateText: "2 April 2026",
  plotId: plotId(code),
  spaceId: spaceId(code),
  claimId: id(`burialclaim:${ref}`),
  ...over,
});

let env: ChurchEnv;

beforeEach(async () => {
  env = await ChurchEnv.create();
  await layoutYewWalk(env);
  await confirmEmpty(env, ["Y02", "Y03", "Y11"]);
});

async function snapshot() {
  return { state: JSON.stringify(env.state), revision: env.revision, events: (await env.events()).length };
}

describe("T14 recording a reservation (C2.1, C2.2)", () => {
  it("keeps the living holder as a person record, writes one held claim from the start date and shows Reserved", async () => {
    await env.must([reserve("LF-R1", "Y02", "2025-09-01")]);
    const claim = env.state.core.claims[id("claim:LF-R1")];
    expect(claim).toMatchObject({ mode: "held", endable: true, start: "2025-09-01", sourceRef: "LF-R1", spaceId: spaceId("Y02") });
    expect(env.state.people[id("holder:LF-R1")]).toEqual({ personId: id("holder:LF-R1"), displayName: "Odalys Fennimore", contact: "wren.ashgrove@example.invalid" });
    expect(env.state.reservations[id("reservation:LF-R1")]).toMatchObject({ holderId: id("holder:LF-R1"), spaceId: spaceId("Y02"), plotId: plotId("Y02"), start: "2025-09-01" });
    expect(spaceStateAt(env.state.core, spaceId("Y02"), "2026-04-20")?.state).toBe("reserved");
    expect(spaceStateAt(env.state.core, spaceId("Y02"), "2025-08-31")?.state).toBe("free");
    expect(Object.keys(env.state.burials)).toHaveLength(0);
    expect(await env.reload()).toEqual(env.state);
  });

  it("refuses a space that is unchecked, with nothing saved", async () => {
    const before = await snapshot();
    const out = await env.dispatch([reserve("LF-R9", "Y04", "2026-01-01")]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("space_unchecked");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a second reservation at overlapping dates and names the current one", async () => {
    await env.must([reserve("LF-R1", "Y02", "2025-09-01")]);
    const before = await snapshot();
    const out = await env.dispatch([reserve("LF-R2", "Y02", "2026-02-14", { holderName: "Wren Ashgrove" })]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("claim_overlap");
      expect(out.error.detail?.["sourceRef"]).toBe("LF-R1");
      expect(out.error.detail?.["reservationId"]).toBe(id("reservation:LF-R1"));
    }
    expect(await snapshot()).toEqual(before);
  });

  it("needs a holder name and a valid start date, and says which field", async () => {
    const before = await snapshot();
    const noName = await env.dispatch([reserve("LF-R1", "Y02", "2025-09-01", { holderName: " " })]);
    const badDate = await env.dispatch([reserve("LF-R1", "Y02", "2025-02-30")]);
    expect(noName.ok || badDate.ok).toBe(false);
    if (!noName.ok) expect(noName.error.fields?.[0]).toEqual({ field: "holder", code: "required" });
    if (!badDate.ok) expect(badDate.error.fields?.[0]?.field).toBe("start");
    expect(await snapshot()).toEqual(before);
  });
});

describe("T14 a request is not a booking (C2.3, C2.8)", () => {
  it("stores the request and writes no claim: no space becomes Reserved", async () => {
    const claims = Object.keys(env.state.core.claims).length;
    const totals = JSON.stringify(siteTotalsAt(env.state.core, "2026-04-20"));
    await env.must([{ type: "add_request", requestId: id("request:1"), holderId: id("holder:req1"), holderName: "Wren Ashgrove", note: "Wants the next space near the yew" }]);
    expect(env.state.requests[id("request:1")]).toMatchObject({ holderId: id("holder:req1"), on: "2026-04-20" });
    expect(env.state.people[id("holder:req1")]?.displayName).toBe("Wren Ashgrove");
    expect(Object.keys(env.state.core.claims)).toHaveLength(claims);
    expect(JSON.stringify(siteTotalsAt(env.state.core, "2026-04-20"))).toBe(totals);
    expect(Object.keys(env.state.reservations)).toHaveLength(0);
  });

  it("turns the request into a reservation only when a space and a start date are chosen, and keeps the request", async () => {
    await env.must([{ type: "add_request", requestId: id("request:1"), holderId: id("holder:req1"), holderName: "Wren Ashgrove" }]);
    await env.must([{ type: "fulfil_request", requestId: id("request:1"), reservationId: id("reservation:fromReq"), spaceId: spaceId("Y11"), claimId: id("claim:fromReq"), start: "2026-02-14" }]);
    expect(env.state.reservations[id("reservation:fromReq")]).toMatchObject({ holderId: id("holder:req1"), fromRequest: id("request:1"), start: "2026-02-14", spaceId: spaceId("Y11") });
    expect(env.state.requests[id("request:1")]?.reservationId).toBe(id("reservation:fromReq"));
    expect(spaceStateAt(env.state.core, spaceId("Y11"), "2026-04-20")?.state).toBe("reserved");
    const before = await snapshot();
    const twice = await env.dispatch([{ type: "fulfil_request", requestId: id("request:1"), reservationId: id("reservation:again"), spaceId: spaceId("Y03"), claimId: id("claim:again"), start: "2026-03-01" }]);
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error.code).toBe("request_closed");
    expect(await snapshot()).toEqual(before);
  });
});

describe("T14 a reserved space is not silently converted (C2.4)", () => {
  beforeEach(async () => {
    await env.must([reserve("LF-R2", "Y11", "2026-02-14", { holderName: "Wren Ashgrove" })]);
  });

  it("refuses a burial in a reserved space that does not name the reservation, and shows the reservation", async () => {
    const before = await snapshot();
    const out = await env.dispatch([bury("LF-11", "Y11")]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("space_reserved");
      expect(out.error.detail?.["reservationId"]).toBe(id("reservation:LF-R2"));
      expect(out.error.detail?.["sourceRef"]).toBe("LF-R2");
    }
    expect(await snapshot()).toEqual(before);
  });

  it("refuses an older dated burial too, because the whole timeline is checked", async () => {
    const before = await snapshot();
    const out = await env.dispatch([bury("LF-11", "Y11", { date: { p: "day", y: 1950, m: 1, d: 1 }, dateText: "1950-01-01" })]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("space_reserved");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses to place an unplaced burial into it without naming the reservation", async () => {
    await env.must([bury("LF-H1", "Y11", { plotId: undefined, spaceId: undefined, claimId: undefined, recordedName: "Perrin Gladwyn" })]);
    const before = await snapshot();
    const out = await env.dispatch([{ type: "place_burial", burialId: id("burial:LF-H1"), plotId: plotId("Y11"), spaceId: spaceId("Y11"), claimId: id("claim:p") }]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("space_reserved");
    expect(await snapshot()).toEqual(before);
  });
});

describe("T14 converting a reservation to a burial (C2.5, C2.6)", () => {
  beforeEach(async () => {
    await env.must([reserve("LF-R2", "Y11", "2026-02-14", { holderName: "Wren Ashgrove" })]);
  });

  it("ends the held claim on the burial day and starts the burial there, with a deceased who is not the holder", async () => {
    await env.must([bury("LF-11", "Y11", { reservationId: id("reservation:LF-R2") })]);
    const held = env.state.core.claims[id("claim:LF-R2")];
    const taken = env.state.core.claims[id("burialclaim:LF-11")];
    expect(held?.endExclusive).toBe("2026-04-02");
    expect(taken).toMatchObject({ mode: "taken", start: "2026-04-02", endable: false });
    expect(spaceStateAt(env.state.core, spaceId("Y11"), "2026-04-01")?.state).toBe("reserved");
    expect(spaceStateAt(env.state.core, spaceId("Y11"), "2026-04-02")?.state).toBe("taken");
    expect(env.state.reservations[id("reservation:LF-R2")]?.convertedTo).toBe(id("burial:LF-11"));
    const burial = env.state.burials[id("burial:LF-11")];
    expect(burial?.recordedName).toBe("Mirel Quillmoss");
    expect(JSON.stringify(burial)).not.toContain("Wren Ashgrove");
    expect(JSON.stringify(burial)).not.toContain(id("holder:LF-R2"));
    expect(env.state.people[id("holder:LF-R2")]?.displayName).toBe("Wren Ashgrove");
    expect(await env.reload()).toEqual(env.state);
  });

  it("converts an unplaced burial that is placed into the reserved space by naming the reservation", async () => {
    await env.must([bury("LF-H1", "Y11", { plotId: undefined, spaceId: undefined, claimId: undefined, recordedName: "Perrin Gladwyn" })]);
    await env.must([{ type: "place_burial", burialId: id("burial:LF-H1"), plotId: plotId("Y11"), spaceId: spaceId("Y11"), claimId: id("claim:p"), reservationId: id("reservation:LF-R2") }]);
    expect(env.state.reservations[id("reservation:LF-R2")]?.convertedTo).toBe(id("burial:LF-H1"));
    expect(env.state.burials[id("burial:LF-H1")]?.spaceId).toBe(spaceId("Y11"));
  });

  it("refuses a conversion on a day before the reservation, in another space, with no full day, or twice", async () => {
    const before = await snapshot();
    const named = id("reservation:LF-R2");
    const early = await env.dispatch([bury("LF-11", "Y11", { reservationId: named, date: { p: "day", y: 2026, m: 2, d: 13 }, dateText: "13 February 2026" })]);
    const elsewhere = await env.dispatch([bury("LF-12", "Y03", { reservationId: named })]);
    const yearOnly = await env.dispatch([bury("LF-13", "Y11", { reservationId: named, date: { p: "year", y: 2026 }, dateText: "2026" })]);
    for (const out of [early, elsewhere, yearOnly]) expect(out.ok).toBe(false);
    if (!early.ok) expect(early.error.code).toBe("bad_conversion");
    if (!elsewhere.ok) expect(elsewhere.error.code).toBe("bad_conversion");
    if (!yearOnly.ok) expect(yearOnly.error.code).toBe("start_required");
    expect(await snapshot()).toEqual(before);
    await env.must([bury("LF-11", "Y11", { reservationId: named })]);
    const again = await env.dispatch([bury("LF-14", "Y11", { reservationId: named, date: { p: "day", y: 2026, m: 4, d: 3 }, dateText: "3 April 2026" })]);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("bad_conversion");
  });

  it("refuses a conversion that names a reservation that does not exist", async () => {
    const before = await snapshot();
    const out = await env.dispatch([bury("LF-11", "Y11", { reservationId: id("reservation:none") })]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("no_such_reservation");
    expect(await snapshot()).toEqual(before);
  });
});

describe("T14 releasing a reservation (C2.7)", () => {
  beforeEach(async () => {
    await env.must([reserve("LF-R1", "Y02", "2025-09-01")]);
  });

  it("needs a reason, ends the claim on the release date, frees the space from then and keeps the history", async () => {
    await env.must([{ type: "release_reservation", reservationId: id("reservation:LF-R1"), reason: "No longer needed" }], "2026-03-01");
    expect(env.state.reservations[id("reservation:LF-R1")]?.released).toEqual({ on: "2026-03-01", reason: "No longer needed" });
    expect(env.state.core.claims[id("claim:LF-R1")]?.endExclusive).toBe("2026-03-01");
    expect(spaceStateAt(env.state.core, spaceId("Y02"), "2026-02-28")?.state).toBe("reserved");
    expect(spaceStateAt(env.state.core, spaceId("Y02"), "2026-03-01")?.state).toBe("free");
    const types = (await env.events()).map((e) => e.type);
    expect(types).toContain("reservation_recorded");
    expect(types).toContain("claim_ended");
    expect(types).toContain("reservation_released");
    expect(historyOf(await env.events()).some((r) => r.type === "reservation_recorded" && r.effectiveOn === "2026-04-20")).toBe(true);
    expect(await env.reload()).toEqual(env.state);
  });

  it("refuses a release with no reason, one on or before the start, and a second release", async () => {
    const before = await snapshot();
    const none = await env.dispatch([{ type: "release_reservation", reservationId: id("reservation:LF-R1"), reason: " " }], "2026-03-01");
    const early = await env.dispatch([{ type: "release_reservation", reservationId: id("reservation:LF-R1"), reason: "r" }], "2025-09-01");
    expect(none.ok || early.ok).toBe(false);
    if (!none.ok) expect(none.error.fields?.[0]).toEqual({ field: "reason", code: "required" });
    if (!early.ok) expect(early.error.code).toBe("bad_interval");
    expect(await snapshot()).toEqual(before);
    await env.must([{ type: "release_reservation", reservationId: id("reservation:LF-R1"), reason: "r" }], "2026-03-01");
    const twice = await env.dispatch([{ type: "release_reservation", reservationId: id("reservation:LF-R1"), reason: "r" }], "2026-03-05");
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error.code).toBe("reservation_closed");
  });

  it("lets a new reservation take the space from the release date", async () => {
    await env.must([{ type: "release_reservation", reservationId: id("reservation:LF-R1"), reason: "r" }], "2026-03-01");
    await env.must([reserve("LF-R3", "Y02", "2026-03-01", { holderName: "Fenna Larkspur", contact: undefined })]);
    expect(spaceStateAt(env.state.core, spaceId("Y02"), "2026-04-20")?.state).toBe("reserved");
    expect(env.state.people[id("holder:LF-R3")]?.contact).toBeUndefined();
  });
});
