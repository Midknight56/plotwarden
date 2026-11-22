// Queue order. Pure.
import type { LocalDate } from "./calendar";
import type { Uuid } from "./types";

export interface QueueEntry {
  applicationId: Uuid;
  joinedOn: LocalDate;
  /** Fixed when the application is first committed. Never recomputed. */
  sequence: number;
  /** An applicant with a pending offer is not the next eligible one. */
  pending?: boolean;
}

/** The total order `(joinedOn, sequence, applicationId)`. Returns a new array. */
export function orderQueue<T extends QueueEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.joinedOn !== b.joinedOn) return a.joinedOn < b.joinedOn ? -1 : 1;
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    return a.applicationId < b.applicationId ? -1 : a.applicationId > b.applicationId ? 1 : 0;
  });
}

/** The first applicant in order who has no pending offer. */
export function nextEligible<T extends QueueEntry>(entries: readonly T[]): T | undefined {
  return orderQueue(entries).find((e) => e.pending !== true);
}
