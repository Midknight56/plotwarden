// T04 (layout commands) and T16 (renumber keeps old codes). Requirements P4 and P2.12.
// Footprints are small squares and rectangles that can be checked by eye.
import { describe, expect, it } from "vitest";
import { emptyCoreState, makeStoredEvent, replay } from "../../template/src/events";
import type { DraftEvent } from "../../template/src/events";
import { findCodeOwner } from "../../template/src/plot";
import { search } from "../../template/src/search";
import type { SearchEntry } from "../../template/src/search";
import type { Point } from "../../template/src/map/coordinates";
import { DEFAULT_BACKDROP } from "../../template/src/map/coordinates";
import { applyLayoutEvent, decideLayout, emptyMap, isMapEmpty } from "../../template/src/map/edit";
import type { LayoutCommand, LayoutEvent, LayoutState, NewLayoutPlot } from "../../template/src/map/edit";
import { gridCommand, planGrid } from "../../template/src/map/generate";
import { SITE_ID, fid } from "../helpers/site";

const CTX = { spacesPerPlot: { min: 1, max: 1 } };
const ON = "2026-01-01";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function blank(): LayoutState {
  return { core: emptyCoreState(SITE_ID), map: emptyMap() };
}

function apply(state: LayoutState, drafts: DraftEvent<LayoutEvent>[]): LayoutState {
  return drafts.reduce((s, d) => applyLayoutEvent(s, d.event), state);
}

function decide(state: LayoutState, command: LayoutCommand) {
  return decideLayout(deepFreeze(structuredClone(state)), command, ON, CTX);
}

function must(state: LayoutState, command: LayoutCommand): LayoutState {
  const r = decide(state, command);
  if (!r.ok) throw new Error(`refused: ${JSON.stringify(r.error)}`);
  return apply(state, r.value);
}

function square(x: number, y: number, size = 10): Point[] {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
  ];
}

function newPlot(code: string, footprint?: Point[], sectionId: string | null = "sec", idName = code): NewLayoutPlot {
  const plot: NewLayoutPlot = { plotId: fid(`plot:${idName}`), code, spaces: [{ spaceId: fid(`space:${idName}`) }] };
  if (sectionId !== null) plot.sectionId = sectionId;
  if (footprint !== undefined) plot.footprint = footprint;
  return plot;
}

function layout(...plots: NewLayoutPlot[]): LayoutCommand {
  return { type: "layout_apply", sections: [{ sectionId: "sec", name: "Paper" }], plots };
}

