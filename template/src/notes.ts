// Plot notes and photos. Pure. Both are private and are kept as events.
// A removed photo is a new event. The earlier event stays.
import type { LocalDate } from "./calendar";
import { isValidLocalDate } from "./calendar";
import { CORE_PAYLOAD_VERSION } from "./events";
import type { DraftEvent } from "./events";
import { LIMITS, checkLimit, checkText } from "./limits";
import { err, ok } from "./types";
import type { CoreState, FieldError, Result, Uuid } from "./types";

export type ImageType = "jpeg" | "png" | "webp";

export type Caption = { text: string } | { pending: true };

export interface Note {
  noteId: Uuid;
  plotId: Uuid;
  /** Exactly as typed, including line breaks. */
  text: string;
}

export interface Photo {
  photoId: Uuid;
  plotId: Uuid;
  blobId: Uuid;
  imageType: ImageType;
  width: number;
  height: number;
  bytes: number;
  caption: Caption;
  /** A private page reference. */
  pageRef?: string;
  removed: boolean;
}

export interface PlotNotes {
  notes: Note[];
  photos: Photo[];
}

export type NotesState = Record<Uuid, PlotNotes>;

export type NoteEvent =
  | { type: "note_added"; noteId: Uuid; plotId: Uuid; text: string }
  | {
      type: "photo_added";
      photoId: Uuid;
      plotId: Uuid;
      blobId: Uuid;
      imageType: ImageType;
      width: number;
      height: number;
      bytes: number;
      caption: Caption;
      pageRef?: string;
    }
  | { type: "photo_removed"; photoId: Uuid; plotId: Uuid };

export type NoteCommand =
  | { type: "add_note"; noteId: Uuid; plotId: Uuid; text: string }
  | {
      type: "add_photo";
      photoId: Uuid;
      plotId: Uuid;
      blobId: Uuid;
      imageType: ImageType;
      width: number;
      height: number;
      bytes: number;
      caption: Caption;
      pageRef?: string;
    }
  | { type: "remove_photo"; photoId: Uuid; plotId: Uuid };

export const NOTE_COMMAND_TYPES = ["add_note", "add_photo", "remove_photo"] as const;
export const NOTE_EVENT_TYPES = ["note_added", "photo_added", "photo_removed"] as const;

const NOTE_TYPES: ReadonlySet<string> = new Set(NOTE_EVENT_TYPES);
const IMAGE_TYPES: readonly string[] = ["jpeg", "png", "webp"];

export function isNoteEvent(event: { type: string }): event is NoteEvent {
  return NOTE_TYPES.has(event.type);
}

function entry(state: NotesState, plotId: Uuid): PlotNotes {
  return state[plotId] ?? { notes: [], photos: [] };
}

export function applyNote(state: NotesState, event: NoteEvent): NotesState {
  const current = entry(state, event.plotId);
  switch (event.type) {
    case "note_added":
      return {
        ...state,
        [event.plotId]: { ...current, notes: [...current.notes, { noteId: event.noteId, plotId: event.plotId, text: event.text }] },
      };
    case "photo_added": {
      const photo: Photo = {
        photoId: event.photoId,
        plotId: event.plotId,
        blobId: event.blobId,
        imageType: event.imageType,
        width: event.width,
        height: event.height,
        bytes: event.bytes,
        caption: event.caption,
        removed: false,
      };
      if (event.pageRef !== undefined) photo.pageRef = event.pageRef;
      return { ...state, [event.plotId]: { ...current, photos: [...current.photos, photo] } };
    }
    case "photo_removed":
      return {
        ...state,
        [event.plotId]: {
          ...current,
          photos: current.photos.map((p) => (p.photoId === event.photoId ? { ...p, removed: true } : p)),
        },
      };
  }
}

/** The photos of a plot that have not been removed. */
export function livePhotos(state: NotesState, plotId: Uuid): Photo[] {
  return entry(state, plotId).photos.filter((p) => !p.removed);
}

