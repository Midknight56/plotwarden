// The shared drawing model. The screen map and the print page both draw it. Pure.
// Every coordinate is in pixels with north flipped, so a drawn text size is the real size.
import type { PhysicalState, Uuid } from "../types";
import { backdropMatrix, boundsOf, toScreen } from "./coordinates";
import type { Bounds, Point, View } from "./coordinates";
import type { MapState } from "./edit";
import { centroid } from "./geometry";
import { CAPTION_COST, SHEET_MARGIN, bestSpot, boxOf, distanceToLine, pointInBox, polylineCrossings, polylineLength, samplesNear, segmentHitsBox, spotsAlongLine, spotsAlongTop, spotsAround, textWidth } from "./labels";
import type { Box, Pt, Scene, Spot } from "./labels";

export interface PlotMark {
  /** Absent for a plot with no checked space. */
  state?: PhysicalState;
  needsChecking: boolean;
}

export interface SheetPlotInput {
  plotId: Uuid;
  code: string;
  mark: PlotMark;
}

export interface SheetInput {
  map: MapState;
  plots: readonly SheetPlotInput[];
  selectedPlotId?: Uuid;
}

export interface SheetOptions {
  /** The width of the container, in pixels. */
  width: number;
  /** Multiplies width and scale. 1 fits the container. */
  zoom?: number;
  /** The tallest the sheet may be at zoom 1. Default is 1.25 times the width. */
  maxHeight?: number;
  /** Draw the private backdrop. Print and visitor sheets leave this off. */
  showBackdrop?: boolean;
  /** The pixel size of the backdrop image, once it has loaded. */
  imageSize?: { width: number; height: number };
  /** Fit these site bounds instead of the content. */
  bounds?: Bounds;
}

export interface Label {
  x: number;
  y: number;
  text: string;
  /** Font size in pixels. Never below 12. */
  size: number;
  anchor: "start" | "middle" | "end";
  /** A thin line from the feature (first point) to this name (last point), when the name stands outside the block (P19.8). */
  leader?: [number, number][];
}

export interface SheetPlot {
  plotId: Uuid;
  code: string;
  points: [number, number][];
  box: { x: number; y: number; width: number; height: number };
  symbolCenter: [number, number];
  mark: PlotMark;
  selected: boolean;
  label?: Label;
}

export type KeyState = "free" | "reserved" | "taken" | "unusable" | "checking";

export interface SheetModel {
  width: number;
  height: number;
  /** Pixels per site unit. */
  scale: number;
  /** The transform that drew this model. A point on the screen turns back into a site point with it. */
  view: View;
  /** No footprint, outline or path to draw: "No map yet". */
  empty: boolean;
  plots: SheetPlot[];
  sections: { sectionId: Uuid; name: string; points?: [number, number][]; label: Label }[];
  paths: { pathId: Uuid; name: string; points: [number, number][]; label?: Label }[];
  gate?: { name: string; x: number; y: number; label: Label };
  north: { x: number; y: number; degrees: number };
  tab?: { code: string; x: number; y: number; width: number; height: number; size: number; leader?: [number, number][] };
  key: KeyState[];
  backdrop?: { blobId: Uuid; matrix: [number, number, number, number, number, number]; opacity: number; width: number; height: number };
}

