// Every word on the shared screens comes from the copy catalog (spec 02, P17).
// A static scan of the screen files: each catalog key used exists, no screen holds its own words,
// and no hard coded label, title, alt or placeholder slips past the catalog.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COPY } from "../../template/src/ui/copy";

const UI = join(__dirname, "..", "..", "template", "src", "ui");
const files = readdirSync(UI)
  .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
  .filter((f) => f !== "copy.ts" && f !== "copyScreens.ts");
const source = (name: string): string => readFileSync(join(UI, name), "utf8");
const screens = files.filter((f) => f.endsWith(".tsx"));

/** The keys passed to t(), including both branches of a choice such as t(ok ? "a" : "b"). */
function keysIn(text: string): { key: string; line: number }[] {
  const found: { key: string; line: number }[] = [];
  const lineOf = (index: number) => text.slice(0, index).split("\n").length;
  for (const m of text.matchAll(/\bt\(\s*["']([A-Za-z0-9_]+)["']/g)) found.push({ key: m[1] as string, line: lineOf(m.index ?? 0) });
  for (const m of text.matchAll(/\bt\(\s*[^"'()]*\?\s*["']([A-Za-z0-9_]+)["']\s*:\s*["']([A-Za-z0-9_]+)["']/g)) {
    found.push({ key: m[1] as string, line: lineOf(m.index ?? 0) }, { key: m[2] as string, line: lineOf(m.index ?? 0) });
  }
  // Tables of keys: a word chosen by a code, such as an event name or a row status.
  for (const m of text.matchAll(/["']((?:event|rowStatus|legend|limit)[A-Z][A-Za-z0-9]*|reason_[a-z_]+)["']/g)) found.push({ key: m[1] as string, line: lineOf(m.index ?? 0) });
  return found;
}

describe("the words of the shared screens", () => {
  it("finds the screens to scan", () => {
    expect(screens.length).toBeGreaterThanOrEqual(15);
  });

  it("uses only keys that the catalog holds", () => {
    const missing: string[] = [];
    for (const name of files) for (const { key, line } of keysIn(source(name))) if (COPY[key] === undefined) missing.push(`${name}:${line} ${key}`);
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

  it("uses no dash between words in any catalog text", () => {
    const bad = Object.entries(COPY).filter(([, text]) => /\w\s[-–—]\s\w|\w[–—]\w/.test(text)).map(([key]) => key);
    expect(bad).toEqual([]);
  });

  it("never says that anything was printed or saved before it was", () => {
    const bad = Object.entries(COPY).filter(([, text]) => /\b(was printed|has printed|printed (the|your))\b/i.test(text)).map(([key]) => key);
    expect(bad).toEqual([]);
    // "Saved on this device." is the one saved sentence, and only a finished commit shows it.
    expect(COPY["saved"]).toBe("Saved on this device.");
  });
});
