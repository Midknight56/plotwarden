// Points, the site to screen transform, rotation and the backdrop transform. Pure.
import { COORDINATE_MAX, checkCoordinate } from "../limits";
import { err, ok } from "../types";
import type { Result } from "../types";

/** East first, north second. Integers from 0 to 10,000. Origin south west. */
export type Point = readonly [number, number];

export interface View {
  /** The site point drawn at the bottom left of the view. */
  minEast: number;
  minNorth: number;
  /** Pixels per site unit. */
  scale: number;
  /** Height of the view in pixels. */
  height: number;
}

export interface Bounds {
  minEast: number;
  minNorth: number;
  maxEast: number;
  maxNorth: number;
}

export interface BackdropTransform {
  /** Percent, 1 to 1000. */
  scale: number;
  /** Site units, -10,000 to 10,000. */
  east: number;
  north: number;
  /** Counter clockwise degrees, 0 to 359. */
  turn: number;
  /** Percent, 0 to 100. */
  opacity: number;
}

export const DEFAULT_BACKDROP: Readonly<BackdropTransform> = Object.freeze({
  scale: 100,
  east: 0,
  north: 0,
  turn: 0,
  opacity: 50,
});

/** Turn negative zero into zero, so equal points compare equal. */
function clean(n: number): number {
  return n === 0 ? 0 : n;
}

/** True for two integers from 0 to 10,000. */
export function isPoint(value: unknown): value is Point {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    checkCoordinate(value[0]).ok &&
    checkCoordinate(value[1]).ok
  );
}

export function checkPoint(p: readonly [number, number]): Result<true> {
  const east = checkCoordinate(p[0]);
  if (!east.ok) return east;
  return checkCoordinate(p[1]);
}

/** Site point to screen pixels. North is flipped here, once. */
export function toScreen(p: readonly [number, number], view: View): [number, number] {
  return [clean((p[0] - view.minEast) * view.scale), clean(view.height - (p[1] - view.minNorth) * view.scale)];
}

/** Screen pixels to the nearest site point. A point outside 0 to 10,000 is refused, never clamped. */
export function fromScreen(s: readonly [number, number], view: View): Result<Point> {
  const east = Math.round(s[0] / view.scale + view.minEast);
  const north = Math.round((view.height - s[1]) / view.scale + view.minNorth);
  const point: [number, number] = [clean(east), clean(north)];
  const checked = checkPoint(point);
  if (!checked.ok) return checked;
  return ok(point);
}

/** Exact sine and cosine at quarter turns, so a quarter turn carries no error. */
function sinCos(degrees: number): [number, number] {
  const d = ((degrees % 360) + 360) % 360;
  if (d === 0) return [0, 1];
  if (d === 90) return [1, 0];
  if (d === 180) return [0, -1];
  if (d === 270) return [-1, 0];
  const r = (d * Math.PI) / 180;
  return [Math.sin(r), Math.cos(r)];
}

function rotateExact(p: readonly [number, number], origin: readonly [number, number], degrees: number): [number, number] {
  const [sin, cos] = sinCos(degrees);
  const dx = p[0] - origin[0];
  const dy = p[1] - origin[1];
  return [origin[0] + dx * cos - dy * sin, origin[1] + dx * sin + dy * cos];
}

/** Rotate counter clockwise about an origin and round to integers. */
export function rotatePoint(
  p: readonly [number, number],
  origin: readonly [number, number],
  degrees: number,
): [number, number] {
  const [x, y] = rotateExact(p, origin, degrees);
  return [clean(Math.round(x)), clean(Math.round(y))];
}

export function boundsOf(points: readonly (readonly [number, number])[]): Bounds | undefined {
  const first = points[0];
  if (first === undefined) return undefined;
  const b: Bounds = { minEast: first[0], minNorth: first[1], maxEast: first[0], maxNorth: first[1] };
  for (const p of points) {
    if (p[0] < b.minEast) b.minEast = p[0];
    if (p[1] < b.minNorth) b.minNorth = p[1];
    if (p[0] > b.maxEast) b.maxEast = p[0];
    if (p[1] > b.maxNorth) b.maxNorth = p[1];
  }
  return b;
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function checkBackdropTransform(t: BackdropTransform): Result<BackdropTransform> {
  const checks: [keyof BackdropTransform, boolean][] = [
    ["scale", inRange(t.scale, 1, 1000)],
    ["east", inRange(t.east, -COORDINATE_MAX, COORDINATE_MAX)],
    ["north", inRange(t.north, -COORDINATE_MAX, COORDINATE_MAX)],
    ["turn", inRange(t.turn, 0, 359)],
    ["opacity", inRange(t.opacity, 0, 100)],
  ];
  for (const [field, good] of checks) {
    if (!good) return err("bad_backdrop", { field, value: t[field] }, { fields: [{ field, code: "out_of_range" }] });
  }
  return ok({ scale: t.scale, east: t.east, north: t.north, turn: t.turn, opacity: t.opacity });
}

/** Image local point (u east, v north, from the image bottom left) to a site point. */
export function backdropToSite(t: BackdropTransform, image: readonly [number, number]): [number, number] {
  const s = t.scale / 100;
  const [x, y] = rotateExact([image[0] * s, image[1] * s], [0, 0], t.turn);
  return [clean(x + t.east), clean(y + t.north)];
}

/** The SVG matrix that draws an image (top left origin, y down) on a view. */
export function backdropMatrix(
  t: BackdropTransform,
  imageHeight: number,
  view: View,
): [number, number, number, number, number, number] {
  const at = (px: number, py: number): [number, number] => toScreen(backdropToSite(t, [px, imageHeight - py]), view);
  const o = at(0, 0);
  const u = at(1, 0);
  const v = at(0, 1);
  return [u[0] - o[0], u[1] - o[1], v[0] - o[0], v[1] - o[1], o[0], o[1]];
}