/** Pixels around the drawing, and the band at the top for the code tab and the north arrow. */
const PAD = 24;
const PAD_TOP = 48;
const PAD_BOTTOM = 24;
const MIN_HEIGHT = 120;
/** The smallest span fitted, in site units, so one tiny plot is not blown up. */
const MIN_SPAN = 100;
const DEFAULT_BOUNDS: Bounds = { minEast: 0, minNorth: 0, maxEast: 1000, maxNorth: 1000 };
const LABEL_SIZE = 12;
const TAB_SIZE = 14;
const TAB_HEIGHT = 28;
/** How far the tab keeps from a path line, so it does not cover the gravel strip if another place will do. */
const TAB_LINE_CLEAR = 8;
/** The least a plot may measure for its code to be drawn inside it. */
const LABEL_MIN_BOX = 40;
/** A name with no clear place beside its feature stands outside the block, in rows under the drawing, 18 px apart (P19.8). */
const OUTSIDE_ROW = 18;
/** The gap between the drawing and the first row of outside names, and between the leader line and its name. */
const BAND_GAP = 8;
/** The height of a name's box: from 12 px above its baseline to 3 px below it. */
const NAME_BOX_HEIGHT = 15;
/** A place that costs this much covers another plot, the north arrow, the gate mark or leaves the sheet. */
const OUTSIDE_COST = 1000;
/** The farthest a name may stand from its feature, from the edge of its box, without a leader line (P19.8). A little under 24 px. */
const NEAR_FEATURE = 22;
const CHAR_WIDTH = 7.2;
/** How far a label keeps from the line of a path: half the gravel strip and a margin. */
const GATE_CLEAR = 8;
/** How far a label keeps from the dashed outline of a section, and how much that matters next to a path. */
const OUTLINE_CLEAR = 3;
const OUTLINE_WEIGHT = 0.5;
/** How far a path keeps its own name from its dotted line. */
const OWN_LINE_CLEAR = 4;

const KEY: KeyState[] = ["free", "reserved", "taken", "unusable", "checking"];

function boxOfPoints(points: readonly (readonly [number, number])[]): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

interface TabScene {
  width: number;
  height: number;
  /** The boxes of the other plots. */
  others: readonly Box[];
  north: Box;
  gate?: Box;
  lines: readonly (readonly (readonly [number, number])[])[];
}

const areaOf = (a: Box, b: Box, gap = 0): number => {
  const w = Math.min(a.x1, b.x1 + gap) - Math.max(a.x0, b.x0 - gap);
  const h = Math.min(a.y1, b.y1 + gap) - Math.max(a.y0, b.y0 - gap);
  return w > 0 && h > 0 ? w * h : 0;
};

/**
 * Where the code tab of the selected plot goes. It touches the box of the plot on one side: above, then below, then
 * left, then right, each at the middle and at either end of that side. The first place that covers no other plot,
 * the north arrow, the gate mark or a path line, and lies inside the sheet, wins. When none is clear the cheapest
 * wins. A place under the plot may reach past the drawing. The sheet then grows to hold it.
 */
function placeTab(target: { x: number; y: number; width: number; height: number }, size: { width: number; height: number }, scene: TabScene): { x: number; y: number; cost: number } {
  const { width: w, height: h } = size;
  const left = target.x;
  const right = target.x + target.width;
  const top = target.y;
  const bottom = target.y + target.height;
  const clampX = (x: number): number => Math.max(SHEET_MARGIN, Math.min(x, scene.width - SHEET_MARGIN - w));
  const clampY = (y: number): number => Math.max(SHEET_MARGIN, y);
  const across = [(left + right - w) / 2, left, right - w, right - w - 6, left + 6];
  const along = [(top + bottom - h) / 2, top, bottom - h];
  const candidates: { x: number; y: number; side: "above" | "below" | "left" | "right" }[] = [
    ...across.map((x) => ({ x: clampX(x), y: top - h, side: "above" as const })),
    ...across.map((x) => ({ x: clampX(x), y: bottom, side: "below" as const })),
    ...along.map((y) => ({ x: left - w, y: clampY(y), side: "left" as const })),
    ...along.map((y) => ({ x: right, y: clampY(y), side: "right" as const })),
  ];
  let best: { x: number; y: number; cost: number } | undefined;
  for (const [order, c] of candidates.entries()) {
    // The tab must still share part of a side with the plot after it was moved in from the edge of the sheet.
    const shared = c.side === "above" || c.side === "below" ? Math.min(c.x + w, right) - Math.max(c.x, left) : Math.min(c.y + h, bottom) - Math.max(c.y, top);
    if (shared <= 0) continue;
    const box: Box = { x0: c.x, y0: c.y, x1: c.x + w, y1: c.y + h };
    let cost = order * 0.01;
    if (box.x0 < SHEET_MARGIN || box.x1 > scene.width - SHEET_MARGIN || box.y0 < SHEET_MARGIN) cost += 10000;
    if (c.side !== "below" && box.y1 > scene.height - SHEET_MARGIN) cost += 10000;
    for (const other of scene.others) {
      const area = areaOf(box, other);
      if (area > 0) cost += 1000 + area * 10;
    }
    const arrow = areaOf(box, scene.north, 1);
    if (arrow > 0) cost += 1000 + arrow * 10;
    const mark = scene.gate === undefined ? 0 : areaOf(box, scene.gate, 1);
    if (mark > 0) cost += 1000 + mark * 10;
    for (const line of scene.lines) {
      const d = distanceToLine(box, line);
      if (d < TAB_LINE_CLEAR) cost += 300 + (TAB_LINE_CLEAR - d) * 10;
    }
    if (best === undefined || cost < best.cost) best = { x: c.x, y: c.y, cost };
  }
  // Every candidate shares a side with the plot unless the plot is far narrower than the margin. Then the tab sits above it.
  return best === undefined ? { x: clampX(left), y: Math.max(SHEET_MARGIN, top - h), cost: OUTSIDE_COST } : { x: best.x, y: best.y, cost: best.cost };
}

