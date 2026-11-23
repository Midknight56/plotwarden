// The screens of the new look, slice 3, part 2 (spec 07, tasks 7.20 to 7.22, L7.4, L7.5, L7.7, L7.8) and the mends of the
// lead's review. The test reads the stylesheets, the art file and the notes about it. Sizes in a real browser are measured
// by tests/browser/layout.spec.ts and release.spec.ts. The values are the ones in the design and the task, not the output
// of the code.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, ButtonLink } from "../../template/src/ui/controls";
import { lastDecl, readText, rulesFor, rulesOf } from "../helpers/cssRules";

const ROOT = join(__dirname, "..", "..");
const REGISTER = "template/src/ui/register.css";
const CHURCH = "apps/churchyard-register/src/theme.css";
const GARDEN = "apps/allotment-register/src/theme.css";
const SITE = "site/src/site.css";
const PRINT = "template/src/ui/print.css";
const WIDE = "@media (min-width: 60rem)";

// ---- assets/mark.svg ----------------------------------------------------------------------------------------------

/** The SHA 256 of the mark in the design handoff (art/mark.svg.txt). The repository file is that file, byte for byte. */
const MARK_SHA256 = "b119fa1110409acb36bed3a3b726c242035baa496e7c9066bf032dd0c5627924";

describe("assets/mark.svg (7.21)", () => {
  const bytes = readFileSync(join(ROOT, "assets", "mark.svg"));
  const svg = bytes.toString("utf8");

  it("is the handoff's clean copy, byte for byte", () => {
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(MARK_SHA256);
  });

  it("follows the art rules of the other files: a small closed drawing with a whole number view box, and nothing outside", () => {
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg).toMatch(/viewBox="0 0 64 64"/);
    expect(svg.length).toBeGreaterThan(400);
    expect(svg.length).toBeLessThan(9000);
    const stack: string[] = [];
    for (const m of svg.matchAll(/<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g)) {
      if (m[4] === "/") continue;
      if (m[1] === "/") expect(stack.pop()).toBe(m[2]);
      else stack.push(m[2] as string);
    }
    expect(stack).toEqual([]);
    const body = svg.replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "");
    for (const forbidden of ["<text", "<script", "<image", "<foreignObject", "<style", "http:", "https:", "@import", "data:", 'href="http', "onload", "base64"]) {
      expect(body, forbidden).not.toContain(forbidden);
    }
    expect(svg).not.toContain("\r");
    expect(svg.charCodeAt(0)).not.toBe(0xfeff);
  });

  it("has a row in the notes of the art with four columns, and a line of its colours that are the colours of the file", () => {
    const notes = readText("assets/origins.md");
    const row = notes.split("\n").find((line) => line.startsWith("| `mark.svg`")) ?? "";
    expect(row.split("|").length, "four columns").toBe(6);
    expect(row).toMatch(/arch/);
    expect(row).toMatch(/bed/);
    expect(row).toContain("stands still");
    expect(row).toMatch(/start page/);
    const line = notes.split("\n").find((l) => l.startsWith("- `mark.svg`:")) ?? "";
    const hexes = (text: string): string[] => [...new Set([...text.matchAll(/#([0-9A-Fa-f]{6})(?![0-9A-Za-z])/g)].map((m) => `#${(m[1] as string).toUpperCase()}`))].sort();
    expect(hexes(line)).toEqual(hexes(svg));
    expect(hexes(svg)).toEqual(["#232B5C", "#F0B955", "#FAF5E9"]);
  });

  it("is held by one rule of the start page, beside the brand, and by no other stylesheet", () => {
    const holders = rulesOf(readText(SITE)).filter((r) => r.body.includes("mark.svg"));
    expect(holders.map((r) => r.selector)).toEqual([".brand::before"]);
    for (const file of [REGISTER, CHURCH, GARDEN, PRINT]) expect(readText(file), file).not.toContain("mark.svg");
  });
});

// ---- The start page (7.21, L7.8) -----------------------------------------------------------------------------------

describe("the start page (7.21)", () => {
  const site = (selector: string, property: string, at = ""): string | undefined => lastDecl([SITE], selector, property, at);

  it("has a 6 px stripe in the three app colours and a 60 px bar with a line under it", () => {
    expect(site(".stripe", "height")).toBe("6px");
    const stripe = site(".stripe", "background") ?? "";
    expect(stripe).toBe("linear-gradient(to right, var(--sky) 0 33.4%, var(--leaf) 33.4% 66.7%, var(--teal) 66.7%)");
    expect(site(":root", "--sky")).toBe("#232a5c");
    expect(site(":root", "--leaf")).toBe("#2f6b4f");
    expect(site(":root", "--teal")).toBe("#2b5a5f");
    expect(site(".bar", "min-height")).toBe("60px");
    expect(site(".bar", "display")).toBe("flex");
    expect(site(".bar", "justify-content")).toBe("space-between");
    expect(site(".bar", "border-bottom")).toBe("1px solid var(--ink)");
  });

  it("draws the mark beside the brand with CSS, 28 px, with no text, so a screen reader hears nothing of it", () => {
    expect(site(".brand::before", "content")).toBe('""');
    expect(site(".brand::before", "width")).toBe("28px");
    expect(site(".brand::before", "height")).toBe("28px");
    expect(site(".brand::before", "background")).toBe('url("../../assets/mark.svg") center / contain no-repeat');
    expect(site(".brand", "display")).toBe("inline-flex");
    expect(site(".brand", "align-items")).toBe("center");
    expect(site(".brand", "gap")).toBe("10px");
  });

  it("sets the title, the line and the lead in the sizes of the design", () => {
    expect(site("h1.title", "font-size")).toBe("clamp(40px, 3vw + 22px, 64px)");
    expect(site("h1.title", "line-height")).toBe("1.05");
    expect(site("h1", "font-size"), "the other pages keep the size of a page title").toBe("clamp(28px, 1.1vw + 20px, 36px)");
    expect(site(".job", "font-family")).toBe("var(--font-heading)");
    expect(site(".job", "font-size")).toBe("clamp(21px, 1vw + 15px, 28px)");
    expect(site(".job", "font-weight")).toBe("600");
    expect(site(".tagline", "font-size")).toBe("18px");
    expect(site("main", "max-width")).toBe("105rem");
  });

  it("lays two doors in a grid that wraps, 24 px apart", () => {
    expect(site(".doors", "display")).toBe("grid");
    expect(site(".doors", "grid-template-columns")).toBe("repeat(auto-fit, minmax(min(100%, 560px), 1fr))");
    expect(site(".doors", "gap")).toBe("24px");
  });

  it("gives each door an art band of its own height, and each its art", () => {
    expect(site(".door-art", "height")).toBe("clamp(84px, 7vw, 112px)");
    const church = site(".door.church .door-art", "background") ?? "";
    expect(church).toContain("gate-lantern.svg");
    expect(church).toContain("churchyard-margin.svg");
    expect(church).not.toContain("garden-margin");
    const garden = site(".door.garden .door-art", "background") ?? "";
    expect(garden).toContain("garden-margin.svg");
    expect(garden).not.toMatch(/gate-lantern|churchyard-margin/);
    // The band is a row of its own: it holds no word and no control, so no text stands on a picture.
    expect(site(".door-art", "display")).toBe("block");
  });

  it("holds each of the three band drawings in the rule of its own door, and nowhere else on the start page", () => {
    const holders = (name: string) => rulesOf(readText(SITE)).filter((r) => r.body.includes(`${name}.svg`)).map((r) => r.selector);
    expect(holders("gate-lantern")).toEqual([".door.church .door-art"]);
    expect(holders("churchyard-margin")).toEqual([".door.church .door-art"]);
    expect(holders("garden-margin")).toEqual([".door.garden .door-art"]);
    expect(rulesFor(SITE, ".sky").length, "the old strip is gone").toBe(0);
    expect(rulesFor(SITE, ".sky::before").length).toBe(0);
  });

  it("sets the door heading at 26 px, the buttons 48 high, and the two doors in their own grounds", () => {
    expect(site(".door h3", "font-size")).toBe("26px");
    expect(site(".door .button", "min-height")).toBe("48px");
    expect(site(".door.church", "background")).toBe("var(--sky)");
    expect(site(".door.church", "color")).toBe("var(--sky-ink)");
    expect(site(".door.church", "border-radius")).toBe("16px 16px 2px 2px");
    expect(site(".door.garden", "background")).toBe("var(--garden-paper)");
    expect(site(".door.garden", "color")).toBe("var(--garden-ink)");
    expect(site(".door.garden", "border-radius")).toBe("14px");
    expect(site(".door.garden h3", "color")).toBe("var(--leaf)");
  });

  it("makes the practice map the width of its drawing, with no key under it", () => {
    expect(site(".practice-map", "width")).toBe("fit-content");
    expect(site(".practice-map", "max-width")).toBe("100%");
  });

  it("draws the main action of the night door in lantern amber, and its outlined button in ivory on the night", () => {
    expect(site(".door.church .button", "background")).toBe("var(--amber)");
    expect(site(".door.church .button", "color")).toBe("var(--ink)");
    expect(site(".door.church .button.secondary", "background")).toBe("transparent");
    expect(site(".door.church .button.secondary", "color")).toBe("var(--sky-ink)");
    expect(site(".door.church .button.secondary", "border-color")).toBe("var(--sky-ink)");
    expect(site(".door.church a:focus-visible", "outline-color")).toBe("var(--ring-night)");
    expect(site(".door.garden .button", "background")).toBe("var(--leaf)");
    expect(site(".door.garden .button.secondary", "background")).toBe("var(--garden-paper)");
  });

  it("gives the Review Desk card a 2 px teal edge and a radius of 10, and draws each visitor sheet in code", () => {
    expect(site(".review-card", "border")).toBe("2px solid var(--teal)");
    expect(site(".review-card", "border-radius")).toBe("10px");
    expect(site(".sheet-pic", "width")).toBe("54px");
    expect(site(".sheet-pic", "height")).toBe("70px");
    expect(site(".sheet-pic", "background")).toBeDefined();
    expect(site(".sheet-pic", "background") ?? "").not.toContain("url(");
    expect(site(".sheet-row", "display")).toBe("flex");
    expect(site(".sheet-row", "align-items")).toBe("center");
    expect(site(".sheet-row", "gap")).toBe("16px");
  });

  it("keeps every part of the start page still, and draws nothing from another host", () => {
    const css = readText(SITE);
    expect(css).not.toMatch(/\btransition\b|\banimation\b|@keyframes/);
    expect(css).not.toMatch(/url\(\s*["']?(https?:|\/\/|data:)/);
  });

  it("makes high contrast plain: the night door is white with a black edge, and the stripe is the ink", () => {
    const high = "@media (prefers-contrast: more)";
    // The rules of high contrast stand after the rules they replace, or the same weight would let the base rule win.
    const rules = rulesOf(readText(SITE));
    const last = (selector: string, at: string) => Math.max(...rules.filter((r) => r.selector === selector && r.at === at).map((r) => r.order));
    expect(last(".door.church", high)).toBeGreaterThan(last(".door.church", ""));
    expect(last(".door-art", high)).toBeGreaterThan(last(".door-art", ""));
    expect(lastDecl([SITE], ".door.church", "background", high)).toBe("#ffffff");
    expect(lastDecl([SITE], ".door.church", "color", high)).toBe("#000000");
    expect(lastDecl([SITE], ".door-art", "display", high)).toBe("none");
  });
});

// ---- The side panel of the site map, the columns of a plot (7.20) -------------------------------------------------

describe("the site map and the plot record (7.20, L7.4, L7.7)", () => {
  const shared = (selector: string, property: string, at = ""): string | undefined => lastDecl([REGISTER], selector, property, at);

  it("makes main 105rem for the site map and 90rem for the screens with sheets of their own, and keeps 72rem for the rest", () => {
    expect(shared("main", "max-width")).toBe("72rem");
    expect(shared("main:has(.map-layout)", "max-width")).toBe("105rem");
    expect(shared("main:has(.page)", "max-width")).toBe("90rem");
    expect(shared("main:has(.desk)", "max-width")).toBe("105rem");
  });

  it("gives the map flex 3 1 560 and the side sheet flex 1 1 280, side by side and wrapping in order", () => {
    expect(shared(".map-layout", "display")).toBe("flex");
    expect(shared(".map-layout", "flex-wrap")).toBe("wrap");
    expect(shared(".map-layout", "align-items")).toBe("flex-start");
    expect(shared(".map-layout", "gap")).toBe("clamp(20px, 2.2vw, 32px)");
    expect(shared(".map-layout > *", "min-width")).toBe("0");
    expect(shared(".map-main", "flex")).toBe("3 1 560px");
    expect(shared(".map-side", "flex")).toBe("1 1 280px");
  });

  it("puts the plot record sheets in two columns of 440 px at least, one column on a phone, and keeps a sheet whole", () => {
    expect(shared(".sheet-columns", "columns")).toBe("440px 2");
    expect(shared(".sheet-columns", "column-gap")).toBe("clamp(24px, 2.2vw, 32px)");
    expect(shared(".sheet-columns > .card", "break-inside")).toBe("avoid");
    expect(shared(".sheet-columns > .card", "margin")).toBe("0 0 20px");
    expect(shared(".sheet-columns > :not(.card)", "column-span")).toBe("all");
  });

  it("splits the rows inside a sheet by 1 px rule lines, with none under the last", () => {
    expect(shared(".sheet-columns .card ul.plain > li", "border-bottom")).toBe("1px solid var(--rule)");
    expect(shared(".sheet-columns .card ul.plain > li:last-child", "border-bottom")).toBe("0");
    expect(lastDecl([REGISTER], ":root", "--rule")).toBe("#d8cdb4");
    expect(lastDecl([REGISTER], 'html[data-contrast="high"]', "--rule")).toBe("#000000");
  });

  it("draws the sheet heading of the churchyard with a 3 px double rule under it", () => {
    expect(lastDecl([CHURCH], ".page .card > h2", "border-bottom")).toBe("3px double var(--soft-line)");
    expect(lastDecl([CHURCH], ".page .card > h2", "padding-bottom")).toBe("8px");
  });

  it("prints the map and its key in one column, and leaves the side sheet out", () => {
    expect(lastDecl([PRINT], ".map-layout", "display", "@media print")).toBe("block");
  });
});

// ---- The form screens (7.22) --------------------------------------------------------------------------------------

describe("the form sheets (7.22)", () => {
  const shared = (selector: string, property: string, at = ""): string | undefined => lastDecl([REGISTER], selector, property, at);

  it("makes a form sheet at most 600 wide, with fields in a grid where they fit", () => {
    expect(shared(".form-sheet", "max-width")).toBe("600px");
    expect(shared(".field-grid", "display")).toBe("grid");
    expect(shared(".field-grid", "grid-template-columns")).toBe("repeat(auto-fit, minmax(min(100%, 180px), 1fr))");
    expect(shared(".field-grid", "gap")).toBe("14px 16px");
    expect(shared(".field-grid > .stack", "display")).toBe("contents");
  });

  it("lays the options of one group of choices in a grid, and keeps them 12 px apart", () => {
    expect(shared(".choice-grid", "display")).toBe("grid");
    expect(shared(".choice-grid", "grid-template-columns")).toBe("repeat(auto-fit, minmax(min(100%, 170px), 1fr))");
    expect(shared(".choice-grid", "gap")).toBe("12px");
    expect(shared(".choice-columns", "grid-template-columns")).toBe("repeat(auto-fit, minmax(min(100%, 200px), 1fr))");
    expect(shared(".choice-columns", "gap")).toBe("16px");
  });

  it("gives the heading row, the settings sheets and the code tab their values", () => {
    expect(shared(".page-head", "display")).toBe("flex");
    expect(shared(".page-head", "flex-wrap")).toBe("wrap");
    expect(shared(".page-head", "justify-content")).toBe("space-between");
    expect(shared(".settings-layout", "display")).toBe("flex");
    expect(shared(".settings-device", "flex")).toBe("3 1 420px");
    expect(shared(".settings-remove", "flex")).toBe("2 1 320px");
    expect(shared(".code-tab", "background")).toBe("var(--tab)");
    expect(shared(".code-tab", "border")).toBe("2px solid var(--ink)");
    expect(shared(".code-tab", "font-weight")).toBe("700");
  });

  it("draws the committee review as two sheets at 60rem: what you type, and what leaves the device", () => {
    expect(shared(".review-layout", "display")).toBe("grid");
    expect(shared(".review-layout", "grid-template-columns", WIDE)).toBe("minmax(0, 2fr) minmax(0, 3fr)");
    expect(shared(".review-input", "grid-column", WIDE)).toBe("1");
    expect(shared(".review-input", "grid-row", WIDE)).toBe("1");
    expect(shared(".review-slip", "grid-column", WIDE)).toBe("1");
    expect(shared(".review-slip", "grid-row", WIDE)).toBe("2");
    expect(shared(".review-preview", "grid-column", WIDE)).toBe("2");
    expect(shared(".review-preview", "grid-row", WIDE)).toBe("1 / span 2");
    // The slip lies under a double rule, as part of the same sheet, in the churchyard.
    expect(lastDecl([CHURCH], ".review-slip", "border-top", WIDE)).toBe("3px double var(--soft-line)");
    expect(lastDecl([CHURCH], ".review-layout", "row-gap", WIDE)).toBe("0");
  });

  it("makes the forms and the buttons of a form 48 high in the two themes", () => {
    expect(shared(".form-sheet .actions .button", "min-height")).toBe("var(--field-h)");
    expect(lastDecl([REGISTER, CHURCH], ":root", "--field-h")).toBe("48px");
    expect(lastDecl([REGISTER, GARDEN], ":root", "--field-h")).toBe("48px");
  });
});

describe("the offer and the season fees, in the allotment theme (7.22)", () => {
  const garden = (selector: string, property: string, at = ""): string | undefined => lastDecl([GARDEN], selector, property, at);

  it("puts the card Plot and applicant beside the open offers, 3 to 2, wrapping in order", () => {
    expect(garden(".offer-layout", "display")).toBe("flex");
    expect(garden(".offer-layout", "flex-wrap")).toBe("wrap");
    expect(garden(".offer-card", "flex")).toBe("3 1 400px");
    expect(garden(".offer-list", "flex")).toBe("2 1 320px");
  });

  it("tints the passed over applicants with the soft fill and a 1 px soft line", () => {
    expect(garden(".soft-panel", "background")).toBe("var(--soft)");
    expect(garden(".soft-panel", "border")).toBe("1px solid var(--soft-line)");
    expect(garden(".soft-panel", "border-radius")).toBe("var(--radius-control)");
  });

  it("makes one fees card at most 1040 wide, in two halves from 56rem, the charge at the left and the payment at the right", () => {
    expect(garden(".charge-card", "max-width")).toBe("1040px");
    expect(garden(".charge-halves", "display")).toBe("grid");
    const wide = "@media (min-width: 56rem)";
    expect(garden(".charge-halves", "grid-template-columns", wide)).toBe("repeat(2, minmax(0, 1fr))");
    expect(garden(".charge-half", "grid-column", wide)).toBe("1");
    expect(garden(".pay-half", "grid-column", wide)).toBe("2");
    expect(garden(".charge-reverse", "grid-column", wide)).toBe("1");
    expect(garden(".cards.charge-cards", "grid-template-columns")).toBe("minmax(0, 1fr)");
  });

  it("sets Still due in the tab colour with a 2 px edge, and the other two figures plain with a 1 px line", () => {
    expect(garden(".charge-card .facts > div", "border")).toBe("1px solid var(--soft-line)");
    expect(garden(".charge-card .facts > div:last-child", "background")).toBe("var(--tab)");
    expect(garden(".charge-card .facts > div:last-child", "border")).toBe("2px solid var(--ink)");
  });

  it("draws a ring on the chip, with no text", () => {
    expect(garden(".badge::before", "content")).toBe('""');
    expect(garden(".badge::before", "width")).toBe("12px");
    expect(garden(".badge::before", "height")).toBe("12px");
    expect(garden(".badge::before", "border")).toBe("2px solid var(--ink)");
    expect(garden(".badge::before", "border-radius")).toBe("50%");
  });
});

// ---- The mends of the lead's review -------------------------------------------------------------------------------

describe("the button tiers of a desk (mend a)", () => {
  it("lets a Button and a ButtonLink be quiet, with the class the stylesheet draws", () => {
    expect(renderToStaticMarkup(createElement(Button, { quiet: true, children: "x" }))).toBe('<button type="button" class="button quiet">x</button>');
    expect(renderToStaticMarkup(createElement(ButtonLink, { href: "#/", quiet: true, children: "x" }))).toBe('<a class="button quiet" href="#/">x</a>');
    expect(renderToStaticMarkup(createElement(Button, { primary: true, children: "x" }))).toBe('<button type="button" class="button primary">x</button>');
    expect(renderToStaticMarkup(createElement(Button, { children: "x" }))).toBe('<button type="button" class="button">x</button>');
  });

  it("makes a quiet button on the night ivory, with an ivory veil on hover and press", () => {
    const high = 'html:not([data-contrast="high"]) .on-ground .button.quiet';
    expect(lastDecl([CHURCH], high, "color")).toBe("var(--on-ground)");
    expect(lastDecl([CHURCH], `${high}:hover:not(:disabled)`, "background")).toBe("rgba(250, 245, 233, 0.16)");
    expect(lastDecl([CHURCH], `${high}:active:not(:disabled)`, "background")).toBe("rgba(250, 245, 233, 0.24)");
  });

  it("keeps the source of both desks to the tiers of the design: Search is the main action on the churchyard desk and the example is quiet", () => {
    const church = readFileSync(join(ROOT, "apps/churchyard-register/src/ChurchyardHome.tsx"), "utf8");
    const garden = readFileSync(join(ROOT, "apps/allotment-register/src/AllotmentHome.tsx"), "utf8");
    expect(church).toMatch(/<Button quiet onClick=\{\(\) => tryExample\(\)\}>/);
    expect(church).toMatch(/<Button primary type="submit">\s*\{t\("search"\)\}/);
    expect(garden).toMatch(/<Button\s+quiet\s+onClick=/);
    expect(garden).toMatch(/<Button primary=\{false\} type="submit">/);
  });
});

describe("the brand mark and the foot band (mends b and c)", () => {
  it("draws a small arch with a lantern in it beside the churchyard brand, and a bed with its hatching beside the allotment brand", () => {
    expect(lastDecl([CHURCH], "header.app .brand::before", "content")).toBe('""');
    expect(lastDecl([CHURCH], "header.app .brand::before", "width")).toBe("17px");
    expect(lastDecl([CHURCH], "header.app .brand::before", "height")).toBe("21px");
    expect(lastDecl([CHURCH], "header.app .brand::before", "border")).toBe("2.5px solid var(--sky-ink)");
    expect(lastDecl([CHURCH], "header.app .brand::before", "border-radius")).toBe("9px 9px 1px 1px");
    expect(lastDecl([CHURCH], "header.app .brand::before", "background")).toContain("var(--tab)");
    expect(lastDecl([CHURCH], "header.app .brand", "gap")).toBe("10px");
    expect(lastDecl([GARDEN], "header.app .brand::before", "content")).toBe('""');
    expect(lastDecl([GARDEN], "header.app .brand::before", "width")).toBe("22px");
    expect(lastDecl([GARDEN], "header.app .brand::before", "height")).toBe("17px");
    expect(lastDecl([GARDEN], "header.app .brand::before", "border")).toBe("2.5px solid var(--leaf)");
    expect(lastDecl([GARDEN], "header.app .brand::before", "border-radius")).toBe("4px");
    expect(lastDecl([GARDEN], "header.app .brand", "gap")).toBe("10px");
  });

  it("puts a 56 px band of the churchyard margin at the foot of a churchyard screen with sheets, and none in high contrast or print", () => {
    const foot = ".shell:has(.desk, .page)::after";
    expect(lastDecl([CHURCH], foot, "content")).toBe('""');
    expect(lastDecl([CHURCH], foot, "display")).toBe("block");
    expect(lastDecl([CHURCH], foot, "height")).toBe("56px");
    expect(lastDecl([CHURCH], foot, "background")).toBe('url("../../../assets/churchyard-margin.svg") repeat-x left bottom / auto 100%');
    expect(lastDecl([CHURCH], `html[data-contrast="high"] ${foot}`, "display")).toBe("none");
    expect(lastDecl([CHURCH], foot, "display", "@media print")).toBe("none");
  });

  it("holds the churchyard margin in the header and in the foot band only, and the garden margin in the header only", () => {
    const holders = (file: string, name: string) => rulesOf(readText(file)).filter((r) => r.body.includes(`${name}.svg`)).map((r) => r.selector);
    expect(holders(CHURCH, "churchyard-margin")).toEqual(["header.app::before", ".shell:has(.desk, .page)::after"]);
    expect(holders(CHURCH, "gate-lantern")).toEqual(["header.app::before"]);
    expect(holders(GARDEN, "garden-margin")).toEqual(["header.app::before"]);
    expect(readText(GARDEN)).not.toMatch(/gate-lantern|churchyard-margin/);
  });

  it("has no foot band on the allotment", () => {
    expect(rulesOf(readText(GARDEN)).filter((r) => r.selector.includes("::after") && r.body.includes("url("))).toEqual([]);
  });
});

describe("the state line on the churchyard desk (mends d and e)", () => {
  it("draws the result title and the burial names in the heading font", () => {
    expect(lastDecl([CHURCH], ".desk-find .card strong", "font-family")).toBe("var(--font-heading)");
    expect(lastDecl([CHURCH], ".desk-find .card strong", "font-size")).toBe("19px");
    expect(lastDecl([CHURCH], ".burial-name", "font-family")).toBe("var(--font-heading)");
    expect(lastDecl([CHURCH], ".burial-name", "font-size")).toBe("18px");
    expect(lastDecl([CHURCH], ".burial-name", "font-weight")).toBe("700");
  });

  it("sets the state line of a sheet or a result as a row that does not wrap: the mark, then the words", () => {
    expect(lastDecl([CHURCH], ".state-line", "display")).toBe("flex");
    expect(lastDecl([CHURCH], ".state-line", "flex-wrap")).toBe("nowrap");
    expect(lastDecl([CHURCH], ".state-line", "align-items")).toBe("flex-start");
    expect(lastDecl([CHURCH], ".state-line > span", "flex")).toBe("1 1 0");
    expect(lastDecl([CHURCH], ".state-line > span", "min-width")).toBe("0");
  });

  it("keeps the mark beside the site name on the line of its words: no wrap, the words take what is left", () => {
    expect(lastDecl([CHURCH], ".summary-line", "flex-wrap")).toBe("nowrap");
    expect(lastDecl([CHURCH], ".summary-line", "align-items")).toBe("flex-start");
    expect(lastDecl([CHURCH], ".summary-line > span", "flex")).toBe("1 1 0");
    expect(lastDecl([CHURCH], ".summary-line > span", "min-width")).toBe("0");
    expect(lastDecl([CHURCH], ".mark-swatch", "flex")).toBe("none");
  });

  it("makes the small mark smaller than the mark of the heading row", () => {
    expect(lastDecl([CHURCH], ".mark-swatch.small", "width")).toBe("22px");
    expect(lastDecl([CHURCH], ".mark-swatch.small", "height")).toBe("22px");
  });
});
