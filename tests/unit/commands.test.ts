// T12 (transitions and refusals) and T21 (backdated dry run): core commands.
import { describe, expect, it } from "vitest";
import { decideCore, validateCore, type CoreCommand } from "../../template/src/commands";
import { applyCore, type CoreEvent, type DraftEvent } from "../../template/src/events";
import { spaceStateAt } from "../../template/src/status";
import type { CoreState, Result } from "../../template/src/types";
import { emptyCoreState } from "../../template/src/events";
import { fid, SITE_ID } from "../helpers/site";

const CTX = { spacesPerPlot: { min: 1, max: 12 } };
const ON = "2026-04-20";

type Drafts = DraftEvent<CoreEvent>[];

function decide(state: CoreState, command: CoreCommand, on = ON): Result<Drafts> {
  return decideCore(state, command, on, CTX);
}

function must(state: CoreState, command: CoreCommand, on = ON): Drafts {
  const result = decide(state, command, on);
  if (!result.ok) throw new Error(`refused ${command.type}: ${JSON.stringify(result.error)}`);
  return result.value;
}

function step(state: CoreState, command: CoreCommand, on = ON): CoreState {
  return must(state, command, on).reduce((s, d) => applyCore(s, d.event), state);
}

function refusal(state: CoreState, command: CoreCommand, on = ON) {
  const result = decide(state, command, on);
  if (result.ok) throw new Error(`expected a refusal of ${command.type}`);
  return result.error;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

const start = (): CoreState => emptyCoreState(SITE_ID);
const P = (code: string) => fid(`plot:${code}`);
const S = (code: string, n = 1) => fid(`space:${code}:${n}`);

function addPlot(code: string, spaces = 1): CoreCommand {
  return {
    type: "add_plot",
    plotId: P(code),
    code,
    spaces: Array.from({ length: spaces }, (_, i) => ({ spaceId: S(code, i + 1) })),
  };
}

function claim(
  claimId: string,
  spaceId: string,
  mode: "taken" | "held" | "unusable",
  extra: Partial<Extract<CoreCommand, { type: "add_claim" }>> = {},
): CoreCommand {
  return { type: "add_claim", claimId, spaceId, mode, endable: mode !== "taken", ...extra };
}

function withPlot(code: string, spaces = 1, checked = true): CoreState {
  let state = step(start(), addPlot(code, spaces));
  if (checked) {
    state = step(state, { type: "confirm_empty", spaceIds: Array.from({ length: spaces }, (_, i) => S(code, i + 1)) });
  }
  return state;
}

describe("T12 adding and renaming plots", () => {
  it("returns an ordered event batch with the effective date and no side effects", () => {
    const state = deepFreeze(start());
    const drafts = must(state, addPlot("Y07", 2));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.event).toMatchObject({ type: "plot_added", plotId: P("Y07"), code: "Y07" });
    expect(drafts[0]!.effectiveOn).toBe(ON);
    expect(drafts[0]!.entityIds).toEqual([P("Y07"), S("Y07", 1), S("Y07", 2)]);
    expect(drafts[0]!.payloadVersion).toBe(1);
    expect(must(state, addPlot("Y07", 2))).toEqual(drafts);
  });

  it("gives the default labels 1 and 2", () => {
    const drafts = must(start(), addPlot("Y07", 2));
    expect(drafts[0]!.event).toMatchObject({
      spaces: [
        { spaceId: S("Y07", 1), label: "1" },
        { spaceId: S("Y07", 2), label: "2" },
      ],
    });
  });

  it("refuses a code that is already a current code, in any case", () => {
    const state = step(start(), addPlot("Y07"));
    const error = refusal(state, { ...(addPlot("y07") as object), plotId: fid("plot:other") } as CoreCommand);
    expect(error.code).toBe("code_taken");
    expect(error.detail).toMatchObject({ code: "y07", plotId: P("Y07") });
  });

  it("refuses a code that is a prior code", () => {
    let state = step(start(), addPlot("Y07"));
    state = step(state, { type: "rename_plot", plotId: P("Y07"), code: "Z01" });
    const error = refusal(state, { ...(addPlot("Y07") as object), plotId: fid("plot:again") } as CoreCommand);
    expect(error.code).toBe("code_taken");
    expect(error.detail?.via).toBe("priorCode");
  });

  it("refuses a space count outside the adapter range", () => {
    expect(refusal(start(), addPlot("A", 13)).code).toBe("bad_space_count");
    expect(refusal(start(), addPlot("A", 0)).code).toBe("bad_space_count");
    expect(decideCore(start(), addPlot("A", 2), ON, { spacesPerPlot: { min: 1, max: 1 } }).ok).toBe(false);
  });

  it("refuses a repeated plot or space ID", () => {
    const state = step(start(), addPlot("Y07"));
    expect(refusal(state, { ...(addPlot("Q1") as object), plotId: P("Y07") } as CoreCommand).code).toBe("duplicate_id");
    const reuse: CoreCommand = { type: "add_plot", plotId: fid("plot:new"), code: "Q2", spaces: [{ spaceId: S("Y07") }] };
    expect(refusal(state, reuse).code).toBe("duplicate_id");
  });

  it("renames, keeping the IDs and reserving the old code", () => {
    const state = step(withPlot("Y07", 2), { type: "rename_plot", plotId: P("Y07"), code: "Z01" });
    const plot = state.plots[P("Y07")]!;
    expect(plot.code).toBe("Z01");
    expect(plot.priorCodes).toEqual(["Y07"]);
    expect(plot.spaces.map((s) => s.spaceId)).toEqual([S("Y07", 1), S("Y07", 2)]);
  });

  it("refuses to rename an unknown plot or to a taken code", () => {
    const state = step(withPlot("Y07"), addPlot("Y08"));
    expect(refusal(state, { type: "rename_plot", plotId: fid("plot:nope"), code: "Q" }).code).toBe("no_such_plot");
    expect(refusal(state, { type: "rename_plot", plotId: P("Y07"), code: "y08" }).code).toBe("code_taken");
  });
});

