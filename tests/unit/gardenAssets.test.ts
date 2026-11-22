// The art and the look of the Allotment Register (spec 04, task 4.15, A11). The margin art is one original
// SVG made for this project. Decoration holds no text, no script and no address outside the file, and the
// stylesheet keeps it in the margin: it never sets a control or a word on a picture. The garden is its own
// place: no indigo strip, no lantern, no arches, no mist.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");

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

describe("assets/garden-margin.svg", () => {
  const svg = read("assets/garden-margin.svg");

  it("is a small, closed drawing with a view box that tiles sideways", () => {
    expect(svg.startsWith("<svg ")).toBe(true);
    expect(balanced(svg)).toBe(true);
    const box = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
    expect(box).not.toBeNull();
    expect(Number(box?.[1])).toBe(1200);
    expect(Number(box?.[2])).toBeLessThanOrEqual(72);
    expect(svg.length).toBeGreaterThan(400);
    expect(svg.length).toBeLessThan(9000);
  });

  it("has no text, script, picture or address outside the file", () => {
    const body = svg.replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, "");
    for (const forbidden of ["<text", "<script", "<image", "<foreignObject", "<style", "http:", "https:", "@import", "data:", 'href="http', "onload", "base64"]) {
      expect(body, forbidden).not.toContain(forbidden);
    }
  });

  it("draws furrows, seedlings, a shed and a gate, and is hidden from a screen reader", () => {
    for (const part of ['id="ridge"', 'id="sprout"', "<title>"]) expect(svg).toContain(part);
    expect(svg).toContain('aria-hidden="true"');
    expect(svg.match(/<use /g)?.length).toBeGreaterThanOrEqual(10);
  });

  it("does not reuse the churchyard art or its colours", () => {
    for (const hex of ["#232A5C", "#171C45", "#F2C96B"]) expect(svg.toUpperCase()).not.toContain(hex);
  });
});

describe("assets/origins.md", () => {
  const text = read("assets/origins.md");
  it("says the garden art was drawn for this project and names the file", () => {
    expect(text).toContain("garden-margin.svg");
    expect(text).toContain("drawn for this project");
    expect(text).toMatch(/no (stock|real)/i);
  });
  it("says where the garden art is used and that it never sits under a word or a control", () => {
    expect(text).toMatch(/Allotment Register/);
    expect(text).toMatch(/never sits (over|under)|in the margin only/i);
  });
});

describe("the garden look (theme.css)", () => {
  const css = read("apps/allotment-register/src/theme.css");

  it("uses the garden ink on its paper, with a daylight band and a leaf green, all readable", () => {
    for (const hex of ["#1B312A", "#F7F5E8", "#CFE7DF", "#2F6B4F"]) expect(css.toLowerCase()).toContain(hex.toLowerCase());
    expect(contrast("#1B312A", "#F7F5E8")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#1B312A", "#CFE7DF")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#F7F5E8", "#2F6B4F")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#1B312A", "#EFE6CC")).toBeGreaterThanOrEqual(4.5);
  });

  it("is not the churchyard: no indigo strip, no lantern, no mist art, no arches, no serif headings", () => {
    expect(css.toLowerCase()).not.toContain("#232a5c");
    for (const word of ["gate-lantern", "churchyard-margin", "arch-inner", "fold-drift", "Georgia"]) expect(css).not.toContain(word);
  });

  it("brings in the garden art from the art folder only", () => {
    expect(css).toContain("assets/garden-margin.svg");
    expect(css).not.toMatch(/url\(\s*["']?https?:/);
    expect(css).not.toMatch(/url\(\s*["']?data:/);
  });

  it("never fixes or sticks anything over the page", () => {
    expect(css).not.toMatch(/position\s*:\s*(fixed|sticky)/);
  });

  it("moves the art with one animation that the shared motion rules can stop, and stops it for the app setting too", () => {
    expect(css).toMatch(/@keyframes\s+bed-drift/);
    expect(css).toMatch(/\.mist[^{]*\{[^}]*animation\s*:\s*bed-drift/);
    expect(css).not.toMatch(/\.mist[^{]*\{[^}]*display\s*:\s*(block|flex|inline|grid)/);
    expect(css).toMatch(/html\[data-motion="reduce"\][^{]*\.mist[^{]*\{[^}]*animation\s*:\s*none/);
    expect(css).toMatch(/prefers-reduced-motion/);
  });

  it("puts the daylight band in its own row, so no word or control sits on a picture", () => {
    expect(css).toMatch(/header\.app\s*\{[^}]*display\s*:\s*grid/);
    expect(css).toMatch(/header\.app::before/);
    expect(css).toMatch(/\.brand[^{]*\{[^}]*grid-row\s*:\s*2/);
  });

  it("draws beds with a strip of hatching and a square peg, and grass walks with a dotted line", () => {
    expect(css).toContain(".sheet .hatch");
    expect(css).toContain(".sheet .peg");
    expect(css).toContain(".sheet .bed");
    expect(css).toMatch(/\.sheet \.path\s*\{[^}]*stroke-width\s*:\s*1[2-9]/);
    expect(css).toContain(".sheet .path-line");
  });

  it("removes the decoration in high contrast", () => {
    expect(css).toMatch(/html\[data-contrast="high"\]/);
  });
});
