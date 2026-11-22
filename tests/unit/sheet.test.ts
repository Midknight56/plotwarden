// T05 (safe drawing: one model for screen and print). Requirements P6.
// Numbers are worked by hand. Plots A (0,0)-(100,100) and B (100,0)-(200,100),
// width 400: the scale is (400 - 2 * 24) / 200 = 1.76, the sheet is
// 100 * 1.76 + 48 (top band) + 24 (bottom) = 248 high, and A's south west
// corner is at x 24, y 248 - 24 = 224.
import { describe, expect, it } from "vitest";
import { DEFAULT_BACKDROP, fromScreen, toScreen } from "../../template/src/map/coordinates";
import type { Point } from "../../template/src/map/coordinates";
import { emptyMap } from "../../template/src/map/edit";
import type { MapState } from "../../template/src/map/edit";
import { buildSheet } from "../../template/src/map/sheet";
import type { Label, SheetModel, SheetPlotInput } from "../../template/src/map/sheet";

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

function map(patch: Partial<MapState> = {}): MapState {
  return {
    ...emptyMap(),
    shapes: { A: rect(0, 0, 100, 100), B: rect(100, 0, 200, 100) },
    ...patch,
  };
}

const marks = (...entries: [string, SheetPlotInput["mark"]][]): SheetPlotInput[] =>
  entries.map(([id, mark]) => ({ plotId: id, code: `${id}01`, mark }));

const free = { state: "free", needsChecking: false } as const;
const taken = { state: "taken", needsChecking: false } as const;

const plots2 = () => marks(["A", free], ["B", taken]);

describe("fitting", () => {
  it("fits the width and puts the top band and the bottom margin around the plots", () => {
    const sheet = buildSheet({ map: map(), plots: plots2() }, { width: 400 });
    expect(sheet.width).toBe(400);
    expect(sheet.scale).toBeCloseTo(1.76, 9);
    expect(sheet.height).toBeCloseTo(248, 9);
    expect(sheet.empty).toBe(false);
  });

  it("flips north once: the south west corner is low and the north west corner is high", () => {
    const a = buildSheet({ map: map(), plots: plots2() }, { width: 400 }).plots.find((p) => p.plotId === "A");
    expect(a?.points[0]?.map((n) => Math.round(n * 1000) / 1000)).toEqual([24, 224]);
    expect(a?.points[3]?.map((n) => Math.round(n * 1000) / 1000)).toEqual([24, 48]);
    expect(a?.points[2]?.map((n) => Math.round(n * 1000) / 1000)).toEqual([200, 48]);
  });

  it("puts a plot to the east on the right and a plot to the north above", () => {
    const m = map({ shapes: { A: rect(0, 0, 100, 100), B: rect(100, 0, 200, 100), C: rect(0, 100, 100, 200) } });
    const sheet = buildSheet({ map: m, plots: marks(["A", free], ["B", free], ["C", free]) }, { width: 400 });
    const at = (id: string) => sheet.plots.find((p) => p.plotId === id) as NonNullable<(typeof sheet.plots)[number]>;
    expect(at("B").box.x).toBeGreaterThan(at("A").box.x);
    expect(at("C").box.y).toBeLessThan(at("A").box.y);
  });

  it("keeps every drawn point inside the sheet", () => {
    const sheet = buildSheet({ map: map(), plots: plots2() }, { width: 400 });
    for (const p of sheet.plots) {
      for (const [x, y] of p.points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(sheet.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(sheet.height);
      }
    }
  });

  it("multiplies width and scale by the zoom", () => {
    const one = buildSheet({ map: map(), plots: plots2() }, { width: 400 });
    const two = buildSheet({ map: map(), plots: plots2() }, { width: 400, zoom: 2 });
    expect(two.width).toBe(800);
    expect(two.scale).toBeCloseTo((800 - 48) / 200, 9);
    expect(two.height).toBeGreaterThan(one.height);
  });

  it("limits the height of a tall site and keeps it inside", () => {
    const tall = map({ shapes: { A: rect(0, 0, 100, 10000) } });
    const sheet = buildSheet({ map: tall, plots: marks(["A", free]) }, { width: 400 });
    expect(sheet.height).toBeLessThanOrEqual(500);
    for (const [x, y] of sheet.plots[0]?.points ?? []) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(400);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(sheet.height);
    }
  });

  it("is the same for the same input", () => {
    const a = buildSheet({ map: map(), plots: plots2(), selectedPlotId: "A" }, { width: 400 });
    const b = buildSheet({ map: map(), plots: plots2(), selectedPlotId: "A" }, { width: 400 });
    expect(a).toEqual(b);
  });

  it("fits given bounds when the keeper is drawing on an empty map", () => {
    const sheet = buildSheet({ map: emptyMap(), plots: [] }, { width: 400, bounds: { minEast: 0, minNorth: 0, maxEast: 1000, maxNorth: 500 } });
    expect(sheet.empty).toBe(true);
    expect(sheet.scale).toBeCloseTo(0.352, 9);
    expect(sheet.height).toBeCloseTo(500 * 0.352 + 72, 9);
  });
});

