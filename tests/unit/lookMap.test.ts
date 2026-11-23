// The map drawing of the new look (spec 07, tasks 7.12 and 7.13, L6): the state of each plot as a class, turf and a base
// under an arch, crop and furrow patterns on a bed, the edge of a walk, the key swatches that carry the same classes,
// and the rules that fill them in each theme, in high contrast and in print. A fill only repeats what the mark says.
// Labels are 14 px. Plots are not buttons. The sizes in a real browser are measured by tests/browser/layout.spec.ts.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { emptyMap } from "../../template/src/map/edit";
import { CODE_EM, codeWidth } from "../../template/src/map/labels";
import { buildSheet, LABEL_SIZE } from "../../template/src/map/sheet";
import type { SheetModel } from "../../template/src/map/sheet";
import { plotSummaryAt } from "../../template/src/status";
import { ShellContext } from "../../template/src/ui/shellContext";
import type { ShellValue } from "../../template/src/ui/shellContext";
import { MapKey, SheetSvg } from "../../template/src/ui/SiteMap";
import { fixture } from "../../tools/inspector/fixtures";
import type { FixtureId } from "../../tools/inspector/fixtures";
import { contrast, declOf, lastDecl, readText, rulesFor, rulesOf, tokenOf } from "../helpers/cssRules";

const REGISTER = "template/src/ui/register.css";
const CHURCH = "apps/churchyard-register/src/theme.css";
const GARDEN = "apps/allotment-register/src/theme.css";
const PRINT = "template/src/ui/print.css";
const SITE = "site/src/site.css";

// ---- Drawing the sheet --------------------------------------------------------------------------------------

type Shape = "arch" | "bed";
const shellFor = (shape: Shape): ShellValue => ({ t: (key: string) => key, app: { adapter: { theme: { plotShape: shape } } } }) as unknown as ShellValue;
const natural = (a: string, b: string): number => a.localeCompare(b, "en", { numeric: true });

function modelOf(id: FixtureId, width: number, select?: string): SheetModel {
  const built = fixture(id);
  const state = built.state as unknown as { core: Parameters<typeof plotSummaryAt>[0]; map: Parameters<typeof buildSheet>[0]["map"] };
  const plots = Object.values(state.core.plots)
    .map((plot) => {
      const summary = plotSummaryAt(state.core, plot.plotId, built.asOf);
      return { plotId: plot.plotId, code: plot.code, mark: { ...(summary?.primary === undefined ? {} : { state: summary.primary }), needsChecking: summary?.needsChecking ?? false } };
    })
    .sort((a, b) => natural(a.code, b.code));
  const chosen = select === undefined ? undefined : plots.find((p) => p.code === select)?.plotId;
  return buildSheet({ map: state.map, plots, ...(chosen === undefined ? {} : { selectedPlotId: chosen }) }, { width });
}

const draw = (shape: Shape, model: SheetModel): string => renderToStaticMarkup(createElement(ShellContext.Provider, { value: shellFor(shape) }, createElement(SheetSvg, { model, label: "Map" })));
const key = (shape: Shape): string => renderToStaticMarkup(createElement(ShellContext.Provider, { value: shellFor(shape) }, createElement(MapKey)));

/** The start tags of one element name, each as an attribute map, in the order they stand in the markup. */
function tagsOf(html: string, name: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of html.matchAll(new RegExp(`<${name}\\b([^>]*?)/?>`, "g"))) {
    const attrs: Record<string, string> = {};
    for (const a of (m[1] ?? "").matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1] as string] = a[2] as string;
    out.push(attrs);
  }
  return out;
}
const classes = (tag: Record<string, string>): string[] => (tag["class"] ?? "").split(/\s+/).filter(Boolean);
const num = (tag: Record<string, string>, name: string): number => Number(tag[name]);
const STATES = ["free", "reserved", "taken", "unusable"] as const;

