// INV_PUBLIC_CLOSED and INV_NO_LIVING_PUBLIC. 1,000 cases per set, recorded seeds.
//  A. A valid visitor file stays valid, and one extra key at any depth makes it invalid.
//  B. The market adapter's availability file never holds a holder's name, never
//     changes when only a holder's name changes, and lists exactly the free stalls.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emptyCoreState } from "../../template/src/events";
import {
  parseAvailability,
  parseFamily,
  scanForCanaries,
  type AvailabilityFile,
  type FamilyFile,
} from "../../template/src/output/privacy";
import { plotSummaryAt } from "../../template/src/status";
import type { CoreState } from "../../template/src/types";
import { marketAdapter, type MarketCommand } from "../helpers/marketAdapter";
import { runProperty } from "../helpers/property";
import { SITE_ID } from "../helpers/site";
import { RUNS, SEEDS } from "./seeds";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10);

const text = (max: number) => fc.stringMatching(/^[A-Za-z][A-Za-z ]{0,18}$/).map((s) => s.slice(0, max));
const id = fc.stringMatching(/^[A-Za-z0-9_-]{1,12}$/);
const coordinate = fc.integer({ min: 0, max: 10000 });
const point = fc.tuple(coordinate, coordinate);
const outline = fc.array(point, { minLength: 3, maxLength: 6 });
const gate = fc.record({ name: text(30), x: coordinate, y: coordinate });
const path = fc.record({ name: text(30), points: fc.array(point, { minLength: 2, maxLength: 6 }) });
const section = fc.record({ id, label: text(30) }, { requiredKeys: ["id", "label"] }).chain((base) =>
  fc.option(outline, { nil: undefined }).map((o) => (o === undefined ? base : { ...base, outline: o })),
);
const plotRow = fc.record({ id, code: text(12), sectionId: id }).chain((base) =>
  fc.option(outline, { nil: undefined }).map((o) => (o === undefined ? base : { ...base, outline: o })),
);
const asOf = fc.integer({ min: 0, max: 400 }).map(day);

const availabilityArb: fc.Arbitrary<AvailabilityFile> = fc.record({
  format: fc.constant("plot.availability.v1" as const),
  asOf,
  siteTitle: text(30),
  north: fc.integer({ min: 0, max: 359 }),
  gate,
  paths: fc.array(path, { maxLength: 3 }),
  sections: fc.array(section, { maxLength: 3 }),
  freePlots: fc.array(plotRow, { maxLength: 6 }),
  neutralGround: fc.array(fc.record({ outline }), { maxLength: 3 }),
  instructions: text(60),
});

const familyArb: fc.Arbitrary<FamilyFile> = fc.record({
  format: fc.constant("plot.family.v1" as const),
  asOf,
  siteTitle: text(30),
  north: fc.integer({ min: 0, max: 359 }),
  gate,
  paths: fc.array(path, { maxLength: 3 }),
  sections: fc.array(section, { maxLength: 3 }),
  plots: fc.array(plotRow, { maxLength: 6 }),
  burials: fc.array(
    fc.record({ id, name: text(40), plotId: id }).chain((base) =>
      fc.option(fc.integer({ min: 1000, max: 9999 }), { nil: undefined }).map((y) => (y === undefined ? base : { ...base, year: y })),
    ),
    { maxLength: 6 },
  ),
});

/** Paths to every plain object inside a value, the root included. */
function objectPaths(value: unknown, at: (string | number)[] = []): (string | number)[][] {
  if (Array.isArray(value)) return value.flatMap((item, i) => objectPaths(item, [...at, i]));
  if (value !== null && typeof value === "object") {
    return [at, ...Object.entries(value).flatMap(([k, v]) => objectPaths(v, [...at, k]))];
  }
  return [];
}

function nodeAt(root: unknown, at: (string | number)[]): Record<string, unknown> {
  let node = root as Record<string | number, unknown>;
  for (const step of at) node = node[step] as Record<string | number, unknown>;
  return node as Record<string, unknown>;
}

