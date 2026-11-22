// Review facts for the committee: two checks a secretary can send to the Review Desk.
// A fact names its subject by ID and carries a neutral label, never a name, an amount or a plot code.
// Spec 05 wraps these facts in the review packet. Pure.
import type { LocalDate } from "../../../template/src/calendar";
import type { ReviewFact, ReviewSource, ReviewSupport } from "../../../template/src/adapter";
import { fingerprint } from "../../../template/src/review";
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

/** The values each check depends on. A change in any of them raises the fact version at the next export. */
function allotReviewSources(state: AllotState, asOf: LocalDate): ReviewSource[] {
  return allotReviewFacts(state, asOf).map((fact): ReviewSource => {
    const offer = state.offers[fact.subjectId];
    const summary = fact.rule === "fee_late" ? chargeSummary(state, fact.subjectId, asOf) : undefined;
    const parts =
      fact.rule === "offer_late" && offer !== undefined
        ? [offer.replyBy ?? "", offer.plotId, offer.applicationId]
        : summary !== undefined
          ? [String(summary.charged), String(summary.balance), summary.dueOn ?? ""]
          : [];
    return { ...fact, fingerprint: fingerprint([fact.rule, ...parts]) };
  });
}

/** Every private string a label must not hold, at least three characters long, each once. */
function allotPrivateStrings(state: AllotState): string[] {
  const words = new Set<string>();
  const add = (text: string | undefined): void => {
    const word = (text ?? "").trim();
    if (word.length >= 3) words.add(word);
  };
  for (const person of Object.values(state.people)) {
    add(person.displayName);
    add(person.contact);
  }
  for (const application of Object.values(state.applications)) add(application.sourceRef);
  for (const tenancy of Object.values(state.tenancies)) add(tenancy.sourceRef);
  for (const entry of Object.values(state.ledger)) {
    add(entry.ref);
    add(entry.reason);
    add(entry.waiver);
  }
  return [...words];
}

/** The names of people a label must not hold even one word of. */
function allotPrivateNames(state: AllotState): string[] {
  return [...new Set(Object.values(state.people).map((p) => p.displayName.trim()).filter((n) => n !== ""))];
}

/** The staff screen of the record behind a check. */
function allotReviewLink(_state: AllotState, source: { rule: string; subjectId: string }): string | undefined {
  if (source.rule === "offer_late") return "offer";
  if (source.rule === "fee_late") return "payments";
  return undefined;
}

/** What the Exchange screen needs from this app: checks with fingerprints, private words, and record routes. */
export const allotReviewSupport: ReviewSupport<AllotState> = {
  sources: allotReviewSources,
  privateStrings: allotPrivateStrings,
  privateNames: allotPrivateNames,
  link: allotReviewLink,
};