describe("the state of each plot is a class (L6.2)", () => {
  it.each([["lantern-fold", "arch", "path"], ["thimble-beds", "bed", "polygon"]] as const)("gives each plot of %s its state, its need to be checked and its choice as classes", (id, shape, element) => {
    const model = modelOf(id, 520, id === "lantern-fold" ? "Y07" : "B03");
    const drawn = tagsOf(draw(shape, model), element).filter((t) => classes(t).includes("plot"));
    expect(drawn.length).toBe(model.plots.length);
    model.plots.forEach((plot, i) => {
      const list = classes(drawn[i] as Record<string, string>);
      const states = list.filter((c) => (STATES as readonly string[]).includes(c));
      expect(states, plot.code).toEqual(plot.mark.state === undefined ? [] : [plot.mark.state]);
      expect(list.includes("checking"), `${plot.code} checking`).toBe(plot.mark.needsChecking);
      expect(list.includes("selected"), `${plot.code} selected`).toBe(plot.selected);
      expect(list.includes("bed"), `${plot.code} bed`).toBe(shape === "bed");
    });
    expect(model.plots.some((p) => p.mark.state === "taken")).toBe(true);
    expect(model.plots.some((p) => p.mark.state === "free")).toBe(true);
  });

  it("carries the same classes on each key swatch", () => {
    for (const shape of ["arch", "bed"] as const) {
      const swatches = tagsOf(key(shape), shape === "arch" ? "path" : "rect").filter((t) => classes(t).includes("plot"));
      expect(swatches.map((t) => classes(t).filter((c) => c !== "plot" && c !== "bed")), shape).toEqual([["free"], ["reserved"], ["taken"], ["unusable"], ["checking"]]);
    }
  });
});