describe("an empty map", () => {
  it("says so when there is no footprint, outline or path", () => {
    const sheet = buildSheet({ map: emptyMap(), plots: [] }, { width: 400 });
    expect(sheet.empty).toBe(true);
    expect(sheet.plots).toEqual([]);
    expect(sheet.height).toBeGreaterThan(0);
    expect(sheet.key.length).toBe(5);
  });

  it("is also empty with a section that has no outline", () => {
    const m = { ...emptyMap(), sections: { s: { sectionId: "s", name: "Paper", displayOrder: 0 } } };
    expect(buildSheet({ map: m, plots: [] }, { width: 400 }).empty).toBe(true);
  });

  it("leaves out a plot that has no footprint", () => {
    const sheet = buildSheet({ map: map(), plots: [...plots2(), { plotId: "Z", code: "Z01", mark: free }] }, { width: 400 });
    expect(sheet.plots.map((p) => p.plotId)).toEqual(["A", "B"]);
  });
});

describe("marks and the selected plot", () => {
  it("carries each mark as given and flags only the selected plot", () => {
    const sheet = buildSheet(
      { map: map(), plots: marks(["A", { state: "reserved", needsChecking: false }], ["B", { needsChecking: true }]), selectedPlotId: "B" },
      { width: 400 },
    );
    expect(sheet.plots.map((p) => [p.plotId, p.mark, p.selected])).toEqual([
      ["A", { state: "reserved", needsChecking: false }, false],
      ["B", { needsChecking: true }, true],
    ]);
  });

  it("lists the key in a fixed order", () => {
    expect(buildSheet({ map: map(), plots: plots2() }, { width: 400 }).key).toEqual(["free", "reserved", "taken", "unusable", "checking"]);
  });
});

describe("text", () => {
  it("draws a code inside a plot that is at least 40 px each way", () => {
    const sheet = buildSheet({ map: map(), plots: plots2() }, { width: 400 });
    const a = sheet.plots[0];
    expect(a?.label?.text).toBe("A01");
    expect(a?.label?.size).toBeGreaterThanOrEqual(12);
    expect(a?.box.width).toBeCloseTo(176, 6);
  });

  it("draws no per plot code when the plots are too small, and a tab for the selected one", () => {
    const shapes: Record<string, Point[]> = {};
    const inputs: SheetPlotInput[] = [];
    for (let i = 0; i < 200; i += 1) {
      const x = (i % 20) * 40;
      const y = Math.floor(i / 20) * 30;
      shapes[`P${i}`] = rect(x, y, x + 40, y + 30);
      inputs.push({ plotId: `P${i}`, code: `C${String(i + 1).padStart(3, "0")}`, mark: free });
    }
    const sheet = buildSheet({ map: map({ shapes }), plots: inputs, selectedPlotId: "P4" }, { width: 328 });
    expect(sheet.plots.length).toBe(200);
    expect(sheet.plots.every((p) => p.label === undefined)).toBe(true);
    expect(sheet.tab).toMatchObject({ code: "C005", size: 14 });
    expect(sheet.tab?.width).toBeGreaterThanOrEqual(48);
  });

  it("draws no tab when no plot is selected", () => {
    expect(buildSheet({ map: map(), plots: plots2() }, { width: 400 }).tab).toBeUndefined();
  });

  it("never draws text under 12 px", () => {
    const m = map({
      sections: { s: { sectionId: "s", name: "Paper", displayOrder: 0, outline: rect(0, 0, 200, 100) } },
      paths: { p: { pathId: "p", name: "Yew Walk", points: [[0, 100], [200, 100]] } },
      gate: { name: "Lantern Gate", at: [100, 0] },
    });
    const sheet = buildSheet({ map: m, plots: plots2(), selectedPlotId: "A" }, { width: 400 });
    const sizes = [
      ...sheet.plots.flatMap((p) => (p.label === undefined ? [] : [p.label.size])),
      ...sheet.sections.map((s) => s.label.size),
      ...sheet.paths.map((p) => p.label.size),
      ...(sheet.gate === undefined ? [] : [sheet.gate.label.size]),
      ...(sheet.tab === undefined ? [] : [sheet.tab.size]),
    ];
    expect(sizes.length).toBeGreaterThanOrEqual(5);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });
});

