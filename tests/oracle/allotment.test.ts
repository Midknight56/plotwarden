// Oracle comparison for the garden rules (spec 04, task 4.13): queue order, fees and tenure at a date.
// This drives the real commands of the Allotment Register, not the template functions alone, and compares each
// result with scripts/oracle.py, which is written from the worked examples with the Python standard library only.
// 1,000 generated cases for each kind, from recorded seeds.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { chargeSummary } from "../../apps/allotment-register/src/fees";
import { allotRegister } from "../../apps/allotment-register/src/adapter";
import { emptyAllot, nextApplicant, queueView, tenanciesCovering } from "../../apps/allotment-register/src/rules";
import type { AllotCommand, AllotState } from "../../apps/allotment-register/src/types";
import { RUNS, SEEDS } from "../properties/seeds";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts", "oracle.py");
const register = allotRegister();

type Case = { id: string; kind: string; [key: string]: unknown };
type Reply = { id: string; value?: unknown; error?: string };

function findPython(): string[] {
  for (const candidate of [["python"], ["py", "-3"], ["python3"]]) {
    const probe = spawnSync(candidate[0] as string, [...candidate.slice(1), "--version"], { encoding: "utf8" });
    if (probe.status === 0) return candidate;
  }
  throw new Error("Python 3 was not found on this machine");
}

let python: string[] = [];
beforeAll(() => {
  python = findPython();
});

