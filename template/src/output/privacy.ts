// Visitor types and closed schemas, canary scan and private string check.
// This file imports no private record type. A visitor object is built field by
// field and parsed here with a schema that rejects any other key at every depth.
import { z } from "zod";
import { isValidLocalDate } from "../calendar";
import type { LocalDate } from "../calendar";
import { COORDINATE_MAX, LIMITS } from "../limits";

export type Point = [number, number];

export interface PublicGate {
  name: string;
  x: number;
  y: number;
}

export interface PublicPath {
  name: string;
  points: Point[];
}

export interface PublicSection {
  id: string;
  label: string;
  outline?: Point[];
}

export interface PublicPlot {
  id: string;
  code: string;
  sectionId: string;
  outline?: Point[];
}

export interface PublicBurial {
  id: string;
  name: string;
  year?: number;
  plotId: string;
  /** The one way in for the whole site. The same text on every burial of a file. */
  directions?: string;
  /** One optional line for this burial alone. */
  line?: string;
}

/** `plot.family.v1`. Design D9. */
export interface FamilyFile {
  format: "plot.family.v1";
  asOf: LocalDate;
  siteTitle: string;
  north: number;
  gate: PublicGate;
  paths: PublicPath[];
  sections: PublicSection[];
  plots: PublicPlot[];
  burials: PublicBurial[];
  /** Plain footprints of the other plots, as bare point lists. Only when the keeper chose them. No code, state, ID or count. */
  outlines?: Point[][];
}

/** `plot.availability.v1`. Design D9. It has no person field. */
export interface AvailabilityFile {
  format: "plot.availability.v1";
  asOf: LocalDate;
  siteTitle: string;
  north: number;
  gate: PublicGate;
  paths: PublicPath[];
  sections: PublicSection[];
  freePlots: PublicPlot[];
  neutralGround: { outline: Point[] }[];
  instructions: string;
}

const length = (s: string): number => [...s].length;
const text = (max: number) => z.string().min(1).refine((s) => length(s) <= max, { message: "too long" });
const publicId = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const coordinate = z.number().int().min(0).max(COORDINATE_MAX);
const point = z.tuple([coordinate, coordinate]);
const outline = z.array(point).min(3).max(LIMITS.polygonVertices);

const gate = z.strictObject({ name: text(LIMITS.nameChars), x: coordinate, y: coordinate });
const path = z.strictObject({
  name: text(LIMITS.nameChars),
  points: z.array(point).min(2).max(LIMITS.polygonVertices),
});
const section = z.strictObject({ id: publicId, label: text(LIMITS.nameChars), outline: outline.optional() });
const plot = z.strictObject({
  id: publicId,
  code: text(LIMITS.plotCodeChars),
  sectionId: publicId,
  outline: outline.optional(),
});
const burial = z.strictObject({
  id: publicId,
  name: text(LIMITS.nameChars),
  year: z.number().int().min(1000).max(9999).optional(),
  plotId: publicId,
  directions: text(LIMITS.noteChars).optional(),
  line: text(LIMITS.noteChars).optional(),
});

const asOf = z.string().refine(isValidLocalDate, { message: "not a date" });
const north = z.number().min(0).lt(360);

const familySchema: z.ZodType<FamilyFile> = z.strictObject({
  format: z.literal("plot.family.v1"),
  asOf,
  siteTitle: text(LIMITS.nameChars),
  north,
  gate,
  paths: z.array(path).max(LIMITS.sectionsPerSite),
  sections: z.array(section).max(LIMITS.sectionsPerSite),
  plots: z.array(plot).max(LIMITS.plotsPerSite),
  burials: z.array(burial).max(LIMITS.domainRecordsPerSite),
  outlines: z.array(outline).max(LIMITS.plotsPerSite).optional(),
});