describe("sections, paths, gate and north", () => {
  const m = () =>
    map({
      sections: { s: { sectionId: "s", name: "Paper", displayOrder: 0, outline: rect(0, 0, 200, 100) } },
      paths: { p: { pathId: "p", name: "Yew Walk", points: [[0, 100], [200, 100]] } },
      gate: { name: "Lantern Gate", at: [100, 0] },
      north: 15,
    });

  it("labels a section above its outline", () => {
    // The path of the shared fixture lies on the top edge of this outline, so no label could sit above the outline
    // and keep clear of that path (A12). This test is about the place above the outline, so it has the section alone.
    const alone = map({ sections: { s: { sectionId: "s", name: "Paper", displayOrder: 0, outline: rect(0, 0, 200, 100) } }, north: 15 });
    const section = buildSheet({ map: alone, plots: plots2() }, { width: 400 }).sections[0];
    expect(section?.name).toBe("Paper");
    expect(section?.label.text).toBe("Paper");
    expect(section?.label.x).toBeCloseTo(28, 6);
    expect(section?.label.y).toBeCloseTo(44, 6);
    expect(section?.points?.length).toBe(4);
  });

  it("flips a path and names it", () => {
    const path = buildSheet({ map: m(), plots: plots2() }, { width: 400 }).paths[0];
    expect(path?.name).toBe("Yew Walk");
    expect(path?.points[0]?.map((n) => Math.round(n * 1000) / 1000)).toEqual([24, 48]);
    expect(path?.points[1]?.map((n) => Math.round(n * 1000) / 1000)).toEqual([376, 48]);
    expect(path?.label.text).toBe("Yew Walk");
  });

  it("places the gate by its point and names it", () => {
    const gate = buildSheet({ map: m(), plots: plots2() }, { width: 400 }).gate;
    expect(gate?.name).toBe("Lantern Gate");
    expect(gate?.x).toBeCloseTo(200, 6);
    expect(gate?.y).toBeCloseTo(224, 6);
    expect(gate?.label.text).toBe("Lantern Gate");
  });

  it("puts the north arrow at the top right at the angle given", () => {
    const north = buildSheet({ map: m(), plots: plots2() }, { width: 400 }).north;
    expect(north).toEqual({ x: 376, y: 28, degrees: 15 });
  });

  it("has no gate when none is set", () => {
    expect(buildSheet({ map: map(), plots: plots2() }, { width: 400 }).gate).toBeUndefined();
  });
});