describe("turf and a base under each arch (L6.3)", () => {
  const model = modelOf("lantern-fold", 520, "Y07");
  const html = draw("arch", model);
  const turfs = tagsOf(html, "ellipse").filter((t) => classes(t).includes("turf"));
  const bases = tagsOf(html, "rect").filter((t) => classes(t).includes("base"));

  it("draws one turf ellipse under each arch, a little wider than the arch and centred on it", () => {
    expect(turfs.length).toBe(model.plots.length);
    model.plots.forEach((plot, i) => {
      const turf = turfs[i] as Record<string, string>;
      expect(num(turf, "cx"), plot.code).toBeCloseTo(plot.box.x + plot.box.width / 2, 0);
      expect(num(turf, "rx"), plot.code).toBeGreaterThan(plot.box.width / 2);
      expect(num(turf, "rx"), plot.code).toBeLessThanOrEqual(plot.box.width / 2 + 12);
      expect(num(turf, "cy") + num(turf, "ry"), plot.code).toBeGreaterThan(plot.box.y + plot.box.height);
    });
  });

  it("draws a base at the foot of each arch that shows its code, 5 percent wider on each side and at least 22 high", () => {
    const withCode = model.plots.filter((p) => p.label !== undefined);
    expect(withCode.length).toBeGreaterThan(0);
    expect(bases.length).toBe(withCode.length);
    withCode.forEach((plot, i) => {
      const base = bases[i] as Record<string, string>;
      expect(num(base, "width"), plot.code).toBeCloseTo(plot.box.width * 1.1, 0);
      expect(num(base, "x"), plot.code).toBeCloseTo(plot.box.x - plot.box.width * 0.05, 0);
      expect(num(base, "height"), plot.code).toBeGreaterThanOrEqual(22);
      expect(num(base, "height"), plot.code).toBeGreaterThanOrEqual(plot.box.height * 0.27 - 0.5);
      expect(num(base, "y") + num(base, "height"), plot.code).toBeCloseTo(plot.box.y + plot.box.height, 0);
    });
  });

  it("keeps a base off the base of the plot beside it, when the plots stand edge to edge", () => {
    // Three plots in a row with no gap, as a generated grid has. Each is 90 px wide, so a base that is 5 percent wider on
    // each side would run 4.5 px into the next one. The base stands out only as far as half the gap to its neighbour.
    const map = { ...emptyMap(), shapes: Object.fromEntries(["A", "B", "C"].map((id, i) => [id, [[i * 100, 0], [i * 100 + 100, 0], [i * 100 + 100, 100], [i * 100, 100]]])) as Record<string, [number, number][]> };
    const plots = ["A", "B", "C"].map((id) => ({ plotId: id, code: `W0${id === "A" ? 1 : id === "B" ? 2 : 3}`, mark: { needsChecking: false } }));
    const abutting = buildSheet({ map, plots }, { width: 348, bounds: { minEast: 0, minNorth: 0, maxEast: 300, maxNorth: 100 } });
    const found = tagsOf(draw("arch", abutting), "rect").filter((t) => classes(t).includes("base"));
    expect(found.length).toBe(3);
    for (let i = 0; i + 1 < found.length; i += 1) {
      const a = found[i] as Record<string, string>;
      const b = found[i + 1] as Record<string, string>;
      expect(num(a, "x") + num(a, "width"), `base ${i} ends before base ${i + 1} starts`).toBeLessThanOrEqual(num(b, "x") + 0.01);
    }
    // No base is narrower than its plot, and none stands out on the side that has no neighbour by more than 5 percent.
    for (const [i, base] of found.entries()) {
      const plot = abutting.plots[i] as SheetModel["plots"][number];
      expect(num(base, "width")).toBeGreaterThanOrEqual(plot.box.width - 0.01);
      expect(num(base, "x")).toBeGreaterThanOrEqual(plot.box.x - plot.box.width * 0.05 - 0.01);
    }
  });

  it("marks the base of a taken plot that is not the chosen one, and no other", () => {
    const withCode = model.plots.filter((p) => p.label !== undefined);
    withCode.forEach((plot, i) => {
      const takenBase = classes(bases[i] as Record<string, string>).includes("taken");
      expect(takenBase, plot.code).toBe(plot.mark.state === "taken" && !plot.selected);
    });
    expect(withCode.some((p) => p.mark.state === "taken" && !p.selected)).toBe(true);
  });

  it("stacks turf, then the arch, then the base, then the code", () => {
    const first = model.plots.find((p) => p.label !== undefined && !p.selected) as NonNullable<SheetModel["plots"][number]>;
    const at = (needle: string, from = 0): number => html.indexOf(needle, from);
    const turf = at('class="turf"');
    const plot = at('class="plot', turf);
    const base = at('class="base', plot);
    const code = at(`>${first.code}</text>`, base);
    expect(turf).toBeGreaterThan(-1);
    expect(plot).toBeGreaterThan(turf);
    expect(base).toBeGreaterThan(plot);
    expect(code).toBeGreaterThan(base);
  });

  it("keeps the old arch parts", () => {
    expect(html).toContain('class="arch-inner"');
    expect(html).toContain('class="path-line"');
  });
});

describe("crop and furrow patterns on a bed (L6.3)", () => {
  const model = modelOf("thimble-beds", 520, "B03");
  const html = draw("bed", model);

  it("defines the two patterns once in the drawing, and not for an arch", () => {
    expect(html.match(/<pattern id="crops"/g)?.length).toBe(1);
    expect(html.match(/<pattern id="furrows"/g)?.length).toBe(1);
    expect(html).toContain("<defs>");
    expect(draw("arch", modelOf("lantern-fold", 520))).not.toContain("<pattern");
  });

  it("keeps the strip of hatching, the peg and the bed class", () => {
    expect(html).toContain('class="hatch"');
    expect(html).toContain('class="peg"');
    expect(tagsOf(html, "polygon").filter((t) => classes(t).includes("bed")).length).toBe(6);
  });

  it("makes the peg wide enough for its 14 px code, with room each side", () => {
    const pegs = tagsOf(html, "rect").filter((t) => classes(t).includes("peg"));
    expect(pegs.length).toBeGreaterThan(0);
    for (const peg of pegs) {
      // The narrowest code on the beds is B01, 1.742 em measured, 24.4 px.
      expect(num(peg, "width")).toBeGreaterThanOrEqual(1.742 * LABEL_SIZE + 10);
      expect(num(peg, "height")).toBeGreaterThanOrEqual(LABEL_SIZE + 5);
    }
  });
});

