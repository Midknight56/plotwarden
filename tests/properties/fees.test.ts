// INV_BALANCE: for every charge, 0 <= balance <= charge, receipts never
// exceed the charge, refusals change nothing, and status only moves forward in time.
// 1,000 cases, recorded seed.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  balanceOf,
  feeStatusAt,
  newLedger,
  receive,
  reverseReceipt,
  type ChargeLedger,
  type FeeStatus,
} from "../../template/src/money";
import type { Result } from "../../template/src/types";
import { runProperty } from "../helpers/property";
import { RUNS, SEEDS } from "./seeds";

type Ops = {
  receive: (l: ChargeLedger, amount: number) => Result<ChargeLedger>;
  reverse: (l: ChargeLedger, index: number) => Result<ChargeLedger>;
};
const real: Ops = { receive, reverse: reverseReceipt };

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);

const stepArb = fc.oneof(
  { weight: 3, arbitrary: fc.record({ op: fc.constant("receive" as const), amount: fc.integer({ min: -5, max: 2500 }) }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant("reverse" as const), index: fc.integer({ min: -1, max: 5 }) }) },
);

const wideCaseArb = fc.record({
  charge: fc.integer({ min: 0, max: 5000 }),
  steps: fc.array(stepArb, { minLength: 1, maxLength: 12 }),
  dueOn: fc.option(fc.integer({ min: 0, max: 30 }).map(day), { nil: undefined }),
});

// Round amounts, so a charge is often paid off exactly and then reversed.
const roundCaseArb = fc.record({
  charge: fc.integer({ min: 1, max: 6 }).map((n) => n * 500),
  steps: fc.array(
    fc.oneof(
      { weight: 3, arbitrary: fc.record({ op: fc.constant("receive" as const), amount: fc.integer({ min: 1, max: 3 }).map((n) => n * 500) }) },
      { weight: 1, arbitrary: fc.record({ op: fc.constant("reverse" as const), index: fc.integer({ min: 0, max: 3 }) }) },
    ),
    { minLength: 1, maxLength: 10 },
  ),
  dueOn: fc.option(fc.integer({ min: 0, max: 30 }).map(day), { nil: undefined }),
});

const caseArb = fc.oneof(wideCaseArb, roundCaseArb);

const seen = { received: 0, overpaid: 0, reversed: 0, doubleReversed: 0, paid: 0 };

function check(ops: Ops, c: { charge: number; steps: ({ op: "receive"; amount: number } | { op: "reverse"; index: number })[]; dueOn?: string | undefined }): void {
  const made = newLedger(c.charge);
  if (!made.ok) throw new Error("charge out of range");
  let ledger = made.value;
  for (const step of c.steps) {
    const before = JSON.stringify(ledger);
    const result = step.op === "receive" ? ops.receive(ledger, step.amount) : ops.reverse(ledger, step.index);
    if (result.ok) {
      ledger = result.value;
      if (step.op === "receive") seen.received += 1;
      else seen.reversed += 1;
    } else {
      // A refusal changes nothing.
      expect(JSON.stringify(ledger)).toBe(before);
      if (result.error.code === "exceeds_balance") seen.overpaid += 1;
      if (result.error.code === "already_reversed") seen.doubleReversed += 1;
    }
    const balance = balanceOf(ledger);
    const applied = ledger.receipts.filter((r) => !r.reversed).reduce((sum, r) => sum + r.amount, 0);
    if (balance < 0 || balance > ledger.charge) throw new Error(`INV_BALANCE: balance ${balance} of charge ${ledger.charge}`);
    if (applied + balance !== ledger.charge) throw new Error(`INV_BALANCE: ${applied} + ${balance} is not ${ledger.charge}`);
    if (ledger.receipts.some((r) => !Number.isInteger(r.amount) || r.amount <= 0)) throw new Error("INV_BALANCE: bad receipt amount");
  }
  if (balanceOf(ledger) === 0) seen.paid += 1;

  // Status only moves forward in time for a fixed ledger.
  const rank: Record<FeeStatus, number> = { due: 0, part_paid: 0, overdue: 1, paid: 2 };
  let last: FeeStatus | undefined;
  for (let n = 0; n <= 40; n += 5) {
    const status = feeStatusAt(ledger, c.dueOn, day(n));
    if (last === "paid") expect(status).toBe("paid");
    if (last === "overdue") expect(status).toBe("overdue");
    if (last !== undefined && rank[status] < rank[last]) throw new Error(`status went back from ${last} to ${status}`);
    expect(status === "paid").toBe(balanceOf(ledger) === 0);
    if (c.dueOn === undefined && balanceOf(ledger) > 0) expect(status).not.toBe("overdue");
    last = status;
  }
}

