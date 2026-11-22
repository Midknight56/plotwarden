// Review facts of the Allotment Register (spec 04, task 4.8, A7). The expected numbers are from
// hand-totals.md section 5.6 and 2.6. Strict comparison: nothing is late on the reply date or the due date itself.
import { beforeEach, describe, expect, it } from "vitest";
import { scanForCanaries } from "../../template/src/output/privacy";
import { allotReviewFacts } from "../../apps/allotment-register/src/review";
import type { AllotCommand } from "../../apps/allotment-register/src/types";
import { REVIEW_CANARIES } from "../helpers/gardenCanaries";
import { GardenEnv, id, spaceId } from "../helpers/gardenEnv";
import { SEASON_2026, app, buildThimble, chargeId, claim, tenancy } from "../helpers/thimbleBeds";

let env: GardenEnv;
const facts = (asOf: string) => allotReviewFacts(env.state, asOf);
const rules = (asOf: string) => facts(asOf).map((f) => f.rule);

const OFFER = (extra: Partial<Extract<AllotCommand, { type: "make_offer" }>> = {}): AllotCommand => ({
  type: "make_offer",
  offerId: id("offer:b03"),
  applicationId: app("tavi"),
  spaceId: spaceId("B03"),
  claimId: claim("hold:b03"),
  replyBy: "2026-04-18",
  ...extra,
});

beforeEach(async () => {
  env = await GardenEnv.create();
  await buildThimble(env);
});

describe("fee_late (R17.4)", () => {
  it("is raised once for the B02 charge at the review date, and not on the due date itself", () => {
    expect(rules("2026-04-20")).toEqual(["fee_late"]);
    expect(facts("2026-04-20")[0]?.subjectId).toBe(chargeId("B02:2025"));
    expect(rules("2025-06-30")).toEqual([]);
    expect(rules("2025-07-01")).toEqual(["fee_late"]);
    expect(rules("2025-03-31")).toEqual([]);
  });

  it("drops away once the charge is paid in full, and stays for a part payment", async () => {
    await env.must([{ type: "record_receipt", receiptId: id("r:part"), chargeId: chargeId("B02:2025"), amount: 1000 }], "2026-04-21");
    expect(rules("2026-04-20")).toEqual(["fee_late"]);
    expect(rules("2026-04-22")).toEqual(["fee_late"]);
    await env.must([{ type: "record_receipt", receiptId: id("r:rest"), chargeId: chargeId("B02:2025"), amount: 2000 }], "2026-06-30");
    expect(rules("2026-06-30")).toEqual([]);
  });

  it("is not raised for a reversed charge or a waived charge", async () => {
    await env.must([{ type: "reverse_entry", reversalId: id("rev:old"), entryId: chargeId("B02:2025"), reason: "Charged in error" }], "2026-04-21");
    expect(rules("2026-04-22")).toEqual([]);
    expect(rules("2026-04-20")).toEqual(["fee_late"]);
  });

  it("is never raised for a charge with no due date", async () => {
    await env.must([{ type: "new_season", seasonId: id("season:open"), name: "Open season", start: "2025-04-01", endExclusive: "2026-04-01", standardFee: 1000 }]);
    await env.must([{ type: "apply_charges", seasonId: id("season:open"), items: [{ chargeId: id("charge:open"), tenancyId: tenancy("B01") }] }], "2025-04-01");
    expect(facts("2030-01-01").map((f) => f.subjectId)).not.toContain(id("charge:open"));
    expect(facts("2030-01-01").map((f) => f.subjectId)).toContain(chargeId("B02:2025"));
  });

  it("raises a new fact on the day after a new charge falls due", async () => {
    await env.must([{ type: "new_season", ...SEASON_2026 }], "2026-04-01");
    await env.must([{ type: "apply_charges", seasonId: SEASON_2026.seasonId, items: [{ chargeId: chargeId("B01:2026"), tenancyId: tenancy("B01") }] }], "2026-04-10");
    expect(facts("2026-06-30").map((f) => f.subjectId)).toEqual([chargeId("B02:2025")]);
    expect(facts("2026-07-01").map((f) => f.subjectId).sort()).toEqual([chargeId("B01:2026"), chargeId("B02:2025")].sort());
  });
});

describe("offer_late (R17.3, hand totals 2.6)", () => {
  beforeEach(async () => {
    await env.must([OFFER()], "2026-04-04");
  });

  it("is raised the day after the reply date, and together with fee_late gives two issues at the review date", () => {
    expect(rules("2026-04-18")).toEqual(["fee_late"]);
    expect(rules("2026-04-19")).toEqual(["offer_late", "fee_late"]);
    expect(rules("2026-04-20")).toEqual(["offer_late", "fee_late"]);
    expect(facts("2026-04-20")).toHaveLength(2);
    expect(facts("2026-04-20")[0]?.subjectId).toBe(id("offer:b03"));
  });

  it("is not raised for an offer with no reply date", async () => {
    await env.must([{ type: "decline_offer", offerId: id("offer:b03"), choice: "keep_place" }], "2026-04-05");
    const { replyBy: _r, ...noReply } = OFFER({ offerId: id("offer:open"), claimId: claim("hold:open") }) as Extract<AllotCommand, { type: "make_offer" }>;
    await env.must([noReply], "2026-04-06");
    expect(rules("2030-01-01")).toEqual(["fee_late"]);
  });

  it("is not raised for an offer that was accepted, declined or released", async () => {
    await env.must([{ type: "accept_offer", offerId: id("offer:b03"), tenancyId: tenancy("B03"), claimId: claim("tenancy:B03") }], "2026-04-10");
    expect(rules("2026-04-20")).toEqual(["fee_late"]);
  });
});

describe("what a fact may say (R16.2, A7.3)", () => {
  it("labels each fact Record n in order, with no name, amount, code or contact in the facts", async () => {
    await env.must([OFFER()], "2026-04-04");
    const all = facts("2026-04-20");
    expect(all.map((f) => f.label)).toEqual(["Record 1", "Record 2"]);
    expect(scanForCanaries(all, REVIEW_CANARIES)).toEqual([]);
    for (const f of all) {
      expect(Object.keys(f).sort()).toEqual(["label", "rule", "subjectId"]);
      expect(f.label).not.toMatch(/B0\d/);
    }
  });

  it("raises at most one fact for a subject and a rule, even with several receipts and reversals", async () => {
    await env.must([{ type: "record_receipt", receiptId: id("r1"), chargeId: chargeId("B02:2025"), amount: 500 }], "2026-04-10");
    await env.must([{ type: "record_receipt", receiptId: id("r2"), chargeId: chargeId("B02:2025"), amount: 500 }], "2026-04-11");
    await env.must([{ type: "reverse_entry", reversalId: id("rv1"), entryId: id("r1"), reason: "x" }], "2026-04-12");
    expect(facts("2026-04-20")).toHaveLength(1);
  });

  it("gives the same facts after a reload", async () => {
    await env.must([OFFER()], "2026-04-04");
    expect(allotReviewFacts(await env.reload(), "2026-04-20")).toEqual(facts("2026-04-20"));
  });
});