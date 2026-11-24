// Print rules of the new look (spec 07, task 7.25, L10). The expected values are the ones the design names: black on
// white, the walk `#DADADA`, the chosen plot and its tab `#E6E6E6`, every other plot white, no ground, turf, pattern or
// edge, a double rule under the title, and a printed sheet of A4 (794 by 1123 at 96 per inch) with 52 above and below
// and 60 at the sides. They are typed here and not read back from the code.
//
// The print rules must also win over every theme rule that paints the drawing, whichever file loads last. A rule wins
// by its specificity, so the test works that out for each pair. A browser check of the picture is in
// tests/browser/share-print.spec.ts.
import { describe, expect, it } from "vitest";
import { buildReportPrint } from "../../template/src/output/print";
import { buildVisitorFiles } from "../../tools/site/visitorFiles";
import { declOf, readText, rulesOf } from "../helpers/cssRules";
import type { Rule } from "../helpers/cssRules";

const PRINT_CSS = "template/src/ui/print.css";
const SOURCES = ["template/src/ui/register.css", "apps/churchyard-register/src/theme.css", "apps/allotment-register/src/theme.css", "examples/market/src/theme.css"] as const;
const PRINT = "@media print";

const printRules = (): Rule[] => rulesOf(readText(PRINT_CSS)).filter((r) => r.at === PRINT);
const lastOf = (rules: Rule[], selector: string, property: string): string | undefined => {
  let found: string | undefined;
  for (const r of rules) if (r.selector === selector) found = declOf(r.body, property) ?? found;
  return found;
};

// ---- Specificity ------------------------------------------------------------------------------------------------

type Spec = readonly [number, number, number];

/** The specificity of a selector: ids, then classes, attributes and pseudo classes, then types and pseudo elements. */
function specificity(selector: string): Spec {
  let ids = 0;
  let classes = 0;
  let types = 0;
  let rest = selector.replace(/"[^"]*"|'[^']*'/g, '""');
  // The argument of :not, :is and :has counts as the selector it holds. Take each one out, and add what it holds.
  for (;;) {
    const m = /:(not|is|has)\(([^()]*)\)/.exec(rest);
    if (m === null) break;
    const inner = specificity(m[2] as string);
    ids += inner[0];
    classes += inner[1];
    types += inner[2];
    rest = rest.replace(m[0], "");
  }
  ids += (rest.match(/#[\w-]+/g) ?? []).length;
  classes += (rest.match(/\.[\w-]+/g) ?? []).length + (rest.match(/\[[^\]]*\]/g) ?? []).length + (rest.match(/(?<!:):(?!:)[\w-]+/g) ?? []).length;
  types += (rest.match(/::[\w-]+/g) ?? []).length;
  const withoutParts = rest.replace(/\[[^\]]*\]|#[\w-]+|\.[\w-]+|::?[\w-]+(\([^)]*\))?/g, " ");
  types += (withoutParts.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return [ids, classes, types];
}

const beats = (a: Spec, b: Spec): boolean => a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])));

/** The classes of the last compound of a selector, the element that the rule styles. */
function subjectClasses(selector: string): Set<string> {
  const compound = selector.split(/\s*[\s>+~]\s*(?![^[]*\])(?![^(]*\))/).pop() ?? "";
  return new Set([...compound.replace(/:(not|is|has)\([^()]*\)/g, "").matchAll(/\.([\w-]+)/g)].map((m) => m[1] as string));
}

describe("specificity (the reader that this test uses)", () => {
  it("counts ids, classes with attributes and pseudo classes, and types", () => {
    expect(specificity("html svg.sheet .plot")).toEqual([0, 2, 2]);
    expect(specificity("html svg.sheet .plot.bed.taken")).toEqual([0, 4, 2]);
    expect(specificity('html[data-contrast="high"] .sheet .plot.bed')).toEqual([0, 4, 1]);
    expect(specificity('html:not([data-contrast="high"]) .on-ground .button')).toEqual([0, 3, 1]);
    expect(specificity("ul.list li::before")).toEqual([0, 1, 3]);
    expect(specificity("#a .b")).toEqual([1, 1, 0]);
  });
  it("finds the element a rule styles", () => {
    expect([...subjectClasses("html svg.sheet .plot.bed.taken")].sort()).toEqual(["bed", "plot", "taken"]);
    expect([...subjectClasses('html[data-contrast="high"] .sheet .plot.bed')].sort()).toEqual(["bed", "plot"]);
    expect([...subjectClasses(".sheet .base")]).toEqual(["base"]);
  });
});

// ---- The rules --------------------------------------------------------------------------------------------------