describe("properties of the fee ledger", () => {
  it(`INV_BALANCE holds for ${RUNS} generated ledgers (seed ${SEEDS.INV_BALANCE})`, () => {
    const outcome = runProperty("INV_BALANCE", caseArb, (c) => check(real, c), { seed: SEEDS.INV_BALANCE });
    expect(outcome.cases).toBeGreaterThanOrEqual(RUNS);
  });

  it("really met receipts, overpayments, reversals, double reversals and paid charges", () => {
    const note = JSON.stringify(seen);
    expect(seen.received, note).toBeGreaterThan(1000);
    expect(seen.overpaid, note).toBeGreaterThan(100);
    expect(seen.reversed, note).toBeGreaterThan(100);
    expect(seen.doubleReversed, note).toBeGreaterThan(5);
    expect(seen.paid, note).toBeGreaterThan(50);
  });
});

describe("the properties catch a deliberate defect", () => {
  it("a receipt with no cap breaks INV_BALANCE", () => {
    const noCap: Ops = {
      ...real,
      receive: (l, amount) =>
        Number.isInteger(amount) && amount > 0 ? { ok: true, value: { charge: l.charge, receipts: [...l.receipts, { amount, reversed: false }] } } : receive(l, amount),
    };
    expect(() => runProperty("mutant", caseArb, (c) => check(noCap, c), { seed: SEEDS.INV_BALANCE })).toThrow(/Property failed/);
  });

  it("a reversal that works twice breaks INV_BALANCE", () => {
    const twice: Ops = {
      ...real,
      reverse(l, index) {
        const r = l.receipts[index];
        if (r === undefined) return reverseReceipt(l, index);
        return { ok: true, value: { charge: l.charge, receipts: l.receipts.map((x, i) => (i === index ? { ...x, reversed: true } : x)) } };
      },
    };
    const stillReversed = (c: Parameters<typeof check>[1]) => check(twice, c);
    // Reversing an already reversed receipt succeeds without changing the balance. The refusal count then
    // differs from the real ledger, so compare it with the real ledger step by step.
    expect(() =>
      runProperty(
        "mutant",
        caseArb,
        (c) => {
          const a = replayWith(real, c);
          const b = replayWith(twice, c);
          expect(b).toEqual(a);
          stillReversed(c);
        },
        { seed: SEEDS.INV_BALANCE },
      ),
    ).toThrow(/Property failed/);
  });

  it("a reversal that does not restore the amount breaks INV_BALANCE", () => {
    const keepsMoney: Ops = {
      ...real,
      reverse(l, index) {
        const r = l.receipts[index];
        if (r === undefined || r.reversed) return reverseReceipt(l, index);
        return { ok: true, value: { charge: l.charge, receipts: l.receipts.map((x, i) => (i === index ? { ...x, reversed: true, amount: 0 } : x)) } };
      },
    };
    expect(() => runProperty("mutant", caseArb, (c) => check(keepsMoney, c), { seed: SEEDS.INV_BALANCE })).toThrow(/Property failed/);
  });
});

/** The refusals and final balance an implementation gives for a case. */
function replayWith(ops: Ops, c: Parameters<typeof check>[1]): { refused: number[]; balance: number } {
  let ledger = (newLedger(c.charge) as { ok: true; value: ChargeLedger }).value;
  const refused: number[] = [];
  c.steps.forEach((step, i) => {
    const result = step.op === "receive" ? ops.receive(ledger, step.amount) : ops.reverse(ledger, step.index);
    if (result.ok) ledger = result.value;
    else refused.push(i);
  });
  return { refused, balance: balanceOf(ledger) };
}
