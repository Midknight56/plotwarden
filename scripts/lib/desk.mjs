// The Desk preview and the lock that pins it. The lock holds the Desk name, version, git revision, the hash of
// every file of the preview and the packages the preview bundles. `scripts/lock-desk.mjs` writes it, on a person's
// command. `scripts/assemble-site.mjs` and `scripts/check-release.mjs` only read it and compare.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Refusal, listFiles, sha256 } from "./files.mjs";

export const LOCK_PATH = "release/desk-preview.lock.json";
export const DESK_NAME = "plotwarden-review-desk";

/** The Desk checkout that holds a preview folder `<desk>/dist/preview`. */
export const deskRootOf = (previewDir) => resolve(previewDir, "..", "..");

/** The commit that HEAD names, read from the git folder with no git process. Undefined when it cannot be read. */
export function readRevision(deskRoot) {
  const git = join(deskRoot, ".git");
  const headFile = join(git, "HEAD");
  if (!existsSync(headFile) || !statSync(git).isDirectory()) return undefined;
  const head = readFileSync(headFile, "utf8").trim();
  if (/^[0-9a-f]{40}$/.test(head)) return head;
  const ref = /^ref: (\S+)$/.exec(head)?.[1];
  if (ref === undefined) return undefined;
  const loose = join(git, ...ref.split("/"));
  if (existsSync(loose)) {
    const value = readFileSync(loose, "utf8").trim();
    return /^[0-9a-f]{40}$/.test(value) ? value : undefined;
  }
  const packed = join(git, "packed-refs");
  if (existsSync(packed)) {
    for (const line of readFileSync(packed, "utf8").split("\n")) {
      const [sha, name] = line.trim().split(" ");
      if (name === ref && /^[0-9a-f]{40}$/.test(sha ?? "")) return sha;
    }
  }
  return undefined;
}

/** The name and version in the Desk's package.json, and its revision. Missing parts come back undefined. */
export function readDeskMeta(deskRoot) {
  const file = join(deskRoot, "package.json");
  let name;
  let version;
  if (existsSync(file)) {
    try {
      const json = JSON.parse(readFileSync(file, "utf8"));
      if (typeof json.name === "string") name = json.name;
      if (typeof json.version === "string") version = json.version;
    } catch {
      // A damaged package.json reads as missing.
    }
  }
  return { name, version, revision: readRevision(deskRoot) };
}

/** The hash of every file of a preview folder, as `{ "assets/x.js": "<sha256>" }` in path order. */
export function hashFiles(dir) {
  const hashes = {};
  for (const rel of listFiles(dir)) hashes[rel] = sha256(readFileSync(join(dir, rel)));
  return hashes;
}

/** The packages whose code is inside the preview, read from the `// node_modules/<name>/` marks of its readable scripts. */
export function bundledPackages(previewDir, deskRoot) {
  const names = new Set();
  for (const rel of listFiles(previewDir)) {
    if (!/\.m?js$/.test(rel)) continue;
    for (const line of readFileSync(join(previewDir, rel), "utf8").split("\n")) {
      const match = /^\s*\/\/\s+(?:.*\/)?node_modules\/((?:@[^/\s]+\/)?[^/\s]+)\//.exec(line);
      if (match !== null) names.add(match[1]);
    }
  }
  return [...names].sort().map((name) => {
    const file = join(deskRoot, "node_modules", ...name.split("/"), "package.json");
    if (!existsSync(file)) throw new Refusal(`The preview bundles ${name}, which is not installed in the Desk checkout, so its licence cannot be read.`);
    const json = JSON.parse(readFileSync(file, "utf8"));
    const license = typeof json.license === "string" ? json.license : typeof json.license?.type === "string" ? json.license.type : undefined;
    if (typeof json.version !== "string" || license === undefined) throw new Refusal(`The package ${name} in the Desk checkout states no version or no licence.`);
    return { name, version: json.version, license };
  });
}

/** Make the lock from a preview folder and its Desk checkout. */
export function makeLock(previewDir) {
  if (!existsSync(previewDir) || !statSync(previewDir).isDirectory()) throw new Refusal(`The Desk preview folder is not there: ${previewDir}`);
  if (!existsSync(join(previewDir, "index.html"))) throw new Refusal("The Desk preview folder has no index.html. Build the Desk first.");
  const deskRoot = deskRootOf(previewDir);
  const meta = readDeskMeta(deskRoot);
  if (meta.name !== DESK_NAME) throw new Refusal(`The Desk checkout beside the preview is not ${DESK_NAME}: its package.json says ${meta.name ?? "nothing"}.`);
  if (meta.version === undefined) throw new Refusal("The Desk checkout has no version in its package.json.");
  if (meta.revision === undefined) throw new Refusal("The Desk checkout has no readable git revision. Pin a preview built from a commit.");
  return {
    lock: 1,
    name: meta.name,
    version: meta.version,
    revision: meta.revision,
    entry: "index.html",
    files: hashFiles(previewDir),
    bundled: bundledPackages(previewDir, deskRoot),
  };
}

/** Read a lock and check its shape. A missing or damaged lock is a refusal. */
export function readLock(root) {
  const file = join(root, LOCK_PATH);
  if (!existsSync(file)) throw new Refusal(`There is no ${LOCK_PATH}. Write it once with: npm run lock:desk -- --desk <preview folder>`);
  let lock;
  try {
    lock = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Refusal(`${LOCK_PATH} is not valid JSON.`);
  }
  const files = lock?.files;
  const sound =
    lock?.lock === 1 &&
    typeof lock.name === "string" &&
    typeof lock.version === "string" &&
    /^[0-9a-f]{40}$/.test(lock.revision ?? "") &&
    typeof files === "object" &&
    files !== null &&
    Object.values(files).every((h) => /^[0-9a-f]{64}$/.test(h)) &&
    typeof files[lock.entry] === "string" &&
    Array.isArray(lock.bundled);
  if (!sound) throw new Refusal(`${LOCK_PATH} does not have the shape of a lock.`);
  return lock;
}

/**
 * Compare a preview folder, and the Desk checkout beside it, with the lock.
 * Returns what differs, one sentence each, or an empty list.
 */
export function verifyPreview(previewDir, lock) {
  const problems = [];
  if (!existsSync(previewDir) || !statSync(previewDir).isDirectory()) return [`The Desk preview folder is not there: ${previewDir}`];
  const meta = readDeskMeta(deskRootOf(previewDir));
  if (meta.name !== lock.name) problems.push(`name is ${meta.name ?? "missing"}, the lock says ${lock.name}`);
  if (meta.version !== lock.version) problems.push(`version is ${meta.version ?? "missing"}, the lock says ${lock.version}`);
  if (meta.revision !== lock.revision) problems.push(`revision is ${meta.revision ?? "missing"}, the lock says ${lock.revision}`);
  const actual = hashFiles(previewDir);
  for (const [rel, hash] of Object.entries(lock.files)) {
    if (actual[rel] === undefined) problems.push(`file ${rel} is in the lock and missing from the preview`);
    else if (actual[rel] !== hash) problems.push(`file ${rel} differs from the lock`);
  }
  for (const rel of Object.keys(actual)) {
    if (lock.files[rel] === undefined) problems.push(`file ${rel} is in the preview and not in the lock`);
  }
  return problems;
}