describe("the print rules of a register sheet (print.css)", () => {
  it("prints black on white", () => {
    const rules = printRules();
    expect(lastOf(rules, "html", "background")).toBe("#ffffff");
    expect(lastOf(rules, "html", "color")).toBe("#000000");
    expect(lastOf(rules, "body", "background")).toBe("#ffffff");
    expect(lastOf(rules, "body", "color")).toBe("#000000");
  });

  it("draws the walk #DADADA and takes the edge, lawn and turf off", () => {
    const rules = printRules();
    expect(lastOf(rules, "html svg.sheet .path", "stroke")).toBe("#dadada");
    expect(lastOf(rules, "html svg.sheet .path-edge", "stroke")).toBe("none");
    expect(lastOf(rules, "html svg.sheet .section-outline", "fill")).toBe("none");
    expect(lastOf(rules, "html svg.sheet .turf", "fill")).toBe("none");
  });

  it("draws every plot, bed and base white, and the chosen plot and its tab #E6E6E6", () => {
    const rules = printRules();
    for (const selector of ["html svg.sheet .plot", "html svg.sheet .plot.taken", "html svg.sheet .plot.bed", "html svg.sheet .plot.bed.taken", "html svg.sheet .base", "html svg.sheet .base.taken"]) {
      expect(lastOf(rules, selector, "fill"), selector).toBe("#ffffff");
    }
    for (const selector of ["html svg.sheet .plot.selected", "html svg.sheet .plot.bed.selected", "html svg.sheet .tab"]) {
      expect(lastOf(rules, selector, "fill"), selector).toBe("#e6e6e6");
    }
  });

  it("puts the chosen plot rules after the others, so the others cannot paint over them", () => {
    const rules = printRules();
    const at = (selector: string): number => rules.find((r) => r.selector === selector)?.order ?? -1;
    for (const chosen of ["html svg.sheet .plot.selected", "html svg.sheet .plot.bed.selected"]) {
      for (const plain of ["html svg.sheet .plot", "html svg.sheet .plot.taken", "html svg.sheet .plot.bed", "html svg.sheet .plot.bed.taken"]) {
        expect(at(chosen), `${chosen} after ${plain}`).toBeGreaterThan(at(plain));
      }
    }
  });

  it("draws the swatches of the key white, as the plots of the drawing, so the key is told by its shapes and not by the soil of a bed", () => {
    const rules = printRules();
    for (const selector of ["html svg.swatch .plot", "html svg.swatch .plot.taken", "html svg.swatch .plot.bed"]) {
      expect(lastOf(rules, selector, "fill"), selector).toBe("#ffffff");
    }
  });

  it("lets the chosen plot rules win over every other print rule for the same element, a taken one and one in high contrast too", () => {
    const rules = printRules();
    const chosen = rules.filter((r) => /\.selected$/.test(r.selector) && /svg\.sheet/.test(r.selector) && declOf(r.body, "fill") !== undefined);
    expect(chosen.length).toBeGreaterThanOrEqual(2);
    const losses: string[] = [];
    for (const c of chosen) {
      const mine = subjectClasses(c.selector);
      for (const p of rules) {
        if (p === c || declOf(p.body, "fill") === undefined || !/svg\.sheet/.test(p.selector) || /\.tab$/.test(p.selector)) continue;
        // A chosen plot may also be a taken one, so a rule for a taken plot meets it as well.
        if (![...subjectClasses(p.selector)].every((k) => mine.has(k) || k === "taken")) continue;
        const [a, b] = [specificity(c.selector), specificity(p.selector)];
        if (beats(b, a) || (!beats(a, b) && p.order > c.order)) losses.push(`${p.selector} [${b}] beats ${c.selector} [${a}]`);
      }
    }
    expect(losses).toEqual([]);
  });

  it("takes the page ground off the drawing and its frame, so the soil of a garden map does not print", () => {
    const rules = printRules();
    expect(lastOf(rules, "html svg.sheet", "background")).toBe("#ffffff");
    expect(lastOf(rules, "html .sheet-scroll", "background")).toBe("#ffffff");
  });

  it("draws a double rule under the title", () => {
    const rules = printRules();
    expect(lastOf(rules, "html main h1", "border-bottom")).toBe("3px double #000000");
  });

  it("names every rule of the map with the html and svg.sheet prefix (html svg.swatch for the key), so no theme rule outranks it", () => {
    const own = printRules().filter((r) => /^html svg\.sheet/.test(r.selector) || /^html\[data-contrast="high"\] svg\.sheet/.test(r.selector));
    expect(own.length).toBeGreaterThan(10);
    for (const r of printRules()) {
      if (/\.(plot|base|turf|path|path-edge|section-outline|tab)\b/.test(r.selector) && !/^html(\[data-contrast="high"\])? svg\.(sheet|swatch)/.test(r.selector)) {
        throw new Error(`${r.selector} paints the drawing and has no html svg.sheet or html svg.swatch prefix`);
      }
    }
  });
});

