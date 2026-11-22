// T28 (foundation part): the visitor types are separate from the private
// types, the visitor schemas are closed at every depth, and canaries are found.
// The full file and log scan is spec 06.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  flagPrivateStrings,
  parseAvailability,
  parseFamily,
  scanForCanaries,
  type AvailabilityFile,
  type FamilyFile,
} from "../../template/src/output/privacy";
import { createSite, mintId } from "../../template/src/site";
import type { Plot, Site } from "../../template/src/types";
import { scanSource } from "../../scripts/lib/imports.mjs";
import {
  APPROVED_NAME,
  CONTACT,
  INSCRIPTION_WORD,
  LIVING_HOLDERS,
  OTHER_OCCUPANT,
  PAGE_IMAGE_FILENAME,
  PERSON_KEYS,
  VISITOR_CANARIES,
} from "../helpers/privacyCanaries";
import { FIXED_NOW } from "../helpers/clock";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const square = (x: number, y: number, size = 100): [number, number][] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
];

/** Lantern Fold family file: only Mirel Quillmoss is approved (hand totals section 1). */
function family(): FamilyFile {
  return {
    format: "plot.family.v1",
    asOf: "2026-04-20",
    siteTitle: "Lantern Fold",
    north: 0,
    gate: { name: "Lantern Gate", x: 50, y: 0 },
    paths: [{ name: "Yew Walk", points: [[50, 0], [50, 900]] }],
    sections: [{ id: "s-9f2", label: "Yew Walk", outline: square(0, 100, 900) }],
    plots: [{ id: "p-a1", code: "Y07", sectionId: "s-9f2", outline: square(300, 400) }],
    burials: [
      {
        id: "b-77c",
        name: APPROVED_NAME,
        plotId: "p-a1",
        directions: "Enter at Lantern Gate. Follow Yew Walk to row Y. Look for Y07.",
      },
    ],
  };
}

/** Thimble Beds availability file: B03 and B05 free, no people (hand totals 2.1). */
function availability(): AvailabilityFile {
  return {
    format: "plot.availability.v1",
    asOf: "2026-04-20",
    siteTitle: "Thimble Beds",
    north: 0,
    gate: { name: "Main Gate", x: 0, y: 0 },
    paths: [{ name: "Centre Path", points: [[0, 0], [0, 500]] }],
    sections: [{ id: "s-1", label: "Lower Beds" }],
    freePlots: [
      { id: "f-3", code: "B03", sectionId: "s-1", outline: square(200, 0) },
      { id: "f-5", code: "B05", sectionId: "s-1" },
    ],
    neutralGround: [{ outline: square(0, 200) }],
    instructions: "Ask the secretary at the gate.",
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function withPath(root: unknown, path: (string | number)[], value: unknown): void {
  let node = root as Record<string | number, unknown>;
  for (const step of path.slice(0, -1)) node = node[step] as Record<string | number, unknown>;
  node[path[path.length - 1] as string | number] = value;
}

describe("T28 valid visitor files", () => {
  it("accepts the Lantern Fold family file", () => {
    const result = parseFamily(family());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.burials.map((b) => b.name)).toEqual([APPROVED_NAME]);
  });

  it("accepts a family file with no burials and no outlines", () => {
    const empty = { ...family(), burials: [], plots: [], sections: [{ id: "s", label: "Yew Walk" }] };
    expect(parseFamily(empty).ok).toBe(true);
  });

  it("accepts a burial with an approved year", () => {
    const withYear = family();
    withYear.burials[0] = { ...withYear.burials[0]!, year: 1874 };
    expect(parseFamily(withYear).ok).toBe(true);
  });

  it("accepts the Thimble Beds availability file with two plots and no person", () => {
    const result = parseAvailability(availability());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.freePlots.map((p) => p.code)).toEqual(["B03", "B05"]);
  });
});

