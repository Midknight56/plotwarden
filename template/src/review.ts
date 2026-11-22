// The review ledger: the keys, versions, labels and site name a register keeps for the committee,
// and the receipts of return slips. Pure. Part of the base state, kept as events like everything else.
// Rule names are plain strings here. This file never reads an app kind and imports nothing of the exchange.
import { isValidLocalDate } from "./calendar";
import type { LocalDate } from "./calendar";
import { CORE_PAYLOAD_VERSION } from "./events";
import type { DraftEvent } from "./events";
import { checkLimit, checkText } from "./limits";
import { err, ok } from "./types";
import type { FieldError, Result, Uuid } from "./types";

export const DEFAULT_ALIAS = "Site 1";

export type ReviewDisposition = "checked" | "needs_keeper";

export interface ReviewIssueRecord {
  issueKey: Uuid;
  factVersion: number;
  /** A private digest of the source fields. It never leaves the register. */
  fingerprint: string;
}

export interface ReviewSubject {
  subjectKey: Uuid;
  label: string;
  /** By rule. */
  issues: Record<string, ReviewIssueRecord>;
}

export interface ReviewReceipt {
  issueKey: Uuid;
  factVersion: number;
  disposition: ReviewDisposition;
  reviewedOn: LocalDate;
}

export interface ReviewState {
  alias?: string;
  /** By the private ID of the subject. */
  subjects: Record<Uuid, ReviewSubject>;
  /** By action ID. */
  received: Record<Uuid, ReviewReceipt>;
}

export interface PreparedSubject {
  subjectId: Uuid;
  subjectKey: Uuid;
  label: string;
  issues: { rule: string; issueKey: Uuid; factVersion: number; fingerprint: string }[];
}

export interface ReviewDecisionInput {
  actionId: Uuid;
  issueKey: Uuid;
  factVersion: number;
  disposition: ReviewDisposition;
  reviewedOn: LocalDate;
}

export type ReviewCommand =
  | { type: "prepare_review"; alias?: string; subjects: PreparedSubject[] }
  | { type: "receive_review"; decisions: ReviewDecisionInput[] };

export type ReviewEvent =
  | { type: "review_prepared"; alias?: string; subjects: PreparedSubject[] }
  | ({ type: "review_received"; actionId: Uuid } & ReviewReceipt);

export const REVIEW_COMMAND_TYPES = ["prepare_review", "receive_review"] as const;
export const REVIEW_EVENT_TYPES = ["review_prepared", "review_received"] as const;

const REVIEW_TYPES: ReadonlySet<string> = new Set(REVIEW_EVENT_TYPES);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISPOSITIONS: readonly string[] = ["checked", "needs_keeper"];

export function emptyReview(): ReviewState {
  return { subjects: {}, received: {} };
}

export function isReviewEvent(event: { type: string }): event is ReviewEvent {
  return REVIEW_TYPES.has(event.type);
}

/** Apply one review event. Returns a new state and never edits the old one. */
export function applyReview(state: ReviewState, event: ReviewEvent): ReviewState {
  switch (event.type) {
    case "review_prepared": {
      const subjects = { ...state.subjects };
      for (const patch of event.subjects) {
        const known = subjects[patch.subjectId];
        const issues = { ...(known?.issues ?? {}) };
        for (const issue of patch.issues) {
          issues[issue.rule] = { issueKey: issue.issueKey, factVersion: issue.factVersion, fingerprint: issue.fingerprint };
        }
        subjects[patch.subjectId] = { subjectKey: patch.subjectKey, label: patch.label, issues };
      }
      const next: ReviewState = { ...state, subjects };
      if (event.alias !== undefined) next.alias = event.alias;
      return next;
    }
    case "review_received": {
      const receipt: ReviewReceipt = {
        issueKey: event.issueKey,
        factVersion: event.factVersion,
        disposition: event.disposition,
        reviewedOn: event.reviewedOn,
      };
      return { ...state, received: { ...state.received, [event.actionId]: receipt } };
    }
  }
}

function textProblem(item: "siteAliasChars" | "reviewLabelChars", text: string): string | undefined {
  if (text.trim() === "") return "required";
  return checkText(item, text).ok ? undefined : "over_limit";
}

