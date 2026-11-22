// The committee exchange files: `plot.review.v1` and `plot.slip.v1`. Closed shapes. Pure.
// This file imports no private record type. A packet or a slip is built field by field and parsed
// with a schema that rejects any other key at every depth.
import { z } from "zod";
import { isValidLocalDate } from "../calendar";
import type { LocalDate } from "../calendar";
import { LIMITS } from "../limits";

export const REVIEW_FORMAT = "plot.review.v1" as const;
export const SLIP_FORMAT = "plot.slip.v1" as const;

export const RULES = ["placement_missing", "reading_unclear", "offer_late", "fee_late"] as const;
export type Rule = (typeof RULES)[number];

export const ACTIONS = ["check_location", "read_stone_again", "check_reply", "check_payment"] as const;
export type Action = (typeof ACTIONS)[number];

/** Design D10: each rule has one action. */
export const ACTION_FOR_RULE: Readonly<Record<Rule, Action>> = Object.freeze({
  placement_missing: "check_location",
  reading_unclear: "read_stone_again",
  offer_late: "check_reply",
  fee_late: "check_payment",
});

export const DISPOSITIONS = ["checked", "needs_keeper"] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export interface ReviewIssue {
  issueKey: string;
  subjectKey: string;
  label: string;
  rule: Rule;
  factVersion: number;
  action: Action;
}

/** `plot.review.v1`. Design D10. */
export interface ReviewPacket {
  format: typeof REVIEW_FORMAT;
  siteKind: string;
  siteKey: string;
  lineageId: string;
  siteAlias: string;
  revision: number;
  asOf: LocalDate;
  issues: ReviewIssue[];
}

export interface SlipDecision {
  actionId: string;
  issueKey: string;
  factVersion: number;
  disposition: Disposition;
  reviewedOn: LocalDate;
}

/** `plot.slip.v1`. Design D11. */
export interface ReturnSlip {
  format: typeof SLIP_FORMAT;
  siteKey: string;
  lineageId: string;
  packetRevision: number;
  packetAsOf: LocalDate;
  decisions: SlipDecision[];
}

export type ParseCode =
  | "unrecognized_keys"
  | "invalid"
  | "duplicate_issue_key"
  | "duplicate_subject_rule"
  | "wrong_action"
  | "duplicate_action_id";

export interface ParseIssue {
  /** Where the problem is, for example `issues.0.rule`. Empty for the top level. */
  path: string;
  code: ParseCode;
  /** The keys that should not be there, for `unrecognized_keys`. */
  keys?: string[];
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: ParseIssue[] };

const length = (s: string): number => [...s].length;
/** Any UUID shape. Zod's own `uuid` also checks version bits, which a key made elsewhere need not have. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = z.string().regex(UUID);
const words = (max: number) => z.string().refine((s) => s.trim() !== "" && length(s) <= max, { message: "bad text" });
const date = z.string().refine(isValidLocalDate, { message: "not a date" });
const version = z.number().int().min(1);

const issueSchema = z.strictObject({
  issueKey: key,
  subjectKey: key,
  label: words(LIMITS.reviewLabelChars),
  rule: z.enum(RULES),
  factVersion: version,
  action: z.enum(ACTIONS),
});

const packetSchema = z.strictObject({
  format: z.literal(REVIEW_FORMAT),
  siteKind: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
  siteKey: key,
  lineageId: key,
  siteAlias: words(LIMITS.siteAliasChars),
  revision: version,
  asOf: date,
  issues: z.array(issueSchema).max(LIMITS.reviewIssues),
});

const decisionSchema = z.strictObject({
  actionId: key,
  issueKey: key,
  factVersion: version,
  disposition: z.enum(DISPOSITIONS),
  reviewedOn: date,
});

const slipSchema = z.strictObject({
  format: z.literal(SLIP_FORMAT),
  siteKey: key,
  lineageId: key,
  packetRevision: version,
  packetAsOf: date,
  decisions: z.array(decisionSchema).max(LIMITS.slipDecisions),
});

/** Zod's own codes are many. The exchange tells only two apart: an unknown key, and everything else. */
function shapeIssues(error: z.ZodError): ParseIssue[] {
  return error.issues.map((issue): ParseIssue => {
    const found: ParseIssue = { path: issue.path.join("."), code: issue.code === "unrecognized_keys" ? "unrecognized_keys" : "invalid" };
    if (issue.code === "unrecognized_keys") found.keys = [...issue.keys];
    return found;
  });
}

/** What a shape cannot say: one issue key, one issue for a subject and rule, the action of the rule. */
function packetRules(packet: ReviewPacket): ParseIssue[] {
  const found: ParseIssue[] = [];
  const keys = new Set<string>();
  const subjects = new Set<string>();
  packet.issues.forEach((issue, i) => {
    if (issue.action !== ACTION_FOR_RULE[issue.rule]) found.push({ path: `issues.${i}.action`, code: "wrong_action" });
    if (keys.has(issue.issueKey)) found.push({ path: `issues.${i}.issueKey`, code: "duplicate_issue_key" });
    keys.add(issue.issueKey);
    const pair = `${issue.subjectKey}|${issue.rule}`;
    if (subjects.has(pair)) found.push({ path: `issues.${i}.rule`, code: "duplicate_subject_rule" });
    subjects.add(pair);
  });
  return found;
}

