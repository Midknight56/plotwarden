// T04 (geometry) and the vertex part of T32. Requirements P3.
// Every polygon here is small enough to check by eye on squared paper.
import { describe, expect, it } from "vitest";
import {
  centroid,
  checkPath,
  checkPolygon,
  pathCrossings,
  pointHolder,
  pointInPolygon,
  polygonArea2,
  polygonInside,
  polygonsOverlap,
  segmentsRelation,
} from "../../template/src/map/geometry";
import type { Pt } from "../../template/src/map/geometry";

const square = (x: number, y: number, size: number): Pt[] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
];

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** An L shape: a 20 by 20 square with its north east 10 by 10 corner cut away. */
const L: Pt[] = [
  [0, 0],
  [20, 0],
  [20, 10],
  [10, 10],
  [10, 20],
  [0, 20],
];

/** A simple polygon with exactly n vertices: a base and a zig zag top. */
function sawtooth(n: number): Pt[] {
  const points: Pt[] = [
    [0, 0],
    [2000, 0],
  ];
  for (let k = 0; k < n - 2; k += 1) points.push([1990 - 7 * k, 100 + (k % 2) * 50]);
  return points;
}

describe("area", () => {
  it("is twice the area, positive counter clockwise", () => {
    expect(polygonArea2(rect(0, 0, 10, 5))).toBe(100);
    expect(polygonArea2([...rect(0, 0, 10, 5)].reverse())).toBe(-100);
    expect(polygonArea2(L)).toBe(600);
  });
});

describe("segments", () => {
  it.each([
    ["cross", [0, 0], [10, 10], [0, 10], [10, 0]],
    ["touch", [0, 0], [10, 0], [5, 0], [5, 5]],
    ["touch", [0, 0], [5, 0], [5, 0], [10, 0]],
    ["touch", [0, 0], [5, 5], [5, 5], [9, 1]],
    ["overlap", [0, 0], [10, 0], [5, 0], [15, 0]],
    ["overlap", [0, 0], [10, 0], [0, 0], [10, 0]],
    ["none", [0, 0], [10, 0], [0, 1], [10, 1]],
    ["none", [0, 0], [1, 1], [5, 5], [6, 6]],
    ["none", [0, 0], [10, 0], [5, 1], [5, 5]],
  ] as [string, Pt, Pt, Pt, Pt][])("%s for %j %j %j %j", (expected, a, b, c, d) => {
    expect(segmentsRelation(a, b, c, d)).toBe(expected);
    expect(segmentsRelation(c, d, a, b)).toBe(expected);
  });
});