describe("the edge of a walk (L6.3)", () => {
  it.each([["lantern-fold", "arch"], ["thimble-beds", "bed"]] as const)("puts a path edge line under each walk of %s, on the same points", (id, shape) => {
    const model = modelOf(id, 520);
    const html = draw(shape, model);
    const edges = tagsOf(html, "polyline").filter((t) => classes(t).includes("path-edge"));
    const paths = tagsOf(html, "polyline").filter((t) => classes(t).includes("path"));
    expect(edges.length).toBe(model.paths.length);
    expect(paths.length).toBe(model.paths.length);
    expect(model.paths.length).toBeGreaterThan(0);
    edges.forEach((edge, i) => expect(edge["points"]).toBe((paths[i] as Record<string, string>)["points"]));
    expect(html.indexOf('class="path-edge"')).toBeLessThan(html.indexOf('class="path"'));
  });
});

describe("the chosen plot (L6.7)", () => {
  it("keeps its two outlines, its tab and no code of its own", () => {
    const model = modelOf("lantern-fold", 520, "Y07");
    const html = draw("arch", model);
    expect(html.match(/class="plot-selected-outer"/g)?.length).toBe(1);
    expect(html.match(/class="plot-selected-inner"/g)?.length).toBe(1);
    expect(html.match(/<rect class="tab"/g)?.length).toBe(1);
    expect(html).toContain('class="label tab-text"');
    expect(html.match(/>Y07<\/text>/g)?.length, "Y07 is written once, on the tab").toBe(1);
  });
});

describe("plots are not buttons (L6.6)", () => {
  it.each([["lantern-fold", "arch"], ["thimble-beds", "bed"]] as const)("draws %s with nothing to press and nothing in the tab order", (id, shape) => {
    const html = draw(shape, modelOf(id, 520, id === "lantern-fold" ? "Y07" : "B03"));
    expect(html).not.toMatch(/<button|<a[ >]|tabindex|role="button"|onclick|href=/i);
    expect(key(shape)).not.toMatch(/<button|<a[ >]|tabindex|role="button"|href=/i);
  });
});

describe("map labels are 14 px (task 7.13, L6.5)", () => {
  it("sets names and codes at 14 px, and the tab at 14 px", () => {
    expect(LABEL_SIZE).toBe(14);
    for (const [id, shape] of [["lantern-fold", "arch"], ["thimble-beds", "bed"]] as const) {
      const html = draw(shape, modelOf(id, 520, id === "lantern-fold" ? "Y07" : "B03"));
      const sizes = tagsOf(html, "text").map((t) => Number(t["font-size"]));
      expect(sizes.length, id).toBeGreaterThan(5);
      expect(Math.min(...sizes), id).toBe(14);
      expect(Math.max(...sizes), id).toBe(14);
    }
  });

});

// ---- A code box is sized from its own characters (task 7.19, L6.5) ---------------------------------------------------
// The widths below were measured in headless Chromium with the shipped font, Atkinson Hyperlegible Next at weight 700: the
// computed text length of one string at 1000 px, divided by 1000. They are written here as the expectation. They are not
// read from the code. One average width for every character made a code of wide capitals overflow its box.

const MEASURED_EM: Record<string, number> = { "0": 0.659, "1": 0.44, "7": 0.537, Y: 0.65, B: 0.643, C: 0.658, G: 0.718, O: 0.746, Q: 0.756, M: 0.858, W: 0.886, I: 0.424 };
const MEASURED_STRING_EM: Record<string, number> = { W01: 1.985, MW12: 2.763, QQGO: 2.976, QQGO1: 3.416, MMMM: 3.432, WWWW: 3.571, Y07: 1.846, B03: 1.902, C001: 2.416, "111": 1.32 };

