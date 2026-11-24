// Write a pinned copy of the exchange module for the Review Desk repository.
//
//   node scripts/export-exchange.mjs <folder> [--root <repo>]
//   node scripts/export-exchange.mjs --to <folder>
//
// The copy mirrors template/src, so every relative import stays valid and every file stays byte for byte equal:
//   <folder>/exchange/{schema,packet,compare,slip}.ts
//   <folder>/{calendar,limits,types}.ts       the pure files those four import
//   <folder>/vectors.json                     the shared contract vectors
//   <folder>/provenance.json                  source, revision, licence, and the SHA 256 of every file
// Exit 0 when written. Exit 1 when the exchange imports something that is not on the list, a file has a carriage
// return or a byte order mark, the root is not a git checkout, or the folder holds files this script did not write.
// Exit 2 when no folder is given. Nothing is written before every check has passed. No clock value is written.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveImport, scanSource } from "./lib/imports.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * [path in the repository, path in the copy], read from scripts/lib/exchange-files.json, the one list that the
 * Review Desk drift check reads too. The four exchange files come first, then what they import, then the vectors.
 */
const PAIRS = JSON.parse(readFileSync(join(here, "lib", "exchange-files.json"), "utf8"));
const PURE = PAIRS.filter(([from]) => from.endsWith(".ts"));
const VECTORS = PAIRS.find(([from]) => !from.endsWith(".ts"));
const FORMAT = "plot.exchange.vendor.v1";
const ALLOWED_PACKAGE = "zod";

function usage() {
  console.error("export-exchange: give a folder to write to.");
  console.error("Use: node scripts/export-exchange.mjs <folder> [--root <repo>]");
  return 2;
}

function parseArgs(argv) {
  let root = resolve(here, "..");
  let folder;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root" && argv[i + 1] !== undefined) {
      root = resolve(argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--to" && argv[i + 1] !== undefined) {
      folder = resolve(argv[i + 1]);
      i += 1;
    } else if (!argv[i].startsWith("--") && folder === undefined) {
      folder = resolve(argv[i]);
    }
  }
  return { root, folder };
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Problems with the source files: missing, carriage returns, a byte order mark, an import that is not on the list. */
function checkSources(root) {
  const problems = [];
  const sources = new Map();
  const listed = new Set(PURE.map(([from]) => from));
  for (const [from] of [...PURE, VECTORS]) {
    const path = join(root, from);
    if (!existsSync(path)) {
      problems.push(`${from}: not found`);
      continue;
    }
    const bytes = readFileSync(path);
    sources.set(from, bytes);
    if (bytes.includes(13)) problems.push(`${from}: has a carriage return. Use LF line endings.`);
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) problems.push(`${from}: has a byte order mark.`);
  }
  for (const [from] of PURE) {
    const bytes = sources.get(from);
    if (bytes === undefined) continue;
    for (const spec of scanSource(bytes.toString("utf8")).imports) {
      const found = resolveImport(from, spec);
      if (found.kind === "bare") {
        if (found.pkg !== ALLOWED_PACKAGE) problems.push(`${from} -> ${found.pkg}: a package other than ${ALLOWED_PACKAGE}`);
      } else if (!listed.has(`${found.target}.ts`)) {
        problems.push(`${from} -> ${found.target}: not on the list of files the copy holds`);
      }
    }
  }
  return { problems, sources };
}

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

/** The source repository, the revision and the listed files with uncommitted changes. Throws if root is not a checkout. */
function readGit(root, packageName) {
  const sameFolder = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
  let top;
  try {
    top = git(root, "rev-parse", "--show-toplevel");
  } catch {
    throw new Error(`${root} is not a git checkout, so no revision can be written.`);
  }
  if (!sameFolder(top, root)) throw new Error(`${root} is not the top of a git checkout, so no revision can be written.`);
  const gitRevision = git(root, "rev-parse", "HEAD");
  let sourceRepo = packageName;
  try {
    sourceRepo = git(root, "remote", "get-url", "origin").replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, "$1");
  } catch {
    // No remote: the package name stands in.
  }
  const uncommittedFiles = [...PURE, VECTORS]
    .map(([from]) => from)
    .filter((from) => git(root, "status", "--porcelain", "--", from) !== "")
    .sort();
  return { gitRevision, sourceRepo, uncommittedFiles };
}