describe("T12 confirming empty plots", () => {
  it("marks only the listed spaces checked", () => {
    let state = step(step(start(), addPlot("A1")), addPlot("A2"));
    state = step(state, { type: "confirm_empty", spaceIds: [S("A1")] });
    expect(spaceStateAt(state, S("A1"), ON)?.state).toBe("free");
    expect(spaceStateAt(state, S("A2"), ON)?.state).toBeUndefined();
  });

  it("refuses an unknown space, a repeat in the list, a checked space and a space with a claim", () => {
    const state = step(withPlot("A1"), addPlot("A2"));
    expect(refusal(state, { type: "confirm_empty", spaceIds: [fid("nope")] }).code).toBe("no_such_space");
    expect(refusal(state, { type: "confirm_empty", spaceIds: [S("A2"), S("A2")] }).code).toBe("duplicate_id");
    expect(refusal(state, { type: "confirm_empty", spaceIds: [S("A1")] }).code).toBe("already_checked");
    const burial = step(step(start(), addPlot("B1")), claim("b", S("B1"), "taken"));
    expect(refusal(burial, { type: "confirm_empty", spaceIds: [S("B1")] }).code).toBe("already_checked");
  });

  it("refuses a space that has an open claim", () => {
    const state = step(step(start(), addPlot("C1", 2)), claim("b", S("C1", 1), "taken"));
    // C1 space 2 is still unchecked and empty, so it can be confirmed. Space 1 cannot.
    expect(decide(state, { type: "confirm_empty", spaceIds: [S("C1", 2)] }).ok).toBe(true);
    expect(refusal(state, { type: "confirm_empty", spaceIds: [S("C1", 1)] }).code).toBe("already_checked");
  });

  it("refuses an empty list", () => {
    expect(refusal(start(), { type: "confirm_empty", spaceIds: [] }).code).toBe("invalid_input");
  });
});