describe("T28 closed schemas reject an unexpected key at every depth", () => {
  const FAMILY_SPOTS: (string | number)[][] = [
    ["extra"],
    ["gate", "extra"],
    ["paths", 0, "extra"],
    ["sections", 0, "extra"],
    ["plots", 0, "extra"],
    ["burials", 0, "extra"],
  ];
  const AVAILABILITY_SPOTS: (string | number)[][] = [
    ["extra"],
    ["gate", "extra"],
    ["paths", 0, "extra"],
    ["sections", 0, "extra"],
    ["freePlots", 0, "extra"],
    ["neutralGround", 0, "extra"],
  ];

  it.each(FAMILY_SPOTS)("family: %s", (...path) => {
    const bad = clone(family());
    withPath(bad, path, "x");
    const result = parseFamily(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
  });

  it.each(AVAILABILITY_SPOTS)("availability: %s", (...path) => {
    const bad = clone(availability());
    withPath(bad, path, "x");
    const result = parseAvailability(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.code === "unrecognized_keys")).toBe(true);
  });

  it("rejects a point with a third number", () => {
    const bad = clone(availability());
    withPath(bad, ["paths", 0, "points", 0], [0, 0, 5]);
    expect(parseAvailability(bad).ok).toBe(false);
  });

  it("rejects the issue path so a keeper can find the key", () => {
    const bad = clone(family());
    withPath(bad, ["burials", 0, "holder"], "Odalys Fennimore");
    const result = parseFamily(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((i) => i.path)).toContain("burials.0");
  });

  it("rejects a private site spread into a visitor file", () => {
    const site = createSite({
      id: mintId(),
      lineageId: mintId(),
      siteKey: mintId(),
      kind: "allotment",
      title: "Thimble Beds",
      zone: "Europe/London",
      createdAt: FIXED_NOW,
    });
    if (!site.ok) throw new Error("site");
    const leaked = { ...availability(), ...site.value };
    expect(parseAvailability(leaked).ok).toBe(false);
  });
});

describe("T28 an availability file has no person field of any kind", () => {
  const SPOTS: (string | number)[][] = [[], ["gate"], ["paths", 0], ["sections", 0], ["freePlots", 0], ["neutralGround", 0]];

  it.each(PERSON_KEYS)("rejects the key %s anywhere", (key) => {
    for (const spot of SPOTS) {
      // `name` is a real field of the gate and of a path (a public place name such as "Lantern Gate").
      // Writing it there replaces a valid field, so it is not an extra key.
      const isPlaceName = key === "name" && (spot[0] === "gate" || spot[0] === "paths");
      if (isPlaceName) continue;
      const bad = clone(availability());
      withPath(bad, [...spot, key], "value");
      expect(parseAvailability(bad).ok, `${key} at ${spot.join(".") || "top"}`).toBe(false);
    }
  });

  it("keeps the gate and path names as place names only", () => {
    const named = clone(availability());
    named.gate.name = "Lantern Gate";
    named.paths[0]!.name = "Yew Walk";
    expect(parseAvailability(named).ok).toBe(true);
  });

  it("rejects a family burial list inside an availability file", () => {
    const bad = { ...availability(), burials: family().burials };
    expect(parseAvailability(bad).ok).toBe(false);
  });

  it("does not accept a family file as an availability file or the reverse", () => {
    expect(parseAvailability(family()).ok).toBe(false);
    expect(parseFamily(availability()).ok).toBe(false);
  });
});

