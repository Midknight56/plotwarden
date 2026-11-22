// Polygon and path checks on integer points. Pure.
// Coordinates are integers from 0 to 10,000, so every cross product below is
// an exact integer. Crossing tests need no tolerance.
import { checkLimit } from "../limits";
import { err, ok } from "../types";
import type { Result } from "../types";
import { checkPoint } from "./coordinates";

export type Pt = readonly [number, number];

export type Relation = "none" | "touch" | "cross" | "overlap";

export interface Shape {
  id: string;
  points: readonly Pt[];
}

type Where = "inside" | "outside" | "on";

function orient(a: Pt, b: Pt, c: Pt): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function sign(n: number): -1 | 0 | 1 {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/** For a point known to be collinear with a and b: is it between them. */
function between(a: Pt, b: Pt, c: Pt): boolean {
  return (
    c[0] >= Math.min(a[0], b[0]) &&
    c[0] <= Math.max(a[0], b[0]) &&
    c[1] >= Math.min(a[1], b[1]) &&
    c[1] <= Math.max(a[1], b[1])
  );
}

/** Twice the signed area. Positive for counter clockwise. An integer for integer points. */
export function polygonArea2(points: readonly Pt[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i] as Pt;
    const b = points[(i + 1) % points.length] as Pt;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum;
}

export function segmentsRelation(p1: Pt, p2: Pt, q1: Pt, q2: Pt): Relation {
  const o1 = sign(orient(p1, p2, q1));
  const o2 = sign(orient(p1, p2, q2));
  const o3 = sign(orient(q1, q2, p1));
  const o4 = sign(orient(q1, q2, p2));
  if (o1 === 0 && o2 === 0) {
    const useX = p1[0] !== p2[0] || q1[0] !== q2[0];
    const axis = useX ? 0 : 1;
    const a0 = Math.min(p1[axis], p2[axis]);
    const a1 = Math.max(p1[axis], p2[axis]);
    const b0 = Math.min(q1[axis], q2[axis]);
    const b1 = Math.max(q1[axis], q2[axis]);
    const lo = Math.max(a0, b0);
    const hi = Math.min(a1, b1);
    if (lo > hi) return "none";
    return lo === hi ? "touch" : "overlap";
  }
  if (o1 * o2 < 0 && o3 * o4 < 0) return "cross";
  if (
    (o1 === 0 && between(p1, p2, q1)) ||
    (o2 === 0 && between(p1, p2, q2)) ||
    (o3 === 0 && between(q1, q2, p1)) ||
    (o4 === 0 && between(q1, q2, p2))
  ) {
    return "touch";
  }
  return "none";
}

function checkPoints(points: readonly Pt[], minPoints: number): Result<true> {
  if (points.length < minPoints) return err("too_few_points", { count: points.length, min: minPoints });
  const count = checkLimit("polygonVertices", points.length);
  if (!count.ok) return count;
  for (const [index, p] of points.entries()) {
    if (!checkPoint(p).ok) return err("bad_coordinate", { index, east: p[0], north: p[1] });
  }
  return ok(true);
}

function sameBy(a: Pt, b: Pt): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function checkPolygon(points: readonly Pt[]): Result<true> {
  const base = checkPoints(points, 3);
  if (!base.ok) return base;
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    if (sameBy(points[i] as Pt, points[(i + 1) % n] as Pt)) return err("not_distinct", { index: i });
  }
  const first = points[0] as Pt;
  const second = points[1] as Pt;
  if (points.every((p) => orient(first, second, p) === 0)) return err("zero_area");

  for (let i = 0; i < n; i += 1) {
    const a1 = points[i] as Pt;
    const a2 = points[(i + 1) % n] as Pt;
    for (let j = i + 1; j < n; j += 1) {
      const b1 = points[j] as Pt;
      const b2 = points[(j + 1) % n] as Pt;
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      const relation = segmentsRelation(a1, a2, b1, b2);
      if (adjacent ? relation === "overlap" : relation !== "none") return err("self_crossing", { edge: i, other: j });
    }
  }
  if (polygonArea2(points) === 0) return err("zero_area");
  return ok(true);
}