describe("T12 adding claims", () => {
  it("a burial in an unchecked space marks only that space checked", () => {
    const state = step(step(start(), addPlot("A", 2)), claim("b1", S("A", 1), "taken"));
    expect(spaceStateAt(state, S("A", 1), ON)?.state).toBe("taken");
    expect(spaceStateAt(state, S("A", 2), ON)?.checked).toBe(false);
  });

  it("refuses a hold or an unusable mark on an unchecked space", () => {
    const state = step(start(), addPlot("A"));
    expect(refusal(state, claim("h", S("A"), "held")).code).toBe("space_unchecked");
    expect(refusal(state, claim("u", S("A"), "unusable", { reason: "Root" })).code).toBe("space_unchecked");
  });

  it("refuses a second burial in an occupied space and names the first", () => {
    const state = step(withPlot("A"), claim("b1", S("A"), "taken", { sourceRef: "book 1 p4" }));
    const error = refusal(state, claim("b2", S("A"), "taken", { sourceRef: "book 2 p9" }));
    expect(error.code).toBe("space_taken");
    expect(error.detail).toMatchObject({ claimId: "b1", sourceRef: "book 1 p4" });
  });

  it("refuses two burials in one space whatever their dates", () => {
    const state = step(withPlot("A"), claim("old", S("A"), "taken", { start: "1874-03-03" }));
    expect(refusal(state, claim("new", S("A"), "taken", { start: "1900-01-01" })).code).toBe("space_taken");
    expect(refusal(state, claim("unknown", S("A"), "taken")).code).toBe("space_taken");
  });

  it("lets a second burial use the other space of the plot", () => {
    const state = step(withPlot("Y07", 2), claim("b1", S("Y07", 1), "taken"));
    const next = step(state, claim("b2", S("Y07", 2), "taken"));
    expect(spaceStateAt(next, S("Y07", 2), ON)?.state).toBe("taken");
  });

  it("refuses a second hold in an overlapping span", () => {
    const state = step(withPlot("A"), claim("h1", S("A"), "held", { start: "2026-03-01" }));
    expect(refusal(state, claim("h2", S("A"), "held", { start: "2026-04-01" })).code).toBe("claim_overlap");
  });

  it("dry runs the whole timeline: a backdated hold that runs into a later claim is refused", () => {
    const state = step(
      withPlot("A"),
      claim("later", S("A"), "held", { start: "2026-03-01", endExclusive: "2026-04-01", sourceRef: "offer 7" }),
    );
    const error = refusal(state, claim("back", S("A"), "held", { start: "2026-02-15", endExclusive: "2026-03-05" }));
    expect(error.code).toBe("claim_overlap");
    expect(error.detail).toMatchObject({ claimId: "later", sourceRef: "offer 7", start: "2026-03-01", endExclusive: "2026-04-01" });
  });

  it("accepts claims that meet on a day (half open)", () => {
    const state = step(
      withPlot("A"),
      claim("a", S("A"), "held", { start: "2026-03-01", endExclusive: "2026-04-01" }),
    );
    expect(decide(state, claim("b", S("A"), "held", { start: "2026-04-01" })).ok).toBe(true);
    expect(decide(state, claim("c", S("A"), "held", { start: "2026-02-01", endExclusive: "2026-03-01" })).ok).toBe(true);
  });

  it("ignores a voided claim when it checks the timeline", () => {
    let state = step(withPlot("A"), claim("b1", S("A"), "taken", { start: "2026-01-01" }));
    state = step(state, { type: "void_claim", claimId: "b1", correctsEventId: fid("event:1"), reason: "Wrong plot" });
    expect(decide(state, claim("b2", S("A"), "taken", { start: "2026-02-01" })).ok).toBe(true);
  });

  it("refuses a burial on a space that is held unless it converts the hold", () => {
    const state = step(withPlot("A"), claim("h", S("A"), "held", { start: "2026-03-01", sourceRef: "hold 1" }));
    const error = refusal(state, claim("b", S("A"), "taken", { start: "2026-04-10" }));
    expect(error.code).toBe("claim_overlap");
    expect(error.detail?.claimId).toBe("h");
  });

  it("converting a hold ends it on the burial day, in one batch", () => {
    const state = step(withPlot("A"), claim("h", S("A"), "held", { start: "2026-03-01" }));
    const drafts = must(state, claim("b", S("A"), "taken", { start: "2026-04-10", converts: "h" }));
    expect(drafts.map((d) => d.event.type)).toEqual(["claim_ended", "claim_added"]);
    const next = drafts.reduce((s, d) => applyCore(s, d.event), state);
    expect(spaceStateAt(next, S("A"), "2026-04-09")?.state).toBe("reserved");
    expect(spaceStateAt(next, S("A"), "2026-04-10")?.state).toBe("taken");
  });

  it("refuses a bad conversion", () => {
    const state = step(
      step(withPlot("A"), claim("h", S("A"), "held", { start: "2026-03-01" })),
      claim("u", S("A"), "unusable", { start: "2025-01-01", endExclusive: "2025-02-01", reason: "Root" }),
    );
    const other = step(withPlot("B"), claim("hb", S("B"), "held", { start: "2026-03-01" }));
    const both = { ...state, plots: { ...state.plots, ...other.plots }, claims: { ...state.claims, ...other.claims } };
    expect(refusal(both, claim("b", S("A"), "taken", { start: "2026-04-10", converts: "hb" })).code).toBe("bad_conversion");
    expect(refusal(both, claim("b", S("A"), "taken", { start: "2026-04-10", converts: "u" })).code).toBe("bad_conversion");
    expect(refusal(both, claim("b", S("A"), "taken", { start: "2026-04-10", converts: "nope" })).code).toBe("bad_conversion");
    expect(refusal(both, claim("b", S("A"), "taken", { converts: "h" })).code).toBe("start_required");
    expect(refusal(both, claim("b", S("A"), "held", { start: "2026-04-10", converts: "h" })).code).toBe("bad_conversion");
  });

  it("refuses an unusable mark without a reason, and a burial on unusable ground", () => {
    const state = withPlot("A");
    expect(refusal(state, claim("u", S("A"), "unusable")).code).toBe("invalid_input");
    const marked = step(state, claim("u", S("A"), "unusable", { start: "2026-01-01", reason: "Tree root" }));
    expect(refusal(marked, claim("b", S("A"), "taken", { start: "2026-02-01" })).code).toBe("claim_overlap");
  });

  it("refuses a repeated claim ID, an unknown space and a retired space", () => {
    const state = step(withPlot("A", 2), claim("b1", S("A", 1), "taken"));
    expect(refusal(state, claim("b1", S("A", 2), "taken")).code).toBe("duplicate_id");
    expect(refusal(state, claim("x", fid("nope"), "taken")).code).toBe("no_such_space");
    const retired = step(state, { type: "retire_space", plotId: P("A"), spaceId: S("A", 2) });
    expect(refusal(retired, claim("y", S("A", 2), "taken")).code).toBe("space_retired");
  });

  it("names each bad field in one answer", () => {
    const state = withPlot("A");
    const error = refusal(
      state,
      claim("b", S("A"), "taken", { start: "2026-02-30", endExclusive: "nonsense", sourceRef: "r".repeat(101) }),
    );
    expect(error.code).toBe("invalid_input");
    expect(error.fields).toEqual(
      expect.arrayContaining([
        { field: "start", code: "invalid_date" },
        { field: "endExclusive", code: "invalid_date" },
        { field: "sourceRef", code: "over_limit" },
      ]),
    );
  });

  it("refuses an interval that ends before it starts", () => {
    const state = withPlot("A");
    const error = refusal(state, claim("h", S("A"), "held", { start: "2026-04-10", endExclusive: "2026-04-10" }));
    expect(error.fields).toContainEqual({ field: "endExclusive", code: "bad_interval" });
  });

  it("validateCore returns the same field errors without any state rule", () => {
    const fields = validateCore(claim("b", S("A"), "taken", { start: "bad" }), start());
    expect(fields).toEqual([{ field: "start", code: "invalid_date" }]);
  });

  it("refuses a bad effective date", () => {
    expect(refusal(start(), addPlot("A"), "2026-02-30").code).toBe("invalid_date");
  });
});