/**
 * Where the code tab goes when no place beside its plot is free (P19.10). The tab stands outside the block of the
 * drawing, above it or below it, at the x of the plot as far as the sheet and the north arrow allow, with one thin
 * leader line from a point just inside the plot to the near edge of the tab. The shorter line wins. A tab above costs a
 * little more, so the name of a section above its outline keeps its place when it can.
 */
function placeTabOutside(
  target: { x: number; y: number; width: number; height: number },
  size: { width: number; height: number },
  scene: { width: number; drawing: Box; north: Box; gate?: Box },
): { x: number; y: number; leader: [number, number][] } {
  const { width: w, height: h } = size;
  const cx = target.x + target.width / 2;
  const inset = Math.min(4, target.height / 2);
  const clampX = (x: number): number => Math.max(SHEET_MARGIN, Math.min(x, scene.width - SHEET_MARGIN - w));
  const xs = [clampX(cx - w / 2), clampX(scene.north.x0 - 4 - w), clampX(SHEET_MARGIN)];
  const options: { x: number; y: number; leader: [number, number][]; cost: number }[] = [];
  for (const [order, x0] of xs.entries()) {
    const tx = Math.max(x0 + 4, Math.min(cx, x0 + w - 4));
    const sides = [
      { y: SHEET_MARGIN, from: [cx, target.y + inset] as Pt, to: [tx, SHEET_MARGIN + h] as Pt, extra: 20, fits: SHEET_MARGIN + h <= scene.drawing.y0 - 4 },
      { y: scene.drawing.y1 + BAND_GAP, from: [cx, target.y + target.height - inset] as Pt, to: [tx, scene.drawing.y1 + BAND_GAP] as Pt, extra: 0, fits: true },
    ];
    for (const side of sides) {
      if (!side.fits) continue;
      const box: Box = { x0, y0: side.y, x1: x0 + w, y1: side.y + h };
      let cost = polylineLength([side.from, side.to]) + side.extra + order * 0.01;
      const overlaps = (other: Box, gap: number): boolean => box.x0 < other.x1 + gap && other.x0 < box.x1 + gap && box.y0 < other.y1 + gap && other.y0 < box.y1 + gap;
      if (overlaps(scene.north, 4)) cost += OUTSIDE_COST;
      if (scene.gate !== undefined && overlaps(scene.gate, 2)) cost += OUTSIDE_COST;
      options.push({ x: x0, y: side.y, leader: [side.from, side.to], cost });
    }
  }
  let best = options[0];
  for (const option of options) if (best === undefined || option.cost < best.cost) best = option;
  const chosen = best ?? { x: clampX(cx - w / 2), y: scene.drawing.y1 + BAND_GAP, leader: [[cx, target.y + target.height - inset], [cx, scene.drawing.y1 + BAND_GAP]] as [number, number][] };
  return { x: chosen.x, y: chosen.y, leader: chosen.leader };
}

