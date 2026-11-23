// Label placement for the shared sheet and for the visitor maps. Pure.
// A label is tried in a list of places, best first. The first place that is clear wins. When none is clear the
// place that touches least wins. The sheet then writes the name under the drawing instead (spec 02, P19), and the
// visitor maps, which have no caption, keep that place. Clear means: inside the sheet by a margin,
// away from lines, from the code tab, the north arrow, the gate mark, every plot and every label already placed.

export type Anchor = "start" | "middle" | "end";

export interface Spot {
  x: number;
  y: number;
  anchor: Anchor;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A line a label should stay off, with how far, and how much it matters. */
export interface Line {
  points: readonly (readonly [number, number])[];
  clear: number;
  weight?: number;
}

export interface Scene {
  width: number;
  height: number;
  /** Boxes a label must not touch, each with the gap wanted. */
  hard: { box: Box; gap: number }[];
  lines: Line[];
  /** Boxes a label may lie over at a small cost. The visitor maps use this. */
  soft: Box[];
  /** Plot boxes. A place within `PLOT_GAP` of one costs more than a caption (spec 02, P19). */
  plots?: Box[];
}

/**
 * What a caption costs. A place that costs this much or more loses to the caption. Every term of `cost` is at least
 * this for any shortfall of more than 0.05 px, so only a clear place wins against a caption.
 */
export const CAPTION_COST = 1;
/** How far a name keeps from a plot, in pixels. */
export const PLOT_GAP = 2;
/** The base cost of a place that is over a plot or nearer than `PLOT_GAP`. It is above every line shortfall. */
export const PLOT_COST = 600;

/** The width of a letter at 12 px, a little wide so the check is the stricter one. */
export const LETTER_WIDTH = 7.4;
/** How far from the edge of the sheet a label stays. */
export const SHEET_MARGIN = 8;

export function textWidth(text: string, size: number): number {
  return [...text].length * LETTER_WIDTH * (size / 12);
}

/** The box a text takes, from where its baseline starts. */
export function boxOf(text: string, size: number, spot: Spot): Box {
  const w = textWidth(text, size);
  const x0 = spot.anchor === "start" ? spot.x : spot.anchor === "middle" ? spot.x - w / 2 : spot.x - w;
  return { x0, y0: spot.y - size, x1: x0 + w, y1: spot.y + 3 };
}

function overlapArea(a: Box, b: Box, gap: number): number {
  const w = Math.min(a.x1, b.x1 + gap) - Math.max(a.x0, b.x0 - gap);
  const h = Math.min(a.y1, b.y1 + gap) - Math.max(a.y0, b.y0 - gap);
  return w > 0 && h > 0 ? w * h : 0;
}

export function distanceToLine(box: Box, points: readonly (readonly [number, number])[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as readonly [number, number];
    const b = points[i + 1] as readonly [number, number];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.min(800, Math.max(1, Math.ceil(length / 2)));
    for (let s = 0; s <= steps; s++) {
      const x = a[0] + ((b[0] - a[0]) * s) / steps;
      const y = a[1] + ((b[1] - a[1]) * s) / steps;
      const dx = Math.max(box.x0 - x, 0, x - box.x1);
      const dy = Math.max(box.y0 - y, 0, y - box.y1);
      const d = Math.hypot(dx, dy);
      if (d < best) best = d;
    }
  }
  return best;
}

/** How bad a place is. Zero is clear. */
export function cost(box: Box, scene: Scene): number {
  let total = 0;
  const m = SHEET_MARGIN;
  const over = Math.max(0, m - box.x0) + Math.max(0, box.x1 - (scene.width - m)) + Math.max(0, m - box.y0) + Math.max(0, box.y1 - (scene.height - m));
  if (over > 0) total += 1000 + over * 50;
  for (const { box: other, gap } of scene.hard) {
    const area = overlapArea(box, other, gap);
    if (area > 0) total += 500 + area * 20;
  }
  for (const line of scene.lines) {
    const d = distanceToLine(box, line.points);
    if (d < line.clear) total += (line.clear - d) * 40 * (line.weight ?? 1);
  }
  for (const other of scene.soft) {
    const area = overlapArea(box, other, 0);
    if (area > 0) total += 5 + area * 0.2;
  }
  for (const plot of scene.plots ?? []) {
    const area = overlapArea(box, plot, PLOT_GAP);
    if (area > 0) total += PLOT_COST + area * 20;
  }
  return total;
}

/** The first clear spot, or the one that touches least. A tie keeps the earlier spot. */
export function bestSpot(text: string, size: number, spots: readonly Spot[], scene: Scene): { spot: Spot; box: Box; cost: number } {
  let best: { spot: Spot; box: Box; cost: number } | undefined;
  for (const spot of spots) {
    const box = boxOf(text, size, spot);
    const c = cost(box, scene);
    if (best === undefined || c < best.cost) best = { spot, box, cost: c };
    if (c === 0) break;
  }
  if (best === undefined) throw new Error("A label needs at least one place to try");
  return best;
}

/**
 * Places round a mark such as the gate. Above and below first, since a mark often stands on a line. The offsets are
 * written for text of 12 px. A larger size moves the places below the mark down by the extra height, and the places
 * beside it down by half of that, so each keeps the same clearance. The places above need no change: the bottom of a
 * box is the same distance from its baseline at every size.
 */
export function spotsAround(x: number, y: number, reach = 0, size = 12): Spot[] {
  const r = 14 + reach;
  const d = size - 12;
  const h = d / 2;
  return [
    { x, y: y - r - 3, anchor: "middle" },
    { x, y: y + r + 13 + d, anchor: "middle" },
    { x: x + r, y: y + 4 + h, anchor: "start" },
    { x: x - r, y: y + 4 + h, anchor: "end" },
    { x: x + 8, y: y - r - 1, anchor: "start" },
    { x: x - 8, y: y - r - 1, anchor: "end" },
    { x: x + 8, y: y + r + 11 + d, anchor: "start" },
    { x: x - 8, y: y + r + 11 + d, anchor: "end" },
    { x, y: y - r - 20 - d, anchor: "middle" },
    { x, y: y + r + 30 + d, anchor: "middle" },
    { x: x + r + 24, y: y + 4 + h, anchor: "start" },
    { x: x - r - 24, y: y + 4 + h, anchor: "end" },
    // A gate on the edge of a section: inside the outline, above then below the walk, a little way in.
    { x: x + 32, y: y - r - 1, anchor: "start" },
    { x: x + 32, y: y + r + 11 + d, anchor: "start" },
    { x: x + 64, y: y - r - 1, anchor: "start" },
    { x: x + 64, y: y + r + 11 + d, anchor: "start" },
    // Where the walk runs between two outlines and those do not fit: as near the walk as still keeps 8 px off its dots.
    { x: x + 32, y: y - 11, anchor: "start" },
    { x: x + 32, y: y + 20 + d, anchor: "start" },
  ];
}

/**
 * Places along the top edge of a box, then above its right end, then below it, then inside its top left. `lifts` are
 * how far above the edge the baseline stands, nearest first. The sheet adds a higher lift for a box whose edge is
 * shared by plots, so the name keeps clear of them.
 */
export function spotsAlongTop(box: { x: number; y: number; width: number; height: number }, text: string, size: number, lifts: readonly number[] = [4]): Spot[] {
  const w = textWidth(text, size);
  const spots: Spot[] = [];
  const step = 24;
  for (const lift of lifts) {
    for (let x = box.x + 4; x + w <= box.x + box.width + 4; x += step) spots.push({ x, y: box.y - lift, anchor: "start" });
    spots.push({ x: box.x + box.width - 4, y: box.y - lift, anchor: "end" });
  }
  // Below the box and inside it, the baseline stands lower by the height that the text has over 12 px.
  const d = size - 12;
  spots.push({ x: box.x + 4, y: box.y + box.height + 16 + d, anchor: "start" });
  spots.push({ x: box.x + box.width - 4, y: box.y + box.height + 16 + d, anchor: "end" });
  for (let x = box.x + 8; x + w <= box.x + box.width; x += step) spots.push({ x, y: box.y + 16 + d, anchor: "start" });
  return spots;
}

/**
 * Places along a line: above, below, then at each side, from the middle of each segment outward. The offsets are
 * written for text of 12 px. A larger size moves the places below the line down by the extra height, and the places
 * beside it down by half of that.
 */
export function spotsAlongLine(points: readonly (readonly [number, number])[], size = 12): Spot[] {
  const d = size - 12;
  const segments: { a: readonly [number, number]; b: readonly [number, number]; length: number }[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as readonly [number, number];
    const b = points[i + 1] as readonly [number, number];
    segments.push({ a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1]) });
  }
  segments.sort((p, q) => q.length - p.length);
  const spots: Spot[] = [];
  for (const fraction of [0.5, 0.3, 0.7, 0.15, 0.85]) {
    for (const s of segments) {
      const x = s.a[0] + (s.b[0] - s.a[0]) * fraction;
      const y = s.a[1] + (s.b[1] - s.a[1]) * fraction;
      spots.push({ x, y: y - 10, anchor: "middle" }, { x, y: y + 20 + d, anchor: "middle" }, { x: x + 10, y: y + 4 + d / 2, anchor: "start" }, { x: x - 10, y: y + 4 + d / 2, anchor: "end" });
    }
  }
  // Where a walk runs between two outlines there may be no room for the easy places. These sit a little closer.
  for (const fraction of [0.5, 0.3, 0.7, 0.15, 0.85]) {
    for (const s of segments) {
      const x = s.a[0] + (s.b[0] - s.a[0]) * fraction;
      const y = s.a[1] + (s.b[1] - s.a[1]) * fraction;
      spots.push({ x, y: y - 7, anchor: "middle" }, { x, y: y + 16 + d, anchor: "middle" });
    }
  }
  if (spots.length === 0) {
    const only = points[0] as readonly [number, number];
    spots.push({ x: only[0], y: only[1] - 10, anchor: "middle" });
  }
  return spots;
}

