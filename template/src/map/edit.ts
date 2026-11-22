// Map state, map events, layout commands and shape drafts. Pure.
// A layout command is decided against the core state and the map state, with
// no I/O and no random choice. Every ID comes from the command.
import { isValidLocalDate } from "../calendar";
import type { LocalDate } from "../calendar";
import { decideCore } from "../commands";
import type { CoreContext } from "../commands";
import { CORE_PAYLOAD_VERSION, applyCore } from "../events";
import type { CoreEvent, DraftEvent } from "../events";
import { checkLimit, checkText } from "../limits";
import { normalizeCode } from "../plot";
import { err, ok } from "../types";
import type { CoreState, FieldError, Result, Uuid } from "../types";
import { checkBackdropTransform, checkPoint, isPoint } from "./coordinates";
import type { BackdropTransform, Point } from "./coordinates";
import { checkPath, checkPolygon, pathCrossings, polygonInside, polygonsOverlap } from "./geometry";
import type { Shape } from "./geometry";

export interface MapSection {
  sectionId: Uuid;
  name: string;
  displayOrder: number;
  outline?: Point[];
}

export interface MapPath {
  pathId: Uuid;
  name: string;
  points: Point[];
}

export interface Backdrop {
  blobId: Uuid;
  transform: BackdropTransform;
  locked: boolean;
  hidden: boolean;
}

export interface MapState {
  sections: Record<Uuid, MapSection>;
  /** Plot ID to footprint. */
  shapes: Record<Uuid, Point[]>;
  paths: Record<Uuid, MapPath>;
  gate?: { name: string; at: Point };
  /** Whole degrees, 0 is up. */
  north: number;
  /** The count of geometry events. A picker and a table read the same version. */
  mapVersion: number;
  backdrop?: Backdrop;
}

export interface LayoutState {
  core: CoreState;
  map: MapState;
}

export type MapEvent =
  | { type: "section_added"; sectionId: Uuid; name: string; outline?: Point[] }
  | { type: "section_changed"; sectionId: Uuid; name: string; outline?: Point[] }
  | { type: "shapes_set"; shapes: { plotId: Uuid; footprint: Point[] }[] }
  | { type: "shape_moved"; plotId: Uuid; footprint: Point[] }
  | { type: "path_set"; pathId: Uuid; name: string; points: Point[] }
  | { type: "gate_set"; name: string; at: Point }
  | { type: "north_set"; degrees: number }
  | { type: "backdrop_set"; blobId: Uuid; transform: BackdropTransform }
  | { type: "backdrop_changed"; transform?: BackdropTransform; locked?: boolean; hidden?: boolean }
  | { type: "backdrop_removed" };

export type LayoutEvent = CoreEvent | MapEvent;

export interface SectionInput {
  sectionId: Uuid;
  name: string;
  /** Absent means unchanged for a section that exists. */
  outline?: Point[];
}

export interface NewLayoutPlot {
  plotId: Uuid;
  code: string;
  sectionId?: Uuid;
  spaces: { spaceId: Uuid; label?: string }[];
  footprint?: Point[];
}

export type LayoutCommand =
  | {
      type: "layout_apply";
      sections?: SectionInput[];
      plots?: NewLayoutPlot[];
      moves?: { plotId: Uuid; footprint: Point[] }[];
      paths?: { pathId: Uuid; name: string; points: Point[] }[];
      gate?: { name: string; at: Point };
      north?: number;
    }
  | { type: "renumber_plots"; renames: { plotId: Uuid; code: string }[] }
  | { type: "set_backdrop"; blobId: Uuid; transform: BackdropTransform }
  | { type: "change_backdrop"; transform?: BackdropTransform; locked?: boolean; hidden?: boolean }
  | { type: "remove_backdrop" };

export const LAYOUT_COMMAND_TYPES = [
  "layout_apply",
  "renumber_plots",
  "set_backdrop",
  "change_backdrop",
  "remove_backdrop",
] as const;

export const MAP_EVENT_TYPES = [
  "section_added",
  "section_changed",
  "shapes_set",
  "shape_moved",
  "path_set",
  "gate_set",
  "north_set",
  "backdrop_set",
  "backdrop_changed",
  "backdrop_removed",
] as const;

const MAP_TYPES: ReadonlySet<string> = new Set(MAP_EVENT_TYPES);

/** Events that change the drawn geometry. Backdrop events do not. */
const GEOMETRY_TYPES: ReadonlySet<string> = new Set([
  "section_added",
  "section_changed",
  "shapes_set",
  "shape_moved",
  "path_set",
  "gate_set",
  "north_set",
]);

