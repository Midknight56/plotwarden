// The steps between the Exchange screen and the pure rules: plan an export, read a return slip.
// No React and no storage. The screen commits the command and hands out the file.
import type { RegisterAdapter, ReviewSource } from "../adapter";
import type { BaseState } from "../base";
import { isValidLocalDate } from "../calendar";
import type { LocalDate } from "../calendar";
import { encodePacket, buildPacket, checkLabelText, previewPacket } from "../exchange/packet";
import type { FieldProblem, PacketPreview } from "../exchange/packet";
import { readExchangeFile } from "../exchange/schema";
import type { ReviewPacket, ReturnSlip, Rule } from "../exchange/schema";
import { readSlip } from "../exchange/slip";
import type { SlipRow, SlipStatus } from "../exchange/slip";
import { LIMITS } from "../limits";
import { openIssuesNow, planReviewKeys } from "../review";
import type { KeySource, PlannedIssue, ReviewCommand } from "../review";
import type { Site, Uuid } from "../types";

/** The part of an adapter the exchange reads. */
export type ExchangeAdapter = Pick<RegisterAdapter<BaseState, { type: string }, { type: string }>, "review" | "reviewFacts">;

export interface PlanInput {
  site: Site;
  state: BaseState;
  /** The revision the keeper is looking at. */
  revision: number;
  adapter: ExchangeAdapter;
  asOf: LocalDate;
  /** As typed. Trimmed here. */
  alias: string;
  /** Labels as typed, by the private ID of the subject. An empty text means keep the stored or default label. */
  labels: Readonly<Record<Uuid, string>>;
  mint: () => Uuid;
}

export interface ExchangePlan {
  asOf: LocalDate;
  /** The revision this plan was made against. A commit must expect it. */
  basedOn: number;
  /** The revision of the packet: `basedOn`, plus one when the ledger changes. */
  packetRevision: number;
  /** One operation ID for the whole intent, so a repeat press commits once. */
  opId: Uuid;
  /** The `prepare_review` command, or none when the ledger already holds everything. */
  command?: Extract<ReviewCommand, { type: "prepare_review" }>;
  issues: PlannedIssue[];
  packet: ReviewPacket;
  preview: PacketPreview;
  /** The file text. */
  text: string;
}

export type PlanResult =
  | { ok: true; plan: ExchangePlan }
  | { ok: false; code: "empty_register" | "too_big" }
  | { ok: false; code: "invalid"; fields: FieldProblem[] };

/** The checks of an adapter, with a fingerprint. An adapter with no review support never raises a version. */
function sourcesOf(adapter: ExchangeAdapter, state: BaseState, asOf: LocalDate): ReviewSource[] {
  if (adapter.review !== undefined) return adapter.review.sources(state, asOf);
  return adapter.reviewFacts(state, asOf).map((fact) => ({ ...fact, fingerprint: "" }));
}

const keyOf = (source: ReviewSource): KeySource => ({ rule: source.rule, subjectId: source.subjectId, fingerprint: source.fingerprint });

/**
 * Plan an export: check every typed word, work out the keys, and build the exact packet. It commits
 * nothing. The keeper sees the plan, and a download commits its command and then writes its text.
 */
export function planExchange(input: PlanInput): PlanResult {
  const { site, state, adapter } = input;
  if (input.revision < 1) return { ok: false, code: "empty_register" };
  if (!isValidLocalDate(input.asOf)) return { ok: false, code: "invalid", fields: [{ field: "asOf", code: "invalid_date" }] };

  const sources = sourcesOf(adapter, state, input.asOf);
  const known = [...(adapter.review?.privateStrings(state) ?? []), site.title];
  const problems: FieldProblem[] = [];

  const alias = input.alias.trim();
  const aliasProblem = checkLabelText(alias, known, LIMITS.siteAliasChars);
  if (aliasProblem !== undefined) problems.push({ field: "alias", code: aliasProblem });

  const approved: Record<Uuid, string> = {};
  for (const source of sources) {
    const typed = input.labels[source.subjectId]?.trim() ?? "";
    if (typed === "" || approved[source.subjectId] !== undefined) continue;
    const problem = checkLabelText(typed, known);
    if (problem === undefined) approved[source.subjectId] = typed;
    else problems.push({ field: `label:${source.subjectId}`, code: problem });
  }
  if (problems.length > 0) return { ok: false, code: "invalid", fields: problems };

  const keys = planReviewKeys(state.review, sources.map(keyOf), { mint: input.mint, labels: approved, alias });
  const packetRevision = input.revision + (keys.changed ? 1 : 0);
  const built = buildPacket({
    siteKind: site.kind,
    siteKey: site.siteKey,
    lineageId: site.lineageId,
    siteAlias: alias,
    revision: packetRevision,
    asOf: input.asOf,
    issues: keys.issues.map((issue) => ({
      issueKey: issue.issueKey,
      subjectKey: issue.subjectKey,
      label: issue.label,
      rule: issue.rule as Rule,
      factVersion: issue.factVersion,
    })),
  });
  if (!built.ok) return { ok: false, code: "invalid", fields: built.fields };
  const encoded = encodePacket(built.packet);
  if (!encoded.ok) return { ok: false, code: "too_big" };

  const plan: ExchangePlan = {
    asOf: input.asOf,
    basedOn: input.revision,
    packetRevision,
    opId: input.mint(),
    issues: keys.issues,
    packet: built.packet,
    preview: previewPacket(built.packet),
    text: encoded.text,
  };
  if (keys.changed) {
    plan.command = { type: "prepare_review", subjects: keys.subjects, ...(keys.alias === undefined ? {} : { alias: keys.alias }) };
  }
  return { ok: true, plan };
}