/** Shape checks that need no state. Each error names its field. */
export function validateReview(command: ReviewCommand): FieldError[] {
  const fields: FieldError[] = [];
  const push = (field: string, code: string) => fields.push({ field, code });
  if (command.type === "prepare_review") {
    if (command.alias !== undefined) {
      const problem = textProblem("siteAliasChars", command.alias);
      if (problem !== undefined) push("alias", problem);
    }
    if (!checkLimit("reviewIssues", command.subjects.length).ok) push("subjects", "over_limit");
    command.subjects.forEach((subject, i) => {
      const at = `subjects.${i}`;
      if (subject.subjectId.trim() === "") push(`${at}.subjectId`, "required");
      if (!UUID.test(subject.subjectKey)) push(`${at}.subjectKey`, "bad_id");
      const label = textProblem("reviewLabelChars", subject.label);
      if (label !== undefined) push(`${at}.label`, label);
      subject.issues.forEach((issue, j) => {
        const where = `${at}.issues.${j}`;
        if (issue.rule.trim() === "") push(`${where}.rule`, "required");
        if (!UUID.test(issue.issueKey)) push(`${where}.issueKey`, "bad_id");
        if (!Number.isInteger(issue.factVersion) || issue.factVersion < 1) push(`${where}.factVersion`, "out_of_range");
      });
    });
    return fields;
  }
  if (!checkLimit("slipDecisions", command.decisions.length).ok) push("decisions", "over_limit");
  command.decisions.forEach((decision, i) => {
    const at = `decisions.${i}`;
    if (!UUID.test(decision.actionId)) push(`${at}.actionId`, "bad_id");
    if (!UUID.test(decision.issueKey)) push(`${at}.issueKey`, "bad_id");
    if (!Number.isInteger(decision.factVersion) || decision.factVersion < 1) push(`${at}.factVersion`, "out_of_range");
    if (!DISPOSITIONS.includes(decision.disposition)) push(`${at}.disposition`, "bad_value");
    if (!isValidLocalDate(decision.reviewedOn)) push(`${at}.reviewedOn`, "invalid_date");
  });
  return fields;
}

function draft(event: ReviewEvent, entityIds: string[], effectiveOn: LocalDate): DraftEvent<ReviewEvent> {
  return { event, entityIds, effectiveOn, payloadVersion: CORE_PAYLOAD_VERSION };
}

/** Every issue key in the ledger, with the subject and rule that hold it. */
function keyHolders(state: ReviewState): Map<Uuid, string> {
  const held = new Map<Uuid, string>();
  for (const [subjectId, subject] of Object.entries(state.subjects)) {
    held.set(subject.subjectKey, `subject:${subjectId}`);
    for (const [rule, issue] of Object.entries(subject.issues)) held.set(issue.issueKey, `issue:${subjectId}:${rule}`);
  }
  return held;
}

export function decideReview(state: ReviewState, command: ReviewCommand, effectiveOn: LocalDate): Result<DraftEvent<ReviewEvent>[]> {
  if (!isValidLocalDate(effectiveOn)) return err("invalid_date");
  const fields = validateReview(command);
  if (fields.length > 0) return err("invalid_input", undefined, { fields });

  if (command.type === "prepare_review") {
    if (command.alias === undefined && command.subjects.length === 0) return err("nothing_to_prepare");
    const held = keyHolders(state);
    const used = new Set<string>();
    for (const subject of command.subjects) {
      const claims: [Uuid, string][] = [[subject.subjectKey, `subject:${subject.subjectId}`]];
      for (const issue of subject.issues) claims.push([issue.issueKey, `issue:${subject.subjectId}:${issue.rule}`]);
      for (const [key, owner] of claims) {
        const holder = held.get(key);
        if ((holder !== undefined && holder !== owner) || used.has(key)) return err("duplicate_id", { id: key });
        used.add(key);
      }
    }
    const event: ReviewEvent = { type: "review_prepared", subjects: command.subjects.map((s) => ({ ...s, issues: s.issues.map((i) => ({ ...i })) })) };
    if (command.alias !== undefined) event.alias = command.alias.trim();
    return ok([draft(event, command.subjects.map((s) => s.subjectId), effectiveOn)]);
  }

  const seen = new Set<Uuid>();
  for (const decision of command.decisions) {
    if (seen.has(decision.actionId)) return err("duplicate_id", { id: decision.actionId });
    seen.add(decision.actionId);
  }
  const issueKeys = new Set(
    Object.values(state.subjects).flatMap((subject) => Object.values(subject.issues).map((issue) => issue.issueKey)),
  );
  for (const decision of command.decisions) {
    if (!issueKeys.has(decision.issueKey)) return err("no_such_issue", { issueKey: decision.issueKey });
  }
  const fresh = command.decisions.filter((d) => state.received[d.actionId] === undefined);
  if (fresh.length === 0) return err("already_received");
  return ok(
    fresh.map((d) =>
      draft(
        { type: "review_received", actionId: d.actionId, issueKey: d.issueKey, factVersion: d.factVersion, disposition: d.disposition, reviewedOn: d.reviewedOn },
        [d.actionId, d.issueKey],
        effectiveOn,
      ),
    ),
  );
}