describe("T28 bad values", () => {
  type Case = [string, (file: FamilyFile) => void];
  const CASES: Case[] = [
    ["a wrong format", (f) => void ((f as { format: string }).format = "plot.family.v2")],
    ["an impossible date", (f) => void (f.asOf = "2026-02-30")],
    ["a date with a time", (f) => void (f.asOf = "2026-02-20T10:00:00Z")],
    ["an empty site title", (f) => void (f.siteTitle = "")],
    ["a site title over 100 characters", (f) => void (f.siteTitle = "t".repeat(101))],
    ["north not finite", (f) => void (f.north = Number.NaN)],
    ["north infinite", (f) => void (f.north = Number.POSITIVE_INFINITY)],
    ["a fractional gate coordinate", (f) => void (f.gate.x = 1.5)],
    ["a gate coordinate over 10000", (f) => void (f.gate.y = 10001)],
    ["a negative coordinate", (f) => void (f.paths[0]!.points[0] = [-1, 0])],
    ["a nonfinite coordinate", (f) => void (f.paths[0]!.points[0] = [Number.NaN, 0])],
    ["an empty ID", (f) => void (f.plots[0]!.id = "")],
    ["an ID with spaces", (f) => void (f.plots[0]!.id = "p 1")],
    ["a plot code over 24 characters", (f) => void (f.plots[0]!.code = "c".repeat(25))],
    ["an outline of two points", (f) => void (f.plots[0]!.outline = [[0, 0], [1, 1]])],
    ["a path of 257 points", (f) => void (f.paths[0]!.points = Array.from({ length: 257 }, (_, i) => [i, 0] as [number, number]))],
    ["a burial name over 100 characters", (f) => void (f.burials[0]!.name = "n".repeat(101))],
    ["an empty burial name", (f) => void (f.burials[0]!.name = "")],
    ["a burial year of 999", (f) => void (f.burials[0]!.year = 999)],
    ["a fractional burial year", (f) => void (f.burials[0]!.year = 1874.5)],
    ["directions over 4000 characters", (f) => void (f.burials[0]!.directions = "d".repeat(4001))],
  ];

  it.each(CASES)("rejects %s", (_name, mutate) => {
    const bad = clone(family());
    mutate(bad);
    expect(parseFamily(bad).ok).toBe(false);
  });

  it("accepts the limits themselves", () => {
    const edge = clone(family());
    edge.siteTitle = "t".repeat(100);
    edge.plots[0]!.code = "c".repeat(24);
    edge.gate = { name: "g", x: 0, y: 10000 };
    edge.paths[0]!.points = Array.from({ length: 256 }, (_, i) => [i, 0] as [number, number]);
    edge.burials[0]!.year = 9999;
    edge.burials[0]!.directions = "d".repeat(4000);
    expect(parseFamily(edge).ok).toBe(true);
  });

  it("refuses missing required keys", () => {
    for (const key of ["format", "asOf", "siteTitle", "north", "gate", "paths", "sections", "plots", "burials"]) {
      const bad = clone(family()) as unknown as Record<string, unknown>;
      delete bad[key];
      expect(parseFamily(bad).ok, key).toBe(false);
    }
  });

  it("refuses things that are not objects", () => {
    for (const value of [null, undefined, 5, "text", [], true]) {
      expect(parseFamily(value).ok).toBe(false);
      expect(parseAvailability(value).ok).toBe(false);
    }
  });

  it("refuses 2001 free plots and accepts 2000", () => {
    const many = (n: number) => ({
      ...availability(),
      freePlots: Array.from({ length: n }, (_, i) => ({ id: `f${i}`, code: `P${i}`, sectionId: "s-1" })),
    });
    expect(parseAvailability(many(2000)).ok).toBe(true);
    expect(parseAvailability(many(2001)).ok).toBe(false);
  });
});

describe("T28 the private and visitor types do not mix", () => {
  const site = { id: "x" } as unknown as Site;
  const plot = { plotId: "p" } as unknown as Plot;
  const avail = availability();

  it("fails the TypeScript check when one is assigned to the other", () => {
    // @ts-expect-error a private site is not an availability file
    const a: AvailabilityFile = site;
    // @ts-expect-error an availability file is not a private site
    const s: Site = avail;
    // @ts-expect-error a private plot is not a public plot row
    const row: AvailabilityFile["freePlots"][number] = plot;
    // @ts-expect-error a public plot row is not a private plot
    const p: Plot = avail.freePlots[0]!;
    // @ts-expect-error a private site is not a family file
    const f: FamilyFile = site;
    expect([a, s, row, p, f]).toHaveLength(5);
  });

  it("the visitor module imports no private type or module", () => {
    const text = readFileSync(join(ROOT, "template", "src", "output", "privacy.ts"), "utf8");
    const imports = scanSource(text).imports;
    expect(imports.length).toBeGreaterThan(0);
    const allowed = new Set(["zod", "../calendar", "../limits"]);
    for (const spec of imports) expect(allowed.has(spec), spec).toBe(true);
  });
});

