// Which plot a tap or a click on the drawn map means. Pure.
//
// A plot is picked only when the point is inside it, no other plot holds the point too, and no other plot lies within
// `radius` pixels of it. A point between two plots, on the line where they touch, on open ground or too near another
// plot for a finger to be sure picks nothing. The caller keeps the choice it had. The map never guesses the nearest plot.
import type { SheetPlot } from "./sheet";

export type PickShape = "arch" | "polygon";

export interface PickOptions {
  /** How the plots are drawn: an arch inside the box, or the footprint polygon. */
  shape: PickShape;
  /** How far, in pixels, another plot may be from the point before the point is too close to call. */
  radius: number;
}

type Pt = readonly [number, number];
type Pickable = Pick<SheetPlot, "plotId" | "points" | "box">;

/** The pixels a finger may be off by. A mouse and a pen are exact, or nearly so. */
const RADIUS: Readonly<Record<string, number>> = { mouse: 0, pen: 4, touch: 12 };

/** The radius for a kind of pointer. A kind that is not known is treated as a finger. */
export function pickRadius(pointerType: string): number {
  return RADIUS[pointerType] ?? (RADIUS["touch"] as number);
}

/** The steps that draw the curve of an arch top. */
const ARCH_STEPS = 24;

/**
 * The outline of an arch as the map draws it: a flat base, straight sides and a half ellipse on top. The box is kept at
 * least 6 px wide and the curve is 60 percent of the height at most, as in the drawing.
 */
function archOutline(box: SheetPlot["box"]): Pt[] {
  const w = Math.max(6, box.width);
  const x0 = box.x - (w - box.width) / 2;
  const x1 = x0 + w;
  const y0 = box.y;
  const y1 = box.y + box.height;
  const ry = Math.min(w / 2, (y1 - y0) * 0.6);
  const rx = w / 2;
  const cx = x0 + rx;
  const points: Pt[] = [[x0, y1]];
  for (let i = 0; i <= ARCH_STEPS; i += 1) {
    const angle = Math.PI - (Math.PI * i) / ARCH_STEPS;
    points.push([cx + rx * Math.cos(angle), y0 + ry - ry * Math.sin(angle)]);
  }
  points.push([x1, y1]);
  return points;
}

/** The squared distance from a point to a segment. */
function segmentDistance2(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
  const rx = a[0] + t * dx - p[0];
  const ry = a[1] + t * dy - p[1];
  return rx * rx + ry * ry;
}

/** True when the point is inside the polygon or on its edge. */
function holds(outline: readonly Pt[], p: Pt): boolean {
  const n = outline.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const a = outline[i] as Pt;
    const b = outline[j] as Pt;
    if (segmentDistance2(p, a, b) < 1e-12) return true;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** How far the point is from the outline: 0 inside or on it. */
function distance(outline: readonly Pt[], p: Pt): number {
  if (outline.length < 3 || holds(outline, p)) return outline.length < 3 ? Number.POSITIVE_INFINITY : 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < outline.length; i += 1) best = Math.min(best, segmentDistance2(p, outline[i] as Pt, outline[(i + 1) % outline.length] as Pt));
  return Math.sqrt(best);
}

/** The ID of the one plot the point means, or undefined when it means none or could mean more than one. */
export function pickPlot(plots: readonly Pickable[], at: Pt, options: PickOptions): string | undefined {
  if (!Number.isFinite(at[0]) || !Number.isFinite(at[1])) return undefined;
  let found: string | undefined;
  let nearest = Number.POSITIVE_INFINITY;
  const distances = plots.map((plot) => distance(options.shape === "arch" ? archOutline(plot.box) : (plot.points as readonly Pt[]), at));
  for (const [i, d] of distances.entries()) {
    if (d === 0) {
      // A second plot that holds the point is a plot the tap could mean as well.
      if (found !== undefined) return undefined;
      found = (plots[i] as Pickable).plotId;
    }
  }
  if (found === undefined) return undefined;
  for (const [i, d] of distances.entries()) {
    if ((plots[i] as Pickable).plotId !== found) nearest = Math.min(nearest, d);
  }
  return nearest <= options.radius ? undefined : found;
}
