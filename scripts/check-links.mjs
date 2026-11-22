// Every link in the README and in docs/ goes to a file or folder in this repository, to a heading that exists,
// or to a page of the built site. An address on the web is a fault: it cannot be checked without a request,
// and nothing here makes one. Write such an address as code instead.
//
//   node scripts/check-links.mjs [--root <repo>]
//
// Exit 0 when every link resolves. Exit 1 and print `file:line: target: reason` for each that does not.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { finish, listFiles, parseArgs } from "./lib/files.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/** The lines of a markdown page with code gone: `[text, line number]`. */
function proseLines(text) {
  const out = [];
  let fence = null;
  text.split("\n").forEach((raw, i) => {
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
    out.push([line.replace(/`[^`\n]*`/g, (m) => " ".repeat(m.length)), i + 1]);
  });
  return out;
}

/** The anchors a markdown page offers, made the way the repository host makes them. */
function anchorsOf(text) {
  const seen = new Map();
  const anchors = new Set();
  for (const [line] of proseLines(text)) {
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading === null) continue;
    const base = heading[1]
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .trim()
      .replace(/\s/g, "-");
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

/** Every link target on a line. */
function linksOn(line) {
  const targets = [];
  for (const m of line.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) targets.push(m[1]);
  const definition = /^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+"[^"]*")?\s*$/.exec(line);
  if (definition !== null) targets.push(definition[1]);
  for (const m of line.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)) targets.push(m[1]);
  return targets;
}

finish(() => {
  const args = parseArgs(process.argv.slice(2), { root: "value" });
  const root = resolve(args.root ?? join(here, ".."));
  const pages = [];
  if (existsSync(join(root, "README.md"))) pages.push("README.md");
  pages.push(...listFiles(join(root, "docs")).filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`));
  const problems = [];
  const anchorCache = new Map();
  const anchorsFor = (rel) => {
    if (!anchorCache.has(rel)) anchorCache.set(rel, anchorsOf(readFileSync(join(root, rel), "utf8")));
    return anchorCache.get(rel);
  };

  for (const page of pages) {
    for (const [line, number] of proseLines(readFileSync(join(root, page), "utf8"))) {
      for (const target of linksOn(line)) {
        const fail = (reason) => problems.push(`${page}:${number}: ${target}: ${reason}`);
        if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
          fail("an address on the web or a scheme. It cannot be checked without a request, so write it as code");
          continue;
        }
        const [pathPart, fragment] = target.split("#");
        if (pathPart === "") {
          if (fragment !== undefined && !anchorsFor(page).has(fragment.toLowerCase())) fail(`no heading #${fragment} on this page`);
          continue;
        }
        if (pathPart.startsWith("/")) {
          const site = join(root, "dist", "site", ...pathPart.split("/").filter(Boolean));
          const found = pathPart.endsWith("/") ? existsSync(join(site, "index.html")) : existsSync(site);
          if (!found) fail("no such page in dist/site. Assemble the site, or check the address");
          continue;
        }
        const resolved = resolve(root, dirname(page), decodeURIComponent(pathPart));
        if (resolved !== root && !resolved.startsWith(root + sep)) {
          fail("leaves the repository");
          continue;
        }
        if (!existsSync(resolved)) {
          fail("no such file or folder");
          continue;
        }
        if (fragment !== undefined && fragment !== "" && statSync(resolved).isFile() && resolved.endsWith(".md")) {
          const rel = posix.normalize(resolved.slice(root.length + 1).split(sep).join("/"));
          if (!anchorsFor(rel).has(fragment.toLowerCase())) fail(`no heading #${fragment} in ${rel}`);
        }
      }
    }
  }

  for (const problem of problems) console.error(problem);
  if (problems.length > 0) {
    console.log(`check-links: ${problems.length} broken link${problems.length === 1 ? "" : "s"}`);
    return 1;
  }
  console.log(`check-links: ok, ${pages.length} pages`);
  return 0;
});
