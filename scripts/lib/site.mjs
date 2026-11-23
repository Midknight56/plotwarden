// Assembling the static site and stamping its service worker. Used by scripts/assemble-site.mjs,
// scripts/build-sw.mjs and scripts/check-release.mjs.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { LOCK_PATH, readLock, verifyPreview } from "./desk.mjs";
import { Refusal, listFiles, sha256 } from "./files.mjs";

export const STAMP = "self.__PLOTWARDEN_SHELL = ";
const STAMP_LINE = /^self\.__PLOTWARDEN_SHELL = (\{.*\});\n/;

/** Files of the site that are not part of the offline shell: the worker itself and the host's headers file. */
const NOT_SHELL = new Set(["sw.js", "_headers"]);

export const SW_TAG = '<script type="module" src="/sw-register.js"></script>';

/** The pages that carry the worker's script: every page of the site's own, and none of the Desk's or a visitor file. */
export const PAGES_WITH_TAG = ["index.html", "churchyard/index.html", "allotments/index.html", "visitor/family/index.html", "visitor/seeker/index.html"];

const readUtf8 = (path) => readFileSync(path, "utf8");

/** The shell of a built site: its version and the paths of its files. */
export function shellOf(siteDir) {
  const rels = listFiles(siteDir).filter((f) => !NOT_SHELL.has(f));
  const files = rels.map((f) => `/${f}`).sort();
  const text = files.map((f) => `${f}\0${sha256(readFileSync(join(siteDir, f.slice(1))))}\n`).join("");
  return { version: sha256(text).slice(0, 16), files };
}

/** A font file in a built site is a woff2 file. */
const isFont = (name) => name.endsWith(".woff2");

/**
 * Keep one copy of each font file in a built site.
 *
 * The three builds (the hub, the Churchyard Register and the Allotment Register) each carry the font files that their
 * styles name, with a hashed name, so the same font has the same name and the same bytes in every build. The copy that
 * the site keeps is in the hub's own `assets/` folder. A file in an app's `assets/` folder is removed when the shared
 * folder holds the same name with the same bytes. A file that only the app holds moves to the shared folder. Two files
 * with one name and different bytes are refused, and nothing is changed. Each `.css` file of an app is then pointed
 * at the shared copy, with a path relative to itself, so the site works from any folder.
 * Folders that are not named (the Desk preview at `review/`) are not read or changed.
 * @param {string} siteDir
 * @param {readonly string[]} appFolders folders of the site that hold one app build each, such as `churchyard`
 * @returns {{ removed: string[], moved: string[] }} the paths removed and moved, relative to the site
 */
