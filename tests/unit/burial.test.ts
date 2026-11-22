// T13 burial rules (spec 03, C1). Expected values come from hand-totals.md sections 1 and 4.
// Each case is checked against the stored state, the saved event count and the revision.
import { beforeEach, describe, expect, it } from "vitest";
import { historyOf } from "../../template/src/events";
import { plotSummaryAt, spaceStateAt } from "../../template/src/status";
import { plotSummaryText } from "../../template/src/ui/copy";
import { possibleMatches } from "../../apps/churchyard-register/src/rules";
import type { ChurchCommand } from "../../apps/churchyard-register/src/types";
import { ChurchEnv, confirmEmpty, id, layoutYewWalk, plotId, spaceId } from "../helpers/churchEnv";

type RecordCmd = Extract<ChurchCommand, { type: "record_burial" }>;

/** A burial in a plot's space, from its source ref. */
function burial(ref: string, code: string | undefined, over: Partial<RecordCmd> = {}, space = 1): RecordCmd {
  const base: RecordCmd = {
    type: "record_burial",
    burialId: id(`burial:${ref}`),
    sourceRef: ref,
    recordedName: "Edda Thornwick",
    date: { p: "year", y: 1871 },
    dateText: "1871",
  };
  if (code !== undefined) {
    base.plotId = plotId(code);
    base.spaceId = spaceId(code, space);
    base.claimId = id(`claim:${ref}`);
  }
  return { ...base, ...over };
}

let env: ChurchEnv;

beforeEach(async () => {
  env = await ChurchEnv.create();
  await layoutYewWalk(env);
});

/** What a refusal must leave alone. */
async function snapshot() {
  return { state: JSON.stringify(env.state), revision: env.revision, events: (await env.events()).length };
}

describe("T13 recording a burial in a space (C1.1, C1.2)", () => {
  it("writes one burial and one taken claim that cannot end, and checks only that space", async () => {
    await env.must([burial("LF-01", "Y01")]);
    const claims = Object.values(env.state.core.claims);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ mode: "taken", endable: false, ref: id("burial:LF-01"), sourceRef: "LF-01", spaceId: spaceId("Y01") });
    expect(env.state.burials[id("burial:LF-01")]).toMatchObject({ spaceId: spaceId("Y01"), plotId: plotId("Y01"), sourceRef: "LF-01" });
    const checked = Object.values(env.state.core.plots).flatMap((p) => p.spaces).filter((s) => s.checked);
    expect(checked.map((s) => s.spaceId)).toEqual([spaceId("Y01")]);
    expect(plotSummaryAt(env.state.core, plotId("Y01"), "2026-04-20")?.primary).toBe("taken");
    expect(plotSummaryAt(env.state.core, plotId("Y02"), "2026-04-20")?.needsChecking).toBe(true);
  });

  it("refuses a second burial in an occupied space with 'This plot is already taken.' and leaves the state alone", async () => {
    await env.must([burial("LF-01", "Y01")]);
    const before = await snapshot();
    const out = await env.dispatch([burial("LF-99", "Y01", { recordedName: "Someone Else" })]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("space_taken");
      expect(out.error.detail?.["sourceRef"]).toBe("LF-01");
    }
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a space that is not in the named plot, and a plot with no space", async () => {
    const before = await snapshot();
    const wrong = await env.dispatch([burial("LF-02", "Y01", { spaceId: spaceId("Y02") })]);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.code).toBe("no_such_space");
    const half = await env.dispatch([burial("LF-03", undefined, { plotId: plotId("Y01") })]);
    expect(half.ok).toBe(false);
    if (!half.ok) expect(half.error.code).toBe("invalid_input");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses the same source ref for a second live burial", async () => {
    await env.must([burial("LF-01", "Y01")]);
    const before = await snapshot();
    const out = await env.dispatch([burial("LF-01", "Y03", { burialId: id("burial:other") })]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("source_ref_used");
    expect(await snapshot()).toEqual(before);
  });
});