describe("T12 ending claims and returning to use", () => {
  it("ends a tenancy on the effective date and frees the space from that day", () => {
    let state = step(withPlot("B"), claim("t", S("B"), "taken", { start: "2025-04-01", endable: true }));
    state = step(state, { type: "end_claim", claimId: "t", reason: "Gave up plot" }, "2026-05-01");
    expect(spaceStateAt(state, S("B"), "2026-04-30")?.state).toBe("taken");
    expect(spaceStateAt(state, S("B"), "2026-05-01")?.state).toBe("free");
  });

  it("ends a hold with a reason (release or decline)", () => {
    let state = step(withPlot("B"), claim("h", S("B"), "held", { start: "2026-04-04" }));
    state = step(state, { type: "end_claim", claimId: "h", reason: "Declined" }, "2026-04-12");
    expect(spaceStateAt(state, S("B"), "2026-04-12")?.state).toBe("free");
    expect(spaceStateAt(state, S("B"), "2026-04-11")?.state).toBe("reserved");
  });

  it("refuses to clear a burial and names the route Correct an entry", () => {
    const state = step(withPlot("A"), claim("b", S("A"), "taken", { sourceRef: "book 1" }));
    const error = refusal(state, { type: "end_claim", claimId: "b", reason: "Mark free" });
    expect(error.code).toBe("taken_needs_correction");
    expect(error.route).toBe("correct_entry");
    expect(spaceStateAt(state, S("A"), ON)?.state).toBe("taken");
  });

  it("requires a reason", () => {
    const state = step(withPlot("B"), claim("t", S("B"), "held", { start: "2026-04-04" }));
    const error = refusal(state, { type: "end_claim", claimId: "t", reason: "  " });
    expect(error.code).toBe("invalid_input");
    expect(error.fields).toContainEqual({ field: "reason", code: "required" });
  });

  it("refuses an unknown or voided claim", () => {
    expect(refusal(start(), { type: "end_claim", claimId: "nope", reason: "x" }).code).toBe("no_such_claim");
  });

  it("refuses to end a claim that already ended, or on or before its start", () => {
    const state = step(
      withPlot("B"),
      claim("t", S("B"), "held", { start: "2026-04-04", endExclusive: "2026-04-10" }),
    );
    expect(refusal(state, { type: "end_claim", claimId: "t", reason: "x" }, "2026-04-12").code).toBe("already_ended");
    expect(refusal(state, { type: "end_claim", claimId: "t", reason: "x" }, "2026-04-04").code).toBe("bad_interval");
    expect(decide(state, { type: "end_claim", claimId: "t", reason: "x" }, "2026-04-08").ok).toBe(true);
  });

  it("sends an unusable mark to Return to use", () => {
    const state = step(withPlot("B"), claim("u", S("B"), "unusable", { start: "2026-01-01", reason: "Root" }));
    const error = refusal(state, { type: "end_claim", claimId: "u", reason: "x" });
    expect(error.code).toBe("wrong_command");
    expect(error.route).toBe("return_to_use");
  });

  it("returns an unusable space to use on a date", () => {
    let state = step(withPlot("B"), claim("u", S("B"), "unusable", { start: "2026-01-01", reason: "Root" }));
    state = step(state, { type: "return_to_use", claimId: "u" }, "2026-06-01");
    expect(spaceStateAt(state, S("B"), "2026-05-31")?.state).toBe("unusable");
    expect(spaceStateAt(state, S("B"), "2026-06-01")?.state).toBe("free");
  });

  it("refuses Return to use on a claim that is not unusable", () => {
    const state = step(withPlot("B"), claim("h", S("B"), "held", { start: "2026-04-04" }));
    expect(refusal(state, { type: "return_to_use", claimId: "h" }).code).toBe("wrong_command");
  });
});