function captionProblem(caption: Caption): string | undefined {
  if ("pending" in caption && caption.pending === true) return undefined;
  const text = (caption as { text?: unknown }).text;
  if (typeof text !== "string" || text.trim() === "") return "required";
  return checkText("noteChars", text).ok ? undefined : "over_limit";
}

function whole(n: number, min: number, max: number): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}

export function validateNote(command: NoteCommand): FieldError[] {
  const fields: FieldError[] = [];
  switch (command.type) {
    case "add_note":
      if (command.text.trim() === "") fields.push({ field: "text", code: "required" });
      else if (!checkText("noteChars", command.text).ok) fields.push({ field: "text", code: "over_limit" });
      break;
    case "add_photo": {
      if (command.blobId.trim() === "") fields.push({ field: "blobId", code: "required" });
      if (!IMAGE_TYPES.includes(command.imageType)) fields.push({ field: "imageType", code: "bad_type" });
      if (!whole(command.width, 1, LIMITS.photoStoredLongEdge)) fields.push({ field: "width", code: "out_of_range" });
      if (!whole(command.height, 1, LIMITS.photoStoredLongEdge)) fields.push({ field: "height", code: "out_of_range" });
      if (!whole(command.bytes, 1, LIMITS.photoBytes)) fields.push({ field: "bytes", code: "out_of_range" });
      const problem = captionProblem(command.caption);
      if (problem !== undefined) fields.push({ field: "caption", code: problem });
      if (command.pageRef !== undefined && !checkText("sourceRefChars", command.pageRef).ok) {
        fields.push({ field: "pageRef", code: "over_limit" });
      }
      break;
    }
    case "remove_photo":
      break;
  }
  return fields;
}

function draftOf(event: NoteEvent, entityIds: string[], on: LocalDate): DraftEvent<NoteEvent> {
  return { event, entityIds, effectiveOn: on, payloadVersion: CORE_PAYLOAD_VERSION };
}

export function decideNote(
  core: CoreState,
  notes: NotesState,
  command: NoteCommand,
  effectiveOn: LocalDate,
): Result<DraftEvent<NoteEvent>[]> {
  if (!isValidLocalDate(effectiveOn)) return err("invalid_date");
  const fields = validateNote(command);
  if (fields.length > 0) return err("invalid_input", undefined, { fields });
  if (core.plots[command.plotId] === undefined) return err("no_such_plot", { plotId: command.plotId });
  const current = entry(notes, command.plotId);

  switch (command.type) {
    case "add_note": {
      const used = Object.values(notes).some((p) => p.notes.some((n) => n.noteId === command.noteId));
      if (used) return err("duplicate_id", { id: command.noteId });
      return ok([draftOf({ type: "note_added", noteId: command.noteId, plotId: command.plotId, text: command.text }, [command.plotId, command.noteId], effectiveOn)]);
    }
    case "add_photo": {
      const used = Object.values(notes).some((p) => p.photos.some((x) => x.photoId === command.photoId));
      if (used) return err("duplicate_id", { id: command.photoId });
      const limit = checkLimit("photosPerRecord", current.photos.filter((p) => !p.removed).length + 1);
      if (!limit.ok) return limit;
      const event: NoteEvent = {
        type: "photo_added",
        photoId: command.photoId,
        plotId: command.plotId,
        blobId: command.blobId,
        imageType: command.imageType,
        width: command.width,
        height: command.height,
        bytes: command.bytes,
        caption: command.caption,
      };
      if (command.pageRef !== undefined) event.pageRef = command.pageRef;
      return ok([draftOf(event, [command.plotId, command.photoId, command.blobId], effectiveOn)]);
    }
    case "remove_photo": {
      const photo = current.photos.find((p) => p.photoId === command.photoId);
      if (photo === undefined) return err("no_such_photo", { photoId: command.photoId });
      if (photo.removed) return err("already_removed", { photoId: command.photoId });
      return ok([draftOf({ type: "photo_removed", photoId: command.photoId, plotId: command.plotId }, [command.plotId, command.photoId], effectiveOn)]);
    }
  }
}
