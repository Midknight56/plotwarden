// The base state of a register: core, layout and notes, with one apply and one decide.
// An app state extends this. An event the base does not know is left to the app.
import type { LocalDate } from "./calendar";
import { CORE_COMMAND_TYPES, decideCore, validateCore } from "./commands";
import type { CoreCommand, CoreContext } from "./commands";
import { applyCore, emptyCoreState, isCoreEvent } from "./events";
import type { DraftEvent } from "./events";
import { LAYOUT_COMMAND_TYPES, applyMap, decideLayout, emptyMap, isMapEvent, validateLayout } from "./map/edit";
import type { LayoutCommand, LayoutEvent, MapState } from "./map/edit";
import { NOTE_COMMAND_TYPES, applyNote, decideNote, isNoteEvent, validateNote } from "./notes";
import type { NoteCommand, NoteEvent, NotesState } from "./notes";
import { err } from "./types";
import type { CoreState, FieldError, Result, Uuid } from "./types";

export interface BaseState {
  core: CoreState;
  map: MapState;
  notes: NotesState;
}

export type BaseCommand = CoreCommand | LayoutCommand | NoteCommand;
export type BaseEvent = LayoutEvent | NoteEvent;

export const BASE_COMMAND_TYPES = [...CORE_COMMAND_TYPES, ...LAYOUT_COMMAND_TYPES, ...NOTE_COMMAND_TYPES] as const;

const BASE_NAMES: ReadonlySet<string> = new Set(BASE_COMMAND_TYPES);
const CORE_NAMES: ReadonlySet<string> = new Set(CORE_COMMAND_TYPES);
const LAYOUT_NAMES: ReadonlySet<string> = new Set(LAYOUT_COMMAND_TYPES);

export function emptyBase(siteId: Uuid): BaseState {
  return { core: emptyCoreState(siteId), map: emptyMap(), notes: {} };
}

export function isBaseCommand(command: { type: string }): command is BaseCommand {
  return BASE_NAMES.has(command.type);
}

/** Apply a core, layout or note event. Returns undefined for any other event. */
export function applyBase<S extends BaseState>(state: S, event: { type: string }): S | undefined {
  if (isCoreEvent(event)) return { ...state, core: applyCore(state.core, event) };
  if (isMapEvent(event)) return { ...state, map: applyMap(state.map, event) };
  if (isNoteEvent(event)) return { ...state, notes: applyNote(state.notes, event) };
  return undefined;
}

export function validateBase(command: BaseCommand, state: BaseState): FieldError[] {
  if (CORE_NAMES.has(command.type)) return validateCore(command as CoreCommand, state.core);
  if (LAYOUT_NAMES.has(command.type)) return validateLayout(command as LayoutCommand, { core: state.core, map: state.map });
  return validateNote(command as NoteCommand);
}

export function decideBase(
  state: BaseState,
  command: BaseCommand,
  effectiveOn: LocalDate,
  ctx: CoreContext,
): Result<DraftEvent<BaseEvent>[]> {
  if (!isBaseCommand(command)) return err("unknown_command", { type: (command as { type: string }).type });
  if (CORE_NAMES.has(command.type)) return decideCore(state.core, command as CoreCommand, effectiveOn, ctx);
  if (LAYOUT_NAMES.has(command.type)) {
    return decideLayout({ core: state.core, map: state.map }, command as LayoutCommand, effectiveOn, ctx);
  }
  return decideNote(state.core, state.notes, command as NoteCommand, effectiveOn);
}
