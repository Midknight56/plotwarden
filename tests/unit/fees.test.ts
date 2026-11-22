// T20 (fees). Requirements A4, R11.2, R13.6 to R13.12. The expected values come from hand-totals.md
// sections 2.3, 2.4 and 2.5, all in pence. GBP 36.00 less 12.00 less 24.00 leaves 0.
import { beforeEach, describe, expect, it } from "vitest";
import { chargeSummary, chargesOfTenancy, liveChargeOf, tenancyBalance } from "../../apps/allotment-register/src/fees";
import type { AllotCommand } from "../../apps/allotment-register/src/types";
import { GardenEnv, id } from "../helpers/gardenEnv";
import { SEASON_2025, SEASON_2026, app, buildThimble, chargeId, claim, person, tenancy } from "../helpers/thimbleBeds";

const OFFER = id("offer:b03");
const B03 = chargeId("B03:2026");
const B02_OLD = chargeId("B02:2025");

let env: GardenEnv;

/** Offer B03 to Tavi on 2026-04-04, accept on 2026-04-10, open Season 2026. Hand totals 2.2 and 2.3. */
async function acceptB03(): Promise<void> {
  await env.must([{ type: "make_offer", offerId: OFFER, applicationId: app("tavi"), spaceId: id("space:B03:1"), claimId: claim("hold:b03"), replyBy: "2026-04-18" }], "2026-04-04");
  await env.must([{ type: "accept_offer", offerId: OFFER, tenancyId: tenancy("B03"), claimId: claim("tenancy:B03") }], "2026-04-10");
  await env.must([{ type: "new_season", ...SEASON_2026 }], "2026-04-01");
}

const assess = (extra: Partial<{ chargeId: string; amount: number; waiveReason: string }> = {}, tenancyId = tenancy("B03")): AllotCommand => ({
  type: "apply_charges",
  seasonId: SEASON_2026.seasonId,
  items: [{ chargeId: B03, tenancyId, ...extra }],
});

const receipt = (name: string, amount: number, extra: Partial<Extract<AllotCommand, { type: "record_receipt" }>> = {}): AllotCommand => ({
  type: "record_receipt",
  receiptId: id(`receipt:${name}`),
  chargeId: B03,
  amount,
  ...extra,
});

const summary = (chargeId_: string, date: string) => chargeSummary(env.state, chargeId_, date);

beforeEach(async () => {
  env = await GardenEnv.create();
  await buildThimble(env);
});

describe("the older charge on B02 (hand totals 2.4)", () => {
  it("is a charge of 3000 on the B02 tenancy, with no receipts", () => {
    const s = summary(B02_OLD, "2026-04-20");
    expect(s).toMatchObject({ charged: 3000, received: 0, reversed: 0, balance: 3000 });
    expect(chargesOfTenancy(env.state, tenancy("B02")).map((c) => c.entryId)).toEqual([B02_OLD]);
    expect(chargesOfTenancy(env.state, tenancy("B01"))).toEqual([]);
  });

  it("is Due on the due date, Overdue the next day and Overdue at the review date", () => {
    expect(summary(B02_OLD, "2025-06-29")?.status).toBe("due");
    expect(summary(B02_OLD, "2025-06-30")?.status).toBe("due");
    expect(summary(B02_OLD, "2025-07-01")?.status).toBe("overdue");
    expect(summary(B02_OLD, "2026-04-20")?.status).toBe("overdue");
    expect(summary(B02_OLD, "2026-04-20")?.dueOn).toBe("2025-06-30");
  });

  it("does not exist before the day it was charged", () => {
    expect(summary(B02_OLD, "2025-03-31")).toBeUndefined();
    expect(summary(B02_OLD, "2025-04-01")?.balance).toBe(3000);
  });
});

