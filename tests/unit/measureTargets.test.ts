// The 44 px size and 12 px gap check of the layout measurement, and its one exception: a plot of the Site map drawn at
// its true place, when a full size "Choose a plot" list on the same page holds that plot (WCAG 2.2, 2.5.8, Essential
// and Equivalent). Normal controls never get the exception.
import { describe, expect, it } from "vitest";
import { plotCoverage, spatialPlotExemptions, targetSizeAndGap } from "../helpers/measureLayout";
import type { EquivalentFact, HitProbe, PlotFact, PlotHitFact, TargetBox } from "../helpers/measureLayout";

const plot = (plotId: string, over: Partial<PlotFact> = {}): PlotFact => ({ plotId, inSiteMap: true, hasFootprint: true, ...over });
const list = (values: string[], over: Partial<EquivalentFact> = {}): EquivalentFact => ({ label: "Choose a plot", visible: true, width: 280, height: 48, values: ["", ...values], ...over });
const box = (element: string, left: number, top: number, w: number, h: number, spatialPlotId?: string): TargetBox => ({
  element,
  short: element,
  left,
  top,
  right: left + w,
  bottom: top + h,
  nested: [],
  ...(spatialPlotId === undefined ? {} : { spatialPlotId }),
});
const rules = (v: { rule: string; element: string }[]) => v.map((x) => `${x.rule} ${x.element}`);

describe("which map plots are let off size and gap", () => {
  it("lets off a Site map plot with its footprint when a visible full size Choose a plot list holds it", () => {
    expect([...spatialPlotExemptions([plot("a"), plot("b")], [list(["a", "b"])])]).toEqual(["a", "b"]);
  });

  it("lets off nothing without the same page list, or when the list is hidden, too small or named otherwise", () => {
    expect(spatialPlotExemptions([plot("a")], []).size).toBe(0);
    expect(spatialPlotExemptions([plot("a")], [list(["a"], { visible: false })]).size).toBe(0);
    expect(spatialPlotExemptions([plot("a")], [list(["a"], { height: 30 })]).size).toBe(0);
    expect(spatialPlotExemptions([plot("a")], [list(["a"], { width: 40 })]).size).toBe(0);
    expect(spatialPlotExemptions([plot("a")], [list(["a"], { label: "Section" })]).size).toBe(0);
  });

  it("lets off only plots the list holds, inside the interactive Site map, with a drawn footprint", () => {
    const out = spatialPlotExemptions([plot("a"), plot("x"), plot("p", { inSiteMap: false }), plot("f", { hasFootprint: false }), plot("")], [list(["a", "p", "f"])]);
    expect([...out]).toEqual(["a"]);
  });
});

describe("target size and gap", () => {
  it("still fails a normal button that is too small or too close, beside exempt plots", () => {
    const boxes = [
      box("button \"Zoom in\"", 20, 20, 40, 40),
      box("button \"Zoom out\"", 66, 20, 44, 44),
      box("g \"Open plot Y01\"", 20, 200, 20, 30, "a"),
      box("g \"Open plot Y02\"", 40, 200, 20, 30, "b"),
    ];
    const out = rules(targetSizeAndGap(boxes, new Set(["a", "b"])));
    expect(out).toContain("target_size button \"Zoom in\"");
    expect(out).toContain("target_gap button \"Zoom in\"");
    expect(out.some((r) => r.includes("Open plot"))).toBe(false);
  });

  it("fails plots that are not exempt, as any other control", () => {
    const boxes = [box("g \"Open plot Y01\"", 20, 200, 20, 30, "a"), box("g \"Open plot Y02\"", 40, 200, 20, 30, "b")];
    const out = rules(targetSizeAndGap(boxes, new Set()));
    expect(out).toEqual(["target_size g \"Open plot Y01\"", "target_size g \"Open plot Y02\"", "target_gap g \"Open plot Y01\""]);
  });

  it("never lets an exempt plot off its gap to a normal control", () => {
    const boxes = [box("g \"Open plot Y01\"", 20, 200, 50, 50, "a"), box("a \"Open plot list\"", 75, 200, 120, 48)];
    expect(rules(targetSizeAndGap(boxes, new Set(["a"])))).toEqual(["target_gap g \"Open plot Y01\""]);
  });

  it("does not let off a normal control that carries an exempt plot ID by mistake", () => {
    // Only a box marked as a map plot (spatialPlotId) can be let off. A plain button with a small box always fails.
    const boxes = [box("button \"Y01\"", 20, 20, 30, 30)];
    expect(rules(targetSizeAndGap(boxes, new Set(["a"])))).toEqual(["target_size button \"Y01\""]);
  });

  it("does not measure a target against one that holds it", () => {
    const outer = { ...box("div \"Site map\"", 16, 16, 300, 300), nested: [1] };
    const inner = { ...box("button \"Inner\"", 40, 40, 44, 44), nested: [0] };
    expect(targetSizeAndGap([outer, inner], new Set())).toEqual([]);
  });
});

describe("whether a map plot is covered", () => {
  const probe = (over: Partial<HitProbe> = {}): HitProbe => ({ at: "10, 10", top: "polygon", inView: true, onTarget: false, sameSheet: true, ...over });
  // A free headstone: hollow, so at its centre the section outline of the same sheet is on top.
  const hollow = (plotId: string, footprint: Partial<HitProbe> = {}): PlotHitFact => ({ plotId, element: `g "Open plot ${plotId}"`, group: probe(), footprint: probe(footprint) });

  it("accepts an exempt plot whose footprint centre shows its own sheet, which reads the click", () => {
    expect(plotCoverage([hollow("a")], new Set(["a"]))).toEqual([]);
    expect(plotCoverage([hollow("a", { onTarget: true, sameSheet: true, top: "polygon" })], new Set(["a"]))).toEqual([]);
  });

  it("fails an exempt plot when something outside its sheet lies on its footprint", () => {
    const out = plotCoverage([hollow("a", { sameSheet: false, top: "div" })], new Set(["a"]));
    expect(out).toEqual([{ rule: "covered_target", element: 'g "Open plot a"', detail: "at 10, 10 the top element is div" }]);
  });

  it("judges a plot that is not exempt like any other target, at its group centre", () => {
    expect(plotCoverage([hollow("a")], new Set()).map((v) => v.rule)).toEqual(["covered_target"]);
    expect(plotCoverage([{ ...hollow("a"), group: probe({ onTarget: true }) }], new Set())).toEqual([]);
  });

  it("does not let off an exempt plot with no footprint, and skips a point out of view", () => {
    expect(plotCoverage([{ plotId: "a", element: "g", group: probe() }], new Set(["a"])).length).toBe(1);
    expect(plotCoverage([hollow("a", { sameSheet: false, inView: false })], new Set(["a"]))).toEqual([]);
  });
});