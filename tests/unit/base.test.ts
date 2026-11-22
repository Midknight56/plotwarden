// Support: the base state of a register. Requirements P14.1.
import { describe, expect, it } from "vitest";
import { BASE_COMMAND_TYPES, applyBase, decideBase, emptyBase, isBaseCommand, validateBase } from "../../template/src/base";
import type { BaseCommand, BaseState } from "../../template/src/base";
import { replay } from "../../template/src/events";
import type { StoredEvent } from "../../template/src/events";
import { makeStoredEvent } from "../../template/src/events";
import { emptyMap } from "../../template/src/map/edit";
import { SITE_ID, fid } from "../helpers/site";

const CTX = { spacesPerPlot: { min: 1, max: 1 } };
const ON = "2026-01-01";

interface AppState extends BaseState {
  burials: Record<string, string>;
}

const start = (): AppState => ({ ...emptyBase(SITE_ID), burials: {} });

const addPlot: BaseCommand = { type: "add_plot", plotId: fid("plot:A"), code: "A1", spaces: [{ spaceId: fid("space:A") }] };

describe("the empty base", () => {
  it("holds an empty core, an empty map and no notes", () => {
    const base = emptyBase(SITE_ID);
    expect(base.core).toEqual({ siteId: SITE_ID, plots: {}, claims: {} });
    expect(base.map).toEqual(emptyMap());
    expect(base.notes).toEqual({});
  });
});

describe("the command names", () => {
  it("are the 8 core, 5 layout and 3 note commands, with none twice", () => {
    expect(BASE_COMMAND_TYPES.length).toBe(16);
    expect(new Set(BASE_COMMAND_TYPES).size).toBe(16);
    for (const name of ["add_plot", "confirm_empty", "layout_apply", "renumber_plots", "set_backdrop", "add_note", "add_photo", "remove_photo"]) {
      expect(BASE_COMMAND_TYPES).toContain(name);
    }
  });

  it("tells a base command from an app command", () => {
    expect(isBaseCommand({ type: "add_plot" })).toBe(true);
    expect(isBaseCommand({ type: "layout_apply" })).toBe(true);
    expect(isBaseCommand({ type: "add_note" })).toBe(true);
    expect(isBaseCommand({ type: "record_burial" })).toBe(false);
  });
});

describe("applying an event", () => {
  it("applies a core event, a map event and a note event, and keeps the app's own fields", () => {
    let state = start();
    state.burials["b1"] = "kept";
    const withPlot = applyBase(state, { type: "plot_added", plotId: fid("plot:A"), code: "A1", spaces: [{ spaceId: fid("space:A"), label: "1" }] } as never);
    expect(withPlot?.core.plots[fid("plot:A")]?.code).toBe("A1");
    expect(withPlot?.burials).toEqual({ b1: "kept" });
    state = withPlot as AppState;
    const withSection = applyBase(state, { type: "section_added", sectionId: "s", name: "Paper" } as never);
    expect(withSection?.map.sections["s"]?.name).toBe("Paper");
    const withNote = applyBase(state, { type: "note_added", noteId: "n", plotId: fid("plot:A"), text: "t" } as never);
    expect(withNote?.notes[fid("plot:A")]?.notes.length).toBe(1);
  });

  it("returns a new state and leaves the old one alone", () => {
    const before = start();
    const after = applyBase(before, { type: "north_set", degrees: 20 } as never);
    expect(after).not.toBe(before);
    expect(before.map.north).toBe(0);
    expect(after?.map.north).toBe(20);
  });

  it("returns nothing for an event that belongs to the app", () => {
    expect(applyBase(start(), { type: "burial_recorded", burialId: "b" } as never)).toBeUndefined();
  });
});

describe("deciding a command", () => {
  it("sends each command to its own rules", () => {
    const state = start();
    const plot = decideBase(state, addPlot, ON, CTX);
    expect(plot.ok && plot.value.map((d) => d.event.type)).toEqual(["plot_added"]);
    const layout = decideBase(state, { type: "layout_apply", north: 30 }, ON, CTX);
    expect(layout.ok && layout.value.map((d) => d.event.type)).toEqual(["north_set"]);
    const withPlot = applyBase(state, (plot as { value: { event: { type: string } }[] }).value[0]?.event as never) as AppState;
    const note = decideBase(withPlot, { type: "add_note", noteId: "n", plotId: fid("plot:A"), text: "hello" }, ON, CTX);
    expect(note.ok && note.value.map((d) => d.event.type)).toEqual(["note_added"]);
  });

  it("refuses a command it does not know", () => {
    const r = decideBase(start(), { type: "record_burial" } as never, ON, CTX);
    expect(!r.ok && r.error.code).toBe("unknown_command");
  });

  it("checks fields for each kind of command", () => {
    const state = start();
    expect(validateBase({ type: "add_plot", plotId: "p", code: "  ", spaces: [] }, state).map((f) => f.field)).toEqual(["code"]);
    expect(validateBase({ type: "layout_apply", north: 400 }, state)).toEqual([{ field: "north", code: "out_of_range" }]);
    expect(validateBase({ type: "add_note", noteId: "n", plotId: "p", text: " " }, state)).toEqual([{ field: "text", code: "required" }]);
  });

  it("replays stored events to the state built one event at a time", () => {
    let state = start();
    const drafts = [] as ReturnType<typeof makeStoredEvent>[];
    let seq = 0;
    for (const command of [addPlot, { type: "layout_apply", north: 10, gate: { name: "Gate", at: [5, 5] } } as BaseCommand]) {
      const r = decideBase(state, command, ON, CTX);
      if (!r.ok) throw new Error(JSON.stringify(r.error));
      for (const d of r.value) {
        seq += 1;
        drafts.push(
          makeStoredEvent(d as never, {
            eventId: `00000000-0000-4000-9000-${seq.toString(16).padStart(12, "0")}`,
            siteId: SITE_ID,
            seq,
            opId: "00000000-0000-4000-a000-000000000001",
            recordedAt: "2026-01-01T00:00:00+00:00",
          }),
        );
        state = applyBase(state, d.event) as AppState;
      }
    }
    const replayed = replay<AppState, { type: string }>((s, e) => applyBase(s, e) ?? s, start(), drafts as StoredEvent[]);
    expect(replayed).toEqual({ ok: true, value: state });
  });
});
