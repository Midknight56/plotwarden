// Build, check, encode and preview a review packet. Pure.
// A packet is written key by key from named inputs. Nothing is spread, copied or filtered from another object.
import type { LocalDate } from "../calendar";
import { LIMITS } from "../limits";
import { ACTION_FOR_RULE, REVIEW_FORMAT, canonicalPacket, parsePacket } from "./schema";
import type { ReviewIssue, ReviewPacket, Rule } from "./schema";

export interface PacketInput {
  siteKind: string;
  siteKey: string;
  lineageId: string;
  siteAlias: string;
  revision: number;
  asOf: LocalDate;
  issues: { issueKey: string; subjectKey: string; label: string; rule: Rule; factVersion: number }[];
}

export interface FieldProblem {
  field: string;
  code: string;
}

export type BuildResult = { ok: true; packet: ReviewPacket } | { ok: false; fields: FieldProblem[] };

/** The exact key names of a packet and of an issue, in file order. */
export const PACKET_FIELDS = ["format", "siteKind", "siteKey", "lineageId", "siteAlias", "revision", "asOf", "issues"] as const;
export const ISSUE_FIELDS = ["issueKey", "subjectKey", "label", "rule", "factVersion", "action"] as const;

/** Build a packet. The action of each issue comes from its rule. Issues are ordered by issue key. */
export function buildPacket(input: PacketInput): BuildResult {
  const issues: ReviewIssue[] = [...input.issues]
    .sort((a, b) => (a.issueKey < b.issueKey ? -1 : a.issueKey > b.issueKey ? 1 : 0))
    .map((issue) => ({
      issueKey: issue.issueKey,
      subjectKey: issue.subjectKey,
      label: issue.label,
      rule: issue.rule,
      factVersion: issue.factVersion,
      action: ACTION_FOR_RULE[issue.rule],
    }));
  const written: ReviewPacket = {
    format: REVIEW_FORMAT,
    siteKind: input.siteKind,
    siteKey: input.siteKey,
    lineageId: input.lineageId,
    siteAlias: input.siteAlias,
    revision: input.revision,
    asOf: input.asOf,
    issues,
  };
  const checked = parsePacket(written);
  if (checked.ok) return { ok: true, packet: checked.value };
  return { ok: false, fields: checked.issues.map((issue) => ({ field: issue.path, code: issue.code })) };
}

export type EncodeResult = { ok: true; text: string; bytes: number } | { ok: false; code: "too_big"; bytes: number };

/** The text of a packet, with its size in UTF 8 bytes. Refuses more than 2 MiB. */
export function encodePacket(packet: ReviewPacket): EncodeResult {
  const text = canonicalPacket(packet);
  const bytes = new TextEncoder().encode(text).length;
  return bytes > LIMITS.reviewPacketBytes ? { ok: false, code: "too_big", bytes } : { ok: true, text, bytes };
}

export type LabelProblem = "required" | "over_limit" | "private_string" | "looks_like_amount" | "looks_like_contact";

const fold = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const AMOUNT = /[£$€]|\b(?:GBP|EUR|USD|CAD)\b|\d+[.,]\d{2}\b/i;

/** The words of a text, folded, split on anything that is not a letter or a digit. */
const wordsOf = (value: string): string[] =>
  fold(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== "");

/** The words of a name that are at least three letters. Shorter words and numbers are too common to guard. */
const nameWords = (name: string): string[] => wordsOf(name).filter((w) => [...w].length >= 3 && /^\p{L}+$/u.test(w));
const SEPARATOR_BETWEEN_DIGITS = /(?<=\d)[\s\-().]+(?=\d)/g;

/**
 * One code for a typed site name or label, or undefined when it is fine.
 * The order is fixed: empty, too long, a known private string, an amount, a contact.
 * `names` are people's names and the site title. A word of one, three letters or more, counts as a private string.
 */
export function checkLabelText(text: string, known: readonly string[], max: number = LIMITS.reviewLabelChars, names: readonly string[] = []): LabelProblem | undefined {
  if (text.trim() === "") return "required";
  if ([...text].length > max) return "over_limit";
  const haystack = fold(text);
  for (const entry of known) {
    const needle = fold(entry);
    if (needle !== "" && haystack.includes(needle)) return "private_string";
  }
  if (names.length > 0) {
    const words = new Set(wordsOf(text));
    for (const name of names) if (nameWords(name).some((w) => words.has(w))) return "private_string";
  }
  if (AMOUNT.test(text)) return "looks_like_amount";
  if (text.includes("@") || /\d{7,}/.test(text.replace(SEPARATOR_BETWEEN_DIGITS, ""))) return "looks_like_contact";
  return undefined;
}

export interface PacketPreview {
  /** The exact top level key names of the file, in file order. */
  siteFields: string[];
  /** The exact key names of each issue. */
  issueFields: string[];
  count: number;
  rows: { label: string; rule: Rule; action: string; factVersion: number }[];
  bytes: number;
}

/** What the keeper sees before a download: the real key names, the count and a row for each check. */
export function previewPacket(packet: ReviewPacket): PacketPreview {
  const encoded = encodePacket(packet);
  return {
    siteFields: [...PACKET_FIELDS],
    issueFields: [...ISSUE_FIELDS],
    count: packet.issues.length,
    rows: packet.issues.map((issue) => ({ label: issue.label, rule: issue.rule, action: issue.action, factVersion: issue.factVersion })),
    bytes: encoded.bytes,
  };
}

/** A name of kind and date, never a private value. */
export function reviewFileName(asOf: LocalDate): string {
  return `committee-review-${asOf}.json`;
}
