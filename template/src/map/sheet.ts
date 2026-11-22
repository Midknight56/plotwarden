// The shared drawing model. The screen map and the print page both draw it. Pure.
// Every coordinate is in pixels with north flipped, so a drawn text size is the real size.
import type { PhysicalState, Uuid } from "../types";
import { backdropMatrix, boundsOf, toScreen } from "./coordinates";
import type { Bounds, Point, View } from "./coordinates";
import type { MapState } from "./edit";
import { centroid } from "./geometry";
import { CAPTION_COST, SHEET_MARGIN, bestSpot, boxOf, distanceToLine, spotsAlongLine, spotsAlongTop, spotsAround } from "./labels";
import type { Box, Scene, Spot } from "./labels";

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
  /** How many names were written under the drawing, because no place on it kept clear of plots, lines and other names. */
  captioned: number;
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
  tab?: { code: string; x: number; y: number; width: number; height: number; size: number };
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
/** A name with no clear place on the drawing is written under it, at every width. A phone at 200 percent zoom is 180 wide. */
const CAPTION_LINE = 18;
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
function placeTab(target: { x: number; y: number; width: number; height: number }, size: { width: number; height: number }, scene: TabScene): { x: number; y: number } {
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
  return best === undefined ? { x: clampX(left), y: Math.max(SHEET_MARGIN, top - h) } : { x: best.x, y: best.y };
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
  let tab: SheetModel["tab"];
  if (selected !== undefined) {
    const tabWidth = Math.max(48, Math.round(selected.code.length * 9) + 16);
    const chosen = plots.find((p) => p.plotId === selected.plotId);
    const at =
      chosen === undefined
        ? { x: SHEET_MARGIN, y: SHEET_MARGIN }
        : placeTab(chosen.box, { width: tabWidth, height: TAB_HEIGHT }, {
            width,
            height,
            others: plotBoxes.filter((p) => p.plotId !== selected.plotId).map((p) => p.box),
            north: northBox,
            ...(gatePoint === undefined ? {} : { gate: { x0: gatePoint[0] - 8, y0: gatePoint[1] - 8, x1: gatePoint[0] + 8, y1: gatePoint[1] + 8 } }),
            lines: pathLines,
          });
    tab = { code: selected.code, x: at.x, y: at.y, width: tabWidth, height: TAB_HEIGHT, size: TAB_SIZE };
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
  /** Names that found no clear place. They are written under the drawing, one to a line, at every width. */
  const captions: Label[] = [];
  const place = (text: string, spots: Spot[], lines: Scene["lines"]): Label => {
    const best = bestSpot(text, LABEL_SIZE, spots, scene(lines));
    if (best.cost >= CAPTION_COST) {
      const caption: Label = { x: SHEET_MARGIN, y: 0, text, size: LABEL_SIZE, anchor: "start" };
      captions.push(caption);
      return caption;
    }
    hard.push({ box: best.box, gap: 2 });
    return { x: best.spot.x, y: best.spot.y, text, size: LABEL_SIZE, anchor: best.spot.anchor };
  };

  let gate: SheetModel["gate"];
  if (map.gate !== undefined && gatePoint !== undefined) {
    const [x, y] = gatePoint;
    hard.push({ box: { x0: x - 8, y0: y - 8, x1: x + 8, y1: y + 8 }, gap: 3 });
    gate = { name: map.gate.name, x, y, label: place(map.gate.name, spotsAround(x, y), keepOff(GATE_CLEAR)) };
  }

  // A section name keeps as far from a path as the gate name does: a path is drawn as a strip 14 px wide.
  const sections = outlined.map((s) => {
    const points = screen(s.outline ?? []);
    const box = boxOfPoints(points);
    return { sectionId: s.sectionId, name: s.name, points, label: place(s.name, spotsAlongTop(box, s.name, LABEL_SIZE, [4, 7]), keepOff(GATE_CLEAR, s.sectionId)) };
  });

  // A path that has the name of a section written above is not written twice. The section name stands for both.
  const written = new Set(sections.map((s) => s.name));
  const sheetPaths: SheetModel["paths"] = paths.map((p, index) => {
    const points = screen(p.points);
    if (written.has(p.name)) return { pathId: p.pathId, name: p.name, points };
    const lines: Scene["lines"] = [...pathLines.map((line, i) => ({ points: line, clear: i === index ? OWN_LINE_CLEAR : GATE_CLEAR })), ...outlineLines()];
    return { pathId: p.pathId, name: p.name, points, label: place(p.name, spotsAlongLine(points), lines) };
  });

  // The tab may stand under the lowest plot, past the drawing. The sheet is then taller by what it needs. The lines
  // written under the drawing start below the drawing and the tab, and make the sheet taller by their own height
  // and a margin above and below.
  const tabEnd = tab === undefined ? 0 : tab.y + tab.height + SHEET_MARGIN;
  const body = Math.max(height, tabEnd);
  captions.forEach((caption, i) => {
    caption.y = body + SHEET_MARGIN + LABEL_SIZE + i * CAPTION_LINE;
  });
  const sheetHeight = captions.length === 0 ? body : body + SHEET_MARGIN + captions.length * CAPTION_LINE + SHEET_MARGIN;
  const model: SheetModel = {
    width,
    height: sheetHeight,
    captioned: captions.length,
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