describe("a season and its charges (A4.2, A4.3, hand totals 2.3)", () => {
  beforeEach(acceptB03);

  it("starts B03 with no charge and charges it GBP 36.00 once", async () => {
    expect(chargesOfTenancy(env.state, tenancy("B03"))).toEqual([]);
    await env.must([assess()], "2026-04-10");
    expect(summary(B03, "2026-04-10")).toMatchObject({ charged: 3600, received: 0, balance: 3600, status: "due" });
    expect(liveChargeOf(env.state, tenancy("B03"), SEASON_2026.seasonId)?.entryId).toBe(B03);
  });

  it("applies a charge twice and still keeps one charge: the repeat writes nothing", async () => {
    await env.must([assess()], "2026-04-10");
    const revision = env.revision;
    const events = (await env.events()).length;
    const again = await env.dispatch([assess({ chargeId: chargeId("B03:again") })], "2026-04-10");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("already_charged");
    expect(env.revision).toBe(revision);
    expect((await env.events()).length).toBe(events);
    expect(chargesOfTenancy(env.state, tenancy("B03"))).toHaveLength(1);
    expect(summary(B03, "2026-04-10")?.balance).toBe(3600);
  });

  it("charges only the tenancies not yet charged when some are", async () => {
    await env.must([assess()], "2026-04-10");
    await env.must(
      [
        {
          type: "apply_charges",
          seasonId: SEASON_2026.seasonId,
          items: [
            { chargeId: chargeId("B03:dup"), tenancyId: tenancy("B03") },
            { chargeId: chargeId("B01:2026"), tenancyId: tenancy("B01") },
          ],
        },
      ],
      "2026-04-11",
    );
    expect(chargesOfTenancy(env.state, tenancy("B03"))).toHaveLength(1);
    expect(chargesOfTenancy(env.state, tenancy("B01")).map((c) => c.minorUnits)).toEqual([3600]);
  });

  it("charges the standard fee unless an amount is given, and never prorates", async () => {
    await env.must(
      [
        {
          type: "apply_charges",
          seasonId: SEASON_2026.seasonId,
          items: [
            { chargeId: chargeId("B01:2026"), tenancyId: tenancy("B01"), amount: 2000 },
            { chargeId: chargeId("B04:2026"), tenancyId: tenancy("B04") },
          ],
        },
      ],
      "2026-04-10",
    );
    expect(summary(chargeId("B01:2026"), "2026-04-10")?.charged).toBe(2000);
    expect(summary(chargeId("B04:2026"), "2026-04-10")?.charged).toBe(3600);
  });

  it("charges a tenancy that began in the middle of the season the full fee", async () => {
    await env.must([assess()], "2026-04-10");
    expect(env.state.tenancies[tenancy("B03")]?.start).toBe("2026-04-10");
    expect(summary(B03, "2026-04-10")?.charged).toBe(3600);
  });

  it("keeps an older charge when the standard fee of a new season is different", async () => {
    await env.must([assess()], "2026-04-10");
    await env.must([{ type: "new_season", seasonId: id("season:2027"), name: "Season 2027", start: "2027-04-01", endExclusive: "2028-04-01", standardFee: 4000 }]);
    expect(summary(B03, "2026-04-20")?.charged).toBe(3600);
    expect(env.state.seasons[id("season:2027")]?.standardFee).toBe(4000);
  });

  it("refuses a tenancy that is not in the season, an unknown tenancy and an unknown season", async () => {
    await env.must([{ type: "end_tenancy", tenancyId: tenancy("B01") }], "2025-12-01");
    const out = await env.dispatch([assess({ chargeId: chargeId("x") }, tenancy("B01"))], "2026-04-10");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("not_in_season");
    const gone = await env.dispatch([assess({ chargeId: chargeId("y") }, "nothing")], "2026-04-10");
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.error.code).toBe("no_such_tenancy");
    const noSeason = await env.dispatch([{ type: "apply_charges", seasonId: "none", items: [{ chargeId: chargeId("z"), tenancyId: tenancy("B03") }] }], "2026-04-10");
    expect(noSeason.ok).toBe(false);
    if (!noSeason.ok) expect(noSeason.error.code).toBe("no_such_season");
    expect(chargesOfTenancy(env.state, tenancy("B01"))).toEqual([]);
  });

  it("needs a season name, valid dates, an end after the start and a standard fee above zero", async () => {
    const season = { type: "new_season" as const, seasonId: id("season:x"), name: "Season X", start: "2027-04-01", endExclusive: "2028-04-01", standardFee: 1000 };
    const cases: [Partial<typeof season> & { dueOn?: string }, { field: string; code: string }][] = [
      [{ name: " " }, { field: "seasonName", code: "required" }],
      [{ start: "" }, { field: "start", code: "required" }],
      [{ endExclusive: "2027-04-01" }, { field: "end", code: "bad_interval" }],
      [{ endExclusive: "2027-13-01" }, { field: "end", code: "invalid_date" }],
      [{ dueOn: "2027-02-31" }, { field: "due", code: "invalid_date" }],
      [{ standardFee: 0 }, { field: "standardFee", code: "bad_amount" }],
      [{ standardFee: 12.5 }, { field: "standardFee", code: "bad_amount" }],
      [{ standardFee: 100_000_000 }, { field: "standardFee", code: "over_limit" }],
    ];
    for (const [patch, field] of cases) {
      const out = await env.dispatch([{ ...season, ...patch }]);
      expect(out.ok, JSON.stringify(patch)).toBe(false);
      if (!out.ok) expect(out.error.fields, JSON.stringify(patch)).toEqual([field]);
    }
    expect((await env.dispatch([{ ...season, standardFee: 99_999_999 }])).ok).toBe(true);
    const twice = await env.dispatch([{ ...season, seasonId: id("season:y"), name: "season x" }]);
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error.code).toBe("season_exists");
  });
});

