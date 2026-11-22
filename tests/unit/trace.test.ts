// T05 (layout file round trip, conflicting import, backdrop kept apart). Requirements P5.
import { describe, expect, it } from "vitest";
import { emptyCoreState } from "../../template/src/events";
import type { DraftEvent } from "../../template/src/events";
import type { Point } from "../../template/src/map/coordinates";
import { DEFAULT_BACKDROP } from "../../template/src/map/coordinates";
import { applyLayoutEvent, decideLayout, emptyMap } from "../../template/src/map/edit";
import type { LayoutCommand, LayoutEvent, LayoutState } from "../../template/src/map/edit";
import { buildLayoutFile, layoutFileText, parseLayoutFile, planLayoutImport } from "../../template/src/map/layoutFile";
import type { LayoutFile } from "../../template/src/map/layoutFile";
import { parseFamily, scanForCanaries } from "../../template/src/output/privacy";
import { SITE_ID, fid } from "../helpers/site";

const CTX = { spacesPerPlot: { min: 1, max: 1 } };
const ON = "2026-01-01";

function blank(): LayoutState {
  return { core: emptyCoreState(SITE_ID), map: emptyMap() };
}

function apply(state: LayoutState, drafts: DraftEvent<LayoutEvent>[]): LayoutState {
  return drafts.reduce((s, d) => applyLayoutEvent(s, d.event), state);
}

function must(state: LayoutState, command: LayoutCommand): LayoutState {
  const r = decideLayout(structuredClone(state), command, ON, CTX);
  if (!r.ok) throw new Error(`refused: ${JSON.stringify(r.error)}`);
  return apply(state, r.value);
}

function counter(start: number) {
  let n = start;
  return () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
}

function sq(x: number, y: number, size: number): Point[] {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
  ];
}

const plot = (code: string, sectionId: string, footprint: Point[]) => ({
  plotId: fid(`plot:${code}`),
  code,
  sectionId,
  spaces: [{ spaceId: fid(`space:${code}`) }],
  footprint,
});

/** Two irregular sections, a gate and a path. */
function source(): LayoutState {
  return must(blank(), {
    type: "layout_apply",
    sections: [
      { sectionId: "n", name: "North Lawn", outline: [[0, 0], [200, 0], [200, 100], [100, 100], [100, 200], [0, 200]] },
      { sectionId: "s", name: "South Lawn", outline: [[300, 0], [500, 0], [500, 200], [300, 200]] },
    ],
    plots: [
      plot("N001", "n", sq(10, 10, 30)),
      plot("N002", "n", sq(50, 10, 30)),
      plot("N003", "n", sq(10, 150, 30)),
      plot("S01", "s", sq(310, 10, 50)),
      plot("S02", "s", sq(370, 10, 50)),
    ],
    paths: [{ pathId: "p1", name: "Cross Walk", points: [[250, 0], [250, 200]] }],
    gate: { name: "Main Gate", at: [250, 0] },
    north: 15,
  });
}

function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, into));
  else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      keysOf(v, into);
    }
  }
  return into;
}

describe("the layout file", () => {
  it("holds only sections, plot codes, footprints, paths, gate and north", () => {
    const file = buildLayoutFile(source());
    expect(file.format).toBe("plot.layout.v1");
    expect([...keysOf(file)].sort()).toEqual(
      ["at", "code", "footprint", "format", "gate", "name", "north", "outline", "paths", "plots", "points", "ref", "section", "sections"].sort(),
    );
    expect(file.sections.map((s) => s.name)).toEqual(["North Lawn", "South Lawn"]);
    expect(file.plots.map((p) => p.code)).toEqual(["N001", "N002", "N003", "S01", "S02"]);
    expect(file.gate).toEqual({ name: "Main Gate", at: [250, 0] });
    expect(file.north).toBe(15);
  });

  it("holds no private ID, status, person or backdrop", () => {
    let state = source();
    state = must(state, { type: "set_backdrop", blobId: "00000000-0000-4000-8000-0000000000b1", transform: DEFAULT_BACKDROP });
    const text = layoutFileText(buildLayoutFile(state));
    const canaries = [
      "00000000-0000-4000-8000-0000000000b1",
      ...Object.keys(state.core.plots),
      "backdrop",
      "transform",
      "blobId",
      "status",
      "checked",
      "person",
    ];
    expect(scanForCanaries(text, canaries)).toEqual([]);
  });

  it("is the same text before and after the backdrop changes", () => {
    const start = source();
    const before = layoutFileText(buildLayoutFile(start));
    let state = must(start, { type: "set_backdrop", blobId: "00000000-0000-4000-8000-0000000000b1", transform: DEFAULT_BACKDROP });
    state = must(state, { type: "change_backdrop", transform: { ...DEFAULT_BACKDROP, scale: 300, east: 500, north: 400, turn: 45 } });
    state = must(state, { type: "change_backdrop", hidden: true });
    expect(layoutFileText(buildLayoutFile(state))).toBe(before);
  });
});

