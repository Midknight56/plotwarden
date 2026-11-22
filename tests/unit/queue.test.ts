// T17 (queue). Requirements A1, R11.3, R12.1, R12.2, R12.6. The expected values come from
// hand-totals.md sections 2.1 and 5.3. Tavi's application ID sorts after Olin's, so only the
// join sequence puts Tavi first.
import { beforeEach, describe, expect, it } from "vitest";
import { nextApplicant, queueView } from "../../apps/allotment-register/src/rules";
import type { AllotCommand, AllotState } from "../../apps/allotment-register/src/types";
import { GardenEnv, sectionId } from "../helpers/gardenEnv";

const TAVI = { applicationId: "app-f-tavi", personId: "person-tavi", name: "Tavi Bramblequill" };
const OLIN = { applicationId: "app-a-olin", personId: "person-olin", name: "Olin Reedwhorl" };

const apply = (who: typeof TAVI, joinedOn: string, extra: Partial<Extract<AllotCommand, { type: "add_applicant" }>> = {}): AllotCommand => ({
  type: "add_applicant",
  applicationId: who.applicationId,
  personId: who.personId,
  name: who.name,
  joinedOn,
  ...extra,
});

let env: GardenEnv;
beforeEach(async () => {
  env = await GardenEnv.create();
});

const names = (state: AllotState) => queueView(state).map((row) => row.name);

describe("order: joined date, then sequence, then ID (A1.2, A1.3)", () => {
  it("puts the same joined date in sequence order, not ID order", async () => {
    await env.must([apply(TAVI, "2026-01-10"), apply(OLIN, "2026-01-10")]);
    expect(TAVI.applicationId > OLIN.applicationId).toBe(true);
    expect(names(env.state)).toEqual(["Tavi Bramblequill", "Olin Reedwhorl"]);
    expect(queueView(env.state).map((r) => r.sequence)).toEqual([1, 2]);
    expect(queueView(env.state).map((r) => r.position)).toEqual([1, 2]);
    expect(nextApplicant(env.state)?.name).toBe("Tavi Bramblequill");
  });

  it("keeps the order after a reload from the stored events", async () => {
    await env.must([apply(TAVI, "2026-01-10"), apply(OLIN, "2026-01-10")]);
    const reloaded = await env.reload();
    expect(names(reloaded)).toEqual(["Tavi Bramblequill", "Olin Reedwhorl"]);
    expect(reloaded).toEqual(env.state);
  });

  it("keeps the order after the events go through JSON, as a backup does", async () => {
    await env.must([apply(TAVI, "2026-01-10"), apply(OLIN, "2026-01-10")]);
    const events = JSON.parse(JSON.stringify(await env.events()));
    const replayed = env.register.replay(env.site, events);
    expect(replayed.ok).toBe(true);
    if (replayed.ok) expect(names(replayed.value)).toEqual(["Tavi Bramblequill", "Olin Reedwhorl"]);
  });

  it("does not change when the screen sorts a copy by name", async () => {
    await env.must([apply(TAVI, "2026-01-10"), apply(OLIN, "2026-01-10")]);
    const view = queueView(env.state);
    const byName = [...view].sort((a, b) => a.name.localeCompare(b.name));
    expect(byName.map((r) => r.name)).toEqual(["Olin Reedwhorl", "Tavi Bramblequill"]);
    expect(names(env.state)).toEqual(["Tavi Bramblequill", "Olin Reedwhorl"]);
  });

  it("puts an earlier joined date first even when it was added later (out of order)", async () => {
    await env.must([apply(OLIN, "2026-01-12")]);
    await env.must([apply(TAVI, "2026-01-10")]);
    expect(queueView(env.state).map((r) => [r.name, r.sequence])).toEqual([
      ["Tavi Bramblequill", 2],
      ["Olin Reedwhorl", 1],
    ]);
  });

  it("falls back to the application ID only when date and sequence are equal", () => {
    const base = { joinedOn: "2026-01-10", sequence: 1, state: "waiting" as const, personId: "p" };
    const state = {
      applications: { b: { ...base, applicationId: "b", personId: "pb" }, a: { ...base, applicationId: "a", personId: "pa" } },
      people: { pa: { personId: "pa", displayName: "A" }, pb: { personId: "pb", displayName: "B" } },
    } as unknown as AllotState;
    expect(queueView(state).map((r) => r.applicationId)).toEqual(["a", "b"]);
  });
});

