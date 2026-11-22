// The art and the look of the Churchyard Register (spec 03, task 3.12, C10). The three drawings are original
// SVG made for this project. Decoration holds no text, no script and no address outside the file, and the
// stylesheet keeps it in the margin: it never sets a control or a word on a picture.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const SVGS = ["gate-lantern", "churchyard-margin", "plot-symbols"] as const;

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

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe.each(SVGS)("assets/%s.svg", (name) => {
  const svg = read(`assets/${name}.svg`);

  it("is a small, closed drawing with a view box", () => {
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(balanced(svg)).toBe(true);
    const box = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    expect(box).not.toBeNull();
    expect(Number(box?.[1])).toBeGreaterThanOrEqual(24);
    expect(svg.length).toBeGreaterThan(400);
    expect(svg.length).toBeLessThan(9000);
  });

  it("has no text, script, picture or address outside the file", () => {
    const body = svg.replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "");
    for (const forbidden of ["<text", "<script", "<image", "<foreignObject", "<style", "http:", "https:", "@import", "data:", "href=\"http", "onload"]) {
      expect(body, forbidden).not.toContain(forbidden);
    }
  });

  it("holds no dash between words in a title and no raster", () => {
    expect(svg).not.toMatch(/base64/);
  });
});

describe("assets/plot-symbols.svg", () => {
  const svg = read("assets/plot-symbols.svg");
  it("draws the five marks of the map key as symbols", () => {
    for (const id of ["symbol-free", "symbol-reserved", "symbol-taken", "symbol-unusable", "symbol-checking"]) {
      expect(svg).toContain(`<symbol id="${id}"`);
    }
  });
  it("gives each mark a title for a screen reader", () => {
    for (const word of ["Free", "Reserved", "Taken", "Unusable", "Needs checking"]) expect(svg).toContain(`<title>${word}</title>`);
  });
});

describe("assets/origins.md", () => {
  const text = read("assets/origins.md");
  it("says the art was drawn for this project and names each file", () => {
    expect(text).toContain("drawn for this project");
    for (const name of SVGS) expect(text).toContain(`${name}.svg`);
    expect(text).toMatch(/no (stock|real)/i);
  });
});

describe("the churchyard look (theme.css)", () => {
  const css = read("apps/churchyard-register/src/theme.css");
  it("uses the two inks of the plan and a dark indigo sky", () => {
    for (const hex of ["#22252C", "#FAF5E9", "#232A5C"]) expect(css.toLowerCase()).toContain(hex.toLowerCase());
    expect(contrast("#22252C", "#FAF5E9")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#FAF5E9", "#232A5C")).toBeGreaterThanOrEqual(4.5);
  });

  it("brings in the lantern and the mist from the art folder only", () => {
    expect(css).toContain("assets/gate-lantern.svg");
    expect(css).toContain("assets/churchyard-margin.svg");
    expect(css).not.toMatch(/url\(\s*["']?https?:/);
  });

  it("never fixes or sticks anything over the page", () => {
    expect(css).not.toMatch(/position\s*:\s*(fixed|sticky)/);
  });

  it("moves the mist with one animation that the shared motion rules can stop", () => {
    expect(css).toMatch(/@keyframes\s+fold-drift/);
    expect(css).toMatch(/\.mist[^{]*\{[^}]*animation\s*:\s*fold-drift/);
    expect(css).not.toMatch(/\.mist[^{]*\{[^}]*display\s*:\s*(block|flex|inline|grid)/);
    expect(css).toMatch(/header\.app::before/);
  });

  it("puts the sky band in its own row, so no word or control sits on a picture", () => {
    expect(css).toMatch(/header\.app\s*\{[^}]*display\s*:\s*grid/);
    expect(css).toMatch(/\.brand[^{]*\{[^}]*grid-row\s*:\s*2/);
  });

  it("draws the headstones as arches and the walks as gravel", () => {
    expect(css).toContain(".sheet .arch-inner");
    expect(css).toContain(".sheet .path-line");
    expect(css).toMatch(/\.sheet \.path\s*\{[^}]*stroke-width\s*:\s*1[2-9]/);
  });
});
