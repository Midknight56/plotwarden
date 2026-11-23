// The design values of the new look and their contrast (spec 07, task 7.2, L1). The test reads the stylesheets, takes
// the custom properties they declare in the order the browser applies them, and measures each pair that the design
// lists: normal text at 4.5 to 1, large text, control edges and focus rings at 3 to 1. The floors are the contract,
// not the output of the code. The ratio uses the WCAG 2.1 formula on the declared hex values.
//
// A pair names a text colour (or an edge, or a ring) and what it stands on. Names with two dashes are custom
// properties and are resolved in the scope of the pair. A hex is a literal.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lastDecl } from "../helpers/cssRules";

const ROOT = join(__dirname, "..", "..");
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");

// ---- A small reader for the custom properties of a stylesheet ---------------------------------------------------

interface Block {
  selector: string;
  body: string;
}

/** The rule blocks at the top level of a stylesheet. At rules (media, keyframes, font-face) are left out. */
function topBlocks(css: string): Block[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: Block[] = [];
  let depth = 0;
  let selector = "";
  let body = "";
  for (const ch of text) {
    if (ch === "{") {
      depth += 1;
      if (depth > 1) body += ch;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        if (!selector.trim().startsWith("@")) blocks.push({ selector: selector.trim().replace(/\s+/g, " "), body });
        selector = "";
        body = "";
      } else body += ch;
      continue;
    }
    if (depth === 0) {
      // A statement with no block (an @import) ends at its semicolon and is not part of the next selector.
      if (ch === ";") selector = "";
      else selector += ch;
    } else body += ch;
  }
  return blocks;
}

function declarations(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of body.split(";")) {
    const at = part.indexOf(":");
    if (at === -1) continue;
    const name = part.slice(0, at).trim();
    if (name.startsWith("--")) map.set(name, part.slice(at + 1).trim());
  }
  return map;
}

type Layer = "root" | "high";
const SELECTORS: Record<Layer, string> = { root: ":root", high: 'html[data-contrast="high"]' };

/** Custom properties of a layer, from the files in the order that they load. A later file wins. */
function layerOf(files: readonly string[], layer: Layer): Map<string, string> {
  const out = new Map<string, string>();
  for (const file of files) {
    for (const block of topBlocks(read(file))) {
      if (block.selector === SELECTORS[layer]) for (const [k, v] of declarations(block.body)) out.set(k, v);
    }
  }
  return out;
}

/** The value of a custom property after every `var()` is replaced. `high` puts the high contrast layer on top. */
function valueOf(files: readonly string[], high: boolean, name: string): string {
  const root = layerOf(files, "root");
  const top = layerOf(files, "high");
  const lookup = (n: string, seen: readonly string[]): string => {
    if (seen.includes(n)) throw new Error(`${n} refers to itself`);
    const raw = (high ? top.get(n) : undefined) ?? root.get(n);
    if (raw === undefined) throw new Error(`${n} is not declared in ${files.join(", ")}${high ? " (high contrast)" : ""}`);
    return raw.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, (_m, inner: string) => lookup(inner, [...seen, n]));
  };
  return lookup(name, []);
}

// ---- Contrast -----------------------------------------------------------------------------------------------------

