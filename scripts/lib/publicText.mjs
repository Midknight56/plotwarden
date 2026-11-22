// What public text must not hold. Shared by scripts/check-public.mjs and tests/unit/release.test.ts.
//
//   dash        an en dash, an em dash, a spaced hyphen or a double hyphen between words. Read in the prose of
//               markdown and html pages, and in the strings of a copy catalog. Not in code, not in a code span,
//               not in a table rule, not in a hyphenated word.
//   vendor      the name of an AI model or its maker. Kiro is the one name that stays.
//   contest     a word about a contest or a prize. The one heading and the one file name that the plan fixes stay.
//   local-path  a path on someone's own machine.
//
// A rule reports at most one finding for a line, so a long line is not a long list.

const DASH_CHARS = /[\u2012\u2013\u2014\u2015\u2212]/;
const DASH_ESCAPES = /\\u(?:2012|2013|2014|2015|2212)/i;
const HTML_DASH_ENTITIES = /&(?:mdash|ndash|horbar|minus);|&#(?:8210|8211|8212|8213|8722|x201[2345]|x2212);/i;
// A hyphen or two between words, with a space each side. A table cell that holds only a dash has a bar beside it.
const SPACED_HYPHEN = /[\p{L}\p{N}.,;:!?)\]"'*_] +-{1,2} +[\p{L}\p{N}("'*_[]/u;

const VENDOR = /\b(?:claude|anthropic|openai|chatgpt|gpt-?\d[\w.-]*|gpt|gemini|copilot|opus|sonnet|haiku|llama|codex|llm)\b|language model/gi;

// The two things that the plan fixes: the heading of the README block, and the name of the guide file.
const ALLOWED_CONTEST = /Judging criteria at a glance|judge-guide/g;
const CONTEST = /\b(?:hackathon|devpost|kiroween|prizes?|contests?|contestants?|skeleton crew|judges?|judging|judged)\b/gi;

// A drive letter that starts a path (not the end of a word, and not the `\d:` in the source of a pattern), a file address that
// names a drive or a home folder, and a home folder.
const LOCAL_PATHS = [/(?<![\\\w])[A-Za-z]:[\\/](?=[A-Za-z0-9_.-]+[\\/])/, /\bfile:\/\/\/(?:[A-Za-z]:|Users\/|home\/)/i, /(?:^|[\s"'(`=])\/(?:Users|home)\/[A-Za-z0-9_.-]+/];

const blankOut = (text, regex) => text.replace(regex, (m) => " ".repeat(m.length));

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

/** Find what public text must not hold. Which rules apply depends on the file type in `path`. */
export function scanText(path, text) {
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
    findings.push(...lineFindings(line, number, "vendor", [VENDOR]));
    findings.push(...lineFindings(blankOut(line, ALLOWED_CONTEST), number, "contest", [CONTEST]));
    findings.push(...lineFindings(line, number, "local-path", LOCAL_PATHS));
  });

  return findings.sort((a, b) => a.line - b.line);
}

export const SKIPPED_FILES = new Set(["scripts/lib/publicText.mjs", "scripts/check-public.mjs"]);
