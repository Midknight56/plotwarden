// The shared drawing model. The screen map and the print page both draw it. Pure.
// Every coordinate is in pixels with north flipped, so a drawn text size is the real size.
import type { PhysicalState, Uuid } from "../types";
import { backdropMatrix, boundsOf, toScreen } from "./coordinates";
import type { Bounds, Point, View } from "./coordinates";
import type { MapState } from "./edit";
import { centroid } from "./geometry";
import { bestSpot, boxOf, spotsAlongLine, spotsAlongTop, spotsAround } from "./labels";
import type { Scene, Spot } from "./labels";

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
  /** Pixels per site unit. */
  scale: number;
  /** The transform that drew this model. A point on the screen turns back into a site point with it. */
  view: View;
  /** No footprint, outline or path to draw: "No map yet". */
  empty: boolean;
  plots: SheetPlot[];
  sections: { sectionId: Uuid; name: string; points?: [number, number][]; label: Label }[];
  paths: { pathId: Uuid; name: string; points: [number, number][]; label: Label }[];
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
/** The least a plot may measure for its code to be drawn inside it. */
const LABEL_MIN_BOX = 40;
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

  // Labels. The tab, the north arrow, the gate mark and the plot codes are fixed. The labels of the gate, the
  // sections and the paths are then placed in the first spot that keeps clear of lines and of everything else.
  const selected = input.plots.find((p) => p.plotId === input.selectedPlotId);
  const tab: SheetModel["tab"] =
    selected === undefined ? undefined : { code: selected.code, x: 8, y: 8, width: Math.max(48, Math.round(selected.code.length * 9) + 16), height: 28, size: TAB_SIZE };
  const northArrow = { x: width - PAD, y: 28, degrees: map.north };
  const pathLines = paths.map((p) => screen(p.points));
  const hard: Scene["hard"] = [{ box: { x0: northArrow.x - 14, y0: northArrow.y - 18, x1: northArrow.x + 14, y1: northArrow.y + 12 }, gap: 4 }];
  if (tab !== undefined) hard.push({ box: { x0: tab.x, y0: tab.y, x1: tab.x + tab.width, y1: tab.y + tab.height }, gap: 4 });
  for (const p of plots) if (p.label !== undefined) hard.push({ box: boxOf(p.label.text, p.label.size, p.label), gap: 2 });
  const soft = plots.map((p) => ({ x0: p.box.x, y0: p.box.y, x1: p.box.x + p.box.width, y1: p.box.y + p.box.height }));
  const scene = (lines: Scene["lines"]): Scene => ({ width, height, hard, lines, soft });
  /** The outline of each section as a closed line. A section keeps off the others, and sits just above its own. */
  const outlineLines = (except?: string): Scene["lines"] =>
    outlined
      .filter((s) => s.sectionId !== except)
      .map((s) => {
        const points = screen(s.outline ?? []);
        return { points: points.length > 0 ? [...points, points[0] as Point] : points, clear: OUTLINE_CLEAR, weight: OUTLINE_WEIGHT };
      });
  const keepOff = (clear: number, except?: string): Scene["lines"] => [...pathLines.map((points) => ({ points, clear })), ...outlineLines(except)];
  const place = (text: string, spots: Spot[], lines: Scene["lines"]): Label => {
    const best = bestSpot(text, LABEL_SIZE, spots, scene(lines));
    hard.push({ box: best.box, gap: 2 });
    return { x: best.spot.x, y: best.spot.y, text, size: LABEL_SIZE, anchor: best.spot.anchor };
  };

  let gate: SheetModel["gate"];
  if (map.gate !== undefined) {
    const [x, y] = toScreen(map.gate.at, view);
    hard.push({ box: { x0: x - 8, y0: y - 8, x1: x + 8, y1: y + 8 }, gap: 3 });
    gate = { name: map.gate.name, x, y, label: place(map.gate.name, spotsAround(x, y), keepOff(GATE_CLEAR)) };
  }

  const sections = outlined.map((s) => {
    const points = screen(s.outline ?? []);
    const box = boxOfPoints(points);
    return { sectionId: s.sectionId, name: s.name, points, label: place(s.name, spotsAlongTop(box, s.name, LABEL_SIZE), keepOff(OWN_LINE_CLEAR, s.sectionId)) };
  });

  const sheetPaths = paths.map((p, index) => {
    const points = screen(p.points);
    const lines: Scene["lines"] = [...pathLines.map((line, i) => ({ points: line, clear: i === index ? OWN_LINE_CLEAR : GATE_CLEAR })), ...outlineLines()];
    return { pathId: p.pathId, name: p.name, points, label: place(p.name, spotsAlongLine(points), lines) };
  });

  const model: SheetModel = {
    width,
    height,
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