const keyArb = fc.stringMatching(/^[a-z]{1,10}$/);

function withExtraKey<T>(file: T, pick: number, key: string): T {
  const copy = JSON.parse(JSON.stringify(file)) as T;
  const spots = objectPaths(copy);
  const node = nodeAt(copy, spots[pick % spots.length] as (string | number)[]);
  let name = key;
  while (name in node) name += "_x";
  node[name] = "extra";
  return copy;
}

describe("A. a closed schema rejects one extra key at any depth", () => {
  const seen = { nodes: 0, depths: new Set<number>() };

  it(`availability, ${RUNS} cases (seed ${SEEDS.INV_PUBLIC_CLOSED})`, () => {
    const outcome = runProperty(
      "INV_PUBLIC_CLOSED",
      fc.tuple(availabilityArb, fc.nat(), keyArb),
      ([file, pick, key]) => {
        expect(parseAvailability(file).ok, "a generated file should be valid").toBe(true);
        const spots = objectPaths(file);
        seen.nodes += spots.length;
        for (const s of spots) seen.depths.add(s.length);
        const bad = withExtraKey(file, pick, key);
        const result = parseAvailability(bad);
        if (result.ok) throw new Error(`INV_PUBLIC_CLOSED: an extra key was accepted: ${JSON.stringify(bad)}`);
        expect(result.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
      },
      { seed: SEEDS.INV_PUBLIC_CLOSED },
    );
    expect(outcome.cases).toBeGreaterThanOrEqual(RUNS);
  });

  it(`family, ${RUNS} cases`, () => {
    runProperty(
      "INV_PUBLIC_CLOSED",
      fc.tuple(familyArb, fc.nat(), keyArb),
      ([file, pick, key]) => {
        expect(parseFamily(file).ok, "a generated file should be valid").toBe(true);
        for (const s of objectPaths(file)) seen.depths.add(s.length);
        const result = parseFamily(withExtraKey(file, pick, key));
        if (result.ok) throw new Error("INV_PUBLIC_CLOSED: an extra key was accepted");
      },
      { seed: SEEDS.INV_PUBLIC_CLOSED + 1000 },
    );
  });

  it("really reached objects at several depths", () => {
    expect(seen.nodes).toBeGreaterThan(5000);
    // Objects sit at depth 0 (the file), 1 (gate), and 2 (a row in a list). Points are arrays, not objects.
    expect([...seen.depths].sort()).toEqual([0, 1, 2]);
  });
});

// ---------- B. projection from the market adapter ----------

const HOLDERS = [
  "Odalys Fennimore",
  "Wren Ashgrove",
  "Pim Cartwhistle",
  "Saffi Underhay",
  "Lorcan Dewbright",
  "Maud Treacleton",
];
const STALLS = ["S1", "S2", "S3", "S4", "S5"];
const stall = (code: string) => `sp-${code}`;

type Step =
  | { kind: "add"; code: string }
  | { kind: "confirm"; code: string }
  | { kind: "reserve"; code: string; claim: number; holder: number; start: string }
  | { kind: "burial"; code: string; claim: number }
  | { kind: "unusable"; code: string; claim: number }
  | { kind: "end"; claim: number };

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("add" as const), code: fc.constantFrom(...STALLS) }) },
  { weight: 4, arbitrary: fc.record({ kind: fc.constant("confirm" as const), code: fc.constantFrom(...STALLS) }) },
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant("reserve" as const),
      code: fc.constantFrom(...STALLS),
      claim: fc.integer({ min: 0, max: 9 }),
      holder: fc.integer({ min: 0, max: HOLDERS.length - 1 }),
      start: fc.constantFrom("2026-01-01", "2026-03-01", "2026-05-01"),
    }),
  },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("burial" as const), code: fc.constantFrom(...STALLS), claim: fc.integer({ min: 0, max: 9 }) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("unusable" as const), code: fc.constantFrom(...STALLS), claim: fc.integer({ min: 0, max: 9 }) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("end" as const), claim: fc.integer({ min: 0, max: 9 }) }) },
);

