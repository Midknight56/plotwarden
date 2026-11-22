// Review facts for the committee: two checks a keeper can send to the Review Desk.
// A fact names its subject by ID and carries a neutral label, never a name, a reading or a source ref.
// Spec 05 wraps these facts in the review packet. Pure.
import type { LocalDate } from "../../../template/src/calendar";
import type { ReviewFact } from "../../../template/src/adapter";
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
