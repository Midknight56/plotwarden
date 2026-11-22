// Review facts for the committee: two checks a keeper can send to the Review Desk.
// A fact names its subject by ID and carries a neutral label, never a name, a reading or a source ref.
// Spec 05 wraps these facts in the review packet. Pure.
import type { LocalDate } from "../../../template/src/calendar";
import type { ReviewFact, ReviewSource, ReviewSupport } from "../../../template/src/adapter";
import { fingerprint } from "../../../template/src/review";
import type { ChurchState } from "./types";

export function churchReviewFacts(state: ChurchState, _asOf: LocalDate): ReviewFact[] {
  const live = Object.values(state.burials).filter((b) => b.voided !== true);
  const missing = live
    .filter((b) => b.spaceId === undefined)
    .sort((a, b) => (a.burialId < b.burialId ? -1 : 1))
    .map((b) => ({ rule: "placement_missing", subjectId: b.burialId }));
  const unclear = Object.values(state.memorials)
    .filter((m) => m.unclear && live.some((b) => b.burialId === m.burialId))
    .sort((a, b) => (a.memorialId < b.memorialId ? -1 : 1))
    .map((m) => ({ rule: "reading_unclear", subjectId: m.memorialId }));
  return [...missing, ...unclear].map((fact, index) => ({ ...fact, label: `Record ${index + 1}` }));
}

/** The words each check depends on. A change in any of them raises the fact version at the next export. */
function churchReviewSources(state: ChurchState, asOf: LocalDate): ReviewSource[] {
  return churchReviewFacts(state, asOf).map((fact): ReviewSource => {
    const burial = state.burials[fact.subjectId];
    const memorial = state.memorials[fact.subjectId];
    const parts =
      fact.rule === "placement_missing" && burial !== undefined
        ? [burial.sourceRef, burial.recordedName ?? "", burial.nameUnknown ? "unknown" : "known", JSON.stringify(burial.date)]
        : memorial !== undefined
          ? [memorial.reading, memorial.pageRef ?? ""]
          : [];
    return { ...fact, fingerprint: fingerprint([fact.rule, ...parts]) };
  });
}

/** Every private string a label must not hold, at least three characters long, each once. */
function churchPrivateStrings(state: ChurchState): string[] {
  const words = new Set<string>();
  const add = (text: string | undefined): void => {
    const word = (text ?? "").trim();
    if (word.length >= 3) words.add(word);
  };
  for (const person of Object.values(state.people)) {
    add(person.displayName);
    add(person.contact);
  }
  for (const burial of Object.values(state.burials)) {
    add(burial.recordedName);
    add(burial.sourceRef);
    add(burial.page);
    for (const ref of burial.correctionRefs) add(ref);
  }
  for (const reservation of Object.values(state.reservations)) add(reservation.sourceRef);
  for (const request of Object.values(state.requests)) add(request.note);
  for (const memorial of Object.values(state.memorials)) {
    add(memorial.pageRef);
    for (const line of memorial.reading.split(/\r?\n/)) add(line);
  }
  for (const approval of Object.values(state.approvals)) add(approval.name);
  return [...words];
}

/** The staff screen of the record behind a check. An unplaced burial goes to the unplaced list. */
function churchReviewLink(state: ChurchState, source: { rule: string; subjectId: string }): string | undefined {
  if (source.rule === "placement_missing") {
    const burial = state.burials[source.subjectId];
    if (burial === undefined) return undefined;
    return burial.spaceId === undefined ? "unplaced" : `burial/${burial.burialId}`;
  }
  if (source.rule === "reading_unclear") {
    const memorial = state.memorials[source.subjectId];
    return memorial === undefined ? undefined : `burial/${memorial.burialId}`;
  }
  return undefined;
}

/** What the Exchange screen needs from this app: checks with fingerprints, private words, and record routes. */
export const churchReviewSupport: ReviewSupport<ChurchState> = {
  sources: churchReviewSources,
  privateStrings: churchPrivateStrings,
  link: churchReviewLink,
};