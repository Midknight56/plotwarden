// Assembling the static site and stamping its service worker. Used by scripts/assemble-site.mjs,
// scripts/build-sw.mjs and scripts/check-release.mjs.
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  for (const rel of ["hub/index.html", "hub/404.html", "hub/_headers", "hub/sw.js", "hub/sw-register.js", "churchyard/index.html", "allotments/index.html", "hub/visitor/family/index.html", "hub/visitor/seeker/index.html"]) need(rel);
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
