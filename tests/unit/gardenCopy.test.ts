// The Allotment copy catalog (spec 04, task 4.11, T35 for this app). Every word the plan's Allotment Register
// table gives is typed here from the plan, not read from the catalog. No dash between words, and every error
// code an allotment command can give has words.
import { describe, expect, it } from "vitest";
import { COPY, fill } from "../../template/src/ui/copy";
import { ALLOT_COPY, allotError, availabilityWords, paymentMessage } from "../../apps/allotment-register/src/copy";
import { AVAILABILITY_WORDS } from "../helpers/availabilityWords";

const ALL: Readonly<Record<string, string>> = { ...COPY, ...ALLOT_COPY };
const say = (key: string, values?: Record<string, string | number>): string => fill(ALL[key] ?? key, values ?? {});

const PLAN: [string, string][] = [
  // The library and the desk
  ["libraryPrompt", "Offer the next free plot or start your register."],
  ["openWalkthrough", "Open Thimble Beds"],
  ["restartWalkthrough", "Restart walkthrough"],
  ["nextFreePlot", "Next free plot"],
  ["nextApplicant", "Next applicant"],
  ["makeOffer", "Make an offer"],
  ["waitingList", "Waiting list"],
  ["currentTenancies", "Current tenancies"],
  ["seasonFees", "Season fees"],
  ["makeAvailabilityMap", "Make an availability map"],
  // The waiting list
  ["addApplicant", "Add applicant"],
  ["applicantLabel", "Applicant"],
  ["contactDetails", "Contact details"],
  ["joinedDate", "Joined date"],
  ["preferredSection", "Preferred section"],
  ["positionLabel", "Position"],
  ["viewRequest", "View request"],
  ["withdrawRequest", "Withdraw request"],
  ["reasonLabel", "Reason"],
  ["showHistory", "Show history"],
  ["noOneWaiting", "No one is waiting."],
  ["nextEligible", "Next eligible applicant"],
  ["alreadyOpenRequest", "Already has an open request"],
  // The offer
  ["chooseFreePlot", "Choose a free plot"],
  ["offerTo", "Offer to"],
  ["joinedLabel", "Joined"],
  ["replyBy", "Reply by"],
  ["whySkip", "Why skip this applicant?"],
  ["reviewOffer", "Review offer"],
  ["recordOffer", "Record offer"],
  ["acceptOffer", "Accept offer"],
  ["declineOffer", "Decline offer"],
  ["releaseOverdueOffer", "Release overdue offer"],
  ["offerReserved", "{plot} reserved for {name}."],
  ["tellApplicant", "Tell the applicant yourself."],
  ["keepPlace", "Keep place"],
  ["leaveList", "Leave list"],
  ["replyOverdue", "Reply overdue"],
  // Tenancy and handover
  ["plotHolder", "Plot holder"],
  ["tenancyBegins", "Tenancy begins"],
  ["tenancyEnds", "Tenancy ends"],
  ["previousHolder", "Previous holder"],
  ["newHolder", "New holder"],
  ["outstandingBalance", "Outstanding balance"],
  ["endTenancy", "End tenancy"],
  ["handOverPlot", "Hand over plot"],
  ["reviewHandover", "Review handover"],
  ["confirmHandover", "Confirm handover"],
  // Season setup
  ["newSeason", "New season"],
  ["seasonName", "Season name"],
  ["startDate", "Start date"],
  ["endDate", "End date"],
  ["dueDate", "Due date"],
  ["standardFee", "Standard fee"],
  ["selectTenancies", "Select tenancies"],
  ["previewCharges", "Preview charges"],
  ["applyCharges", "Apply charges"],
  ["waiveFee", "Waive fee"],
  // Fees and receipt
  ["feeDue", "Due"],
  ["feePartPaid", "Part paid"],
  ["feePaid", "Paid"],
  ["feeOverdue", "Overdue"],
  ["amountCharged", "Amount charged"],
  ["amountReceived", "Amount received"],
  ["stillDue", "Still due"],
  ["paymentDate", "Payment date"],
  ["receiptReference", "Receipt reference"],
  ["recordPayment", "Record payment"],
  ["reversePayment", "Reverse payment"],
  ["showPreviousSeasons", "Show previous seasons"],
  ["paidInFull", "Paid in full."],
  // Garden reports
  ["seasonReport", "Season report"],
  ["seasonLabel", "Season"],
  ["asAtLabel", "As at"],
  ["plotHandovers", "Plot handovers"],
  ["waitingListOrder", "Waiting list order"],
  ["feesCharged", "Fees charged"],
  ["feesReceived", "Fees received"],
  ["balanceDue", "Balance due"],
  ["printPrivateReport", "Print private report"],
  ["downloadPrivateCsv", "Download private CSV"],
  // The availability map
  ["availabilityMap", "Availability map"],
  ["chooseFreePlots", "Choose free plots"],
  ["visitorInstructions", "Visitor instructions"],
  ["previewAsVisitor", "Preview as a visitor"],
  ["downloadAvailabilityCopy", "Download availability copy"],
  ["printAvailabilityMap", "Print availability map"],
  ["availablePlots", "Available plots"],
  ["chooseSection", "Choose section"],
  ["showLocation", "Show location"],
  ["askSecretary", "Ask the secretary about this plot"],
  ["asAt", "As at {date}"],
  ["noFreePlotsListed", "No free plots were listed on this date."],
  ["reviewPublicAgain", "Review public details again."],
];

describe("the words of the plan's Allotment Register tables", () => {
  it.each(PLAN)("%s says exactly what the plan says", (key, text) => {
    expect(ALL[key]).toBe(text);
  });
});