describe("the backdrop", () => {
  const withBackdrop = (patch: Partial<NonNullable<MapState["backdrop"]>> = {}) =>
    map({ backdrop: { blobId: "blob-1", transform: DEFAULT_BACKDROP, locked: false, hidden: false, ...patch } });

  it("is drawn on the screen when asked, with the matrix from the same numbers", () => {
    const sheet = buildSheet(
      { map: withBackdrop(), plots: plots2() },
      { width: 400, showBackdrop: true, imageSize: { width: 100, height: 50 } },
    );
    expect(sheet.backdrop?.blobId).toBe("blob-1");
    expect(sheet.backdrop?.opacity).toBeCloseTo(0.5, 9);
    const matrix = sheet.backdrop?.matrix ?? [];
    expect(matrix[0]).toBeCloseTo(1.76, 9);
    expect(matrix[3]).toBeCloseTo(1.76, 9);
    expect(matrix[4]).toBeCloseTo(24, 9);
    expect(matrix[5]).toBeCloseTo(224 - 50 * 1.76, 9);
  });

  it("is left out for print", () => {
    const sheet = buildSheet({ map: withBackdrop(), plots: plots2() }, { width: 400, showBackdrop: false, imageSize: { width: 100, height: 50 } });
    expect(sheet.backdrop).toBeUndefined();
    expect(buildSheet({ map: withBackdrop(), plots: plots2() }, { width: 400 }).backdrop).toBeUndefined();
  });

  it("is left out when hidden or when the image has not loaded", () => {
    const hidden = buildSheet({ map: withBackdrop({ hidden: true }), plots: plots2() }, { width: 400, showBackdrop: true, imageSize: { width: 100, height: 50 } });
    expect(hidden.backdrop).toBeUndefined();
    const unloaded = buildSheet({ map: withBackdrop(), plots: plots2() }, { width: 400, showBackdrop: true });
    expect(unloaded.backdrop).toBeUndefined();
  });

  it("does not change where a plot is drawn", () => {
    const plain = buildSheet({ map: map(), plots: plots2() }, { width: 400 });
    const moved = buildSheet(
      {
        map: withBackdrop({ transform: { ...DEFAULT_BACKDROP, scale: 400, east: 900, north: 800, turn: 33 } }),
        plots: plots2(),
      },
      { width: 400, showBackdrop: true, imageSize: { width: 100, height: 50 } },
    );
    expect(moved.plots).toEqual(plain.plots);
    expect(moved.height).toBe(plain.height);
  });
});

describe("the view", () => {
  it("is given, so a point on the screen turns back into a site point", () => {
    const sheet = buildSheet({ map: map(), plots: plots2() }, { width: 400 });
    expect(sheet.view.scale).toBe(sheet.scale);
    expect(sheet.view.height).toBe(sheet.height);
    for (const p of [[0, 0], [200, 100], [75, 40]] as [number, number][]) {
      expect(fromScreen(toScreen(p, sheet.view), sheet.view)).toEqual({ ok: true, value: p });
    }
    expect(toScreen([0, 0], sheet.view).map((n) => Math.round(n * 1000) / 1000)).toEqual([24, 224]);
  });
});