describe("a code box is sized from the widths of its own characters", () => {
  it("holds each measured character, and no more than a hundredth of an em over it", () => {
    for (const [ch, em] of Object.entries(MEASURED_EM)) {
      expect(CODE_EM[ch], ch).toBeGreaterThanOrEqual(em);
      expect(CODE_EM[ch], ch).toBeLessThanOrEqual(em + 0.01);
    }
  });

  it("is wider for W and M than for a digit, which one average width could not be", () => {
    expect(codeWidth("W", 14)).toBeGreaterThan(codeWidth("0", 14) + 3);
    expect(codeWidth("M", 14)).toBeGreaterThan(codeWidth("0", 14) + 2.5);
    expect(codeWidth("W", 14)).toBeGreaterThan(9.7);
    expect(codeWidth("1", 14)).toBeLessThan(9.7 - 3);
  });

  it.each(Object.entries(MEASURED_STRING_EM))("holds the whole of %s at 14 px, and is not far over it", (code, em) => {
    const drawn = em * LABEL_SIZE;
    expect(codeWidth(code, LABEL_SIZE)).toBeGreaterThanOrEqual(drawn);
    expect(codeWidth(code, LABEL_SIZE)).toBeLessThanOrEqual(drawn + 0.55 * code.length);
  });

  it("scales with the size, and an empty code takes no room", () => {
    expect(codeWidth("W01", 28)).toBeCloseTo(codeWidth("W01", 14) * 2, 6);
    expect(codeWidth("", 14)).toBe(0);
  });

  it("gives a character that is not in the table the widest width that is, so it never overflows", () => {
    const widest = Math.max(...Object.values(CODE_EM));
    expect(codeWidth("é", 14)).toBeCloseTo(widest * 14, 6);
    expect(codeWidth("日本", 14)).toBeGreaterThanOrEqual(2 * widest * 14);
  });

  it("draws a code in its plot only when its box fits the plot, by its own width and not by an average", () => {
    // A plot 44 px wide and 40 high: 88 by 80 site units at a scale of 0.5, in a sheet 448 wide over an 800 by 600 site.
    // The code box is the code and 6 px each side, so a plot of 44 px has room for a code of 32 px.
    const draws = (code: string, east: number): boolean => {
      const map = { ...emptyMap(), shapes: { A: [[0, 0], [east, 0], [east, 80], [0, 80]] as [number, number][] } };
      const model = buildSheet({ map, plots: [{ plotId: "A", code, mark: { needsChecking: false } }] }, { width: 448, bounds: { minEast: 0, minNorth: 0, maxEast: 800, maxNorth: 600 } });
      return model.plots[0]?.label !== undefined;
    };
    expect(draws("1111", 88), "four narrow digits, 24.6 px").toBe(true);
    expect(draws("W01", 88), "W01, 27.8 px").toBe(true);
    expect(draws("MW12", 88), "MW12, 38.8 px").toBe(false);
    expect(draws("WWWW", 88), "WWWW, 50 px").toBe(false);
    expect(draws("QQGO", 88), "QQGO, 41.7 px").toBe(false);
    // 112 site units make 56 px: room for a code of 44 px.
    expect(draws("MW12", 112)).toBe(true);
    expect(draws("QQGO", 112)).toBe(true);
    expect(draws("WWWW", 112)).toBe(false);
  });

  it("makes the peg and the code tab wide enough for the code and its padding", () => {
    for (const code of ["W01", "MW12", "QQGO", "QQGO1", "WWWW", "111"]) {
      const map = { ...emptyMap(), shapes: { A: [[0, 0], [300, 0], [300, 200], [0, 200]] as [number, number][] } };
      const plots = [{ plotId: "A", code, mark: { needsChecking: false } }];
      const model = buildSheet({ map, plots, selectedPlotId: "A" }, { width: 448 });
      const drawn = (MEASURED_STRING_EM[code] as number) * LABEL_SIZE;
      expect(model.tab?.width, `${code}: tab`).toBeGreaterThanOrEqual(drawn + 12);
      const unselected = buildSheet({ map, plots }, { width: 448 });
      expect(unselected.plots[0]?.label?.text).toBe(code);
      const peg = tagsOf(draw("bed", unselected), "rect").find((t) => classes(t).includes("peg"));
      expect(num(peg as Record<string, string>, "width"), `${code}: peg`).toBeGreaterThanOrEqual(drawn + 10);
      expect(num(peg as Record<string, string>, "width"), `${code}: peg is not wasteful`).toBeLessThanOrEqual(drawn + 16);
    }
  });
});