describe("T12 correcting a claim", () => {
  it("voids a burial with a correction that names the original event and a reason", () => {
    const state = step(withPlot("A"), claim("b", S("A"), "taken", { sourceRef: "book 1" }));
    const drafts = must(state, { type: "void_claim", claimId: "b", correctsEventId: fid("event:9"), reason: "Wrong plot" });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.corrects).toBe(fid("event:9"));
    expect(drafts[0]!.event).toEqual({ type: "claim_voided", claimId: "b", reason: "Wrong plot" });
    const next = drafts.reduce((s, d) => applyCore(s, d.event), state);
    expect(spaceStateAt(next, S("A"), ON)).toEqual({ checked: true, retired: false, state: "free" });
  });

  it("refuses a void without a reason or without naming the event", () => {
    const state = step(withPlot("A"), claim("b", S("A"), "taken"));
    const noReason = refusal(state, { type: "void_claim", claimId: "b", correctsEventId: fid("e"), reason: "" });
    expect(noReason.fields).toContainEqual({ field: "reason", code: "required" });
    const noEvent = refusal(state, { type: "void_claim", claimId: "b", correctsEventId: "", reason: "x" });
    expect(noEvent.fields).toContainEqual({ field: "correctsEventId", code: "required" });
  });

  it("refuses to void twice or to void an unknown claim", () => {
    let state = step(withPlot("A"), claim("b", S("A"), "taken"));
    state = step(state, { type: "void_claim", claimId: "b", correctsEventId: fid("e"), reason: "x" });
    expect(refusal(state, { type: "void_claim", claimId: "b", correctsEventId: fid("e"), reason: "x" }).code).toBe("already_voided");
    expect(refusal(state, { type: "void_claim", claimId: "zz", correctsEventId: fid("e"), reason: "x" }).code).toBe("no_such_claim");
  });
});