describe("the backdrop is kept apart from the plots", () => {
  it("leaves every committed footprint untouched when the backdrop moves", () => {
    const start = source();
    let state = must(start, { type: "set_backdrop", blobId: "00000000-0000-4000-8000-0000000000b1", transform: DEFAULT_BACKDROP });
    state = must(state, { type: "change_backdrop", transform: { ...DEFAULT_BACKDROP, east: 900, north: 900, scale: 40 } });
    for (const [plotId, footprint] of Object.entries(start.map.shapes)) {
      expect(state.map.shapes[plotId]).toBe(footprint);
    }
    expect(state.map.mapVersion).toBe(start.map.mapVersion);
  });

  it("is not a field of a visitor file", () => {
    const family = {
      format: "plot.family.v1",
      asOf: "2026-04-20",
      siteTitle: "Lantern Fold",
      north: 0,
      gate: { name: "Lantern Gate", x: 1, y: 1 },
      paths: [],
      sections: [],
      plots: [],
      burials: [],
    };
    expect(parseFamily(family).ok).toBe(true);
    expect(parseFamily({ ...family, backdrop: { blobId: "x" } }).ok).toBe(false);
    expect(parseFamily({ ...family, plots: [{ id: "a", code: "A1", sectionId: "s", backdrop: "x" }] }).ok).toBe(false);
  });
});

describe("reading a layout file", () => {
  const good = () => structuredClone(buildLayoutFile(source())) as LayoutFile;
  const text = (file: unknown) => JSON.stringify(file);
  const code = (input: string) => {
    const r = parseLayoutFile(input);
    return r.ok ? "ok" : r.error.code;
  };

  it("reads what it wrote, byte for byte", () => {
    const file = buildLayoutFile(source());
    const read = parseLayoutFile(layoutFileText(file));
    expect(read).toEqual({ ok: true, value: file });
    expect(layoutFileText((read as { ok: true; value: LayoutFile }).value)).toBe(layoutFileText(file));
  });

  it("is chosen by its format, not by anything else", () => {
    expect(code(text({ ...good(), format: "plot.backup.v1" }))).toBe("wrong_file");
    expect(code(text({ hello: "world" }))).toBe("wrong_file");
    expect(code("not json")).toBe("bad_layout_file");
    expect(code("[]")).toBe("wrong_file");
  });

  it("says a newer version needs a newer program, and writes nothing", () => {
    expect(code(text({ ...good(), format: "plot.layout.v2" }))).toBe("newer_version");
    expect(code(text({ ...good(), format: "plot.layout.v10" }))).toBe("newer_version");
  });

  it("rejects a key it does not know at every depth", () => {
    const top = { ...good(), extra: 1 };
    expect(code(text(top))).toBe("bad_layout_file");
    const inPlot = good();
    (inPlot.plots[0] as Record<string, unknown>)["status"] = "taken";
    expect(code(text(inPlot))).toBe("bad_layout_file");
    const inGate = good();
    (inGate.gate as Record<string, unknown>)["person"] = "A";
    expect(code(text(inGate))).toBe("bad_layout_file");
    const inSection = good();
    (inSection.sections[0] as Record<string, unknown>)["publicLabel"] = "A";
    expect(code(text(inSection))).toBe("bad_layout_file");
    const inPath = good();
    (inPath.paths[0] as Record<string, unknown>)["id"] = "A";
    expect(code(text(inPath))).toBe("bad_layout_file");
  });

  it("rejects coordinates that are not integers from 0 to 10,000", () => {
    for (const bad of [20000, -1, 1.5, "7"]) {
      const file = good();
      (file.plots[0] as { footprint: unknown[] }).footprint[0] = [bad, 5];
      expect(code(text(file)), String(bad)).toBe("bad_layout_file");
    }
  });

  it("rejects a shape that is not a good polygon", () => {
    const file = good();
    (file.plots[0] as { footprint: unknown[] }).footprint = [[0, 0], [10, 10], [10, 0], [0, 10]];
    expect(code(text(file))).toBe("bad_layout_file");
  });

  it("rejects duplicate section names, duplicate plot codes and a missing section", () => {
    const dupSection = good();
    (dupSection.sections[1] as { name: string }).name = " north lawn ";
    expect(code(text(dupSection))).toBe("bad_layout_file");
    const dupCode = good();
    (dupCode.plots[1] as { code: string }).code = "n001";
    expect(code(text(dupCode))).toBe("bad_layout_file");
    const dangling = good();
    (dangling.plots[0] as { section: string }).section = "zz";
    expect(code(text(dangling))).toBe("bad_layout_file");
  });

  it("rejects north outside 0 to 359", () => {
    expect(code(text({ ...good(), north: 360 }))).toBe("bad_layout_file");
  });
});

