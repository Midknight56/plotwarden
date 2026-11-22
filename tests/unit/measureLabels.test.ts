// The layout measurement for map labels (spec 04, A12). The measurement reads the page into plain data and checks
// that data, so it is tried here without a browser. The two cases found in the churchyard map are the first two.
import { describe, expect, it } from "vitest";
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