export function checkPath(points: readonly Pt[]): Result<true> {
  const base = checkPoints(points, 2);
  if (!base.ok) return base;
  for (let i = 0; i + 1 < points.length; i += 1) {
    if (sameBy(points[i] as Pt, points[i + 1] as Pt)) return err("not_distinct", { index: i });
  }
  return ok(true);
}

/** Crossing number for any point, with the half open rule so a ray through a vertex counts once. */
function crossingNumberInside(x: number, y: number, polygon: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i] as Pt;
    const b = polygon[(i + 1) % polygon.length] as Pt;
    if (a[1] > y !== b[1] > y) {
      const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (b[1] > a[1] ? c > 0 : c < 0) inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygon(p: Pt, polygon: readonly Pt[]): Where {
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i] as Pt;
    const b = polygon[(i + 1) % polygon.length] as Pt;
    if (orient(a, b, p) === 0 && between(a, b, p)) return "on";
  }
  return crossingNumberInside(p[0], p[1], polygon) ? "inside" : "outside";
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boxOf(points: readonly Pt[]): Box {
  const first = points[0] as Pt;
  const box: Box = { minX: first[0], minY: first[1], maxX: first[0], maxY: first[1] };
  for (const p of points) {
    if (p[0] < box.minX) box.minX = p[0];
    if (p[1] < box.minY) box.minY = p[1];
    if (p[0] > box.maxX) box.maxX = p[0];
    if (p[1] > box.maxY) box.maxY = p[1];
  }
  return box;
}