const marketCaseArb = fc.record({
  steps: fc.array(stepArb, { minLength: 6, maxLength: 30 }),
  asOf: fc.constantFrom("2026-02-01", "2026-04-01", "2026-06-01"),
  swap: fc.integer({ min: 1, max: HOLDERS.length - 1 }),
});

function toCommand(step: Step, holderShift: number): MarketCommand {
  switch (step.kind) {
    case "add":
      return { type: "add_plot", plotId: stall(step.code), code: step.code, spaces: [{ spaceId: `sp-space-${step.code}` }] };
    case "confirm":
      return { type: "confirm_empty", spaceIds: [`sp-space-${step.code}`] };
    case "reserve":
      return {
        type: "reserve_stall",
        claimId: `c${step.claim}`,
        spaceId: `sp-space-${step.code}`,
        trader: HOLDERS[(step.holder + holderShift) % HOLDERS.length] as string,
        start: step.start,
      };
    case "burial":
      return { type: "add_claim", claimId: `c${step.claim}`, spaceId: `sp-space-${step.code}`, mode: "taken", endable: false };
    case "unusable":
      return { type: "add_claim", claimId: `c${step.claim}`, spaceId: `sp-space-${step.code}`, mode: "unusable", endable: true, reason: "Water pipe" };
    case "end":
      return { type: "end_claim", claimId: `c${step.claim}`, reason: "Trader left" };
  }
}

// Five stalls exist before the random steps, and four are confirmed empty, so most steps can act.
const OPENING: Step[] = [...STALLS.map((code) => ({ kind: "add" as const, code })), ...STALLS.slice(0, 4).map((code) => ({ kind: "confirm" as const, code }))];

function build(steps: Step[], holderShift: number): CoreState {
  let state = emptyCoreState(SITE_ID);
  for (const step of [...OPENING, ...steps]) {
    const result = marketAdapter.decide(state, toCommand(step, holderShift), "2026-04-20");
    if (result.ok) for (const draft of result.value) state = marketAdapter.apply(state, draft.event);
  }
  return state;
}

type Projection = (state: CoreState, asOf: string) => unknown;
const realProjection: Projection = (state, asOf) => marketAdapter.project(state, "visitor", asOf);

/** The file with its random public IDs replaced, so two builds can be compared. */
function withoutIds(file: AvailabilityFile): unknown {
  return { ...file, freePlots: file.freePlots.map((p) => ({ ...p, id: "id" })) };
}

const seenB = { files: 0, free: 0, held: 0, holdersInState: 0 };

function checkProjection(project: Projection, c: { steps: Step[]; asOf: string; swap: number }): void {
  const state = build(c.steps, 0);
  const projected = project(state, c.asOf);

  const parsed = parseAvailability(projected);
  if (!parsed.ok) throw new Error(`INV_PUBLIC_CLOSED: the visitor file is not closed: ${JSON.stringify(parsed.issues)}`);

  // INV_NO_LIVING_PUBLIC: no holder name in any key or value, whoever holds a stall.
  const holdersInState = Object.values(state.claims).map((claim) => claim.ref ?? "");
  const leaked = scanForCanaries(projected, HOLDERS);
  if (leaked.length > 0) throw new Error(`INV_NO_LIVING_PUBLIC: ${leaked.join(", ")}`);

  // The file lists exactly the stalls whose every space is checked and free, worked from the status code.
  const expected = Object.values(state.plots)
    .filter((plot) => {
      const summary = plotSummaryAt(state, plot.plotId, c.asOf)!;
      return summary.spaceCount > 0 && !summary.needsChecking && summary.counts.free === summary.spaceCount;
    })
    .map((p) => p.code)
    .sort();
  expect(parsed.value.freePlots.map((p) => p.code).sort()).toEqual(expected);

  // A private-only edit (other holder names) leaves the file the same, apart from its random IDs.
  const other = build(c.steps, c.swap);
  const otherParsed = parseAvailability(project(other, c.asOf));
  if (!otherParsed.ok) throw new Error(`INV_PUBLIC_CLOSED: the second visitor file is not closed: ${JSON.stringify(otherParsed.issues)}`);
  expect(withoutIds(otherParsed.value)).toEqual(withoutIds(parsed.value));

  seenB.files += 1;
  seenB.free += expected.length;
  seenB.held += Object.values(state.claims).filter((cl) => cl.mode === "held").length;
  seenB.holdersInState += holdersInState.filter((h) => HOLDERS.includes(h)).length;
}