// ---- The rules that fill the drawing ------------------------------------------------------------------------

const decl = (files: readonly string[], selector: string, property: string, at = ""): string | undefined => lastDecl(files, selector, property, at);

describe("what fills the map in the shared rules (L6.3)", () => {
  it("leaves a plot open, fills a taken plot with the stone and draws the lawn, the turf, the base and the walk edge", () => {
    expect(decl([REGISTER], ".sheet .plot", "fill")).toBe("none");
    expect(decl([REGISTER], ".sheet .plot.taken", "fill")).toBe("var(--stone, var(--paper))");
    expect(decl([REGISTER], ".sheet .section-outline", "fill")).toBe("var(--row-ground, none)");
    expect(decl([REGISTER], ".sheet .turf", "fill")).toBe("var(--turf, none)");
    expect(decl([REGISTER], ".sheet .base", "fill")).toBe("var(--field)");
    expect(decl([REGISTER], ".sheet .base", "stroke")).toBe("var(--ink)");
    expect(decl([REGISTER], ".sheet .base.taken", "fill")).toBe("var(--stone-base, var(--field))");
    expect(decl([REGISTER], ".sheet .path-edge", "stroke")).toBe("var(--kerb, none)");
    expect(decl([REGISTER], ".sheet .path-edge", "stroke-width")).toBe("16");
    expect(decl([REGISTER], ".swatch .plot", "fill")).toBe("none");
    expect(decl([REGISTER], ".swatch .plot.taken", "fill")).toBe("var(--stone, var(--paper))");
  });

  it("joins the key to the map in one frame", () => {
    expect(decl([REGISTER], ".sheet-scroll:has(+ .map-key)", "border-bottom")).toBe("0");
    expect(decl([REGISTER], ".map-key", "border")).toBe("2px solid var(--ink)");
    expect(decl([REGISTER], ".map-key", "border-top-width")).toBe("1px");
    expect(decl([REGISTER], ".map-key", "background")).toBe("var(--field)");
    expect(decl([REGISTER], ".map-key", "padding")).toBe("6px 16px");
    expect(decl([REGISTER], ".map-key", "gap")).toBe("2px 24px");
    // The pages that hold the map space their parts by --gap. The key takes that gap back, so the two frames touch.
    expect(decl([REGISTER], ".sheet-scroll + .map-key", "margin-top")).toBe("calc(var(--gap) * -1)");
  });

  it("rounds the allotment frame as one piece, the map above and the key below", () => {
    expect(decl([GARDEN], ".sheet-scroll:has(+ .map-key)", "border-radius")).toBe("12px 12px 0 0");
    expect(decl([GARDEN], ".map-key", "border-radius")).toBe("0 0 12px 12px");
  });
});

