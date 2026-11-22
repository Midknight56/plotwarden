// Foundation money: integer minor units and one charge ledger.
// Expected values are worked by hand in tests/fixtures/expected/hand-totals.md
// sections 2.3 and 2.4. Fee rules are D5 and R13.
import { describe, expect, it } from "vitest";
import {
  balanceOf,
  feeStatusAt,
  formatMoney,
  newLedger,
  parseMoney,
  receive,
  reverseReceipt,
  type ChargeLedger,
} from "../../template/src/money";

function ledger(charge: number): ChargeLedger {
  const result = newLedger(charge);
  if (!result.ok) throw new Error("setup");
  return result.value;
}

function got<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`);
  return result.value;
}

describe("parsing and showing money", () => {
  it("reads decimal text into whole minor units", () => {
    const cases: [string, number][] = [
      ["36", 3600],
      ["36.0", 3600],
      ["36.00", 3600],
      ["0.05", 5],
      ["12.50", 1250],
      [" 12.50 ", 1250],
      ["0", 0],
      ["999999.99", 99_999_999],
    ];
    for (const [text, minor] of cases) expect(parseMoney(text), text).toEqual({ ok: true, value: minor });
  });

  it("treats a blank amount as unknown, never as zero", () => {
    expect(parseMoney("")).toEqual({ ok: true, value: undefined });
    expect(parseMoney("   ")).toEqual({ ok: true, value: undefined });
    expect(parseMoney("0")).toEqual({ ok: true, value: 0 });
  });

  it("refuses text that is not a plain amount", () => {
    for (const text of ["12.345", "-5", "+5", "1,000.00", "£5", "1e3", ".5", "5.", "abc", "1 2", "NaN"]) {
      const result = parseMoney(text);
      expect(result.ok, text).toBe(false);
      if (!result.ok) expect(result.error.code, text).toBe("bad_amount");
    }
  });

  it("refuses an amount over 99,999,999 minor units", () => {
    const result = parseMoney("1000000.00");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("over_limit");
      expect(result.error.detail?.item).toBe("moneyMinorUnits");
    }
  });

  it("writes the currency code and two decimals", () => {
    expect(formatMoney(3600, "GBP")).toBe("GBP 36.00");
    expect(formatMoney(5, "EUR")).toBe("EUR 0.05");
    expect(formatMoney(99_999_999, "USD")).toBe("USD 999999.99");
    expect(formatMoney(1200, "CAD")).toBe("CAD 12.00");
    expect(formatMoney(0, "GBP")).toBe("GBP 0.00");
  });
});

describe("the ledger of one charge", () => {
  it("accepts a charge from 0 to 99,999,999 and nothing else", () => {
    expect(newLedger(0).ok).toBe(true);
    expect(newLedger(99_999_999).ok).toBe(true);
    for (const bad of [-1, 100_000_000, 1.5, Number.NaN]) expect(newLedger(bad).ok, String(bad)).toBe(false);
  });

  it("GBP 36.00 less 12.00 less 24.00 leaves 24.00 then 0.00 (hand totals 2.3)", () => {
    const start = ledger(3600);
    expect(balanceOf(start)).toBe(3600);
    const first = got(receive(start, 1200));
    expect(balanceOf(first)).toBe(2400);
    const second = got(receive(first, 2400));
    expect(balanceOf(second)).toBe(0);
  });

  it("refuses GBP 24.01 after GBP 12.00 and keeps the ledger unchanged", () => {
    const afterFirst = got(receive(ledger(3600), 1200));
    const result = receive(afterFirst, 2401);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("exceeds_balance");
      expect(result.error.detail).toMatchObject({ balance: 2400, amount: 2401 });
    }
    expect(balanceOf(afterFirst)).toBe(2400);
    expect(afterFirst.receipts).toEqual([{ amount: 1200, reversed: false }]);
  });

  it("refuses a receipt that is not a positive whole number within bounds", () => {
    for (const bad of [0, -5, 1.5, Number.NaN, 100_000_000]) {
      const result = receive(ledger(3600), bad);
      expect(result.ok, String(bad)).toBe(false);
      if (!result.ok) expect(result.error.code, String(bad)).toBe("bad_amount");
    }
  });

  it("reverses a receipt by its exact amount, once (hand totals 2.3)", () => {
    const paid = got(receive(got(receive(ledger(3600), 1200)), 2400));
    const reversed = got(reverseReceipt(paid, 0));
    expect(balanceOf(reversed)).toBe(1200);
    const again = reverseReceipt(reversed, 0);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("already_reversed");
    const reentered = got(receive(reversed, 1200));
    expect(balanceOf(reentered)).toBe(0);
  });

  it("refuses to reverse a receipt that does not exist", () => {
    const result = reverseReceipt(ledger(3600), 0);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("no_such_receipt");
    expect(reverseReceipt(ledger(3600), -1).ok).toBe(false);
  });

  it("never changes the ledger it was given", () => {
    const original = got(receive(ledger(3600), 1200));
    const before = JSON.stringify(original);
    receive(original, 100);
    reverseReceipt(original, 0);
    expect(JSON.stringify(original)).toBe(before);
  });

  it("keeps the balance between 0 and the charge", () => {
    let l = ledger(3600);
    for (const amount of [1000, 1000, 1600]) l = got(receive(l, amount));
    expect(balanceOf(l)).toBe(0);
    l = got(reverseReceipt(l, 1));
    expect(balanceOf(l)).toBe(1000);
    expect(balanceOf(l)).toBeLessThanOrEqual(3600);
  });
});

describe("fee status at a date (hand totals 2.3 and 2.4)", () => {
  const DUE = "2026-06-30";

  it("is Due before any receipt, on and before the due date", () => {
    expect(feeStatusAt(ledger(3600), DUE, "2026-04-10")).toBe("due");
    expect(feeStatusAt(ledger(3600), DUE, "2026-06-30")).toBe("due");
  });

  it("is Part paid with a receipt and a balance left, on or before the due date", () => {
    const l = got(receive(ledger(3600), 1200));
    expect(feeStatusAt(l, DUE, "2026-05-02")).toBe("part_paid");
    expect(feeStatusAt(l, DUE, "2026-06-30")).toBe("part_paid");
  });

  it("is Paid at a zero balance, even after the due date", () => {
    const l = got(receive(got(receive(ledger(3600), 1200)), 2400));
    expect(feeStatusAt(l, DUE, "2026-06-01")).toBe("paid");
    expect(feeStatusAt(l, DUE, "2026-12-01")).toBe("paid");
  });

  it("is Part paid again after a receipt is reversed", () => {
    const paid = got(receive(got(receive(ledger(3600), 1200)), 2400));
    const reversed = got(reverseReceipt(paid, 0));
    expect(feeStatusAt(reversed, DUE, "2026-06-15")).toBe("part_paid");
  });

  it("the older charge on B02: Due on 2025-06-30, Overdue from 2025-07-01 and on 2026-04-20", () => {
    const b02 = ledger(3000);
    expect(feeStatusAt(b02, "2025-06-30", "2025-06-30")).toBe("due");
    expect(feeStatusAt(b02, "2025-06-30", "2025-07-01")).toBe("overdue");
    expect(feeStatusAt(b02, "2025-06-30", "2026-04-20")).toBe("overdue");
  });

  it("is Overdue after the due date even with a part payment", () => {
    const l = got(receive(ledger(3600), 1200));
    expect(feeStatusAt(l, DUE, "2026-07-01")).toBe("overdue");
  });

  it("is never Overdue when there is no due date", () => {
    expect(feeStatusAt(ledger(3600), undefined, "2099-01-01")).toBe("due");
    const l = got(receive(ledger(3600), 1200));
    expect(feeStatusAt(l, undefined, "2099-01-01")).toBe("part_paid");
  });
});