/** A check an app raises, with the private digest of the fields it depends on. */
export interface KeySource {
  rule: string;
  subjectId: Uuid;
  fingerprint: string;
}

export interface PlannedIssue {
  subjectId: Uuid;
  rule: string;
  subjectKey: Uuid;
  issueKey: Uuid;
  label: string;
  factVersion: number;
}

export interface KeyPlan {
  /** The checks in source order, with their keys. */
  issues: PlannedIssue[];
  /** What a `prepare_review` would store. */
  subjects: PreparedSubject[];
  /** The site name to store, only when it differs from what is stored. */
  alias?: string;
  /** True when a `prepare_review` has something to store. */
  changed: boolean;
}

export interface PlanOptions {
  mint: () => Uuid;
  /** Labels the keeper approved, by the private ID of the subject. */
  labels?: Readonly<Record<Uuid, string>>;
  alias?: string;
}

interface Working {
  subjectKey: Uuid;
  label: string;
  touched: boolean;
  /** The issues this plan met, in order. */
  met: PreparedSubject["issues"];
  stored: Record<string, ReviewIssueRecord>;
}

/**
 * Work out the keys and versions of the checks a keeper is about to send. It mints a key only for
 * a subject or a subject and rule that has none, raises a version only when a fingerprint differs,
 * and reports what a `prepare_review` would store. It changes nothing it is given.
 */
export function planReviewKeys(review: ReviewState, sources: readonly KeySource[], options: PlanOptions): KeyPlan {
  const work = new Map<Uuid, Working>();
  const issues: PlannedIssue[] = [];
  const seen = new Set<string>();
  let subjectCount = Object.keys(review.subjects).length;

  for (const source of sources) {
    const pair = `${source.subjectId}|${source.rule}`;
    if (seen.has(pair)) continue;
    seen.add(pair);

    let subject = work.get(source.subjectId);
    if (subject === undefined) {
      const stored = review.subjects[source.subjectId];
      const approved = options.labels?.[source.subjectId];
      if (stored === undefined) {
        subjectCount += 1;
        subject = { subjectKey: options.mint(), label: approved ?? `Record ${subjectCount}`, touched: true, met: [], stored: {} };
      } else {
        const label = approved ?? stored.label;
        subject = { subjectKey: stored.subjectKey, label, touched: label !== stored.label, met: [], stored: stored.issues };
      }
      work.set(source.subjectId, subject);
    }

    const known = subject.stored[source.rule];
    let issueKey: Uuid;
    let factVersion: number;
    if (known === undefined) {
      issueKey = options.mint();
      factVersion = 1;
      subject.touched = true;
    } else if (known.fingerprint !== source.fingerprint) {
      issueKey = known.issueKey;
      factVersion = known.factVersion + 1;
      subject.touched = true;
    } else {
      issueKey = known.issueKey;
      factVersion = known.factVersion;
    }
    subject.met.push({ rule: source.rule, issueKey, factVersion, fingerprint: source.fingerprint });
    issues.push({ subjectId: source.subjectId, rule: source.rule, subjectKey: subject.subjectKey, issueKey, label: subject.label, factVersion });
  }

  const subjects: PreparedSubject[] = [];
  for (const [subjectId, subject] of work) {
    if (subject.touched) subjects.push({ subjectId, subjectKey: subject.subjectKey, label: subject.label, issues: subject.met });
  }
  const plan: KeyPlan = { issues, subjects, changed: subjects.length > 0 };
  if (options.alias !== undefined && options.alias !== (review.alias ?? DEFAULT_ALIAS)) {
    plan.alias = options.alias;
    plan.changed = true;
  }
  return plan;
}

export interface OpenIssue {
  issueKey: Uuid;
  factVersion: number;
  subjectId: Uuid;
  rule: string;
}

/** The checks open now that already have a key, with the version the next plan would give. Mints nothing. */
export function openIssuesNow(review: ReviewState, sources: readonly KeySource[]): OpenIssue[] {
  const open: OpenIssue[] = [];
  for (const source of sources) {
    const known = review.subjects[source.subjectId]?.issues[source.rule];
    if (known === undefined) continue;
    const factVersion = known.fingerprint === source.fingerprint ? known.factVersion : known.factVersion + 1;
    open.push({ issueKey: known.issueKey, factVersion, subjectId: source.subjectId, rule: source.rule });
  }
  return open;
}

/** A 53 bit digest of the parts, as 14 hex digits. Private. A collision would only fail to raise a version. */
export function fingerprint(parts: readonly string[]): string {
  const text = `${parts.length}\u001f${parts.join("\u001f")}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return value.toString(16).padStart(14, "0");
}
