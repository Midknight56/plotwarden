// The layouts and the art of the new look (spec 07, slice 3, tasks 7.15 to 7.19, L7). The test reads the art files, the
// notes about them and the stylesheets. Sizes in a real browser are measured by tests/browser/layout.spec.ts.
// The floors and the sizes are the contract of the design, not the output of the code.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { colourOf, contrast, declOf, lastDecl, readText, rulesFor, rulesOf } from "../helpers/cssRules";

const ROOT = join(__dirname, "..", "..");
const REGISTER = "template/src/ui/register.css";
const CHURCH = "apps/churchyard-register/src/theme.css";
const GARDEN = "apps/allotment-register/src/theme.css";
const PHONE = "@media (max-width: 37.4375rem)";

const art = (name: string): string => readFileSync(join(ROOT, "assets", `${name}.svg`), "utf8");

/** A small check that every tag closes, so a broken drawing fails here and not in a browser. */
function balanced(svg: string): boolean {
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, name, , selfClosing] = m;
    if (selfClosing === "/") continue;
    if (closing === "/") {
      if (stack.pop() !== name) return false;
    } else stack.push(name as string);
  }
  return stack.length === 0;
}

/** Every hex colour in a text, as six capital digits, in sorted order, once each. */
function hexes(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})(?![0-9A-Za-z])/g)) {
    const digits = (m[1] as string).toUpperCase();
    found.add(`#${digits.length === 3 ? [...digits].map((c) => c + c).join("") : digits}`);
  }
  return [...found].sort();
}

// ---- The art (L7.3) --------------------------------------------------------------------------------------------

const SIZES = { "churchyard-margin": [1200, 80], "gate-lantern": [300, 80], "garden-margin": [1200, 72] } as const;
type ArtName = keyof typeof SIZES;
const NAMES = Object.keys(SIZES) as ArtName[];

describe.each(NAMES)("assets/%s.svg (L7.3)", (name) => {
  const svg = art(name);

  it("is a small, closed drawing with the whole number view box that the band is drawn for", () => {
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(balanced(svg)).toBe(true);
    const box = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    expect([Number(box?.[1]), Number(box?.[2])]).toEqual([...SIZES[name]]);
    expect(svg.length).toBeGreaterThan(400);
    expect(svg.length).toBeLessThan(9000);
  });

  it("has no text, script, picture, style or address outside the file, and is hidden from a screen reader", () => {
    const body = svg.replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "");
    for (const forbidden of ["<text", "<script", "<image", "<foreignObject", "<style", "http:", "https:", "@import", "data:", 'href="http', "onload", "base64"]) {
      expect(body, forbidden).not.toContain(forbidden);
    }
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain("<title>");
  });

  it("uses LF line endings and no byte order mark", () => {
    expect(svg).not.toContain("\r");
    expect(svg.charCodeAt(0)).not.toBe(0xfeff);
  });
});

describe("the three drawings together (L7.3)", () => {
  it("leaves the folder with the three band drawings, the mark symbols and the notes, and no app mark", () => {
    expect(readdirSync(join(ROOT, "assets")).sort()).toEqual(["churchyard-margin.svg", "garden-margin.svg", "gate-lantern.svg", "origins.md", "plot-symbols.svg"]);
    expect(existsSync(join(ROOT, "assets", "mark.svg"))).toBe(false);
  });

  it("keeps the garden ids, more than ten uses, and none of the churchyard colours", () => {
    const svg = art("garden-margin");
    expect(svg).toContain('id="ridge"');
    expect(svg).toContain('id="sprout"');
    expect(svg.match(/<use /g)?.length).toBeGreaterThan(10);
    for (const hex of ["#232A5C", "#171C45", "#F2C96B"]) expect(svg.toUpperCase()).not.toContain(hex);
  });

  it("draws the lantern once in a drawing of its own, with its glass in the lantern amber", () => {
    expect(art("gate-lantern")).toContain("#F2C96B");
    expect(art("churchyard-margin")).not.toContain('id="glow"');
  });
});

// ---- The notes about the art are true of it (L7.3, L13) ---------------------------------------------------------

