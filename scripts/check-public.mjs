// Public text has no dash between words, no name of an AI model or its maker, no contest or prize word and no
// path on someone's own machine. Kiro is the one name that stays. It reads the files a visitor to the repository
// reads (documents, specs, steering, source, page text) and the pages of the built site.
//
//   node scripts/check-public.mjs [--root <repo>]
//
// Exit 0 when clean. Exit 1 and print `file:line: rule: match` for each finding.
import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { finish, listFiles, parseArgs } from "./lib/files.mjs";
import { SKIPPED_FILES, scanText } from "./lib/publicText.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const SKIP_DIRS = new Set(["node_modules", ".git", ".local", ".vitest", "test-results", "playwright-report", "coverage"]);
const TEXT = /\.(?:md|html?|tsx?|mjs|cjs|js|json|css|svg|txt|ya?ml|toml)$/i;
const SKIP_NAMES = new Set(["package-lock.json"]);
const MAX_BYTES = 2 * 1024 * 1024;
const EXEMPT = new Set(["tests/unit/release.test.ts", "tests/unit/siteCopy.test.ts", "tests/unit/paperCopy.test.ts", "tests/unit/copy.test.ts"]);

finish(() => {
  const args = parseArgs(process.argv.slice(2), { root: "value" });
  const root = resolve(args.root ?? join(here, ".."));
  const findings = [];
  let count = 0;

  for (const rel of listFiles(root)) {
    const parts = rel.split("/");
    if (parts.some((p) => SKIP_DIRS.has(p))) continue;
    // Only the built site is public. The other builds are the same code as the source.
    if (parts[0] === "dist" && !(parts[1] === "site" && /\.html?$/i.test(rel))) continue;
    if (!TEXT.test(rel) || SKIP_NAMES.has(parts[parts.length - 1]) || SKIPPED_FILES.has(rel)) continue;
    // These tests hold the words they check for, as data.
    if (EXEMPT.has(rel)) continue;
    const full = join(root, rel);
    if (statSync(full).size > MAX_BYTES) continue;
    count += 1;
    for (const f of scanText(rel, readFileSync(full, "utf8"))) findings.push({ rel, ...f });
  }

  for (const f of findings) console.error(`${f.rel}:${f.line}: ${f.rule}: ${f.match}`);
  if (findings.length > 0) {
    console.log(`check-public: ${findings.length} finding${findings.length === 1 ? "" : "s"} in ${count} files`);
    return 1;
  }
  console.log(`check-public: ok, ${count} files`);
  return 0;
});