describe("the churchyard theme (L6.3)", () => {
  it("fills no plot, then the taken plot with the stone, then the chosen plot with the tab, in that order", () => {
    const rules = (selector: string) => rulesFor(CHURCH, selector);
    const none = rules("svg.sheet .plot").at(-1) as { body: string; order: number };
    const taken = rules("svg.sheet .plot.taken").at(-1) as { body: string; order: number };
    const selected = rules("svg.sheet .plot.selected").at(-1) as { body: string; order: number };
    expect(declOf(none.body, "fill")).toBe("none");
    expect(declOf(taken.body, "fill")).toBe("var(--stone)");
    expect(declOf(selected.body, "fill")).toBe("var(--tab)");
    expect(none.order).toBeLessThan(taken.order);
    expect(taken.order).toBeLessThan(selected.order);
  });

  it("makes the summary swatch follow the map", () => {
    expect(decl([CHURCH], ".mark-swatch .plot", "fill")).toBe("none");
    expect(decl([CHURCH], ".mark-swatch .plot.taken", "fill")).toBe("var(--stone)");
  });

  it("draws the dashed edge of a section in its line colour and does not fade the lawn", () => {
    expect(decl([CHURCH], ".sheet .section-outline", "stroke")).toBe("var(--soft-line)");
    expect(decl([CHURCH], ".sheet .section-outline", "opacity")).toBeUndefined();
  });

  it("keeps what the asset tests read", () => {
    const css = readText(CHURCH);
    for (const part of [".sheet .arch-inner", ".sheet .path-line", "header.app::before", "fold-drift"]) expect(css, part).toContain(part);
    expect(decl([CHURCH], ".sheet .path", "stroke-width")).toBe("14");
  });
});

describe("the allotment theme (L6.3)", () => {
  it("fills a bed with furrows, a taken bed with crops and the chosen bed with the tab", () => {
    expect(decl([GARDEN], ".sheet .plot.bed", "fill")).toBe("url(#furrows)");
    expect(decl([GARDEN], ".sheet .plot.bed.taken", "fill")).toBe("url(#crops)");
    expect(decl([GARDEN], ".sheet .plot.bed.selected", "fill")).toBe("var(--tab)");
    const order = (selector: string): number => (rulesFor(GARDEN, selector).at(-1) as { order: number }).order;
    expect(order(".sheet .plot.bed")).toBeLessThan(order(".sheet .plot.bed.taken"));
    expect(order(".sheet .plot.bed.taken")).toBeLessThan(order(".sheet .plot.bed.selected"));
  });

  it("colours the pattern parts from the theme", () => {
    expect(decl([GARDEN], ".sheet .soil", "fill")).toBe("var(--bedfill)");
    expect(decl([GARDEN], ".sheet .crop", "fill")).toBe("var(--crop)");
    expect(decl([GARDEN], ".sheet .furrow", "fill")).toMatch(/^rgba\(110, 84, 48, 0\.22\)$/);
  });

  it("keeps what the asset tests read", () => {
    const css = readText(GARDEN);
    for (const part of [".sheet .hatch", ".sheet .peg", ".sheet .bed", ".sheet .path-line"]) expect(css, part).toContain(part);
    expect(decl([GARDEN], ".sheet .path", "stroke-width")).toBe("14");
  });
});

describe("high contrast removes the ground, turf, patterns, edge and stone fill (L6.4)", () => {
  it("sets the churchyard map values to none or white", () => {
    const high = (name: string): string => tokenOf([REGISTER, CHURCH], true, name).toLowerCase();
    expect(high("--row-ground")).toBe("none");
    expect(high("--turf")).toBe("none");
    expect(high("--kerb")).toBe("none");
    expect(high("--stone")).toBe("#ffffff");
    expect(high("--stone-base")).toBe("#ffffff");
    expect(contrast(high("--stone"), "#000000")).toBeGreaterThanOrEqual(4.5);
  });

  it("sets the allotment map values to none or white, and a bed to its plain soil", () => {
    const high = (name: string): string => tokenOf([REGISTER, GARDEN], true, name).toLowerCase();
    expect(high("--row-ground")).toBe("none");
    expect(high("--bedfill")).toBe("#ffffff");
    // The rule has `html` and an attribute in front, so it outranks the taken and the chosen bed.
    expect(decl([GARDEN], 'html[data-contrast="high"] .sheet .plot.bed', "fill")).toBe("var(--bedfill)");
  });

  it("keeps the marks and the outlines, which carry the state", () => {
    expect(decl([REGISTER], ".mark", "stroke")).toBe("var(--ink)");
    expect(decl([REGISTER], ".mark.solid", "fill")).toBe("var(--ink)");
    expect(decl([REGISTER], ".sheet .plot", "stroke")).toBe("var(--ink)");
  });
});

