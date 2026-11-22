// Properties over random command sequences: INV_REPLAY, INV_CLAIMS_DISJOINT
// (one burial or tenancy, one hold, per space and day), INV_NO_INFERRED_VACANCY,
// INV_ID_STABLE and INV_CODE_UNIQUE. 1,000 cases, recorded seed.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { intervalsOverlap } from "../../template/src/calendar";
import { decideCore, type CoreCommand } from "../../template/src/commands";
import {
  applyCore,
  emptyCoreState,
  makeStoredEvent,
  replay,
  type CoreEvent,
  type DraftEvent,
  type StoredEvent,
} from "../../template/src/events";
import { normalizeCode } from "../../template/src/plot";
import { claimInterval, spaceStateAt } from "../../template/src/status";
import type { CoreState, Result } from "../../template/src/types";
import { runProperty } from "../helpers/property";
import { SITE_ID } from "../helpers/site";
import { RUNS, SEEDS } from "./seeds";

const CTX = { spacesPerPlot: { min: 1, max: 3 } };
const PLOTS = ["p1", "p2", "p3"];
const SPACES = ["s1", "s2", "s3", "s4"];
// One pool of claim IDs. A later command often names a claim an earlier one made.
const NEW_CLAIMS = Array.from({ length: 6 }, (_, i) => `c${i + 1}`);
const OLD_CLAIMS = NEW_CLAIMS;
const CODES = ["A", "a", "B", "b", "C", "D"];
const SAMPLE_DATES = ["2025-12-31", "2026-01-01", "2026-02-15", "2026-03-31", "2026-04-01", "2027-01-01"];

// Valid spans only, so most claims reach the overlap check instead of failing on their own dates.
const SPANS: [string | undefined, string | undefined][] = [
  [undefined, undefined],
  ["2026-01-01", undefined],
  ["2026-03-01", undefined],
  ["2026-01-01", "2026-03-01"],
  ["2026-02-01", "2026-04-01"],
  ["2026-03-01", "2026-05-01"],
  ["2026-04-01", "2026-05-01"],
  [undefined, "2026-03-01"],
];
const spanArb = fc.constantFrom(...SPANS);

const addClaimArb: fc.Arbitrary<CoreCommand> = fc
  .record({
    claimId: fc.constantFrom(...NEW_CLAIMS),
    spaceId: fc.constantFrom(...SPACES),
    mode: fc.constantFrom("taken" as const, "held" as const, "held" as const, "unusable" as const),
    span: spanArb,
    endable: fc.boolean(),
    converts: fc.constantFrom(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, ...OLD_CLAIMS),
    sourceRef: fc.constantFrom(undefined, "book 1", "book 2"),
  })
  .map(({ span, converts, sourceRef, ...rest }) => {
    const command: Extract<CoreCommand, { type: "add_claim" }> = { type: "add_claim", ...rest };
    if (span[0] !== undefined) command.start = span[0];
    if (span[1] !== undefined) command.endExclusive = span[1];
    if (rest.mode === "unusable") command.reason = "Tree root";
    if (converts !== undefined) command.converts = converts;
    if (sourceRef !== undefined) command.sourceRef = sourceRef;
    return command;
  });

// A burial that takes over the hold `h1` that the prelude puts on space s3.
const convertArb: fc.Arbitrary<CoreCommand> = fc.record({
  type: fc.constant("add_claim" as const),
  claimId: fc.constantFrom(...NEW_CLAIMS),
  spaceId: fc.constant("s3"),
  mode: fc.constant("taken" as const),
  start: fc.constantFrom("2026-02-01", "2026-03-01", "2026-04-01"),
  endable: fc.boolean(),
  converts: fc.constant("h1"),
});

