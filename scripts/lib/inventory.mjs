// The inventory of proof pictures. Every route of both registers has a phone picture, and every page of the
// site has a phone and a desktop picture. The check reads each file, not just its name: it must be a picture,
// not empty, and as wide as the viewport it was taken at.
//
// The route names come from tests/browser/layout.spec.ts and tests/helpers/routes.ts (`routesOf`, `routeName`).
// A page of the built site that this table does not know is a fault, so a new route cannot go unseen.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { listFiles } from "./files.mjs";

export const PHONE = 360;
export const DESKTOP = 1920;
const MIN_BYTES = 1024;

const LIBRARY = ["home", "new", "restore", "settings", "help", "about", "nope"];
const SHARED = ["home", "map", "map-edit", "map-trace", "list", "plot", "add", "add-one", "add-fast", "add-import", "exchange", "backup", "restore", "settings", "help"];
const CHURCH_MORE = ["burial-new", "burial", "reserve", "unplaced", "family", "report"];
const GARDEN_MORE = ["waiting", "offer", "tenancy", "handover", "season", "payments", "seeker", "report"];

/** The pictures of the site, and the page or pages each one shows. */
export const SITE_PROOFS = {
  "hub-home": "index.html",
  "hub-about": "index.html",
  "hub-not-found": "404.html",
  "visitor-family-home": "visitor/family/index.html",
  "visitor-family-about": "visitor/family/index.html",
  "visitor-family-file": "visitor/family/",
  "visitor-seeker-home": "visitor/seeker/index.html",
  "visitor-seeker-about": "visitor/seeker/index.html",
  "visitor-seeker-file": "visitor/seeker/",
  "church-entry": "churchyard/index.html",
  "allotments-entry": "allotments/index.html",
  "review-entry": "review/index.html",
};

/** Every picture the release needs, with the width it must have. */
export function expectedProofs() {
  const wanted = [];
  const routes = "docs/acceptance/layout/routes";
  for (const app of ["churchyard", "allotment"]) {
    for (const name of LIBRARY) wanted.push({ path: `${routes}/${app}/library-${name}-phone.jpg`, width: PHONE });
    for (const name of [...SHARED, ...(app === "churchyard" ? CHURCH_MORE : GARDEN_MORE)]) wanted.push({ path: `${routes}/${app}/route-${name}-phone.jpg`, width: PHONE });
  }
  for (const name of Object.keys(SITE_PROOFS)) {
    wanted.push({ path: `docs/acceptance/layout/site/${name}-phone.jpg`, width: PHONE });
    wanted.push({ path: `docs/acceptance/layout/site/${name}-desktop.jpg`, width: DESKTOP });
  }
  return wanted;
}

/** The width and height of a JPEG or PNG, or undefined when the bytes are neither. */
export function pictureSize(bytes) {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return undefined;
      const marker = bytes[at + 1];
      if (marker === 0xff) {
        at += 1;
        continue;
      }
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isFrame) return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) };
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) at += 2;
      else at += 2 + bytes.readUInt16BE(at + 2);
    }
  }
  return undefined;
}

/** What is wrong with the proof pictures under `root`, one sentence each. `siteDir` is the built site, to find pages with no proof. */
export function inventoryProblems(root, siteDir) {
  const problems = [];
  for (const { path, width } of expectedProofs()) {
    const file = join(root, path);
    if (!existsSync(file)) {
      problems.push(`${path}: missing`);
      continue;
    }
    const bytes = readFileSync(file);
    if (statSync(file).size < MIN_BYTES) {
      problems.push(`${path}: too small to be a picture (${bytes.length} bytes)`);
      continue;
    }
    const size = pictureSize(bytes);
    if (size === undefined) problems.push(`${path}: not a JPEG or PNG picture`);
    else if (size.width !== width) problems.push(`${path}: ${size.width} px wide, the ${width === PHONE ? "phone" : "desktop"} size is ${width} px`);
    else if (size.height < 1) problems.push(`${path}: no height`);
  }

  if (!existsSync(siteDir)) {
    problems.push("dist/site: not built, so the pages cannot be matched with their pictures. Assemble the site first");
    return problems;
  }
  const known = new Set(Object.values(SITE_PROOFS));
  for (const page of listFiles(siteDir).filter((f) => f.endsWith(".html"))) {
    const isSampleFile = /^visitor\/(family|seeker)\/[^/]+\.html$/.test(page) && !page.endsWith("/index.html");
    if (isSampleFile ? !known.has(`${page.slice(0, page.lastIndexOf("/") + 1)}`) : !known.has(page)) {
      problems.push(`${page}: no proof pictures are listed for this page. Add it to scripts/lib/inventory.mjs and take them`);
    }
  }
  return problems;
}
