// Grid planning: codes, order, gaps, rotation, preview and renumber. Pure.
import { checkGridSize, checkLimit, checkText } from "../limits";
import { normalizeCode } from "../plot";
import { err, ok } from "../types";
import type { Result, Uuid } from "../types";
import { checkPoint, rotatePoint } from "./coordinates";
import type { Point } from "./coordinates";
import type { LayoutCommand, NewLayoutPlot } from "./edit";

export interface GridSpec {
  prefix: string;
  firstNumber: number;
  digits: number;
  rows: number;
  columns: number;
  /** South west corner of the unrotated grid. */
  origin: Point;
  cellWidth: number;
  cellHeight: number;
  columnSpacing: number;
  rowSpacing: number;
  numbering: "across" | "down";
  /** The row that is numbered first. */
  startRow: "north" | "south";
  /** The column that is numbered first. */
  startColumn: "west" | "east";
  /** The second line, and every second line after it, runs the other way. */
  reverseAlternate: boolean;
  /** Degrees counter clockwise about `origin`. */
  rotation: number;
  /** One based places, counted from the start corner. */
  skip: { row: number; column: number }[];
}

export interface PlannedPlot {
  code: string;
  number: number;
  /** One based, counted from the start corner. */
  row: number;
  column: number;
  footprint: Point[];
}

export interface ExistingPlot {
  plotId: Uuid;
  code: string;
  priorCodes: string[];
  sectionId?: Uuid;
  sectionName?: string;
  footprint?: readonly (readonly [number, number])[];
}

export interface GridCollision {
  code: string;
  /** The section that already holds the code. */
  sectionName?: string;
  plotId: Uuid;
}

export interface GridPlan {
  plots: PlannedPlot[];
  count: number;
  first?: string;
  last?: string;
  added: PlannedPlot[];
  retained: { plot: PlannedPlot; plotId: Uuid }[];
  moved: { plot: PlannedPlot; plotId: Uuid }[];
  skipped: { row: number; column: number; number: number }[];
  collisions: GridCollision[];
}

export interface RenameStep {
  plotId: Uuid;
  from: string;
  to: string;
}

/** What the live preview of the form needs. No size, position or spacing. */
export interface GridPreviewInput {
  prefix: string;
  firstNumber: number;
  digits: number;
  rows: number;
  columns: number;
  numbering: "across" | "down";
  startRow: "north" | "south";
  startColumn: "west" | "east";
  reverseAlternate: boolean;
  skip: { row: number; column: number }[];
}

export interface GridPreview {
  /** Planned codes that no plot of the site holds. */
  count: number;
  /** The first and the last planned code in numbering order. Absent when every place is skipped. */
  first?: string;
  last?: string;
  skipped: number;
  /** Every place, for the small drawing. One based, counted from the start corner. */
  cells: { row: number; column: number; number: number; skipped: boolean }[];
}

/** `prefix` then the number padded to `digits`. A longer number is written whole. */
export function formatCode(prefix: string, n: number, digits: number): string {
  return `${prefix}${String(n).padStart(digits, "0")}`;
}

function parseRange(text: string, max: number): number[] | undefined {
  if (text === "*") return Array.from({ length: max }, (_, i) => i + 1);
  const single = /^(\d{1,4})$/.exec(text);
  if (single !== null) {
    const n = Number(single[1]);
    return n >= 1 && n <= max ? [n] : undefined;
  }
  const range = /^(\d{1,4})-(\d{1,4})$/.exec(text);
  if (range !== null) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a < 1 || b > max || a > b) return undefined;
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  return undefined;
}

/**
 * Read places to skip. Items are `rows/columns` split by a comma or a
 * semicolon. Each part is a number, a range `a-b` or `*`.
 */
export function parseSkips(text: string, rows: number, columns: number): Result<{ row: number; column: number }[]> {
  const seen = new Set<string>();
  const places: { row: number; column: number }[] = [];
  for (const raw of text.split(/[,;]/)) {
    const item = raw.trim();
    if (item === "") continue;
    const parts = item.split("/");
    const rowRange = parts.length === 2 ? parseRange((parts[0] as string).trim(), rows) : undefined;
    const columnRange = parts.length === 2 ? parseRange((parts[1] as string).trim(), columns) : undefined;
    if (rowRange === undefined || columnRange === undefined) return err("bad_skip", { item });
    for (const row of rowRange) {
      for (const column of columnRange) {
        const key = `${row}/${column}`;
        if (!seen.has(key)) {
          seen.add(key);
          places.push({ row, column });
        }
      }
    }
  }
  places.sort((a, b) => a.row - b.row || a.column - b.column);
  return ok(places);
}