describe("a zero fee is a waiver with a reason (A4.4)", () => {
  beforeEach(acceptB03);

  it("refuses a zero amount with no reason and says which field", async () => {
    const out = await env.dispatch([assess({ amount: 0 })], "2026-04-10");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.fields).toEqual([{ field: "reason", code: "required" }]);
    expect(chargesOfTenancy(env.state, tenancy("B03"))).toEqual([]);
  });

  it("accepts a waiver with a reason as a charge of 0 that is Paid and cannot be paid", async () => {
    await env.must([assess({ waiveReason: "Founding member" })], "2026-04-10");
    expect(summary(B03, "2026-04-10")).toMatchObject({ charged: 0, balance: 0, status: "paid" });
    expect(env.state.ledger[B03]).toMatchObject({ minorUnits: 0, waiver: "Founding member" });
    const out = await env.dispatch([receipt("any", 100)], "2026-04-11");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatchObject({ code: "exceeds_balance", detail: { amount: "GBP 0.00" } });
  });

  it("refuses a waiver that also names an amount", async () => {
    const out = await env.dispatch([assess({ waiveReason: "Founding member", amount: 500 })], "2026-04-10");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.fields).toEqual([{ field: "standardFee", code: "bad_amount" }]);
  });
});

describe("receipts: partial, final and refused (A4.5, A4.6, hand totals 2.3)", () => {
  beforeEach(async () => {
    await acceptB03();
    await env.must([assess()], "2026-04-10");
  });

  it("leaves 24.00 after 12.00 and 0.00 after the final 24.00, with the statuses of each date", async () => {
    await env.must([receipt("one", 1200, { ref: "TB-RCPT-1" })], "2026-05-02");
    expect(summary(B03, "2026-05-02")).toMatchObject({ charged: 3600, received: 1200, balance: 2400, status: "part_paid" });
    await env.must([receipt("two", 2400)], "2026-06-01");
    expect(summary(B03, "2026-06-01")).toMatchObject({ charged: 3600, received: 3600, balance: 0, status: "paid" });
    // Read at an earlier date, the second receipt is not yet there.
    expect(summary(B03, "2026-05-02")).toMatchObject({ received: 1200, balance: 2400, status: "part_paid" });
    expect(summary(B03, "2026-04-10")).toMatchObject({ received: 0, balance: 3600, status: "due" });
    expect(env.state.ledger[id("receipt:one")]?.ref).toBe("TB-RCPT-1");
  });

  it("refuses 24.01 after 12.00, names the balance as GBP 24.00 and changes nothing", async () => {
    await env.must([receipt("one", 1200)], "2026-05-02");
    const revision = env.revision;
    const events = (await env.events()).length;
    const out = await env.dispatch([receipt("over", 2401)], "2026-06-01");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatchObject({ code: "exceeds_balance", detail: { amount: "GBP 24.00", balance: 2400 } });
    expect(summary(B03, "2026-06-01")?.balance).toBe(2400);
    expect(env.revision).toBe(revision);
    expect((await env.events()).length).toBe(events);
    // The same input, edited to the balance, goes through.
    await env.must([receipt("over", 2400)], "2026-06-01");
    expect(summary(B03, "2026-06-01")?.balance).toBe(0);
  });

  it("names the balance in the currency of the garden", async () => {
    const eur = await GardenEnv.create("Rue des Beds", "EUR");
    await buildThimble(eur);
    await eur.must([{ type: "make_offer", offerId: OFFER, applicationId: app("tavi"), spaceId: id("space:B03:1"), claimId: claim("hold:b03") }], "2026-04-04");
    await eur.must([{ type: "accept_offer", offerId: OFFER, tenancyId: tenancy("B03"), claimId: claim("tenancy:B03") }], "2026-04-10");
    await eur.must([{ type: "new_season", ...SEASON_2026 }], "2026-04-01");
    await eur.must([assess()], "2026-04-10");
    const out = await eur.dispatch([receipt("big", 3601)], "2026-05-02");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.detail?.["amount"]).toBe("EUR 36.00");
  });

  it("refuses a receipt that is blank, zero, negative, fractional or too large, and says which field", async () => {
    const bad: [number | undefined, string][] = [
      [undefined, "required"],
      [0, "bad_amount"],
      [-100, "bad_amount"],
      [12.5, "bad_amount"],
      [100_000_000, "over_limit"],
    ];
    for (const [amount, code] of bad) {
      const out = await env.dispatch([{ ...receipt("bad", 0), amount } as unknown as AllotCommand], "2026-05-02");
      expect(out.ok, String(amount)).toBe(false);
      if (!out.ok) expect(out.error.fields, String(amount)).toEqual([{ field: "amount", code }]);
    }
    expect(summary(B03, "2026-05-02")?.received).toBe(0);
  });

  it("refuses a receipt for a charge that is not there", async () => {
    const out = await env.dispatch([receipt("x", 100, { chargeId: "nothing" })], "2026-05-02");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("no_such_entry");
  });

  it("accepts the largest legal receipt and refuses one over it", async () => {
    const big = await GardenEnv.create();
    await buildThimble(big);
    await big.must([{ type: "new_season", seasonId: id("season:big"), name: "Big", start: "2026-01-01", endExclusive: "2027-01-01", standardFee: 99_999_999 }]);
    await big.must([{ type: "apply_charges", seasonId: id("season:big"), items: [{ chargeId: id("charge:big"), tenancyId: tenancy("B01") }] }]);
    const over = await big.dispatch([{ type: "record_receipt", receiptId: id("r:over"), chargeId: id("charge:big"), amount: 100_000_000 }]);
    expect(over.ok).toBe(false);
    expect((await big.dispatch([{ type: "record_receipt", receiptId: id("r:last"), chargeId: id("charge:big"), amount: 99_999_999 }])).ok).toBe(true);
    expect(chargeSummary(big.state, id("charge:big"), "2026-04-20")?.balance).toBe(0);
  });
});

