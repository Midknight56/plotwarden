// T28 (foundation part): the visitor types are separate from the private
// types, the visitor schemas are closed at every depth, and canaries are found.
// The full file and log scan is spec 06.
import { IDBFactory } from "fake-indexeddb";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allotAdapter, allotRegister } from "../../apps/allotment-register/src/adapter";
import { buildAvailabilityFile } from "../../apps/allotment-register/src/projection";
import { thimbleBeds } from "../../apps/allotment-register/src/walkthrough";
import { churchAdapter, churchRegister } from "../../apps/churchyard-register/src/adapter";
import { buildFamilyFile } from "../../apps/churchyard-register/src/projection";
import { lanternFold } from "../../apps/churchyard-register/src/walkthrough";
import { backupFilename, exportBackup } from "../../template/src/data/backup";
import { openRegisterDb } from "../../template/src/data/db";
import { seedWalkthrough } from "../../template/src/data/seed";
import { readEvents } from "../../template/src/data/transaction";
import { buildSlip, encodeSlip, slipFileName } from "../../template/src/exchange/slip";
import { reviewFileName } from "../../template/src/exchange/packet";
import { availabilityFileName, buildAvailabilityHtml } from "../../template/src/output/availabilityHtml";
import { buildAvailabilityPrint, buildFamilyPrint } from "../../template/src/output/print";
import { buildFamilyHtml, visitorFileName } from "../../template/src/output/visitorHtml";
import { DEFAULT_SETTINGS, SETTINGS_KEY, saveSettings } from "../../template/src/preferences";
import { planExchange } from "../../template/src/ui/exchangeFlow";
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
  REVIEW_CANARIES as CHURCH_REVIEW_CANARIES,
  VISITOR_CANARIES,
} from "../helpers/privacyCanaries";
import { FIXED_NOW } from "../helpers/clock";
import { AVAILABILITY_WORDS } from "../helpers/availabilityWords";
import { FAMILY_WORDS } from "../helpers/familyWords";
import { AVAILABILITY_CANARIES, REVIEW_CANARIES as GARDEN_REVIEW_CANARIES } from "../helpers/gardenCanaries";

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

// ===================================================================================================
// Spec 06, task 6.5 (Z1): the full file and log scan. Every public file of both fixtures is built by the
// real code from a practice register in a fake database, then read for every canary, in its bytes, its
// head, its address strings and its file name. The local database, the device key and the console are
// read too, and the source is scanned for any way out of the device.
// ===================================================================================================

const SCAN_ON = "2026-04-20";
const A4_PORTRAIT = { paper: "A4", orientation: "portrait" } as const;

function counterOf(start: number): () => string {
  let n = 0;
  return () => `00000000-0000-4000-8000-${(start * 0x1000 + ++n).toString(16).padStart(12, "0")}`;
}

