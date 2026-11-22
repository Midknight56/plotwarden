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
import { REVIEW_COMMAND_TYPES, applyReview, decideReview, emptyReview, isReviewEvent, validateReview } from "./review";
import type { ReviewCommand, ReviewEvent, ReviewState } from "./review";
import { err } from "./types";
import type { CoreState, FieldError, Result, Uuid } from "./types";

export interface BaseState {
  core: CoreState;
  map: MapState;
  notes: NotesState;
  /** The committee ledger: keys, versions, labels, site name and receipts. */
  review: ReviewState;
}

export type BaseCommand = CoreCommand | LayoutCommand | NoteCommand | ReviewCommand;
export type BaseEvent = LayoutEvent | NoteEvent | ReviewEvent;

/** The core, layout and note commands. The two review commands are listed apart, in `REVIEW_COMMAND_TYPES`. */
export const BASE_COMMAND_TYPES = [...CORE_COMMAND_TYPES, ...LAYOUT_COMMAND_TYPES, ...NOTE_COMMAND_TYPES] as const;

const BASE_NAMES: ReadonlySet<string> = new Set([...BASE_COMMAND_TYPES, ...REVIEW_COMMAND_TYPES]);
const CORE_NAMES: ReadonlySet<string> = new Set(CORE_COMMAND_TYPES);
const LAYOUT_NAMES: ReadonlySet<string> = new Set(LAYOUT_COMMAND_TYPES);
const REVIEW_NAMES: ReadonlySet<string> = new Set(REVIEW_COMMAND_TYPES);

export function emptyBase(siteId: Uuid): BaseState {
  return { core: emptyCoreState(siteId), map: emptyMap(), notes: {}, review: emptyReview() };
}

export function isBaseCommand(command: { type: string }): command is BaseCommand {
  return BASE_NAMES.has(command.type);
}

/** Apply a core, layout, note or review event. Returns undefined for any other event. */
export function applyBase<S extends BaseState>(state: S, event: { type: string }): S | undefined {
  if (isCoreEvent(event)) return { ...state, core: applyCore(state.core, event) };
  if (isMapEvent(event)) return { ...state, map: applyMap(state.map, event) };
  if (isNoteEvent(event)) return { ...state, notes: applyNote(state.notes, event) };
  if (isReviewEvent(event)) return { ...state, review: applyReview(state.review, event) };
  return undefined;
}

export function validateBase(command: BaseCommand, state: BaseState): FieldError[] {
  if (CORE_NAMES.has(command.type)) return validateCore(command as CoreCommand, state.core);
  if (LAYOUT_NAMES.has(command.type)) return validateLayout(command as LayoutCommand, { core: state.core, map: state.map });
  if (REVIEW_NAMES.has(command.type)) return validateReview(command as ReviewCommand);
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
  if (REVIEW_NAMES.has(command.type)) return decideReview(state.review, command as ReviewCommand, effectiveOn);
  return decideNote(state.core, state.notes, command as NoteCommand, effectiveOn);
}
