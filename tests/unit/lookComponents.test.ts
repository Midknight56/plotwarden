// The shared components of the new look (spec 07, tasks 7.9 to 7.11, L5): button tiers, index rows, fields, errors,
// check rows, cards and notices. The test reads the stylesheets and checks the rules and the contrast of each state.
// The floors are the contract (4.5 to 1 for text, 3 to 1 for edges, marks and rings), not the output of the code.
// The sizes in a real browser are measured by tests/browser/layout.spec.ts.
import { describe, expect, it } from "vitest";
import { colourOf, contrast, declOf, lastDecl, readText, rulesFor, rulesOf } from "../helpers/cssRules";

const REGISTER = "template/src/ui/register.css";
const CHURCH = "apps/churchyard-register/src/theme.css";
const GARDEN = "apps/allotment-register/src/theme.css";
const SITE = "site/src/site.css";

const SCOPES = {
  plain: [REGISTER],
  church: [REGISTER, CHURCH],
  garden: [REGISTER, GARDEN],
} as const;
type Scope = keyof typeof SCOPES;

const shared = (selector: string, property: string, at = ""): string | undefined => lastDecl([REGISTER], selector, property, at);

// ---- Button tiers ------------------------------------------------------------------------------------------

describe("button tiers (L5.5)", () => {
  it("has an outlined button on the field fill, with soft on hover and the pressed fill when pressed", () => {
    expect(shared(".button", "background")).toBe("var(--field)");
    expect(shared(".button:hover:not(:disabled)", "background")).toBe("var(--soft)");
    expect(shared(".button:active:not(:disabled)", "background")).toBe("var(--outline-pressed)");
  });

  it("has a main action that takes its own hover and pressed fills, and nothing changes on a disabled button", () => {
    expect(shared(".button.primary", "background")).toBe("var(--action)");
    expect(shared(".button.primary:hover:not(:disabled)", "background")).toBe("var(--action-hover)");
    expect(shared(".button.primary:active:not(:disabled)", "background")).toBe("var(--action-pressed)");
    expect(shared(".button.primary", "font-weight")).toBe("700");
    expect(rulesFor(REGISTER, ".button:hover").length, "a bare :hover would also change a disabled button").toBe(0);
  });

  it("has a quiet button that is an underline of 1.5 px, 5 px off the text, 44 high", () => {
    expect(shared(".button.quiet", "text-decoration")).toBe("underline");
    expect(shared(".button.quiet", "text-decoration-thickness")).toBe("1.5px");
    expect(shared(".button.quiet", "text-underline-offset")).toBe("5px");
    expect(shared(".button.quiet", "min-height")).toBe("44px");
    expect(shared(".button.quiet", "background")).toBe("transparent");
    expect(shared(".button.quiet", "border-color")).toBe("transparent");
    expect(shared(".button.quiet", "padding")).toBe("8px");
  });

  it("is 46 high in the two themes, and 44 with no theme", () => {
    expect(shared(".button", "min-height")).toBe("var(--control-h)");
    expect(lastDecl([REGISTER], ":root", "--control-h")).toBe("44px");
    expect(lastDecl([REGISTER, CHURCH], ":root", "--control-h")).toBe("46px");
    expect(lastDecl([REGISTER, GARDEN], ":root", "--control-h")).toBe("46px");
  });

  it("changes only the background and the border colour, in the shared time, and never on the start page", () => {
    const all: string[] = [];
    for (const file of [REGISTER, CHURCH, GARDEN, "examples/market/src/theme.css"]) {
      for (const rule of rulesOf(readText(file))) {
        const value = declOf(rule.body, "transition");
        if (value !== undefined) all.push(`${file} ${rule.selector}: ${value}`);
      }
    }
    expect(all.length).toBeGreaterThan(0);
    for (const line of all) {
      const value = line.slice(line.indexOf(": ") + 2);
      if (value.startsWith("none")) continue;
      expect(value, line).toBe("background-color var(--motion), border-color var(--motion)");
    }
    expect(shared(":root", "--motion")).toBe("120ms ease-out");
    const site = readText(SITE);
    expect(site, "the start page has no transition").not.toMatch(/\btransition\b/);
    expect(site, "the start page has no animation").not.toMatch(/\banimation\b|@keyframes/);
    expect(site).not.toMatch(/scroll-behavior\s*:\s*smooth/);
  });

  it("runs no transition when motion is reduced or contrast is high", () => {
    const text = readText(REGISTER);
    expect(text).toMatch(/html\[data-motion="reduce"\] \*[^{]*\{[^}]*transition:\s*none !important/);
    expect(text).toMatch(/html:not\(\[data-motion\]\) \*[^{]*\{[^}]*transition:\s*none !important/);
    const high = rulesOf(text).filter((r) => r.at === "" && r.selector.startsWith('html[data-contrast="high"]') && declOf(r.body, "transition") === "none !important");
    expect(high.length, "a rule that stops transitions in high contrast").toBeGreaterThan(0);
  });
});

describe("index rows (L5.5)", () => {
  it("is a full width row, 44 high, with a 1 px outline, the words at the left and a chevron at the right", () => {
    expect(shared(".link-group .button", "width")).toBe("100%");
    expect(shared(".link-group .button", "min-height")).toBe("44px");
    expect(shared(".link-group .button", "justify-content")).toBe("space-between");
    expect(shared(".link-group .button", "text-align")).toBe("left");
    expect(shared(".link-group .button", "border")).toBe("1px solid var(--soft-line)");
    expect(shared(".link-group .button", "padding")).toBe("8px 12px");
    expect(shared(".link-group .button:hover:not(:disabled)", "border-color")).toBe("var(--ink)");
  });

  it("stacks the rows 12 px apart", () => {
    expect(shared(".link-group ul.actions", "flex-direction")).toBe("column");
    expect(shared(".link-group ul.actions", "flex-wrap")).toBe("nowrap");
    expect(shared(".link-group ul.actions", "align-items")).toBe("stretch");
    expect(shared(".actions", "gap")).toBe("12px");
  });

  it("draws the chevron with CSS, with no text for a screen reader", () => {
    const after = shared(".link-group .button::after", "content");
    expect(after, "the chevron").toBeDefined();
    expect(after).toMatch(/^"\\203A" \/ ""$/);
    expect(shared(".link-group .button::after", "font-size")).toBe("20px");
  });

  it("outlines the row in the theme's own line colour", () => {
    expect(lastDecl([REGISTER], ":root", "--soft-line")).toBe("var(--ink)");
    expect(lastDecl([REGISTER, CHURCH], ":root", "--soft-line")).toBe("#6b6557");
    expect(lastDecl([REGISTER, GARDEN], ":root", "--soft-line")).toBe("#6f8576");
  });
});

// ---- The contrast of each state ------------------------------------------------------------------------------

type Floor = 3 | 4.5;
type Pair = readonly [string, string, string, Floor];

const STATES: readonly Pair[] = [
  ["outlined, rest", "--ink", "--field", 4.5],
  ["outlined, hover", "--ink", "--soft", 4.5],
  ["outlined, pressed", "--ink", "--outline-pressed", 4.5],
  ["outlined edge on the page", "--ink", "--paper", 3],
  ["quiet, rest", "--ink", "--paper", 4.5],
  ["quiet, hover", "--ink", "--soft", 4.5],
  ["quiet, pressed", "--ink", "--outline-pressed", 4.5],
  ["main action, rest", "--action-ink", "--action", 4.5],
  ["main action, hover", "--action-ink", "--action-hover", 4.5],
  ["main action, pressed", "--action-ink", "--action-pressed", 4.5],
  ["main action edge", "--action-edge", "--paper", 3],
  ["index row, rest", "--ink", "--field", 4.5],
  ["index row, hover", "--ink", "--soft", 4.5],
  ["index row, pressed", "--ink", "--outline-pressed", 4.5],
  ["index row edge on the field", "--soft-line", "--field", 3],
  ["index row edge on the page", "--soft-line", "--paper", 3],
  ["disabled", "--muted", "--soft", 4.5],
  ["invalid border on the field", "--error", "--field", 3],
  ["invalid border on the page", "--error", "--paper", 3],
  ["error message on the page", "--error", "--paper", 4.5],
  ["error message on the field", "--error", "--field", 4.5],
  ["error mark cut on its circle", "--paper", "--error", 3],
  ["check box edge on the field", "--ink", "--field", 3],
  ["check mark on the filled box", "--paper", "--ink", 3],
  ["saved text", "--ink", "--good", 4.5],
  ["saved mark on its notice", "--ok", "--good", 3],
  ["saved tick on its mark", "--paper", "--ok", 3],
  ["error notice text", "--error", "--bad", 4.5],
  ["error mark on its notice", "--error", "--bad", 3],
  ["error notice mark cut on its circle", "--paper", "--error", 3],
];

function measure(scope: Scope, high: boolean, pairs: readonly Pair[]): string[] {
  const failures: string[] = [];
  for (const [what, fg, bg, floor] of pairs) {
    const a = colourOf(SCOPES[scope], high, fg);
    const b = colourOf(SCOPES[scope], high, bg);
    const ratio = contrast(a, b);
    if (ratio < floor) failures.push(`${what}: ${fg} ${a} on ${bg} ${b} is ${ratio.toFixed(2)}, needs ${floor}`);
  }
  return failures;
}

describe("the contrast of every state of a component (L5.5)", () => {
  it.each(["plain", "church", "garden"] as const)("reaches its floor with %s", (scope) => {
    expect(measure(scope, false, STATES)).toEqual([]);
  });

  it.each(["plain", "church", "garden"] as const)("reaches its floor in high contrast with %s", (scope) => {
    expect(measure(scope, true, STATES)).toEqual([]);
  });

  it("gives the outlined pressed fill of each theme", () => {
    expect(lastDecl([REGISTER], ":root", "--outline-pressed")).toBe("var(--soft)");
    expect(colourOf(SCOPES.church, false, "--outline-pressed").toLowerCase()).toBe("#d9cdb0");
    expect(colourOf(SCOPES.garden, false, "--outline-pressed").toLowerCase()).toBe("#d5e0c2");
  });

  it("reads the dashed edge of a section on its row ground at 3 to 1", () => {
    const pairs: readonly Pair[] = [["dashed edge on the lawn", "--soft-line", "--row-ground", 3]];
    expect(measure("church", false, pairs)).toEqual([]);
    expect(measure("garden", false, [["dashed edge on the grass", "--leaf", "--row-ground", 3]])).toEqual([]);
  });
});

// ---- Fields, errors and check rows ---------------------------------------------------------------------------

describe("fields, errors and check rows (L5.2, L5.3)", () => {
  it("sets a label at 14 px bold, 6 px from its field, and fields at 16 px", () => {
    expect(shared(".field label", "font-size")).toBe("14px");
    expect(shared(".field label", "font-weight")).toBe("700");
    expect(shared(".field", "gap")).toBe("6px");
    expect(shared(".hint", "font-size")).toBe("14px");
    expect(shared("input:not([type=\"checkbox\"]):not([type=\"radio\"])", "font-size")).toBe("16px");
    expect(shared("input:not([type=\"checkbox\"]):not([type=\"radio\"])", "min-height")).toBe("var(--field-h)");
    expect(lastDecl([REGISTER], ":root", "--field-h")).toBe("44px");
    expect(lastDecl([REGISTER, CHURCH], ":root", "--field-h")).toBe("48px");
    expect(lastDecl([REGISTER, GARDEN], ":root", "--field-h")).toBe("48px");
  });

  it("draws an invalid field with a 3 px solid border in the error colour, and no dashes", () => {
    for (const selector of ['input[aria-invalid="true"]:not([type="checkbox"]):not([type="radio"])', 'select[aria-invalid="true"]', 'textarea[aria-invalid="true"]']) {
      expect(shared(selector, "border"), selector).toBe("3px solid var(--error)");
      expect(shared(selector, "border-style"), selector).toBeUndefined();
    }
  });

  it("follows an invalid field with a round mark and the message in the error colour, weight 600", () => {
    expect(shared(".field .error", "color")).toBe("var(--error)");
    expect(shared(".field .error", "font-weight")).toBe("600");
    expect(shared(".field .error", "position")).toBe("relative");
    expect(shared(".field .error", "padding-left")).toBe("28px");
    expect(shared(".field .error::before", "content")).toBe('""');
    expect(shared(".field .error::before", "width")).toBe("20px");
    expect(shared(".field .error::before", "height")).toBe("20px");
    expect(shared(".field .error::before", "border-radius")).toBe("50%");
    expect(shared(".field .error::before", "background")).toContain("var(--error)");
  });

  it("makes a check row 44 high with a 12 px gap, and a 24 px box inside a 44 by 44 target", () => {
    expect(shared(".check", "min-height")).toBe("44px");
    expect(shared(".check", "gap")).toBe("12px");
    for (const selector of ['input[type="checkbox"]', 'input[type="radio"]']) {
      expect(shared(selector, "width"), selector).toBe("44px");
      expect(shared(selector, "height"), selector).toBe("44px");
      expect(shared(selector, "appearance"), selector).toBe("none");
      expect(shared(`${selector}::before`, "content"), selector).toBe('""');
      expect(shared(`${selector}::before`, "width"), selector).toBe("24px");
      expect(shared(`${selector}::before`, "height"), selector).toBe("24px");
      expect(shared(`${selector}::before`, "top"), selector).toBe("10px");
      expect(shared(`${selector}::before`, "left"), selector).toBe("10px");
      expect(shared(`${selector}::before`, "box-sizing"), selector).toBe("border-box");
      expect(shared(`${selector}::before`, "border"), selector).toBe("2px solid var(--ink)");
    }
    expect(shared('input[type="radio"]::before', "border-radius")).toBe("50%");
    expect(shared('input[type="checkbox"]:checked::before', "background")).toBe("var(--ink)");
  });

  it("draws the tick and the dot with CSS and puts the ring round the box", () => {
    expect(shared('input[type="checkbox"]:checked::after', "content")).toBe('""');
    expect(shared('input[type="checkbox"]:checked::after', "transform")).toBe("rotate(45deg)");
    expect(shared('input[type="radio"]:checked::after', "content")).toBe('""');
    expect(shared('input[type="radio"]:checked::after', "border-radius")).toBe("50%");
    expect(shared('input[type="checkbox"]:focus-visible', "outline-offset")).toBe("-8px");
  });
});

// ---- Cards and notices ---------------------------------------------------------------------------------------

describe("notices (L5.4)", () => {
  it("gives a saved notice the ok border and a tick, and an error notice the error border and a mark", () => {
    expect(shared(".notice.good", "border-color")).toBe("var(--ok)");
    expect(shared(".notice.error", "border-color")).toBe("var(--error)");
    for (const selector of [".notice.good::before", ".notice.error::before"]) {
      expect(shared(selector, "content"), selector).toBe('""');
      expect(shared(selector, "width"), selector).toBe("24px");
      expect(shared(selector, "height"), selector).toBe("24px");
      expect(shared(selector, "border-radius"), selector).toBe("50%");
    }
    expect(shared(".notice.good::before", "background")).toBe("var(--ok)");
    expect(shared(".notice.error::before", "background")).toContain("var(--error)");
    expect(shared(".notice.good::after", "content")).toBe('""');
    expect(shared(".notice.good::after", "transform")).toBe("rotate(45deg)");
  });

  it("keeps the words clear of the mark and draws the marks with no text", () => {
    expect(shared(".notice.good", "padding-left")).toBe("52px");
    expect(shared(".notice.error", "padding-left")).toBe("52px");
    for (const file of [REGISTER, CHURCH, GARDEN]) {
      for (const rule of rulesOf(readText(file))) {
        if (!rule.selector.includes(".notice") && !rule.selector.includes(".error::before")) continue;
        const content = declOf(rule.body, "content");
        if (content !== undefined) expect(content, `${file} ${rule.selector}`).toBe('""');
      }
    }
  });

});

describe("cards (L5.4)", () => {
  it("gives the allotment card an 8 px hatched strip in place of the green top edge", () => {
    const css = readText(GARDEN);
    expect(lastDecl([GARDEN], ".card", "border-top")).toBeUndefined();
    expect(lastDecl([GARDEN], ".card", "border")).toBe("2px solid var(--ink)");
    expect(lastDecl([GARDEN], ".card::before", "height")).toBe("8px");
    expect(lastDecl([GARDEN], ".card::before", "content")).toBe('""');
    expect(lastDecl([GARDEN], ".card::before", "background")).toMatch(/repeating-linear-gradient\(-45deg/);
    expect(css).not.toMatch(/border-top:\s*10px solid var\(--leaf\)/);
  });

  it("takes the hatching out of the strip in high contrast", () => {
    const high = rulesFor(GARDEN, 'html[data-contrast="high"] .card::before');
    expect(high.length).toBeGreaterThan(0);
    expect(declOf(high[0]?.body ?? "", "background")).toBe("none");
  });

  it("keeps the churchyard card as it is until the sheets of slice 3 exist", () => {
    expect(lastDecl([CHURCH], ".card", "border-left")).toBe("6px solid var(--sky)");
    expect(lastDecl([REGISTER, CHURCH], ":root", "--radius-card")).toBe("16px 16px 2px 2px");
    expect(lastDecl([REGISTER, GARDEN], ":root", "--radius-card")).toBe("14px");
  });
});

describe("the words (L13)", () => {
  it("adds no text to the screen: every pseudo element of the components has empty content, or only the chevron", () => {
    for (const file of [REGISTER, CHURCH, GARDEN]) {
      for (const rule of rulesOf(readText(file))) {
        if (!/::(before|after)$/.test(rule.selector)) continue;
        const content = declOf(rule.body, "content");
        if (content === undefined) continue;
        expect(content, `${file} ${rule.selector}`).toMatch(/^(""|"\\203A" \/ "")$/);
      }
    }
  });
});