function slipRules(slip: ReturnSlip): ParseIssue[] {
  const found: ParseIssue[] = [];
  const seen = new Set<string>();
  slip.decisions.forEach((decision, i) => {
    if (seen.has(decision.actionId)) found.push({ path: `decisions.${i}.actionId`, code: "duplicate_action_id" });
    seen.add(decision.actionId);
  });
  return found;
}

/** Parse a review packet. Any key not in design D10 is refused at every depth. */
export function parsePacket(value: unknown): ParseResult<ReviewPacket> {
  const shape = packetSchema.safeParse(value);
  if (!shape.success) return { ok: false, issues: shapeIssues(shape.error) };
  const packet = shape.data as ReviewPacket;
  const rules = packetRules(packet);
  return rules.length > 0 ? { ok: false, issues: rules } : { ok: true, value: packet };
}

/** Parse a return slip. Any key not in design D11 is refused at every depth. */
export function parseSlip(value: unknown): ParseResult<ReturnSlip> {
  const shape = slipSchema.safeParse(value);
  if (!shape.success) return { ok: false, issues: shapeIssues(shape.error) };
  const slip = shape.data as ReturnSlip;
  const rules = slipRules(slip);
  return rules.length > 0 ? { ok: false, issues: rules } : { ok: true, value: slip };
}

export type ReadFailureCode = "too_big" | "not_json" | "wrong_file" | "newer_version" | "unknown_format" | "invalid";

export type ExchangeFile =
  | { ok: true; form: "review"; packet: ReviewPacket }
  | { ok: true; form: "slip"; slip: ReturnSlip }
  | { ok: false; code: ReadFailureCode; found?: "backup" | "visitor" | "other"; issues?: ParseIssue[] };

const VISITOR_FORMATS: ReadonlySet<string> = new Set(["plot.family.v1", "plot.availability.v1"]);
const OTHER_FORMATS: ReadonlySet<string> = new Set(["plot.layout.v1", "plot.draft.v1"]);

/** Decide what a file is from its bytes, never from its name. */
export function readExchangeFile(bytes: Uint8Array): ExchangeFile {
  if (bytes.length > LIMITS.reviewPacketBytes) return { ok: false, code: "too_big" };
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return { ok: false, code: "wrong_file", found: "backup" };
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, code: "not_json" };
  }
  const format = value !== null && typeof value === "object" && !Array.isArray(value) ? (value as { format?: unknown }).format : undefined;
  if (typeof format !== "string") return { ok: false, code: "unknown_format" };
  if (format === REVIEW_FORMAT) {
    const parsed = parsePacket(value);
    return parsed.ok ? { ok: true, form: "review", packet: parsed.value } : { ok: false, code: "invalid", issues: parsed.issues };
  }
  if (format === SLIP_FORMAT) {
    const parsed = parseSlip(value);
    return parsed.ok ? { ok: true, form: "slip", slip: parsed.value } : { ok: false, code: "invalid", issues: parsed.issues };
  }
  if (VISITOR_FORMATS.has(format)) return { ok: false, code: "wrong_file", found: "visitor" };
  if (format === "plot.backup.v1") return { ok: false, code: "wrong_file", found: "backup" };
  if (OTHER_FORMATS.has(format)) return { ok: false, code: "wrong_file", found: "other" };
  const later = /^plot\.(?:review|slip)\.v(\d+)$/.exec(format);
  if (later !== null && Number(later[1]) > 1) return { ok: false, code: "newer_version" };
  return { ok: false, code: "unknown_format" };
}

function write(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new RangeError("Cannot write a number that is not finite");
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map((item) => write(item) ?? "null").join(",")}]`;
      const record = value as Record<string, unknown>;
      const parts: string[] = [];
      for (const name of Object.keys(record).sort()) {
        const text = write(record[name]);
        if (text !== undefined) parts.push(`${JSON.stringify(name)}:${text}`);
      }
      return `{${parts.join(",")}}`;
    }
    default:
      throw new TypeError(`Cannot write a ${typeof value} value`);
  }
}

/** JSON with sorted keys and no spaces. The one place the exchange writes JSON text. */
export function canonical(value: unknown): string {
  return write(value) ?? "null";
}

/**
 * The text of a packet with its issues in issue key order, so equal content gives equal bytes
 * whichever way the sender ordered the list.
 */
export function canonicalPacket(packet: ReviewPacket): string {
  return canonical({ ...packet, issues: [...packet.issues].sort((a, b) => (a.issueKey < b.issueKey ? -1 : a.issueKey > b.issueKey ? 1 : 0)) });
}
