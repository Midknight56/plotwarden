// Oracle comparison for fees, queue order and tenure at a date.
// scripts/oracle.py is written from the worked examples in
// tests/fixtures/expected/hand-totals.md, with the Python standard library only.
// Part A checks the oracle against values worked by hand. Part B checks the
// TypeScript against the oracle on 1,000 generated cases per kind.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { intervalCovers, intervalsOverlap } from "../../template/src/calendar";
import { balanceOf, feeStatusAt, newLedger, receive, reverseReceipt, type ChargeLedger } from "../../template/src/money";
import { nextEligible, orderQueue } from "../../template/src/queue";
import { RUNS, SEEDS } from "../properties/seeds";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts", "oracle.py");

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
  const run = spawnSync(python[0] as string, [...python.slice(1), SCRIPT], {
    input: JSON.stringify({ cases }),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error(`oracle exited ${run.status}: ${run.stderr}`);
  const parsed = JSON.parse(run.stdout) as { results: Reply[] };
  return new Map(parsed.results.map((r) => [r.id, r]));
}

function value(replies: Map<string, Reply>, id: string): unknown {
  const reply = replies.get(id);
  if (reply === undefined) throw new Error(`The oracle gave no answer for ${id}`);
  if (reply.error !== undefined) throw new Error(`The oracle refused ${id}: ${reply.error}`);
  return reply.value;
}

describe("oracle protocol", () => {
  it("uses only the Python standard library", () => {
    const source = readFileSync(SCRIPT, "utf8");
    const modules = [...source.matchAll(/^(?:import|from)\s+([A-Za-z_][\w]*)/gm)].map((m) => m[1] as string);
    expect(modules.length).toBeGreaterThan(0);
    const stdlib = new Set(["json", "sys", "datetime"]);
    for (const name of modules) expect(stdlib.has(name), name).toBe(true);
  });

  it("answers each case by its id and says so for an unknown kind", () => {
    const replies = runOracle([
      { id: "a", kind: "queue_order", entries: [] },
      { id: "b", kind: "no_such_kind" },
    ]);
    expect(replies.get("a")).toEqual({ id: "a", value: { order: [], next: null } });
    expect(replies.get("b")).toEqual({ id: "b", error: "unknown_kind" });
  });

  it("exits 2 on input that is not JSON", () => {
    const run = spawnSync(python[0] as string, [...python.slice(1), SCRIPT], { input: "not json", encoding: "utf8" });
    expect(run.status).toBe(2);
  });
});

describe("part A: the oracle against values worked by hand", () => {
  // Thimble Beds hand totals 2.1. Tavi's ID sorts after Olin's, so only the sequence puts Tavi first.
  const TAVI = { applicationId: "f-tavi", joinedOn: "2026-01-10", sequence: 7 };
  const OLIN = { applicationId: "a-olin", joinedOn: "2026-01-10", sequence: 8 };

  const cases: Case[] = [
    { id: "queue-start", kind: "queue_order", entries: [OLIN, TAVI] },
    { id: "queue-offer", kind: "queue_order", entries: [OLIN, { ...TAVI, pending: true }] },
    // 2.3 season fees: GBP 36.00 in pence.
    { id: "fee-assessed", kind: "fee", charge: 3600, steps: [], dueOn: "2026-06-30", asOf: "2026-04-10" },
    { id: "fee-part", kind: "fee", charge: 3600, steps: [{ op: "receive", amount: 1200 }], dueOn: "2026-06-30", asOf: "2026-05-02" },
    {
      id: "fee-paid",
      kind: "fee",
      charge: 3600,
      steps: [{ op: "receive", amount: 1200 }, { op: "receive", amount: 2400 }],
      dueOn: "2026-06-30",
      asOf: "2026-06-01",
    },
    {
      id: "fee-overpay",
      kind: "fee",
      charge: 3600,
      steps: [{ op: "receive", amount: 1200 }, { op: "receive", amount: 2401 }],
      dueOn: "2026-06-30",
      asOf: "2026-06-01",
    },
    {
      id: "fee-reverse",
      kind: "fee",
      charge: 3600,
      steps: [{ op: "receive", amount: 1200 }, { op: "receive", amount: 2400 }, { op: "reverse", receipt: 0 }],
      dueOn: "2026-06-30",
      asOf: "2026-06-15",
    },
    {
      id: "fee-reenter",
      kind: "fee",
      charge: 3600,
      steps: [
        { op: "receive", amount: 1200 },
        { op: "receive", amount: 2400 },
        { op: "reverse", receipt: 0 },
        { op: "receive", amount: 1200 },
      ],
      dueOn: "2026-06-30",
      asOf: "2026-06-15",
    },
    // 2.4 the older charge on B02: GBP 30.00 due 2025-06-30.
    { id: "b02-due", kind: "fee", charge: 3000, steps: [], dueOn: "2025-06-30", asOf: "2025-06-30" },
    { id: "b02-overdue", kind: "fee", charge: 3000, steps: [], dueOn: "2025-06-30", asOf: "2025-07-01" },
    { id: "b02-review", kind: "fee", charge: 3000, steps: [], dueOn: "2025-06-30", asOf: "2026-04-20" },
    // 2.5 the B02 handover on 2026-05-01.
    {
      id: "handover-before",
      kind: "tenure",
      tenancies: [
        { id: "old", start: "2025-04-01", endExclusive: "2026-05-01" },
        { id: "new", start: "2026-05-01" },
      ],
      date: "2026-04-30",
    },
    {
      id: "handover-day",
      kind: "tenure",
      tenancies: [
        { id: "old", start: "2025-04-01", endExclusive: "2026-05-01" },
        { id: "new", start: "2026-05-01" },
      ],
      date: "2026-05-01",
    },
    {
      id: "overlap",
      kind: "tenure",
      tenancies: [
        { id: "a", start: "2026-04-01", endExclusive: "2026-05-02" },
        { id: "b", start: "2026-05-01" },
      ],
      date: "2026-05-01",
    },
    { id: "gap", kind: "tenure", tenancies: [{ id: "old", start: "2025-04-01", endExclusive: "2026-05-01" }], date: "2026-05-01" },
  ];

  const expected: Record<string, unknown> = {
    "queue-start": { order: ["f-tavi", "a-olin"], next: "f-tavi" },
    "queue-offer": { order: ["f-tavi", "a-olin"], next: "a-olin" },
    "fee-assessed": { balance: 3600, status: "due", refused: [] },
    "fee-part": { balance: 2400, status: "part_paid", refused: [] },
    "fee-paid": { balance: 0, status: "paid", refused: [] },
    "fee-overpay": { balance: 2400, status: "part_paid", refused: [1] },
    "fee-reverse": { balance: 1200, status: "part_paid", refused: [] },
    "fee-reenter": { balance: 0, status: "paid", refused: [] },
    "b02-due": { balance: 3000, status: "due", refused: [] },
    "b02-overdue": { balance: 3000, status: "overdue", refused: [] },
    "b02-review": { balance: 3000, status: "overdue", refused: [] },
    "handover-before": { covering: ["old"], overlaps: [] },
    "handover-day": { covering: ["new"], overlaps: [] },
    overlap: { covering: ["a", "b"], overlaps: [["a", "b"]] },
    gap: { covering: [], overlaps: [] },
  };

  let replies = new Map<string, Reply>();
  beforeAll(() => {
    replies = runOracle(cases);
  });

  it.each(Object.keys(expected))("%s", (id) => {
    expect(value(replies, id)).toEqual(expected[id]);
  });
});

/** A date `offset` days after 2026-01-01, worked with JavaScript's own clock. */
function day(offset: number): string {
  return new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
}

const dayArb = fc.integer({ min: 0, max: 60 }).map(day);

const entryArb = fc.record({
  joinedOn: fc.integer({ min: 0, max: 4 }).map(day),
  sequence: fc.integer({ min: 1, max: 4 }),
  pending: fc.boolean(),
});

const queueCaseArb = fc
  .array(entryArb, { maxLength: 8 })
  .chain((rows) =>
    fc.shuffledSubarray(["m", "c", "x", "b", "k", "f", "q", "a", "r", "d"], { minLength: rows.length, maxLength: rows.length }).map((ids) =>
      rows.map((row, i) => ({ applicationId: ids[i] as string, ...row })),
    ),
  );

const stepArb = fc.oneof(
  fc.record({ op: fc.constant("receive" as const), amount: fc.oneof(fc.integer({ min: 1, max: 60000 }), fc.constant(100_000_000)) }),
  fc.record({ op: fc.constant("reverse" as const), receipt: fc.integer({ min: 0, max: 4 }) }),
);

const wideFeeCaseArb = fc.record({
  charge: fc.integer({ min: 0, max: 100000 }),
  steps: fc.array(stepArb, { maxLength: 8 }),
  dueOn: fc.option(dayArb, { nil: undefined }),
  asOf: dayArb,
});

// Round amounts, so a charge is often paid off exactly and reversals matter.
const roundFeeCaseArb = fc.record({
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

const feeCaseArb = fc.oneof(wideFeeCaseArb, roundFeeCaseArb);

const tenancyArb = fc.record({
  start: fc.option(dayArb, { nil: undefined }),
  endExclusive: fc.option(dayArb, { nil: undefined }),
});

const tenureCaseArb = fc.record({
  tenancies: fc.array(tenancyArb, { maxLength: 5 }),
  date: dayArb,
});

type FeeCase = { charge: number; steps: ({ op: "receive"; amount: number } | { op: "reverse"; receipt: number })[]; dueOn?: string | undefined; asOf: string };

/** The TypeScript answer for a fee case, shaped like the oracle's. */
function tsFee(c: FeeCase) {
  const made = newLedger(c.charge);
  if (!made.ok) throw new Error("charge out of range in a generated case");
  let ledger: ChargeLedger = made.value;
  const refused: number[] = [];
  c.steps.forEach((step, index) => {
    if (step.op === "receive") {
      const result = receive(ledger, step.amount);
      if (result.ok) ledger = result.value;
      else refused.push(index);
    } else {
      const result = reverseReceipt(ledger, step.receipt);
      if (result.ok) ledger = result.value;
      else refused.push(index);
    }
  });
  return { balance: balanceOf(ledger), status: feeStatusAt(ledger, c.dueOn, c.asOf), refused };
}

function clean<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
}

describe("part B: the TypeScript against the oracle", () => {
  it(`queue order: ${RUNS} generated cases agree`, () => {
    const samples = fc.sample(queueCaseArb, { numRuns: RUNS, seed: SEEDS.ORACLE_QUEUE });
    expect(samples).toHaveLength(RUNS);
    const cases: Case[] = samples.map((entries, i) => ({ id: `q${i}`, kind: "queue_order", entries }));
    const replies = runOracle(cases);
    samples.forEach((entries, i) => {
      const order = orderQueue(entries);
      const next = nextEligible(entries);
      expect(value(replies, `q${i}`), JSON.stringify(entries)).toEqual({
        order: order.map((e) => e.applicationId),
        next: next === undefined ? null : next.applicationId,
      });
    });
  });

  it(`fees: ${RUNS} generated cases agree`, () => {
    const samples = fc.sample(feeCaseArb, { numRuns: RUNS, seed: SEEDS.ORACLE_FEE });
    expect(samples).toHaveLength(RUNS);
    const cases: Case[] = samples.map((c, i) => ({ id: `f${i}`, kind: "fee", ...clean(c) }));
    const replies = runOracle(cases);
    samples.forEach((c, i) => {
      expect(value(replies, `f${i}`), JSON.stringify(c)).toEqual(tsFee(c as FeeCase));
    });
  });

  it(`tenure at a date: ${RUNS} generated cases agree`, () => {
    const samples = fc.sample(tenureCaseArb, { numRuns: RUNS, seed: SEEDS.ORACLE_TENURE });
    expect(samples).toHaveLength(RUNS);
    const cases: Case[] = samples.map((c, i) => ({
      id: `t${i}`,
      kind: "tenure",
      date: c.date,
      tenancies: c.tenancies.map((t, n) => ({ id: `t${n}`, ...clean(t) })),
    }));
    const replies = runOracle(cases);
    samples.forEach((c, i) => {
      const spans = c.tenancies.map((t, n) => ({ id: `t${n}`, span: clean(t) as { start?: string; endExclusive?: string } }));
      const covering = spans.filter((s) => intervalCovers(s.span, c.date)).map((s) => s.id);
      const overlaps: string[][] = [];
      for (let a = 0; a < spans.length; a++) {
        for (let b = a + 1; b < spans.length; b++) {
          if (intervalsOverlap(spans[a]!.span, spans[b]!.span)) overlaps.push([spans[a]!.id, spans[b]!.id]);
        }
      }
      expect(value(replies, `t${i}`), JSON.stringify(c)).toEqual({ covering, overlaps });
    });
  });
});
