// Public text has no dash between words, no path on someone's own machine, and none of the words in a private list.
// It reads the files a visitor to the repository reads (documents, specs, steering, source, page text) and the pages
// of the built site.
//
//   node scripts/check-public.mjs [--root <repo>]
//
// The private list is a JSON file outside the repository, an object of lists of words. Its path is in the
// environment variable PLOTWARDEN_BANNED_WORDS. When the variable is not set, the check says so on one line and runs
// every other rule. When it is set and the file cannot be used, the check exits 2 and scans nothing.
//
// Exit 0 when clean. Exit 1 and print `file:line: rule: match` for each finding, where the rule of a word is the
// name of its list. Exit 2 for a bad call or a bad list.
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Refusal, finish, listFiles, parseArgs } from "./lib/files.mjs";
import { loadBannedWords, scanText } from "./lib/publicText.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const WORDS_VARIABLE = "PLOTWARDEN_BANNED_WORDS";
const SKIP_DIRS = new Set(["node_modules", ".git", ".local", ".vitest", "test-results", "playwright-report", "coverage"]);
const TEXT = /\.(?:md|html?|tsx?|mjs|cjs|js|json|css|svg|txt|ya?ml|toml)$/i;
const SKIP_NAMES = new Set(["package-lock.json"]);
const MAX_BYTES = 2 * 1024 * 1024;
// These tests hold dashes and local paths as data, so the generic rules do not read them. The word lists do.
const GENERIC_EXEMPT = new Set(["tests/unit/release.test.ts", "tests/unit/siteCopy.test.ts", "tests/unit/paperCopy.test.ts", "tests/unit/copy.test.ts"]);

function bannedWords() {
  const file = process.env[WORDS_VARIABLE];
  if (file === undefined || file === "") return undefined;
  try {
    return loadBannedWords(file);
  } catch (error) {
    throw new Refusal(`${error instanceof Error ? error.message : String(error)}. Check the file named by ${WORDS_VARIABLE}.`, 2);
  }
}

finish(() => {
  const args = parseArgs(process.argv.slice(2), { root: "value" });
  const root = resolve(args.root ?? join(here, ".."));
  const banned = bannedWords();
  if (banned === undefined) console.log(`check-public: the banned word lists were skipped, ${WORDS_VARIABLE} is not set`);
  const findings = [];
  let count = 0;

  for (const rel of listFiles(root)) {
    const parts = rel.split("/");
    if (parts.some((p) => SKIP_DIRS.has(p))) continue;
    // Only the built site is public. The other builds are the same code as the source.
    if (parts[0] === "dist" && !(parts[1] === "site" && /\.html?$/i.test(rel))) continue;
    if (!TEXT.test(rel) || SKIP_NAMES.has(parts[parts.length - 1])) continue;
    const full = join(root, rel);
    if (statSync(full).size > MAX_BYTES) continue;
    count += 1;
    const wordsOnly = GENERIC_EXEMPT.has(rel);
    for (const f of scanText(rel, readFileSync(full, "utf8"), banned)) {
      if (!wordsOnly || (f.rule !== "dash" && f.rule !== "local-path")) findings.push({ rel, ...f });
    }
  }

  for (const f of findings) console.error(`${f.rel}:${f.line}: ${f.rule}: ${f.match}`);
  if (findings.length > 0) {
    console.log(`check-public: ${findings.length} finding${findings.length === 1 ? "" : "s"} in ${count} files`);
    return 1;
  }
  console.log(`check-public: ok, ${count} files`);
  return 0;
});