describe("the print rules outrank every rule that paints the drawing, in every theme and in high contrast", () => {
  const paints = (r: Rule): boolean => /\.(sheet|swatch)(?![\w-])/.test(r.selector) && r.at !== PRINT && !/print/.test(r.at) && (declOf(r.body, "fill") !== undefined || declOf(r.body, "stroke") !== undefined || declOf(r.body, "background") !== undefined);
  const theirs = SOURCES.flatMap((file) => rulesOf(readText(file)).filter(paints).map((rule) => ({ file, rule })));

  it("has rules to compare with", () => {
    expect(theirs.length).toBeGreaterThan(20);
  });

  it("wins against each rule that sets the same property on the same element", () => {
    const losses: string[] = [];
    const high = (selector: string): boolean => /\[data-contrast="high"\]/.test(selector);
    for (const mine of printRules()) {
      const mineClasses = subjectClasses(mine.selector);
      for (const property of ["fill", "stroke", "background"]) {
        if (declOf(mine.body, property) === undefined || !/svg\.(sheet|swatch)/.test(mine.selector)) continue;
        for (const { file, rule } of theirs) {
          if (declOf(rule.body, property) === undefined) continue;
          // A rule for high contrast is met by a print rule for high contrast. It is checked in the next test.
          if (high(rule.selector) && !high(mine.selector)) continue;
          const theirClasses = subjectClasses(rule.selector);
          // The rule of the theme styles this element whenever it styles an element with all the classes it names.
          if (![...theirClasses].every((c) => mineClasses.has(c))) continue;
          if (!beats(specificity(mine.selector), specificity(rule.selector))) {
            losses.push(`${property}: ${mine.selector} [${specificity(mine.selector)}] does not outrank ${rule.selector} [${specificity(rule.selector)}] in ${file}`);
          }
        }
      }
    }
    expect(losses).toEqual([]);
  });

  it("has a print rule for high contrast that outranks each theme rule that is only for high contrast", () => {
    const missing: string[] = [];
    const high = (selector: string): boolean => /\[data-contrast="high"\]/.test(selector);
    for (const { file, rule } of theirs.filter((t) => high(t.rule.selector))) {
      for (const property of ["fill", "stroke", "background"]) {
        if (declOf(rule.body, property) === undefined || !/\.plot|\.base|\.turf|\.path|\.section-outline|\.tab/.test(rule.selector)) continue;
        const theirClasses = subjectClasses(rule.selector);
        // Only where the print rules set this property for this element at all. A stroke of ink stays ink.
        const meant = printRules().some((m) => declOf(m.body, property) !== undefined && [...theirClasses].every((c) => subjectClasses(m.selector).has(c)));
        if (!meant) continue;
        const answers = printRules().filter(
          (m) => high(m.selector) && declOf(m.body, property) !== undefined && [...theirClasses].every((c) => subjectClasses(m.selector).has(c)) && beats(specificity(m.selector), specificity(rule.selector)),
        );
        if (answers.length === 0) missing.push(`${property}: no print rule outranks ${rule.selector} in ${file}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

// ---- The other print documents ----------------------------------------------------------------------------------

describe("the print documents the registers hand to the print frame", () => {
  const doc = buildReportPrint({ title: "Report", subtitle: "Sub", scope: [], totals: [], sections: [], footer: "End" }, { paper: "A4", orientation: "portrait" });
  const css = /<style>([\s\S]*?)<\/style>/.exec(doc)?.[1] ?? "";
  const declIn = (selector: string, property: string): string | undefined => {
    let found: string | undefined;
    for (const r of rulesOf(css)) if (r.selector === selector) found = declOf(r.body, property) ?? found;
    return found;
  };

  it("draws the walk #DADADA and the chosen plot and its tab #E6E6E6, in the same grays as the sheet", () => {
    expect(declIn(".walk", "stroke")).toBe("#dadada");
    expect(declIn(".walk-sample", "stroke")).toBe("#dadada");
    expect(declIn(".tab", "fill")).toBe("#e6e6e6");
  });

  it("draws a double rule under the title", () => {
    expect(declIn("header", "border-bottom")).toBe("3px double #000");
  });

  it("holds only black, white and grays", () => {
    for (const hex of css.match(/#[0-9a-f]{3,6}\b/gi) ?? []) {
      const full = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
      expect(full.slice(1, 3) === full.slice(3, 5) && full.slice(3, 5) === full.slice(5, 7), hex).toBe(true);
    }
  });
});

describe("the printed sheet of a visitor file", () => {
  const files = buildVisitorFiles();
  const A4 = { width: Math.round((210 / 25.4) * 96), height: Math.round((297 / 25.4) * 96) };

  it("is A4 at 96 per inch: 794 by 1123", () => {
    expect(A4).toEqual({ width: 794, height: 1123 });
  });

  it.each([["family", files.family.html], ["seeker", files.seeker.html]] as const)("the %s file keeps 52 px above and below and 60 px at the sides on every page", (_kind, html) => {
    expect(html).toContain("@page{margin:52px 60px}");
    expect(html).not.toMatch(/@page\{[^}]*size:/);
  });

  it.each([["family", files.family.html], ["seeker", files.seeker.html]] as const)("the %s file draws a double rule under its title and the walk and chosen plot in grays", (_kind, html) => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    const rules = rulesOf(style).filter((r) => r.at === PRINT);
    expect(rules.some((r) => declOf(r.body, "border-bottom") === "3px double #000")).toBe(true);
    expect(rules.find((r) => r.selector === ".walk" && declOf(r.body, "stroke") === "#DADADA")).toBeDefined();
    expect(rules.find((r) => r.selector === ".tab" && declOf(r.body, "fill") === "#E6E6E6")).toBeDefined();
  });
});