function sameFootprint(a: readonly (readonly [number, number])[], b: readonly (readonly [number, number])[]): boolean {
  return a.length === b.length && a.every((p, i) => p[0] === (b[i] as readonly [number, number])[0] && p[1] === (b[i] as readonly [number, number])[1]);
}

function checkSpec(spec: GridSpec): Result<true> {
  const size = checkGridSize(spec.rows, spec.columns, 0);
  if (!size.ok) return size;
  const integers: [string, number, number][] = [
    ["firstNumber", spec.firstNumber, 0],
    ["digits", spec.digits, 0],
    ["cellWidth", spec.cellWidth, 1],
    ["cellHeight", spec.cellHeight, 1],
    ["columnSpacing", spec.columnSpacing, 0],
    ["rowSpacing", spec.rowSpacing, 0],
    ["rotation", spec.rotation, -360],
  ];
  for (const [item, value, min] of integers) {
    if (!Number.isInteger(value) || value < min) return err("bad_value", { item, value });
  }
  if (spec.digits > 12) return err("bad_value", { item: "digits", value: spec.digits });
  const origin = checkPoint(spec.origin);
  if (!origin.ok) return origin;
  for (const place of spec.skip) {
    if (place.row < 1 || place.row > spec.rows || place.column < 1 || place.column > spec.columns) {
      return err("bad_skip", { item: `${place.row}/${place.column}` });
    }
  }
  return ok(true);
}

/** Places in numbering order, counted from the start corner. */
function numberingOrder(spec: GridSpec): { row: number; column: number }[] {
  const order: { row: number; column: number }[] = [];
  const range = (n: number, reversed: boolean) => {
    const list = Array.from({ length: n }, (_, i) => i + 1);
    return reversed ? list.reverse() : list;
  };
  if (spec.numbering === "across") {
    for (let row = 1; row <= spec.rows; row += 1) {
      for (const column of range(spec.columns, spec.reverseAlternate && row % 2 === 0)) order.push({ row, column });
    }
  } else {
    for (let column = 1; column <= spec.columns; column += 1) {
      for (const row of range(spec.rows, spec.reverseAlternate && column % 2 === 0)) order.push({ row, column });
    }
  }
  return order;
}

function footprintOf(spec: GridSpec, row: number, column: number): Point[] {
  const southIndex = spec.startRow === "south" ? row - 1 : spec.rows - row;
  const westIndex = spec.startColumn === "west" ? column - 1 : spec.columns - column;
  const west = spec.origin[0] + westIndex * (spec.cellWidth + spec.columnSpacing);
  const south = spec.origin[1] + southIndex * (spec.cellHeight + spec.rowSpacing);
  const east = west + spec.cellWidth;
  const north = south + spec.cellHeight;
  const corners: [number, number][] = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
  ];
  // Two cells that share a corner compute the same number here, so they round alike.
  return corners.map((c) => rotatePoint(c, spec.origin, spec.rotation));
}

/**
 * Plan a grid for one section. Nothing is stored. `existing` is every plot of
 * the site, so a code that belongs to another section is a collision.
 */
export function planGrid(
  spec: GridSpec,
  section: { sectionId: Uuid; name: string },
  existing: readonly ExistingPlot[],
): Result<GridPlan> {
  const checked = checkSpec(spec);
  if (!checked.ok) return checked;

  const skipKeys = new Set(spec.skip.map((s) => `${s.row}/${s.column}`));
  const current = new Map<string, ExistingPlot>();
  const prior = new Map<string, ExistingPlot>();
  for (const plot of existing) {
    current.set(normalizeCode(plot.code), plot);
    for (const code of plot.priorCodes) if (!prior.has(normalizeCode(code))) prior.set(normalizeCode(code), plot);
  }

  const plan: GridPlan = {
    plots: [],
    count: 0,
    added: [],
    retained: [],
    moved: [],
    skipped: [],
    collisions: [],
  };

  for (const [index, place] of numberingOrder(spec).entries()) {
    const number = spec.firstNumber + index;
    if (skipKeys.has(`${place.row}/${place.column}`)) {
      plan.skipped.push({ row: place.row, column: place.column, number });
      continue;
    }
    const code = formatCode(spec.prefix, number, spec.digits);
    const length = checkText("plotCodeChars", code, { ref: code });
    if (!length.ok) return length;
    const footprint = footprintOf(spec, place.row, place.column);
    for (const corner of footprint) {
      if (!checkPoint(corner).ok) return err("out_of_bounds", { code, east: corner[0], north: corner[1] });
    }
    const planned: PlannedPlot = { code, number, row: place.row, column: place.column, footprint };
    plan.plots.push(planned);

    const key = normalizeCode(code);
    const byCurrent = current.get(key);
    const owner = byCurrent ?? prior.get(key);
    if (owner === undefined) {
      plan.added.push(planned);
    } else if (byCurrent !== undefined && byCurrent.sectionId === section.sectionId) {
      const stored = byCurrent.footprint;
      if (stored !== undefined && sameFootprint(stored, footprint)) plan.retained.push({ plot: planned, plotId: byCurrent.plotId });
      else plan.moved.push({ plot: planned, plotId: byCurrent.plotId });
    } else {
      const collision: GridCollision = { code, plotId: owner.plotId };
      if (owner.sectionName !== undefined) collision.sectionName = owner.sectionName;
      plan.collisions.push(collision);
    }
  }

  plan.count = plan.plots.length;
  const first = plan.plots[0];
  const last = plan.plots[plan.plots.length - 1];
  if (first !== undefined) plan.first = first.code;
  if (last !== undefined) plan.last = last.code;

  const capacity = checkLimit("plotsPerSite", existing.length + plan.added.length);
  if (!capacity.ok) return capacity;
  return ok(plan);
}

