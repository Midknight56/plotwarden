// What public text must not hold. Shared by scripts/check-public.mjs and tests/unit/release.test.ts.
//
//   dash        an en dash, an em dash, a spaced hyphen or a double hyphen between words. Read in the prose of
//               markdown and html pages, and in the strings of a copy catalog. Not in code, not in a code span,
//               not in a table rule, not in a hyphenated word.
//   local-path  a path on someone's own machine.
//   any other   a word from a list of the banned words file. The name of the list is the name of the rule.
//
// The word lists are not kept in this repository, and no file here names them. They are read from a JSON file, an
// object of lists of words such as {"vendor": [...], "other": [...]}, whose path the caller holds (see
// check-public.mjs). Without the lists, only the generic rules run.
//
// A rule reports at most one finding for a line, so a long line is not a long list.
import { readFileSync } from "node:fs";

const DASH_CHARS = /[\u2012\u2013\u2014\u2015\u2212]/;
const DASH_ESCAPES = /\\u(?:2012|2013|2014|2015|2212)/i;
const HTML_DASH_ENTITIES = /&(?:mdash|ndash|horbar|minus);|&#(?:8210|8211|8212|8213|8722|x201[2345]|x2212);/i;
// A hyphen or two between words, with a space each side. A table cell that holds only a dash has a bar beside it.
const SPACED_HYPHEN = /[\p{L}\p{N}.,;:!?)\]"'*_] +-{1,2} +[\p{L}\p{N}("'*_[]/u;

// A drive letter that starts a path (not the end of a word, and not the `\d:` in the source of a pattern), a file address that
// names a drive or a home folder, and a home folder.
const LOCAL_PATHS = [/(?<![\\\w])[A-Za-z]:[\\/](?=[A-Za-z0-9_.-]+[\\/])/, /\bfile:\/\/\/(?:[A-Za-z]:|Users\/|home\/)/i, /(?:^|[\s"'(`=])\/(?:Users|home)\/[A-Za-z0-9_.-]+/];

const NO_BANNED = [];

/** One matcher for a list of words: a whole word, in any letter case, with a space in a word matching any run of blanks. */
function matcherFor(words) {
  const alternatives = words
    .map((word) => word.trim())
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}_])`, "giu");
}

/**
 * Check that `lists` is an object of at least one list of words, none of them empty, and compile each list.
 * Returns [{ rule, matcher }], one for each list that holds a word, in the order of the file. A list with no word
 * is allowed and matches nothing. A fault throws an Error that names the list.
 */
export function compileBanned(lists) {
  if (lists === null || typeof lists !== "object" || Array.isArray(lists)) {
    throw new Error("The banned words file must hold an object of lists of words");
  }
  const names = Object.keys(lists);
  if (names.length === 0) throw new Error("The banned words file holds no list of words");
  const compiled = [];
  for (const rule of names) {
    const words = lists[rule];
    if (!Array.isArray(words)) throw new Error(`The banned words file needs "${rule}" to be a list of words`);
    if (words.some((word) => typeof word !== "string" || word.trim() === "")) {
      throw new Error(`The list "${rule}" of the banned words file holds a word that is empty or is not text`);
    }
    if (words.length > 0) compiled.push({ rule, matcher: matcherFor(words) });
  }
  return compiled;
}

/** Read a banned words file and compile it. A fault throws an Error that says what is wrong with the banned words file. */
export function loadBannedWords(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error("The banned words file could not be read");
  }
  let lists;
  try {
    lists = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("The banned words file is not JSON");
  }
  return compileBanned(lists);
}

/** Find the first match of each regex on a line, as a finding. */
function lineFindings(line, number, rule, regexes) {
  for (const regex of regexes) {
    const match = new RegExp(regex.source, regex.flags.replace("g", "")).exec(line);
    if (match !== null) return [{ line: number, rule, match: match[0].trim() }];
  }
  return [];
}

function proseDashes(line, number) {
  if (DASH_CHARS.test(line) || DASH_ESCAPES.test(line) || HTML_DASH_ENTITIES.test(line)) {
    const match = DASH_CHARS.exec(line) ?? DASH_ESCAPES.exec(line) ?? HTML_DASH_ENTITIES.exec(line);
    return [{ line: number, rule: "dash", match: match[0] }];
  }
  const spaced = SPACED_HYPHEN.exec(line);
  return spaced === null ? [] : [{ line: number, rule: "dash", match: spaced[0] }];
}

/** The prose lines of a markdown page, with code gone. Returns [text, line number] pairs. */
function markdownProse(text) {
  const prose = [];
  let fence = null;
  text.split("\n").forEach((raw, index) => {
    const line = raw.replace(/\r$/, "");
    const marker = /^\s*(```+|~~~+)/.exec(line);
    if (fence !== null) {
      if (marker !== null && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      return;
    }
    if (marker !== null) {
      fence = marker[1];
      return;
    }
    if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-")) return;
    prose.push([line.replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length)), index + 1]);
  });
  return prose;
}

/** The words of an html page, with the markup, script, style, code and comments gone and the lines kept. */
function htmlProse(text) {
  const keepLines = (m) => m.replace(/[^\n]/g, " ");
  const stripped = text
    .replace(/<!--[\s\S]*?-->/g, keepLines)
    .replace(/<(script|style|code|pre)\b[\s\S]*?<\/\1>/gi, keepLines)
    .replace(/<[^>]*>/g, keepLines);
  return stripped.split("\n").map((line, index) => [line, index + 1]);
}

/** The strings of a copy catalog, one per line they start on. */
function catalogProse(text) {
  const found = [];
  const lineAt = (offset) => text.slice(0, offset).split("\n").length;
  for (const match of text.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g)) {
    found.push([match[1] ?? match[2] ?? "", lineAt(match.index)]);
  }
  return found;
}

const isCatalog = (path) => /(^|\/)copy[A-Za-z]*\.ts$/.test(path);

/**
 * Find what public text must not hold. Which rules apply depends on the file type in `path`.
 * `banned` is the result of `loadBannedWords`. Without it, only the generic rules run.
 */
export function scanText(path, text, banned = NO_BANNED) {
  const findings = [];
  const lines = text.split("\n");

  let prose = [];
  if (/\.md$/i.test(path)) prose = markdownProse(text);
  else if (/\.html?$/i.test(path)) prose = htmlProse(text);
  else if (isCatalog(path)) prose = catalogProse(text);
  const seen = new Set();
  for (const [line, number] of prose) {
    for (const f of proseDashes(line, number)) {
      if (!seen.has(f.line)) {
        seen.add(f.line);
        findings.push(f);
      }
    }
  }

  lines.forEach((raw, index) => {
    const line = raw.replace(/\r$/, "");
    const number = index + 1;
    for (const { rule, matcher } of banned) findings.push(...lineFindings(line, number, rule, [matcher]));
    findings.push(...lineFindings(line, number, "local-path", LOCAL_PATHS));
  });

  return findings.sort((a, b) => a.line - b.line);
}