describe("T28 canaries", () => {
  it("finds a canary in a value, a key, an array and a nested object", () => {
    const subject = {
      a: { b: [`see ${OTHER_OCCUPANT} here`] },
      [LIVING_HOLDERS[0]]: 1,
      c: [[{ d: CONTACT }]],
    };
    expect(scanForCanaries(subject, VISITOR_CANARIES)).toEqual([OTHER_OCCUPANT, LIVING_HOLDERS[0], CONTACT]);
  });

  it("ignores case and accents", () => {
    expect(scanForCanaries({ x: "TORIN PELLWICK" }, [OTHER_OCCUPANT])).toEqual([OTHER_OCCUPANT]);
    expect(scanForCanaries({ x: "Hóllowmere" }, [INSCRIPTION_WORD])).toEqual([INSCRIPTION_WORD]);
    expect(scanForCanaries({ x: "Mirel  Quillmoss" }, [APPROVED_NAME])).toEqual([APPROVED_NAME]);
  });

  it("reads text and bytes", () => {
    const text = `<html>${PAGE_IMAGE_FILENAME}</html>`;
    expect(scanForCanaries(text, VISITOR_CANARIES)).toEqual([PAGE_IMAGE_FILENAME]);
    expect(scanForCanaries(new TextEncoder().encode(text), VISITOR_CANARIES)).toEqual([PAGE_IMAGE_FILENAME]);
  });

  it("finds nothing in the clean visitor files", () => {
    expect(scanForCanaries(family(), VISITOR_CANARIES)).toEqual([]);
    expect(scanForCanaries(availability(), [...VISITOR_CANARIES, APPROVED_NAME])).toEqual([]);
  });

  it("finds the approved name in the family file, where it is allowed", () => {
    expect(scanForCanaries(family(), [APPROVED_NAME])).toEqual([APPROVED_NAME]);
  });

  it("reports each canary once, in the order given", () => {
    const subject = [CONTACT, CONTACT, OTHER_OCCUPANT];
    expect(scanForCanaries(subject, [OTHER_OCCUPANT, CONTACT])).toEqual([OTHER_OCCUPANT, CONTACT]);
  });

  it("never matches on an empty canary", () => {
    expect(scanForCanaries({ a: "anything" }, ["", "  "])).toEqual([]);
  });

  it("reads numbers, booleans and null without error", () => {
    expect(scanForCanaries({ a: 1, b: true, c: null, d: undefined }, VISITOR_CANARIES)).toEqual([]);
  });
});

describe("T28 private strings in a public label", () => {
  it("flags a known private full name or contact string", () => {
    expect(flagPrivateStrings("Odalys Fennimore's plot", [...LIVING_HOLDERS, CONTACT])).toEqual(["Odalys Fennimore"]);
    expect(flagPrivateStrings(`Write to ${CONTACT}`, [...LIVING_HOLDERS, CONTACT])).toEqual([CONTACT]);
    expect(flagPrivateStrings("ODALYS  FENNIMORE", [...LIVING_HOLDERS])).toEqual(["Odalys Fennimore"]);
  });

  it("flags nothing in a neutral label", () => {
    expect(flagPrivateStrings("Lantern Gate", [...LIVING_HOLDERS, CONTACT])).toEqual([]);
    expect(flagPrivateStrings("Yew Walk, row Y", [...LIVING_HOLDERS])).toEqual([]);
  });

  it("does not flag part of a name", () => {
    expect(flagPrivateStrings("Wren", [...LIVING_HOLDERS])).toEqual([]);
  });

  it("ignores an empty known string", () => {
    expect(flagPrivateStrings("anything", [""])).toEqual([]);
  });
});