/**
 * The apply command for a plan. Only added plots are new. A moved plot is
 * included only when its ID is in `approvedMoves`.
 */
export function gridCommand(
  plan: GridPlan,
  section: { sectionId: Uuid; name: string },
  newId: () => Uuid,
  approvedMoves: readonly Uuid[] = [],
): LayoutCommand {
  const plots: NewLayoutPlot[] = plan.added.map((p) => {
    const plotId = newId();
    const spaceId = newId();
    return { plotId, code: p.code, sectionId: section.sectionId, spaces: [{ spaceId }], footprint: p.footprint };
  });
  const approved = new Set(approvedMoves);
  const moves = plan.moved.filter((m) => approved.has(m.plotId)).map((m) => ({ plotId: m.plotId, footprint: m.plot.footprint }));
  return { type: "layout_apply", sections: [{ sectionId: section.sectionId, name: section.name }], plots, moves };
}

/** Old and new codes for a bulk renumber, in the order given. A code that stays is left out. */
export function planRenumber(
  plots: readonly { plotId: Uuid; code: string }[],
  spec: { prefix: string; firstNumber: number; digits: number },
): Result<RenameStep[]> {
  if (!Number.isInteger(spec.firstNumber) || spec.firstNumber < 0) return err("bad_value", { item: "firstNumber", value: spec.firstNumber });
  if (!Number.isInteger(spec.digits) || spec.digits < 0 || spec.digits > 12) return err("bad_value", { item: "digits", value: spec.digits });
  const steps: RenameStep[] = [];
  for (const [index, plot] of plots.entries()) {
    const to = formatCode(spec.prefix, spec.firstNumber + index, spec.digits);
    const length = checkText("plotCodeChars", to, { ref: to });
    if (!length.ok) return length;
    if (to !== plot.code) steps.push({ plotId: plot.plotId, from: plot.code, to });
  }
  return ok(steps);
}

/**
 * The count, first code and last code of a form, while it is typed. Pure, and it needs no size or position.
 * `taken` holds the normalised codes (current and prior) that the site already holds.
 */
export function previewGrid(input: GridPreviewInput, taken: ReadonlySet<string> = new Set()): Result<GridPreview> {
  const size = checkGridSize(input.rows, input.columns, 0);
  if (!size.ok) return size;
  if (!Number.isInteger(input.firstNumber) || input.firstNumber < 0) return err("bad_value", { item: "firstNumber", value: input.firstNumber });
  if (!Number.isInteger(input.digits) || input.digits < 0 || input.digits > 12) return err("bad_value", { item: "digits", value: input.digits });
  for (const place of input.skip) {
    if (place.row < 1 || place.row > input.rows || place.column < 1 || place.column > input.columns) {
      return err("bad_skip", { item: `${place.row}/${place.column}` });
    }
  }
  const skipKeys = new Set(input.skip.map((s) => `${s.row}/${s.column}`));
  // The order is the one planGrid uses, so the two never differ.
  const order = numberingOrder({ ...input, origin: [0, 0], cellWidth: 1, cellHeight: 1, columnSpacing: 0, rowSpacing: 0, rotation: 0 });
  const preview: GridPreview = { count: 0, skipped: 0, cells: [] };
  for (const [index, place] of order.entries()) {
    const number = input.firstNumber + index;
    const skipped = skipKeys.has(`${place.row}/${place.column}`);
    preview.cells.push({ row: place.row, column: place.column, number, skipped });
    if (skipped) {
      preview.skipped += 1;
      continue;
    }
    const code = formatCode(input.prefix, number, input.digits);
    const length = checkText("plotCodeChars", code, { ref: code });
    if (!length.ok) return length;
    if (preview.first === undefined) preview.first = code;
    preview.last = code;
    if (!taken.has(normalizeCode(code))) preview.count += 1;
  }
  return ok(preview);
}