describe("reversal: charges with receipts and receipts by their exact amount (A4.7, hand totals 2.3)", () => {
  beforeEach(async () => {
    await acceptB03();
    await env.must([assess()], "2026-04-10");
    await env.must([receipt("one", 1200)], "2026-05-02");
    await env.must([receipt("two", 2400)], "2026-06-01");
  });

  it("refuses to reverse the GBP 36.00 charge while receipts remain", async () => {
    const out = await env.dispatch([{ type: "reverse_entry", reversalId: id("rev:charge"), entryId: B03, reason: "Wrong plot" }], "2026-06-02");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("charge_has_receipts");
    expect(summary(B03, "2026-06-02")?.balance).toBe(0);
  });

  it("reverses the GBP 12.00 receipt by exactly its amount, leaving 12.00 Part paid, and re-entry makes it 0", async () => {
    await env.must([{ type: "reverse_entry", reversalId: id("rev:one"), entryId: id("receipt:one"), reason: "Entered on the wrong plot" }], "2026-06-15");
    expect(env.state.ledger[id("rev:one")]).toMatchObject({ type: "reversal", minorUnits: 1200, reverses: id("receipt:one"), chargeId: B03 });
    expect(summary(B03, "2026-06-15")).toMatchObject({ charged: 3600, received: 3600, reversed: 1200, balance: 1200, status: "part_paid" });
    await env.must([receipt("again", 1200)], "2026-06-15");
    expect(summary(B03, "2026-06-15")).toMatchObject({ balance: 0, status: "paid" });
  });

  it("reverses a receipt once and refuses a second reversal", async () => {
    await env.must([{ type: "reverse_entry", reversalId: id("rev:one"), entryId: id("receipt:one"), reason: "Wrong plot" }], "2026-06-15");
    const revision = env.revision;
    const again = await env.dispatch([{ type: "reverse_entry", reversalId: id("rev:two"), entryId: id("receipt:one"), reason: "Again" }], "2026-06-16");
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("already_reversed");
    expect(env.revision).toBe(revision);
    expect(summary(B03, "2026-06-16")?.balance).toBe(1200);
  });

  it("needs a reason, and cannot reverse a reversal or an unknown entry", async () => {
    const blank = await env.dispatch([{ type: "reverse_entry", reversalId: id("rev:x"), entryId: id("receipt:one"), reason: " " }], "2026-06-15");
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.error.fields).toEqual([{ field: "reason", code: "required" }]);
    await env.must([{ type: "reverse_entry", reversalId: id("rev:one"), entryId: id("receipt:one"), reason: "Wrong plot" }], "2026-06-15");
    const reversal = await env.dispatch([{ type: "reverse_entry", reversalId: id("rev:y"), entryId: id("rev:one"), reason: "Undo" }], "2026-06-16");
    expect(reversal.ok).toBe(false);
    if (!reversal.ok) expect(reversal.error.code).toBe("not_reversible");
    const unknown = await env.dispatch([{ type: "reverse_entry", reversalId: id("rev:z"), entryId: "nothing", reason: "x" }], "2026-06-16");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error.code).toBe("no_such_entry");
  });

  it("refuses a reversal dated before the receipt it undoes", async () => {
    const out = await env.dispatch([{ type: "reverse_entry", reversalId: id("rev:early"), entryId: id("receipt:two"), reason: "Early" }], "2026-05-15");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.fields).toEqual([{ field: "reversalDate", code: "bad_interval" }]);
  });

  it("reverses an unpaid charge once its receipts are reversed, and then a new charge can be made", async () => {
    await env.must([{ type: "reverse_entry", reversalId: id("rev:one"), entryId: id("receipt:one"), reason: "Wrong plot" }], "2026-06-15");
    await env.must([{ type: "reverse_entry", reversalId: id("rev:two"), entryId: id("receipt:two"), reason: "Wrong plot" }], "2026-06-15");
    await env.must([{ type: "reverse_entry", reversalId: id("rev:charge"), entryId: B03, reason: "Wrong plot" }], "2026-06-16");
    expect(summary(B03, "2026-06-16")).toMatchObject({ status: "reversed", balance: 0 });
    expect(liveChargeOf(env.state, tenancy("B03"), SEASON_2026.seasonId)).toBeUndefined();
    const paid = await env.dispatch([receipt("late", 100)], "2026-06-17");
    expect(paid.ok).toBe(false);
    if (!paid.ok) expect(paid.error.code).toBe("charge_reversed");
    await env.must([assess({ chargeId: chargeId("B03:second") })], "2026-06-17");
    expect(liveChargeOf(env.state, tenancy("B03"), SEASON_2026.seasonId)?.entryId).toBe(chargeId("B03:second"));
  });

  it("does not let a receipt dated between a receipt and its reversal run the balance below zero on any date", async () => {
    await env.must([{ type: "reverse_entry", reversalId: id("rev:one"), entryId: id("receipt:one"), reason: "Wrong plot" }], "2026-07-01");
    // Between 2026-06-01 and 2026-07-01 the charge is fully paid, so a payment dated then would overpay.
    const out = await env.dispatch([receipt("between", 1200)], "2026-06-15");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("exceeds_balance");
    expect(summary(B03, "2026-07-01")?.balance).toBe(1200);
  });
});