export function buildSheet(input: SheetInput, options: SheetOptions): SheetModel {
  const zoom = options.zoom ?? 1;
  const width = options.width * zoom;
  const maxHeight = (options.maxHeight ?? options.width * 1.25) * zoom;
  const { map } = input;

  const drawable = input.plots.filter((p) => map.shapes[p.plotId] !== undefined);
  const outlined = Object.values(map.sections)
    .filter((s) => s.outline !== undefined)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const paths = Object.values(map.paths);

  const content: [number, number][] = [];
  for (const p of drawable) for (const q of map.shapes[p.plotId] ?? []) content.push([q[0], q[1]]);
  for (const s of outlined) for (const q of s.outline ?? []) content.push([q[0], q[1]]);
  for (const p of paths) for (const q of p.points) content.push([q[0], q[1]]);
  const empty = content.length === 0;
  if (!empty && map.gate !== undefined) content.push([map.gate.at[0], map.gate.at[1]]);

  const bounds = options.bounds ?? boundsOf(content) ?? DEFAULT_BOUNDS;
  const spanEast = bounds.maxEast - bounds.minEast;
  const spanNorth = bounds.maxNorth - bounds.minNorth;

  const byWidth = (width - 2 * PAD) / Math.max(spanEast, MIN_SPAN);
  const byHeight = (maxHeight - PAD_TOP - PAD_BOTTOM) / Math.max(spanNorth, MIN_SPAN);
  const scale = Math.min(byWidth, byHeight);
  const height = Math.max(MIN_HEIGHT, spanNorth * scale + PAD_TOP + PAD_BOTTOM);
  const padX = (width - spanEast * scale) / 2;

  const view: View = {
    minEast: bounds.minEast - padX / scale,
    minNorth: bounds.minNorth - PAD_BOTTOM / scale,
    scale,
    height,
  };
  const screen = (points: readonly (readonly [number, number])[]): [number, number][] => points.map((p) => toScreen(p, view));

  const plots: SheetPlot[] = drawable.map((p) => {
    const points = screen(map.shapes[p.plotId] ?? []);
    const box = boxOfPoints(points);
    const labelled = box.width >= LABEL_MIN_BOX && box.height >= LABEL_MIN_BOX && p.code.length * CHAR_WIDTH <= box.width - 6;
    const c = centroid(points);
    const plot: SheetPlot = {
      plotId: p.plotId,
      code: p.code,
      points,
      box,
      symbolCenter: labelled ? [c[0], box.y + (box.height - 18) / 2] : c,
      mark: p.mark,
      selected: p.plotId === input.selectedPlotId,
    };
    if (labelled) {
      plot.label = { x: box.x + box.width / 2, y: box.y + box.height - 6, text: p.code, size: LABEL_SIZE, anchor: "middle" };
    }
    return plot;
  });

  // Labels. The plot codes and the north arrow are fixed. The tab of the selected plot is placed first, against that
  // plot. The names of the gate, the sections and the paths are then placed in the first spot that keeps clear of
  // plots, lines and everything else, or are written under the drawing (spec 02, P19).
  const selected = input.plots.find((p) => p.plotId === input.selectedPlotId);
  const northArrow = { x: width - PAD, y: 28, degrees: map.north };
  const northBox: Box = { x0: northArrow.x - 14, y0: northArrow.y - 18, x1: northArrow.x + 14, y1: northArrow.y + 12 };
  const pathLines = paths.map((p) => screen(p.points));
  const plotBoxes = plots.map((p) => ({ plotId: p.plotId, box: { x0: p.box.x, y0: p.box.y, x1: p.box.x + p.box.width, y1: p.box.y + p.box.height } }));
  const gatePoint = map.gate === undefined ? undefined : toScreen(map.gate.at, view);
  // The block: the box of every plot, outline and path. A name or a tab outside it needs a leader line (P19.8, P19.10).
  const blockPoints: Pt[] = [];
  for (const p of plots) for (const q of p.points) blockPoints.push([q[0], q[1]]);
  for (const s of outlined) for (const q of screen(s.outline ?? [])) blockPoints.push([q[0], q[1]]);
  for (const line of pathLines) for (const q of line) blockPoints.push([q[0], q[1]]);
  const drawBox: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const q of blockPoints) {
    if (q[0] < drawBox.x0) drawBox.x0 = q[0];
    if (q[1] < drawBox.y0) drawBox.y0 = q[1];
    if (q[0] > drawBox.x1) drawBox.x1 = q[0];
    if (q[1] > drawBox.y1) drawBox.y1 = q[1];
  }
  if (blockPoints.length === 0) Object.assign(drawBox, { x0: PAD, y0: PAD_TOP, x1: width - PAD, y1: height - PAD_BOTTOM });
  let tab: SheetModel["tab"];
  if (selected !== undefined) {
    const tabWidth = Math.max(48, Math.round(selected.code.length * 9) + 16);
    const chosen = plots.find((p) => p.plotId === selected.plotId);
    const gateBox: Box | undefined = gatePoint === undefined ? undefined : { x0: gatePoint[0] - 8, y0: gatePoint[1] - 8, x1: gatePoint[0] + 8, y1: gatePoint[1] + 8 };
    if (chosen === undefined) {
      tab = { code: selected.code, x: SHEET_MARGIN, y: SHEET_MARGIN, width: tabWidth, height: TAB_HEIGHT, size: TAB_SIZE };
    } else {
      const beside = placeTab(chosen.box, { width: tabWidth, height: TAB_HEIGHT }, {
        width,
        height,
        others: plotBoxes.filter((p) => p.plotId !== selected.plotId).map((p) => p.box),
        north: northBox,
        ...(gateBox === undefined ? {} : { gate: gateBox }),
        lines: pathLines,
      });
      if (beside.cost < OUTSIDE_COST) {
        tab = { code: selected.code, x: beside.x, y: beside.y, width: tabWidth, height: TAB_HEIGHT, size: TAB_SIZE };
      } else {
        // No free place beside the plot: the tab stands outside the block and a thin line leads to the plot (P19.10).
        const outside = placeTabOutside(chosen.box, { width: tabWidth, height: TAB_HEIGHT }, { width, drawing: drawBox, north: northBox, ...(gateBox === undefined ? {} : { gate: gateBox }) });
        tab = { code: selected.code, x: outside.x, y: outside.y, width: tabWidth, height: TAB_HEIGHT, size: TAB_SIZE, leader: outside.leader };
      }
    }
  }
  const hard: Scene["hard"] = [{ box: northBox, gap: 4 }];
  if (tab !== undefined) hard.push({ box: { x0: tab.x, y0: tab.y, x1: tab.x + tab.width, y1: tab.y + tab.height }, gap: 4 });
  for (const p of plots) if (p.label !== undefined) hard.push({ box: boxOf(p.label.text, p.label.size, p.label), gap: 2 });
  const scene = (lines: Scene["lines"]): Scene => ({ width, height, hard, lines, soft: [], plots: plotBoxes.map((p) => p.box) });
  /** The outline of each section as a closed line. A section keeps off the others, and sits just above its own. */
  const outlineLines = (except?: string): Scene["lines"] =>
    outlined
      .filter((s) => s.sectionId !== except)
      .map((s) => {
        const points = screen(s.outline ?? []);
        return { points: points.length > 0 ? [...points, points[0] as Point] : points, clear: OUTLINE_CLEAR, weight: OUTLINE_WEIGHT };
      });
  const keepOff = (clear: number, except?: string): Scene["lines"] => [...pathLines.map((points) => ({ points, clear })), ...outlineLines(except)];
  /** What a name names: the points a leader may start from, the line a leader must not run along, and how far a box is from it. */
  interface Feature {
    anchors: Pt[];
    own: readonly Pt[];
    reach: (box: Box) => number;
  }
  /** Names that found no clear place beside their feature. They stand outside the block with a leader line (P19.8). */
  const outside: { label: Label; feature: Feature }[] = [];
  const place = (text: string, spots: Spot[], lines: Scene["lines"], feature: Feature): Label => {
    // A place more than 24 px from the feature is not beside it: only the places near the feature are tried.
    const near = spots.filter((spot) => feature.reach(boxOf(text, LABEL_SIZE, spot)) <= NEAR_FEATURE);
    if (near.length > 0) {
      const best = bestSpot(text, LABEL_SIZE, near, scene(lines));
      if (best.cost < CAPTION_COST) {
        hard.push({ box: best.box, gap: 2 });
        return { x: best.spot.x, y: best.spot.y, text, size: LABEL_SIZE, anchor: best.spot.anchor };
      }
    }
    const label: Label = { x: 0, y: 0, text, size: LABEL_SIZE, anchor: "middle" };
    outside.push({ label, feature });
    return label;
  };
  /** The midpoints of the lowest, the leftmost and the rightmost edge of a closed outline. Each lies on the outline. */
  const edgeAnchors = (points: readonly (readonly [number, number])[]): Pt[] => {
    const mids: Pt[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i] as readonly [number, number];
      const b = points[(i + 1) % points.length] as readonly [number, number];
      mids.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
    if (mids.length === 0) return [];
    const pick = (better: (a: Pt, b: Pt) => boolean): Pt => mids.reduce((m, q) => (better(q, m) ? q : m));
    const found = [pick((a, b) => a[1] > b[1]), pick((a, b) => a[0] < b[0]), pick((a, b) => a[0] > b[0])];
    return found.filter((p, i) => found.findIndex((q) => q[0] === p[0] && q[1] === p[1]) === i);
  };

  let gate: SheetModel["gate"];
  if (map.gate !== undefined && gatePoint !== undefined) {
    const [x, y] = gatePoint;
    hard.push({ box: { x0: x - 8, y0: y - 8, x1: x + 8, y1: y + 8 }, gap: 3 });
    const feature: Feature = { anchors: [[x, y]], own: [], reach: (box) => distanceToLine(box, [[x, y], [x, y]]) };
    gate = { name: map.gate.name, x, y, label: place(map.gate.name, spotsAround(x, y), keepOff(GATE_CLEAR), feature) };
  }

  // A section name keeps as far from a path as the gate name does: a path is drawn as a strip 14 px wide.
  const sections = outlined.map((s) => {
    const points = screen(s.outline ?? []);
    const box = boxOfPoints(points);
    const closed: [number, number][] = points.length > 0 ? [...points, points[0] as [number, number]] : points;
    const feature: Feature = { anchors: edgeAnchors(points), own: closed, reach: (b) => distanceToLine(b, closed) };
    return { sectionId: s.sectionId, name: s.name, points, label: place(s.name, spotsAlongTop(box, s.name, LABEL_SIZE, [4, 7]), keepOff(GATE_CLEAR, s.sectionId), feature) };
  });

  // A path that has the name of a section written above is not written twice. The section name stands for both.
  const written = new Set(sections.map((s) => s.name));
  const sheetPaths: SheetModel["paths"] = paths.map((p, index) => {
    const points = screen(p.points);
    if (written.has(p.name)) return { pathId: p.pathId, name: p.name, points };
    const lines: Scene["lines"] = [...pathLines.map((line, i) => ({ points: line, clear: i === index ? OWN_LINE_CLEAR : GATE_CLEAR })), ...outlineLines()];
    const ends: Pt[] = points.length === 0 ? [] : [points[0] as Pt, points[points.length - 1] as Pt];
    const feature: Feature = { anchors: ends, own: points, reach: (b) => distanceToLine(b, points) };
    return { pathId: p.pathId, name: p.name, points, label: place(p.name, spotsAlongLine(points), lines, feature) };
  });

  // The tab may stand under the lowest plot, past the drawing. The sheet is then taller by what it needs.
  const tabEnd = tab === undefined ? 0 : tab.y + tab.height + SHEET_MARGIN;
  const body = Math.max(height, tabEnd);

  // Names with no clear place beside their feature stand in rows under the block, each with a leader line (P19.8). A
  // line goes straight down from an anchor, or sideways to the corridor beside the block and then down. Every anchor,
  // route and row is a candidate. The first cheapest wins, so the result is the same every time.
  const bandTop = Math.max(height, tab === undefined ? 0 : tab.y + tab.height) + BAND_GAP;
  let rows = 0;
  if (outside.length > 0) {
    const leftX = Math.max(SHEET_MARGIN + 4, drawBox.x0 - 6);
    const rightX = Math.min(width - SHEET_MARGIN - 4, drawBox.x1 + 6);
    const shrunk: Box[] = plotBoxes.map((p) => ({ x0: p.box.x0 + 1, y0: p.box.y0 + 1, x1: p.box.x1 - 1, y1: p.box.y1 - 1 }));
    const lineSet: Pt[][] = [
      ...pathLines.map((line) => line as Pt[]),
      ...outlined.map((s) => {
        const points = screen(s.outline ?? []);
        return (points.length > 0 ? [...points, points[0] as [number, number]] : points) as Pt[];
      }),
    ];
    const placedBoxes: Box[] = [];
    const placedLeaders: Pt[][] = tab?.leader === undefined ? [] : [tab.leader];
    for (const item of outside) {
      const w = textWidth(item.label.text, LABEL_SIZE);
      const anchors: Pt[] = item.feature.anchors.length > 0 ? item.feature.anchors : [[width / 2, drawBox.y1]];
      let best: { cost: number; points: Pt[]; cx: number; top: number; row: number } | undefined;
      for (let row = 0; row <= rows; row += 1) {
        const top = bandTop + row * OUTSIDE_ROW;
        for (const a of anchors) {
          const routes: { mid: Pt[]; ex: number }[] = [{ mid: [], ex: a[0] }];
          if (a[0] > leftX + 2) routes.push({ mid: [[leftX, a[1]]], ex: leftX });
          if (a[0] < rightX - 2) routes.push({ mid: [[rightX, a[1]]], ex: rightX });
          for (const route of routes) {
            const cx = Math.min(Math.max(route.ex, SHEET_MARGIN + w / 2), width - SHEET_MARGIN - w / 2);
            const points: Pt[] = [a, ...route.mid, [route.ex, top - 1]];
            const box: Box = { x0: cx - w / 2, y0: top, x1: cx + w / 2, y1: top + NAME_BOX_HEIGHT };
            let cost = polylineLength(points) * 0.05 + row * 2;
            for (let i = 0; i + 1 < points.length; i += 1) {
              const p = points[i] as Pt;
              const q = points[i + 1] as Pt;
              for (const b of shrunk) if (segmentHitsBox(p, q, b)) cost += 1000;
              for (const h of hard) if (!pointInBox(a, h.box, 1) && segmentHitsBox(p, q, h.box)) cost += 1000;
              for (const b of placedBoxes) if (segmentHitsBox(p, q, b)) cost += 1000;
            }
            for (const other of placedLeaders) cost += polylineCrossings(points, other) * 60;
            for (const line of lineSet) cost += polylineCrossings(points, line) * 30;
            if (samplesNear(points, item.feature.own, 2.5) > 0) cost += 500;
            const clash = (other: Box, gap: number): boolean => box.x0 < other.x1 + gap && other.x0 < box.x1 + gap && box.y0 < other.y1 + gap && other.y0 < box.y1 + gap;
            if (hard.some((h) => clash(h.box, h.gap)) || placedBoxes.some((b) => clash(b, 3))) cost += 5000;
            if (best === undefined || cost < best.cost) best = { cost, points, cx, top, row };
          }
        }
      }
      if (best === undefined) continue;
      item.label.x = best.cx;
      item.label.y = best.top + LABEL_SIZE;
      item.label.leader = best.points;
      placedBoxes.push({ x0: best.cx - w / 2, y0: best.top, x1: best.cx + w / 2, y1: best.top + NAME_BOX_HEIGHT });
      placedLeaders.push(best.points);
      rows = Math.max(rows, best.row + 1);
    }
  }
  const lastRowBottom = rows === 0 ? 0 : bandTop + (rows - 1) * OUTSIDE_ROW + NAME_BOX_HEIGHT;
  const sheetHeight = rows === 0 ? body : Math.max(body, lastRowBottom + SHEET_MARGIN);
  const model: SheetModel = {
    width,
    height: sheetHeight,
    scale,
    view,
    empty,
    plots,
    sections,
    paths: sheetPaths,
    north: northArrow,
    key: [...KEY],
  };
  if (gate !== undefined) model.gate = gate;
  if (tab !== undefined) model.tab = tab;
  const backdrop = map.backdrop;
  if (options.showBackdrop === true && backdrop !== undefined && !backdrop.hidden && options.imageSize !== undefined) {
    model.backdrop = {
      blobId: backdrop.blobId,
      matrix: backdropMatrix(backdrop.transform, options.imageSize.height, view),
      opacity: backdrop.transform.opacity / 100,
      width: options.imageSize.width,
      height: options.imageSize.height,
    };
  }
  return model;
}