/** A practice register of each app, in one fake database, with every public and committee file built from it. */
async function builtFiles() {
  const opened = await openRegisterDb(new IDBFactory());
  if (!opened.ok) throw new Error("storage");
  const db = opened.value;
  const newId = counterOf(0x91);
  const fold = await seedWalkthrough(db, churchRegister() as never, lanternFold, { newId });
  const beds = await seedWalkthrough(db, allotRegister() as never, thimbleBeds, { newId });
  if (!fold.ok || !beds.ok) throw new Error("seed");
  const foldState = churchRegister().replay(fold.value, await readEvents(db, fold.value.id));
  const bedsState = allotRegister().replay(beds.value, await readEvents(db, beds.value.id));
  if (!foldState.ok || !bedsState.ok) throw new Error("replay");

  let p = 0;
  const publicId = () => `p${++p}`;
  const family = buildFamilyFile(foldState.value, { asOf: SCAN_ON, revision: 3, newPublicId: publicId });
  const availability = buildAvailabilityFile(bedsState.value, { asOf: SCAN_ON, revision: 6, newPublicId: publicId });
  if (!family.ok || !availability.ok) throw new Error("build");

  const mint = counterOf(0x92);
  const plans = {
    church: planExchange({ site: fold.value, state: foldState.value, revision: 3, adapter: churchAdapter as never, asOf: SCAN_ON, alias: "Site 1", labels: {}, mint }),
    garden: planExchange({ site: beds.value, state: bedsState.value, revision: 6, adapter: allotAdapter as never, asOf: SCAN_ON, alias: "Site 2", labels: {}, mint }),
  };
  if (!plans.church.ok || !plans.garden.ok) throw new Error("plan");
  const slipText = (plan: typeof plans.church, site: typeof fold.value): string => {
    if (!plan.ok) throw new Error("plan");
    const built = buildSlip({
      siteKey: site.siteKey,
      lineageId: site.lineageId,
      packetRevision: plan.plan.packetRevision,
      packetAsOf: SCAN_ON,
      decisions: plan.plan.issues.map((issue, i) => ({ actionId: `00000000-0000-4000-8000-${(0x99000 + i).toString(16).padStart(12, "0")}`, issueKey: issue.issueKey, factVersion: issue.factVersion, disposition: "checked" as const, reviewedOn: SCAN_ON })),
    });
    if (!built.ok) throw new Error("slip");
    const encoded = encodeSlip(built.slip);
    if (!encoded.ok) throw new Error("slip size");
    return encoded.text;
  };
  const backups = {
    church: await exportBackup(db, fold.value.id, "2026-04-20T09:30:00.000+00:00"),
    garden: await exportBackup(db, beds.value.id, "2026-04-20T09:30:00.000+00:00"),
  };
  if (!backups.church.ok || !backups.garden.ok) throw new Error("backup");

  return {
    db,
    sites: { church: fold.value, garden: beds.value },
    familyFile: family.file,
    availabilityFile: availability.file,
    familyHtml: buildFamilyHtml(family.file, FAMILY_WORDS),
    familyPrint: buildFamilyPrint(family.file, FAMILY_WORDS, A4_PORTRAIT),
    availabilityHtml: buildAvailabilityHtml(availability.file, AVAILABILITY_WORDS),
    availabilityPrint: buildAvailabilityPrint(availability.file, AVAILABILITY_WORDS, A4_PORTRAIT),
    packets: { church: plans.church.plan.text, garden: plans.garden.plan.text },
    slips: { church: slipText(plans.church, fold.value), garden: slipText(plans.garden, beds.value) },
    backupBytes: { church: backups.church.value.bytes, garden: backups.garden.value.bytes },
  };
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("T28 every public and committee file, in its bytes, holds no canary", () => {
  it("the family file, its page and its print hold no living person, no other occupant, no contact, no inscription word, no page image", async () => {
    const f = await builtFiles();
    for (const [name, text] of [
      ["file", JSON.stringify(f.familyFile)],
      ["page", f.familyHtml],
      ["print", f.familyPrint],
    ] as const) {
      expect(scanForCanaries(text, VISITOR_CANARIES), `family ${name} text`).toEqual([]);
      expect(scanForCanaries(utf8(text), VISITOR_CANARIES), `family ${name} bytes`).toEqual([]);
    }
    // The one approved name is where it should be, and is in no other file.
    expect(scanForCanaries(f.familyHtml, [APPROVED_NAME])).toEqual([APPROVED_NAME]);
    expect(scanForCanaries(f.familyPrint, [APPROVED_NAME])).toEqual([APPROVED_NAME]);
  });

  it("the availability file, its page and its print hold no applicant, tenant, contact, receipt or amount", async () => {
    const f = await builtFiles();
    for (const [name, text] of [
      ["file", JSON.stringify(f.availabilityFile)],
      ["page", f.availabilityHtml],
      ["print", f.availabilityPrint],
    ] as const) {
      expect(scanForCanaries(text, AVAILABILITY_CANARIES), `availability ${name} text`).toEqual([]);
      expect(scanForCanaries(utf8(text), AVAILABILITY_CANARIES), `availability ${name} bytes`).toEqual([]);
    }
  });

  it("the review files and the return slips of both fixtures hold no name, contact, amount, note or approved name", async () => {
    const f = await builtFiles();
    for (const [name, text, canaries] of [
      ["church packet", f.packets.church, CHURCH_REVIEW_CANARIES],
      ["church slip", f.slips.church, CHURCH_REVIEW_CANARIES],
      ["garden packet", f.packets.garden, GARDEN_REVIEW_CANARIES],
      ["garden slip", f.slips.garden, GARDEN_REVIEW_CANARIES],
    ] as const) {
      expect(scanForCanaries(text, canaries), name).toEqual([]);
      expect(scanForCanaries(utf8(text), canaries), `${name} bytes`).toEqual([]);
    }
    // Neither fixture's private site title nor a plot code is in a packet.
    expect(f.packets.church).not.toContain("Lantern Fold");
    expect(f.packets.garden).not.toContain("Thimble Beds");
    for (const code of ["Y07", "B02", "B03"]) expect([f.packets.church, f.packets.garden].some((t) => t.includes(code))).toBe(false);
  });

  it("the scan can see: a private backup of each fixture holds its canaries", async () => {
    const f = await builtFiles();
    // A backup is zipped with no compression, so a name is still readable in its bytes. This proves the scan above would find one.
    expect(scanForCanaries(f.backupBytes.church, [APPROVED_NAME])).toEqual([APPROVED_NAME]);
    expect(scanForCanaries(f.backupBytes.garden, ["Tavi Bramblequill"])).toEqual(["Tavi Bramblequill"]);
  });
});

describe("T28 the head, the addresses and the file names of a public file", () => {
  const docs = async () => {
    const f = await builtFiles();
    return [
      ["family page", f.familyHtml, f.familyFile.siteTitle],
      ["family print", f.familyPrint, f.familyFile.siteTitle],
      ["availability page", f.availabilityHtml, f.availabilityFile.siteTitle],
      ["availability print", f.availabilityPrint, f.availabilityFile.siteTitle],
    ] as const;
  };

  it("has a title of the public site title and one public word, and no generator or author", async () => {
    for (const [name, html, siteTitle] of await docs()) {
      const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
      expect(title.includes(siteTitle), `${name}: ${title}`).toBe(true);
      expect(title.length, name).toBeLessThanOrEqual(siteTitle.length + 40);
      const metas = [...html.matchAll(/<meta\s+([^>]*)>/g)].map((m) => m[1] as string);
      for (const meta of metas) {
        const named = /name="([^"]+)"/.exec(meta)?.[1];
        if (named !== undefined) expect(["viewport", "color-scheme"], `${name} meta ${named}`).toContain(named);
        else expect(/^(charset="utf-8"|http-equiv="Content-Security-Policy")/.test(meta), `${name} meta ${meta}`).toBe(true);
      }
      expect(/generator|author|creator|producer|keywords|description/i.test(metas.join("\n")), name).toBe(false);
    }
  });

  it("holds no address, no remote asset, no form, no frame and no link tag, only the drawing namespace", async () => {
    for (const [name, html] of await docs()) {
      const noCsp = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "").replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "");
      expect(/(https?:)?\/\/[a-z0-9]/i.test(noCsp), `${name} has an address`).toBe(false);
      expect(/\b(src|href|action|poster|data)=["']?(https?:|\/\/|data:)/i.test(noCsp), `${name} has a remote asset`).toBe(false);
      expect(/<(link|base|form|iframe|object|embed|img|video|audio|source|script[^>]*\ssrc=)/i.test(noCsp), `${name} has a forbidden tag`).toBe(false);
      expect(/url\(\s*["']?(https?:|\/\/)/i.test(noCsp), `${name} has a remote style`).toBe(false);
      expect(/@import/i.test(noCsp), name).toBe(false);
    }
  });

  it("names every file by its kind and a date, and nothing else", () => {
    const names = [
      visitorFileName("family", SCAN_ON),
      availabilityFileName(SCAN_ON),
      reviewFileName(SCAN_ON),
      slipFileName(SCAN_ON),
      backupFilename(SCAN_ON),
    ];
    expect(names).toEqual(["family-map-2026-04-20.html", "availability-map-2026-04-20.html", "committee-review-2026-04-20.json", "committee-return-2026-04-20.json", "register-backup-2026-04-20.pkr.zip"]);
    for (const name of names) {
      expect(scanForCanaries(name, [...VISITOR_CANARIES, ...AVAILABILITY_CANARIES, APPROVED_NAME, "Lantern", "Thimble", "Quillmoss"]), name).toEqual([]);
      expect(/^[a-z]+(-[a-z]+)*-\d{4}-\d{2}-\d{2}\.(html|json|pkr\.zip)$/.test(name), name).toBe(true);
    }
  });

  it("refuses a file name that is given anything but a date", () => {
    for (const bad of ["Mirel Quillmoss", "2026-04-20/../x", "2026-4-2", ""]) {
      expect(() => visitorFileName("family", bad)).toThrow();
      expect(() => availabilityFileName(bad)).toThrow();
    }
  });
});

describe("T28 the local database and the device key", () => {
  const PRIVATE = [...VISITOR_CANARIES, ...AVAILABILITY_CANARIES, APPROVED_NAME, "Lantern Fold", "Thimble Beds", "Quillmoss", "Bramblequill"];

  it("holds no private value in a database name, a store name, an index name, any primary key or any index key", async () => {
    const f = await builtFiles();
    const db = f.db;
    const seen: string[] = [db.name];
    for (const name of Array.from(db.objectStoreNames)) {
      seen.push(name);
      const tx = db.transaction(name, "readonly");
      const store = tx.objectStore(name);
      seen.push(...Array.from(store.indexNames));
      const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const request = store.getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      for (const key of keys) seen.push(JSON.stringify(key));
      const indexKeys: IDBValidKey[] = [];
      for (const indexName of Array.from(store.indexNames)) {
        const rows = await new Promise<IDBValidKey[]>((resolve, reject) => {
          const request = store.index(indexName).getAllKeys();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        indexKeys.push(...rows);
      }
      for (const key of indexKeys) seen.push(JSON.stringify(key));
    }
    expect(seen.length).toBeGreaterThan(20);
    expect(scanForCanaries(seen, PRIVATE)).toEqual([]);
    // A name of a person is not a key. A plot code and a source ref are keys by design (R7, `source:{sheet}:{ref}`):
    // they name a place and a page of the paper book, never a person, and they stay inside the local database.
    for (const text of seen) expect(/Quillmoss|Fennimore|Ashgrove|Bramblequill|Stonecrop|Burrowby|Fennick|Pennywort|Pellwick|example\.invalid/i.test(text), text).toBe(false);
  });

  it("writes the device key with the three choices only", () => {
    const written: Record<string, string> = {};
    saveSettings({ getItem: () => null, setItem: (k, v) => void (written[k] = v) }, { ...DEFAULT_SETTINGS, motion: "reduce" });
    expect(Object.keys(written)).toEqual([SETTINGS_KEY]);
    expect(Object.keys(JSON.parse(written[SETTINGS_KEY] as string) as object).sort()).toEqual(["contrast", "motion", "paper"]);
  });
});

describe("T28 the logs", () => {
  afterEach(() => vi.restoreAllMocks());

  it("write nothing to the console while the data layer seeds, backs up, builds a visitor file and builds a review file", async () => {
    const spies = (["log", "info", "warn", "error", "debug", "trace"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    const f = await builtFiles();
    expect(f.familyHtml.length).toBeGreaterThan(1000);
    const calls = spies.flatMap((spy) => spy.mock.calls);
    expect(calls).toEqual([]);
  });
});

describe("T28 the source has no way out of the device", () => {
  const source = (): { rel: string; code: string }[] => {
    const out: { rel: string; code: string }[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(join(ROOT, dir))) {
        const rel = `${dir}/${name}`;
        if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(name)) out.push({ rel, code: scanSource(readFileSync(join(ROOT, rel), "utf8")).code });
      }
    };
    walk("template/src");
    for (const app of readdirSync(join(ROOT, "apps"))) walk(`apps/${app}/src`);
    return out;
  };

  it("holds no console call, no network call, no beacon, no clipboard write and no cookie", () => {
    const files = source();
    expect(files.length).toBeGreaterThan(100);
    const FORBIDDEN: [string, RegExp][] = [
      ["console", /\bconsole\s*\./],
      ["fetch", /\bfetch\s*\(/],
      ["XMLHttpRequest", /\bXMLHttpRequest\b/],
      ["WebSocket", /\bWebSocket\b/],
      ["EventSource", /\bEventSource\b/],
      ["sendBeacon", /\bsendBeacon\b/],
      ["clipboard write", /\bnavigator\s*\.\s*clipboard\b|\.writeText\s*\(|\bexecCommand\s*\(\s*["']copy["']/],
      ["cookie", /\bdocument\s*\.\s*cookie\b/],
      ["worker or service worker", /\bnavigator\s*\.\s*serviceWorker\b|\bnew\s+(Shared)?Worker\s*\(|\bimportScripts\b/],
      ["session storage", /\bsessionStorage\b/],
      ["eval", /\beval\s*\(|\bnew\s+Function\s*\(/],
    ];
    const found: string[] = [];
    for (const { rel, code } of files) for (const [name, pattern] of FORBIDDEN) if (pattern.test(code)) found.push(`${rel}: ${name}`);
    expect(found).toEqual([]);
  });

  it("uses local storage in one place only, and writes one key, through the settings module", () => {
    const files = source();
    const users = files.filter(({ code }) => /\blocalStorage\b/.test(code)).map(({ rel }) => rel);
    expect(users).toEqual(["template/src/ui/RegisterShell.tsx"]);
    const setters = files.filter(({ code }) => /\.setItem\s*\(/.test(code)).map(({ rel }) => rel);
    expect(setters).toEqual(["template/src/preferences.ts"]);
    const prefs = files.find(({ rel }) => rel === "template/src/preferences.ts")?.code ?? "";
    expect(prefs.match(/\.setItem\s*\(\s*([A-Z_]+)/)?.[1]).toBe("SETTINGS_KEY");
  });

  it("puts nothing private in an address: the register writes the hash and history state only through the shell", () => {
    const files = source();
    const pushes = files.filter(({ code }) => /\bhistory\s*\.\s*(pushState|replaceState)\b/.test(code)).map(({ rel }) => rel);
    expect(pushes).toEqual(["template/src/ui/RegisterShell.tsx"]);
  });
});
