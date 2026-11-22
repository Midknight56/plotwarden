// INV_QUEUE_ORDER: the order is total, does not depend on how the rows arrive,
// and the next eligible applicant is the first one with no pending offer.
// 1,000 cases, recorded seed.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { nextEligible, orderQueue, type QueueEntry } from "../../template/src/queue";
import { runProperty } from "../helpers/property";
import { RUNS, SEEDS } from "./seeds";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);

const rowArb = fc.record({
  joinedOn: fc.integer({ min: 0, max: 5 }).map(day),
  sequence: fc.integer({ min: 1, max: 12 }),
  pending: fc.boolean(),
});

// Unique IDs, in an order unrelated to date and sequence, then the same rows shuffled.
const listArb = fc
  .uniqueArray(fc.integer({ min: 0, max: 999 }), { maxLength: 14 })
  .chain((ids) =>
    fc.array(rowArb, { minLength: ids.length, maxLength: ids.length }).map((rows): QueueEntry[] =>
      ids.map((id, i) => ({ applicationId: `app${String(id).padStart(3, "0")}`, ...rows[i]! })),
    ),
  )
  .chain((entries) =>
    fc.shuffledSubarray(entries, { minLength: entries.length, maxLength: entries.length }).map((shuffled) => ({ entries, shuffled })),
  );

type Order = <T extends QueueEntry>(entries: readonly T[]) => T[];

// The expected order, written as a comparison of three keys, not by calling the code under test.
function before(a: QueueEntry, b: QueueEntry): boolean {
  if (a.joinedOn !== b.joinedOn) return a.joinedOn < b.joinedOn;
  if (a.sequence !== b.sequence) return a.sequence < b.sequence;
  return a.applicationId < b.applicationId;
}

function check(order: Order, { entries, shuffled }: { entries: QueueEntry[]; shuffled: QueueEntry[] }): void {
  const ordered = order(entries);
  expect(ordered).toHaveLength(entries.length);
  for (let i = 0; i + 1 < ordered.length; i++) {
    if (!before(ordered[i]!, ordered[i + 1]!)) throw new Error(`INV_QUEUE_ORDER: ${ordered[i]!.applicationId} is not before ${ordered[i + 1]!.applicationId}`);
  }
  const ids = (list: readonly QueueEntry[]) => list.map((e) => e.applicationId);
  expect(ids(order(shuffled))).toEqual(ids(ordered));
  expect(ids(order(ordered))).toEqual(ids(ordered));
  expect([...ids(ordered)].sort()).toEqual([...ids(entries)].sort());
}

describe("properties of the queue", () => {
  it(`the order is total and the same for any arrival order (${RUNS} cases, seed ${SEEDS.INV_QUEUE_ORDER})`, () => {
    const outcome = runProperty("INV_QUEUE_ORDER", listArb, (list) => check(orderQueue, list), { seed: SEEDS.INV_QUEUE_ORDER });
    expect(outcome.cases).toBeGreaterThanOrEqual(RUNS);
  });

  it(`the next eligible applicant is the first with no pending offer (${RUNS} cases)`, () => {
    runProperty(
      "INV_QUEUE_ORDER",
      listArb,
      ({ entries, shuffled }) => {
        const expected = orderQueue(entries).find((e) => e.pending !== true);
        expect(nextEligible(shuffled)?.applicationId).toBe(expected?.applicationId);
        if (expected !== undefined) expect(nextEligible(shuffled)?.pending).not.toBe(true);
      },
      { seed: SEEDS.INV_QUEUE_ORDER },
    );
  });

  it("really met ties on date and on date plus sequence", () => {
    const samples = fc.sample(listArb, { numRuns: RUNS, seed: SEEDS.INV_QUEUE_ORDER });
    let dateTies = 0;
    let sequenceTies = 0;
    for (const { entries } of samples) {
      for (let a = 0; a < entries.length; a++) {
        for (let b = a + 1; b < entries.length; b++) {
          if (entries[a]!.joinedOn === entries[b]!.joinedOn) dateTies += 1;
          if (entries[a]!.joinedOn === entries[b]!.joinedOn && entries[a]!.sequence === entries[b]!.sequence) sequenceTies += 1;
        }
      }
    }
    expect(dateTies).toBeGreaterThan(1000);
    expect(sequenceTies).toBeGreaterThan(100);
  });
});

describe("the properties catch a deliberate defect", () => {
  it("an order that ignores the sequence is caught", () => {
    const byDateThenId: Order = (entries) =>
      [...entries].sort((a, b) => (a.joinedOn !== b.joinedOn ? (a.joinedOn < b.joinedOn ? -1 : 1) : a.applicationId < b.applicationId ? -1 : 1));
    expect(() => runProperty("mutant", listArb, (list) => check(byDateThenId, list), { seed: SEEDS.INV_QUEUE_ORDER })).toThrow(/Property failed/);
  });

  it("an order that depends on arrival order is caught", () => {
    const unstable: Order = (entries) => [...entries].sort((a, b) => (a.joinedOn < b.joinedOn ? -1 : a.joinedOn > b.joinedOn ? 1 : 0));
    expect(() => runProperty("mutant", listArb, (list) => check(unstable, list), { seed: SEEDS.INV_QUEUE_ORDER })).toThrow(/Property failed/);
  });

  it("a string comparison of sequences is caught", () => {
    const asText: Order = (entries) =>
      [...entries].sort((a, b) =>
        a.joinedOn !== b.joinedOn
          ? a.joinedOn < b.joinedOn
            ? -1
            : 1
          : String(a.sequence) !== String(b.sequence)
            ? String(a.sequence) < String(b.sequence)
              ? -1
              : 1
            : a.applicationId < b.applicationId
              ? -1
              : 1,
      );
    expect(() => runProperty("mutant", listArb, (list) => check(asText, list), { seed: SEEDS.INV_QUEUE_ORDER })).toThrow(/Property failed/);
  });
});
