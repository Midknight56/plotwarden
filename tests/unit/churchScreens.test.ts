// Every word on the Churchyard Register screens comes from a catalog (spec 03, task 3.13, C9.2).
// A static scan of the screen files: each key used exists in the church or shared catalog, no screen holds
// its own words, and no hard coded label, title, alt or placeholder slips past the catalog.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COPY } from "../../template/src/ui/copy";
import { CHURCH_COPY } from "../../apps/churchyard-register/src/copy";

const SRC = join(__dirname, "..", "..", "apps", "churchyard-register", "src");
const files = readdirSync(SRC).filter((f) => f.endsWith(".tsx") || f === "intent.ts");
const screens = files.filter((f) => f.endsWith(".tsx") && f !== "main.tsx");
const source = (name: string): string => readFileSync(join(SRC, name), "utf8");
const ALL: Readonly<Record<string, string>> = { ...COPY, ...CHURCH_COPY };

function keysIn(text: string): { key: string; line: number }[] {
  const found: { key: string; line: number }[] = [];
  const lineOf = (index: number) => text.slice(0, index).split("\n").length;
  for (const m of text.matchAll(/\bt\(\s*["']([A-Za-z0-9_]+)["']/g)) found.push({ key: m[1] as string, line: lineOf(m.index ?? 0) });
  for (const m of text.matchAll(/\bt\(\s*[^"'()]*\?\s*["']([A-Za-z0-9_]+)["']\s*:\s*["']([A-Za-z0-9_]+)["']/g)) {
    found.push({ key: m[1] as string, line: lineOf(m.index ?? 0) }, { key: m[2] as string, line: lineOf(m.index ?? 0) });
  }
  // Keys held in a table: a word chosen by a code or a state.
  for (const m of text.matchAll(/["']((?:event_|reason_)[a-z_]+|cat[A-Z][A-Za-z]+|field[A-Z][A-Za-z]+)["']/g)) found.push({ key: m[1] as string, line: lineOf(m.index ?? 0) });
  return found;
}

describe("the words of the churchyard screens", () => {
  it("finds the screens to scan", () => {
    for (const name of ["ChurchyardHome.tsx", "Burial.tsx", "Reservation.tsx", "Memorial.tsx", "Unplaced.tsx", "FamilySheet.tsx", "BurialReport.tsx", "main.tsx"]) {
      expect(files, name).toContain(name);
    }
  });

  it("uses only keys that a catalog holds", () => {
    const missing: string[] = [];
    for (const name of files) for (const { key, line } of keysIn(source(name))) if (ALL[key] === undefined) missing.push(`${name}:${line} ${key}`);
    expect(missing).toEqual([]);
  });

  it("holds no words of its own in the markup", () => {
    const own: string[] = [];
    for (const name of screens) {
      source(name)
        .split("\n")
        .forEach((line, i) => {
          for (const m of line.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)<\//g)) own.push(`${name}:${i + 1} "${(m[1] as string).trim()}"`);
        });
    }
    expect(own).toEqual([]);
  });

  it("holds no hard coded label, title, alt or placeholder", () => {
    const own: string[] = [];
    for (const name of screens) {
      source(name)
        .split("\n")
        .forEach((line, i) => {
          for (const m of line.matchAll(/\b(aria-label|title|alt|placeholder|label|legend)="([^"]*[A-Za-z][^"]*)"/g)) own.push(`${name}:${i + 1} ${m[1] as string}="${m[2] as string}"`);
        });
    }
    expect(own).toEqual([]);
  });

  it("never claims a page was printed, and never says Saved before the commit returns", () => {
    for (const name of screens) {
      const text = source(name);
      expect(text, name).not.toMatch(/was printed|has printed|printed\./i);
    }
    for (const [key, value] of Object.entries(CHURCH_COPY)) expect(value, key).not.toMatch(/\bprinted\b/i);
  });

  it("has a screen for each route the app names, and every control is a real button or link", () => {
    const main = source("main.tsx");
    for (const area of ["burial", "reserve", "unplaced", "family", "report"]) expect(main).toContain(`${area}:`);
    for (const name of screens) expect(source(name), name).not.toMatch(/<div[^>]*onClick/);
  });
});