describe("T12 retiring a space", () => {
  it("retires a checked space with no history", () => {
    const state = withPlot("A", 2);
    const next = step(state, { type: "retire_space", plotId: P("A"), spaceId: S("A", 2) });
    expect(next.plots[P("A")]!.spaces[1]!.retired).toBe(true);
  });

  it("refuses a space with any history, even a voided claim", () => {
    let state = step(withPlot("A", 2), claim("b", S("A", 2), "taken"));
    state = step(state, { type: "void_claim", claimId: "b", correctsEventId: fid("e"), reason: "x" });
    expect(refusal(state, { type: "retire_space", plotId: P("A"), spaceId: S("A", 2) }).code).toBe("space_has_history");
  });

  it("refuses an unknown plot, an unchecked space and the last space", () => {
    expect(refusal(start(), { type: "retire_space", plotId: fid("nope"), spaceId: fid("s") }).code).toBe("no_such_plot");
    const unchecked = step(start(), addPlot("A", 2));
    expect(refusal(unchecked, { type: "retire_space", plotId: P("A"), spaceId: S("A", 2) }).code).toBe("space_unchecked");
    const single = withPlot("B", 1);
    expect(refusal(single, { type: "retire_space", plotId: P("B"), spaceId: S("B") }).code).toBe("last_space");
  });
});

describe("T12 purity", () => {
  it("never changes the state it is given", () => {
    const state = deepFreeze(withPlot("A", 2));
    expect(() => decide(state, claim("b", S("A", 1), "taken"))).not.toThrow();
    expect(() => decide(state, { type: "rename_plot", plotId: P("A"), code: "Z" })).not.toThrow();
  });

  it("gives the same answer for the same input", () => {
    const state = withPlot("A", 2);
    const command = claim("b", S("A", 1), "taken", { start: "2026-01-01", sourceRef: "r" });
    expect(decide(state, command)).toEqual(decide(state, command));
  });

  it("refuses a command type it does not know", () => {
    const error = refusal(start(), { type: "make_tea" } as unknown as CoreCommand);
    expect(error.code).toBe("unknown_command");
  });
});