describe("the currency is fixed once a charge exists (A4.9, R11.2)", () => {
  it("can be set before any charge, with an event", async () => {
    const fresh = await GardenEnv.create("Fresh beds", null);
    const out = await fresh.dispatch([{ type: "set_currency", currency: "EUR" }]);
    expect(out.ok).toBe(true);
    expect(fresh.state.currency).toBe("EUR");
    expect((await fresh.events()).map((e) => e.type)).toContain("currency_set");
  });

  it("is refused at once in Thimble Beds, where the 2025 charge on B02 already exists", async () => {
    const out = await env.dispatch([{ type: "set_currency", currency: "EUR" }]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("currency_fixed");
  });

  it("is refused after the first charge, even a reversed one", async () => {
    await acceptB03();
    await env.must([assess()], "2026-04-10");
    const out = await env.dispatch([{ type: "set_currency", currency: "USD" }]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("currency_fixed");
    expect(env.state.currency).toBe("GBP");
    await env.must([{ type: "reverse_entry", reversalId: id("rev:c"), entryId: B03, reason: "Wrong plot" }], "2026-04-11");
    const again = await env.dispatch([{ type: "set_currency", currency: "USD" }]);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("currency_fixed");
  });

  it("accepts only GBP, EUR, USD and CAD", async () => {
    const out = await env.dispatch([{ type: "set_currency", currency: "JPY" as never }]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.fields).toEqual([{ field: "currency", code: "bad_value" }]);
  });

  it("refuses a season in a garden that has no currency", async () => {
    const none = await GardenEnv.create("No currency", null);
    const out = await none.dispatch([{ type: "new_season", ...SEASON_2026 }]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("no_currency");
  });
});

describe("a balance stays with the tenancy it was charged to (A3.4, hand totals 2.5)", () => {
  const D = "2026-05-01";
  it("leaves the old balance of 3000 with the outgoing holder and starts the incoming one at 0", async () => {
    await env.must(
      [{ type: "hand_over", tenancyId: tenancy("B02"), newTenancyId: id("tenancy:B02:new"), claimId: claim("tenancy:B02:new"), personId: person("Hale Pennywort"), holderName: "Hale Pennywort" }],
      D,
    );
    expect(tenancyBalance(env.state, tenancy("B02"), D)).toBe(3000);
    expect(tenancyBalance(env.state, id("tenancy:B02:new"), D)).toBe(0);
    expect(summary(B02_OLD, D)?.status).toBe("overdue");
    expect(chargesOfTenancy(env.state, tenancy("B02")).map((c) => c.entryId)).toEqual([B02_OLD]);
    expect(chargesOfTenancy(env.state, id("tenancy:B02:new"))).toEqual([]);
  });

  it("keeps a new charge for the incoming holder apart from the old charge", async () => {
    await env.must(
      [{ type: "hand_over", tenancyId: tenancy("B02"), newTenancyId: id("tenancy:B02:new"), claimId: claim("tenancy:B02:new"), personId: person("Hale Pennywort"), holderName: "Hale Pennywort" }],
      D,
    );
    await env.must([{ type: "new_season", ...SEASON_2026 }], "2026-04-01");
    await env.must([{ type: "apply_charges", seasonId: SEASON_2026.seasonId, items: [{ chargeId: chargeId("B02:new"), tenancyId: id("tenancy:B02:new") }] }], D);
    expect(tenancyBalance(env.state, tenancy("B02"), D)).toBe(3000);
    expect(tenancyBalance(env.state, id("tenancy:B02:new"), D)).toBe(3600);
  });

  it("lets the old holder's balance be paid after the handover, on the old tenancy", async () => {
    await env.must(
      [{ type: "hand_over", tenancyId: tenancy("B02"), newTenancyId: id("tenancy:B02:new"), claimId: claim("tenancy:B02:new"), personId: person("Hale Pennywort"), holderName: "Hale Pennywort" }],
      D,
    );
    await env.must([{ type: "record_receipt", receiptId: id("receipt:old"), chargeId: B02_OLD, amount: 3000 }], "2026-05-10");
    expect(tenancyBalance(env.state, tenancy("B02"), "2026-05-10")).toBe(0);
    expect(tenancyBalance(env.state, id("tenancy:B02:new"), "2026-05-10")).toBe(0);
    expect(env.state.ledger[id("receipt:old")]?.tenancyId).toBe(tenancy("B02"));
  });
});

describe("the ledger keeps no tax, no card and no bank detail (A4.10)", () => {
  it("holds only the closed list of entry fields", async () => {
    await acceptB03();
    await env.must([assess()], "2026-04-10");
    await env.must([receipt("one", 1200, { ref: "TB-RCPT-1" })], "2026-05-02");
    await env.must([{ type: "reverse_entry", reversalId: id("rev:one"), entryId: id("receipt:one"), reason: "Wrong plot" }], "2026-05-03");
    const allowed = new Set(["entryId", "tenancyId", "seasonId", "type", "minorUnits", "on", "chargeId", "reverses", "waiver", "ref", "reason"]);
    for (const entry of Object.values(env.state.ledger)) {
      for (const key of Object.keys(entry)) expect(allowed.has(key), key).toBe(true);
      expect(Number.isInteger(entry.minorUnits)).toBe(true);
    }
  });

  it("replays to the same ledger after a reload", async () => {
    await acceptB03();
    await env.must([assess()], "2026-04-10");
    await env.must([receipt("one", 1200)], "2026-05-02");
    expect(await env.reload()).toEqual(env.state);
  });
});

describe("a season is its own thing for the seeker and the report of another season", () => {
  it("keeps Season 2025 as it was while Season 2026 is charged", async () => {
    await acceptB03();
    await env.must([assess()], "2026-04-10");
    expect(summary(B02_OLD, "2026-04-20")?.charged).toBe(SEASON_2025.standardFee);
    expect(env.state.seasons[SEASON_2025.seasonId]?.standardFee).toBe(3000);
  });
});