describe("one open request per person (A1.4)", () => {
  it("refuses a second request from the same person and writes nothing", async () => {
    await env.must([apply(TAVI, "2026-01-10")]);
    const revision = env.revision;
    const events = (await env.events()).length;
    const out = await env.dispatch([apply({ ...TAVI, applicationId: "app-second" }, "2026-02-01")]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("open_request");
    expect(env.revision).toBe(revision);
    expect((await env.events()).length).toBe(events);
    expect(Object.keys(env.state.applications)).toEqual(["app-f-tavi"]);
  });

  it("keeps two people with the same name as two applications", async () => {
    await env.must([apply(TAVI, "2026-01-10"), apply({ applicationId: "app-twin", personId: "person-twin", name: "Tavi Bramblequill" }, "2026-01-10")]);
    expect(queueView(env.state)).toHaveLength(2);
    expect(Object.keys(env.state.people)).toHaveLength(2);
  });

  it("accepts a new request from a person whose earlier request was withdrawn", async () => {
    await env.must([apply(TAVI, "2026-01-10")]);
    await env.must([{ type: "withdraw_applicant", applicationId: TAVI.applicationId, reason: "Moved away" }]);
    await env.must([apply({ ...TAVI, applicationId: "app-again" }, "2026-03-01")]);
    expect(queueView(env.state).map((r) => [r.applicationId, r.sequence])).toEqual([["app-again", 2]]);
  });

  it("does not need a name for a person who is already in the register", async () => {
    await env.must([apply(TAVI, "2026-01-10")]);
    await env.must([{ type: "withdraw_applicant", applicationId: TAVI.applicationId, reason: "Moved away" }]);
    const { name: _name, ...noName } = apply({ ...TAVI, applicationId: "app-again" }, "2026-03-01") as Extract<AllotCommand, { type: "add_applicant" }>;
    await env.must([noName]);
    expect(env.state.people[TAVI.personId]?.displayName).toBe("Tavi Bramblequill");
  });
});

describe("the sequence is fixed (A1.1, R11.3)", () => {
  it("counts up from 1 and keeps counting after a withdrawal", async () => {
    expect(env.state.nextSequence).toBe(1);
    await env.must([apply(TAVI, "2026-01-10"), apply(OLIN, "2026-01-10")]);
    expect(env.state.nextSequence).toBe(3);
    await env.must([{ type: "withdraw_applicant", applicationId: TAVI.applicationId, reason: "Moved away" }]);
    await env.must([apply({ applicationId: "app-new", personId: "person-new", name: "Wick Dunmore" }, "2026-01-10")]);
    expect(env.state.applications["app-new"]?.sequence).toBe(3);
  });

  it("changes a joined date only by a correction that names the original and a reason, and leaves the sequence", async () => {
    await env.must([apply(TAVI, "2026-01-10"), apply(OLIN, "2026-01-10")]);
    const original = (await env.events()).find((e) => e.type === "applicant_added" && e.entityIds[0] === TAVI.applicationId);
    expect(original).toBeDefined();
    const before = JSON.stringify(original);
    await env.must([{ type: "correct_joined_on", applicationId: TAVI.applicationId, joinedOn: "2026-01-15", correctsEventId: original?.eventId as string, reason: "The page says 15 January" }]);
    expect(names(env.state)).toEqual(["Olin Reedwhorl", "Tavi Bramblequill"]);
    expect(env.state.applications[TAVI.applicationId]?.sequence).toBe(1);
    const stored = await env.events();
    expect(JSON.stringify(stored.find((e) => e.eventId === original?.eventId))).toBe(before);
    expect(stored.find((e) => e.type === "joined_on_corrected")?.corrects).toBe(original?.eventId);
  });

  it("refuses a correction with no reason or no original, and says which field", async () => {
    await env.must([apply(TAVI, "2026-01-10")]);
    const noReason = await env.dispatch([{ type: "correct_joined_on", applicationId: TAVI.applicationId, joinedOn: "2026-01-15", correctsEventId: "x", reason: "" }]);
    expect(noReason.ok).toBe(false);
    if (!noReason.ok) expect(noReason.error.fields).toEqual([{ field: "reason", code: "required" }]);
    const noOriginal = await env.dispatch([{ type: "correct_joined_on", applicationId: TAVI.applicationId, joinedOn: "2026-01-15", correctsEventId: "", reason: "Page" }]);
    expect(noOriginal.ok).toBe(false);
    if (!noOriginal.ok) expect(noOriginal.error.fields).toEqual([{ field: "correctsEventId", code: "required" }]);
    expect(env.state.applications[TAVI.applicationId]?.joinedOn).toBe("2026-01-10");
  });

  it("has no command that changes a sequence, and refuses a sequence that is already used", async () => {
    await env.must([apply(TAVI, "2026-01-10")]);
    const out = await env.dispatch([apply(OLIN, "2026-01-10", { sequence: 1 })]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("sequence_used");
    const fresh = await env.dispatch([apply(OLIN, "2026-01-10", { sequence: 7 })]);
    expect(fresh.ok).toBe(true);
    expect(env.state.applications[OLIN.applicationId]?.sequence).toBe(7);
    expect(env.state.nextSequence).toBe(8);
    const bad = await env.dispatch([{ type: "set_sequence", applicationId: TAVI.applicationId, sequence: 9 } as unknown as AllotCommand]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("unknown_command");
  });
});

describe("withdrawing a request (A1.7)", () => {
  beforeEach(async () => {
    await env.must([apply(TAVI, "2026-01-10"), apply(OLIN, "2026-01-10")]);
  });

  it("needs a reason, names the field and writes nothing without it", async () => {
    const revision = env.revision;
    const out = await env.dispatch([{ type: "withdraw_applicant", applicationId: TAVI.applicationId, reason: "  " }]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.fields).toEqual([{ field: "reason", code: "required" }]);
    expect(env.revision).toBe(revision);
    expect(names(env.state)).toEqual(["Tavi Bramblequill", "Olin Reedwhorl"]);
  });

  it("takes the application out of the queue, keeps it in history and moves the next applicant up", async () => {
    await env.must([{ type: "withdraw_applicant", applicationId: TAVI.applicationId, reason: "Moved away" }], "2026-03-01");
    expect(names(env.state)).toEqual(["Olin Reedwhorl"]);
    expect(queueView(env.state)[0]?.position).toBe(1);
    expect(env.state.applications[TAVI.applicationId]).toMatchObject({ state: "withdrawn", withdrawn: { on: "2026-03-01", reason: "Moved away" } });
    expect((await env.events()).filter((e) => e.type === "applicant_withdrawn")).toHaveLength(1);
    expect(nextApplicant(env.state)?.name).toBe("Olin Reedwhorl");
  });

  it("refuses a second withdrawal and an unknown application", async () => {
    await env.must([{ type: "withdraw_applicant", applicationId: TAVI.applicationId, reason: "Moved away" }]);
    const again = await env.dispatch([{ type: "withdraw_applicant", applicationId: TAVI.applicationId, reason: "Again" }]);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("not_waiting");
    const unknown = await env.dispatch([{ type: "withdraw_applicant", applicationId: "nobody", reason: "x" }]);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("no_such_application");
  });
});

describe("field errors name the field (focus goes to the first)", () => {
  it("asks for the applicant's name for a new person", async () => {
    const out = await env.dispatch([{ type: "add_applicant", applicationId: "a1", personId: "p1", joinedOn: "2026-01-10" }]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.fields).toEqual([{ field: "applicant", code: "required" }]);
    expect(Object.keys(env.state.applications)).toEqual([]);
  });

  it("asks for a valid joined date", async () => {
    const out = await env.dispatch([apply(TAVI, "2026-02-30")]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.fields).toEqual([{ field: "joinedOn", code: "invalid_date" }]);
    const blank = await env.dispatch([apply(TAVI, "")]);
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.error.fields).toEqual([{ field: "joinedOn", code: "required" }]);
  });

  it("limits a name to 100 characters, and accepts exactly 100", async () => {
    const long = await env.dispatch([apply({ ...TAVI, name: "x".repeat(101) }, "2026-01-10")]);
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.error.fields).toEqual([{ field: "applicant", code: "over_limit" }]);
    const last = await env.dispatch([apply({ ...TAVI, name: "x".repeat(100) }, "2026-01-10")]);
    expect(last.ok).toBe(true);
  });

  it("refuses a preferred section that is not in the register, and keeps one that is", async () => {
    await env.must([{ type: "layout_apply", sections: [{ sectionId: sectionId("Sunny"), name: "Sunny" }], plots: [{ plotId: "plot-1", code: "B01", sectionId: sectionId("Sunny"), spaces: [{ spaceId: "space-1" }] }] }]);
    const bad = await env.dispatch([apply(TAVI, "2026-01-10", { preferredSectionId: "no-such-section" })]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("no_such_section");
    await env.must([apply(TAVI, "2026-01-10", { preferredSectionId: sectionId("Sunny") })]);
    expect(env.state.applications[TAVI.applicationId]?.preferredSectionId).toBe(sectionId("Sunny"));
  });

  it("keeps the source ref of an application as typed and reserves it once", async () => {
    await env.must([apply(TAVI, "2026-01-10", { sourceRef: "WL-001" })]);
    const clash = await env.dispatch([apply(OLIN, "2026-01-10", { sourceRef: "WL-001" })]);
    expect(clash.ok).toBe(false);
    if (!clash.ok) expect(clash.error.code).toBe("key_taken");
    expect(env.state.applications[TAVI.applicationId]?.sourceRef).toBe("WL-001");
  });
});
