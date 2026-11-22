// T01 and T07 for the allotment register: the same suite as the market, paper and churchyard adapters,
// unchanged, with its import checks on the Waiting list sheet. The suite is not edited for this adapter.
// It is given a script, refusals, canaries and a sheet. The visitor projection must be closed (or absent)
// and free of every canary.
import { describe, expect, it } from "vitest";
import { parseAvailability } from "../../template/src/output/privacy";
import { allotAdapter, waitingImporter } from "../../apps/allotment-register/src/adapter";
import { WAITING_SHEET_DEF } from "../../apps/allotment-register/src/fields";
import type { AllotCommand, AllotEvent, AllotState } from "../../apps/allotment-register/src/types";
import { conformanceChecks, runConformance, type ConformanceCase } from "./suite";

const ON = "2026-04-20";
const SECTION = "section-sunny";

const plot = (n: number) => ({
  plotId: `plot-B0${n}`,
  code: `B0${n}`,
  sectionId: SECTION,
  spaces: [{ spaceId: `space-B0${n}` }],
  footprint: [
    [100 + 50 * n, 100],
    [140 + 50 * n, 100],
    [140 + 50 * n, 130],
    [100 + 50 * n, 130],
  ] as [number, number][],
});

function gardenCase(): ConformanceCase<AllotState, AllotCommand, AllotEvent> {
  return {
    name: "allotment",
    adapter: allotAdapter,
    script: [
      { command: { type: "set_currency", currency: "GBP" }, on: ON },
      { command: { type: "layout_apply", sections: [{ sectionId: SECTION, name: "Sunny Row" }], plots: [plot(1), plot(2), plot(3), plot(4)] }, on: ON },
      { command: { type: "confirm_empty", spaceIds: ["space-B02", "space-B03", "space-B04"] }, on: ON },
      {
        command: { type: "record_tenancy", tenancyId: "tenancy-1", claimId: "claim-t1", personId: "person-marlo", holderName: "Marlo Fennick", contact: "marlo.fennick@example.invalid", spaceId: "space-B01", start: "2025-04-01", sourceRef: "TB-T1" },
        on: ON,
      },
      { command: { type: "add_applicant", applicationId: "app-tavi", personId: "person-tavi", name: "Tavi Bramblequill", contact: "tavi.bramblequill@example.invalid", joinedOn: "2026-01-10" }, on: ON },
      { command: { type: "add_applicant", applicationId: "app-olin", personId: "person-olin", name: "Olin Reedwhorl", joinedOn: "2026-01-10" }, on: ON },
      { command: { type: "make_offer", offerId: "offer-1", applicationId: "app-tavi", spaceId: "space-B02", claimId: "claim-h1", replyBy: "2026-05-01" }, on: ON },
      { command: { type: "new_season", seasonId: "season-1", name: "Season 2026", start: "2026-04-01", endExclusive: "2027-04-01", dueOn: "2026-06-30", standardFee: 3600 }, on: ON },
      { command: { type: "apply_charges", seasonId: "season-1", items: [{ chargeId: "charge-1", tenancyId: "tenancy-1" }] }, on: ON },
      { command: { type: "record_receipt", receiptId: "receipt-1", chargeId: "charge-1", amount: 1200, ref: "TB-RCPT-1" }, on: ON },
    ],
    refusals: [
      { command: { type: "layout_apply", plots: [{ ...plot(5), code: "b01" }] }, code: "code_taken" },
      { command: { type: "make_tea" } as unknown as AllotCommand, code: "unknown_command" },
      { command: { type: "add_applicant", applicationId: "app-x", personId: "person-x", joinedOn: "2026-01-10" }, code: "invalid_input" },
      { command: { type: "add_applicant", applicationId: "app-dup", personId: "person-tavi", joinedOn: "2026-02-10" }, code: "open_request" },
      { command: { type: "make_offer", offerId: "offer-2", applicationId: "app-olin", spaceId: "space-B02", claimId: "claim-h2", skipReasons: { "app-tavi": "x" } }, code: "offer_open" },
      { command: { type: "record_receipt", receiptId: "receipt-2", chargeId: "charge-1", amount: 2401 }, code: "exceeds_balance" },
      { command: { type: "record_tenancy", tenancyId: "tenancy-2", claimId: "claim-t2", personId: "person-wick", holderName: "Wick Dunmore", spaceId: "space-B01", start: "2026-03-01", sourceRef: "TB-X" }, code: "tenancy_overlap" },
      { command: { type: "set_currency", currency: "EUR" }, code: "currency_fixed" },
    ],
    canaries: ["Marlo Fennick", "marlo.fennick@example.invalid", "Tavi Bramblequill", "Olin Reedwhorl", "tavi.bramblequill@example.invalid", "TB-RCPT-1"],
    asOf: ON,
    parseVisitor: (value) => ({ ok: value === null || parseAvailability(value).ok }),
    otherKind: "churchyard",
    entry: {
      sheet: WAITING_SHEET_DEF,
      importer: waitingImporter,
      rows: [
        { sourceRef: "WL-1", applicant: "Alder Ashgrove", joinedOn: "2026-02-01" },
        { sourceRef: "WL-2", applicant: "Brindle Ashgrove", joinedOn: "2026-02-01", preferredSection: "Sunny Row" },
        { sourceRef: "WL-3", applicant: "Cove Ashgrove", joinedOn: "2026-02-02", contact: "cove@example.invalid" },
      ],
    },
  };
}

describe("the allotment register has every check, including the import checks", () => {
  it("lists the checks by name", () => {
    const names = conformanceChecks(gardenCase()).map((c) => c.name);
    expect(names).toHaveLength(13);
    expect(names.slice(-2)).toEqual(["staging an import writes nothing, and the import is one revision", "an import repeated adds nothing"]);
  });
});

runConformance(gardenCase());