function runOracle(cases: Case[]): Map<string, Reply> {
  const run = spawnSync(python[0] as string, [...python.slice(1), SCRIPT], { input: JSON.stringify({ cases }), encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`oracle exited ${run.status}: ${run.stderr}`);
  return new Map((JSON.parse(run.stdout) as { results: Reply[] }).results.map((r) => [r.id, r]));
}

function value(replies: Map<string, Reply>, id: string): unknown {
  const reply = replies.get(id);
  if (reply === undefined) throw new Error(`The oracle gave no answer for ${id}`);
  if (reply.error !== undefined) throw new Error(`The oracle refused ${id}: ${reply.error}`);
  return reply.value;
}

/** Decide a command on a state and apply every event. Returns undefined when the register refuses it. */
function step(state: AllotState, command: AllotCommand, on: string): AllotState | undefined {
  const decided = register.run(state, command, on);
  if (!decided.ok) return undefined;
  return decided.value.reduce((s, d) => register.adapter.apply(s, d.event), state);
}

function must(state: AllotState, command: AllotCommand, on: string): AllotState {
  const next = step(state, command, on);
  if (next === undefined) throw new Error(`The register refused ${command.type} in the test set up`);
  return next;
}

/** A date `offset` days after 2026-01-01, worked with JavaScript's own clock. */
const day = (offset: number): string => new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
const dayArb = fc.integer({ min: 0, max: 60 }).map(day);

/** One site with `plots` plots, all checked and free. */
function withPlots(plots: number): AllotState {
  let state = emptyAllot("site-oracle", "GBP");
  state = must(
    state,
    {
      type: "layout_apply",
      sections: [{ sectionId: "sec", name: "Row" }],
      plots: Array.from({ length: plots }, (_, i) => ({ plotId: `pl${i}`, code: `P${String(i + 1).padStart(2, "0")}`, sectionId: "sec", spaces: [{ spaceId: `sp${i}` }] })),
    },
    "2026-01-01",
  );
  return must(state, { type: "confirm_empty", spaceIds: Array.from({ length: plots }, (_, i) => `sp${i}`) }, "2026-01-01");
}

describe("queue order against the oracle (A1)", () => {
  const base = withPlots(7);
  const entryArb = fc.record({ joinedOn: fc.integer({ min: 0, max: 4 }).map(day), pending: fc.boolean() });
  const caseArb = fc
    .array(entryArb, { maxLength: 7 })
    .chain((rows) =>
      fc.shuffledSubarray(["m", "c", "x", "b", "k", "f", "q", "a", "r", "d"], { minLength: rows.length, maxLength: rows.length }).map((ids) => rows.map((row, i) => ({ applicationId: `app-${ids[i] as string}`, ...row }))),
    );

  it(`${RUNS} generated cases agree: order by joined date, then sequence, then ID, and the next applicant`, () => {
    const samples = fc.sample(caseArb, { numRuns: RUNS, seed: SEEDS.ORACLE_ALLOT_QUEUE });
    expect(samples).toHaveLength(RUNS);
    const cases: Case[] = [];
    const actual: { order: string[]; next: string | null }[] = [];
    samples.forEach((rows, i) => {
      let state = base;
      rows.forEach((row, n) => {
        state = must(state, { type: "add_applicant", applicationId: row.applicationId, personId: `person-${n}`, name: `Person ${n}`, joinedOn: row.joinedOn }, row.joinedOn);
      });
      const everyone = Object.fromEntries(rows.map((r) => [r.applicationId, "Passed over"]));
      rows.forEach((row, n) => {
        if (row.pending) state = must(state, { type: "make_offer", offerId: `offer-${n}`, applicationId: row.applicationId, spaceId: `sp${n}`, claimId: `hold-${n}`, skipReasons: everyone }, "2026-02-01");
      });
      // The sequence of each application is the place in which it was added: 1, 2, 3 and so on.
      cases.push({ id: `q${i}`, kind: "queue_order", entries: rows.map((r, n) => ({ applicationId: r.applicationId, joinedOn: r.joinedOn, sequence: n + 1, pending: r.pending })) });
      const next = nextApplicant(state);
      actual.push({ order: queueView(state).map((r) => r.applicationId), next: next === undefined ? null : next.applicationId });
    });
    const replies = runOracle(cases);
    actual.forEach((a, i) => expect(value(replies, `q${i}`), JSON.stringify(samples[i])).toEqual(a));
  });
});

describe("fees against the oracle (A4)", () => {
  type Step = { op: "receive"; amount: number } | { op: "reverse"; receipt: number };
  const stepArb: fc.Arbitrary<Step> = fc.oneof(
    fc.record({ op: fc.constant("receive" as const), amount: fc.oneof(fc.integer({ min: 1, max: 60000 }), fc.constant(100_000_000)) }),
    fc.record({ op: fc.constant("reverse" as const), receipt: fc.integer({ min: 0, max: 4 }) }),
  );
  const wide = fc.record({ charge: fc.integer({ min: 0, max: 100000 }), steps: fc.array(stepArb, { maxLength: 8 }), dueOn: fc.option(dayArb, { nil: undefined }), asOf: dayArb });
  // Round amounts, so a charge is often paid off exactly and reversals matter.
  const round = fc.record({
    charge: fc.integer({ min: 1, max: 6 }).map((n) => n * 1000),
    steps: fc.array(
      fc.oneof(
        fc.record({ op: fc.constant("receive" as const), amount: fc.integer({ min: 1, max: 3 }).map((n) => n * 1000) }),
        fc.record({ op: fc.constant("reverse" as const), receipt: fc.integer({ min: 0, max: 3 }) }),
      ),
      { maxLength: 8 },
    ),
    dueOn: fc.option(dayArb, { nil: undefined }),
    asOf: dayArb,
  });
  const caseArb = fc.oneof(wide, round);

  const tenanted = ((): AllotState => {
    const state = withPlots(1);
    return must(state, { type: "record_tenancy", tenancyId: "ten", claimId: "claim-ten", personId: "holder", holderName: "Marlo Fennick", spaceId: "sp0", start: "2020-01-01" }, "2026-01-01");
  })();

  it(`${RUNS} generated cases agree: balance, status and which steps are refused`, () => {
    const samples = fc.sample(caseArb, { numRuns: RUNS, seed: SEEDS.ORACLE_ALLOT_FEE });
    expect(samples).toHaveLength(RUNS);
    const cases: Case[] = [];
    const actual: { balance: number; status: string; refused: number[] }[] = [];
    samples.forEach((c, i) => {
      let state = must(tenanted, { type: "new_season", seasonId: "season", name: "Season", start: "2026-01-01", endExclusive: "2027-01-01", ...(c.dueOn === undefined ? {} : { dueOn: c.dueOn }), standardFee: 1000 }, "2026-01-01");
      state = must(state, { type: "apply_charges", seasonId: "season", items: [{ chargeId: "charge", tenancyId: "ten", ...(c.charge === 0 ? { waiveReason: "Waived" } : { amount: c.charge }) }] }, "2026-01-01");
      const accepted: string[] = [];
      const refused: number[] = [];
      c.steps.forEach((s, n) => {
        if (s.op === "receive") {
          const id = `receipt-${n}`;
          const next = step(state, { type: "record_receipt", receiptId: id, chargeId: "charge", amount: s.amount }, "2026-01-01");
          if (next === undefined) refused.push(n);
          else {
            state = next;
            accepted.push(id);
          }
        } else {
          const target = accepted[s.receipt];
          const next = target === undefined ? undefined : step(state, { type: "reverse_entry", reversalId: `rev-${n}`, entryId: target, reason: "Test" }, "2026-01-01");
          if (next === undefined) refused.push(n);
          else state = next;
        }
      });
      const summary = chargeSummary(state, "charge", c.asOf);
      actual.push({ balance: summary?.balance ?? -1, status: summary?.status ?? "none", refused });
      cases.push({ id: `f${i}`, kind: "fee", charge: c.charge, steps: c.steps, ...(c.dueOn === undefined ? {} : { dueOn: c.dueOn }), asOf: c.asOf });
    });
    const replies = runOracle(cases);
    actual.forEach((a, i) => expect(value(replies, `f${i}`), JSON.stringify(samples[i])).toEqual(a));
  });
});

describe("tenure at a date against the oracle (A3)", () => {
  const spanArb = fc.integer({ min: 0, max: 40 }).chain((start) =>
    fc.option(fc.integer({ min: start + 1, max: 60 }), { nil: undefined }).map((end) => ({ start: day(start), ...(end === undefined ? {} : { endExclusive: day(end) }) })),
  );
  const caseArb = fc.record({ spans: fc.array(spanArb, { maxLength: 5 }), date: dayArb });
  const base = withPlots(1);

  it(`${RUNS} generated cases agree: who covers the date, and that every refusal was an overlap and every acceptance was not`, () => {
    const samples = fc.sample(caseArb, { numRuns: RUNS, seed: SEEDS.ORACLE_ALLOT_TENURE });
    expect(samples).toHaveLength(RUNS);
    const cases: Case[] = [];
    const checks: { id: string; covering: string[]; accepted: boolean; case: number }[] = [];
    samples.forEach((c, i) => {
      let state = base;
      const acceptedSpans: { id: string; start: string; endExclusive?: string }[] = [];
      c.spans.forEach((span, n) => {
        const id = `t${n}`;
        const next = step(state, { type: "record_tenancy", tenancyId: id, claimId: `claim-${n}`, personId: `holder-${n}`, holderName: `Holder ${n}`, spaceId: "sp0", start: span.start, ...(span.endExclusive === undefined ? {} : { endExclusive: span.endExclusive }) }, "2026-01-01");
        // Would the oracle see an overlap between this span and the ones accepted before it?
        cases.push({ id: `t${i}-${n}`, kind: "tenure", tenancies: [...acceptedSpans, { id, ...span }], date: c.date });
        checks.push({ id: `t${i}-${n}`, covering: [], accepted: next !== undefined, case: n });
        if (next !== undefined) {
          state = next;
          acceptedSpans.push({ id, ...span });
        }
      });
      cases.push({ id: `t${i}-all`, kind: "tenure", tenancies: acceptedSpans, date: c.date });
      checks.push({ id: `t${i}-all`, covering: tenanciesCovering(state, "pl0", c.date).map((t) => t.tenancyId), accepted: true, case: -1 });
    });
    const replies = runOracle(cases);
    for (const check of checks) {
      const answer = value(replies, check.id) as { covering: string[]; overlaps: string[][] };
      if (check.case === -1) {
        expect(answer.overlaps, check.id).toEqual([]);
        expect([...answer.covering].sort(), check.id).toEqual([...check.covering].sort());
      } else {
        const newest = `t${check.case}`;
        const involvesNew = answer.overlaps.some((pair) => pair.includes(newest));
        // Accepted exactly when the oracle sees no overlap with a tenancy accepted before it.
        expect(involvesNew, check.id).toBe(!check.accepted);
      }
    }
  });
});
