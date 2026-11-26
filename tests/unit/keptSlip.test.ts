// The opened return slip stays for one visit to its own register (spec 05, X14). Pure rules, no browser.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSlipKeeper } from "../../template/src/ui/keptSlip";
import type { KeptSlip } from "../../template/src/ui/keptSlip";

const CHURCH = "5c0e0000-0000-4000-8000-000000000001";
const OTHER_CHURCH = "5c0e0000-0000-4000-8000-000000000002";
const GARDEN = "6a0d0000-0000-4000-8000-000000000001";

const slip = (n: number): KeptSlip => ({ bytes: new Uint8Array([n, n + 1, n + 2]), opId: `0a000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}` });

describe("the slip kept for a visit (X14.1, X14.2)", () => {
  it("holds nothing at the start, for any register", () => {
    const keeper = createSlipKeeper();
    expect(keeper.recall(CHURCH)).toBeUndefined();
    expect(keeper.recall(GARDEN)).toBeUndefined();
  });

  it("gives back the same bytes and the same operation ID for the register it was kept for, as often as asked", () => {
    const keeper = createSlipKeeper();
    const mine = slip(1);
    keeper.keep(CHURCH, mine);
    expect(keeper.recall(CHURCH)).toEqual(mine);
    expect(keeper.recall(CHURCH)).toEqual(mine);
    expect(keeper.recall(CHURCH)?.opId).toBe(mine.opId);
  });

  it("gives nothing for another register of the same app, or for the other app", () => {
    const keeper = createSlipKeeper();
    keeper.keep(CHURCH, slip(1));
    expect(keeper.recall(OTHER_CHURCH)).toBeUndefined();
    expect(keeper.recall(GARDEN)).toBeUndefined();
  });

  it("does not bring the slip back for the first register once another register has taken the place", () => {
    const keeper = createSlipKeeper();
    keeper.keep(CHURCH, slip(1));
    const theirs = slip(9);
    keeper.keep(GARDEN, theirs);
    expect(keeper.recall(CHURCH)).toBeUndefined();
    expect(keeper.recall(GARDEN)).toEqual(theirs);
  });

  it("replaces the slip when the keeper chooses another file (X14.5)", () => {
    const keeper = createSlipKeeper();
    keeper.keep(CHURCH, slip(1));
    const next = slip(5);
    keeper.keep(CHURCH, next);
    expect(keeper.recall(CHURCH)).toEqual(next);
  });

  it("lets go of the slip on clear, for every register", () => {
    const keeper = createSlipKeeper();
    keeper.keep(CHURCH, slip(1));
    keeper.clear();
    expect(keeper.recall(CHURCH)).toBeUndefined();
    keeper.keep(GARDEN, slip(2));
    keeper.clear();
    expect(keeper.recall(GARDEN)).toBeUndefined();
  });

  it("holds nothing in common between two keepers, so a new visit starts empty", () => {
    const first = createSlipKeeper();
    first.keep(CHURCH, slip(1));
    expect(createSlipKeeper().recall(CHURCH)).toBeUndefined();
  });
});

describe("the slip stays in memory only (X14.3)", () => {
  const source = readFileSync("template/src/ui/keptSlip.ts", "utf8");

  it("names no store: no database, no local or session storage, no cache, no file or download", () => {
    for (const word of ["indexedDB", "IDBDatabase", "localStorage", "sessionStorage", "caches", "document.cookie", "downloadText", "Blob", "navigator.clipboard", "fetch("]) {
      expect(source, word).not.toContain(word);
    }
  });

  it("imports no React and nothing outside the shared types", () => {
    const imports = [...source.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports).toEqual(["../types"]);
  });
});