/** What an earlier export wrote, from its provenance, or undefined if the folder holds anything else. */
function earlierExport(folder) {
  const names = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) visit(full);
      else names.push(full.slice(folder.length + 1).replace(/\\/g, "/"));
    }
  };
  visit(folder);
  if (names.length === 0) return { empty: true, listed: [] };
  let listed;
  try {
    const earlier = JSON.parse(readFileSync(join(folder, "provenance.json"), "utf8"));
    if (earlier.format !== FORMAT || !Array.isArray(earlier.files)) throw new Error("not ours");
    listed = earlier.files.map((f) => String(f.path));
  } catch {
    return { foreign: names };
  }
  const known = new Set([...listed, "provenance.json"]);
  const foreign = names.filter((n) => !known.has(n));
  return foreign.length > 0 ? { foreign } : { empty: false, listed };
}

function removeEmptyFolders(folder) {
  for (const name of readdirSync(folder)) {
    const full = join(folder, name);
    if (!statSync(full).isDirectory()) continue;
    removeEmptyFolders(full);
    if (readdirSync(full).length === 0) rmdirSync(full);
  }
}

function main() {
  const { root, folder } = parseArgs(process.argv.slice(2));
  if (folder === undefined) return usage();

  const { problems, sources } = checkSources(root);
  if (problems.length > 0) {
    for (const p of problems) console.error(`export-exchange: ${p}`);
    return 1;
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    console.error(`export-exchange: no package.json in ${root}`);
    return 1;
  }
  let facts;
  try {
    facts = readGit(root, String(pkg.name ?? "plotwarden"));
  } catch (error) {
    console.error(`export-exchange: ${error.message}`);
    return 1;
  }

  let earlier = { empty: true, listed: [] };
  if (existsSync(folder)) {
    if (!statSync(folder).isDirectory()) {
      console.error(`export-exchange: ${folder} is a file, not a folder.`);
      return 1;
    }
    earlier = earlierExport(folder);
    if (earlier.foreign !== undefined) {
      console.error(`export-exchange: ${folder} holds files this script did not write: ${earlier.foreign.join(", ")}. Nothing was changed.`);
      return 1;
    }
  }

  const entries = [...PURE, VECTORS]
    .map(([from, to]) => {
      const bytes = sources.get(from);
      return { path: to, sourcePath: from, bytes, length: bytes.length, sha256: sha256(bytes) };
    })
    .sort((a, b) => (a.path < b.path ? -1 : 1));

  const provenance = {
    format: FORMAT,
    sourceRepo: facts.sourceRepo,
    gitRevision: facts.gitRevision,
    uncommittedFiles: facts.uncommittedFiles,
    licence: String(pkg.license ?? ""),
    requires: { [ALLOWED_PACKAGE]: String(pkg.dependencies?.[ALLOWED_PACKAGE] ?? "") },
    files: entries.map((e) => ({ path: e.path, sourcePath: e.sourcePath, bytes: e.length, sha256: e.sha256 })),
  };

  // Every check has passed. Take away what an earlier export wrote, then write.
  if (existsSync(folder)) {
    for (const old of [...earlier.listed, "provenance.json"]) rmSync(join(folder, old), { force: true });
    removeEmptyFolders(folder);
  }
  mkdirSync(folder, { recursive: true });
  for (const e of entries) {
    mkdirSync(dirname(join(folder, e.path)), { recursive: true });
    writeFileSync(join(folder, e.path), e.bytes);
  }
  writeFileSync(join(folder, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);

  for (const e of entries) console.log(`${e.sha256}  ${e.path}`);
  console.log("export-exchange: ok");
  return 0;
}

process.exitCode = main();