export function dedupeFonts(siteDir, appFolders) {
  const shared = join(siteDir, "assets");
  const fontsOf = (dir) => (existsSync(dir) ? readdirSync(dir).filter(isFont).sort() : []);
  const plan = [];
  const claimed = new Map();
  for (const name of fontsOf(shared)) claimed.set(name, sha256(readFileSync(join(shared, name))));
  for (const folder of appFolders) {
    const dir = join(siteDir, folder, "assets");
    for (const name of fontsOf(dir)) {
      const digest = sha256(readFileSync(join(dir, name)));
      const known = claimed.get(name);
      if (known === undefined) {
        claimed.set(name, digest);
        plan.push({ folder, name, action: "move" });
      } else if (known === digest) {
        plan.push({ folder, name, action: "remove" });
      } else {
        throw new Refusal(`The font file ${name} has the same name in ${folder}/assets and in another folder, with different bytes. One copy cannot serve both.`, 1);
      }
    }
  }
  const removed = [];
  const moved = [];
  mkdirSync(shared, { recursive: true });
  for (const { folder, name, action } of plan) {
    const from = join(siteDir, folder, "assets", name);
    if (action === "move") {
      renameSync(from, join(shared, name));
      moved.push(`${folder}/assets/${name}`);
    } else {
      rmSync(from);
      removed.push(`${folder}/assets/${name}`);
    }
  }
  // Point each app's styles at the shared copy. A url that already names the shared folder is left as it is.
  const names = new Set(claimed.keys());
  for (const folder of appFolders) {
    const dir = join(siteDir, folder, "assets");
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".css"))) {
      const path = join(dir, file);
      const css = readUtf8(path);
      const next = css.replace(/url\((["']?)\.\/([^)"']+\.woff2)\1\)/g, (whole, quote, name) => (names.has(name) ? `url(${quote}../../assets/${name}${quote})` : whole));
      if (next !== css) writeFileSync(path, next);
    }
  }
  return { removed, moved };
}

/** Read the stamp at the head of sw.js. Undefined when the worker has none. */
export function readStamp(siteDir) {
  const file = join(siteDir, "sw.js");
  if (!existsSync(file)) return undefined;
  const text = readUtf8(file);
  const match = STAMP_LINE.exec(text);
  if (match === null) return undefined;
  try {
    return { manifest: JSON.parse(match[1]), rest: text.slice(match[0].length) };
  } catch {
    return undefined;
  }
}

/** Put the shell manifest at the head of sw.js. Safe to run again: an earlier stamp is replaced. */
export function stampWorker(siteDir) {
  const file = join(siteDir, "sw.js");
  if (!existsSync(file)) throw new Refusal(`There is no sw.js in ${siteDir}. Build the site first.`);
  const text = readUtf8(file);
  const rest = text.replace(STAMP_LINE, "");
  const manifest = shellOf(siteDir);
  writeFileSync(file, `${STAMP}${JSON.stringify(manifest)};\n${rest}`);
  return manifest;
}

/** Add the worker's script tag before the end of the head, once. */
export function injectWorkerTag(html, page) {
  if (html.includes(SW_TAG)) return html;
  const at = html.indexOf("</head>");
  if (at === -1) throw new Refusal(`The page ${page} has no head, so the worker's script cannot be added.`, 2);
  return `${html.slice(0, at)}${SW_TAG}${html.slice(at)}`;
}

const VISITOR_FILES = { family: /^family-map-\d{4}-\d{2}-\d{2}\.html$/, seeker: /^availability-map-\d{4}-\d{2}-\d{2}\.html$/ };

/** The input folders, checked. Every missing part is named, so one run says everything. */
export function checkInputs(root) {
  const apps = join(root, "dist", "apps");
  const missing = [];
  const need = (rel) => {
    if (!existsSync(join(apps, rel))) missing.push(`dist/apps/${rel}`);
  };
  for (const rel of ["hub/index.html", "hub/404.html", "hub/_headers", "hub/sw.js", "hub/sw-register.js", "churchyard/index.html", "churchyard/practice-book.csv", "allotments/index.html", "hub/visitor/family/index.html", "hub/visitor/seeker/index.html"]) need(rel);
  for (const [kind, pattern] of Object.entries(VISITOR_FILES)) {
    const dir = join(apps, "hub", "visitor", kind);
    if (!listFiles(dir).some((f) => pattern.test(f))) missing.push(`a visitor file in dist/apps/hub/visitor/${kind}/`);
  }
  if (missing.length > 0) throw new Refusal(`Build the apps first. These are missing: ${missing.join(", ")}.`);
}

/**
 * Compose the site in `out` from the app builds and a Desk preview. The preview is checked against the lock
 * first, and nothing is written when it differs. The new folder is built beside the old one and swapped in
 * only when whole, so a failure leaves the old folder as it was.
 */
export function assembleSite({ root, deskPreview, out }) {
  const lock = readLock(root);
  checkInputs(root);
  const problems = verifyPreview(deskPreview, lock);
  if (problems.length > 0) {
    throw new Refusal(`The Desk preview does not match ${LOCK_PATH}:\n${problems.map((p) => `  ${p}`).join("\n")}`, 1);
  }

  const apps = join(root, "dist", "apps");
  const temp = `${out}.tmp`;
  rmSync(temp, { recursive: true, force: true });
  try {
    mkdirSync(temp, { recursive: true });
    cpSync(join(apps, "hub"), temp, { recursive: true });
    cpSync(join(apps, "churchyard"), join(temp, "churchyard"), { recursive: true });
    cpSync(join(apps, "allotments"), join(temp, "allotments"), { recursive: true });
    cpSync(deskPreview, join(temp, "review"), { recursive: true });
    // Each build carries its own copy of the font files. The site keeps one, and the apps' styles point at it.
    dedupeFonts(temp, ["churchyard", "allotments"]);
    for (const page of PAGES_WITH_TAG) {
      const file = join(temp, page);
      writeFileSync(file, injectWorkerTag(readUtf8(file), page));
    }
    const manifest = stampWorker(temp);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(dirname(out), { recursive: true });
    renameSync(temp, out);
    const files = listFiles(out);
    const bytes = files.reduce((sum, f) => sum + statSync(join(out, f)).size, 0);
    return { files: files.length, bytes, version: manifest.version };
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}
