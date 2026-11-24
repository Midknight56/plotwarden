// A tap or a click on the drawn map picks a plot, or picks nothing. Expected values are worked by hand from the
// boxes written in each case. A point that two plots could claim, or that a finger could have meant for another
// plot, picks nothing: a wrong plot is worse than none.
import { describe, expect, it } from "vitest";
import { pickPlot, pickRadius } from "../../template/src/map/pick";

type P = Parameters<typeof pickPlot>[0][number];

/** A rectangle footprint from its corners. */
function rect(plotId: string, x0: number, y0: number, x1: number, y1: number): P {
  return {
    plotId,
    points: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ],
    box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
  };
}

const POLY = { shape: "polygon", radius: 0 } as const;

describe("picking a plot from a point on the sheet", () => {
  const a = rect("A", 100, 100, 160, 160);

  it("picks the plot that holds the point, with no radius", () => {
    expect(pickPlot([a], [130, 130], POLY)).toBe("A");
    expect(pickPlot([a], [101, 159], POLY)).toBe("A");
  });

  it("picks nothing on open ground, and nothing when there are no plots", () => {
    expect(pickPlot([a], [50, 50], POLY)).toBeUndefined();
    expect(pickPlot([a], [160.5, 130], POLY)).toBeUndefined();
    expect(pickPlot([], [130, 130], POLY)).toBeUndefined();
  });

  it("picks nothing for a point that is not a number", () => {
    expect(pickPlot([a], [Number.NaN, 130], POLY)).toBeUndefined();
    expect(pickPlot([a], [130, Number.POSITIVE_INFINITY], POLY)).toBeUndefined();
  });

  it("picks nothing on the shared boundary of two plots that touch", () => {
    const b = rect("B", 160, 100, 220, 160);
    expect(pickPlot([a, b], [160, 130], POLY)).toBeUndefined();
    // One hundredth of a pixel inside A is A, with no radius.
    expect(pickPlot([a, b], [159.99, 130], POLY)).toBe("A");
  });

  it("picks nothing where two plots overlap", () => {
    const b = rect("B", 140, 100, 220, 160);
    expect(pickPlot([a, b], [150, 130], POLY)).toBeUndefined();
    expect(pickPlot([a, b], [110, 130], POLY)).toBe("A");
    expect(pickPlot([a, b], [200, 130], POLY)).toBe("B");
  });

  it("picks nothing when another plot is within the radius of the point, and the plot when none is", () => {
    // B stands 10 px to the right of A. The point (156, 130) is inside A and 14 px from B. A radius of 14 reaches B.
    const b = rect("B", 170, 100, 230, 160);
    expect(pickPlot([a, b], [156, 130], { shape: "polygon", radius: 5 })).toBe("A");
    expect(pickPlot([a, b], [156, 130], { shape: "polygon", radius: 13 })).toBe("A");
    expect(pickPlot([a, b], [156, 130], { shape: "polygon", radius: 14 })).toBeUndefined();
    expect(pickPlot([a, b], [156, 130], { shape: "polygon", radius: 20 })).toBeUndefined();
    // The point (148, 130) is 22 px from B and the point (130, 130) is 40 px from it.
    expect(pickPlot([a, b], [148, 130], { shape: "polygon", radius: 12 })).toBe("A");
    expect(pickPlot([a, b], [130, 130], { shape: "polygon", radius: 12 })).toBe("A");
  });

  it("measures the distance to the nearest edge or corner, not to the middle", () => {
    // B lies diagonally off the corner (160, 160) of A, and its nearest corner is (170, 170).
    const b = rect("B", 170, 170, 230, 230);
    // The point (150, 150) is inside A. Its nearest point of B is that corner: 20 px by 20 px, which is 28.28 px.
    expect(pickPlot([a, b], [150, 150], { shape: "polygon", radius: 28 })).toBe("A");
    expect(pickPlot([a, b], [150, 150], { shape: "polygon", radius: 29 })).toBeUndefined();
  });

  it("lets a small plot be picked with a mouse and not with a finger when its neighbours stand close", () => {
    // Two 8 px plots with 4 px between them. The middle of the first is 4 px from its own edge and 8 px from the second.
    const small = rect("S1", 100, 100, 108, 140);
    const next = rect("S2", 112, 100, 120, 140);
    expect(pickPlot([small, next], [104, 120], { shape: "polygon", radius: pickRadius("mouse") })).toBe("S1");
    expect(pickPlot([small, next], [104, 120], { shape: "polygon", radius: pickRadius("touch") })).toBeUndefined();
  });

  it("does not pick a plot for a point outside every plot, even when exactly one is near", () => {
    expect(pickPlot([a], [165, 130], { shape: "polygon", radius: 12 })).toBeUndefined();
  });

  it("reads a footprint that is not a rectangle", () => {
    const triangle: P = { plotId: "T", points: [[0, 0], [100, 0], [0, 100]], box: { x: 0, y: 0, width: 100, height: 100 } };
    expect(pickPlot([triangle], [20, 20], POLY)).toBe("T");
    expect(pickPlot([triangle], [80, 80], POLY)).toBeUndefined();
    // On the long edge itself.
    expect(pickPlot([triangle], [50, 50], POLY)).toBe("T");
  });
});

