// The release check. Two parts:
//
//   site       the assembled site in dist/site: direct entry pages are real pages, no remote asset, no billing
//              endpoint, no server code, one content policy per page, a stamped worker, the Desk copy equal to
//              its lock, under 500 files and 5 MiB.
//   inventory  the proof pictures: every route has its picture at the right width, and every page of the
//              built site has pictures listed.
//
//   node scripts/check-release.mjs [--root <repo>] [--part site|inventory|all]
//
// Exit 0 when clean. Exit 1 and print `path: rule: message` for each finding. Exit 2 when the site is not built.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Refusal, finish, parseArgs } from "./lib/files.mjs";
import { inventoryProblems } from "./lib/inventory.mjs";
import { siteProblems } from "./lib/siteScan.mjs";

const here = dirname(fileURLToPath(import.meta.url));

finish(() => {
  const args = parseArgs(process.argv.slice(2), { root: "value", part: "value" });
  const root = resolve(args.root ?? join(here, ".."));
  const part = args.part ?? "all";
  if (!["site", "inventory", "all"].includes(part)) throw new Refusal(`The part is site, inventory or all, not ${part}`);
  const siteDir = join(root, "dist", "site");
  const found = [];
  if (part === "site" || part === "all") found.push(...siteProblems(root, siteDir));
  if (part === "inventory" || part === "all") {
    for (const message of inventoryProblems(root, siteDir)) {
      const at = message.indexOf(": ");
      found.push({ path: message.slice(0, at), rule: "inventory", message: message.slice(at + 2) });
    }
  }
  for (const f of found) console.error(`${f.path}: ${f.rule}: ${f.message}`);
  if (found.length > 0) {
    console.log(`check-release: ${found.length} problem${found.length === 1 ? "" : "s"}`);
    return 1;
  }
  console.log(`check-release: ok (${part})`);
  return 0;
});
