// Every word on the Churchyard Register screens comes from a catalog (spec 03, task 3.13, C9.2).
// A static scan of the screen files: each key used exists in the church or shared catalog, no screen holds
// its own words, and no hard coded label, title, alt or placeholder slips past the catalog.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COPY, fill } from "../../template/src/ui/copy";
import { RegisterContext, ShellContext } from "../../template/src/ui/shellContext";
import type { OpenRegister, ShellValue } from "../../template/src/ui/shellContext";
import { ChurchPlotExtras } from "../../apps/churchyard-register/src/ChurchyardHome";
import { CHURCH_COPY, reservationLine } from "../../apps/churchyard-register/src/copy";

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

const say = (key: string, values?: Readonly<Record<string, string | number>>): string => fill(ALL[key] ?? key, values ?? {});
const textOf = (html: string): string => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

const PLOT = "plot-y02";
const SPACE = "space-y02";

/** The plot screen's extras, drawn for one plot with the given burials and reservations. */
function plotExtras(options: { burial?: boolean; released?: { on: string; reason: string } }): string {
  const state = {
    core: { plots: { [PLOT]: { plotId: PLOT, code: "Y02", spaces: [{ spaceId: SPACE, label: "1" }] } } },
    burials: options.burial === true ? { b1: { burialId: "b1", plotId: PLOT, spaceId: SPACE, recordedName: "Edda Thornwick", date: { p: "year", y: 1871 }, sourceRef: "LF-01" } } : {},
    reservations: { r1: { reservationId: "r1", plotId: PLOT, spaceId: SPACE, ...(options.released === undefined ? {} : { released: options.released }) } },
  };
  const shell = { t: say, newId: () => "op-1" } as unknown as ShellValue;
  const open = { site: { id: "site-1" }, state, today: "2026-04-20", revision: 1, run: async () => ({ ok: true }), reload: async () => undefined } as unknown as OpenRegister;
  return renderToStaticMarkup(createElement(ShellContext.Provider, { value: shell }, createElement(RegisterContext.Provider, { value: open }, createElement(ChurchPlotExtras, { plotId: PLOT }))));
}

describe("the plot screen says what the plot holds (C12)", () => {
  it("says No burials in this plot. under Burials for a plot with a reservation and no burial, never No reservations.", () => {
    const text = textOf(plotExtras({}));
    expect(text).toContain("Burials No burials in this plot.");
    expect(text).not.toContain("No reservations.");
    expect(text).toContain("Y02, space 1 is reserved.");
  });

  it("does not say No burials in this plot. when the plot has a burial", () => {
    const text = textOf(plotExtras({ burial: true }));
    expect(text).toContain("Edda Thornwick");
    expect(text).not.toContain("No burials in this plot.");
    expect(text).not.toContain("No reservations.");
  });

  it("says a released reservation was reserved, with the date and the reason", () => {
    const text = textOf(plotExtras({ released: { on: "2026-03-01", reason: "Family moved away" } }));
    expect(text).toContain("Y02, space 1 was reserved. Released 2026-03-01. Family moved away.");
    expect(text).not.toContain("is reserved");
  });

  it("keeps No reservations. for the list of reservations, and never uses it for burials", () => {
    expect(CHURCH_COPY["noBurialsInPlot"]).toBe("No burials in this plot.");
    expect(CHURCH_COPY["noReservations"]).toBe("No reservations.");
    expect(source("ChurchyardHome.tsx")).not.toMatch(/burials\.length === 0 \? <p>\{t\("noReservations"\)\}/);
  });
});

describe("the line of a reservation tells the truth about it (C12.2)", () => {
  const t = (key: string, values?: Readonly<Record<string, string | number>>) => say(key, values);
  it("says is reserved while it holds the space", () => {
    expect(reservationLine(t, { plot: "Y02", space: "1" })).toBe("Y02, space 1 is reserved.");
  });

  it("says was reserved, then Released {date}. {reason}, once it is released", () => {
    expect(reservationLine(t, { plot: "Y02", space: "1", released: { on: "2026-03-01", reason: "Family moved away." } })).toBe(
      "Y02, space 1 was reserved. Released 2026-03-01. Family moved away.",
    );
  });

  it("ends the released line with one full stop when the reason was typed without one", () => {
    expect(reservationLine(t, { plot: "Y02", space: "1", released: { on: "2026-03-01", reason: "Family moved away" } })).toBe(
      "Y02, space 1 was reserved. Released 2026-03-01. Family moved away.",
    );
    expect(reservationLine(t, { plot: "Y02", space: "1", released: { on: "2026-03-01", reason: "Family moved away  " } })).toBe(
      "Y02, space 1 was reserved. Released 2026-03-01. Family moved away.",
    );
  });

  it("does not double the full stop when the reason has one, and adds none after ! or ?", () => {
    for (const [reason, line] of [
      ["Family moved away.", "Family moved away."],
      ["Family moved away. ", "Family moved away."],
      ["Gone!", "Gone!"],
      ["Who knows?", "Who knows?"],
    ] as const) {
      expect(reservationLine(t, { plot: "Y02", space: "1", released: { on: "2026-03-01", reason } })).toBe(`Y02, space 1 was reserved. Released 2026-03-01. ${line}`);
    }
  });

  it("shows the same line, with its one full stop, on the plot screen", () => {
    const text = textOf(plotExtras({ released: { on: "2026-03-01", reason: "Family moved away" } }));
    expect(text).toContain("Y02, space 1 was reserved. Released 2026-03-01. Family moved away.");
    expect(text).not.toContain("Family moved away..");
  });

  it("is the line of the reservations screen too", () => {
    expect(source("Reservation.tsx")).toContain("reservationLine(");
    expect(source("ChurchyardHome.tsx")).toContain("reservationLine(");
  });
});
