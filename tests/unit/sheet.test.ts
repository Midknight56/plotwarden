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
import type { SheetPlotInput } from "../../template/src/map/sheet";

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
    const section = buildSheet({ map: m(), plots: plots2() }, { width: 400 }).sections[0];
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
