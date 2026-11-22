// Import direction check. Exit 0 on a clean tree. Exit 1 and name the importing
// file and the forbidden target on a violation. Exit 2 on a bad root.
//
//   node scripts/check-imports.mjs [--root <dir>]
//
// Rules (see .kiro/specs/01-foundation/design.md section G11):
//   template-no-outside  template/** imports nothing outside template/
//   pure-layer           template/src/*.ts and template/src/map/** import only each other and zod
//   data-layer           template/src/data/** imports no React, ui, output or exchange
//   public-layer         template/src/output/** and exchange/** import only calendar, limits, map and zod
//   app-layer            apps/<app>/src/** imports only template/ and its own folder
//   site-layer           site/** imports only its own folder
//   no-kind-word         template/src code names no app kind and compares kind with no string
//   no-desk              nothing imports the review desk
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveImport, scanSource, walkSourceFiles } from "./lib/imports.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  let root = resolve(here, "..");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--root" && argv[i + 1] !== undefined) {
      root = resolve(argv[i + 1]);
      i += 1;
    }
  }
  return { root };
}

/** Which part of the template a resolved path sits in. */
function zoneOf(target) {
  if (!target.startsWith("template/src/")) return target.startsWith("template/") ? "template-other" : "outside";
  const rest = target.slice("template/src/".length);
  if (!rest.includes("/")) return `core:${rest.replace(/\.[^./]+$/, "")}`;
  return rest.split("/")[0];
}

const KIND_WORDS = /\b(churchyard|allotment|market)\b/gi;
// `kind` compared with a string literal. An empty string and the names that
// `typeof` returns are not kind names.
const KIND_COMPARE_AFTER = /\bkind\s*[!=]==?\s*(["'`])([^"'`]*)\1/g;
const KIND_COMPARE_BEFORE = /(["'`])([^"'`]*)\1\s*[!=]==?\s*[\w.]*\bkind\b/g;
const TYPEOF_NAMES = new Set(["string", "number", "boolean", "object", "undefined", "function", "symbol", "bigint"]);
const INDEXEDDB = /\b(indexedDB|IDB[A-Za-z]*)\b/g;
const DESK = /review-desk/i;

function* kindComparisons(code) {
  for (const regex of [KIND_COMPARE_AFTER, KIND_COMPARE_BEFORE]) {
    for (const match of code.matchAll(regex)) {
      const literal = match[2];
      if (literal !== "" && !TYPEOF_NAMES.has(literal)) yield match[0];
    }
  }
}

function checkFile(rel, text) {
  const violations = [];
  const add = (target, rule) => violations.push({ file: rel, target, rule });
  const { code, imports } = scanSource(text);
  const resolved = imports.map((spec) => ({ spec, ...resolveImport(rel, spec) }));

  for (const item of resolved) {
    const name = item.kind === "relative" ? item.target : item.spec;
    if (DESK.test(name)) add(name, "no-desk");
  }

  const inTemplate = rel.startsWith("template/");
  const inTemplateSrc = rel.startsWith("template/src/");
  const sub = inTemplateSrc ? rel.slice("template/src/".length) : "";
  const folder = sub.includes("/") ? sub.split("/")[0] : "";

  if (inTemplate) {
    for (const item of resolved) {
      if (item.kind === "relative" && !item.target.startsWith("template/")) add(item.target, "template-no-outside");
    }
  }

  if (inTemplateSrc && (folder === "" || folder === "map")) {
    for (const item of resolved) {
      if (item.kind === "relative") {
        const zone = zoneOf(item.target);
        if (!zone.startsWith("core:") && zone !== "map") add(item.target, "pure-layer");
      } else if (item.pkg !== "zod") {
        add(item.spec, "pure-layer");
      }
    }
    for (const match of code.matchAll(INDEXEDDB)) add(match[0], "pure-layer");
  }

  if (inTemplateSrc && folder === "data") {
    for (const item of resolved) {
      if (item.kind === "relative") {
        const zone = zoneOf(item.target);
        if (zone === "ui" || zone === "output" || zone === "exchange") add(item.target, "data-layer");
      } else if (item.pkg === "react" || item.pkg === "react-dom") {
        add(item.spec, "data-layer");
      }
    }
  }

  if (inTemplateSrc && (folder === "output" || folder === "exchange")) {
    const allowedCore = new Set(["core:calendar", "core:limits"]);
    for (const item of resolved) {
      if (item.kind === "relative") {
        const zone = zoneOf(item.target);
        const fine = zone === "output" || zone === "exchange" || zone === "map" || allowedCore.has(zone);
        if (!fine) add(item.target, "public-layer");
      } else if (item.pkg !== "zod") {
        add(item.spec, "public-layer");
      }
    }
  }

  const app = /^apps\/([^/]+)\//.exec(rel);
  if (app) {
    for (const item of resolved) {
      if (item.kind !== "relative") continue;
      if (!item.target.startsWith(`apps/${app[1]}/`) && !item.target.startsWith("template/")) {
        add(item.target, "app-layer");
      }
    }
  }

  if (rel.startsWith("site/")) {
    for (const item of resolved) {
      if (item.kind === "relative" && !item.target.startsWith("site/")) add(item.target, "site-layer");
    }
  }

  if (inTemplateSrc && /\.tsx?$/.test(rel)) {
    for (const match of code.matchAll(KIND_WORDS)) add(match[0], "no-kind-word");
    for (const text of kindComparisons(code)) add(text, "no-kind-word");
  }

  return violations;
}

function main() {
  const { root } = parseArgs(process.argv.slice(2));
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`check-imports: folder not found: ${root}`);
    return 2;
  }
  const violations = [];
  for (const rel of walkSourceFiles(root)) {
    violations.push(...checkFile(rel, readFileSync(join(root, rel), "utf8")));
  }
  for (const v of violations) console.error(`${v.file} -> ${v.target}: ${v.rule}`);
  if (violations.length > 0) {
    console.log(`check-imports: ${violations.length} violation${violations.length === 1 ? "" : "s"}`);
    return 1;
  }
  console.log("check-imports: ok");
  return 0;
}

process.exitCode = main();
