// Support: plot notes and photos. Requirements P14.2 and P14.3.
import { describe, expect, it } from "vitest";
import { applyCore, emptyCoreState } from "../../template/src/events";
import { LIMITS } from "../../template/src/limits";
import { applyNote, decideNote, isNoteEvent, livePhotos } from "../../template/src/notes";
import type { NoteCommand, NoteEvent, NotesState } from "../../template/src/notes";
import { SITE_ID, fid, plotAdded } from "../helpers/site";

const ON = "2026-01-01";
const core = applyCore(applyCore(emptyCoreState(SITE_ID), plotAdded("Y07")), plotAdded("Y08"));
const PLOT = fid("plot:Y07");

function run(notes: NotesState, command: NoteCommand): { notes: NotesState; events: NoteEvent[] } {
  const r = decideNote(core, notes, command, ON);
  if (!r.ok) throw new Error(`refused: ${JSON.stringify(r.error)}`);
  return { notes: r.value.reduce((s, d) => applyNote(s, d.event), notes), events: r.value.map((d) => d.event) };
}

function photo(n: number, patch: Partial<Extract<NoteCommand, { type: "add_photo" }>> = {}): NoteCommand {
  return {
    type: "add_photo",
    photoId: `photo-${n}`,
    plotId: PLOT,
    blobId: `blob-${n}`,
    imageType: "jpeg",
    width: 800,
    height: 600,
    bytes: 120_000,
    caption: { text: `Stone ${n}` },
    ...patch,
  };
}

describe("notes", () => {
  it("stores the text exactly, with outer spaces and line breaks", () => {
    const text = "  First line\nSecond line  \n";
    const { notes, events } = run({}, { type: "add_note", noteId: "n1", plotId: PLOT, text });
    expect(events).toEqual([{ type: "note_added", noteId: "n1", plotId: PLOT, text }]);
    expect(notes[PLOT]?.notes).toEqual([{ noteId: "n1", plotId: PLOT, text }]);
  });

  it("keeps notes of one plot apart from another", () => {
    const one = run({}, { type: "add_note", noteId: "n1", plotId: PLOT, text: "a" });
    const two = run(one.notes, { type: "add_note", noteId: "n2", plotId: fid("plot:Y08"), text: "b" });
    expect(two.notes[PLOT]?.notes.length).toBe(1);
    expect(two.notes[fid("plot:Y08")]?.notes.length).toBe(1);
  });

  it("takes 4,000 characters and refuses 4,001", () => {
    expect(decideNote(core, {}, { type: "add_note", noteId: "n", plotId: PLOT, text: "x".repeat(LIMITS.noteChars) }, ON).ok).toBe(true);
    const over = decideNote(core, {}, { type: "add_note", noteId: "n", plotId: PLOT, text: "x".repeat(LIMITS.noteChars + 1) }, ON);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.code).toBe("invalid_input");
  });

  it("refuses a blank note and a note for a plot that does not exist", () => {
    const blank = decideNote(core, {}, { type: "add_note", noteId: "n", plotId: PLOT, text: " \n " }, ON);
    expect(!blank.ok && blank.error.fields).toContainEqual({ field: "text", code: "required" });
    const none = decideNote(core, {}, { type: "add_note", noteId: "n", plotId: "nope", text: "a" }, ON);
    expect(!none.ok && none.error.code).toBe("no_such_plot");
  });

  it("refuses a note ID that is already used", () => {
    const one = run({}, { type: "add_note", noteId: "n1", plotId: PLOT, text: "a" });
    const again = decideNote(core, one.notes, { type: "add_note", noteId: "n1", plotId: PLOT, text: "b" }, ON);
    expect(!again.ok && again.error.code).toBe("duplicate_id");
  });
});

