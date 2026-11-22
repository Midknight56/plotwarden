// The footprint rules of the map (spec 02, design H2), against an oracle that is plain interval arithmetic.
// INV_GEOM_OVERLAP: two rectangles overlap exactly when their interiors meet. Touching is allowed.
// INV_GEOM_INSIDE: a rectangle is inside another exactly when it does not leave it. Touching the edge is allowed.
// INV_GEOM_SIMPLE: a rectangle is a good outline in every start and direction. Swapping two corners crosses itself.
// 1,000 cases for each set, recorded seeds.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkPolygon, polygonInside, polygonsOverlap } from "../../template/src/map/geometry";
import type { Pt } from "../../template/src/map/geometry";
import { runProperty } from "../helpers/property";
import { RUNS, SEEDS } from "./seeds";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const rect = (max: number) =>
  fc.record({ x: fc.integer({ min: 0, max: 30 }), y: fc.integer({ min: 0, max: 30 }), w: fc.integer({ min: 1, max }), h: fc.integer({ min: 1, max }) });

const corners = (r: Rect): Pt[] => [
  [r.x, r.y],
  [r.x + r.w, r.y],
  [r.x + r.w, r.y + r.h],
  [r.x, r.y + r.h],
];

// The oracle: intervals on each axis.
const meets = (a0: number, a1: number, b0: number, b1: number): boolean => a0 < b1 && b0 < a1;
const oracleOverlap = (a: Rect, b: Rect): boolean => meets(a.x, a.x + a.w, b.x, b.x + b.w) && meets(a.y, a.y + a.h, b.y, b.y + b.h);
const oracleInside = (i: Rect, o: Rect): boolean => o.x <= i.x && i.x + i.w <= o.x + o.w && o.y <= i.y && i.y + i.h <= o.y + o.h;

type Overlap = (a: readonly Pt[], b: readonly Pt[]) => boolean;

// A wrong version that counts touching as overlap. The property must be able to fail on it.
const touchingCounts: Overlap = (a, b) => {
  const box = (p: readonly Pt[]) => ({ x0: Math.min(...p.map((q) => q[0])), x1: Math.max(...p.map((q) => q[0])), y0: Math.min(...p.map((q) => q[1])), y1: Math.max(...p.map((q) => q[1])) });
  const m = box(a);
  const n = box(b);
  return m.x0 <= n.x1 && n.x0 <= m.x1 && m.y0 <= n.y1 && n.y0 <= m.y1;
};

const seen = { overlap: 0, touching: 0, apart: 0, inside: 0, edge: 0, outside: 0 };

function checkOverlap(overlap: Overlap, pair: { a: Rect; b: Rect; dx: number; dy: number }): void {
  const { a, b } = pair;
  const want = oracleOverlap(a, b);
  const got = overlap(corners(a), corners(b));
  if (got !== want) throw new Error(`INV_GEOM_OVERLAP: ${JSON.stringify(a)} and ${JSON.stringify(b)} should ${want ? "" : "not "}overlap`);
  // Symmetric, and the same after both move together.
  expect(overlap(corners(b), corners(a))).toBe(want);
  const move = (r: Rect): Rect => ({ ...r, x: r.x + pair.dx, y: r.y + pair.dy });
  expect(overlap(corners(move(a)), corners(move(b)))).toBe(want);
  if (want) seen.overlap += 1;
  else if (a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h) seen.touching += 1;
  else seen.apart += 1;
}
const pairArb = fc.record({ a: rect(15), b: rect(15), dx: fc.integer({ min: -20, max: 20 }), dy: fc.integer({ min: -20, max: 20 }) });

describe("properties of footprints on the map", () => {
  it(`INV_GEOM_OVERLAP holds for ${RUNS} generated pairs (seed ${SEEDS.INV_GEOM_OVERLAP})`, () => {
    const outcome = runProperty("INV_GEOM_OVERLAP", pairArb, (pair) => checkOverlap(polygonsOverlap, pair), { seed: SEEDS.INV_GEOM_OVERLAP });
    expect(outcome.cases).toBeGreaterThanOrEqual(RUNS);
  });

  it("really met overlapping, touching and separate rectangles", () => {
    const note = JSON.stringify(seen);
    expect(seen.overlap, note).toBeGreaterThan(100);
    expect(seen.touching, note).toBeGreaterThan(20);
    expect(seen.apart, note).toBeGreaterThan(100);
  });

  it("fails when touching is counted as overlap", () => {
    expect(() => runProperty("INV_GEOM_OVERLAP", pairArb, (pair) => checkOverlap(touchingCounts, pair), { seed: SEEDS.INV_GEOM_OVERLAP })).toThrow();
  });

  it(`INV_GEOM_INSIDE holds for ${RUNS} generated pairs (seed ${SEEDS.INV_GEOM_INSIDE})`, () => {
    const arb = fc.record({ inner: rect(12), outer: rect(40) });
    const outcome = runProperty(
      "INV_GEOM_INSIDE",
      arb,
      ({ inner, outer }) => {
        const want = oracleInside(inner, outer);
        const got = polygonInside(corners(inner), corners(outer));
        if (got !== want) throw new Error(`INV_GEOM_INSIDE: ${JSON.stringify(inner)} in ${JSON.stringify(outer)} should be ${want}`);
        if (want) {
          const edge = inner.x === outer.x || inner.y === outer.y || inner.x + inner.w === outer.x + outer.w || inner.y + inner.h === outer.y + outer.h;
          if (edge) seen.edge += 1;
          else seen.inside += 1;
        } else seen.outside += 1;
        // Whatever is inside is not outside the other way round, unless the two are the same shape.
        if (want && !(inner.x === outer.x && inner.y === outer.y && inner.w === outer.w && inner.h === outer.h)) {
          expect(polygonInside(corners(outer), corners(inner))).toBe(false);
        }
      },
      { seed: SEEDS.INV_GEOM_INSIDE },
    );
    expect(outcome.cases).toBeGreaterThanOrEqual(RUNS);
    const note = JSON.stringify(seen);
    expect(seen.inside, note).toBeGreaterThan(20);
    expect(seen.edge, note).toBeGreaterThan(20);
    expect(seen.outside, note).toBeGreaterThan(100);
  });

  it(`INV_GEOM_SIMPLE holds for ${RUNS} generated rectangles (seed ${SEEDS.INV_GEOM_SIMPLE})`, () => {
    const arb = fc.record({ r: rect(20), start: fc.integer({ min: 0, max: 3 }), reversed: fc.boolean() });
    const outcome = runProperty(
      "INV_GEOM_SIMPLE",
      arb,
      ({ r, start, reversed }) => {
        const c = corners(r);
        // The same outline from any corner and in either direction is accepted.
        let order = [0, 1, 2, 3].map((i) => c[(i + start) % 4] as Pt);
        if (reversed) order = [...order].reverse();
        const good = checkPolygon(order);
        if (!good.ok) throw new Error(`INV_GEOM_SIMPLE: ${JSON.stringify(r)} refused as ${good.error.code}`);
        // Swapping two neighbouring corners makes a bow tie.
        const bow = [order[0] as Pt, order[2] as Pt, order[1] as Pt, order[3] as Pt];
        const bad = checkPolygon(bow);
        if (bad.ok) throw new Error(`INV_GEOM_SIMPLE: the bow tie of ${JSON.stringify(r)} was accepted`);
        expect(bad.error.code).toBe("self_crossing");
      },
      { seed: SEEDS.INV_GEOM_SIMPLE },
    );
    expect(outcome.cases).toBeGreaterThanOrEqual(RUNS);
  });
});