const availabilitySchema: z.ZodType<AvailabilityFile> = z.strictObject({
  format: z.literal("plot.availability.v1"),
  asOf,
  siteTitle: text(LIMITS.nameChars),
  north,
  gate,
  paths: z.array(path).max(LIMITS.sectionsPerSite),
  sections: z.array(section).max(LIMITS.sectionsPerSite),
  freePlots: z.array(plot).max(LIMITS.plotsPerSite),
  neutralGround: z.array(z.strictObject({ outline })).max(LIMITS.plotsPerSite),
  instructions: z.string().refine((s) => length(s) <= LIMITS.noteChars, { message: "too long" }),
});

export interface ParseIssue {
  /** Where the problem is, for example `burials.0`. Empty for the top level. */
  path: string;
  code: string;
  /** The keys that should not be there, for `unrecognized_keys`. */
  keys?: string[];
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: ParseIssue[] };

function parseWith<T>(schema: z.ZodType<T>, value: unknown): ParseResult<T> {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, value: result.data };
  const issues = result.error.issues.map((issue): ParseIssue => {
    const entry: ParseIssue = { path: issue.path.join("."), code: issue.code };
    if (issue.code === "unrecognized_keys") entry.keys = [...issue.keys];
    return entry;
  });
  return { ok: false, issues };
}

/** Parse a family file. Any key not in design D9 is refused at every depth. */
export function parseFamily(value: unknown): ParseResult<FamilyFile> {
  return parseWith(familySchema, value);
}

/** Parse an availability file. It cannot carry a person, a fee or a queue. */
export function parseAvailability(value: unknown): ParseResult<AvailabilityFile> {
  return parseWith(availabilitySchema, value);
}

/** Lower case, accents removed, single spaces. For matching only. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function collect(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (value instanceof Uint8Array) out.push(new TextDecoder().decode(value));
  else if (Array.isArray(value)) for (const item of value) collect(item, out);
  else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      out.push(key);
      collect(item, out);
    }
  }
}

/**
 * The canaries found in any key or value, at any depth, in text or bytes.
 * Reported once each, in the order given. Case and accents are ignored.
 */
export function scanForCanaries(subject: unknown, canaries: readonly string[]): string[] {
  const parts: string[] = [];
  collect(subject, parts);
  const haystack = fold(parts.join("\n"));
  return canaries.filter((canary, index) => {
    const needle = fold(canary);
    return needle !== "" && canaries.indexOf(canary) === index && haystack.includes(needle);
  });
}

/** Known private full names or contact strings that a public label contains. */
export function flagPrivateStrings(label: string, known: readonly string[], names: readonly string[] = []): string[] {
  const haystack = fold(label);
  const found = known.filter((entry) => {
    const needle = fold(entry);
    return needle !== "" && haystack.includes(needle);
  });
  // A word of a private name counts too: "Thorne gate" holds "Ada Thorne". A word has at least three letters.
  const words = new Set(wordsOf(label));
  for (const name of names) {
    if (found.includes(name)) continue;
    if (nameWords(name).some((w) => words.has(w))) found.push(name);
  }
  return found;
}

/** The words of a text, folded, split on anything that is not a letter or a digit. */
function wordsOf(value: string): string[] {
  return fold(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== "");
}

/** The words of a name that are at least three letters. Shorter words and numbers are too common to guard. */
export function nameWords(name: string): string[] {
  return wordsOf(name).filter((w) => [...w].length >= 3 && /^\p{L}+$/u.test(w));
}

/** The names that a text holds as a whole, word for word. A single word name matches only as a whole word. */
export function flagWholeNames(text: string, names: readonly string[]): string[] {
  const words = wordsOf(text);
  return names.filter((name) => {
    const want = wordsOf(name);
    if (want.length === 0) return false;
    for (let i = 0; i + want.length <= words.length; i += 1) {
      if (want.every((w, j) => words[i + j] === w)) return true;
    }
    return false;
  });
}

/** True when a text looks like an email address or a phone number. */
export function looksLikeContact(text: string): boolean {
  return text.includes("@") || /\d{7,}/.test(text.replace(/(?<=\d)[\s\-().]+(?=\d)/g, ""));
}