function boxesTouch(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

/**
 * Split the segment p to q where it meets the polygon's edges and vertices,
 * and say for each piece whether its midpoint is inside, outside or on the
 * polygon's boundary.
 */
function pieces(p: Pt, q: Pt, polygon: readonly Pt[]): Where[] {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const param = (pt: Pt) => (dx !== 0 ? (pt[0] - p[0]) / dx : (pt[1] - p[1]) / dy);
  const segBox: Box = {
    minX: Math.min(p[0], q[0]),
    minY: Math.min(p[1], q[1]),
    maxX: Math.max(p[0], q[0]),
    maxY: Math.max(p[1], q[1]),
  };
  const ts: number[] = [0, 1];
  const n = polygon.length;
  for (let i = 0; i < n; i += 1) {
    const r = polygon[i] as Pt;
    const s = polygon[(i + 1) % n] as Pt;
    if (!boxesTouch(segBox, { minX: Math.min(r[0], s[0]), minY: Math.min(r[1], s[1]), maxX: Math.max(r[0], s[0]), maxY: Math.max(r[1], s[1]) })) {
      continue;
    }
    const relation = segmentsRelation(p, q, r, s);
    if (relation === "none") continue;
    if (relation === "cross") {
      const denominator = dx * (s[1] - r[1]) - dy * (s[0] - r[0]);
      const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / denominator;
      ts.push(t);
    } else {
      for (const pt of [r, s]) if (orient(p, q, pt) === 0 && between(p, q, pt)) ts.push(param(pt));
    }
  }
  ts.sort((a, b) => a - b);
  const result: Where[] = [];
  for (let k = 0; k + 1 < ts.length; k += 1) {
    const t0 = ts[k] as number;
    const t1 = ts[k + 1] as number;
    if (t1 - t0 < 1e-12) continue;
    const t = (t0 + t1) / 2;
    const mx = p[0] + dx * t;
    const my = p[1] + dy * t;
    let onBoundary = false;
    for (let i = 0; i < n && !onBoundary; i += 1) {
      const r = polygon[i] as Pt;
      const s = polygon[(i + 1) % n] as Pt;
      if (orient(r, s, p) === 0 && orient(r, s, q) === 0) {
        const eps = 1e-9;
        onBoundary =
          mx >= Math.min(r[0], s[0]) - eps &&
          mx <= Math.max(r[0], s[0]) + eps &&
          my >= Math.min(r[1], s[1]) - eps &&
          my <= Math.max(r[1], s[1]) + eps;
      }
    }
    result.push(onBoundary ? "on" : crossingNumberInside(mx, my, polygon) ? "inside" : "outside");
  }
  return result;
}

function boundaryVersus(a: readonly Pt[], b: readonly Pt[]): Where[] {
  const all: Where[] = [];
  for (let i = 0; i < a.length; i += 1) {
    all.push(...pieces(a[i] as Pt, a[(i + 1) % a.length] as Pt, b));
  }
  return all;
}

/** True when the insides share area. Touching along an edge or at a corner is not an overlap. */
export function polygonsOverlap(a: readonly Pt[], b: readonly Pt[]): boolean {
  const boxA = boxOf(a);
  const boxB = boxOf(b);
  if (boxA.maxX <= boxB.minX || boxB.maxX <= boxA.minX || boxA.maxY <= boxB.minY || boxB.maxY <= boxA.minY) {
    return false;
  }
  const aVersusB = boundaryVersus(a, b);
  if (aVersusB.includes("inside")) return true;
  const bVersusA = boundaryVersus(b, a);
  if (bVersusA.includes("inside")) return true;
  // Two simple polygons whose insides meet either have a boundary inside the other or are equal.
  return aVersusB.every((w) => w === "on") && bVersusA.every((w) => w === "on");
}

/** True when the inner polygon lies inside the outer one. Touching the outline is allowed. */
export function polygonInside(inner: readonly Pt[], outer: readonly Pt[]): boolean {
  const boxI = boxOf(inner);
  const boxO = boxOf(outer);
  if (boxI.minX < boxO.minX || boxI.minY < boxO.minY || boxI.maxX > boxO.maxX || boxI.maxY > boxO.maxY) return false;
  return !boundaryVersus(inner, outer).includes("outside");
}

/** The IDs of footprints whose inside a path crosses. */
export function pathCrossings(path: readonly Pt[], footprints: readonly Shape[]): string[] {
  const found: string[] = [];
  const pathBox = boxOf(path);
  for (const shape of footprints) {
    if (!boxesTouch(pathBox, boxOf(shape.points))) continue;
    for (let i = 0; i + 1 < path.length; i += 1) {
      const p = path[i] as Pt;
      const q = path[i + 1] as Pt;
      if (sameBy(p, q)) continue;
      if (pieces(p, q, shape.points).includes("inside")) {
        found.push(shape.id);
        break;
      }
    }
  }
  return found;
}

/** The footprint that holds a point. A point on an edge that two footprints share is held by neither. */
export function pointHolder(point: Pt, footprints: readonly Shape[]): string | undefined {
  const inside: string[] = [];
  const on: string[] = [];
  for (const shape of footprints) {
    const where = pointInPolygon(point, shape.points);
    if (where === "inside") inside.push(shape.id);
    else if (where === "on") on.push(shape.id);
  }
  if (inside.length === 1 && on.length === 0) return inside[0];
  if (inside.length === 0 && on.length === 1) return on[0];
  return undefined;
}

export function centroid(polygon: readonly Pt[]): [number, number] {
  const area2 = polygonArea2(polygon);
  if (area2 === 0) {
    const box = boxOf(polygon);
    return [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2];
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i] as Pt;
    const b = polygon[(i + 1) % polygon.length] as Pt;
    const cross = a[0] * b[1] - b[0] * a[1];
    cx += (a[0] + b[0]) * cross;
    cy += (a[1] + b[1]) * cross;
  }
  return [cx / (3 * area2), cy / (3 * area2)];
}