describe("a polygon", () => {
  it("accepts a triangle, a rectangle and a concave shape", () => {
    expect(checkPolygon([[0, 0], [10, 0], [0, 10]]).ok).toBe(true);
    expect(checkPolygon(rect(0, 0, 10, 5)).ok).toBe(true);
    expect(checkPolygon(L).ok).toBe(true);
  });

  it("accepts the full site", () => {
    expect(checkPolygon(rect(0, 0, 10000, 10000)).ok).toBe(true);
  });

  const code = (points: Pt[]) => {
    const r = checkPolygon(points);
    return r.ok ? "ok" : r.error.code;
  };

  it("needs three points", () => {
    expect(code([[0, 0], [10, 0]])).toBe("too_few_points");
    expect(code([])).toBe("too_few_points");
  });

  it("refuses a bow tie", () => {
    expect(code([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe("self_crossing");
  });

  it("refuses a point that repeats the one before it, or the first at the end", () => {
    expect(code([[0, 0], [10, 0], [10, 0], [0, 10]])).toBe("not_distinct");
    expect(code([[0, 0], [10, 0], [0, 10], [0, 0]])).toBe("not_distinct");
  });

  it("refuses points on one line", () => {
    expect(code([[0, 0], [5, 0], [10, 0]])).toBe("zero_area");
  });

  it("refuses an edge that folds back on the one before it", () => {
    expect(code([[0, 0], [10, 0], [5, 0], [5, 5]])).toBe("self_crossing");
  });

  it("refuses a vertex that touches another edge", () => {
    // The vertex (5, 0) lies on the edge from (0, 0) to (10, 0).
    expect(code([[0, 0], [10, 0], [10, 10], [5, 0], [0, 10]])).toBe("self_crossing");
  });

  it("refuses a coordinate that is not an integer from 0 to 10,000", () => {
    expect(code([[0, 0], [10001, 0], [0, 10]])).not.toBe("ok");
    expect(code([[0, 0], [10, 0], [-1, 10]])).not.toBe("ok");
    expect(code([[0, 0], [10.5, 0], [0, 10]])).not.toBe("ok");
    expect(code([[0, 0], [Number.NaN, 0], [0, 10]])).not.toBe("ok");
  });

  it("accepts 256 vertices and refuses 257", () => {
    expect(checkPolygon(sawtooth(256)).ok).toBe(true);
    const over = checkPolygon(sawtooth(257));
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.error.code).toBe("over_limit");
      expect(over.error.detail).toMatchObject({ item: "polygonVertices", limit: 256, value: 257 });
    }
  });
});

describe("a path", () => {
  it("needs two points", () => {
    expect(checkPath([[0, 0], [10, 10]]).ok).toBe(true);
    const one = checkPath([[0, 0]]);
    expect(!one.ok && one.error.code).toBe("too_few_points");
  });

  it("refuses an adjacent repeat and a bad coordinate", () => {
    const same = checkPath([[0, 0], [0, 0], [5, 5]]);
    expect(!same.ok && same.error.code).toBe("not_distinct");
    expect(checkPath([[0, 0], [10001, 5]]).ok).toBe(false);
  });

  it("accepts 256 points and refuses 257", () => {
    const line = (n: number): Pt[] => Array.from({ length: n }, (_, i) => [i * 10, 5] as Pt);
    expect(checkPath(line(256)).ok).toBe(true);
    const over = checkPath(line(257));
    expect(!over.ok && over.error.code).toBe("over_limit");
  });
});

describe("a point in a polygon", () => {
  it("tells inside, outside and on the edge", () => {
    const sq = square(0, 0, 10);
    expect(pointInPolygon([5, 5], sq)).toBe("inside");
    expect(pointInPolygon([15, 5], sq)).toBe("outside");
    expect(pointInPolygon([10, 5], sq)).toBe("on");
    expect(pointInPolygon([0, 0], sq)).toBe("on");
    expect(pointInPolygon([15, 15], L)).toBe("outside");
    expect(pointInPolygon([5, 15], L)).toBe("inside");
  });
});

describe("overlap in area", () => {
  it.each([
    ["overlapping squares", square(0, 0, 10), square(5, 5, 10), true],
    ["touching along an edge", square(0, 0, 10), square(10, 0, 10), false],
    ["touching at a corner", square(0, 0, 10), square(10, 10, 10), false],
    ["apart", square(0, 0, 10), square(20, 0, 10), false],
    ["one inside the other", square(0, 0, 10), square(2, 2, 3), true],
    ["equal", square(0, 0, 10), square(0, 0, 10), true],
    ["sharing part of an edge and side by side", rect(0, 0, 10, 10), rect(10, 5, 20, 15), false],
    ["a plus shape with no vertex inside the other", rect(0, 4, 10, 6), rect(4, 0, 6, 10), true],
    ["a square in the notch of an L, touching", L, square(10, 10, 10), false],
    ["a square that enters the notch of an L", L, square(5, 5, 10), true],
  ] as [string, Pt[], Pt[], boolean][])("%s", (_name, a, b, expected) => {
    expect(polygonsOverlap(a, b)).toBe(expected);
    expect(polygonsOverlap(b, a)).toBe(expected);
  });

  it("does not depend on the direction the points run", () => {
    expect(polygonsOverlap([...square(0, 0, 10)].reverse(), square(5, 5, 10))).toBe(true);
    expect(polygonsOverlap([...square(0, 0, 10)].reverse(), square(10, 0, 10))).toBe(false);
  });
});

describe("one polygon inside another", () => {
  it.each([
    ["inside", square(2, 2, 3), square(0, 0, 10), true],
    ["touching the outline from inside", square(0, 0, 5), square(0, 0, 10), true],
    ["equal", square(0, 0, 10), square(0, 0, 10), true],
    ["crossing the outline", square(5, 5, 10), square(0, 0, 10), false],
    ["outside", square(20, 20, 3), square(0, 0, 10), false],
    ["bigger", square(0, 0, 10), square(2, 2, 3), false],
    ["across the notch of an L", square(5, 5, 10), L, false],
    ["in an arm of the L", square(1, 1, 5), L, true],
  ] as [string, Pt[], Pt[], boolean][])("%s", (_name, inner, outer, expected) => {
    expect(polygonInside(inner, outer)).toBe(expected);
  });
});

describe("a path across plots", () => {
  const plots: { id: string; points: Pt[] }[] = [
    { id: "C001", points: square(0, 0, 10) },
    { id: "C002", points: square(10, 0, 10) },
    { id: "C003", points: square(30, 0, 10) },
  ];

  it("names each plot whose inside the path crosses", () => {
    expect(pathCrossings([[-5, 5], [25, 5]], plots)).toEqual(["C001", "C002"]);
  });

  it("allows a path along an edge or past a corner", () => {
    expect(pathCrossings([[0, 10], [40, 10]], plots)).toEqual([]);
    expect(pathCrossings([[-5, -5], [0, 0]], plots)).toEqual([]);
    expect(pathCrossings([[0, -5], [0, 15]], plots)).toEqual([]);
  });

  it("allows a path between plots", () => {
    expect(pathCrossings([[25, -5], [25, 15]], plots)).toEqual([]);
  });

  it("refuses a path that is wholly inside a plot", () => {
    expect(pathCrossings([[32, 5], [38, 5]], plots)).toEqual(["C003"]);
  });

  it("counts a path that ends inside a plot", () => {
    expect(pathCrossings([[-5, 5], [5, 5]], plots)).toEqual(["C001"]);
  });
});

describe("which footprint holds a point", () => {
  const plots = [
    { id: "A", points: square(0, 0, 10) },
    { id: "B", points: square(10, 0, 10) },
  ];

  it("names the footprint that holds it", () => {
    expect(pointHolder([5, 5], plots)).toBe("A");
    expect(pointHolder([15, 5], plots)).toBe("B");
  });

  it("names nothing for a point on an edge that two footprints share", () => {
    expect(pointHolder([10, 5], plots)).toBeUndefined();
  });

  it("names the footprint for a point on an edge only it has", () => {
    expect(pointHolder([0, 5], plots)).toBe("A");
  });

  it("names nothing outside", () => {
    expect(pointHolder([50, 50], plots)).toBeUndefined();
  });
});

describe("centre", () => {
  it("is the middle of a rectangle", () => {
    expect(centroid(rect(0, 0, 10, 20))).toEqual([5, 10]);
  });
});
