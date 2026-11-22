// The layout measurement for map labels (spec 04, A12). The measurement reads the page into plain data and checks
// that data, so it is tried here without a browser. The two cases found in the churchyard map are the first two.
import { describe, expect, it } from "vitest";
import { CAPTION_COST, cost } from "../../template/src/map/labels";
import type { Scene } from "../../template/src/map/labels";
import { findLabelCollisions } from "../helpers/measureLayout";
import type { SheetScene } from "../helpers/measureLayout";

const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });

/** A clean drawing: a walk, a tab at the top left, the north arrow at the top right, a gate and four labels apart. */
function clean(): SheetScene {
  return {
    frame: { width: 360, height: 300 },
    labels: [
      { text: "Main gate", box: box(20, 150, 80, 166) },
      { text: "Yew Walk", box: box(150, 170, 210, 186) },
      { text: "Y07", box: box(250, 120, 280, 136) },
      { text: "Yew Walk", box: box(70, 40, 130, 56) },
    ],
    lines: [{ name: "Yew Walk", points: [[40, 200], [320, 200]] }],
    tab: box(8, 8, 56, 36),
    north: box(330, 10, 354, 40),
    gate: box(30, 194, 42, 206),
  };
}

describe("finding labels that collide (A12.3)", () => {
  it("finds nothing in a clean drawing", () => {
    expect(findLabelCollisions([clean()])).toEqual([]);
  });

  it("finds a gate label standing on the dots of the path (seen in the churchyard map)", () => {
    const scene = clean();
    scene.labels[0] = { text: "Main gate", box: box(52, 192, 112, 208) };
    const found = findLabelCollisions([scene]);
    expect(found.map((v) => v.rule)).toEqual(["label_on_line"]);
    expect(found[0]?.element).toBe('sheet label "Main gate"');
    expect(found[0]?.detail).toContain("Yew Walk");
  });

  it("finds a section label touching the paper tab of the selected plot (seen in the churchyard map)", () => {
    const scene = clean();
    scene.labels[3] = { text: "Yew Walk", box: box(40, 30, 100, 46) };
    expect(findLabelCollisions([scene]).map((v) => v.rule)).toEqual(["label_on_tab"]);
  });

  it("finds a label on the north arrow, on the gate mark, over another label and outside the drawing", () => {
    const scene = clean();
    scene.labels.push(
      { text: "North", box: box(300, 20, 350, 36) },
      { text: "At gate", box: box(34, 200, 70, 216) },
      { text: "Second", box: box(150, 176, 200, 192) },
      { text: "Far", box: box(340, 280, 380, 296) },
    );
    const rules = findLabelCollisions([scene]).map((v) => v.rule);
    expect(rules).toContain("label_on_north");
    expect(rules).toContain("label_on_gate");
    expect(rules).toContain("label_overlap");
    expect(rules).toContain("label_clipped");
  });

  it("counts a label less than 1 px from a line as touching it, and 1.5 px as clear", () => {
    const scene = clean();
    scene.labels = [{ text: "Near", box: box(100, 183.5, 160, 199.5) }];
    expect(findLabelCollisions([scene]).map((v) => v.rule)).toEqual(["label_on_line"]);
    scene.labels = [{ text: "Near", box: box(100, 182.4, 160, 198.4) }];
    expect(findLabelCollisions([scene])).toEqual([]);
  });

  it("checks each drawing on its own", () => {
    const bad = clean();
    bad.labels[0] = { text: "Main gate", box: box(52, 192, 112, 208) };
    expect(findLabelCollisions([clean(), bad, clean()])).toHaveLength(1);
  });

  it("finds a label on the dashed outline of a section, and lets a section name sit just above its own outline", () => {
    const scene = clean();
    scene.outlines = [{ name: "Sunny Row", points: [[20, 100], [300, 100], [300, 190], [20, 190], [20, 100]] }];
    delete scene.gate;
    scene.labels = [
      { text: "Sunny Row", box: box(24, 84, 84, 99.5) },
      { text: "Main gate", box: box(24, 183, 84, 199) },
    ];
    const found = findLabelCollisions([scene]);
    expect(found.map((v) => v.rule)).toEqual(["label_on_outline"]);
    expect(found[0]?.element).toBe('sheet label "Main gate"');
    expect(found[0]?.detail).toContain("Sunny Row");
    scene.labels = [{ text: "Main gate", box: box(24, 160, 84, 176) }];
    expect(findLabelCollisions([scene])).toEqual([]);
  });
});