describe("picking an arch drawn from a box", () => {
  // A 40 by 60 box at (100, 100): the arch has a flat base at y 160 and a round top. Its radius is 20, so the top
  // 20 px are a half ellipse centred on (120, 120).
  const box = { x: 100, y: 100, width: 40, height: 60 };
  const arch: P = { plotId: "H", points: [], box };
  const ARCH = { shape: "arch", radius: 0 } as const;

  it("picks the middle and the straight sides, and not the empty corner above the curve", () => {
    expect(pickPlot([arch], [120, 140], ARCH)).toBe("H");
    expect(pickPlot([arch], [101, 150], ARCH)).toBe("H");
    expect(pickPlot([arch], [120, 101], ARCH)).toBe("H");
    expect(pickPlot([arch], [101, 101], ARCH)).toBeUndefined();
    expect(pickPlot([arch], [139, 101], ARCH)).toBeUndefined();
  });

  it("keeps a box narrower than 6 px at 6 px wide, as the drawing does", () => {
    const thin: P = { plotId: "N", points: [], box: { x: 100, y: 100, width: 2, height: 40 } };
    // The drawn arch is 6 px wide, centred on the box: x from 98 to 104.
    expect(pickPlot([thin], [98.5, 130], ARCH)).toBe("N");
    expect(pickPlot([thin], [103.5, 130], ARCH)).toBe("N");
    expect(pickPlot([thin], [105, 130], ARCH)).toBeUndefined();
  });

  it("picks nothing between two arches that stand side by side, with a finger", () => {
    const next: P = { plotId: "I", points: [], box: { x: 150, y: 100, width: 40, height: 60 } };
    const finger = { shape: "arch", radius: pickRadius("touch") } as const;
    expect(pickPlot([arch, next], [145, 140], finger)).toBeUndefined();
    expect(pickPlot([arch, next], [120, 140], finger)).toBe("H");
    expect(pickPlot([arch, next], [145, 140], ARCH)).toBeUndefined();
  });
});

describe("the radius of each kind of pointer", () => {
  it("is nothing for a mouse, small for a pen and the largest for a finger", () => {
    expect(pickRadius("mouse")).toBe(0);
    expect(pickRadius("pen")).toBeGreaterThan(0);
    expect(pickRadius("touch")).toBeGreaterThan(pickRadius("pen"));
  });

  it("treats a pointer of an unknown kind as a finger", () => {
    expect(pickRadius("")).toBe(pickRadius("touch"));
    expect(pickRadius("something else")).toBe(pickRadius("touch"));
  });
});
