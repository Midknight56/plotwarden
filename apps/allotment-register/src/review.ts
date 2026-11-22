// Review facts for the committee: two checks a secretary can send to the Review Desk.
// A fact names its subject by ID and carries a neutral label, never a name, an amount or a plot code.
// Spec 05 wraps these facts in the review packet. Pure.
import type { LocalDate } from "../../../template/src/calendar";
import type { ReviewFact } from "../../../template/src/adapter";
import { chargeSummary } from "./fees";
import { isOverdue } from "./rules";
import type { AllotState } from "./types";

/** `offer_late` for each open offer past its reply date, then `fee_late` for each charge past its due date with a balance. */
export function allotReviewFacts(state: AllotState, asOf: LocalDate): ReviewFact[] {
  const late = Object.values(state.offers)
    .filter((offer) => isOverdue(offer, asOf))
    .sort((a, b) => (a.offerId < b.offerId ? -1 : 1))
    .map((offer) => ({ rule: "offer_late", subjectId: offer.offerId }));
  const unpaid = Object.values(state.ledger)
    .filter((entry) => entry.type === "charge" && chargeSummary(state, entry.entryId, asOf)?.status === "overdue")
    .sort((a, b) => (a.entryId < b.entryId ? -1 : 1))
    .map((entry) => ({ rule: "fee_late", subjectId: entry.entryId }));
  return [...late, ...unpaid].map((fact, index) => ({ ...fact, label: `Record ${index + 1}` }));
}