// ---- Leader lines (spec 02, P19.8 to P19.10) -------------------------------------------------------------------------
// A name that has no clear place beside its feature stands outside the block, and a thin line joins it to the feature.
// These are the exact tests the sheet uses to choose a route. All of them are pure.

export type Pt = [number, number];

/** True when the open segment from `a` to `b` has a part inside the box (touching its edge does not count). */
export function segmentHitsBox(a: Pt, b: Pt, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q > 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, a[0] - box.x0) && clip(dx, box.x1 - a[0]) && clip(-dy, a[1] - box.y0) && clip(dy, box.y1 - a[1]) && t0 < t1;
}

const orient = (a: Pt, b: Pt, c: Pt): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** True when two segments cross at one point that is inside both of them. */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** How many times a polyline crosses another. */
export function polylineCrossings(line: readonly Pt[], other: readonly (readonly [number, number])[]): number {
  let count = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    for (let j = 0; j + 1 < other.length; j++) {
      if (segmentsCross(line[i] as Pt, line[i + 1] as Pt, other[j] as Pt, other[j + 1] as Pt)) count += 1;
    }
  }
  return count;
}

export function polylineLength(line: readonly Pt[]): number {
  let total = 0;
  for (let i = 0; i + 1 < line.length; i++) total += Math.hypot((line[i + 1] as Pt)[0] - (line[i] as Pt)[0], (line[i + 1] as Pt)[1] - (line[i] as Pt)[1]);
  return total;
}

/** True when a point is inside a box that is grown by `pad`. */
export function pointInBox(p: Pt, box: Box, pad = 0): boolean {
  return p[0] >= box.x0 - pad && p[0] <= box.x1 + pad && p[1] >= box.y0 - pad && p[1] <= box.y1 + pad;
}

/** How many sample points of a polyline, one every 3 px and not counting the first 6 px, lie within `clear` of a line. */
export function samplesNear(line: readonly Pt[], other: readonly (readonly [number, number])[], clear: number): number {
  if (other.length < 2) return 0;
  let near = 0;
  let walked = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] as Pt;
    const b = line[i + 1] as Pt;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(1, Math.ceil(length / 3));
    for (let s = 0; s <= steps; s++) {
      if (walked + (length * s) / steps < 6) continue;
      const x = a[0] + ((b[0] - a[0]) * s) / steps;
      const y = a[1] + ((b[1] - a[1]) * s) / steps;
      if (distanceToLine({ x0: x, y0: y, x1: x, y1: y }, other) < clear) near += 1;
    }
    walked += length;
  }
  return near;
}