describe("photos", () => {
  it("holds a blob reference, type, size and caption, and no file name", () => {
    const { events } = run({}, photo(1, { pageRef: "Page 12" }));
    expect(events[0]).toEqual({
      type: "photo_added",
      photoId: "photo-1",
      plotId: PLOT,
      blobId: "blob-1",
      imageType: "jpeg",
      width: 800,
      height: 600,
      bytes: 120_000,
      caption: { text: "Stone 1" },
      pageRef: "Page 12",
    });
    expect(Object.keys(events[0] as object)).not.toContain("filename");
  });

  it("takes 8 photos and refuses a ninth", () => {
    let notes: NotesState = {};
    for (let i = 1; i <= 8; i += 1) notes = run(notes, photo(i)).notes;
    expect(livePhotos(notes, PLOT).length).toBe(8);
    const ninth = decideNote(core, notes, photo(9), ON);
    expect(ninth.ok).toBe(false);
    if (!ninth.ok) expect(ninth.error.detail).toMatchObject({ item: "photosPerRecord", limit: 8, value: 9 });
  });

  it("frees a place when a photo is removed, and keeps the earlier event", () => {
    let notes: NotesState = {};
    for (let i = 1; i <= 8; i += 1) notes = run(notes, photo(i)).notes;
    const removed = run(notes, { type: "remove_photo", photoId: "photo-3", plotId: PLOT });
    expect(removed.events).toEqual([{ type: "photo_removed", photoId: "photo-3", plotId: PLOT }]);
    expect(livePhotos(removed.notes, PLOT).length).toBe(7);
    expect(removed.notes[PLOT]?.photos.length).toBe(8);
    expect(removed.notes[PLOT]?.photos.find((p) => p.photoId === "photo-3")?.removed).toBe(true);
    expect(decideNote(core, removed.notes, photo(9), ON).ok).toBe(true);
  });

  it("refuses to remove a photo twice or one that does not exist", () => {
    const one = run({}, photo(1));
    const gone = run(one.notes, { type: "remove_photo", photoId: "photo-1", plotId: PLOT });
    const twice = decideNote(core, gone.notes, { type: "remove_photo", photoId: "photo-1", plotId: PLOT }, ON);
    expect(!twice.ok && twice.error.code).toBe("already_removed");
    const none = decideNote(core, one.notes, { type: "remove_photo", photoId: "nope", plotId: PLOT }, ON);
    expect(!none.ok && none.error.code).toBe("no_such_photo");
  });

  it("needs a description or the choice Description pending", () => {
    expect(decideNote(core, {}, photo(1, { caption: { pending: true } }), ON).ok).toBe(true);
    expect(decideNote(core, {}, photo(1, { caption: { text: "A stone in snow" } }), ON).ok).toBe(true);
    const empty = decideNote(core, {}, photo(1, { caption: { text: "  " } }), ON);
    expect(!empty.ok && empty.error.fields).toContainEqual({ field: "caption", code: "required" });
    const neither = decideNote(core, {}, photo(1, { caption: {} as never }), ON);
    expect(neither.ok).toBe(false);
  });

  it("checks the type, the size and the blob", () => {
    const code = (patch: Partial<Extract<NoteCommand, { type: "add_photo" }>>) => {
      const r = decideNote(core, {}, photo(1, patch), ON);
      return r.ok ? "ok" : r.error.code;
    };
    expect(code({ imageType: "gif" as never })).toBe("invalid_input");
    expect(code({ width: 0 })).toBe("invalid_input");
    expect(code({ height: 2401 })).toBe("invalid_input");
    expect(code({ width: 2400, height: 2400 })).toBe("ok");
    expect(code({ bytes: LIMITS.photoBytes })).toBe("ok");
    expect(code({ bytes: LIMITS.photoBytes + 1 })).toBe("invalid_input");
    expect(code({ blobId: "" })).toBe("invalid_input");
  });

  it("refuses a photo ID that is already used, and a photo for another plot's removal", () => {
    const one = run({}, photo(1));
    expect(decideNote(core, one.notes, photo(1), ON).ok).toBe(false);
    const wrongPlot = decideNote(core, one.notes, { type: "remove_photo", photoId: "photo-1", plotId: fid("plot:Y08") }, ON);
    expect(wrongPlot.ok).toBe(false);
  });
});

describe("applying events", () => {
  it("never changes the state it was given", () => {
    const start: NotesState = {};
    const frozen = Object.freeze(start);
    const next = applyNote(frozen, { type: "note_added", noteId: "n1", plotId: PLOT, text: "a" });
    expect(frozen).toEqual({});
    expect(next[PLOT]?.notes.length).toBe(1);
  });

  it("knows its own events and no others", () => {
    expect(isNoteEvent({ type: "note_added" })).toBe(true);
    expect(isNoteEvent({ type: "photo_removed" })).toBe(true);
    expect(isNoteEvent({ type: "plot_added" })).toBe(false);
    expect(isNoteEvent({ type: "burial_recorded" })).toBe(false);
  });
});
