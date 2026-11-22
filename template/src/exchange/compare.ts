// Compare a current packet with an incoming one from the same keeper. Pure.
// The rules are those of design D11 of spec 00. The Desk reuses them from its pinned copy.
import { canonicalPacket } from "./schema";
import type { ReviewIssue, ReviewPacket } from "./schema";

export interface PacketChanges {
  new: string[];
  stillOpen: string[];
  changed: string[];
  noLongerFlagged: string[];
}

export type Comparison =
  | { relation: "different_source" }
  | { relation: "same" }
  | { relation: "stale" }
  | { relation: "conflict" }
  | { relation: "replace"; changes: PacketChanges };

/** The source of a packet: its site key and lineage. */
export function sourceKey(packet: ReviewPacket): string {
  return `${packet.siteKey}|${packet.lineageId}`;
}

/** One check anywhere: its source and its issue key. The same issue key in two sources is two checks. */
export function itemKey(packet: ReviewPacket, issue: Pick<ReviewIssue, "issueKey">): string {
  return `${sourceKey(packet)}|${issue.issueKey}`;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function comparePackets(current: ReviewPacket, incoming: ReviewPacket): Comparison {
  if (sourceKey(current) !== sourceKey(incoming)) return { relation: "different_source" };
  if (canonicalPacket(current) === canonicalPacket(incoming)) return { relation: "same" };
  if (incoming.revision < current.revision || incoming.asOf < current.asOf) return { relation: "stale" };
  if (incoming.revision === current.revision && incoming.asOf === current.asOf) return { relation: "conflict" };

  const before = new Map(current.issues.map((i) => [i.issueKey, i.factVersion]));
  const after = new Map(incoming.issues.map((i) => [i.issueKey, i.factVersion]));
  const changes: PacketChanges = { new: [], stillOpen: [], changed: [], noLongerFlagged: [] };
  for (const [issueKey, factVersion] of after) {
    const was = before.get(issueKey);
    if (was === undefined) changes.new.push(issueKey);
    else if (was === factVersion) changes.stillOpen.push(issueKey);
    else changes.changed.push(issueKey);
  }
  for (const issueKey of before.keys()) if (!after.has(issueKey)) changes.noLongerFlagged.push(issueKey);
  for (const list of Object.values(changes)) list.sort(byText);
  return { relation: "replace", changes };
}