export function emptyMap(): MapState {
  return { sections: {}, shapes: {}, paths: {}, north: 0, mapVersion: 0 };
}

/** True when there is no section, no footprint and no path: "No map yet". */
export function isMapEmpty(map: MapState): boolean {
  return Object.keys(map.sections).length === 0 && Object.keys(map.shapes).length === 0 && Object.keys(map.paths).length === 0;
}

export function isMapEvent(event: { type: string }): event is MapEvent {
  return MAP_TYPES.has(event.type);
}

/** Apply one map event. Returns a new state and never edits the old one. */
export function applyMap(map: MapState, event: MapEvent): MapState {
  const next: MapState = { ...map };
  if (GEOMETRY_TYPES.has(event.type)) next.mapVersion = map.mapVersion + 1;
  switch (event.type) {
    case "section_added": {
      const section: MapSection = {
        sectionId: event.sectionId,
        name: event.name,
        displayOrder: Object.keys(map.sections).length,
      };
      if (event.outline !== undefined) section.outline = event.outline;
      next.sections = { ...map.sections, [event.sectionId]: section };
      return next;
    }
    case "section_changed": {
      const current = map.sections[event.sectionId];
      if (current === undefined) throw new Error(`Corrupt event: no section ${event.sectionId}`);
      const section: MapSection = { sectionId: current.sectionId, name: event.name, displayOrder: current.displayOrder };
      if (event.outline !== undefined) section.outline = event.outline;
      next.sections = { ...map.sections, [event.sectionId]: section };
      return next;
    }
    case "shapes_set": {
      const shapes = { ...map.shapes };
      for (const s of event.shapes) shapes[s.plotId] = s.footprint;
      next.shapes = shapes;
      return next;
    }
    case "shape_moved":
      next.shapes = { ...map.shapes, [event.plotId]: event.footprint };
      return next;
    case "path_set":
      next.paths = { ...map.paths, [event.pathId]: { pathId: event.pathId, name: event.name, points: event.points } };
      return next;
    case "gate_set":
      next.gate = { name: event.name, at: event.at };
      return next;
    case "north_set":
      next.north = event.degrees;
      return next;
    case "backdrop_set":
      next.backdrop = { blobId: event.blobId, transform: event.transform, locked: false, hidden: false };
      return next;
    case "backdrop_changed": {
      const current = map.backdrop;
      if (current === undefined) throw new Error("Corrupt event: no backdrop");
      next.backdrop = {
        ...current,
        transform: event.transform ?? current.transform,
        locked: event.locked ?? current.locked,
        hidden: event.hidden ?? current.hidden,
      };
      return next;
    }
    case "backdrop_removed":
      delete next.backdrop;
      return next;
  }
}

/** Apply one core or map event to the layout state. */
export function applyLayoutEvent(state: LayoutState, event: LayoutEvent): LayoutState {
  if (isMapEvent(event)) return { core: state.core, map: applyMap(state.map, event) };
  return { core: applyCore(state.core, event), map: state.map };
}

function nameProblem(name: string): string | undefined {
  if (name.trim() === "") return "required";
  return checkText("nameChars", name.trim()).ok ? undefined : "over_limit";
}

/** Shape checks that need no geometry. Each error names its field. */
export function validateLayout(command: LayoutCommand, _state: LayoutState): FieldError[] {
  const fields: FieldError[] = [];
  switch (command.type) {
    case "layout_apply": {
      for (const [i, section] of (command.sections ?? []).entries()) {
        const problem = nameProblem(section.name);
        if (problem !== undefined) fields.push({ field: `sections.${i}.name`, code: problem });
      }
      for (const [i, path] of (command.paths ?? []).entries()) {
        const problem = nameProblem(path.name);
        if (problem !== undefined) fields.push({ field: `paths.${i}.name`, code: problem });
      }
      if (command.gate !== undefined) {
        const problem = nameProblem(command.gate.name);
        if (problem !== undefined) fields.push({ field: "gate.name", code: problem });
        if (!isPoint(command.gate.at)) fields.push({ field: "gate.at", code: "bad_coordinate" });
      }
      if (command.north !== undefined && (!Number.isInteger(command.north) || command.north < 0 || command.north > 359)) {
        fields.push({ field: "north", code: "out_of_range" });
      }
      break;
    }
    case "set_backdrop":
      if (command.blobId.trim() === "") fields.push({ field: "blobId", code: "required" });
      break;
    case "renumber_plots":
    case "change_backdrop":
    case "remove_backdrop":
      break;
  }
  return fields;
}