describe("assets/origins.md is true of the files and of the stylesheets", () => {
  const notes = readText("assets/origins.md");
  const church = readText(CHURCH);
  const garden = readText(GARDEN);

  it("says the art was drawn for this project as flat SVG shapes, and not by hand", () => {
    expect(notes).toContain("drawn for this project");
    expect(notes).toContain("flat SVG shapes");
    expect(notes).not.toMatch(/by hand/i);
    expect(notes).toMatch(/no (stock|real)/i);
  });

  it("has one row for each drawing, naming what it shows, where it is used and what moves", () => {
    for (const name of [...NAMES, "plot-symbols" as const]) expect(notes, name).toContain(`\`${name}.svg\``);
    const row = (name: string): string => notes.split("\n").find((line) => line.startsWith(`| \`${name}.svg\``)) ?? "";
    for (const name of NAMES) {
      expect(row(name).split("|").length, `${name} has four columns`).toBe(6);
      expect(row(name), name).toContain("stands still");
    }
    expect(row("gate-lantern")).toMatch(/moon/);
    expect(row("gate-lantern")).toMatch(/church/);
    expect(row("gate-lantern")).toMatch(/lantern/);
    expect(row("churchyard-margin")).toMatch(/yew/);
    expect(row("churchyard-margin")).toMatch(/railing/);
    expect(row("garden-margin")).toMatch(/shed/);
    expect(row("garden-margin")).toMatch(/furrow/);
  });

  it("lists the colours that each file holds, all of them and no others", () => {
    for (const name of NAMES) {
      const line = notes.split("\n").find((l) => l.startsWith(`- \`${name}.svg\`:`));
      expect(line, `a colour line for ${name}`).toBeDefined();
      expect(hexes(line ?? ""), name).toEqual(hexes(art(name)));
    }
  });

  it("says where each drawing is used, and the stylesheets use it there and nowhere else", () => {
    expect(church).toContain("assets/gate-lantern.svg");
    expect(church).toContain("assets/churchyard-margin.svg");
    expect(church).not.toContain("garden-margin");
    expect(garden).toContain("assets/garden-margin.svg");
    expect(garden).not.toMatch(/gate-lantern|churchyard-margin/);
    // Each is the first row of the header, and nothing else: the one rule that holds the drawing is `header.app::before`.
    for (const [file, name] of [[CHURCH, "gate-lantern"], [CHURCH, "churchyard-margin"], [GARDEN, "garden-margin"]] as const) {
      const holders = rulesOf(readText(file)).filter((r) => r.body.includes(`${name}.svg`));
      expect(holders.map((r) => r.selector), name).toEqual(["header.app::before"]);
    }
    expect(notes).toContain("header.app::before");
  });

  it("says what moves: the mist is a soft gradient in a layer of its own, and no file moves", () => {
    for (const [file, drift] of [[CHURCH, "fold-drift"], [GARDEN, "bed-drift"]] as const) {
      const mist = rulesFor(file, "header.app .mist");
      expect(mist.length, file).toBeGreaterThan(0);
      const body = mist.map((r) => r.body).join(";");
      expect(body, `${file}: the mist holds no drawing`).not.toContain("url(");
      expect(body, `${file}: the mist is a gradient`).toMatch(/gradient\(/);
      expect(declOf(body, "animation"), file).toContain(drift);
    }
    expect(notes).toMatch(/\.mist/);
    expect(notes).toMatch(/reduced motion/);
    expect(notes).toMatch(/high contrast/);
  });

  it("says what is left out in high contrast, as the stylesheets do", () => {
    // The garden band is plain white in high contrast, and carries no art. The churchyard band keeps its art.
    expect(declOf(rulesFor(GARDEN, 'html[data-contrast="high"] header.app::before')[0]?.body ?? "", "background")).toBe("#ffffff");
    expect(rulesFor(CHURCH, 'html[data-contrast="high"] header.app::before').length).toBe(0);
    expect(notes).toMatch(/garden[^\n]*high contrast[^\n]*(white|no art|plain)/i);
  });
});

// ---- The header (L7.1, L7.2) -----------------------------------------------------------------------------------

describe("the header: row 1 is the art, row 2 holds the brand and the menu (L7.1)", () => {
  const both = [[CHURCH, "fold-drift"], [GARDEN, "bed-drift"]] as const;

  it.each(both)("%s makes the header a grid of the art row and the rows under it", (file) => {
    expect(lastDecl([file], "header.app", "display")).toBe("grid");
    expect(lastDecl([file], "header.app", "grid-template-columns")).toBe("minmax(0, 1fr) auto");
    expect(lastDecl([file], "header.app", "grid-template-rows")).toBe("var(--band) auto auto");
    expect(lastDecl([file], "header.app::before", "grid-row")).toBe("1");
    expect(lastDecl([file], "header.app::before", "grid-column")).toBe("1 / -1");
    expect(lastDecl([file], "header.app::before", "height")).toBe("var(--band)");
    expect(lastDecl([file], "header.app::before", "border-bottom"), "no line under the art").toBeUndefined();
  });

  it.each(both)("%s puts the brand and the menu in row 2, side by side, and wraps the menu under the brand on a phone", (file) => {
    expect(lastDecl([file], "header.app .brand", "grid-row")).toBe("2");
    expect(lastDecl([file], "header.app .brand", "grid-column")).toBe("1");
    expect(lastDecl([file], "header.app nav", "grid-row")).toBe("2");
    expect(lastDecl([file], "header.app nav", "grid-column")).toBe("2");
    expect(lastDecl([file], "header.app .brand", "grid-column", PHONE)).toBe("1 / -1");
    expect(lastDecl([file], "header.app nav", "grid-row", PHONE)).toBe("3");
    expect(lastDecl([file], "header.app nav", "grid-column", PHONE)).toBe("1 / -1");
  });

  it.each(both)("%s makes the menu underlined links with no box, 44 high and 12 apart", (file) => {
    expect(lastDecl([file], "header.app nav .button", "background")).toBe("transparent");
    expect(lastDecl([file], "header.app nav .button", "border-color")).toBe("transparent");
    expect(lastDecl([file], "header.app nav .button", "color")).toBe("inherit");
    expect(lastDecl([file], "header.app nav .button", "text-decoration")).toBe("underline");
    expect(lastDecl([file], "header.app nav .button", "text-decoration-thickness")).toBe("1.5px");
    expect(lastDecl([file], "header.app nav .button", "text-underline-offset")).toBe("5px");
    expect(lastDecl([REGISTER], ".actions", "gap")).toBe("12px");
    expect(lastDecl([REGISTER], "a", "min-height") ?? lastDecl([REGISTER], ".button", "min-height")).toMatch(/44px|var\(--control-h\)/);
  });

  it.each(both)("%s gives a pressed menu link a fill of its own, so no light fill stands under light text", (file) => {
    expect(declOf(rulesFor(file, "header.app nav .button:active:not(:disabled)")[0]?.body ?? "", "background")).toBeDefined();
    expect(declOf(rulesFor(file, "header.app nav .button:hover:not(:disabled)")[0]?.body ?? "", "background")).toBeDefined();
  });
});

describe("the churchyard header (L7.1, L7.2)", () => {
  it("draws the lantern once at the right and the margin sideways on the sky, in the band's height", () => {
    const bg = lastDecl([CHURCH], "header.app::before", "background") ?? "";
    expect(bg).toBe(
      'url("../../../assets/gate-lantern.svg") no-repeat right 16px bottom / auto 100%, url("../../../assets/churchyard-margin.svg") repeat-x left bottom / auto 100%, var(--sky)',
    );
  });

  it("puts row 2 on the plain sky, with the brand in ivory heading type and no line under it", () => {
    expect(lastDecl([CHURCH], "header.app", "background")).toBe("var(--sky)");
    expect(lastDecl([CHURCH], "header.app", "color")).toBe("var(--sky-ink)");
    expect(lastDecl([CHURCH], "header.app", "border-bottom")).toBe("0");
    expect(lastDecl([REGISTER, CHURCH], "header.app .brand", "font-size")).toBe("22px");
    expect(lastDecl([REGISTER, CHURCH], "header.app .brand", "min-height")).toBe("52px");
    expect(lastDecl([REGISTER], "header.app .brand", "font-family")).toBe("var(--font-heading)");
  });

  it("keeps the mist as a soft gradient that drifts in its own layer, and keeps the drawing still", () => {
    const mist = lastDecl([CHURCH], "header.app .mist", "background") ?? "";
    expect(mist).toMatch(/radial-gradient|linear-gradient/);
    expect(mist).not.toContain("url(");
    expect(lastDecl([CHURCH], "header.app .mist", "animation")).toBe("fold-drift 160s linear infinite");
    expect(lastDecl([CHURCH], "header.app .mist", "height")).toBe("var(--band)");
  });

  it("measures the mist at 3 parts in 100 to 25 in 100 of ivory, so it stays a haze and never a shape", () => {
    const alphas = [...(lastDecl([CHURCH], "header.app .mist", "background") ?? "").matchAll(/rgba\(\s*250\s*,\s*245\s*,\s*233\s*,\s*(0?\.\d+)\s*\)/g)].map((m) => Number(m[1]));
    expect(alphas.length).toBeGreaterThan(0);
    for (const a of alphas) {
      if (a > 0) {
        expect(a).toBeGreaterThanOrEqual(0.03);
        expect(a).toBeLessThanOrEqual(0.25);
      }
    }
  });
});

describe("the allotment header (L7.1, L7.2)", () => {
  it("draws the margin sideways on the daylight band, in the band's height", () => {
    expect(lastDecl([GARDEN], "header.app::before", "background")).toBe('url("../../../assets/garden-margin.svg") repeat-x left bottom / auto 100%, var(--sky)');
  });

  it("puts row 2 on the paper with a 1 px ink line under it, and the brand in leaf green, 22 px bold", () => {
    expect(lastDecl([GARDEN], "header.app", "background")).toBe("var(--paper)");
    expect(lastDecl([GARDEN], "header.app", "border-bottom")).toBe("1px solid var(--ink)");
    expect(lastDecl([GARDEN], "header.app .brand", "color")).toBe("var(--leaf)");
    expect(lastDecl([REGISTER, GARDEN], "header.app .brand", "font-size")).toBe("22px");
    expect(lastDecl([GARDEN], "header.app .brand", "font-weight")).toBe("700");
    expect(lastDecl([GARDEN], "header.app .brand", "min-height")).toBe("56px");
  });

  it("keeps the mist a pale soft gradient in its own layer, and keeps the drawing still", () => {
    const mist = lastDecl([GARDEN], "header.app .mist", "background") ?? "";
    expect(mist).toMatch(/radial-gradient|linear-gradient/);
    expect(mist).not.toContain("url(");
    expect(lastDecl([GARDEN], "header.app .mist", "animation")).toBe("bed-drift 240s linear infinite");
  });
});

describe("every pair of the header reaches its floor (L1.2, L7.1)", () => {
  it("measures the churchyard brand and menu in ivory on the sky, and the allotment brand in leaf on its paper", () => {
    const church = [REGISTER, CHURCH];
    const garden = [REGISTER, GARDEN];
    expect(contrast(colourOf(church, false, "--sky-ink"), colourOf(church, false, "--sky"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colourOf(garden, false, "--leaf"), colourOf(garden, false, "--paper"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colourOf(garden, false, "--ink"), colourOf(garden, false, "--paper"))).toBeGreaterThanOrEqual(4.5);
    // The pressed menu link: ivory on the sky with the ivory veil on it. The veil is a fifth of the ivory, over the sky.
    const sky = colourOf(church, false, "--sky");
    const mixed = (veil: number): string => {
      const ivory = [0xfa, 0xf5, 0xe9];
      const base = [1, 3, 5].map((i) => parseInt(sky.slice(i, i + 2), 16));
      return `#${base.map((b, i) => Math.round(b + ((ivory[i] as number) - b) * veil).toString(16).padStart(2, "0")).join("")}`;
    };
    expect(contrast(colourOf(church, false, "--sky-ink"), mixed(0.24))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colourOf(church, false, "--sky-ink"), mixed(0.16))).toBeGreaterThanOrEqual(4.5);
  });
});

// ---- The desk in three columns, the night ground and the index (L7.4, L7.6, L7.7) ----------------------------------

describe("the desk in three columns (L7.4)", () => {
  it("gives the three columns their flex weights and bases, and lets them wrap in order", () => {
    expect(lastDecl([REGISTER], ".desk", "display")).toBe("flex");
    expect(lastDecl([REGISTER], ".desk", "flex-wrap")).toBe("wrap");
    expect(lastDecl([REGISTER], ".desk", "gap")).toBe("clamp(24px, 2.2vw, 32px)");
    expect(lastDecl([REGISTER], ".desk-find", "flex")).toBe("25 1 340px");
    expect(lastDecl([REGISTER], ".desk-main", "flex")).toBe("40 1 520px");
    expect(lastDecl([REGISTER], ".desk-index", "flex")).toBe("16 1 220px");
    expect(lastDecl([REGISTER], ".desk > *", "min-width")).toBe("0");
  });

  it("makes main 105rem on a desk, with the side padding of the design, and keeps 72rem for other screens", () => {
    expect(lastDecl([REGISTER], "main", "max-width")).toBe("72rem");
    expect(lastDecl([REGISTER], "main:has(.desk)", "max-width")).toBe("105rem");
    expect(lastDecl([REGISTER], "main", "padding")).toBe("16px clamp(16px, 2.8vw, 40px) 32px");
  });

  it("leaves no grid of the old desk in either theme", () => {
    for (const file of [CHURCH, GARDEN]) {
      expect(rulesFor(file, ".desk").length, file).toBe(0);
      expect(rulesFor(file, ".garden-desk").length, file).toBe(0);
    }
  });
});

describe("the index column and the ring on the night (L7.4, L3.2)", () => {
  it("takes the amber ring on the sky, and on the night ground outside high contrast, and nowhere else", () => {
    const selectors = rulesOf(readText(CHURCH)).filter((r) => declOf(r.body, "outline-color") !== undefined);
    expect(selectors.map((r) => r.selector).sort()).toEqual(['header.app :focus-visible', 'html:not([data-contrast="high"]) .on-ground :focus-visible']);
    for (const rule of selectors) expect(declOf(rule.body, "outline-color")).toBe("var(--focus-on-dark)");
    // The garden theme never sets a ring colour: its ground is light.
    expect(rulesOf(readText(GARDEN)).filter((r) => declOf(r.body, "outline-color") !== undefined)).toEqual([]);
  });

  it("measures the amber ring at 3 to 1 on the sky and on the night, and the pressed index row text at 4.5 to 1", () => {
    const files = [REGISTER, CHURCH];
    const ring = colourOf(files, false, "--focus-on-dark");
    expect(contrast(ring, colourOf(files, false, "--sky"))).toBeGreaterThanOrEqual(3);
    expect(contrast(ring, colourOf(files, false, "--ground"))).toBeGreaterThanOrEqual(3);
    // An index row is a veil of ivory over the night: 24 percent when pressed.
    const sky = colourOf(files, false, "--sky");
    const veil = [1, 3, 5].map((i, k) => Math.round(parseInt(sky.slice(i, i + 2), 16) + (([0xfa, 0xf5, 0xe9][k] as number) - parseInt(sky.slice(i, i + 2), 16)) * 0.24));
    const pressed = `#${veil.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    expect(contrast(colourOf(files, false, "--sky-ink"), pressed)).toBeGreaterThanOrEqual(4.5);
  });

  it("draws the index rows on the night in the ivory veil and the sky line, outside high contrast only", () => {
    const row = 'html:not([data-contrast="high"]) .on-ground .link-group li > .button:not(.primary):not(.quiet)';
    expect(lastDecl([CHURCH], row, "border-color")).toBe("var(--sky-line)");
    expect(lastDecl([CHURCH], row, "background")).toBe("rgba(250, 245, 233, 0.06)");
    expect(lastDecl([CHURCH], row, "color")).toBe("var(--sky-ink)");
  });
});

describe("the allotment desk card (L7.4)", () => {
  it("sets the swatch at 46 by 34 in the tab colour, the code at 34 px 700, the name at 24 px 700, and Make an offer 52 high", () => {
    expect(lastDecl([GARDEN], ".bed-swatch", "width")).toBe("46px");
    expect(lastDecl([GARDEN], ".bed-swatch", "height")).toBe("34px");
    expect(lastDecl([GARDEN], ".bed-swatch", "background")).toBe("var(--tab)");
    expect(lastDecl([GARDEN], ".big.code", "font-size")).toBe("34px");
    expect(lastDecl([GARDEN], ".big", "font-size")).toBe("24px");
    expect(lastDecl([GARDEN], ".big", "font-weight")).toBe("700");
    expect(lastDecl([GARDEN], ".main-action .button", "width")).toBe("100%");
    expect(lastDecl([GARDEN], ".main-action .button", "min-height")).toBe("52px");
  });
});