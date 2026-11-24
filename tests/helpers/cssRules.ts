// A small reader for the stylesheets of the repository. Test helper. The template never imports it.
// It reads rules (with the at rule that holds them), custom properties in the order the browser applies the files,
// and the contrast of two hex colours by the WCAG 2.1 formula. It does not run a browser.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
export const readText = (path: string): string => readFileSync(join(ROOT, path), "utf8");

export interface Rule {
  /** The at rules that hold the rule, such as `@media print`. Empty at the top level. */
  at: string;
  /** One selector of the rule, with white space made single. A list becomes one rule for each selector. */
  selector: string;
  body: string;
  /** The position of the rule in its file, so two rules can be compared for order. */
  order: number;
}

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every rule of a stylesheet, with the rules of `@media`, `@supports` and `@container` flattened. `@keyframes` and `@font-face` are left out. */
export function rulesOf(css: string): Rule[] {
  const text = stripComments(css);
  const out: Rule[] = [];
  let order = 0;
  const walk = (from: number, to: number, at: string): void => {
    let i = from;
    while (i < to) {
      const open = text.indexOf("{", i);
      const semi = text.indexOf(";", i);
      if (open === -1 || open >= to) return;
      if (semi !== -1 && semi < open && text.slice(i, semi).trim().startsWith("@")) {
        i = semi + 1;
        continue;
      }
      let depth = 1;
      let j = open + 1;
      while (j < to && depth > 0) {
        if (text[j] === "{") depth += 1;
        else if (text[j] === "}") depth -= 1;
        j += 1;
      }
      const head = text.slice(i, open).trim().replace(/\s+/g, " ");
      const inner = text.slice(open + 1, j - 1);
      if (head.startsWith("@media") || head.startsWith("@supports") || head.startsWith("@container")) walk(open + 1, j - 1, at === "" ? head : `${at} ${head}`);
      else if (!head.startsWith("@")) {
        for (const selector of head.split(/,(?![^(]*\))/).map((s) => s.trim().replace(/\s+/g, " "))) out.push({ at, selector, body: inner, order: order++ });
      }
      i = j;
    }
  };
  walk(0, text.length, "");
  return out;
}

/** The value of a property in a rule body, or undefined. The last declaration wins. */
export function declOf(body: string, property: string): string | undefined {
  let found: string | undefined;
  for (const part of body.split(/;(?![^(]*\))/)) {
    const at = part.indexOf(":");
    if (at === -1) continue;
    if (part.slice(0, at).trim() === property) found = part.slice(at + 1).trim();
  }
  return found;
}

/** The rules of a file with exactly this selector, outside any at rule unless `at` is given. */
export function rulesFor(file: string, selector: string, at = ""): Rule[] {
  return rulesOf(readText(file)).filter((r) => r.selector === selector && r.at === at);
}

/** The value that a property has after all the rules with this selector in the files, later files and later rules winning. */
export function lastDecl(files: readonly string[], selector: string, property: string, at = ""): string | undefined {
  let found: string | undefined;
  for (const file of files) for (const rule of rulesFor(file, selector, at)) found = declOf(rule.body, property) ?? found;
  return found;
}

// ---- Custom properties and contrast ----------------------------------------------------------------------------

type Layer = "root" | "high";
const SELECTORS: Record<Layer, string> = { root: ":root", high: 'html[data-contrast="high"]' };

function layerOf(files: readonly string[], layer: Layer): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of files) {
    for (const rule of rulesFor(file, SELECTORS[layer])) {
      for (const part of rule.body.split(/;(?![^(]*\))/)) {
        const at = part.indexOf(":");
        if (at === -1) continue;
        const name = part.slice(0, at).trim();
        if (name.startsWith("--")) out.set(name, part.slice(at + 1).trim());
      }
    }
  }
  return out;
}

/** The value of a custom property after every `var()` is replaced. `high` puts the high contrast layer on top. */
export function tokenOf(files: readonly string[], high: boolean, name: string): string {
  const root = layerOf(files, "root");
  const top = layerOf(files, "high");
  const lookup = (n: string, seen: readonly string[]): string => {
    if (seen.includes(n)) throw new Error(`${n} refers to itself`);
    const raw = (high ? top.get(n) : undefined) ?? root.get(n);
    if (raw === undefined) throw new Error(`${n} is not declared in ${files.join(", ")}${high ? " (high contrast)" : ""}`);
    return raw.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (_m, inner: string) => lookup(inner, [...seen, n]));
  };
  return lookup(name, []);
}

function luminance(hex: string): number {
  const full = /^#([0-9a-f]{3})$/i.test(hex) ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
  const channel = (i: number): number => {
    const v = parseInt(full.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A colour as a pair names it: a custom property of the files, or a literal hex. */
export function colourOf(files: readonly string[], high: boolean, ref: string): string {
  const value = ref.startsWith("--") ? tokenOf(files, high, ref) : ref;
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) throw new Error(`${ref}${high ? " (high)" : ""} is "${value}", not a hex`);
  return value;
}