describe("applying a grid", () => {
  function gridState() {
    const grid = planGrid(
      {
        prefix: "C",
        firstNumber: 1,
        digits: 3,
        rows: 10,
        columns: 20,
        origin: [100, 100],
        cellWidth: 40,
        cellHeight: 30,
        columnSpacing: 0,
        rowSpacing: 0,
        numbering: "across",
        startRow: "south",
        startColumn: "west",
        reverseAlternate: false,
        rotation: 0,
        skip: [],
      },
      { sectionId: "sec", name: "Paper" },
      [],
    );
    if (!grid.ok) throw new Error("grid refused");
    let n = 0;
    const command = gridCommand(grid.value, { sectionId: "sec", name: "Paper" }, () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`);
    const decided = decide(blank(), command);
    if (!decided.ok) throw new Error(`refused: ${JSON.stringify(decided.error)}`);
    return { drafts: decided.value, state: apply(blank(), decided.value), command };
  }

  it("gives one batch: the section, 200 plots and one set of footprints", () => {
    const { drafts } = gridState();
    expect(drafts.length).toBe(202);
    expect(drafts[0]?.event.type).toBe("section_added");
    expect(drafts[1]?.event.type).toBe("plot_added");
    expect(drafts[201]?.event.type).toBe("shapes_set");
    expect(drafts.every((d) => d.effectiveOn === ON)).toBe(true);
  });

  it("makes 200 unchecked plots, each with one space and one footprint", () => {
    const { state } = gridState();
    const plots = Object.values(state.core.plots);
    expect(plots.length).toBe(200);
    expect(plots.every((p) => p.spaces.length === 1 && p.spaces.every((s) => !s.checked))).toBe(true);
    expect(Object.keys(state.map.shapes).length).toBe(200);
    expect(state.map.sections["sec"]?.name).toBe("Paper");
    expect(state.map.mapVersion).toBe(2);
  });

  it("replays from stored events to the same state", () => {
    const { drafts, state } = gridState();
    const stored = drafts.map((d, i) =>
      makeStoredEvent(d as DraftEvent, {
        eventId: `00000000-0000-4000-9000-${(i + 1).toString(16).padStart(12, "0")}`,
        siteId: SITE_ID,
        seq: i + 1,
        opId: "00000000-0000-4000-a000-000000000001",
        recordedAt: "2026-01-01T00:00:00+00:00",
      }),
    );
    const replayed = replay<LayoutState, LayoutEvent>(applyLayoutEvent, blank(), stored);
    expect(replayed).toEqual({ ok: true, value: state });
  });

  it("refuses the same plan again with a code that is already taken, and writes nothing", () => {
    const { state, command } = gridState();
    // A retry with new IDs for the same codes is refused by the core code rule.
    const retry = decide(state, command);
    expect(retry.ok).toBe(false);
    if (!retry.ok) expect(["plot_exists", "code_taken", "duplicate_id"]).toContain(retry.error.code);
  });
});

describe("a failed apply", () => {
  it("returns no event when one footprint overlaps another", () => {
    const r = decide(blank(), layout(newPlot("A", square(0, 0)), newPlot("B", square(20, 0)), newPlot("C", square(5, 5))));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("overlap");
      expect([r.error.detail?.["code"], r.error.detail?.["other"]].sort()).toEqual(["A", "C"]);
    }
  });

  it("allows footprints that only touch", () => {
    expect(decide(blank(), layout(newPlot("A", square(0, 0)), newPlot("B", square(10, 0)), newPlot("C", square(10, 10)))).ok).toBe(true);
  });

  it("refuses a bow tie and names the plot", () => {
    const r = decide(blank(), layout(newPlot("A", [[0, 0], [10, 10], [10, 0], [0, 10]])));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("self_crossing");
      expect(r.error.detail?.["code"]).toBe("A");
    }
  });

  it("refuses a plot ID that already exists", () => {
    const state = must(blank(), layout(newPlot("A", square(0, 0))));
    const r = decide(state, layout(newPlot("A", square(50, 50))));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("plot_exists");
  });

  it("refuses a code that another section holds and names it", () => {
    const state = must(blank(), layout(newPlot("A", square(0, 0))));
    const other: LayoutCommand = {
      type: "layout_apply",
      sections: [{ sectionId: "sec2", name: "North" }],
      plots: [{ plotId: fid("plot:other"), code: "a", sectionId: "sec2", spaces: [{ spaceId: fid("space:other") }] }],
    };
    const r = decide(state, other);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("code_taken");
      expect(r.error.detail?.["sectionId"]).toBe("sec");
    }
  });

  it("refuses a plot in a section that does not exist", () => {
    const r = decide(blank(), { type: "layout_apply", plots: [newPlot("A", square(0, 0), "nowhere")] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("no_such_section");
  });

  it("refuses an empty command", () => {
    const r = decide(blank(), { type: "layout_apply" });
    expect(!r.ok && r.error.code).toBe("nothing_to_apply");
  });

  it("refuses a section with no name, a long name or a name that is taken", () => {
    const empty = decide(blank(), { type: "layout_apply", sections: [{ sectionId: "s", name: "  " }] });
    expect(!empty.ok && empty.error.code).toBe("invalid_input");
    const long = decide(blank(), { type: "layout_apply", sections: [{ sectionId: "s", name: "N".repeat(101) }] });
    expect(!long.ok && long.error.code).toBe("invalid_input");
    const state = must(blank(), { type: "layout_apply", sections: [{ sectionId: "s1", name: "Paper" }] });
    const dup = decide(state, { type: "layout_apply", sections: [{ sectionId: "s2", name: " paper " }] });
    expect(!dup.ok && dup.error.code).toBe("section_name_taken");
  });

  it("accepts 100 sections and refuses the 101st", () => {
    const sections = Array.from({ length: 100 }, (_, i) => ({ sectionId: `s${i}`, name: `Section ${i}` }));
    const state = must(blank(), { type: "layout_apply", sections });
    const r = decide(state, { type: "layout_apply", sections: [{ sectionId: "extra", name: "One more" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detail).toMatchObject({ item: "sectionsPerSite", limit: 100, value: 101 });
  });
});

describe("a section outline", () => {
  const outline: Point[] = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const withOutline = (plot: NewLayoutPlot): LayoutCommand => ({
    type: "layout_apply",
    sections: [{ sectionId: "sec", name: "Paper", outline }],
    plots: [plot],
  });

  it("holds a footprint that touches the outline", () => {
    expect(decide(blank(), withOutline(newPlot("A", square(90, 90)))).ok).toBe(true);
  });

  it("refuses a footprint that leaves the outline", () => {
    const r = decide(blank(), withOutline(newPlot("A", square(95, 95))));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("outside_section");
      expect(r.error.detail?.["code"]).toBe("A");
    }
  });

  it("never drops a linked plot when the outline shrinks, and names it", () => {
    const state = must(blank(), layout(newPlot("C001", square(50, 50)), newPlot("C002", square(10, 10))));
    const shrink: LayoutCommand = {
      type: "layout_apply",
      sections: [{ sectionId: "sec", name: "Paper", outline: [[0, 0], [40, 0], [40, 40], [0, 40]] }],
    };
    const r = decide(state, shrink);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("outline_excludes_plot");
      expect(r.error.detail?.["codes"]).toBe("C001");
    }
  });

  it("allows the shrink when the same command moves that plot inside", () => {
    const state = must(blank(), layout(newPlot("C001", square(50, 50))));
    const shrinkAndMove: LayoutCommand = {
      type: "layout_apply",
      sections: [{ sectionId: "sec", name: "Paper", outline: [[0, 0], [40, 0], [40, 40], [0, 40]] }],
      moves: [{ plotId: fid("plot:C001"), footprint: square(10, 10) }],
    };
    const next = must(state, shrinkAndMove);
    expect(next.map.shapes[fid("plot:C001")]).toEqual(square(10, 10));
    expect(next.map.sections["sec"]?.outline).toEqual([[0, 0], [40, 0], [40, 40], [0, 40]]);
  });

  it("keeps the outline when a rename of the section comes without one", () => {
    const state = must(blank(), withOutline(newPlot("A", square(10, 10))));
    const next = must(state, { type: "layout_apply", sections: [{ sectionId: "sec", name: "Paper Book" }] });
    expect(next.map.sections["sec"]).toMatchObject({ name: "Paper Book", outline });
  });
});

describe("moving a linked plot", () => {
  it("moves only through an explicit move and keeps every ID", () => {
    const before = must(blank(), layout(newPlot("A", square(0, 0)), newPlot("B", square(30, 0))));
    const next = must(before, {
      type: "layout_apply",
      moves: [{ plotId: fid("plot:A"), footprint: square(0, 40) }],
    });
    expect(next.map.shapes[fid("plot:A")]).toEqual(square(0, 40));
    expect(next.core.plots[fid("plot:A")]).toEqual(before.core.plots[fid("plot:A")]);
    expect(next.map.shapes[fid("plot:B")]).toEqual(before.map.shapes[fid("plot:B")]);
    expect(next.map.mapVersion).toBe(before.map.mapVersion + 1);
  });

  it("refuses a move of a plot that does not exist", () => {
    const r = decide(blank(), { type: "layout_apply", moves: [{ plotId: fid("plot:none"), footprint: square(0, 0) }] });
    expect(!r.ok && r.error.code).toBe("no_such_plot");
  });

  it("refuses a move onto another footprint", () => {
    const before = must(blank(), layout(newPlot("A", square(0, 0)), newPlot("B", square(30, 0))));
    const r = decide(before, { type: "layout_apply", moves: [{ plotId: fid("plot:A"), footprint: square(25, 0) }] });
    expect(!r.ok && r.error.code).toBe("overlap");
  });

  it("gives a footprint to a plot that has none, only by a move", () => {
    const before = must(blank(), layout(newPlot("A")));
    expect(before.map.shapes[fid("plot:A")]).toBeUndefined();
    const next = must(before, { type: "layout_apply", moves: [{ plotId: fid("plot:A"), footprint: square(0, 0) }] });
    expect(next.map.shapes[fid("plot:A")]).toEqual(square(0, 0));
  });
});

describe("paths, gate and north", () => {
  // A is x 10 to 20 and B is x 20 to 30, both y 10 to 20.
  const base = () => must(blank(), layout(newPlot("A", square(10, 10)), newPlot("B", square(20, 10))));

  it("sets a path along an edge", () => {
    const next = must(base(), {
      type: "layout_apply",
      paths: [{ pathId: "p1", name: "Yew Walk", points: [[10, 20], [30, 20]] }],
    });
    expect(next.map.paths["p1"]).toEqual({ pathId: "p1", name: "Yew Walk", points: [[10, 20], [30, 20]] });
  });

  it("refuses a path that crosses a plot and names it", () => {
    const r = decide(base(), { type: "layout_apply", paths: [{ pathId: "p1", name: "Walk", points: [[15, 5], [15, 25]] }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("path_crosses");
      expect(r.error.detail?.["code"]).toBe("A");
    }
  });

  it("refuses a new plot placed across a path that exists", () => {
    const withPath = must(blank(), { type: "layout_apply", paths: [{ pathId: "p1", name: "Walk", points: [[0, 5], [100, 5]] }] });
    const r = decide(withPath, layout(newPlot("Z", square(20, 0))));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("path_crosses");
      expect(r.error.detail?.["code"]).toBe("Z");
    }
  });

  it("refuses a path with one point or no name", () => {
    const one = decide(blank(), { type: "layout_apply", paths: [{ pathId: "p", name: "Walk", points: [[0, 0]] }] });
    expect(!one.ok && one.error.code).toBe("too_few_points");
    const unnamed = decide(blank(), { type: "layout_apply", paths: [{ pathId: "p", name: " ", points: [[0, 0], [5, 5]] }] });
    expect(!unnamed.ok && unnamed.error.code).toBe("invalid_input");
  });

  it("sets a named gate and whole degrees of north", () => {
    const next = must(blank(), { type: "layout_apply", gate: { name: "Lantern Gate", at: [500, 20] }, north: 90 });
    expect(next.map.gate).toEqual({ name: "Lantern Gate", at: [500, 20] });
    expect(next.map.north).toBe(90);
  });

  it("refuses a gate with no name or a bad point, and north outside 0 to 359", () => {
    const noName = decide(blank(), { type: "layout_apply", gate: { name: "", at: [5, 5] } });
    expect(!noName.ok && noName.error.fields).toContainEqual({ field: "gate.name", code: "required" });
    const badPoint = decide(blank(), { type: "layout_apply", gate: { name: "G", at: [20000, 5] } });
    expect(!badPoint.ok && badPoint.error.code).toBe("invalid_input");
    for (const north of [360, -1, 1.5]) {
      const r = decide(blank(), { type: "layout_apply", north });
      expect(r.ok, String(north)).toBe(false);
    }
  });
});

describe("no map yet", () => {
  it("is empty until a section, a footprint or a path exists", () => {
    expect(isMapEmpty(emptyMap())).toBe(true);
  });

  it("still takes plots with no footprint, found by code", () => {
    const state = must(blank(), { type: "layout_apply", plots: [newPlot("Z1", undefined, null), newPlot("Z2", undefined, null)] });
    expect(isMapEmpty(state.map)).toBe(true);
    expect(Object.keys(state.core.plots).length).toBe(2);
    expect(findCodeOwner(Object.values(state.core.plots), "z2")?.plotId).toBe(fid("plot:Z2"));
  });

  it("is not empty once a section exists", () => {
    expect(isMapEmpty(must(blank(), { type: "layout_apply", sections: [{ sectionId: "s", name: "Paper" }] }).map)).toBe(false);
  });
});

describe("bulk renumber", () => {
  const three = () => must(blank(), layout(newPlot("C001", square(0, 0)), newPlot("C002", square(20, 0)), newPlot("C003", square(40, 0))));
  const renames = (a: string, b: string, c: string): LayoutCommand => ({
    type: "renumber_plots",
    renames: [
      { plotId: fid("plot:C001"), code: a },
      { plotId: fid("plot:C002"), code: b },
      { plotId: fid("plot:C003"), code: c },
    ],
  });

  it("renames every plot, keeps every ID, and reserves each old code as a prior code", () => {
    const before = three();
    const next = must(before, renames("N010", "N011", "N012"));
    expect(Object.keys(next.core.plots).sort()).toEqual(Object.keys(before.core.plots).sort());
    const a = next.core.plots[fid("plot:C001")];
    expect(a?.code).toBe("N010");
    expect(a?.priorCodes).toEqual(["C001"]);
    expect(a?.spaces).toEqual(before.core.plots[fid("plot:C001")]?.spaces);
    expect(findCodeOwner(Object.values(next.core.plots), "C001")).toEqual({ plotId: fid("plot:C001"), via: "priorCode" });
  });

  it("keeps the old code searchable", () => {
    const next = must(three(), renames("N010", "N011", "N012"));
    const entries: SearchEntry[] = Object.values(next.core.plots).map((p) => ({
      siteId: SITE_ID,
      plotId: p.plotId,
      code: p.code,
      priorCodes: p.priorCodes,
      names: [],
    }));
    const hits = search(entries, SITE_ID, "c001");
    expect(hits.length).toBe(1);
    expect(hits[0]).toMatchObject({ rank: 2, via: "priorCode", code: "N010", plotId: fid("plot:C001") });
  });

  it("reserves the old code from reuse", () => {
    const next = must(three(), renames("N010", "N011", "N012"));
    const r = decide(next, layout(newPlot("C001", square(100, 100), "sec", "reuse")));
    expect(!r.ok && r.error.code).toBe("code_taken");
  });

  it("refuses the whole batch when any new code is taken, with no event at all", () => {
    // The second plot asks for C003, which the third plot holds.
    const r = decide(three(), renames("N010", "C003", "C003"));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("code_taken");
      expect(r.error.detail?.["code"]).toBe("C003");
    }
  });

  it("refuses a swap, because the old codes stay reserved", () => {
    const r = decide(three(), renames("C002", "C001", "C003"));
    expect(r.ok).toBe(false);
  });

  it("has nothing to do when no code changes", () => {
    const r = decide(three(), renames("C001", "C002", "C003"));
    expect(!r.ok && r.error.code).toBe("nothing_to_apply");
    const none = decide(three(), { type: "renumber_plots", renames: [] });
    expect(!none.ok && none.error.code).toBe("nothing_to_apply");
  });
});

describe("the backdrop", () => {
  const withPlots = () => must(blank(), layout(newPlot("A", square(0, 0)), newPlot("B", square(30, 0))));
  const blob = "00000000-0000-4000-8000-0000000000b1";

  it("is set, changed, hidden, locked and removed with no change to any footprint or the map version", () => {
    const start = withPlots();
    let state = must(start, { type: "set_backdrop", blobId: blob, transform: DEFAULT_BACKDROP });
    expect(state.map.backdrop).toEqual({ blobId: blob, transform: DEFAULT_BACKDROP, locked: false, hidden: false });
    state = must(state, { type: "change_backdrop", transform: { ...DEFAULT_BACKDROP, scale: 250, east: 400, north: 300, turn: 90, opacity: 20 } });
    state = must(state, { type: "change_backdrop", hidden: true });
    state = must(state, { type: "change_backdrop", locked: true });
    expect(state.map.backdrop).toMatchObject({ locked: true, hidden: true });
    expect(state.map.shapes).toEqual(start.map.shapes);
    expect(state.map.mapVersion).toBe(start.map.mapVersion);
    expect(state.core).toEqual(start.core);
    state = must(state, { type: "remove_backdrop" });
    expect(state.map.backdrop).toBeUndefined();
    expect(state.map.shapes).toEqual(start.map.shapes);
  });

  it("refuses a transform change while locked, and says why", () => {
    let state = must(withPlots(), { type: "set_backdrop", blobId: blob, transform: DEFAULT_BACKDROP });
    state = must(state, { type: "change_backdrop", locked: true });
    const r = decide(state, { type: "change_backdrop", transform: { ...DEFAULT_BACKDROP, scale: 120 } });
    expect(!r.ok && r.error.code).toBe("backdrop_locked");
    expect(decide(state, { type: "change_backdrop", hidden: true }).ok).toBe(true);
    expect(decide(state, { type: "remove_backdrop" }).ok).toBe(true);
    expect(decide(state, { type: "change_backdrop", locked: false }).ok).toBe(true);
  });

  it("refuses a change or removal when there is no backdrop", () => {
    const state = withPlots();
    expect(decide(state, { type: "change_backdrop", hidden: true }).ok).toBe(false);
    expect(decide(state, { type: "remove_backdrop" }).ok).toBe(false);
  });

  it("refuses a transform out of range", () => {
    const r = decide(withPlots(), { type: "set_backdrop", blobId: blob, transform: { ...DEFAULT_BACKDROP, scale: 0 } });
    expect(!r.ok && r.error.code).toBe("bad_backdrop");
  });
});