describe("importing into a new site", () => {
  it("mints fresh IDs, keeps codes and shapes, and leaves every plot unchecked", () => {
    const original = source();
    const file = buildLayoutFile(original);
    const plan = planLayoutImport(file, blank(), counter(0x500));
    expect(plan.conflicts).toEqual([]);
    expect(plan.addedPlots).toBe(5);
    expect(plan.command).toBeDefined();
    const imported = must(blank(), plan.command as LayoutCommand);

    expect(Object.keys(imported.core.plots).filter((id) => id in original.core.plots)).toEqual([]);
    expect(Object.keys(imported.map.sections).filter((id) => id in original.map.sections)).toEqual([]);
    const summary = (s: LayoutState) =>
      Object.values(s.core.plots)
        .map((p) => ({
          code: p.code,
          section: p.sectionId === undefined ? undefined : s.map.sections[p.sectionId]?.name,
          footprint: s.map.shapes[p.plotId],
        }))
        .sort((a, b) => a.code.localeCompare(b.code));
    expect(summary(imported)).toEqual(summary(original));
    expect(Object.values(imported.core.plots).every((p) => p.spaces.every((sp) => !sp.checked))).toBe(true);
    expect(imported.map.gate).toEqual(original.map.gate);
    expect(imported.map.north).toBe(15);
    expect(Object.values(imported.map.paths).map((p) => [p.name, p.points])).toEqual([["Cross Walk", [[250, 0], [250, 200]]]]);
    expect(Object.values(imported.map.sections).map((s) => s.outline)).toEqual(Object.values(original.map.sections).map((s) => s.outline));
    expect(imported.map.backdrop).toBeUndefined();
  });

  it("round trips: a file written from the import equals the file it came from", () => {
    const file = buildLayoutFile(source());
    const imported = must(blank(), planLayoutImport(file, blank(), counter(0x600)).command as LayoutCommand);
    expect(layoutFileText(buildLayoutFile(imported))).toBe(layoutFileText(file));
  });
});

