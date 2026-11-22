// T04 (point and coordinate parity). Requirements P1.
// Expected values are worked by hand from the design: north is flipped once,
// site (0, 0) is the bottom left corner.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKDROP,
  backdropMatrix,
  backdropToSite,
  boundsOf,
  checkBackdropTransform,
  checkPoint,
  fromScreen,
  isPoint,
  rotatePoint,
  toScreen,
} from "../../template/src/map/coordinates";
import type { View } from "../../template/src/map/coordinates";

const FULL: View = { minEast: 0, minNorth: 0, scale: 0.1, height: 1000 };

describe("points", () => {
  it("accepts integers from 0 to 10,000 at both ends", () => {
    expect(checkPoint([0, 0]).ok).toBe(true);
    expect(checkPoint([10000, 10000]).ok).toBe(true);
    expect(isPoint([5, 6])).toBe(true);
  });

  it.each([
    [[10001, 0]],
    [[0, 10001]],
    [[-1, 0]],
    [[1.5, 2]],
    [[Number.NaN, 2]],
    [[Number.POSITIVE_INFINITY, 2]],
  ] as [[number, number]][])("refuses %j", (point) => {
    expect(checkPoint(point).ok).toBe(false);
    expect(isPoint(point)).toBe(false);
  });

  it("refuses a value that is not a pair of numbers", () => {
    expect(isPoint([1])).toBe(false);
    expect(isPoint([1, 2, 3])).toBe(false);
    expect(isPoint(["1", "2"])).toBe(false);
    expect(isPoint(null)).toBe(false);
  });
});

describe("site to screen", () => {
  it("draws site (0, 0) at the bottom left and (10000, 10000) at the top right", () => {
    expect(toScreen([0, 0], FULL)).toEqual([0, 1000]);
    expect(toScreen([10000, 10000], FULL)).toEqual([1000, 0]);
    expect(toScreen([10000, 0], FULL)).toEqual([1000, 1000]);
    expect(toScreen([0, 10000], FULL)).toEqual([0, 0]);
  });

  it("flips north once for a point inside", () => {
    expect(toScreen([5000, 2500], FULL)).toEqual([500, 750]);
  });

  it("respects the view origin", () => {
    const view: View = { minEast: 2000, minNorth: 3000, scale: 0.5, height: 400 };
    expect(toScreen([2000, 3000], view)).toEqual([0, 400]);
    expect(toScreen([2100, 3200], view)).toEqual([50, 300]);
  });

  it("turns a screen point back into the same site point", () => {
    for (const p of [[0, 0], [10000, 10000], [1234, 5678], [9999, 1]] as [number, number][]) {
      const back = fromScreen(toScreen(p, FULL), FULL);
      expect(back).toEqual({ ok: true, value: p });
    }
  });

  it("rounds a screen point to the nearest site point", () => {
    expect(fromScreen([500.04, 749.96], FULL)).toEqual({ ok: true, value: [5000, 2500] });
    expect(fromScreen([0.04, 999.96], FULL)).toEqual({ ok: true, value: [0, 0] });
  });

  it("refuses a screen point outside the site and clamps nothing", () => {
    const left = fromScreen([-10, 1000], FULL);
    expect(left.ok).toBe(false);
    const above = fromScreen([0, -10], FULL);
    expect(above.ok).toBe(false);
    if (!above.ok) expect(above.error.code).toBe("over_limit");
  });
});

describe("rotation", () => {
  it("turns quarter turns exactly", () => {
    expect(rotatePoint([10, 0], [0, 0], 90)).toEqual([0, 10]);
    expect(rotatePoint([10, 0], [0, 0], 180)).toEqual([-10, 0]);
    expect(rotatePoint([10, 0], [0, 0], 270)).toEqual([0, -10]);
    expect(rotatePoint([10, 0], [0, 0], 360)).toEqual([10, 0]);
  });

  it("rotates about the origin given", () => {
    expect(rotatePoint([10, 5], [5, 5], 90)).toEqual([5, 10]);
  });

  it("rounds to integers", () => {
    expect(rotatePoint([100, 0], [0, 0], 45)).toEqual([71, 71]);
  });

  it("never returns negative zero", () => {
    const out = rotatePoint([0, 10], [0, 0], 90);
    expect(Object.is(out[1], -0)).toBe(false);
    expect(out).toEqual([-10, 0]);
    expect(Object.is(rotatePoint([10, 0], [0, 0], 90)[0], -0)).toBe(false);
  });

  it("gives the same answer for the same input", () => {
    expect(rotatePoint([123, 456], [7, 8], 37)).toEqual(rotatePoint([123, 456], [7, 8], 37));
  });
});

describe("bounds", () => {
  it("is undefined for no points", () => {
    expect(boundsOf([])).toBeUndefined();
  });
  it("holds every point", () => {
    expect(boundsOf([[5, 9], [2, 3], [8, 1]])).toEqual({ minEast: 2, minNorth: 1, maxEast: 8, maxNorth: 9 });
  });
});

describe("backdrop transform", () => {
  it("resets to scale 100, offsets 0, turn 0 and opacity 50", () => {
    expect(DEFAULT_BACKDROP).toEqual({ scale: 100, east: 0, north: 0, turn: 0, opacity: 50 });
  });

  it("accepts the limits and refuses one beyond", () => {
    const ok = (patch: Partial<typeof DEFAULT_BACKDROP>) => checkBackdropTransform({ ...DEFAULT_BACKDROP, ...patch }).ok;
    expect(ok({ scale: 1 })).toBe(true);
    expect(ok({ scale: 1000 })).toBe(true);
    expect(ok({ scale: 0 })).toBe(false);
    expect(ok({ scale: 1001 })).toBe(false);
    expect(ok({ east: -10000 })).toBe(true);
    expect(ok({ east: 10001 })).toBe(false);
    expect(ok({ north: -10001 })).toBe(false);
    expect(ok({ turn: 359 })).toBe(true);
    expect(ok({ turn: 360 })).toBe(false);
    expect(ok({ turn: -1 })).toBe(false);
    expect(ok({ opacity: 0 })).toBe(true);
    expect(ok({ opacity: 100 })).toBe(true);
    expect(ok({ opacity: 101 })).toBe(false);
    expect(ok({ east: 1.5 })).toBe(false);
    expect(ok({ scale: Number.NaN })).toBe(false);
  });

  it("maps an image point by scale, then turn, then offset", () => {
    expect(backdropToSite(DEFAULT_BACKDROP, [10, 20])).toEqual([10, 20]);
    expect(backdropToSite({ ...DEFAULT_BACKDROP, scale: 200 }, [10, 20])).toEqual([20, 40]);
    expect(backdropToSite({ ...DEFAULT_BACKDROP, turn: 90 }, [10, 0])).toEqual([0, 10]);
    expect(backdropToSite({ ...DEFAULT_BACKDROP, east: 5, north: 7 }, [0, 0])).toEqual([5, 7]);
    expect(backdropToSite({ scale: 50, east: 100, north: 200, turn: 90, opacity: 50 }, [40, 0])).toEqual([100, 220]);
  });

  it("builds the SVG matrix from the same numbers", () => {
    const view: View = { minEast: 0, minNorth: 0, scale: 0.1, height: 1000 };
    const m = backdropMatrix(DEFAULT_BACKDROP, 100, view);
    const expected = [0.1, 0, 0, 0.1, 0, 990];
    m.forEach((value, i) => expect(value).toBeCloseTo(expected[i] as number, 9));
  });
});
