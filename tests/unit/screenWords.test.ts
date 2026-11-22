// Every word on the shared screens comes from the copy catalog (spec 02, P17).
// A static scan of the screen files: each catalog key used exists, no screen holds its own words,
// and no hard coded label, title, alt or placeholder slips past the catalog.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COPY, fill } from "../../template/src/ui/copy";
import { ImportReview, emptyRowsWords } from "../../template/src/ui/ImportReview";
import type { Staged } from "../../template/src/ui/ImportReview";
import { ShellContext } from "../../template/src/ui/shellContext";
import type { ShellValue } from "../../template/src/ui/shellContext";

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

describe("the page panel of Fast entry promises only what happens (P21.1)", () => {
  it("offers no control to keep the page photo, because the photo is never stored", () => {
    const panel = source("ReferencePage.tsx");
    expect(panel).not.toMatch(/keepPage|setKeepPage|CheckField/);
    expect(COPY["keepPage"]).toBeUndefined();
    expect(Object.entries(COPY).filter(([, text]) => /keep page/i.test(text))).toEqual([]);
  });

  it("keeps the sentence that the page stays on this device", () => {
    expect(COPY["pageStaysHere"]).toBe("Page stays on this device.");
    expect(source("ReferencePage.tsx")).toContain('t("pageStaysHere")');
  });
});

const say = (key: string, values?: Readonly<Record<string, string | number>>): string => fill(COPY[key] ?? key, values ?? {});
const textOf = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

function reviewOf(unplaced: number, mode: "import" | "entry" = "import"): string {
  const rows = Array.from({ length: unplaced }, (_, i) => ({ rowNumber: i + 1, sourceRef: `R${i + 1}`, cells: {}, status: "unplaced", errors: [], commands: [] }));
  const staged = { sheet: "Burials", siteId: "site", baseRevision: 0, rows, counts: { ready: 3, unchanged: 0, unplaced, conflicts: 0, errors: 0, leftOut: 0 }, writes: 3 + unplaced, drafts: [] } as unknown as Staged;
  const shell = { t: say } as unknown as ShellValue;
  const sheet = { name: "Burials", required: [], optional: [] };
  return renderToStaticMarkup(
    createElement(ShellContext.Provider, { value: shell }, createElement(ImportReview, { staged, onChange: () => undefined, onCommit: () => undefined, onCancel: () => undefined, busy: false, sheet, fields: [], mode })),
  );
}

describe("the import review says where rows went when nothing needs a fix (P21.2)", () => {
  it("with 0 errors, 0 conflicts and 2 rows to confirm, says so with the real count", () => {
    const text = textOf(reviewOf(2));
    expect(text).toContain("Nothing to fix before the import. 2 records will need a plot after it.");
    expect(text).not.toContain("No rows to show.");
    expect(text).toContain("Location to confirm 2");
  });

  it("says 1 record for one row", () => {
    expect(textOf(reviewOf(1))).toContain("Nothing to fix before the import. 1 record will need a plot after it.");
  });

  it("keeps No rows to show with no row to confirm", () => {
    const text = textOf(reviewOf(0));
    expect(text).toContain("No rows to show.");
    expect(text).not.toContain("Nothing to fix before the import.");
  });

  it("says nothing of the kind for typed rows, which have no list", () => {
    expect(textOf(reviewOf(2, "entry"))).not.toContain("Nothing to fix before the import.");
  });

  it.each(["error", "conflict", "left_out", "ready", "unplaced", "unchanged"] as const)("keeps No rows to show for the empty filter %s", (filter) => {
    expect(emptyRowsWords(say, filter, 2)).toBe("No rows to show.");
  });

  it("gives the new words only for the list of rows to check", () => {
    expect(emptyRowsWords(say, "attention", 2)).toBe("Nothing to fix before the import. 2 records will need a plot after it.");
    expect(emptyRowsWords(say, "attention", 1)).toBe("Nothing to fix before the import. 1 record will need a plot after it.");
    expect(emptyRowsWords(say, "attention", 0)).toBe("No rows to show.");
  });
});