function luminance(hex: string): number {
  const full = /^#([0-9a-f]{3})$/i.test(hex) ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
  const channel = (i: number): number => {
    const v = parseInt(full.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const REGISTER = "template/src/ui/register.css";
const CHURCH_THEME = "apps/churchyard-register/src/theme.css";
const GARDEN_THEME = "apps/allotment-register/src/theme.css";
const SITE = "site/src/site.css";

const SCOPES = {
  plain: [REGISTER],
  church: [REGISTER, CHURCH_THEME],
  garden: [REGISTER, GARDEN_THEME],
  site: [SITE],
} as const;
type Scope = keyof typeof SCOPES;

/** A colour as the pair names it: a custom property of the scope, or a hex. */
function colour(scope: Scope, high: boolean, ref: string): string {
  const value = ref.startsWith("--") ? valueOf(SCOPES[scope], high, ref) : ref;
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) throw new Error(`${ref} in ${scope}${high ? " (high)" : ""} is "${value}", not a hex`);
  return value;
}

type Floor = 3 | 4.5;
/** [what it is, text or edge or ring colour, what it stands on, floor] */
type Pair = readonly [string, string, string, Floor];

// The shared values, as they read in register.css with no theme. These are the pairs of the design's shared list.
const SHARED: readonly Pair[] = [
  ["ink on paper", "--ink", "--paper", 4.5],
  ["ink on field", "--ink", "--field", 4.5],
  ["ink on soft", "--ink", "--soft", 4.5],
  ["muted on paper", "--muted", "--paper", 4.5],
  ["muted on field", "--muted", "--field", 4.5],
  ["muted on soft", "--muted", "--soft", 4.5],
  ["error on paper", "--error", "--paper", 4.5],
  ["error on field", "--error", "--field", 4.5],
  ["error on bad", "--error", "--bad", 4.5],
  ["ink on bad", "--ink", "--bad", 4.5],
  ["ink on good", "--ink", "--good", 4.5],
  ["ok mark on good", "--ok", "--good", 3],
  ["ok mark on field", "--ok", "--field", 3],
  ["control edge, ink on paper", "--ink", "--paper", 3],
  ["focus ring on paper", "--focus", "--paper", 3],
  ["focus ring on field", "--focus", "--field", 3],
  ["focus ring on soft", "--focus", "--soft", 3],
  ["main action text on its fill", "--action-ink", "--action", 4.5],
  ["main action edge on paper", "--action-edge", "--paper", 3],
  ["text on the page ground", "--on-ground", "--ground", 4.5],
];

// Text that stands on a light page ground with no sheet under it. An app whose page ground is light (no theme, the
// allotment) sets its ink, its second ink and its error text straight on the ground. The churchyard ground is the
// night, so only the ground's own text colours stand on it (CHURCH_GROUND), and these three never do.
const ON_LIGHT_GROUND: readonly Pair[] = [
  ["ink on the page ground", "--ink", "--ground", 4.5],
  ["muted on the page ground", "--muted", "--ground", 4.5],
  ["error on the page ground", "--error", "--ground", 4.5],
];

// What may stand on the churchyard night ground with no sheet under it, and nothing else (L7.6): the ground's ivory
// text, its second text, the main action fill and the index row edge as marks, and the ring that is drawn on it.
const CHURCH_GROUND: readonly Pair[] = [
  ["ground text on the night ground", "--on-ground", "--ground", 4.5],
  ["second text on the night ground", "--sky-muted", "--ground", 4.5],
  ["index row edge on the night ground", "--sky-line", "--ground", 3],
  ["ring on the night ground", "--focus-on-dark", "--ground", 3],
  ["outlined button edge on the night ground", "--on-ground", "--ground", 3],
];

const CHURCH: readonly Pair[] = [
  // The night ground, from the design's churchyard list.
  ["ivory text on the night ground", "--sky-ink", "--sky", 4.5],
  ["second text on the night ground", "--sky-muted", "--sky", 4.5],
  ["index row edge on the night ground", "--sky-line", "--sky", 3],
  ["main action fill on the night ground", "--action", "--sky", 3],
  ["focus ring on the night ground", "--focus-on-dark", "--sky", 3],
  ["ivory text on the night ground (literal)", "#faf5e9", "#232a5c", 4.5],
  ["amber ring on the night ground (literal)", "#ffd27a", "#232a5c", 3],
  // Sheets and the main action.
  ["main action text on its fill", "--action-ink", "--action", 4.5],
  ["main action text on hover", "--action-ink", "--action-hover", 4.5],
  ["main action text on pressed", "--action-ink", "--action-pressed", 4.5],
  ["main action edge on paper", "--action-edge", "--paper", 3],
  ["main action edge on its fill", "--action-edge", "--action", 3],
  ["ink on stone", "--ink", "--stone", 4.5],
  ["muted on stone", "--muted", "--stone", 4.5],
  ["error on stone", "--error", "--stone", 4.5],
  ["ink on gravel", "--ink", "--gravel", 4.5],
  ["dashed edge on stone", "--soft-line", "--stone", 3],
  ["dashed edge on paper", "--soft-line", "--paper", 3],
  ["focus ring on stone", "--focus", "--stone", 3],
  ["focus ring on paper", "--focus", "--paper", 3],
  // The map grounds.
  ["ink on lawn", "--ink", "--row-ground", 4.5],
  ["ink on turf", "--ink", "--turf", 4.5],
  ["ink on stone base", "--ink", "--stone-base", 4.5],
  // The chosen plot and its tab.
  ["ink on the chosen plot", "--ink", "--tab", 4.5],
];

const GARDEN: readonly Pair[] = [
  ["ink on paper", "--ink", "--paper", 4.5],
  ["ink on stone", "--ink", "--stone", 4.5],
  ["ink on soft", "--ink", "--soft", 4.5],
  ["muted on paper", "--muted", "--paper", 4.5],
  ["muted on stone", "--muted", "--stone", 4.5],
  ["muted on soft", "--muted", "--soft", 4.5],
  ["white on leaf", "--action-ink", "--leaf", 4.5],
  ["white on the main action", "--action-ink", "--action", 4.5],
  ["white on main action hover", "--action-ink", "--action-hover", 4.5],
  ["white on main action pressed", "--action-ink", "--action-pressed", 4.5],
  ["leaf heading on paper", "--leaf", "--paper", 4.5],
  ["leaf heading on stone", "--leaf", "--stone", 4.5],
  ["main action edge on paper", "--action-edge", "--paper", 3],
  ["index row edge on paper", "--soft-line", "--paper", 3],
  ["index row edge on stone", "--soft-line", "--stone", 3],
  ["ink on the next plot", "--ink", "--tab", 4.5],
  ["ink on soil", "--ink", "--soil", 4.5],
  ["ink on bed soil", "--ink", "--bedfill", 4.5],
  ["ink on grass in a section", "--ink", "--row-ground", 4.5],
  ["ink on grass walk", "--ink", "--grass", 4.5],
  ["ink on the band", "--ink", "--sky", 4.5],
  ["focus ring on paper", "--focus", "--paper", 3],
  ["focus ring on soil", "--focus", "--soil", 3],
  ["focus ring on stone", "--focus", "--stone", 3],
  ["error on stone", "--error", "--stone", 4.5],
  ["error on bad", "--error", "--bad", 4.5],
  ["ink on bad", "--ink", "--bad", 4.5],
  ["ink on good", "--ink", "--good", 4.5],
  ["ok mark on good", "--ok", "--good", 3],
];

// High contrast: paper white, ink black, ring dark blue. The same floors.
const HIGH: readonly Pair[] = [
  ["ink on paper", "--ink", "--paper", 4.5],
  ["ink on field", "--ink", "--field", 4.5],
  ["muted on paper", "--muted", "--paper", 4.5],
  ["ink on gravel or soft", "--ink", "--soft", 4.5],
  ["error on paper", "--error", "--paper", 4.5],
  ["focus ring on paper", "--focus", "--paper", 3],
  ["main action text on its fill", "--action-ink", "--action", 4.5],
  ["main action edge on paper", "--action-edge", "--paper", 3],
  ["text on the page ground", "--on-ground", "--ground", 4.5],
  ["ink on the page ground", "--ink", "--ground", 4.5],
  ["ok mark on good", "--ok", "--good", 3],
];

const CHURCH_HIGH: readonly Pair[] = [
  ...HIGH,
  ["ink on gravel", "--ink", "--gravel", 4.5],
  ["ink on stone", "--ink", "--stone", 4.5],
  ["ink on the chosen plot", "--ink", "--tab", 4.5],
];

const GARDEN_HIGH: readonly Pair[] = [
  ...HIGH,
  ["leaf heading on paper", "--leaf", "--paper", 4.5],
  ["ink on grass walk", "--ink", "--grass", 4.5],
  ["ink on soil", "--ink", "--soil", 4.5],
  ["ink on bed soil", "--ink", "--bedfill", 4.5],
  ["ink on the next plot", "--ink", "--tab", 4.5],
  ["ink on the band", "--ink", "--sky", 4.5],
];

const SITE_PAIRS: readonly Pair[] = [
  ["ink on paper", "--ink", "--paper", 4.5],
  ["ink on field", "--ink", "--field", 4.5],
  ["muted on paper", "--muted", "--paper", 4.5],
  ["button text on ink", "--paper", "--ink", 4.5],
  ["focus ring on paper", "--focus", "--paper", 3],
  ["focus ring on field", "--focus", "--field", 3],
  ["leaf edge on field", "--leaf", "--field", 3],
  ["sky edge on field", "--sky", "--field", 3],
];

function measure(scope: Scope, high: boolean, pairs: readonly Pair[]): string[] {
  const failures: string[] = [];
  for (const [label, fg, bg, floor] of pairs) {
    const a = colour(scope, high, fg);
    const b = colour(scope, high, bg);
    const ratio = contrast(a, b);
    if (ratio < floor) failures.push(`${label}: ${fg} ${a} on ${bg} ${b} is ${ratio.toFixed(2)}, needs ${floor}`);
  }
  return failures;
}

describe("the contrast of the shared values (register.css, no theme)", () => {
  it("meets 4.5 to 1 for text and 3 to 1 for edges and rings", () => {
    expect(measure("plain", false, [...SHARED, ...ON_LIGHT_GROUND])).toEqual([]);
  });
  it("meets the same floors in high contrast", () => {
    expect(measure("plain", true, HIGH)).toEqual([]);
  });
});

describe("the contrast of the churchyard values", () => {
  it("meets 4.5 to 1 for text and 3 to 1 for edges and rings, on the night ground and on sheets", () => {
    expect(measure("church", false, [...SHARED, ...CHURCH, ...CHURCH_GROUND])).toEqual([]);
  });
  it("meets the same floors in high contrast", () => {
    expect(measure("church", true, CHURCH_HIGH)).toEqual([]);
  });
});

describe("the contrast of the allotment values", () => {
  it("meets 4.5 to 1 for text and 3 to 1 for edges and rings", () => {
    expect(measure("garden", false, [...SHARED, ...ON_LIGHT_GROUND, ...GARDEN])).toEqual([]);
  });
  it("meets the same floors in high contrast", () => {
    expect(measure("garden", true, GARDEN_HIGH)).toEqual([]);
  });
});

describe("the contrast of the start page values (site.css)", () => {
  it("meets 4.5 to 1 for text and 3 to 1 for edges and rings", () => {
    expect(measure("site", false, SITE_PAIRS)).toEqual([]);
  });
});

// ---- The hexes the older tests and the design name --------------------------------------------------------------------

describe("the hexes that the design names", () => {
  it("has the churchyard ink, paper and night as declared values", () => {
    expect(valueOf(SCOPES.church, false, "--ink").toLowerCase()).toBe("#22252c");
    expect(valueOf(SCOPES.church, false, "--paper").toLowerCase()).toBe("#faf5e9");
    expect(valueOf(SCOPES.church, false, "--sky").toLowerCase()).toBe("#232a5c");
    expect(valueOf(SCOPES.church, false, "--sky-ink").toLowerCase()).toBe("#faf5e9");
    expect(valueOf(SCOPES.church, false, "--tab").toLowerCase()).toBe("#f2c96b");
    expect(valueOf(SCOPES.church, false, "--sky-muted").toLowerCase()).toBe("#c9cee6");
    expect(valueOf(SCOPES.church, false, "--sky-line").toLowerCase()).toBe("#8e96c4");
    expect(valueOf(SCOPES.church, false, "--focus-on-dark").toLowerCase()).toBe("#ffd27a");
  });

  it("has the allotment ink, paper, band and leaf as declared values, in its own file", () => {
    const own = layerOf([GARDEN_THEME], "root");
    const want: Record<string, string> = { "--ink": "#1b312a", "--paper": "#f7f5e8", "--sky": "#cfe7df", "--leaf": "#2f6b4f" };
    for (const [name, hex] of Object.entries(want)) expect(own.get(name)?.toLowerCase(), name).toBe(hex);
    expect(valueOf(SCOPES.garden, false, "--tab").toLowerCase()).toBe("#bfe0ea");
    expect(valueOf(SCOPES.garden, false, "--bedfill").toLowerCase()).toBe("#e6d6b4");
    expect(valueOf(SCOPES.garden, false, "--soft").toLowerCase()).toBe("#e7eeda");
    expect(valueOf(SCOPES.garden, false, "--action").toLowerCase()).toBe("#2f6b4f");
    expect(valueOf(SCOPES.garden, false, "--action-hover").toLowerCase()).toBe("#1f4f38");
    expect(valueOf(SCOPES.garden, false, "--action-pressed").toLowerCase()).toBe("#173b2a");
  });

  it("keeps Georgia, the arch, the lantern and the churchyard margin out of the allotment theme", () => {
    const css = read(GARDEN_THEME);
    for (const word of ["Georgia", "arch-inner", "gate-lantern", "churchyard-margin"]) expect(css, word).not.toContain(word);
    expect(css.toLowerCase()).not.toContain("#232a5c");
  });

  it("keeps what the older asset tests read in the churchyard theme", () => {
    const css = read(CHURCH_THEME);
    for (const part of [".sheet .arch-inner", ".sheet .path-line", "header.app::before", "fold-drift"]) expect(css, part).toContain(part);
  });
});

describe("the defaults of an app with no theme", () => {
  const value = (name: string, high = false): string => valueOf(SCOPES.plain, high, name).toLowerCase();

  it("gives every new name a default that keeps the look of today", () => {
    expect(value("--ground")).toBe("#faf5e9");
    expect(value("--on-ground")).toBe("#22252c");
    expect(value("--action")).toBe("#22252c");
    expect(value("--action-ink")).toBe("#faf5e9");
    expect(value("--action-edge")).toBe("#22252c");
    expect(value("--ok")).toBe("#1f5b36");
    expect(value("--focus-on-dark")).toBe("#ffd27a");
    expect(value("--rule")).toBe("#d8cdb4");
    expect(value("--radius-control")).toBe("0");
    expect(value("--radius-card")).toBe("0");
    expect(value("--control-h")).toBe("44px");
    expect(value("--field-h")).toBe("44px");
    expect(value("--motion")).toBe("120ms ease-out");
  });

  it("keeps the shared values of the design", () => {
    const want: Record<string, string> = { "--ink": "#22252c", "--paper": "#faf5e9", "--muted": "#4a4d55", "--error": "#8b1a1a", "--focus": "#0b4faf", "--field": "#fffef8", "--soft": "#efe8d6", "--good": "#e2eedd", "--bad": "#f6e3e0" };
    for (const [name, hex] of Object.entries(want)) expect(value(name), name).toBe(hex);
  });

  it("turns the main action to black on white in high contrast, with no night ground", () => {
    expect(value("--ground", true)).toBe("#ffffff");
    expect(value("--action", true)).toBe("#000000");
    expect(value("--action-ink", true)).toBe("#ffffff");
  });
});

describe("what slice 3 turned on (task 7.15 and 7.16)", () => {
  it("stands the churchyard page on the night, with ivory text, and keeps every other app on its paper", () => {
    expect(valueOf(SCOPES.church, false, "--ground").toLowerCase()).toBe("#232a5c");
    expect(valueOf(SCOPES.church, false, "--on-ground").toLowerCase()).toBe("#faf5e9");
    expect(valueOf(SCOPES.plain, false, "--ground").toLowerCase()).toBe("#faf5e9");
    expect(valueOf(SCOPES.garden, false, "--ground").toLowerCase()).toBe("#f7f5e8");
    expect(valueOf(SCOPES.garden, false, "--on-ground").toLowerCase()).toBe("#1b312a");
  });

  it("has no night ground in high contrast: the page is white and its text black", () => {
    expect(valueOf(SCOPES.church, true, "--ground").toLowerCase()).toBe("#ffffff");
    expect(valueOf(SCOPES.church, true, "--on-ground").toLowerCase()).toBe("#000000");
  });

  it("sets the band heights of the new art: 80 and 52 in the churchyard, 64 and 48 in the allotment", () => {
    expect(valueOf(SCOPES.church, false, "--band")).toBe("80px");
    expect(valueOf(SCOPES.garden, false, "--band")).toBe("64px");
    const phone = (file: string): string | undefined => lastDecl([file], ":root", "--band", "@media (max-width: 37.4375rem)");
    expect(phone(CHURCH_THEME)).toBe("52px");
    expect(phone(GARDEN_THEME)).toBe("48px");
  });

  it("does not let ink, the second ink or the error text stand on the night ground", () => {
    // Each of these fails 4.5 to 1 on the night. They may only stand on a sheet, so they are not in CHURCH_GROUND.
    for (const ref of ["--ink", "--muted", "--error"]) {
      expect(contrast(colour("church", false, ref), colour("church", false, "--ground")), ref).toBeLessThan(4.5);
    }
  });
});
describe("no stylesheet names another host", () => {
  const FILES = [REGISTER, "template/src/ui/print.css", CHURCH_THEME, GARDEN_THEME, "examples/market/src/theme.css", SITE, "fonts/atkinson.css", "fonts/gelasio.css"];
  it.each(FILES)("%s has no remote url, import or font", (file) => {
    const css = read(file);
    expect(css).not.toMatch(/https?:\/\//i);
    expect(css).not.toMatch(/url\(\s*["']?(\/\/|data:)/i);
    expect(css).not.toMatch(/@import\s+(url\()?\s*["']?(https?:|\/\/)/i);
  });
});