const commandArb: fc.Arbitrary<CoreCommand> = fc.oneof(
  { weight: 10, arbitrary: addClaimArb },
  { weight: 2, arbitrary: convertArb },
  {
    weight: 2,
    arbitrary: fc.record({
      type: fc.constant("end_claim" as const),
      claimId: fc.constantFrom(...OLD_CLAIMS),
      reason: fc.constantFrom("", "Gave up plot", "Gave up plot", "Gave up plot"),
    }),
  },
  { weight: 1, arbitrary: fc.record({ type: fc.constant("return_to_use" as const), claimId: fc.constantFrom(...OLD_CLAIMS) }) },
  {
    weight: 2,
    arbitrary: fc.record({
      type: fc.constant("void_claim" as const),
      claimId: fc.constantFrom(...OLD_CLAIMS),
      correctsEventId: fc.constantFrom("", "e1", "e1", "e1"),
      reason: fc.constantFrom("", "Wrong plot", "Wrong plot", "Wrong plot"),
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      type: fc.constant("confirm_empty" as const),
      spaceIds: fc.array(fc.constantFrom(...SPACES), { minLength: 1, maxLength: 2 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      type: fc.constant("add_plot" as const),
      plotId: fc.constantFrom(...PLOTS),
      code: fc.constantFrom(...CODES),
      spaces: fc.array(fc.record({ spaceId: fc.constantFrom(...SPACES) }), { maxLength: 3 }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ type: fc.constant("rename_plot" as const), plotId: fc.constantFrom(...PLOTS), code: fc.constantFrom(...CODES) }) },
  { weight: 1, arbitrary: fc.record({ type: fc.constant("retire_space" as const), plotId: fc.constantFrom(...PLOTS), spaceId: fc.constantFrom(...SPACES) }) },
);

const stepArb = fc.record({ command: commandArb, on: fc.constantFrom("2026-02-15", "2026-03-15", "2026-04-15") });
const sequenceArb = fc.array(stepArb, { minLength: 8, maxLength: 30 });

// Three plots exist before the random commands, and three spaces are confirmed empty.
const PRELUDE: CoreCommand[] = [
  { type: "add_plot", plotId: "p1", code: "Y01", spaces: [{ spaceId: "s1" }] },
  { type: "add_plot", plotId: "p2", code: "Y02", spaces: [{ spaceId: "s2" }, { spaceId: "s3" }] },
  { type: "add_plot", plotId: "p3", code: "Y03", spaces: [{ spaceId: "s4" }] },
  { type: "confirm_empty", spaceIds: ["s1", "s2", "s3"] },
  { type: "add_claim", claimId: "h1", spaceId: "s3", mode: "held", start: "2026-01-01", endable: true },
];
type DecideFn = (state: CoreState, command: CoreCommand, on: string) => Result<DraftEvent<CoreEvent>[]>;
type ApplyFn = (state: CoreState, event: CoreEvent) => CoreState;

const realDecide: DecideFn = (state, command, on) => decideCore(state, command, on, CTX);

const seen = { accepted: 0, refused: 0, claims: 0, overlapRefusals: 0, voids: 0, ends: 0, conversions: 0 };
const refusalCodes: Record<string, number> = {};

interface Trace {
  states: CoreState[];
  stored: StoredEvent[];
  evidence: Set<string>;
  final: CoreState;
}

function play(steps: { command: CoreCommand; on: string }[], decide: DecideFn, apply: ApplyFn): Trace {
  let state = emptyCoreState(SITE_ID);
  const states: CoreState[] = [state];
  const stored: StoredEvent[] = [];
  const evidence = new Set<string>();
  let batch = 0;
  const all = [...PRELUDE.map((command) => ({ command, on: "2026-01-01" })), ...steps];
  for (const step of all) {
    const result = decide(state, step.command, step.on);
    if (!result.ok) {
      seen.refused += 1;
      refusalCodes[result.error.code] = (refusalCodes[result.error.code] ?? 0) + 1;
      if (result.error.code === "space_taken" || result.error.code === "claim_overlap") seen.overlapRefusals += 1;
      continue;
    }
    seen.accepted += 1;
    batch += 1;
    for (const draft of result.value) {
      const event = draft.event;
      if (event.type === "claim_added") {
        seen.claims += 1;
        if (event.claim.mode === "taken") evidence.add(event.claim.spaceId);
      }
      if (event.type === "spaces_confirmed_empty") for (const id of event.spaceIds) evidence.add(id);
      if (event.type === "claim_voided") seen.voids += 1;
      if (event.type === "claim_ended") seen.ends += 1;
      stored.push(
        makeStoredEvent(draft, {
          eventId: `e${stored.length + 1}`,
          siteId: SITE_ID,
          seq: stored.length + 1,
          opId: `op${batch}`,
          recordedAt: "2026-04-20T09:30:00.000+00:00",
        }),
      );
      state = apply(state, event);
    }
    if (result.value.some((d) => d.event.type === "claim_ended" && d.event.reason === "Converted")) seen.conversions += 1;
    states.push(state);
  }
  return { states, stored, evidence, final: state };
}

function check(trace: Trace, apply: ApplyFn): void {
  // INV_REPLAY: stored events rebuild the same state, also after a JSON round trip.
  const replayed = replay<CoreState, CoreEvent>(apply, emptyCoreState(SITE_ID), trace.stored);
  if (!replayed.ok) throw new Error(`INV_REPLAY: replay refused: ${replayed.error.code}`);
  expect(replayed.value).toEqual(trace.final);
  const reread = JSON.parse(JSON.stringify(trace.stored)) as StoredEvent[];
  const again = replay<CoreState, CoreEvent>(apply, emptyCoreState(SITE_ID), reread);
  expect(again.ok && again.value).toEqual(trace.final);

  const spaceIds = Object.values(trace.final.plots).flatMap((p) => p.spaces.map((s) => s.spaceId));

  // INV_CLAIMS_DISJOINT: no two live claims on one space share a day.
  for (const state of trace.states) {
    for (const spaceId of spaceIds) {
      const live = Object.values(state.claims).filter((c) => c.spaceId === spaceId && c.voided !== true);
      for (let a = 0; a < live.length; a++) {
        for (let b = a + 1; b < live.length; b++) {
          const overlap = intervalsOverlap(claimInterval(live[a]!), claimInterval(live[b]!));
          if (overlap) throw new Error(`INV_CLAIMS_DISJOINT: ${live[a]!.claimId} and ${live[b]!.claimId} on ${spaceId}`);
        }
      }
    }
  }

  // INV_NO_INFERRED_VACANCY: Free only for a checked space that was confirmed empty or held a burial.
  for (const spaceId of spaceIds) {
    for (const date of SAMPLE_DATES) {
      const view = spaceStateAt(trace.final, spaceId, date);
      if (view?.state === "free" && !trace.evidence.has(spaceId)) {
        throw new Error(`INV_NO_INFERRED_VACANCY: ${spaceId} is free on ${date} with no evidence`);
      }
      if (view?.checked === false && view.state !== undefined) throw new Error(`unchecked space ${spaceId} has a state`);
    }
  }

  // INV_ID_STABLE and INV_CODE_UNIQUE: IDs only accumulate, and no two codes share a normal form.
  const known = new Map<string, string[]>();
  for (const state of trace.states) {
    for (const [plotId, plot] of Object.entries(state.plots)) {
      expect(plot.plotId).toBe(plotId);
      const ids = plot.spaces.map((s) => s.spaceId);
      const before = known.get(plotId);
      if (before !== undefined) expect(ids.slice(0, before.length)).toEqual(before);
      known.set(plotId, ids);
    }
    const forms = Object.values(state.plots).flatMap((p) => [p.code, ...p.priorCodes].map(normalizeCode));
    const own = Object.values(state.plots).flatMap((p) => [normalizeCode(p.code)]);
    expect(new Set(own).size).toBe(own.length);
    const priorForms = Object.values(state.plots).flatMap((p) => p.priorCodes.map(normalizeCode));
    expect(new Set(priorForms).size).toBe(priorForms.length);
    for (const form of priorForms) expect(own).not.toContain(form);
    expect(forms.length).toBe(own.length + priorForms.length);
  }
}

describe("properties of the core commands", () => {
  it(`hold for ${RUNS} generated sequences (seed ${SEEDS.INV_CLAIMS_DISJOINT})`, () => {
    const outcome = runProperty(
      "INV_CLAIMS_DISJOINT",
      sequenceArb,
      (steps) => {
        check(play(steps, realDecide, applyCore), applyCore);
      },
      { seed: SEEDS.INV_CLAIMS_DISJOINT },
    );
    expect(outcome.cases).toBeGreaterThanOrEqual(RUNS);
  });

  it("really exercised claims, refusals, ends, voids and conversions", () => {
    // The run above filled these counters. A property that never meets its cases proves nothing.
    const note = JSON.stringify({ seen, refusalCodes });
    expect(seen.claims, note).toBeGreaterThan(500);
    expect(seen.overlapRefusals, note).toBeGreaterThan(100);
    expect(seen.ends, note).toBeGreaterThan(50);
    expect(seen.voids, note).toBeGreaterThan(50);
    expect(seen.conversions, note).toBeGreaterThan(5);
    expect(seen.refused, note).toBeGreaterThan(seen.accepted / 10);
  });
});
describe("the properties catch a deliberate defect", () => {
  const run = (decide: DecideFn, apply: ApplyFn, seed: number) =>
    runProperty("mutant", sequenceArb, (steps) => check(play(steps, decide, apply), apply), { seed });

  it("a decide that skips the overlap check breaks INV_CLAIMS_DISJOINT", () => {
    const skipOverlap: DecideFn = (state, command, on) => {
      const result = realDecide(state, command, on);
      if (result.ok || command.type !== "add_claim") return result;
      if (result.error.code !== "space_taken" && result.error.code !== "claim_overlap") return result;
      const claim: Extract<CoreEvent, { type: "claim_added" }>["claim"] = {
        claimId: command.claimId,
        spaceId: command.spaceId,
        mode: command.mode,
        endable: command.endable,
      };
      if (command.start !== undefined) claim.start = command.start;
      if (command.endExclusive !== undefined) claim.endExclusive = command.endExclusive;
      return { ok: true, value: [{ event: { type: "claim_added", claim }, entityIds: [], effectiveOn: on, payloadVersion: 1 }] };
    };
    expect(() => run(skipOverlap, applyCore, SEEDS.INV_CLAIMS_DISJOINT)).toThrow(/Property failed|INV_CLAIMS_DISJOINT/);
  });

  it("an apply that depends on hidden state breaks INV_REPLAY", () => {
    let calls = 0;
    const hidden: ApplyFn = (state, event) => {
      const next = applyCore(state, event);
      calls += 1;
      return event.type === "plot_added" ? { ...next, siteId: `${next.siteId}#${calls % 7}` } : next;
    };
    expect(() => run(realDecide, hidden, SEEDS.INV_REPLAY)).toThrow(/Property failed/);
  });

  it("an apply that marks new spaces free breaks INV_NO_INFERRED_VACANCY", () => {
    const assumeFree: ApplyFn = (state, event) => {
      const next = applyCore(state, event);
      if (event.type !== "plot_added") return next;
      const plot = next.plots[event.plotId]!;
      return { ...next, plots: { ...next.plots, [event.plotId]: { ...plot, spaces: plot.spaces.map((s) => ({ ...s, checked: true })) } } };
    };
    expect(() => run(realDecide, assumeFree, SEEDS.INV_NO_INFERRED_VACANCY)).toThrow(/Property failed/);
  });
});