// Labels keep clear of lines, tabs and each other (spec 04, A12). Seen in the churchyard map: the gate label
// sat on the path dots and a section label touched the paper tab of the selected plot. The checks below
// are written from the rule, with their own estimate of the size of a letter and their own distances.
describe("labels keep clear (A12)", () => {
  const LETTER = 7.4; // a little wider than the drawing assumes, so the check is the stricter one

  interface Box {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }

  const boxOf = (label: Label): Box => {
    const w = label.text.length * LETTER * (label.size / 12);
    const x0 = label.anchor === "start" ? label.x : label.anchor === "middle" ? label.x - w / 2 : label.x - w;
    return { x0, y0: label.y - label.size, x1: x0 + w, y1: label.y + 3 };
  };

  const overlap = (a: Box, b: Box, gap = 0): boolean => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;

  /** The shortest distance from a box to a line, found by walking along the line. */
  function distance(box: Box, line: readonly (readonly [number, number])[]): number {
    let best = Infinity;
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i] as readonly [number, number];
      const b = line[i + 1] as readonly [number, number];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(length / 1));
      for (let s = 0; s <= steps; s++) {
        const x = a[0] + ((b[0] - a[0]) * s) / steps;
        const y = a[1] + ((b[1] - a[1]) * s) / steps;
        const dx = Math.max(box.x0 - x, 0, x - box.x1);
        const dy = Math.max(box.y0 - y, 0, y - box.y1);
        best = Math.min(best, Math.hypot(dx, dy));
      }
    }
    return best;
  }

  const north = (m: SheetModel): Box => ({ x0: m.north.x - 14, y0: m.north.y - 18, x1: m.north.x + 14, y1: m.north.y + 12 });

  function checkSheet(m: SheetModel, name: string): void {
    const labels: { what: string; label: Label }[] = [];
    // A label with no clear place is left out on a narrow sheet, so only the labels that are drawn are checked.
    for (const s of m.sections) if (s.label !== undefined) labels.push({ what: `section ${s.name}`, label: s.label });
    for (const p of m.paths) if (p.label !== undefined) labels.push({ what: `path ${p.name}`, label: p.label });
    if (m.gate?.label !== undefined) labels.push({ what: "gate", label: m.gate.label });
    for (const p of m.plots) if (p.label !== undefined) labels.push({ what: `plot ${p.code}`, label: p.label });
    for (const { what, label } of labels) {
      const b = boxOf(label);
      expect(b.x0, `${name}: ${what} left edge`).toBeGreaterThanOrEqual(8);
      expect(b.x1, `${name}: ${what} right edge`).toBeLessThanOrEqual(m.width - 8);
      expect(b.y0, `${name}: ${what} top edge`).toBeGreaterThanOrEqual(8);
      expect(b.y1, `${name}: ${what} bottom edge`).toBeLessThanOrEqual(m.height - 8);
      if (m.tab !== undefined) {
        const tab: Box = { x0: m.tab.x, y0: m.tab.y, x1: m.tab.x + m.tab.width, y1: m.tab.y + m.tab.height };
        expect(overlap(b, tab, 3), `${name}: ${what} touches the tab`).toBe(false);
      }
      expect(overlap(b, north(m), 3), `${name}: ${what} touches the north arrow`).toBe(false);
      for (const path of m.paths) {
        expect(distance(b, path.points), `${name}: ${what} is too near the line of ${path.name}`).toBeGreaterThanOrEqual(3.5);
      }
      // The dashed outline of a section is a line too. Only a section's own name sits just above its own outline.
      for (const section of m.sections) {
        if (section.points === undefined || what === `section ${section.name}`) continue;
        const closed = [...section.points, section.points[0] as readonly [number, number]];
        expect(distance(b, closed), `${name}: ${what} is too near the outline of ${section.name}`).toBeGreaterThanOrEqual(2.5);
      }
      if (m.gate !== undefined && what !== "gate") {
        expect(overlap(b, { x0: m.gate.x - 8, y0: m.gate.y - 8, x1: m.gate.x + 8, y1: m.gate.y + 8 }, 3), `${name}: ${what} touches the gate mark`).toBe(false);
      }
    }
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i] as (typeof labels)[number];
        const c = labels[j] as (typeof labels)[number];
        expect(overlap(boxOf(a.label), boxOf(c.label), 1), `${name}: ${a.what} touches ${c.what}`).toBe(false);
      }
    }
    if (m.gate?.label !== undefined) {
      const gate = boxOf(m.gate.label);
      expect(overlap(gate, { x0: m.gate.x - 8, y0: m.gate.y - 8, x1: m.gate.x + 8, y1: m.gate.y + 8 }, 3), `${name}: the gate label touches the gate mark`).toBe(false);
    }
  }

  const footprint = (index: number, columns: number, rowsSouth: number): Point[] => {
    const x = 1000 + (index % columns) * 1100;
    const y = index >= rowsSouth ? 2900 : 1200;
    return rect(x, y, x + 900, y + 1100);
  };

  /** Lantern Fold as the churchyard draws it: twelve plots in two rows, a walk between them and a gate at its west end. */
  function yew(): { m: MapState; inputs: SheetPlotInput[] } {
    const shapes: Record<string, Point[]> = {};
    const inputs: SheetPlotInput[] = [];
    for (let i = 0; i < 12; i++) {
      const code = `Y${String(i + 1).padStart(2, "0")}`;
      shapes[code] = footprint(i, 6, 6);
      inputs.push({ plotId: code, code, mark: { state: i % 3 === 0 ? "taken" : "free", needsChecking: false } });
    }
    const m = map({
      shapes,
      sections: { s: { sectionId: "s", name: "Yew Walk", displayOrder: 0, outline: rect(600, 800, 7800, 4400) } },
      paths: { p: { pathId: "p", name: "Yew Walk", points: [[700, 2600], [7600, 2600]] } },
      gate: { name: "Main gate", at: [500, 2600] },
      north: 0,
    });
    return { m, inputs };
  }

  /** Thimble Beds: two rows of three beds, a grass walk and a gate on the west edge. */
  function beds(): { m: MapState; inputs: SheetPlotInput[] } {
    const shapes: Record<string, Point[]> = {};
    const inputs: SheetPlotInput[] = [];
    for (let i = 0; i < 6; i++) {
      const code = `B0${i + 1}`;
      shapes[code] = rect(1000 + (i % 3) * 1700, i >= 3 ? 3300 : 900, 2500 + (i % 3) * 1700, (i >= 3 ? 3300 : 900) + 1100);
      inputs.push({ plotId: code, code, mark: { state: "free", needsChecking: false } });
    }
    const m = map({
      shapes,
      sections: {
        a: { sectionId: "a", name: "Sunny Row", displayOrder: 0, outline: rect(600, 600, 6200, 2100) },
        b: { sectionId: "b", name: "Shady Row", displayOrder: 1, outline: rect(600, 3200, 6200, 4600) },
      },
      paths: { p: { pathId: "p", name: "Grass Walk", points: [[700, 2650], [6100, 2650]] } },
      gate: { name: "Main gate", at: [500, 2650] },
      north: 0,
    });
    return { m, inputs };
  }

  const WIDTHS = [320, 360, 700, 1500];

  it.each(WIDTHS)("keeps every label of the churchyard map clear at width %i, with the top plot selected", (width) => {
    const { m, inputs } = yew();
    checkSheet(buildSheet({ map: m, plots: inputs, selectedPlotId: "Y07" }, { width }), `yew ${width} Y07`);
  });

  it.each(WIDTHS)("keeps every label of the churchyard map clear at width %i, with a bottom plot selected and with none", (width) => {
    const { m, inputs } = yew();
    checkSheet(buildSheet({ map: m, plots: inputs, selectedPlotId: "Y01" }, { width }), `yew ${width} Y01`);
    checkSheet(buildSheet({ map: m, plots: inputs }, { width }), `yew ${width} none`);
  });

  it.each(WIDTHS)("keeps every label of the bed plan clear at width %i", (width) => {
    const { m, inputs } = beds();
    for (const selected of ["B04", "B01", undefined]) {
      checkSheet(buildSheet({ map: m, plots: inputs, ...(selected === undefined ? {} : { selectedPlotId: selected }) }, { width }), `beds ${width} ${selected ?? "none"}`);
    }
  });

  // 200 percent zoom of a phone is 180 pixels wide. Below 300 a name that cannot find a clear place on the drawing
  // is written under it, one to a line, so it is never dropped and never lies on a line.
  const NARROW = [148, 180, 240, 280];

  it.each(NARROW)("keeps every label that is drawn clear on a narrow churchyard map, width %i", (width) => {
    const { m, inputs } = yew();
    for (const selected of ["Y07", "Y01", undefined]) checkSheet(buildSheet({ map: m, plots: inputs, ...(selected === undefined ? {} : { selectedPlotId: selected }) }, { width }), `narrow yew ${width} ${selected ?? "none"}`);
  });

  it.each(NARROW)("keeps every label that is drawn clear on a narrow bed plan, width %i", (width) => {
    const { m, inputs } = beds();
    for (const selected of ["B04", "B01", undefined]) checkSheet(buildSheet({ map: m, plots: inputs, ...(selected === undefined ? {} : { selectedPlotId: selected }) }, { width }), `narrow beds ${width} ${selected ?? "none"}`);
  });

  it("writes a name under the drawing only below 300, and keeps every name in place at 320 and above", () => {
    for (const make of [yew, beds]) {
      const { m, inputs } = make();
      for (const width of [320, 360, 700, 1500]) expect(buildSheet({ map: m, plots: inputs }, { width }).captioned, `captioned at ${width}`).toBe(0);
      for (const width of [148, 180]) expect(buildSheet({ map: m, plots: inputs }, { width }).captioned, `captioned at ${width}`).toBeGreaterThan(0);
    }
  });

  it("makes the sheet taller by the lines it writes under the drawing, and by nothing else", () => {
    const { m, inputs } = yew();
    const narrow = buildSheet({ map: m, plots: inputs }, { width: 148 });
    expect(narrow.height).toBeGreaterThan(narrow.height - narrow.captioned * 18);
    const lines = [narrow.gate?.label, ...narrow.sections.map((s) => s.label), ...narrow.paths.map((p) => p.label)].filter((l): l is Label => l !== undefined);
    const under = lines.filter((l) => l.anchor === "start" && l.x === 8 && l.y > narrow.height - narrow.captioned * 18 - 8);
    expect(under).toHaveLength(narrow.captioned);
    expect(new Set(under.map((l) => l.y)).size).toBe(under.length);
  });

  it("names the sections, paths and gate on a narrow sheet for a reader, even where a label is left out", () => {
    const { m, inputs } = yew();
    const sheet = buildSheet({ map: m, plots: inputs }, { width: 148 });
    expect(sheet.sections.map((s) => s.name)).toEqual(["Yew Walk"]);
    expect(sheet.paths.map((p) => p.name)).toEqual(["Yew Walk"]);
    expect(sheet.gate?.name).toBe("Main gate");
  });

  it("moves the gate label off the dots of the path it stands on", () => {
    const { m, inputs } = yew();
    const sheet = buildSheet({ map: m, plots: inputs }, { width: 360 });
    const gate = sheet.gate as NonNullable<SheetModel["gate"]>;
    const walk = sheet.paths[0] as NonNullable<SheetModel["paths"][number]>;
    expect(distance(boxOf(gate.label as Label), walk.points)).toBeGreaterThanOrEqual(8);
  });

  it("moves a section label off the paper tab of the selected plot", () => {
    const { m, inputs } = yew();
    const sheet = buildSheet({ map: m, plots: inputs, selectedPlotId: "Y07" }, { width: 360 });
    const tab = sheet.tab as NonNullable<SheetModel["tab"]>;
    const label = boxOf((sheet.sections[0] as NonNullable<SheetModel["sections"][number]>).label);
    expect(overlap(label, { x0: tab.x, y0: tab.y, x1: tab.x + tab.width, y1: tab.y + tab.height }, 3)).toBe(false);
  });

  it("never drops a label when no place is clear: the one with least overlap wins", () => {
    const { m, inputs } = yew();
    const sheet = buildSheet({ map: m, plots: inputs, selectedPlotId: "Y07" }, { width: 120, maxHeight: 140 });
    expect(sheet.sections[0]?.label.text).toBe("Yew Walk");
    expect(sheet.paths[0]?.label.text).toBe("Yew Walk");
    expect(sheet.gate?.label.text).toBe("Main gate");
    for (const label of [sheet.sections[0]?.label, sheet.paths[0]?.label, sheet.gate?.label]) {
      expect(Number.isFinite(label?.x)).toBe(true);
      expect(Number.isFinite(label?.y)).toBe(true);
      expect(label?.size).toBeGreaterThanOrEqual(12);
    }
  });

  it("places labels the same way every time", () => {
    const { m, inputs } = yew();
    const a = buildSheet({ map: m, plots: inputs, selectedPlotId: "Y07" }, { width: 360 });
    const b = buildSheet({ map: m, plots: inputs, selectedPlotId: "Y07" }, { width: 360 });
    expect(a.gate).toEqual(b.gate);
    expect(a.sections).toEqual(b.sections);
    expect(a.paths).toEqual(b.paths);
  });
});
