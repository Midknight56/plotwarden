// Minor unit money and one charge ledger. Pure.
// Money is a whole number of minor units. A blank amount is unknown, not zero.
import type { LocalDate } from "./calendar";
import { LIMITS, checkLimit } from "./limits";
import { err, ok } from "./types";
import type { Currency, Result } from "./types";

export type FeeStatus = "paid" | "part_paid" | "due" | "overdue";

export interface ChargeLedger {
  charge: number;
  receipts: { amount: number; reversed: boolean }[];
}

const AMOUNT = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Read an amount with at most two decimals. A blank string gives `undefined`
 * (unknown). Signs, separators, symbols and exponents are refused.
 */
export function parseMoney(text: string): Result<number | undefined> {
  const trimmed = text.trim();
  if (trimmed === "") return ok(undefined);
  const match = AMOUNT.exec(trimmed);
  if (!match) return err("bad_amount");
  const whole = (match[1] ?? "").replace(/^0+(?=\d)/, "");
  const fraction = (match[2] ?? "").padEnd(2, "0");
  // More than nine whole digits is over the limit, and avoids a lossy number.
  if (whole.length > 9) return err("over_limit", { item: "moneyMinorUnits", limit: LIMITS.moneyMinorUnits });
  const minor = Number(whole) * 100 + Number(fraction);
  const limit = checkLimit("moneyMinorUnits", minor);
  if (!limit.ok) return limit;
  return ok(minor);
}

/** Write an amount with its currency code and two decimals, for example "GBP 36.00". */
export function formatMoney(minor: number, currency: Currency): string {
  if (!Number.isInteger(minor) || minor < 0) throw new RangeError("Money must be a whole number of minor units");
  const whole = Math.floor(minor / 100);
  const fraction = String(minor % 100).padStart(2, "0");
  return `${currency} ${whole}.${fraction}`;
}

/** A ledger for one charge. Zero is allowed here. A waiver reason is the app's rule. */
export function newLedger(charge: number): Result<ChargeLedger> {
  const limit = checkLimit("moneyMinorUnits", charge);
  if (!limit.ok) return limit;
  return ok({ charge, receipts: [] });
}

/** What is still owed: the charge less every receipt that has not been reversed. */
export function balanceOf(ledger: ChargeLedger): number {
  let applied = 0;
  for (const receipt of ledger.receipts) if (!receipt.reversed) applied += receipt.amount;
  return ledger.charge - applied;
}

/** Add a receipt. Refuses an amount above the open balance. */
export function receive(ledger: ChargeLedger, amount: number): Result<ChargeLedger> {
  if (!Number.isInteger(amount) || amount <= 0 || amount > LIMITS.moneyMinorUnits) return err("bad_amount");
  const balance = balanceOf(ledger);
  if (amount > balance) return err("exceeds_balance", { balance, amount });
  return ok({ charge: ledger.charge, receipts: [...ledger.receipts, { amount, reversed: false }] });
}

/** Reverse one receipt by its exact amount. A receipt reverses once. */
export function reverseReceipt(ledger: ChargeLedger, index: number): Result<ChargeLedger> {
  const receipt = ledger.receipts[index];
  if (receipt === undefined) return err("no_such_receipt", { index });
  if (receipt.reversed) return err("already_reversed", { index });
  return ok({
    charge: ledger.charge,
    receipts: ledger.receipts.map((r, i) => (i === index ? { ...r, reversed: true } : r)),
  });
}

/**
 * Status at a date. Paid at a zero balance. Overdue from the day after the due
 * date. Otherwise Part paid when a receipt stands, else Due. With no due date
 * it is never Overdue.
 */
export function feeStatusAt(ledger: ChargeLedger, dueOn: LocalDate | undefined, asOf: LocalDate): FeeStatus {
  if (balanceOf(ledger) === 0) return "paid";
  if (dueOn !== undefined && asOf > dueOn) return "overdue";
  return ledger.receipts.some((r) => !r.reversed) ? "part_paid" : "due";
}