describe("T13 plots with more than one space (C1.3)", () => {
  it("gives each burial its own space: Y07 reads 1 of 2, then 2 of 2 spaces used", async () => {
    await env.must([burial("LF-07A", "Y07", { recordedName: "Mirel Quillmoss" })]);
    const one = plotSummaryAt(env.state.core, plotId("Y07"), "2026-04-20");
    expect(one?.counts.taken).toBe(1);
    expect(one?.spaceCount).toBe(2);
    expect(plotSummaryText({ ...(one as NonNullable<typeof one>), needsChecking: false })).toBe("Taken · 1 of 2 spaces used");
    await env.must([burial("LF-07B", "Y07", { recordedName: "Torin Pellwick" }, 2)]);
    const two = plotSummaryAt(env.state.core, plotId("Y07"), "2026-04-20");
    expect(two?.counts.taken).toBe(2);
    expect(plotSummaryText(two as NonNullable<typeof two>)).toBe("Taken · 2 of 2 spaces used");
  });

  it("refuses a third burial in a plot whose two spaces are full, naming the burial in the space asked for", async () => {
    await env.must([burial("LF-07A", "Y07"), burial("LF-07B", "Y07", { recordedName: "Torin Pellwick" }, 2)]);
    const before = await snapshot();
    const out = await env.dispatch([burial("LF-07C", "Y07", { recordedName: "Third Person" }, 2)]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("space_taken");
      expect(out.error.detail?.["sourceRef"]).toBe("LF-07B");
    }
    expect(await snapshot()).toEqual(before);
  });

  it("adds a space to a plot, unchecked, and stops at twelve", async () => {
    await env.must([{ type: "add_space", plotId: plotId("Y01"), spaceId: id("extra:Y01:2"), label: "Second" }]);
    const plot = env.state.core.plots[plotId("Y01")];
    expect(plot?.spaces).toHaveLength(2);
    expect(plot?.spaces[1]).toMatchObject({ label: "Second", checked: false, retired: false });
    for (let n = 3; n <= 12; n++) {
      await env.must([{ type: "add_space", plotId: plotId("Y01"), spaceId: id(`extra:Y01:${n}`) }]);
    }
    expect(env.state.core.plots[plotId("Y01")]?.spaces).toHaveLength(12);
    const before = await snapshot();
    const out = await env.dispatch([{ type: "add_space", plotId: plotId("Y01"), spaceId: id("extra:Y01:13") }]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("space_limit");
    expect(await snapshot()).toEqual(before);
  });
});

describe("T13 partial dates are kept as they were entered (C1.4)", () => {
  it("keeps year only, month and year, unknown and a full day, and starts a claim only on a full day", async () => {
    await env.must([
      burial("LF-01", "Y01"),
      burial("LF-04", "Y04", { recordedName: "Harlan Mossgrove", date: { p: "month", y: 1902, m: 3 }, dateText: "March 1902" }),
      burial("LF-05", "Y05", { recordedName: undefined, nameUnknown: true, date: { p: "unknown" }, dateText: "" }),
      burial("LF-06", "Y06", { recordedName: "Ysolde Fenwick", date: { p: "day", y: 1938, m: 11, d: 14 }, dateText: "14 November 1938" }),
    ]);
    const b = env.state.burials;
    expect(b[id("burial:LF-01")]).toMatchObject({ date: { p: "year", y: 1871 }, dateText: "1871" });
    expect(b[id("burial:LF-04")]).toMatchObject({ date: { p: "month", y: 1902, m: 3 }, dateText: "March 1902" });
    expect(b[id("burial:LF-05")]?.date).toEqual({ p: "unknown" });
    expect(b[id("burial:LF-06")]?.date).toEqual({ p: "day", y: 1938, m: 11, d: 14 });
    const start = (ref: string) => env.state.core.claims[id(`claim:${ref}`)]?.start;
    expect(start("LF-01")).toBeUndefined();
    expect(start("LF-04")).toBeUndefined();
    expect(start("LF-05")).toBeUndefined();
    expect(start("LF-06")).toBe("1938-11-14");
    // A year only burial is not 1 January: the space is Taken on every date, and no day was made up.
    expect(spaceStateAt(env.state.core, spaceId("Y01"), "1871-01-01")?.state).toBe("taken");
    expect(JSON.stringify(b[id("burial:LF-01")])).not.toContain("1871-01-01");
  });

  it("refuses a date that does not exist", async () => {
    const before = await snapshot();
    for (const date of [{ p: "day", y: 1900, m: 2, d: 29 }, { p: "month", y: 1902, m: 13 }, { p: "year", y: 999 }] as const) {
      const out = await env.dispatch([burial("LF-01", "Y01", { date })]);
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.code).toBe("invalid_input");
    }
    expect(await snapshot()).toEqual(before);
  });
});

