// Every package that ships has its licence in THIRD_PARTY_NOTICES.md, with its version and the licence its own
// package.json states. Shipped means: in the lockfile and not development only (so the packages inside the
// two apps), every package that the pinned Desk preview bundles (from release/desk-preview.lock.json), and the two
// font packages. The fonts are development packages, but their woff2 files are copied into fonts/ and ship in every
// build, so they count as shipped when that folder exists, and the notices must hold the text of their licence.
//
//   node scripts/check-licenses.mjs [--root <repo>]
//
// Exit 0 when every row is there. Exit 1 and name each package that is missing, at another version or under
// another licence. Nothing is guessed: a package that is not installed or states no licence is a fault.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCK_PATH } from "./lib/desk.mjs";
import { Refusal, finish, parseArgs } from "./lib/files.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/** The packages whose files are copied into fonts/. */
const FONT_PACKAGES = ["@fontsource/atkinson-hyperlegible-next", "@fontsource/gelasio"];
/** The first line of the licence that the font packages state. The notices hold its full text. */
const FONT_LICENCE_TITLE = "SIL OPEN FONT LICENSE Version 1.1";

/** The rows of every table in the notices: package name, first word of the version cell, licence cell. */
function noticeRows(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.length < 3 || /^-+$/.test(cells[0]) || cells[0] === "Package") continue;
    rows.push({ name: cells[0], version: cells[1].split(/\s+/)[0], license: cells[2] });
  }
  return rows;
}

const licenseOf = (json) => (typeof json.license === "string" ? json.license : typeof json.license?.type === "string" ? json.license.type : undefined);

finish(() => {
  const args = parseArgs(process.argv.slice(2), { root: "value" });
  const root = resolve(args.root ?? join(here, ".."));
  const lockFile = join(root, "package-lock.json");
  const noticesFile = join(root, "THIRD_PARTY_NOTICES.md");
  if (!existsSync(lockFile)) throw new Refusal("There is no package-lock.json.");
  if (!existsSync(noticesFile)) throw new Refusal("There is no THIRD_PARTY_NOTICES.md.");
  const rows = noticeRows(readFileSync(noticesFile, "utf8"));
  const problems = [];

  const shipped = [];
  const lock = JSON.parse(readFileSync(lockFile, "utf8"));
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (path === "" || entry.dev === true || entry.devOptional === true) continue;
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    const manifest = join(root, path, "package.json");
    let license;
    if (!existsSync(manifest)) {
      problems.push(`${name} ${entry.version}: shipped, but not installed in ${path}, so its licence cannot be read`);
      continue;
    }
    license = licenseOf(JSON.parse(readFileSync(manifest, "utf8")));
    if (license === undefined) {
      problems.push(`${name} ${entry.version}: no licence stated in its package.json`);
      continue;
    }
    shipped.push({ name, version: entry.version, license, where: "the apps" });
  }

  let fonts = 0;
  if (existsSync(join(root, "fonts"))) {
    for (const name of FONT_PACKAGES) {
      const manifest = join(root, "node_modules", name, "package.json");
      if (!existsSync(manifest)) {
        problems.push(`${name}: its files are in fonts/, but it is not installed in node_modules, so its licence cannot be read`);
        continue;
      }
      const json = JSON.parse(readFileSync(manifest, "utf8"));
      const license = licenseOf(json);
      if (license === undefined) {
        problems.push(`${name} ${json.version}: no licence stated in its package.json`);
        continue;
      }
      shipped.push({ name, version: json.version, license, where: "the fonts folder" });
      fonts += 1;
    }
    if (!readFileSync(noticesFile, "utf8").includes(FONT_LICENCE_TITLE)) {
      problems.push("fonts/ holds font files, but THIRD_PARTY_NOTICES.md does not hold the text of the SIL Open Font License 1.1");
    }
  }

  const deskLock = join(root, LOCK_PATH);
  if (existsSync(deskLock)) {
    const desk = JSON.parse(readFileSync(deskLock, "utf8"));
    for (const p of desk.bundled ?? []) shipped.push({ name: p.name, version: p.version, license: p.license, where: "the Review Desk preview" });
  }

  for (const { name, version, license, where } of shipped) {
    const named = rows.filter((r) => r.name === name);
    const exact = named.find((r) => r.version === version);
    if (named.length === 0) problems.push(`${name} ${version}: shipped in ${where}, and has no row in THIRD_PARTY_NOTICES.md`);
    else if (exact === undefined) problems.push(`${name} ${version}: shipped in ${where}, but the notices list ${name} ${named.map((r) => r.version).join(", ")}`);
    else if (exact.license !== license) problems.push(`${name} ${version}: the notices say ${exact.license}, the package says ${license}`);
  }

  for (const problem of problems) console.error(problem);
  if (problems.length > 0) {
    console.log(`check-licenses: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
    return 1;
  }
  console.log(`check-licenses: ok, ${shipped.length} shipped packages${fonts > 0 ? `, including ${fonts} font packages,` : ""} each with its row`);
  return 0;
});