export interface CheckRow {
  subjectId: Uuid;
  /** The label the keeper would send now: the stored one, or the default. */
  label: string;
  rules: string[];
}

/** One row for each subject that has a check at a date, for the label boxes. Changes nothing. */
export function checksAt(adapter: ExchangeAdapter, state: BaseState, asOf: LocalDate): CheckRow[] {
  if (!isValidLocalDate(asOf)) return [];
  let n = 0;
  const plan = planReviewKeys(state.review, sourcesOf(adapter, state, asOf).map(keyOf), { mint: () => `unminted-${++n}` });
  const rows = new Map<Uuid, CheckRow>();
  for (const issue of plan.issues) {
    const row = rows.get(issue.subjectId);
    if (row === undefined) rows.set(issue.subjectId, { subjectId: issue.subjectId, label: issue.label, rules: [issue.rule] });
    else row.rules.push(issue.rule);
  }
  return [...rows.values()];
}

export interface ReadInput {
  bytes: Uint8Array;
  site: Site;
  state: BaseState;
  adapter: ExchangeAdapter;
  /** The date the open checks are worked out for: today in the site zone, or the date of the slip's file if that is later. */
  today: LocalDate;
}

export interface ReturnedRow extends SlipRow {
  /** The neutral label of the check, when the ledger knows it. */
  label?: string;
  rule?: string;
  /** The staff screen of the record, under the register, when the ledger knows the check. */
  link?: string;
}

export type SlipFailure =
  | { ok: false; code: "other_register" }
  | { ok: false; code: "not_slip"; found: "review" }
  | { ok: false; code: "wrong_file"; found: "backup" | "visitor" | "other" }
  | { ok: false; code: "too_big" | "not_json" | "newer_version" | "unknown_format" | "invalid" };

export type ReadResult =
  | { ok: true; slip: ReturnSlip; rows: ReturnedRow[]; counts: Record<SlipStatus, number>; receipt?: Extract<ReviewCommand, { type: "receive_review" }> }
  | SlipFailure;

/**
 * Read a return slip against the open checks as at today. It writes nothing. `receipt` is the command that
 * would record the rows that are ready, and is absent when no row is ready.
 */
export function readSlipFor(input: ReadInput): ReadResult {
  const file = readExchangeFile(input.bytes);
  if (!file.ok) {
    return file.code === "wrong_file" ? { ok: false, code: "wrong_file", found: file.found ?? "other" } : { ok: false, code: file.code };
  }
  if (file.form === "review") return { ok: false, code: "not_slip", found: "review" };

  const { state, adapter, site } = input;
  // A review file can be made for a date after today. Its checks are open as at that date, so read them as at the later one.
  const asOf = file.slip.packetAsOf > input.today ? file.slip.packetAsOf : input.today;
  const open = openIssuesNow(state.review, sourcesOf(adapter, state, asOf).map(keyOf));
  const reading = readSlip(file.slip, {
    siteKey: site.siteKey,
    lineageId: site.lineageId,
    open: open.map((o) => ({ issueKey: o.issueKey, factVersion: o.factVersion })),
    received: Object.keys(state.review.received),
  });
  if (!reading.ok) return { ok: false, code: "other_register" };

  const holders = new Map<Uuid, { subjectId: Uuid; rule: string; label: string }>();
  for (const [subjectId, subject] of Object.entries(state.review.subjects)) {
    for (const [rule, issue] of Object.entries(subject.issues)) holders.set(issue.issueKey, { subjectId, rule, label: subject.label });
  }
  const rows = reading.rows.map((row): ReturnedRow => {
    const held = holders.get(row.issueKey);
    if (held === undefined) return { ...row };
    const out: ReturnedRow = { ...row, label: held.label, rule: held.rule };
    const link = adapter.review?.link(state, { rule: held.rule, subjectId: held.subjectId });
    if (link !== undefined) out.link = link;
    return out;
  });

  const result: ReadResult = { ok: true, slip: file.slip, rows, counts: reading.counts };
  const ready = rows.filter((row) => row.status === "ready");
  if (ready.length > 0) {
    result.receipt = {
      type: "receive_review",
      decisions: ready.map((row) => ({
        actionId: row.actionId,
        issueKey: row.issueKey,
        factVersion: row.factVersion,
        disposition: row.disposition,
        reviewedOn: row.reviewedOn,
      })),
    };
  }
  return result;
}