type Drafts = DraftEvent<LayoutEvent>[];

function draftOf(event: LayoutEvent, entityIds: string[], on: LocalDate): DraftEvent<LayoutEvent> {
  return { event, entityIds, effectiveOn: on, payloadVersion: CORE_PAYLOAD_VERSION };
}

function sameOutline(a: readonly Point[] | undefined, b: readonly Point[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((p, i) => p[0] === (b[i] as Point)[0] && p[1] === (b[i] as Point)[1]);
}

function withDetail(error: { code: string; detail?: Readonly<Record<string, string | number | boolean | undefined>> }, extra: Record<string, string | number | boolean | undefined>) {
  return err(error.code, { ...error.detail, ...extra });
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boxOf(points: readonly Point[]): Box {
  const first = points[0] as Point;
  const b: Box = { minX: first[0], minY: first[1], maxX: first[0], maxY: first[1] };
  for (const p of points) {
    if (p[0] < b.minX) b.minX = p[0];
    if (p[1] < b.minY) b.minY = p[1];
    if (p[0] > b.maxX) b.maxX = p[0];
    if (p[1] > b.maxY) b.maxY = p[1];
  }
  return b;
}

function decideApply(
  state: LayoutState,
  command: Extract<LayoutCommand, { type: "layout_apply" }>,
  on: LocalDate,
  ctx: CoreContext,
): Result<Drafts> {
  let core = state.core;
  let map = state.map;
  const drafts: Drafts = [];
  const push = (d: DraftEvent<LayoutEvent>) => {
    drafts.push(d);
    if (isMapEvent(d.event)) map = applyMap(map, d.event);
    else core = applyCore(core, d.event);
  };

  const sections = command.sections ?? [];
  const plots = command.plots ?? [];
  const moves = command.moves ?? [];
  const paths = command.paths ?? [];
  if (sections.length + plots.length + moves.length + paths.length === 0 && command.gate === undefined && command.north === undefined) {
    return err("nothing_to_apply");
  }

  // Sections first, so a new plot can name one.
  const outlineSections: Uuid[] = [];
  for (const input of sections) {
    const name = input.name.trim();
    const key = normalizeCode(name);
    const clash = Object.values(map.sections).find((s) => s.sectionId !== input.sectionId && normalizeCode(s.name) === key);
    if (clash !== undefined) return err("section_name_taken", { name });
    if (input.outline !== undefined) {
      const checked = checkPolygon(input.outline);
      if (!checked.ok) return withDetail(checked.error, { section: name });
      outlineSections.push(input.sectionId);
    }
    const current = map.sections[input.sectionId];
    if (current === undefined) {
      const limit = checkLimit("sectionsPerSite", Object.keys(map.sections).length + 1);
      if (!limit.ok) return limit;
      const event: MapEvent = { type: "section_added", sectionId: input.sectionId, name };
      if (input.outline !== undefined) event.outline = input.outline;
      push(draftOf(event, [input.sectionId], on));
    } else {
      const outline = input.outline ?? current.outline;
      if (name !== current.name || !sameOutline(outline, current.outline)) {
        const event: MapEvent = { type: "section_changed", sectionId: input.sectionId, name };
        if (outline !== undefined) event.outline = outline;
        push(draftOf(event, [input.sectionId], on));
      }
    }
  }

  // New plots go through the core, so its code and limit rules apply.
  const changed = new Map<Uuid, Point[]>();
  const newShapes: { plotId: Uuid; footprint: Point[] }[] = [];
  for (const plot of plots) {
    if (core.plots[plot.plotId] !== undefined) return err("plot_exists", { plotId: plot.plotId, code: plot.code });
    if (plot.sectionId !== undefined && map.sections[plot.sectionId] === undefined) {
      return err("no_such_section", { sectionId: plot.sectionId, code: plot.code });
    }
    const input: Extract<Parameters<typeof decideCore>[1], { type: "add_plot" }> = {
      type: "add_plot",
      plotId: plot.plotId,
      code: plot.code,
      spaces: plot.spaces,
    };
    if (plot.sectionId !== undefined) input.sectionId = plot.sectionId;
    const decided = decideCore(core, input, on, ctx);
    if (!decided.ok) return decided;
    for (const d of decided.value) push(d);
    if (plot.footprint !== undefined) {
      changed.set(plot.plotId, plot.footprint);
      newShapes.push({ plotId: plot.plotId, footprint: plot.footprint });
    }
  }

  const movedIds: Uuid[] = [];
  for (const move of moves) {
    if (core.plots[move.plotId] === undefined) return err("no_such_plot", { plotId: move.plotId });
    if (changed.has(move.plotId)) return err("duplicate_id", { id: move.plotId });
    changed.set(move.plotId, move.footprint);
    movedIds.push(move.plotId);
  }

  const codeOf = (plotId: Uuid): string => core.plots[plotId]?.code ?? plotId;
  const finalShapes: Record<Uuid, Point[]> = { ...map.shapes };
  for (const [plotId, footprint] of changed) finalShapes[plotId] = footprint;

  // Each new or moved footprint: a good polygon, inside its section, clear of the others.
  const boxes = new Map<Uuid, Box>();
  for (const [plotId, footprint] of Object.entries(finalShapes)) if (footprint.length > 0) boxes.set(plotId, boxOf(footprint));
  for (const [plotId, footprint] of changed) {
    const code = codeOf(plotId);
    const polygon = checkPolygon(footprint);
    if (!polygon.ok) return withDetail(polygon.error, { code });
    const sectionId = core.plots[plotId]?.sectionId;
    const outline = sectionId === undefined ? undefined : map.sections[sectionId]?.outline;
    if (outline !== undefined && !polygonInside(footprint, outline)) return err("outside_section", { code });
    const mine = boxes.get(plotId) as Box;
    for (const [otherId, other] of Object.entries(finalShapes)) {
      if (otherId === plotId) continue;
      if (changed.has(otherId) && otherId < plotId) continue; // each pair once
      const theirs = boxes.get(otherId) as Box;
      if (mine.maxX <= theirs.minX || theirs.maxX <= mine.minX || mine.maxY <= theirs.minY || theirs.maxY <= mine.minY) continue;
      if (polygonsOverlap(footprint, other)) return err("overlap", { code, other: codeOf(otherId) });
    }
  }

  // A changed outline must still hold every linked plot that stays where it is.
  for (const sectionId of outlineSections) {
    const outline = map.sections[sectionId]?.outline;
    if (outline === undefined) continue;
    const outside = Object.values(core.plots)
      .filter((p) => p.sectionId === sectionId && !changed.has(p.plotId) && finalShapes[p.plotId] !== undefined)
      .filter((p) => !polygonInside(finalShapes[p.plotId] as Point[], outline))
      .map((p) => p.code);
    if (outside.length > 0) return err("outline_excludes_plot", { codes: outside.join(", "), section: map.sections[sectionId]?.name });
  }

  // Paths: a good line that crosses no footprint. A new footprint must not cross an old path.
  const allShapes: Shape[] = Object.entries(finalShapes).map(([id, points]) => ({ id, points }));
  const changedShapes: Shape[] = [...changed].map(([id, points]) => ({ id, points }));
  const replaced = new Set(paths.map((p) => p.pathId));
  for (const path of paths) {
    const checked = checkPath(path.points);
    if (!checked.ok) return withDetail(checked.error, { name: path.name.trim() });
    const crossed = pathCrossings(path.points, allShapes);
    if (crossed.length > 0) return err("path_crosses", { code: codeOf(crossed[0] as string), name: path.name.trim() });
  }
  if (changedShapes.length > 0) {
    for (const path of Object.values(map.paths)) {
      if (replaced.has(path.pathId)) continue;
      const crossed = pathCrossings(path.points, changedShapes);
      if (crossed.length > 0) return err("path_crosses", { code: codeOf(crossed[0] as string), name: path.name });
    }
  }

  if (newShapes.length > 0) {
    push(draftOf({ type: "shapes_set", shapes: newShapes }, newShapes.map((s) => s.plotId), on));
  }
  for (const plotId of movedIds) {
    push(draftOf({ type: "shape_moved", plotId, footprint: changed.get(plotId) as Point[] }, [plotId], on));
  }
  for (const path of paths) {
    push(draftOf({ type: "path_set", pathId: path.pathId, name: path.name.trim(), points: path.points }, [path.pathId], on));
  }
  if (command.gate !== undefined) push(draftOf({ type: "gate_set", name: command.gate.name.trim(), at: command.gate.at }, [], on));
  if (command.north !== undefined) push(draftOf({ type: "north_set", degrees: command.north }, [], on));
  return ok(drafts);
}

function decideRenumber(
  state: LayoutState,
  command: Extract<LayoutCommand, { type: "renumber_plots" }>,
  on: LocalDate,
  ctx: CoreContext,
): Result<Drafts> {
  let core = state.core;
  const drafts: Drafts = [];
  for (const rename of command.renames) {
    const plot = core.plots[rename.plotId];
    if (plot === undefined) return err("no_such_plot", { plotId: rename.plotId });
    if (rename.code.trim() === plot.code) continue;
    const decided = decideCore(core, { type: "rename_plot", plotId: rename.plotId, code: rename.code }, on, ctx);
    if (!decided.ok) return decided;
    for (const d of decided.value) {
      drafts.push(d);
      core = applyCore(core, d.event);
    }
  }
  if (drafts.length === 0) return err("nothing_to_apply");
  return ok(drafts);
}

function decideBackdrop(
  state: LayoutState,
  command: Extract<LayoutCommand, { type: "set_backdrop" | "change_backdrop" | "remove_backdrop" }>,
  on: LocalDate,
): Result<Drafts> {
  const current = state.map.backdrop;
  switch (command.type) {
    case "set_backdrop": {
      if (current?.locked === true) return err("backdrop_locked");
      const checked = checkBackdropTransform(command.transform);
      if (!checked.ok) return checked;
      return ok([draftOf({ type: "backdrop_set", blobId: command.blobId, transform: checked.value }, [command.blobId], on)]);
    }
    case "change_backdrop": {
      if (current === undefined) return err("no_backdrop");
      const event: MapEvent = { type: "backdrop_changed" };
      if (command.transform !== undefined) {
        if (current.locked) return err("backdrop_locked");
        const checked = checkBackdropTransform(command.transform);
        if (!checked.ok) return checked;
        event.transform = checked.value;
      }
      if (command.locked !== undefined) event.locked = command.locked;
      if (command.hidden !== undefined) event.hidden = command.hidden;
      if (event.transform === undefined && event.locked === undefined && event.hidden === undefined) return err("nothing_to_apply");
      return ok([draftOf(event, [current.blobId], on)]);
    }
    case "remove_backdrop":
      if (current === undefined) return err("no_backdrop");
      return ok([draftOf({ type: "backdrop_removed" }, [current.blobId], on)]);
  }
}

/**
 * Decide a layout command at an effective date. Returns a typed error or an
 * ordered batch of draft events. A failed check returns no event at all.
 */
export function decideLayout(
  state: LayoutState,
  command: LayoutCommand,
  effectiveOn: LocalDate,
  ctx: CoreContext,
): Result<Drafts> {
  if (!isValidLocalDate(effectiveOn)) return err("invalid_date");
  const fields = validateLayout(command, state);
  if (fields.length > 0) return err("invalid_input", undefined, { fields });
  switch (command.type) {
    case "layout_apply":
      return decideApply(state, command, effectiveOn, ctx);
    case "renumber_plots":
      return decideRenumber(state, command, effectiveOn, ctx);
    case "set_backdrop":
    case "change_backdrop":
    case "remove_backdrop":
      return decideBackdrop(state, command, effectiveOn);
  }
}

export interface ShapeDraft {
  readonly points: readonly Point[];
}

export const EMPTY_DRAFT: ShapeDraft = Object.freeze({ points: [] });

/** Add a point. Nothing is written. A point equal to the last one is refused. */
export function draftAdd(draft: ShapeDraft, point: readonly [number, number]): Result<ShapeDraft> {
  const checked = checkPoint(point);
  if (!checked.ok) return checked;
  const last = draft.points[draft.points.length - 1];
  if (last !== undefined && last[0] === point[0] && last[1] === point[1]) return err("not_distinct", { index: draft.points.length - 1 });
  const limit = checkLimit("polygonVertices", draft.points.length + 1);
  if (!limit.ok) return limit;
  return ok({ points: [...draft.points, [point[0], point[1]] as Point] });
}

export function draftUndo(draft: ShapeDraft): ShapeDraft {
  return { points: draft.points.slice(0, -1) };
}

export function draftCancel(): ShapeDraft {
  return { points: [] };
}

export function draftLast(draft: ShapeDraft): Point | undefined {
  return draft.points[draft.points.length - 1];
}

/** Check the draft as a shape or a path and give its points. The draft is not changed. */
export function draftClose(draft: ShapeDraft, shape: "polygon" | "path"): Result<Point[]> {
  const checked = shape === "polygon" ? checkPolygon(draft.points) : checkPath(draft.points);
  if (!checked.ok) return checked;
  return ok([...draft.points]);
}