describe("print removes the ground, turf, patterns, edge and stone fill (L6.4)", () => {
  const print = rulesOf(readText(PRINT)).filter((r) => r.at === "@media print");
  const fillOf = (selector: string): { fill?: string; stroke?: string; order: number } => {
    const rule = print.filter((r) => r.selector === selector).at(-1);
    if (rule === undefined) throw new Error(`print.css has no rule for ${selector}`);
    return { fill: declOf(rule.body, "fill"), stroke: declOf(rule.body, "stroke"), order: rule.order };
  };

  it("draws the lawn and the turf as nothing, and the edge of a walk as nothing", () => {
    expect(fillOf("html svg.sheet .section-outline").fill).toBe("none");
    expect(fillOf("html svg.sheet .turf").fill).toBe("none");
    expect(fillOf("html svg.sheet .path-edge").stroke).toBe("none");
  });

  it("draws every plot, bed and base white, so the stone, the crops and the furrows do not print", () => {
    for (const selector of ["html svg.sheet .plot", "html svg.sheet .plot.taken", "html svg.sheet .plot.bed", "html svg.sheet .plot.bed.taken", "html svg.sheet .base", "html svg.sheet .base.taken"]) {
      expect(fillOf(selector).fill, selector).toBe("#ffffff");
    }
  });

  it("draws the walk light grey and the chosen plot and its tab light grey, after the white plots", () => {
    expect(fillOf("html svg.sheet .path").stroke).toBe("#dadada");
    const white = fillOf("html svg.sheet .plot.bed.taken").order;
    for (const selector of ["html svg.sheet .plot.selected", "html svg.sheet .plot.bed.selected", "html svg.sheet .tab"]) {
      expect(fillOf(selector).fill, selector).toBe("#e6e6e6");
      expect(fillOf(selector).order, selector).toBeGreaterThan(white);
    }
  });

  it("puts the html prefix on every rule that draws the sheet, so it outranks a theme file whatever the order they load in", () => {
    const sheetRules = print.filter((r) => declOf(r.body, "fill") !== undefined || declOf(r.body, "stroke") !== undefined);
    expect(sheetRules.length).toBeGreaterThan(8);
    for (const r of sheetRules) expect(r.selector.startsWith("html svg.sheet "), r.selector).toBe(true);
  });
});

describe("the practice maps of the start page (L6.3, L6.4)", () => {
  const rule = (selector: string, property: string): string | undefined => decl([SITE], selector, property);

  it("fills no plot, a taken plot with the stone, the lawn, the turf, the base and the walk edge", () => {
    expect(rule(".practice-map .plot", "fill")).toBe("none");
    expect(rule(".practice-map .plot.taken", "fill")).toBe("var(--sheet-stone)");
    expect(rule(".practice-map .section-outline", "fill")).toBe("var(--sheet-ground)");
    expect(rule(".practice-map .turf", "fill")).toBe("var(--sheet-turf)");
    expect(rule(".practice-map .base", "fill")).toBe("var(--sheet-stone)");
    expect(rule(".practice-map .base.taken", "fill")).toBe("var(--sheet-base)");
    expect(rule(".practice-map .path-edge", "stroke")).toBe("var(--sheet-kerb)");
  });

  it("fills a bed with furrows and a taken bed with crops", () => {
    expect(rule(".practice-map .plot.bed", "fill")).toBe("url(#furrows)");
    expect(rule(".practice-map .plot.bed.taken", "fill")).toBe("url(#crops)");
    expect(rule(".practice-map .soil", "fill")).toBe("var(--sheet-bed)");
    expect(rule(".practice-map .crop", "fill")).toBe("var(--sheet-crop)");
  });

  it("names its own grounds for each tone", () => {
    const css = readText(SITE);
    for (const name of ["--sheet-ground", "--sheet-turf", "--sheet-base", "--sheet-kerb", "--sheet-bed", "--sheet-crop"]) {
      expect(css.match(new RegExp(`${name}:`, "g"))?.length, name).toBe(2);
    }
  });
});
