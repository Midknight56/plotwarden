// Lantern Fold as hand-totals.md sections 1 and 4 describe it, built through commands.
// Test helper. The template never imports it. The production walkthrough is a separate
// builder, so the two can be compared with the hand worked numbers, not with each other.
import type { ChurchCommand } from "../../apps/churchyard-register/src/types";
import { APPROVED_NAME, CONTACT, LIVING_HOLDERS, OTHER_OCCUPANT } from "./privacyCanaries";
import { ChurchEnv, confirmEmpty, id, layoutYewWalk, plotId, spaceId } from "./churchEnv";

type Bury = Extract<ChurchCommand, { type: "record_burial" }>;

export interface FoldBurial {
  ref: string;
  code?: string;
  space?: number;
  name?: string;
  date: Bury["date"];
  dateText: string;
}

/** Hand totals section 4.1. */
export const FOLD_BURIALS: FoldBurial[] = [
  { ref: "LF-01", code: "Y01", name: "Edda Thornwick", date: { p: "year", y: 1871 }, dateText: "1871" },
  { ref: "LF-04", code: "Y04", name: "Harlan Mossgrove", date: { p: "month", y: 1902, m: 3 }, dateText: "March 1902" },
  { ref: "LF-05", code: "Y05", date: { p: "unknown" }, dateText: "" },
  { ref: "LF-06", code: "Y06", name: "Ysolde Fenwick", date: { p: "day", y: 1938, m: 11, d: 14 }, dateText: "14 November 1938" },
  { ref: "LF-07A", code: "Y07", space: 1, name: APPROVED_NAME, date: { p: "day", y: 1889, m: 6, d: 2 }, dateText: "2 June 1889" },
  { ref: "LF-07B", code: "Y07", space: 2, name: OTHER_OCCUPANT, date: { p: "year", y: 1921 }, dateText: "1921" },
  { ref: "LF-09", code: "Y09", name: "Corwin Aldersey", date: { p: "year", y: 1955 }, dateText: "1955" },
  { ref: "LF-H1", name: "Perrin Gladwyn", date: { p: "year", y: 1790 }, dateText: "1790" },
];

export function burialCommand(b: FoldBurial): Bury {
  const command: Bury = {
    type: "record_burial",
    burialId: id(`burial:${b.ref}`),
    sourceRef: b.ref,
    ...(b.name === undefined ? { nameUnknown: true } : { recordedName: b.name }),
    date: b.date,
    dateText: b.dateText,
  };
  if (b.code !== undefined) {
    command.plotId = plotId(b.code);
    command.spaceId = spaceId(b.code, b.space ?? 1);
    command.claimId = id(`claim:${b.ref}`);
  }
  return command;
}

/** Build the whole fold: burials, two reservations, one unusable plot, three confirmed empty. */
export async function buildFold(env: ChurchEnv, options: { geometry?: boolean } = {}): Promise<void> {
  await layoutYewWalk(env, options);
  await confirmEmpty(env, ["Y02", "Y03", "Y08", "Y10", "Y11", "Y12"]);
  await env.must(FOLD_BURIALS.map(burialCommand));
  await env.must([
    {
      type: "record_reservation",
      reservationId: id("reservation:LF-R1"),
      holderId: id("holder:LF-R1"),
      holderName: LIVING_HOLDERS[0],
      spaceId: spaceId("Y02"),
      claimId: id("claim:LF-R1"),
      start: "2025-09-01",
      sourceRef: "LF-R1",
    },
    {
      type: "record_reservation",
      reservationId: id("reservation:LF-R2"),
      holderId: id("holder:LF-R2"),
      holderName: LIVING_HOLDERS[1],
      contact: CONTACT,
      spaceId: spaceId("Y11"),
      claimId: id("claim:LF-R2"),
      start: "2026-02-14",
      sourceRef: "LF-R2",
    },
    { type: "add_claim", claimId: id("claim:Y12"), spaceId: spaceId("Y12"), mode: "unusable", start: "2026-01-05", endable: true, reason: "Ground unsafe" },
  ]);
}