describe("B. the market adapter's availability file", () => {
  it(`holds no holder, is closed, lists the free stalls and ignores private edits (${RUNS} cases, seed ${SEEDS.INV_NO_LIVING_PUBLIC})`, () => {
    const outcome = runProperty("INV_NO_LIVING_PUBLIC", marketCaseArb, (c) => checkProjection(realProjection, c), {
      seed: SEEDS.INV_NO_LIVING_PUBLIC,
    });
    expect(outcome.cases).toBeGreaterThanOrEqual(RUNS);
  });

  it("really met free stalls, held stalls and holders", () => {
    const note = JSON.stringify(seenB);
    expect(seenB.files, note).toBeGreaterThanOrEqual(RUNS);
    expect(seenB.free, note).toBeGreaterThan(1000);
    expect(seenB.held, note).toBeGreaterThan(1000);
    expect(seenB.holdersInState, note).toBeGreaterThan(1000);
  });
});

describe("the properties catch a deliberate defect", () => {
  const run = (project: Projection) =>
    runProperty("mutant", marketCaseArb, (c) => checkProjection(project, c), { seed: SEEDS.INV_NO_LIVING_PUBLIC });

  it("a file that adds a holders list is caught", () => {
    const leaky: Projection = (state, asOf) => ({
      ...(realProjection(state, asOf) as object),
      holders: Object.values(state.claims).map((c) => c.ref),
    });
    expect(() => run(leaky)).toThrow(/Property failed/);
  });

  it("a file that copies a holder into an instruction is caught", () => {
    const leaky: Projection = (state, asOf) => {
      const file = realProjection(state, asOf) as AvailabilityFile;
      const first = Object.values(state.claims).find((c) => c.ref !== undefined);
      return first === undefined ? file : { ...file, instructions: `Ask ${first.ref}` };
    };
    expect(() => run(leaky)).toThrow(/Property failed/);
  });

  it("a file that lists a reserved stall as free is caught", () => {
    const wrong: Projection = (state, asOf) => {
      const file = realProjection(state, asOf) as AvailabilityFile;
      const held = Object.values(state.claims).find((c) => c.mode === "held");
      const plot = held === undefined ? undefined : Object.values(state.plots).find((p) => p.spaces.some((s) => s.spaceId === held.spaceId));
      return plot === undefined || file.freePlots.some((p) => p.code === plot.code)
        ? file
        : { ...file, freePlots: [...file.freePlots, { id: "x", code: plot.code, sectionId: "row-a" }] };
    };
    expect(() => run(wrong)).toThrow(/Property failed/);
  });

  it("a file that depends on the holder name is caught", () => {
    const dependent: Projection = (state, asOf) => {
      const file = realProjection(state, asOf) as AvailabilityFile;
      const holders = Object.values(state.claims).filter((c) => c.ref !== undefined).map((c) => c.ref as string);
      return { ...file, siteTitle: holders.length > 0 && holders.join("").length % 2 === 0 ? "Stall Row" : "Stall Rows" };
    };
    expect(() => run(dependent)).toThrow(/Property failed/);
  });
});
