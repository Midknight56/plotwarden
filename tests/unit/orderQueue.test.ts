// Foundation queue order: joined date, then fixed sequence, then application ID.
// Thimble Beds: Tavi Bramblequill and Olin Reedwhorl joined on 2026-01-10 with
// sequence n and n + 1 (hand totals 2.1). Tavi's ID sorts after Olin's on
// purpose, so only the sequence can put Tavi first.
import { describe, expect, it } from "vitest";
import { nextEligible, orderQueue, type QueueEntry } from "../../template/src/queue";

const TAVI: QueueEntry = { applicationId: "f0000000-0000-4000-8000-000000000001", joinedOn: "2026-01-10", sequence: 7 };
const OLIN: QueueEntry = { applicationId: "a0000000-0000-4000-8000-000000000002", joinedOn: "2026-01-10", sequence: 8 };

const ids = (list: readonly QueueEntry[]) => list.map((e) => e.applicationId);

describe("queue order", () => {
  it("puts the earlier join date first", () => {
    const early: QueueEntry = { applicationId: "z", joinedOn: "2025-12-31", sequence: 99 };
    expect(ids(orderQueue([TAVI, early]))).toEqual(["z", TAVI.applicationId]);
  });

  it("on one date, the sequence decides, not the ID and not the input order", () => {
    expect(ids(orderQueue([OLIN, TAVI]))).toEqual([TAVI.applicationId, OLIN.applicationId]);
    expect(ids(orderQueue([TAVI, OLIN]))).toEqual([TAVI.applicationId, OLIN.applicationId]);
  });

  it("compares sequences as numbers", () => {
    const nine = { ...TAVI, applicationId: "n9", sequence: 9 };
    const ten = { ...OLIN, applicationId: "n10", sequence: 10 };
    expect(ids(orderQueue([ten, nine]))).toEqual(["n9", "n10"]);
  });

  it("falls back to the application ID only when date and sequence are equal", () => {
    const a = { ...TAVI, applicationId: "a", sequence: 1 };
    const b = { ...TAVI, applicationId: "b", sequence: 1 };
    expect(ids(orderQueue([b, a]))).toEqual(["a", "b"]);
  });

  it("gives the same order after a reload (reversed input) and after a display sort by ID", () => {
    const list = [OLIN, TAVI, { applicationId: "m", joinedOn: "2026-02-01", sequence: 1 }];
    const expected = ids(orderQueue(list));
    expect(ids(orderQueue([...list].reverse()))).toEqual(expected);
    expect(ids(orderQueue([...list].sort((x, y) => x.applicationId.localeCompare(y.applicationId))))).toEqual(expected);
  });

  it("does not change its input", () => {
    const list = [OLIN, TAVI];
    orderQueue(list);
    expect(ids(list)).toEqual([OLIN.applicationId, TAVI.applicationId]);
  });
});

describe("next eligible applicant", () => {
  it("is the first in order", () => {
    expect(nextEligible([OLIN, TAVI])?.applicationId).toBe(TAVI.applicationId);
  });

  it("leaves out an applicant with a pending offer (hand totals 2.2)", () => {
    expect(nextEligible([{ ...TAVI, pending: true }, OLIN])?.applicationId).toBe(OLIN.applicationId);
  });

  it("is nothing for an empty list or when every applicant is pending", () => {
    expect(nextEligible([])).toBeUndefined();
    expect(nextEligible([{ ...TAVI, pending: true }, { ...OLIN, pending: true }])).toBeUndefined();
  });
});