describe("the catalog rules (R23.1)", () => {
  const entries = Object.entries(ALLOT_COPY);

  it("has entries, and none is empty", () => {
    expect(entries.length).toBeGreaterThan(PLAN.length);
    for (const [key, text] of entries) expect(text.trim(), key).not.toBe("");
  });

  it.each(entries)("%s has no dash between words, no long dash and no hyphenated word", (key, text) => {
    expect(text, key).not.toMatch(/[\u2013\u2014]/);
    expect(text, key).not.toMatch(/\s-\s/);
    expect(text, key).not.toMatch(/\p{L}-\p{L}/u);
  });

  it("never claims a page was printed", () => {
    for (const [key, value] of entries) expect(value, key).not.toMatch(/\bprinted\b/i);
  });

  it("keeps the middle dot as the only separator in a summary", () => {
    expect(say("summaryLine", { code: "B03", section: "Sunny Row", state: "Free" })).toBe("B03 · Sunny Row · Free");
  });

  it("names the app by its plan title", () => {
    expect(say("appTitle")).toBe("Allotment Register");
  });
});

describe("the words of the availability file", () => {
  it("are the catalog words, key by key", () => {
    expect(availabilityWords()).toEqual(AVAILABILITY_WORDS);
  });
});

describe("the messages after a payment (hand totals 2.3)", () => {
  it("says what was recorded and what is still due, then Paid in full", () => {
    expect(paymentMessage(say, 1200, 2400, "GBP")).toBe("GBP 12.00 recorded. GBP 24.00 still due.");
    expect(paymentMessage(say, 2400, 0, "GBP")).toBe("Paid in full.");
    expect(paymentMessage(say, 500, 100, "EUR")).toBe("EUR 5.00 recorded. EUR 1.00 still due.");
  });
});

describe("the words of an error (A10.2)", () => {
  const cases: [string, Record<string, string | number>, string][] = [
    ["open_request", {}, "Already has an open request"],
    ["no_such_application", {}, "That applicant is not in this register."],
    ["not_waiting", {}, "This applicant is not waiting."],
    ["offer_open", {}, "This plot or this applicant already has an open offer."],
    ["offer_closed", {}, "This offer is already closed."],
    ["no_such_offer", {}, "That offer is not in this register."],
    ["not_overdue", {}, "This offer is not overdue."],
    ["skip_reason_required", {}, "Say why this applicant is skipped."],
    ["plot_not_free", { sourceRef: "TB-LATER", start: "2026-09-01" }, "This plot is not free then. Source TB-LATER, from 2026-09-01."],
    ["plot_not_free", {}, "This plot is not free then."],
    ["tenancy_overlap", { sourceRef: "TB-T2", start: "2025-04-01" }, "This plot already has a tenancy then. Source TB-T2, from 2025-04-01."],
    ["tenancy_overlap", {}, "This plot already has a tenancy then."],
    ["tenancy_ended", {}, "This tenancy has already ended."],
    ["no_such_tenancy", {}, "That tenancy is not in this register."],
    ["no_such_space", {}, "That plot is not in this register."],
    ["no_such_season", {}, "That season is not in this register."],
    ["season_exists", {}, "A season with that name is already in this register."],
    ["not_in_season", {}, "This tenancy was not open in that season."],
    ["already_charged", {}, "These tenancies are already charged for this season."],
    ["no_currency", {}, "Choose the currency for this garden."],
    ["currency_fixed", {}, "The currency cannot change once a charge exists."],
    ["charge_has_receipts", {}, "This charge still has payments. Reverse the payments first."],
    ["charge_reversed", {}, "This charge was reversed."],
    ["already_reversed", {}, "This entry was already reversed."],
    ["not_reversible", {}, "This entry cannot be reversed."],
    ["no_such_entry", {}, "That entry is not in this register."],
    ["sequence_used", {}, "That place in the list is already used."],
    ["cannot_correct", {}, "Change this row in the register. An import cannot correct it."],
    ["unknown_section", {}, "Choose a section that is in this register."],
    ["exceeds_balance", { amount: "GBP 24.00" }, "Amount exceeds the balance of GBP 24.00."],
    ["space_taken", {}, "This plot is already taken."],
  ];
  it.each(cases)("%s has words", (code, detail, text) => {
    expect(allotError(say, { code, detail })).toBe(text);
  });

  it("falls back to the shared words for a code it does not own", () => {
    expect(allotError(say, { code: "invalid_date" })).toBe("Use a valid date.");
  });

  it("says which field is wrong for an input error, with the label of the screen", () => {
    const field = (name: string, code: string) => allotError(say, { code: "invalid_input", fields: [{ field: name, code }] });
    expect(field("applicant", "required")).toBe("Enter Applicant.");
    expect(field("joinedOn", "invalid_date")).toBe("Use a valid date.");
    expect(field("holder", "required")).toBe("Enter Plot holder.");
    expect(field("start", "required")).toBe("Enter Tenancy begins.");
    expect(field("seasonName", "required")).toBe("Enter Season name.");
    expect(field("amount", "required")).toBe("Enter Amount received.");
    expect(field("amount", "bad_amount")).toBe("Enter an amount such as 12.00.");
    expect(field("standardFee", "bad_amount")).toBe("Enter an amount such as 12.00.");
    expect(field("reason", "required")).toBe("Enter Reason.");
    expect(field("choice", "required")).toBe("Choose Keep place or Leave list.");
    expect(field("replyBy", "bad_interval")).toBe("Check Reply by. That date is out of order.");
    expect(field("end", "bad_interval")).toBe("Check Tenancy ends. That date is out of order.");
    expect(field("applicant", "over_limit")).toBe("Check Applicant. That is more than is allowed.");
    expect(allotError(say, { code: "skip_reason_required", fields: [{ field: "skipReason:abc", code: "required" }] })).toBe("Say why this applicant is skipped.");
  });
});
