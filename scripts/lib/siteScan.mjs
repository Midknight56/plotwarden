// What the release check reads in a built site: pages that are real pages, no remote asset, no billing endpoint,
// no server code, one content policy per page, a stamped worker, a Desk copy equal to its lock, and size.
// Each finding is `{ path, rule, message }`.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { LOCK_PATH, readLock } from "./desk.mjs";
import { Refusal, listFiles, sha256 } from "./files.mjs";
import { parseHeaders, policyProblems, valuesOf } from "./headers.mjs";
import { PAGES_WITH_TAG, SW_TAG, readStamp, shellOf } from "./site.mjs";

export const MAX_FILES = 500;
export const MAX_BYTES = 5 * 1024 * 1024;

const ENTRY_PAGES = ["index.html", "churchyard/index.html", "allotments/index.html", "review/index.html", "visitor/family/index.html", "visitor/seeker/index.html", "404.html"];
/** Files that are not pages and that a page links to. The practice book is the Churchyard Register's, on its Import screen. */
const LINKED_FILES = ["churchyard/practice-book.csv"];
const TEXT_FILE = /\.(?:html?|m?js|css|json|svg|webmanifest|txt|xml)$/i;
const SERVER_CODE = [/^functions\//, /^_routes\.json$/, /^_worker\.js$/, /^_worker\.js\//, /^wrangler\.(?:toml|jsonc?)$/];

// Addresses that are not requests: namespaces, the page that a bundled React names in an error message, and the
// schema identifier that a bundled zod writes as a string when asked for a JSON schema. A person's own check of
// the two apps' bundles found the last one. None of them is ever fetched.
const ALLOWED_HOSTS = new Set(["www.w3.org", "reactjs.org", "react.dev", "json-schema.org"]);

/** A script with its comments gone, so an address in a comment is not read as a request. Whole line comments and block comments only. */
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

const BILLING_HOSTS = /(?:^|\.)(?:stripe\.com|paypal\.com|paypalobjects\.com|paddle\.com|braintreegateway\.com|adyen\.com|squareup\.com|checkout\.com|lemonsqueezy\.com|gumroad\.com|klarna\.com)$/i;
const BILLING_PATHS = /\/api\/(?:checkout|billing|payments?|charges?|subscri[a-z]*)\b|\/(?:billing|checkout)\/(?:session|portal|create)\b/i;

const sealedVisitorFile = (rel) => /^visitor\/(?:family\/family-map-|seeker\/availability-map-)[^/]*\.html$/.test(rel);

/** A policy with its spaces and its trailing semicolons made plain, so two copies of one policy compare equal. */
const normalPolicy = (policy) =>
  policy
    .split(";")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter((part) => part !== "")
    .join("; ");

/** The `src` and `href` values that a page loads: scripts, styles, images, icons. Links to other pages are not loads. */
function loadsOf(html) {
  const loads = [];
  for (const tag of html.matchAll(/<(script|link|img|source|iframe|video|audio)\b[^>]*>/gi)) {
    const [text, name] = tag;
    if (name.toLowerCase() === "link" && !/\brel=["']?(?:stylesheet|modulepreload|preload|icon|manifest)/i.test(text)) continue;
    const attr = /\b(?:src|href)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(text);
    const value = attr?.[1] ?? attr?.[2] ?? attr?.[3];
    if (value !== undefined && value !== "") loads.push(value);
  }
  return loads;
}

const visibleText = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Which absolute or protocol relative addresses a text file holds. */
function addressesOf(rel, text) {
  const found = [];
  for (const match of text.matchAll(/\b(?:https?|wss?):\/\/([A-Za-z0-9.-]+)(?::\d+)?([^\s"'`)<>\\]*)/gi)) found.push({ host: match[1].toLowerCase(), path: match[2], text: match[0] });
  if (/\.(?:html?|css)$/i.test(rel)) {
    const loadPatterns = [/\b(?:src|href|action|poster|data)=["']?(\/\/[A-Za-z0-9.-]+)([^\s"'>]*)/gi, /url\(\s*["']?(\/\/[A-Za-z0-9.-]+)([^\s"')]*)/gi, /@import\s+["'](\/\/[A-Za-z0-9.-]+)([^"']*)/gi];
    for (const pattern of loadPatterns) for (const match of text.matchAll(pattern)) found.push({ host: match[1].slice(2).toLowerCase(), path: match[2], text: `${match[1]}${match[2]}` });
  }
  return found;
}

/** What is wrong with a built site. */
export function siteProblems(root, siteDir) {
  if (!existsSync(siteDir) || !statSync(siteDir).isDirectory()) {
    throw new Refusal(`${siteDir} is not there. Build the apps and assemble the site first.`);
  }
  const problems = [];
  const add = (path, rule, message) => problems.push({ path, rule, message });
  const files = listFiles(siteDir);
  const fileSet = new Set(files);

  // Size.
  const bytes = files.reduce((sum, f) => sum + statSync(join(siteDir, f)).size, 0);
  if (files.length > MAX_FILES) add("dist/site", "size", `the site has ${files.length} files, the limit is ${MAX_FILES} files`);
  if (bytes > MAX_BYTES) add("dist/site", "size", `the site is ${bytes} bytes, the limit is 5 MiB`);

  // No server code.
  for (const rel of files) if (SERVER_CODE.some((p) => p.test(rel))) add(rel, "server-code", "the host would run this file. The site is static files only");

  // Direct entry pages are real pages.
  for (const rel of ENTRY_PAGES) if (!fileSet.has(rel)) add(rel, "missing-file", "this direct entry page is not in the site");
  for (const rel of LINKED_FILES) if (!fileSet.has(rel)) add(rel, "missing-file", "a page links to this file and it is not in the site");
  for (const rel of files.filter((f) => /\.html?$/i.test(f))) {
    const html = readFileSync(join(siteDir, rel), "utf8");
    if (!/<title>[^<]+<\/title>/i.test(html)) add(rel, "blank", "the page has no title");
    const loads = loadsOf(html);
    if (!loads.some((l) => /\.m?js(?:$|\?)/.test(l)) && visibleText(html) === "") add(rel, "blank", "the page has no script and no text");
    const dir = posix.dirname(`/${rel}`);
    for (const load of loads) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(load)) continue;
      const path = load.split(/[?#]/)[0];
      const target = path.startsWith("/") ? path : posix.normalize(posix.join(dir, path));
      if (!fileSet.has(target.slice(1))) add(rel, "missing-file", `${load} is not in the site`);
    }
    if (PAGES_WITH_TAG.includes(rel) && !html.includes(SW_TAG)) add(rel, "worker-tag", "the page does not load the worker's script");
  }

  // No remote asset, no billing endpoint.
  for (const rel of files.filter((f) => TEXT_FILE.test(f))) {
    const raw = readFileSync(join(siteDir, rel), "utf8");
    const text = /\.m?js$/i.test(rel) ? withoutComments(raw) : raw;
    let billing = false;
    let remote;
    for (const { host, text: address } of addressesOf(rel, text)) {
      if (BILLING_HOSTS.test(host)) billing = true;
      else if (!ALLOWED_HOSTS.has(host)) remote ??= address;
    }
    if (billing || BILLING_PATHS.test(text)) add(rel, "billing", "this file names a billing or checkout address");
    else if (remote !== undefined) add(rel, "remote", `this file names an address outside the site: ${remote}`);
  }

  // Headers: one policy per page.
  const headersFile = join(siteDir, "_headers");
  if (!existsSync(headersFile)) {
    add("_headers", "csp", "the headers file is missing, so no page has a content policy");
  } else {
    const rules = parseHeaders(readFileSync(headersFile, "utf8"));
    for (const rel of files.filter((f) => /\.html?$/i.test(f))) {
      const isIndex = rel.endsWith("index.html");
      const forms = isIndex ? [{ path: `/${rel.slice(0, -"index.html".length)}`, required: true }, { path: `/${rel}`, required: false }] : [{ path: `/${rel}`, required: true }];
      for (const { path, required } of forms) {
        const policies = valuesOf(path, rules, "Content-Security-Policy");
        if (policies.length > 1) add(rel, "csp", `two policies match ${path}, and a browser enforces both`);
        else if (policies.length === 0) {
          if (required) add(rel, "csp", `no policy matches ${path}`);
        } else if (sealedVisitorFile(rel)) {
          const held = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(readFileSync(join(siteDir, rel), "utf8"))?.[1];
          if (held === undefined || held.replace(/\s+/g, " ").trim() !== policies[0].replace(/\s+/g, " ").trim()) {
            add(rel, "csp", "visitor file: the header policy is not the policy that the file holds for itself, word for word");
          }
        } else {
          for (const problem of policyProblems(policies[0])) add(rel, "csp", `${path}: ${problem}`);
        }
      }
    }

    // The 404 page holds its own policy, because the live host matches each rule on the address that was asked and so
    // never gives this page the rule for `/404.html`. It is the site policy of `/` without `frame-ancestors`.
    if (fileSet.has("404.html")) {
      const site = valuesOf("/", rules, "Content-Security-Policy")[0];
      const tags = [...readFileSync(join(siteDir, "404.html"), "utf8").matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/g)].map((m) => normalPolicy(m[1]));
      if (site !== undefined) {
        const wanted = normalPolicy(site.split(";").filter((part) => !/^\s*frame-ancestors(\s|$)/.test(part)).join(";"));
        if (tags.length !== 1) add("404.html", "csp", `the 404 page holds ${tags.length} policy tags, and it needs one, because the host does not send it the rule for /404.html`);
        else if (tags[0] !== wanted) add("404.html", "csp", "the 404 page's policy tag is not the site policy of / without frame-ancestors");
      }
    }
  }

  // The worker.
  const stamp = readStamp(siteDir);
  if (!fileSet.has("sw.js")) add("sw.js", "version", "there is no worker");
  else if (stamp === undefined) add("sw.js", "version", "the worker has no shell stamp");
  else {
    const expected = shellOf(siteDir);
    if (stamp.manifest.version !== expected.version || JSON.stringify(stamp.manifest.files) !== JSON.stringify(expected.files)) {
      add("sw.js", "version", `the worker's shell ${stamp.manifest.version} does not match the files, which give ${expected.version}. Run npm run build:sw -- --site dist/site`);
    }
  }

  // The Desk copy equals its lock.
  let lock;
  try {
    lock = readLock(root);
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    add(LOCK_PATH, "desk-digest", error.message);
  }
  if (lock !== undefined) {
    const reviewFiles = files.filter((f) => f.startsWith("review/")).map((f) => f.slice("review/".length));
    for (const [rel, hash] of Object.entries(lock.files)) {
      if (!reviewFiles.includes(rel)) add(`review/${rel}`, "desk-digest", "this file is in the lock and not in the site");
      else if (sha256(readFileSync(join(siteDir, "review", rel))) !== hash) add(`review/${rel}`, "desk-digest", "this file differs from the lock");
    }
    for (const rel of reviewFiles) if (lock.files[rel] === undefined) add(`review/${rel}`, "desk-digest", "this file is in the site and not in the lock");
  }

  return problems;
}