describe("T13 unknown identity (C1.5)", () => {
  it("stores a nameless burial with the flag and no name", async () => {
    await env.must([burial("LF-05", "Y05", { recordedName: undefined, nameUnknown: true, date: { p: "unknown" }, dateText: "" })]);
    const stored = env.state.burials[id("burial:LF-05")];
    expect(stored?.nameUnknown).toBe(true);
    expect(stored?.recordedName).toBeUndefined();
    expect("recordedName" in (stored ?? {})).toBe(false);
  });

  it("refuses no name without the flag, and both a name and the flag, naming the field", async () => {
    const before = await snapshot();
    for (const over of [{ recordedName: "  " }, { recordedName: undefined }, { recordedName: "Mirel", nameUnknown: true }] as Partial<RecordCmd>[]) {
      const out = await env.dispatch([burial("LF-01", "Y01", over)]);
      expect(out.ok).toBe(false);
      if (!out.ok) {
        expect(out.error.code).toBe("invalid_input");
        expect(out.error.fields?.[0]?.field).toBe("recordedName");
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it("keeps two burials with the same name apart and offers a match only the keeper can settle", async () => {
    await env.must([
      burial("LF-10", "Y01", { recordedName: "Anne Hartley" }),
      burial("LF-11", "Y03", { recordedName: "anne  hartley", date: { p: "year", y: 1902 }, dateText: "1902" }),
      burial("LF-12", "Y04", { recordedName: "Brindle Hartley" }),
    ]);
    expect(Object.keys(env.state.burials)).toHaveLength(3);
    expect(possibleMatches(env.state)).toEqual([[id("burial:LF-10"), id("burial:LF-11")].sort()]);
    await env.must([{ type: "keep_separate", burialId: id("burial:LF-10"), otherBurialId: id("burial:LF-11") }]);
    expect(possibleMatches(env.state)).toEqual([]);
    expect(env.state.burials[id("burial:LF-10")]?.personKey).toBeUndefined();
  });

  it("links two burials as one person only when the keeper chooses to, and keeps both records", async () => {
    await env.must([
      burial("LF-10", "Y01", { recordedName: "Anne Hartley" }),
      burial("LF-11", "Y03", { recordedName: "Anne Hartley", date: { p: "year", y: 1902 }, dateText: "1902" }),
    ]);
    expect(env.state.burials[id("burial:LF-10")]?.personKey).toBeUndefined();
    await env.must([{ type: "link_burials", burialId: id("burial:LF-10"), otherBurialId: id("burial:LF-11"), personKey: id("person:anne") }]);
    expect(env.state.burials[id("burial:LF-10")]?.personKey).toBe(id("person:anne"));
    expect(env.state.burials[id("burial:LF-11")]?.personKey).toBe(id("person:anne"));
    expect(Object.keys(env.state.burials)).toHaveLength(2);
    expect(possibleMatches(env.state)).toEqual([]);
  });
});

describe("T13 unplaced to placed (C1.6, C1.7)", () => {
  it("stores a burial with no space as unplaced and changes no plot", async () => {
    const claimsBefore = Object.keys(env.state.core.claims).length;
    await env.must([burial("LF-H1", undefined, { recordedName: "Perrin Gladwyn", date: { p: "year", y: 1790 }, dateText: "1790" })]);
    const stored = env.state.burials[id("burial:LF-H1")];
    expect(stored?.plotId).toBeUndefined();
    expect(stored?.spaceId).toBeUndefined();
    expect(Object.keys(env.state.core.claims)).toHaveLength(claimsBefore);
    expect(plotSummaryAt(env.state.core, plotId("Y03"), "2026-04-20")?.needsChecking).toBe(true);
  });

  it("places it later in an exact space, keeping its ID, source ref and date", async () => {
    await confirmEmpty(env, ["Y03"]);
    await env.must([burial("LF-H1", undefined, { recordedName: "Perrin Gladwyn", date: { p: "year", y: 1790 }, dateText: "1790" })]);
    await env.must([{ type: "place_burial", burialId: id("burial:LF-H1"), plotId: plotId("Y03"), spaceId: spaceId("Y03"), claimId: id("claim:LF-H1") }]);
    const placed = env.state.burials[id("burial:LF-H1")];
    expect(placed).toMatchObject({ burialId: id("burial:LF-H1"), sourceRef: "LF-H1", date: { p: "year", y: 1790 }, plotId: plotId("Y03"), spaceId: spaceId("Y03") });
    expect(plotSummaryAt(env.state.core, plotId("Y03"), "2026-04-20")?.primary).toBe("taken");
    expect(env.state.core.claims[id("claim:LF-H1")]).toMatchObject({ mode: "taken", sourceRef: "LF-H1", ref: id("burial:LF-H1") });
  });

  it("refuses to place into a taken space, to place a placed burial, and to place one that does not exist", async () => {
    await env.must([burial("LF-01", "Y01"), burial("LF-H1", undefined, { recordedName: "Perrin Gladwyn" })]);
    const before = await snapshot();
    const place = (burialId: string, code: string, claim: string): ChurchCommand => ({ type: "place_burial", burialId, plotId: plotId(code), spaceId: spaceId(code), claimId: id(claim) });
    const taken = await env.dispatch([place(id("burial:LF-H1"), "Y01", "claim:x1")]);
    const again = await env.dispatch([place(id("burial:LF-01"), "Y03", "claim:x2")]);
    const none = await env.dispatch([place(id("burial:none"), "Y03", "claim:x3")]);
    expect(taken.ok || again.ok || none.ok).toBe(false);
    if (!taken.ok) expect(taken.error.code).toBe("space_taken");
    if (!again.ok) expect(again.error.code).toBe("already_placed");
    if (!none.ok) expect(none.error.code).toBe("no_such_burial");
    expect(await snapshot()).toEqual(before);
  });
});

describe("T13 corrections and source history (C1.9, C1.10)", () => {
  it("changes a name only by a correction that names the original, with a reason and a source", async () => {
    await env.must([burial("LF-01", "Y01", { recordedName: "Edda Thornwik" })]);
    const original = await env.eventIdOf("burial_recorded", id("burial:LF-01"));
    const storedBefore = JSON.stringify((await env.events()).find((e) => e.eventId === original));
    await env.must([
      { type: "correct_burial", burialId: id("burial:LF-01"), recordedName: "Edda Thornwick", correctsEventId: original, reason: "Spelling checked against the stone", correctionRef: "LF page 2" },
    ]);
    expect(env.state.burials[id("burial:LF-01")]?.recordedName).toBe("Edda Thornwick");
    const events = await env.events();
    expect(JSON.stringify(events.find((e) => e.eventId === original))).toBe(storedBefore);
    const fix = events.find((e) => e.type === "burial_corrected");
    expect(fix?.corrects).toBe(original);
    const rows = historyOf(events);
    expect(rows.find((r) => r.eventId === original)?.correctedBy).toEqual([fix?.eventId]);
    expect(rows.find((r) => r.eventId === original)?.sourceRef).toBe("LF-01");
    expect(env.state.burials[id("burial:LF-01")]?.correctionRefs).toEqual(["LF page 2"]);
    expect(await env.reload()).toEqual(env.state);
  });

  it("refuses a correction with no reason or no source ref, and a correction that would blank the identity", async () => {
    await env.must([burial("LF-01", "Y01")]);
    const original = await env.eventIdOf("burial_recorded", id("burial:LF-01"));
    const before = await snapshot();
    const base = { type: "correct_burial", burialId: id("burial:LF-01"), correctsEventId: original } as const;
    const noReason = await env.dispatch([{ ...base, recordedName: "X", reason: " ", correctionRef: "p1" }]);
    const noRef = await env.dispatch([{ ...base, recordedName: "X", reason: "r", correctionRef: "" }]);
    const blank = await env.dispatch([{ ...base, recordedName: " ", reason: "r", correctionRef: "p1" }]);
    for (const out of [noReason, noRef, blank]) {
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.code).toBe("invalid_input");
    }
    expect(await snapshot()).toEqual(before);
  });

  it("moves a burial: the old claim is voided, the old space is Free again and the new space is Taken", async () => {
    await confirmEmpty(env, ["Y03"]);
    await env.must([burial("LF-01", "Y01")]);
    const original = await env.eventIdOf("burial_recorded", id("burial:LF-01"));
    const claimEvent = await env.eventIdOf("claim_added", id("claim:LF-01"));
    await env.must([
      {
        type: "move_burial",
        burialId: id("burial:LF-01"),
        spaceId: spaceId("Y03"),
        claimId: id("claim:LF-01b"),
        correctsEventId: original,
        claimEventId: claimEvent,
        reason: "Entered in the wrong row",
        correctionRef: "LF page 4",
      },
    ]);
    expect(env.state.burials[id("burial:LF-01")]).toMatchObject({ spaceId: spaceId("Y03"), plotId: plotId("Y03"), claimId: id("claim:LF-01b") });
    expect(env.state.core.claims[id("claim:LF-01")]?.voided).toBe(true);
    expect(spaceStateAt(env.state.core, spaceId("Y01"), "2026-04-20")?.state).toBe("free");
    expect(spaceStateAt(env.state.core, spaceId("Y03"), "2026-04-20")?.state).toBe("taken");
    const events = await env.events();
    expect(events.filter((e) => e.corrects === original || e.corrects === claimEvent)).toHaveLength(2);
    expect(await env.reload()).toEqual(env.state);
  });

  it("refuses to move a burial onto an occupied space and shows the other source ref", async () => {
    await env.must([burial("LF-01", "Y01"), burial("LF-04", "Y04", { recordedName: "Harlan Mossgrove" })]);
    const original = await env.eventIdOf("burial_recorded", id("burial:LF-01"));
    const claimEvent = await env.eventIdOf("claim_added", id("claim:LF-01"));
    const before = await snapshot();
    const out = await env.dispatch([
      { type: "move_burial", burialId: id("burial:LF-01"), spaceId: spaceId("Y04"), claimId: id("claim:z"), correctsEventId: original, claimEventId: claimEvent, reason: "r", correctionRef: "p" },
    ]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("space_taken");
      expect(out.error.detail?.["sourceRef"]).toBe("LF-04");
    }
    expect(await snapshot()).toEqual(before);
  });

  it("voids an incorrect record: the claim is voided, the burial stays in history and its space is Free", async () => {
    await env.must([burial("LF-01", "Y01")]);
    const original = await env.eventIdOf("burial_recorded", id("burial:LF-01"));
    const claimEvent = await env.eventIdOf("claim_added", id("claim:LF-01"));
    await env.must([{ type: "void_burial", burialId: id("burial:LF-01"), correctsEventId: original, claimEventId: claimEvent, reason: "Duplicate entry", correctionRef: "LF page 1" }]);
    expect(env.state.burials[id("burial:LF-01")]?.voided).toBe(true);
    expect(spaceStateAt(env.state.core, spaceId("Y01"), "2026-04-20")?.state).toBe("free");
    expect((await env.events()).some((e) => e.type === "burial_recorded")).toBe(true);
  });

  it("will not let 'Mark free' clear a burial: the route is a correction", async () => {
    await env.must([burial("LF-01", "Y01")]);
    const before = await snapshot();
    const out = await env.dispatch([{ type: "end_claim", claimId: id("claim:LF-01"), reason: "Mark free" }]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("taken_needs_correction");
      expect(out.error.route).toBe("correct_entry");
    }
    expect(await snapshot()).toEqual(before);
  });
});

describe("T13 replay (C1)", () => {
  it("a reload from the stored events gives the same state, and the revision rose once per batch", async () => {
    const start = env.revision;
    await env.must([burial("LF-01", "Y01"), burial("LF-07A", "Y07", { recordedName: "Mirel Quillmoss" })]);
    await env.must([burial("LF-H1", undefined, { recordedName: "Perrin Gladwyn" })]);
    expect(env.revision).toBe(start + 2);
    expect(await env.reload()).toEqual(env.state);
  });
});