describe("importing into a site that has a layout", () => {
  const filled = () => {
    const file = buildLayoutFile(source());
    return { file, state: must(blank(), planLayoutImport(file, blank(), counter(0x700)).command as LayoutCommand) };
  };

  it("adds zero plots when the import is repeated", () => {
    const { file, state } = filled();
    const again = planLayoutImport(file, state, counter(0x800));
    expect(again.conflicts).toEqual([]);
    expect(again.addedPlots).toBe(0);
    expect(again.addedSections).toBe(0);
    expect(again.retainedPlots).toBe(5);
    expect(again.command).toBeUndefined();
  });

  it("blocks the whole batch when a footprint differs, and names the code", () => {
    const { file, state } = filled();
    const changed = structuredClone(file);
    (changed.plots[1] as { footprint: FileFootprint }).footprint = sq(60, 10, 30) as FileFootprint;
    // A new plot goes with the conflict. The whole batch is still blocked.
    changed.plots.push({ section: "s1", code: "N099", footprint: sq(120, 10, 20) as FileFootprint });
    const plan = planLayoutImport(changed, state, counter(0x900));
    expect(plan.conflicts).toEqual([{ rule: "footprint_differs", code: "N002" }]);
    expect(plan.command).toBeUndefined();
  });

  it("blocks when a code belongs to another section", () => {
    const { file, state } = filled();
    const changed = structuredClone(file);
    const first = changed.plots[0] as { section?: string };
    first.section = changed.sections[1]?.ref as string;
    const plan = planLayoutImport(changed, state, counter(0xa00));
    expect(plan.conflicts.map((c) => c.rule)).toContain("code_in_other_section");
    expect(plan.conflicts.find((c) => c.rule === "code_in_other_section")).toMatchObject({ code: "N001", section: "North Lawn" });
    expect(plan.command).toBeUndefined();
  });

  it("blocks when the gate, north, a path or an outline differs", () => {
    const { file, state } = filled();
    const gate = structuredClone(file);
    gate.gate = { name: "Main Gate", at: [260, 0] };
    expect(planLayoutImport(gate, state, counter(1)).conflicts).toEqual([{ rule: "gate_differs", name: "Main Gate" }]);
    const north = { ...structuredClone(file), north: 90 };
    expect(planLayoutImport(north, state, counter(1)).conflicts).toEqual([{ rule: "north_differs" }]);
    const path = structuredClone(file);
    (path.paths[0] as { points: FileFootprint }).points = [[250, 0], [250, 150]];
    expect(planLayoutImport(path, state, counter(1)).conflicts).toEqual([{ rule: "path_differs", name: "Cross Walk" }]);
    const outline = structuredClone(file);
    (outline.sections[1] as { outline: FileFootprint }).outline = [[300, 0], [500, 0], [500, 100], [300, 100]];
    expect(planLayoutImport(outline, state, counter(1)).conflicts).toEqual([{ rule: "outline_differs", name: "South Lawn" }]);
  });

  it("adds only the new plots, keeps the unmatched ones and uses the existing section", () => {
    const { file, state } = filled();
    const more = structuredClone(file);
    more.plots.push({ section: "s1", code: "N004", footprint: sq(50, 50, 30) as FileFootprint });
    const plan = planLayoutImport(more, state, counter(0xb00));
    expect(plan.conflicts).toEqual([]);
    expect(plan.addedPlots).toBe(1);
    expect(plan.retainedPlots).toBe(5);
    const next = must(state, plan.command as LayoutCommand);
    expect(Object.keys(next.core.plots).length).toBe(6);
    const northId = Object.values(state.map.sections).find((s) => s.name === "North Lawn")?.sectionId;
    expect(Object.values(next.core.plots).find((p) => p.code === "N004")?.sectionId).toBe(northId);
    // The original plots keep their IDs and their footprints.
    for (const [id, p] of Object.entries(state.core.plots)) {
      expect(next.core.plots[id]).toEqual(p);
      expect(next.map.shapes[id]).toBe(state.map.shapes[id]);
    }
    // And a repeat adds nothing more.
    expect(planLayoutImport(more, next, counter(0xc00)).addedPlots).toBe(0);
  });

  it("keeps a plot of the site that the file does not hold", () => {
    const { file, state } = filled();
    const fewer = structuredClone(file);
    fewer.plots = fewer.plots.filter((p) => p.code !== "S02");
    const plan = planLayoutImport(fewer, state, counter(0xd00));
    expect(plan.conflicts).toEqual([]);
    expect(plan.command).toBeUndefined();
    expect(Object.keys(state.core.plots).length).toBe(5);
  });
});

type FileFootprint = [number, number][];
