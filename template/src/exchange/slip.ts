// Build and read a return slip. Pure. Reading a slip changes nothing.
import type { LocalDate } from "../calendar";
import { LIMITS } from "../limits";
import type { FieldProblem } from "./packet";
import { SLIP_FORMAT, canonical, parseSlip } from "./schema";
import type { ReturnSlip, SlipDecision } from "./schema";

export interface SlipInput {
  siteKey: string;
  lineageId: string;
  packetRevision: number;
  packetAsOf: LocalDate;
  decisions: SlipDecision[];
}

export type BuildSlipResult = { ok: true; slip: ReturnSlip } | { ok: false; fields: FieldProblem[] };

/** Build a slip, key by key. The decisions keep the order they are given in. */
export function buildSlip(input: SlipInput): BuildSlipResult {
  const written: ReturnSlip = {
    format: SLIP_FORMAT,
    siteKey: input.siteKey,
    lineageId: input.lineageId,
    packetRevision: input.packetRevision,
    packetAsOf: input.packetAsOf,
    decisions: input.decisions.map((d) => ({
      actionId: d.actionId,
      issueKey: d.issueKey,
      factVersion: d.factVersion,
      disposition: d.disposition,
      reviewedOn: d.reviewedOn,
    })),
  };
  const checked = parseSlip(written);
  if (checked.ok) return { ok: true, slip: checked.value };
  return { ok: false, fields: checked.issues.map((issue) => ({ field: issue.path, code: issue.code })) };
}

export type EncodeSlipResult = { ok: true; text: string; bytes: number } | { ok: false; code: "too_big"; bytes: number };

export function encodeSlip(slip: ReturnSlip): EncodeSlipResult {
  const text = canonical(slip);
  const bytes = new TextEncoder().encode(text).length;
  return bytes > LIMITS.reviewPacketBytes ? { ok: false, code: "too_big", bytes } : { ok: true, text, bytes };
}

export interface SlipContext {
  siteKey: string;
  lineageId: string;
  /** The checks that are open now, with the fact version the next export would give. */
  open: readonly { issueKey: string; factVersion: number }[];
  /** Action IDs already received. */
  received: readonly string[];
}

export type SlipStatus = "received" | "closed" | "changed" | "ready";

export interface SlipRow extends SlipDecision {
  status: SlipStatus;
}

export type SlipReading =
  | { ok: false; code: "other_register" }
  | { ok: true; rows: SlipRow[]; counts: Record<SlipStatus, number> };

/**
 * Read each decision against the open checks, in the order of design D11: already received, closed,
 * changed, otherwise ready. A slip for another site key or lineage is refused whole.
 */
export function readSlip(slip: ReturnSlip, context: SlipContext): SlipReading {
  if (slip.siteKey !== context.siteKey || slip.lineageId !== context.lineageId) return { ok: false, code: "other_register" };
  const received = new Set(context.received);
  const open = new Map(context.open.map((o) => [o.issueKey, o.factVersion]));
  const counts: Record<SlipStatus, number> = { ready: 0, changed: 0, closed: 0, received: 0 };
  const rows = slip.decisions.map((decision): SlipRow => {
    const current = open.get(decision.issueKey);
    const status: SlipStatus = received.has(decision.actionId)
      ? "received"
      : current === undefined
        ? "closed"
        : current > decision.factVersion
          ? "changed"
          : "ready";
    counts[status] += 1;
    return {
      actionId: decision.actionId,
      issueKey: decision.issueKey,
      factVersion: decision.factVersion,
      disposition: decision.disposition,
      reviewedOn: decision.reviewedOn,
      status,
    };
  });
  return { ok: true, rows, counts };
}

/** A name of kind and date, never a private value. */
export function slipFileName(date: LocalDate): string {
  return `committee-return-${date}.json`;
}