describe("a name over a plot (P19, task 09-map-labels)", () => {
  it("finds a gate, section or path name over a plot shape, and one that overlaps it by half a pixel", () => {
    const scene = clean();
    scene.plots = [box(150, 160, 230, 200)];
    const found = findLabelCollisions([scene]);
    expect(found.map((v) => v.rule)).toContain("label_on_plot");
    expect(found.find((v) => v.rule === "label_on_plot")?.element).toBe('sheet label "Yew Walk"');
    scene.plots = [box(150, 186.5, 230, 220)];
    expect(findLabelCollisions([scene]).map((v) => v.rule)).not.toContain("label_on_plot");
    scene.plots = [box(150, 185.5, 230, 220)];
    expect(findLabelCollisions([scene]).map((v) => v.rule)).toContain("label_on_plot");
  });

  it("lets the code of a plot sit inside its own plot, and finds it over another plot", () => {
    const scene = clean();
    scene.labels = [{ text: "Y07", kind: "plot", box: box(250, 120, 280, 136) }];
    scene.plots = [box(240, 100, 290, 150)];
    expect(findLabelCollisions([scene])).toEqual([]);
    scene.plots = [box(240, 100, 290, 150), box(270, 100, 330, 150)];
    expect(findLabelCollisions([scene]).map((v) => v.rule)).toEqual(["label_on_plot"]);
  });

  it("finds the text of the tab over a plot, and lets the tab touch its own plot", () => {
    const scene = clean();
    scene.labels = [];
    scene.tabText = box(14, 14, 50, 32);
    scene.plots = [box(8, 36, 100, 90)];
    expect(findLabelCollisions([scene])).toEqual([]);
    scene.plots = [box(8, 30, 100, 90)];
    expect(findLabelCollisions([scene]).map((v) => v.rule)).toEqual(["label_on_plot"]);
  });
});

describe("the cost of a place (P19.2)", () => {
  const scene = (): Scene => ({ width: 360, height: 300, hard: [], lines: [], soft: [], plots: [box(100, 100, 140, 140)] });

  it("is zero for a place that keeps 2 px from a plot, and a caption costs more than that", () => {
    expect(CAPTION_COST).toBeGreaterThan(0);
    expect(cost(box(142, 100, 190, 116), scene())).toBe(0);
    expect(cost(box(60, 100, 98, 116), scene())).toBe(0);
  });

  it("costs more than a caption for a place over a plot, and for one that is less than 2 px from it", () => {
    expect(cost(box(120, 110, 170, 126), scene())).toBeGreaterThan(CAPTION_COST);
    expect(cost(box(139, 100, 190, 116), scene())).toBeGreaterThan(CAPTION_COST);
    expect(cost(box(141, 100, 190, 116), scene())).toBeGreaterThan(CAPTION_COST);
  });

  it("costs more than the worst line shortfall, so a place on a plot is never chosen over a place on the gravel strip", () => {
    const lined: Scene = { ...scene(), plots: [], lines: [{ points: [[0, 108], [360, 108]], clear: 8 }] };
    const onLine = cost(box(150, 100, 200, 116), lined);
    expect(onLine).toBeGreaterThan(CAPTION_COST);
    expect(cost(box(120, 110, 170, 126), scene())).toBeGreaterThan(onLine);
  });

  it("costs more for more overlap, so the cheapest place on a plot is the one that covers least", () => {
    expect(cost(box(130, 100, 180, 116), scene())).toBeLessThan(cost(box(110, 100, 160, 116), scene()));
  });
});
