// T22 visitor projections, family part (spec 03, C4 and C5). The family file holds only what the keeper
// approved. Expected values come from hand-totals.md sections 1 and 4. The availability part comes with spec 04.
import { beforeEach, describe, expect, it } from "vitest";
import { parseFamily, scanForCanaries } from "../../template/src/output/privacy";
import type { FamilyFile } from "../../template/src/output/privacy";
import { buildFamilyFile, isStalePreview } from "../../apps/churchyard-register/src/projection";
import type { ChurchCommand } from "../../apps/churchyard-register/src/types";
import { APPROVED_NAME, CONTACT, LIVING_HOLDERS, OTHER_OCCUPANT, VISITOR_CANARIES } from "../helpers/privacyCanaries";
import { ChurchEnv, WALK_PATH_ID, id, plotId, spaceId } from "../helpers/churchEnv";
import { buildFold } from "../helpers/lanternFold";
import { AVAILABILITY_WORD_KEYS, availabilityFileName, buildAvailabilityHtml } from "../../template/src/output/availabilityHtml";
import { parseAvailability } from "../../template/src/output/privacy";
import type { AvailabilityFile } from "../../template/src/output/privacy";
import { DENSE_PLOT_LIMIT, buildAvailabilityPrint } from "../../template/src/output/print";
import { buildAvailabilityFile, freePlotsAt, isStalePreview as isStaleAvailability } from "../../apps/allotment-register/src/projection";
import type { AllotCommand } from "../../apps/allotment-register/src/types";
import { AVAILABILITY_CANARIES, GARDEN_PERSON_KEYS } from "../helpers/gardenCanaries";
import { AVAILABILITY_WORDS } from "../helpers/availabilityWords";
import { GardenEnv, id as gid, plotId as gplotId, sectionId as gsectionId, spaceId as gspaceId } from "../helpers/gardenEnv";
import { SHADY, SUNNY, app as gapp, buildThimble, claim as gclaim, person as gperson, tenancy as gtenancy } from "../helpers/thimbleBeds";

const DIRECTIONS = "Enter at Lantern Gate. Follow Yew Walk to row Y. Look for Y07.";
const SECTION = id("section:Yew Walk");
const MIREL = id("burial:LF-07A");

let env: ChurchEnv;
let n = 0;

const publicIds = () => `pub${++n}`;
const build = (over: { asOf?: string } = {}) => buildFamilyFile(env.state, { asOf: over.asOf ?? "2026-04-20", revision: env.revision, newPublicId: publicIds });

const settings = (over: Partial<Extract<ChurchCommand, { type: "set_public" }>> = {}): ChurchCommand => ({
  type: "set_public",
  siteName: "Lantern Fold",
  gateName: "Lantern Gate",
  directions: DIRECTIONS,
  sectionNames: { [SECTION]: "Yew Walk" },
  pathNames: { [WALK_PATH_ID]: "Yew Walk" },
  ...over,
});

const approve = (ref: string, includeYear = false): ChurchCommand => ({ type: "approve_burial", burialId: id(`burial:${ref}`), includeYear });

function built(): { file: FamilyFile; preview: Extract<ReturnType<typeof build>, { ok: true }>["preview"] } {
  const out = build();
  if (!out.ok) throw new Error(`not built: ${JSON.stringify(out)}`);
  return out;
}

beforeEach(async () => {
  n = 0;
  env = await ChurchEnv.create();
  await buildFold(env, { geometry: true });
  await env.must([settings(), approve("LF-07A")]);
});

describe("T22 the family file holds only the approved name (C5.1, C5.2)", () => {
  it("has Mirel Quillmoss at Y07, the gate, the path, the directions and nothing else about a person", () => {
    const { file } = built();
    expect(file.format).toBe("plot.family.v1");
    expect(file.siteTitle).toBe("Lantern Fold");
    expect(file.asOf).toBe("2026-04-20");
    expect(file.gate).toMatchObject({ name: "Lantern Gate", x: 500, y: 2600 });
    expect(file.paths).toEqual([{ name: "Yew Walk", points: [[700, 2600], [7600, 2600]] }]);
    expect(file.plots).toHaveLength(1);
    expect(file.plots[0]).toMatchObject({ code: "Y07" });
    expect(file.burials).toHaveLength(1);
    expect(file.burials[0]).toMatchObject({ name: APPROVED_NAME, plotId: file.plots[0]?.id, directions: DIRECTIONS });
    expect(Object.keys(file.burials[0] ?? {}).sort()).toEqual(["directions", "id", "name", "plotId"]);
    expect(parseFamily(file).ok).toBe(true);
  });

  it("carries no canary in any key or value, and no private ID", () => {
    const { file } = built();
    const text = JSON.stringify(file);
    expect(scanForCanaries(file, VISITOR_CANARIES)).toEqual([]);
    for (const secret of [...VISITOR_CANARIES, "LF-07A", "LF-07B", "LF-R1", "LF-R2", "Hollowmere"]) expect(text).not.toContain(secret);
    const privateIds = [
      ...Object.keys(env.state.core.plots),
      ...Object.values(env.state.core.plots).flatMap((p) => p.spaces.map((s) => s.spaceId)),
      ...Object.keys(env.state.burials),
      ...Object.keys(env.state.people),
      ...Object.keys(env.state.reservations),
      ...Object.keys(env.state.core.claims),
      SECTION,
      WALK_PATH_ID,
      env.site.id,
      env.site.siteKey,
      env.site.lineageId,
    ];
    for (const secret of privateIds) expect(text).not.toContain(secret);
  });

  it("does not take the living holders, the other occupant or the contact from the register", () => {
    const text = JSON.stringify(built().file);
    for (const holder of LIVING_HOLDERS) expect(text).not.toContain(holder);
    expect(text).not.toContain(OTHER_OCCUPANT);
    expect(text).not.toContain(CONTACT);
    expect(Object.keys(built().file).sort()).toEqual(["asOf", "burials", "format", "gate", "north", "paths", "plots", "sections", "siteTitle"]);
  });

  it("copies the plot outline from the map and the north from the map", () => {
    const { file } = built();
    expect(file.plots[0]?.outline).toEqual([[1000, 2900], [1900, 2900], [1900, 4000], [1000, 4000]]);
    expect(file.north).toBe(0);
  });
});

describe("T22 the year appears only when it was approved for that burial (C4.1)", () => {
  it("leaves the year out by default and puts 1889 in when the keeper includes it", async () => {
    expect("year" in (built().file.burials[0] ?? {})).toBe(false);
    await env.must([approve("LF-07A", true)]);
    expect(built().file.burials[0]?.year).toBe(1889);
  });
});

describe("T22 each file has its own public IDs (C5.5)", () => {
  it("shares no ID between two files from the same register", () => {
    const first = built().file;
    const second = built().file;
    const ids = (f: FamilyFile) => [...f.sections.map((s) => s.id), ...f.plots.map((p) => p.id), ...f.burials.map((b) => b.id)];
    const overlap = ids(first).filter((x) => ids(second).includes(x));
    expect(overlap).toEqual([]);
    expect(ids(first).length).toBeGreaterThan(0);
  });
});

describe("T22 a stale approval is not used (C4.2, C4.3)", () => {
  it("drops the burial when its name changes, and brings it back only after a new approval", async () => {
    const original = await env.eventIdOf("burial_recorded", MIREL);
    await env.must([{ type: "correct_burial", burialId: MIREL, recordedName: "Mirel Quillmoss Jr", correctsEventId: original, reason: "Stone says Jr", correctionRef: "LF page 7" }]);
    const out = built();
    expect(out.file.burials).toHaveLength(0);
    expect(out.preview.needsReview.map((r) => r.plotCode)).toEqual(["Y07"]);
    expect(JSON.stringify(out.file)).not.toContain("Quillmoss");
    await env.must([approve("LF-07A")]);
    expect(built().file.burials[0]?.name).toBe("Mirel Quillmoss Jr");
  });

  it("drops a voided burial and a withdrawn approval", async () => {
    await env.must([{ type: "withdraw_approval", burialId: MIREL }]);
    expect(built().file.burials).toHaveLength(0);
  });

  it("leaves out an approved burial that has no plot, and counts it", async () => {
    await env.must([approve("LF-H1")]);
    const out = built();
    expect(out.preview.notPlaced).toBe(1);
    expect(out.file.burials.map((b) => b.name)).toEqual([APPROVED_NAME]);
    expect(JSON.stringify(out.file)).not.toContain("Perrin");
  });
});

describe("T22 with no names the site map can still be shared (C5.3)", () => {
  it("builds a file with no burials and no plots, and says so", async () => {
    await env.must([{ type: "withdraw_approval", burialId: MIREL }]);
    const out = built();
    expect(out.preview.noNames).toBe(true);
    expect(out.file.burials).toEqual([]);
    expect(out.file.plots).toEqual([]);
    expect(out.file.gate.name).toBe("Lantern Gate");
    expect(out.file.paths).toHaveLength(1);
    expect(parseFamily(out.file).ok).toBe(true);
  });
});

describe("T22 the private preview (C4.4, C5, R31.7)", () => {
  it("lists the included burial and shows the other Y07 occupant only as withheld", () => {
    const { preview } = built();
    expect(preview.included).toEqual([{ burialId: MIREL, name: APPROVED_NAME, plotCode: "Y07", sectionLabel: "Yew Walk" }]);
    expect(preview.withheld).toEqual([{ burialId: id("burial:LF-07B"), plotCode: "Y07" }]);
    expect(JSON.stringify(preview.withheld)).not.toContain(OTHER_OCCUPANT);
    expect(preview.noNames).toBe(false);
    expect(preview.revision).toBe(env.revision);
  });

  it("lists the public fields and what is left out with counts", () => {
    const { preview } = built();
    expect(preview.fields).toEqual(expect.arrayContaining(["siteName", "gateName", "pathNames", "sectionNames", "plotCodes", "directions", "names"]));
    const count = (category: string) => preview.excluded.find((e) => e.category === category)?.count;
    expect(count("people")).toBe(2);
    expect(count("requests")).toBe(0);
    expect(count("burials")).toBe(6);
    expect(count("sourceRefs")).toBe(8);
  });

  it("is stale once the register has moved on", async () => {
    const { preview } = built();
    expect(isStalePreview(preview, env.revision)).toBe(false);
    await env.must([{ type: "withdraw_approval", burialId: MIREL }]);
    expect(isStalePreview(preview, env.revision)).toBe(true);
  });
});

describe("T22 public words (C5.1, C5.4)", () => {
  it("uses the public plot code, and a neutral section label when none was set", async () => {
    await env.must([settings({ plotCodes: { [plotId("Y07")]: "Seven" }, sectionNames: {} })]);
    const { file } = built();
    expect(file.plots[0]?.code).toBe("Seven");
    expect(file.sections[0]?.label).toBe("Section 1");
  });

  it("flags a public field that holds a living name, an unapproved name or a contact, and builds no file", async () => {
    await env.must([settings({ directions: `Ask ${LIVING_HOLDERS[0]} at the gate` })]);
    const direct = build();
    expect(direct.ok).toBe(false);
    if (!direct.ok) expect(direct.flagged).toEqual([{ field: "directions", matches: [LIVING_HOLDERS[0]] }]);

    await env.must([settings({ siteName: `St ${OTHER_OCCUPANT} churchyard` })]);
    const other = build();
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.flagged.map((f) => f.field)).toContain("siteName");

    await env.must([settings({ gateName: CONTACT })]);
    const contact = build();
    if (!contact.ok) expect(contact.flagged.map((f) => f.field)).toContain("gateName");
    expect(contact.ok).toBe(false);
  });

  // Review finding 3 (R15.1, R15.7, R4.1): the public name of a burial is a typed field, so it is checked too.
  it("flags an approved public name that holds a living person or a contact, and builds no file", async () => {
    const withName = (name: string): ChurchCommand => ({ type: "approve_burial", burialId: MIREL, includeYear: false, name });
    for (const name of [LIVING_HOLDERS[0], `${LIVING_HOLDERS[1]} ring 07700900123`, `Mirel Quillmoss, ring 07700900123`, `Mirel Quillmoss ${CONTACT}`, CONTACT]) {
      await env.must([withName(name)]);
      const out = build();
      expect(out.ok, name).toBe(false);
      if (!out.ok) expect(out.flagged.map((f) => f.field), name).toEqual(["names"]);
    }
  });

  it("flags an approved public name that is the name of a burial that was not approved", async () => {
    await env.must([{ type: "approve_burial", burialId: MIREL, includeYear: false, name: OTHER_OCCUPANT }]);
    const out = build();
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.flagged.map((f) => f.field)).toEqual(["names"]);
  });

  it("still accepts the burial's own recorded name and a neutral variation of it", async () => {
    expect(build().ok).toBe(true);
    await env.must([{ type: "approve_burial", burialId: MIREL, includeYear: false, name: "M. Quillmoss" }]);
    const out = build();
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.file.burials[0]?.name).toBe("M. Quillmoss");
  });

  // Review finding 4 (R15.7): one word of a living name is enough to flag a public label.
  it("flags a public label that holds a single word name, or one word of a living full name", async () => {
    const holder = (ref: string, code: string, name: string): ChurchCommand => ({
      type: "record_reservation",
      reservationId: id(`reservation:${ref}`),
      holderId: id(`holder:${ref}`),
      holderName: name,
      spaceId: spaceId(code),
      claimId: id(`claim:${ref}`),
      start: "2026-03-01",
      sourceRef: ref,
    });
    await env.must([holder("LF-R3", "Y03", "Thorne")]);
    await env.must([settings({ gateName: "Thorne gate" })]);
    const single = build();
    expect(single.ok).toBe(false);
    if (!single.ok) expect(single.flagged.map((f) => f.field)).toEqual(["gateName"]);

    await env.must([holder("LF-R8", "Y08", "Ada Fenwick")]);
    await env.must([settings({ gateName: "Lantern Gate", directions: "Look for the Fenwick yew." })]);
    const part = build();
    expect(part.ok).toBe(false);
    if (!part.ok) expect(part.flagged.map((f) => f.field)).toEqual(["directions"]);

    await env.must([settings({ gateName: "Lantern Gate", directions: DIRECTIONS })]);
    expect(build().ok).toBe(true);
  });

  it("says what is missing: a public site name, a gate on the map, a public gate name", async () => {
    await env.must([settings({ siteName: "  " })]);
    const noName = build();
    expect(noName.ok).toBe(false);
    if (!noName.ok) expect(noName.missing).toEqual(["siteName"]);
    await env.must([settings({ siteName: "Lantern Fold", gateName: "" })]);
    const noGate = build();
    if (!noGate.ok) expect(noGate.missing).toEqual(["gateName"]);
    expect(noGate.ok).toBe(false);
  });

  it("flags nothing when only the approved name is in a label", async () => {
    await env.must([settings({ directions: `Look for the stone of ${APPROVED_NAME}.` })]);
    expect(build().ok).toBe(true);
  });
});

// ---- The family file as a self contained page (C5.7, C5.8) --------------------------------------
import { FAMILY_WORD_KEYS, buildFamilyHtml, visitorFileName } from "../../template/src/output/visitorHtml";
import { FAMILY_WORDS } from "../helpers/familyWords";


/** The rules of the `@media print` block of a visitor file's own style. */
function printRules(html: string): string {
  const start = html.indexOf("@media print{");
  expect(start, "the file has print rules").toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</style>", start));
}

const GRAY = "#(?:([0-9a-f]{2})\\1\\1|([0-9a-f])\\2\\2)\\b";
describe("T22 the family page (C5.7)", () => {
  const page = (file: FamilyFile = built().file) => buildFamilyHtml(file, FAMILY_WORDS);

  it("is sealed: a strict policy, no remote address, no form, no image, one data block and one script", () => {
    const html = page();
    expect(html).toMatch(/<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">/);
    expect(html).not.toMatch(/https?:\/\//);
    for (const forbidden of ["<form", "<link", "<img", "<iframe", "<object", "<embed", "src=", "@import", "url("]) expect(html).not.toContain(forbidden);
    expect(html.match(/<script/g)).toHaveLength(2);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="en-GB">');
  });

  it("prints in grays: the colours of the map that are tan on screen are gray in the print rules (found in the browser, 6.20)", () => {
    const rules = printRules(page());
    for (const part of [".walk{stroke", ".tab{fill"]) expect(rules, part).toMatch(new RegExp(`${part.replace(/[{.]/g, "\\$&")}:${GRAY}`, "i"));
  });
  it("carries its own data as closed JSON that parses back to the same file", () => {
    const file = built().file;
    const html = page(file);
    const block = /<script type="application\/json" id="plot-family">([\s\S]*?)<\/script>/.exec(html);
    expect(block).not.toBeNull();
    const parsed = JSON.parse(block?.[1] ?? "");
    expect(parsed).toEqual(file);
    expect(parseFamily(parsed).ok).toBe(true);
    expect(html).toContain("plot.family.v1");
  });

  it("keeps a hostile name from breaking out of the page or the data block", () => {
    const base = built().file;
    const evil = "</script><img src=x onerror=alert(1)> & \u2028";
    const file: FamilyFile = { ...base, burials: [{ ...(base.burials[0] as FamilyFile["burials"][number]), name: evil }] };
    const html = page(file);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("</script><");
    expect(html.match(/<script/g)).toHaveLength(2);
    expect(html).toContain("\\u003c/script\\u003e");
    expect(html).toContain("&lt;/script&gt;");
    const block = /<script type="application\/json" id="plot-family">([\s\S]*?)<\/script>/.exec(html);
    expect(JSON.parse(block?.[1] ?? "").burials[0].name).toBe(evil);
  });

  it("lists the burial as plain text, so browser Find works with script off", () => {
    const html = page();
    const text = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
    for (const word of [APPROVED_NAME, "Y07", "Lantern Gate", "Yew Walk", DIRECTIONS, "As at 2026-04-20", FAMILY_WORDS.findBurial, FAMILY_WORDS.nameOrCode, FAMILY_WORDS.entrance]) {
      expect(text).toContain(word);
    }
  });

  it("holds every word it shows from the catalog it was given, and fails when one is missing", () => {
    const { findBurial: _drop, ...partial } = FAMILY_WORDS;
    expect(() => buildFamilyHtml(built().file, partial as unknown as typeof FAMILY_WORDS)).toThrow(/findBurial/);
    expect(FAMILY_WORD_KEYS.length).toBeGreaterThan(10);
  });

  it("holds no canary in its bytes, and no private ID", () => {
    const html = page();
    expect(scanForCanaries(html, VISITOR_CANARIES)).toEqual([]);
    for (const secret of [id("burial:LF-07A"), env.site.id, "LF-07A", "LF-R1"]) expect(html).not.toContain(secret);
  });

  it("says no names were selected, and still draws the map", async () => {
    await env.must([{ type: "withdraw_approval", burialId: MIREL }]);
    const html = page();
    expect(html).toContain(FAMILY_WORDS.noNames);
    expect(html).toContain("Lantern Gate");
    expect(html).toContain("<svg");
  });

  it("has a script that compiles, and filters by the typed words", () => {
    const html = page();
    const code = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(code.length).toBeGreaterThan(100);
    expect(() => new Function(code)).not.toThrow();
    expect(html).toContain(FAMILY_WORDS.noMatch);
  });

  it("names the download with its kind and date and no private value (C5.8)", () => {
    expect(visitorFileName("family", "2026-04-20")).toBe("family-map-2026-04-20.html");
    expect(() => visitorFileName("family", "Mirel Quillmoss")).toThrow();
  });
});

describe("T22 the page script cannot hide the page (found in the browser, 3.14)", () => {
  it("adds only classes that no rule hides, so the root element stays shown", () => {
    const html = buildFamilyHtml(built().file, FAMILY_WORDS);
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    const added = [...script.matchAll(/className\+='\s*([\w-]+)'/g)].map((m) => m[1] as string);
    expect(added.length).toBeGreaterThan(0);
    for (const name of added) {
      // A bare `.name{display:none}` would match the root element that carries the class.
      expect(css, name).not.toMatch(new RegExp(`(^|[},])\\s*\\.${name}\\s*\\{[^}]*display\\s*:\\s*none`));
    }
    expect(css).toMatch(/html\.has-script \.js-only\{display:inline-flex/);
  });
});

// ---------------------------------------------------------------------------------------------------------
// The availability file for plot seekers (spec 04, task 4.10, A6). Expected values: hand-totals.md 5.5.
// The file has no person field of any kind, no fee and no queue position.
// ---------------------------------------------------------------------------------------------------------

const GARDEN_INSTRUCTIONS = "Ask the secretary at the hut on Saturday morning. Say the plot code.";
const GARDEN_ON = "2026-04-20";

let garden: GardenEnv;
let gn = 0;
const gpublic = () => `g${++gn}`;

const gardenSettings = (over: Partial<Extract<AllotCommand, { type: "set_public" }>> = {}): AllotCommand => ({
  type: "set_public",
  siteName: "Thimble Beds",
  gateName: "Thimble Gate",
  instructions: GARDEN_INSTRUCTIONS,
  sectionNames: { [gsectionId(SUNNY)]: SUNNY, [gsectionId(SHADY)]: SHADY },
  pathNames: { [gid("path:Grass Walk")]: "Grass Walk" },
  listed: ["B03", "B05"].map(gplotId),
  ...over,
});

const gbuild = (over: { asOf?: string } = {}) => buildAvailabilityFile(garden.state, { asOf: over.asOf ?? GARDEN_ON, revision: garden.revision, newPublicId: gpublic });

function gbuilt(): { file: AvailabilityFile; preview: Extract<ReturnType<typeof gbuild>, { ok: true }>["preview"] } {
  const out = gbuild();
  if (!out.ok) throw new Error(`no availability file: ${JSON.stringify(out)}`);
  return { file: out.file, preview: out.preview };
}

const offerB03 = (): AllotCommand => ({ type: "make_offer", offerId: gid("offer:b03"), applicationId: gapp("tavi"), spaceId: gspaceId("B03"), claimId: gclaim("hold:b03"), replyBy: "2026-05-04" });

describe("T22 the availability file lists the chosen free plots (A6.1, hand totals 5.5)", () => {
  beforeEach(async () => {
    garden = await GardenEnv.create();
    await buildThimble(garden, { geometry: true });
    await garden.must([gardenSettings()]);
  });

  it("lists B03 and B05, draws the other four as neutral ground, and says who to ask", () => {
    const { file } = gbuilt();
    expect(file.format).toBe("plot.availability.v1");
    expect(file.freePlots.map((p) => p.code)).toEqual(["B03", "B05"]);
    expect(file.neutralGround).toHaveLength(4);
    expect(file.siteTitle).toBe("Thimble Beds");
    expect(file.gate).toEqual({ name: "Thimble Gate", x: 500, y: 2650 });
    expect(file.paths).toEqual([{ name: "Grass Walk", points: [[700, 2650], [6100, 2650]] }]);
    expect(file.sections.map((s) => s.label).sort()).toEqual([SHADY, SUNNY]);
    expect(file.instructions).toBe(GARDEN_INSTRUCTIONS);
    expect(file.asOf).toBe(GARDEN_ON);
    expect(file.north).toBe(0);
    expect(file.freePlots.length + file.neutralGround.length).toBe(6);
  });

  it("puts each free plot in its own section and gives it its outline", () => {
    const { file } = gbuilt();
    const sectionOf = (code: string) => file.sections.find((s) => s.id === file.freePlots.find((p) => p.code === code)?.sectionId)?.label;
    expect(sectionOf("B03")).toBe(SUNNY);
    expect(sectionOf("B05")).toBe(SHADY);
    expect(file.freePlots[0]?.outline).toHaveLength(4);
  });

  it("holds no person, no fee, no queue position and no reason: closed keys, every canary absent", () => {
    const { file } = gbuilt();
    expect(Object.keys(file).sort()).toEqual(["asOf", "format", "freePlots", "gate", "instructions", "neutralGround", "north", "paths", "sections", "siteTitle"]);
    const allowed = new Set(["format", "asOf", "siteTitle", "north", "gate", "name", "x", "y", "paths", "points", "sections", "id", "label", "outline", "freePlots", "code", "sectionId", "neutralGround", "instructions"]);
    const keys = new Set<string>();
    (function walk(value: unknown) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          keys.add(key);
          walk(child);
        }
      }
    })(file);
    for (const key of keys) expect(allowed.has(key), key).toBe(true);
    for (const key of GARDEN_PERSON_KEYS) expect(keys.has(key), key).toBe(false);
    const bytes = JSON.stringify(file);
    expect(scanForCanaries(bytes, AVAILABILITY_CANARIES)).toEqual([]);
    expect(parseAvailability(file).ok).toBe(true);
  });

  it("is rejected by the closed schema when a key is added at any depth", () => {
    const { file } = gbuilt();
    type Node = Record<string | number, unknown>;
    const copyOf = (): unknown => JSON.parse(JSON.stringify(file));
    /** Add one key at a depth, where the path names each step down from the top of the file. */
    const addKey = (path: (string | number)[], key: string, value: unknown): boolean => {
      const copy = copyOf();
      let node = copy as Node;
      for (const step of path) node = node[step] as Node;
      node[key] = value;
      return parseAvailability(copy).ok;
    };
    expect(addKey([], "holder", "Tavi Bramblequill")).toBe(false);
    expect(addKey(["freePlots", 0], "tenant", "Marlo Fennick")).toBe(false);
    expect(addKey(["freePlots", 0], "fee", 3600)).toBe(false);
    expect(addKey(["gate"], "contact", "a@b.invalid")).toBe(false);
    expect(addKey(["neutralGround", 0], "reason", "Taken")).toBe(false);
    expect(addKey(["sections", 0], "position", 1)).toBe(false);
    expect(parseAvailability(copyOf()).ok).toBe(true);
  });

  it("uses the public code of a plot when the secretary gave one", async () => {
    await garden.must([gardenSettings({ plotCodes: { [gplotId("B03")]: "Plot 3" } })]);
    expect(gbuilt().file.freePlots.map((p) => p.code)).toEqual(["Plot 3", "B05"]);
  });
});

describe("T22 a plot leaves the file at once when it is no longer free (A6.2, R15.9)", () => {
  beforeEach(async () => {
    garden = await GardenEnv.create();
    await buildThimble(garden, { geometry: true });
    await garden.must([gardenSettings()]);
  });

  it("drops B03 the moment an offer is made, in the same revision", async () => {
    await garden.must([offerB03()], GARDEN_ON);
    const { file } = gbuilt();
    expect(file.freePlots.map((p) => p.code)).toEqual(["B05"]);
    expect(file.neutralGround).toHaveLength(5);
    expect(file.sections.map((s) => s.label)).toEqual([SHADY]);
  });

  it("is an empty list when nothing chosen is free, and still a file (hand totals 5.5, third row)", async () => {
    await garden.must([gardenSettings({ listed: [gplotId("B03")] })]);
    expect(gbuilt().file.freePlots.map((p) => p.code)).toEqual(["B03", "B05"].slice(0, 1));
    await garden.must([offerB03()], GARDEN_ON);
    const { file, preview } = gbuilt();
    expect(file.freePlots).toEqual([]);
    expect(file.neutralGround).toHaveLength(6);
    expect(file.sections).toEqual([]);
    expect(preview.noPlots).toBe(true);
    expect(parseAvailability(file).ok).toBe(true);
  });

  it("leaves out a chosen plot that is taken, unusable or not checked, and names it in the private preview", async () => {
    await garden.must([gardenSettings({ listed: ["B01", "B03", "B06"].map(gplotId) })]);
    const { file, preview } = gbuilt();
    expect(file.freePlots.map((p) => p.code)).toEqual(["B03"]);
    expect(preview.listedNotFree.map((p) => p.code)).toEqual(["B01", "B06"]);
  });

  it("leaves out a free plot that has a tenancy starting later, because it is not free from then on", async () => {
    await garden.must([{ type: "record_tenancy", tenancyId: gtenancy("B05"), claimId: gclaim("tenancy:B05"), personId: gperson("Later Holder"), holderName: "Later Holder", spaceId: gspaceId("B05"), start: "2026-09-01", sourceRef: "TB-LATER" }]);
    expect(gbuilt().file.freePlots.map((p) => p.code)).toEqual(["B03"]);
    expect(freePlotsAt(garden.state, GARDEN_ON).map((p) => p.code)).toEqual(["B03"]);
  });

  it("brings a plot back after a decline, and after a tenancy ends", async () => {
    await garden.must([offerB03()], GARDEN_ON);
    await garden.must([{ type: "decline_offer", offerId: gid("offer:b03"), choice: "keep_place" }], "2026-04-21");
    expect(gbuild({ asOf: "2026-04-21" }).ok && (gbuild({ asOf: "2026-04-21" }) as { file: AvailabilityFile }).file.freePlots.map((p) => p.code)).toEqual(["B03", "B05"]);
    await garden.must([{ type: "end_tenancy", tenancyId: gtenancy("B02") }], "2026-05-01");
    await garden.must([gardenSettings({ listed: ["B02", "B03", "B05"].map(gplotId) })]);
    const out = gbuild({ asOf: "2026-05-01" });
    expect(out.ok && out.file.freePlots.map((p) => p.code)).toEqual(["B02", "B03", "B05"]);
  });

  it("makes the preview stale when the register changes, and the next build is from the latest revision", async () => {
    const { preview } = gbuilt();
    expect(isStaleAvailability(preview, garden.revision)).toBe(false);
    await garden.must([offerB03()], GARDEN_ON);
    expect(isStaleAvailability(preview, garden.revision)).toBe(true);
    expect(gbuilt().preview.revision).toBe(garden.revision);
    expect(gbuilt().file.freePlots.map((p) => p.code)).toEqual(["B05"]);
  });

  it("keeps the date of a file already made: an old object does not change", async () => {
    const before = JSON.stringify(gbuilt().file);
    await garden.must([offerB03()], GARDEN_ON);
    expect(JSON.stringify(JSON.parse(before).freePlots.map((p: { code: string }) => p.code))).toBe('["B03","B05"]');
    expect(JSON.parse(before).asOf).toBe(GARDEN_ON);
  });
});

describe("T22 each file has its own public IDs and no private one (A6.1)", () => {
  beforeEach(async () => {
    garden = await GardenEnv.create();
    await buildThimble(garden, { geometry: true });
    await garden.must([gardenSettings()]);
  });

  it("shares no ID between two files from one site, and carries no private UUID", () => {
    const a = gbuilt().file;
    const b = gbuilt().file;
    const idsOf = (f: AvailabilityFile) => [...f.sections.map((s) => s.id), ...f.freePlots.map((p) => p.id)];
    for (const one of idsOf(a)) expect(idsOf(b)).not.toContain(one);
    const bytes = JSON.stringify(a);
    const privateIds = [garden.site.id, garden.site.siteKey, garden.site.lineageId, ...Object.keys(garden.state.core.plots), ...Object.keys(garden.state.people), ...Object.keys(garden.state.map.sections), ...Object.keys(garden.state.tenancies)];
    for (const secret of privateIds) expect(bytes).not.toContain(secret);
  });
});

describe("T22 what is missing and what is flagged (A6.4, R15.7)", () => {
  beforeEach(async () => {
    garden = await GardenEnv.create();
    await buildThimble(garden, { geometry: true });
  });

  it("asks for the public site name and gate name, and says so when the map has no gate", async () => {
    const none = gbuild();
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.missing).toEqual(["siteName", "gateName"]);
    const bare = await GardenEnv.create();
    await bare.must([{ type: "layout_apply", sections: [{ sectionId: "s", name: "Row" }], plots: [{ plotId: "p", code: "B01", spaces: [{ spaceId: "sp" }] }] }]);
    await bare.must([{ type: "set_public", siteName: "Bare", gateName: "Gate" }]);
    const out = buildAvailabilityFile(bare.state, { asOf: GARDEN_ON, revision: bare.revision, newPublicId: gpublic });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.missing).toEqual(["gate"]);
  });

  it("flags a public word that holds an applicant, a holder or a contact, and builds nothing", async () => {
    await garden.must([gardenSettings({ instructions: "Ask Tavi Bramblequill at the hut." })]);
    const out = gbuild();
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.flagged).toEqual([{ field: "instructions", matches: ["Tavi Bramblequill"] }]);
    await garden.must([gardenSettings({ instructions: "Write to ada.stonecrop@example.invalid.", plotCodes: { [gplotId("B03")]: "Marlo Fennick" } })]);
    const again = gbuild();
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.flagged.map((f) => f.field).sort()).toEqual(["instructions", "plotCodes"]);
  });

  it("passes a neutral word", async () => {
    await garden.must([gardenSettings({ instructions: "Ask at the hut." })]);
    expect(gbuild().ok).toBe(true);
  });

  // Review finding 4 (R15.7): a single word name, or one word of a full name, is a private string.
  it("flags a public word that holds a single word applicant name or one word of a full name", async () => {
    await garden.must([{ type: "add_applicant", applicationId: gapp("thorne"), personId: gperson("Thorne"), name: "Thorne", joinedOn: "2026-02-01" } as AllotCommand], "2026-02-01");
    await garden.must([gardenSettings({ instructions: "Ask at Thorne gate." })]);
    const single = gbuild();
    expect(single.ok).toBe(false);
    if (!single.ok) expect(single.flagged.map((f) => f.field)).toEqual(["instructions"]);
    await garden.must([gardenSettings({ instructions: "Ask for the Stonecrop bed." })]);
    const part = gbuild();
    expect(part.ok).toBe(false);
    if (!part.ok) expect(part.flagged.map((f) => f.field)).toEqual(["instructions"]);
    await garden.must([gardenSettings({ instructions: "Ask at the hut." })]);
    expect(gbuild().ok).toBe(true);
  });

  it("refuses to list a plot that is not in the register", async () => {
    const out = await garden.dispatch([gardenSettings({ listed: ["nothing"] })]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("no_such_plot");
  });
});

describe("T22 the private preview (A6.9, R31.7)", () => {
  beforeEach(async () => {
    garden = await GardenEnv.create();
    await buildThimble(garden, { geometry: true });
    await garden.must([gardenSettings()]);
  });

  it("lists the plots, the fields, and what stays private with its count", () => {
    const { preview } = gbuilt();
    expect(preview.included.map((i) => [i.code, i.sectionLabel])).toEqual([["B03", SUNNY], ["B05", SHADY]]);
    expect(preview.fields).toEqual(["siteName", "gateName", "pathNames", "sectionNames", "instructions", "freePlots"]);
    expect(Object.fromEntries(preview.excluded.map((e) => [e.category, e.count]))).toEqual({ people: 5, applicants: 2, tenancies: 3, charges: 1, offers: 0 });
    expect(preview.neutralCount).toBe(4);
    expect(preview.noPlots).toBe(false);
    expect(preview.siteName).toBe("Thimble Beds");
  });
});

describe("T22 the availability page (A6.6)", () => {
  beforeEach(async () => {
    garden = await GardenEnv.create();
    await buildThimble(garden, { geometry: true });
    await garden.must([gardenSettings()]);
  });
  const page = (file: AvailabilityFile = gbuilt().file) => buildAvailabilityHtml(file, AVAILABILITY_WORDS);

  it("prints in grays: the colours of the map that are green or yellow on screen are gray in the print rules (found in the browser, 6.20)", () => {
    const rules = printRules(page());
    for (const part of [".map{background", ".bed{fill", ".walk{stroke", ".tab{fill", "ul.list li.on{background"]) {
      expect(rules, part).toMatch(new RegExp(`${part.replace(/[{.]/g, "\\$&")}:${GRAY}`, "i"));
    }
  });
  it("is sealed: a strict policy, no remote address, no form, no image, one data block and one script", () => {
    const html = page();
    expect(html).toMatch(/<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">/);
    expect(html).not.toMatch(/https?:\/\//);
    for (const forbidden of ["<form", "<link", "<img", "<iframe", "<object", "<embed", "src=", "@import", "url("]) expect(html).not.toContain(forbidden);
    expect(html.match(/<script/g)).toHaveLength(2);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="en-GB">');
  });

  it("carries its own data as closed JSON that parses back to the same file", () => {
    const file = gbuilt().file;
    const block = /<script type="application\/json" id="plot-availability">([\s\S]*?)<\/script>/.exec(page(file));
    expect(block).not.toBeNull();
    const parsed = JSON.parse(block?.[1] ?? "");
    expect(parsed).toEqual(file);
    expect(parseAvailability(parsed).ok).toBe(true);
  });

  it("keeps hostile words from breaking out of the page or the data block", () => {
    const base = gbuilt().file;
    const evil = "</script><img src=x onerror=alert(1)> & \u2028";
    const file: AvailabilityFile = { ...base, instructions: evil, sections: base.sections.map((s) => ({ ...s, label: evil })) };
    const html = page(file);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("</script><");
    expect(html.match(/<script/g)).toHaveLength(2);
    expect(html).toContain("\\u003c/script\\u003e");
    expect(html).toContain("&lt;/script&gt;");
    const block = /<script type="application\/json" id="plot-availability">([\s\S]*?)<\/script>/.exec(html);
    expect(JSON.parse(block?.[1] ?? "").instructions).toBe(evil);
  });

  it("lists the plots as plain text, so browser Find works with script off", () => {
    const html = page();
    const text = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");
    for (const word of ["B03", "B05", SUNNY, SHADY, "Thimble Gate", GARDEN_INSTRUCTIONS, "As at 2026-04-20", AVAILABILITY_WORDS.availablePlots, AVAILABILITY_WORDS.chooseSection, AVAILABILITY_WORDS.askSecretary, AVAILABILITY_WORDS.entrance]) {
      expect(text).toContain(word);
    }
  });

  it("has a section chooser and a Show location button for each plot, for use with script", () => {
    const html = page();
    expect(html).toContain('<select id="sec"');
    expect(html.match(/data-plot="/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain(`>${AVAILABILITY_WORDS.showLocation}</button>`);
    const code = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    expect(code.length).toBeGreaterThan(100);
    expect(() => new Function(code)).not.toThrow();
  });

  it("says no free plots were listed, and still shows the map and who to ask", async () => {
    await garden.must([offerB03()], GARDEN_ON);
    await garden.must([gardenSettings({ listed: [gplotId("B03")] })]);
    const html = page();
    expect(html).toContain(AVAILABILITY_WORDS.noPlots);
    expect(html).toContain("<svg");
    expect(html).toContain(GARDEN_INSTRUCTIONS);
  });

  it("needs every word, and holds no canary or private ID in its bytes", () => {
    const { pageTitle: _drop, ...partial } = AVAILABILITY_WORDS;
    expect(() => buildAvailabilityHtml(gbuilt().file, partial as unknown as typeof AVAILABILITY_WORDS)).toThrow(/pageTitle/);
    expect(AVAILABILITY_WORD_KEYS).toHaveLength(Object.keys(AVAILABILITY_WORDS).length);
    const html = page();
    expect(scanForCanaries(html, AVAILABILITY_CANARIES)).toEqual([]);
    for (const secret of [garden.site.id, "TB-T2", "TB-T1", ...Object.keys(garden.state.core.plots)]) expect(html).not.toContain(secret);
  });

  it("names the download with its kind and date and no private value (A6.7)", () => {
    expect(availabilityFileName("2026-04-20")).toBe("availability-map-2026-04-20.html");
    expect(() => availabilityFileName("Tavi Bramblequill")).toThrow();
  });

  it("adds only a class that no rule hides, so the root element stays shown", () => {
    const html = page();
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    const added = [...script.matchAll(/className\+='\s*([\w-]+)'/g)].map((m) => m[1] as string);
    expect(added.length).toBeGreaterThan(0);
    for (const name of added) expect(css, name).not.toMatch(new RegExp(`(^|[},])\\s*\\.${name}\\s*\\{[^}]*display\\s*:\\s*none`));
  });
});

describe("T22 the availability print is its own document (A6.8)", () => {
  beforeEach(async () => {
    garden = await GardenEnv.create();
    await buildThimble(garden, { geometry: true });
    await garden.must([gardenSettings()]);
  });
  const A4P = { paper: "A4", orientation: "portrait" } as const;

  it("is built from the visitor object alone: plots, sections, entrance, how to ask and date, no script", () => {
    const html = buildAvailabilityPrint(gbuilt().file, AVAILABILITY_WORDS, A4P);
    for (const word of ["Thimble Beds", "B03", "B05", SUNNY, "Thimble Gate", GARDEN_INSTRUCTIONS, "As at 2026-04-20", AVAILABILITY_WORDS.availablePlots, AVAILABILITY_WORDS.askSecretary]) {
      expect(html).toContain(word);
    }
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("<svg");
    expect(scanForCanaries(html, AVAILABILITY_CANARIES)).toEqual([]);
  });

  it("sets the page size for A4 and Letter, portrait and landscape", () => {
    const file = gbuilt().file;
    expect(buildAvailabilityPrint(file, AVAILABILITY_WORDS, { paper: "A4", orientation: "portrait" })).toContain("@page{size:A4 portrait;margin:12mm}");
    expect(buildAvailabilityPrint(file, AVAILABILITY_WORDS, { paper: "Letter", orientation: "landscape" })).toContain("@page{size:Letter landscape;margin:12mm}");
  });

  it("is legible in grayscale: every colour is a gray", () => {
    const html = buildAvailabilityPrint(gbuilt().file, AVAILABILITY_WORDS, A4P);
    for (const m of html.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
      const hex = (m[1] as string).length === 3 ? [...(m[1] as string)].map((c) => c + c).join("") : (m[1] as string);
      expect(hex.slice(0, 2), m[0]).toBe(hex.slice(2, 4));
      expect(hex.slice(2, 4), m[0]).toBe(hex.slice(4, 6));
    }
  });

  it("says no free plots were listed, and escapes hostile words", async () => {
    await garden.must([gardenSettings({ listed: [] })]);
    const empty = buildAvailabilityPrint(gbuilt().file, AVAILABILITY_WORDS, A4P);
    expect(empty).toContain(AVAILABILITY_WORDS.noPlots);
    const base = gbuilt().file;
    const html = buildAvailabilityPrint({ ...base, instructions: "<b>x</b> & y" }, AVAILABILITY_WORDS, A4P);
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt; &amp; y");
  });

  it("splits a dense map into an overview with a section index and one numbered sheet per section", () => {
    const dense = (plots: number, sections: number): AvailabilityFile => ({
      format: "plot.availability.v1",
      asOf: GARDEN_ON,
      siteTitle: "Dense Beds",
      north: 0,
      gate: { name: "South Gate", x: 500, y: 500 },
      paths: [{ name: "Main Walk", points: [[500, 500], [9000, 500]] }],
      sections: Array.from({ length: sections }, (_, s) => ({ id: `s${s + 1}`, label: `Row ${s + 1}` })),
      freePlots: Array.from({ length: plots }, (_, i) => ({
        id: `p${i + 1}`,
        code: `Z${String(i + 1).padStart(3, "0")}`,
        sectionId: `s${(i % sections) + 1}`,
        outline: [[1000 + (i % 10) * 800, 1000 + Math.floor(i / 10) * 900], [1600 + (i % 10) * 800, 1000 + Math.floor(i / 10) * 900], [1600 + (i % 10) * 800, 1700 + Math.floor(i / 10) * 900], [1000 + (i % 10) * 800, 1700 + Math.floor(i / 10) * 900]] as [number, number][],
      })),
      neutralGround: [],
      instructions: "Ask at the hut.",
    });
    const big = buildAvailabilityPrint(dense(DENSE_PLOT_LIMIT + 4, 3), AVAILABILITY_WORDS, A4P);
    expect(big).toContain('data-sheet="overview"');
    expect(big.match(/data-sheet="section"/g)).toHaveLength(3);
    expect(big).toContain("Sheet 1 of 3");
    const small = buildAvailabilityPrint(dense(DENSE_PLOT_LIMIT, 3), AVAILABILITY_WORDS, A4P);
    expect(small).toContain('data-sheet="overview"');
    expect(small).not.toContain('data-sheet="section"');
  });
});

// ---------------------------------------------------------------------------------------------------------
// Task 10, the family map shows the way (spec 03, C5.10 to C5.12). Expected values are worked by hand from the
// Yew Walk layout: Y01 to Y06 south of the walk, Y07 to Y12 north of it, each 900 wide and 1100 tall, 1100 apart.
// ---------------------------------------------------------------------------------------------------------
import { familyMapSvg, WALK_BAND } from "../../template/src/output/familyMap";
import { buildFamilyPrint } from "../../template/src/output/print";
import { boxOf, distanceToLine } from "../../template/src/map/labels";
import type { Box } from "../../template/src/map/labels";

const footprintOf = (index: number): [number, number][] => {
  const x = 1000 + (index % 6) * 1100;
  const y = index >= 6 ? 2900 : 1200;
  return [[x, y], [x + 900, y], [x + 900, y + 1100], [x, y + 1100]];
};
/** The footprints of Y01 to Y12 except the listed codes, south row first, west to east in each row. */
const handOutlines = (...except: string[]): [number, number][][] =>
  Array.from({ length: 12 }, (_, i) => ({ code: `Y${String(i + 1).padStart(2, "0")}`, shape: footprintOf(i) }))
    .filter((p) => !except.includes(p.code))
    .map((p) => p.shape);

const MIREL_LINE = "Seventh stone along the walk, on the north side.";
const CORWIN_LINE = "Past the yew, the ninth stone from the gate.";
const withLine = (ref: string, line?: string): ChurchCommand => ({ type: "approve_burial", burialId: id(`burial:${ref}`), includeYear: false, ...(line === undefined ? {} : { line }) });

describe("T22 plain outlines of the other plots (C5.10)", () => {
  it("holds 11 plain outlines and 1 coded plot in Lantern Fold, with the option on", async () => {
    await env.must([settings({ outlines: true })]);
    const { file } = built();
    expect(file.plots).toHaveLength(1);
    expect(file.plots[0]?.code).toBe("Y07");
    expect(file.outlines).toHaveLength(11);
    expect(file.outlines).toEqual(handOutlines("Y07"));
    expect(parseFamily(file).ok).toBe(true);
  });

  it("holds none when the option is off, and a new register has it off", async () => {
    expect(env.state.pub.outlines).toBeUndefined();
    expect("outlines" in built().file).toBe(false);
    await env.must([settings({ outlines: true })]);
    expect(built().file.outlines).toHaveLength(11);
    await env.must([settings({ outlines: false })]);
    expect("outlines" in built().file).toBe(false);
  });

  it("gives a footprint and nothing else: no code, no state, no id, no count of burials, no private canary", async () => {
    await env.must([settings({ outlines: true })]);
    const { file } = built();
    for (const outline of file.outlines ?? []) {
      expect(Array.isArray(outline)).toBe(true);
      for (const point of outline) expect(point.every((n) => typeof n === "number")).toBe(true);
    }
    const text = JSON.stringify(file.outlines);
    expect(text).toMatch(/^[\d,[\]]+$/);
    for (const code of ["Y01", "Y02", "Y09", "Y12"]) expect(JSON.stringify(file)).not.toContain(code);
    expect(scanForCanaries(file, VISITOR_CANARIES)).toEqual([]);
    expect(JSON.stringify(file)).not.toContain("Hollowmere");
  });

  it("does not change with a burial in another plot, a reservation or an unusable plot, so it shows no count", async () => {
    await env.must([settings({ outlines: true })]);
    const before = JSON.stringify(built().file.outlines);
    await env.must([
      { type: "record_burial", burialId: id("burial:LF-NEW"), sourceRef: "LF-NEW", recordedName: "Test Person", date: { p: "year", y: 1900 }, dateText: "1900", plotId: plotId("Y10"), spaceId: spaceId("Y10"), claimId: id("claim:LF-NEW") },
    ]);
    expect(JSON.stringify(built().file.outlines)).toBe(before);
  });

  it("leaves a plot out of the list when it is in the file as a coded plot", async () => {
    await env.must([settings({ outlines: true }), approve("LF-09")]);
    const { file } = built();
    expect(file.plots.map((p) => p.code)).toEqual(["Y07", "Y09"]);
    expect(file.outlines).toEqual(handOutlines("Y07", "Y09"));
  });

  it("is in the same order whatever the plot codes are", async () => {
    await env.must([settings({ outlines: true, plotCodes: { [plotId("Y07")]: "Seven" } })]);
    expect(built().file.outlines).toEqual(handOutlines("Y07"));
  });

  it("is carried in the page and in the print, drawn as plain outlines with no word", async () => {
    await env.must([settings({ outlines: true })]);
    const { file } = built();
    const html = buildFamilyHtml(file, FAMILY_WORDS);
    expect(html.match(/<polygon class="outline"/g)).toHaveLength(11);
    const print = buildFamilyPrint(file, FAMILY_WORDS, { paper: "A4", orientation: "portrait" });
    expect(print.match(/<polygon class="outline"/g)).toHaveLength(11);
    expect(JSON.parse(/<script type="application\/json" id="plot-family">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "").outlines).toEqual(file.outlines);
  });

  it("prints in grays: the outline stroke is a gray in the page print rules", async () => {
    await env.must([settings({ outlines: true })]);
    const rules = printRules(buildFamilyHtml(built().file, FAMILY_WORDS));
    expect(rules).toMatch(new RegExp(`\\.outline\\{stroke:${GRAY}`, "i"));
  });

  it("refuses an outline list that is not a list of points, and any extra key inside", () => {
    const file = built().file;
    expect(parseFamily({ ...file, outlines: [[[1, 2], [3, 4], [5, 6]]] }).ok).toBe(true);
    expect(parseFamily({ ...file, outlines: [[[1, 2], [3, 4]]] }).ok).toBe(false);
    expect(parseFamily({ ...file, outlines: [{ code: "Y01", points: [[1, 2], [3, 4], [5, 6]] }] }).ok).toBe(false);
    expect(parseFamily({ ...file, outlines: [[[1, 2], [3, 4], [5, "6"]]] }).ok).toBe(false);
  });
});

describe("T22 directions are two fields: one way in, and one line for each burial (C5.11)", () => {
  it("gives each approved burial its own line and the one way in", async () => {
    await env.must([withLine("LF-07A", MIREL_LINE), withLine("LF-09", CORWIN_LINE)]);
    const { file } = built();
    const mirel = file.burials.find((b) => b.name === APPROVED_NAME);
    const corwin = file.burials.find((b) => b.name === "Corwin Aldersey");
    expect(mirel?.line).toBe(MIREL_LINE);
    expect(corwin?.line).toBe(CORWIN_LINE);
    expect(mirel?.directions).toBe(DIRECTIONS);
    expect(corwin?.directions).toBe(DIRECTIONS);
    expect(Object.keys(mirel ?? {}).sort()).toEqual(["directions", "id", "line", "name", "plotId"]);
    expect(file.plots).toHaveLength(2);
    expect(mirel?.plotId).not.toBe(corwin?.plotId);
    expect(parseFamily(file).ok).toBe(true);
  });

  it("leaves the line out of a burial that has none, and out of the whole file by default", () => {
    expect(Object.keys(built().file.burials[0] ?? {}).sort()).toEqual(["directions", "id", "name", "plotId"]);
  });

  it("shows a burial its own line and never another burial's line, in the page and in the print", async () => {
    await env.must([withLine("LF-07A", MIREL_LINE), withLine("LF-09", CORWIN_LINE)]);
    const { file } = built();
    const html = buildFamilyHtml(file, FAMILY_WORDS);
    const items = [...html.matchAll(/<li data-plot="[^"]*"[\s\S]*?<\/li>/g)].map((m) => m[0]);
    expect(items).toHaveLength(2);
    const mirel = items.find((i) => i.includes(APPROVED_NAME)) ?? "";
    const corwin = items.find((i) => i.includes("Corwin Aldersey")) ?? "";
    expect(mirel).toContain(MIREL_LINE);
    expect(mirel).not.toContain(CORWIN_LINE);
    expect(corwin).toContain(CORWIN_LINE);
    expect(corwin).not.toContain(MIREL_LINE);
    // The way in stands once, in the entrance, and holds neither line.
    const entrance = /<section aria-labelledby="entrance-heading">([\s\S]*?)<\/section>/.exec(html)?.[1] ?? "";
    expect(entrance).toContain(DIRECTIONS);
    expect(entrance).not.toContain(MIREL_LINE);
    expect(entrance).not.toContain(CORWIN_LINE);

    const print = buildFamilyPrint(file, FAMILY_WORDS, { paper: "A4", orientation: "portrait" });
    const rows = [...print.matchAll(/<tr><td>[\s\S]*?<\/tr>/g)].map((m) => m[0]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.includes(APPROVED_NAME))).toContain(MIREL_LINE);
    expect(rows.find((r) => r.includes(APPROVED_NAME))).not.toContain(CORWIN_LINE);
    expect(rows.find((r) => r.includes("Corwin"))).toContain(CORWIN_LINE);
    expect(rows.find((r) => r.includes("Corwin"))).not.toContain(MIREL_LINE);
  });

  it("keeps the approval when only the line changes, and drops the line with the approval", async () => {
    await env.must([withLine("LF-07A", MIREL_LINE)]);
    expect(built().file.burials[0]?.line).toBe(MIREL_LINE);
    await env.must([withLine("LF-07A", "Look for the old yew.")]);
    expect(built().file.burials[0]?.line).toBe("Look for the old yew.");
    await env.must([withLine("LF-07A")]);
    expect("line" in (built().file.burials[0] ?? {})).toBe(false);
    await env.must([{ type: "withdraw_approval", burialId: MIREL }]);
    expect(built().file.burials).toEqual([]);
  });

  it("flags a line that holds a living name or a contact, and builds no file", async () => {
    for (const line of [`Ask ${LIVING_HOLDERS[0]} at the gate`, `Ring ${CONTACT}`, `Look for the stone of ${OTHER_OCCUPANT}`]) {
      await env.must([withLine("LF-07A", line)]);
      const out = build();
      expect(out.ok, line).toBe(false);
      if (!out.ok) expect(out.flagged.map((f) => f.field), line).toEqual(["lines"]);
    }
  });

  it("refuses a line that is too long, and names the field", async () => {
    const out = await env.dispatch([withLine("LF-07A", "x".repeat(4001))]);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(JSON.stringify(out.error)).toContain("line");
  });

  it("refuses a line key that is not text, or an empty line", () => {
    const file = built().file;
    const burial = file.burials[0] as FamilyFile["burials"][number];
    expect(parseFamily({ ...file, burials: [{ ...burial, line: "" }] }).ok).toBe(false);
    expect(parseFamily({ ...file, burials: [{ ...burial, line: 7 }] }).ok).toBe(false);
    expect(parseFamily({ ...file, burials: [{ ...burial, line: "A line." }] }).ok).toBe(true);
  });
});

// ---- The drawn map (C5.12) ------------------------------------------------------------------------------

interface DrawnText {
  text: string;
  tab: boolean;
  box: Box;
}

/** The drawing of a page or a print, read back as plain data. Independent of the code that drew it. */
function readDrawing(html: string, which = 0): { texts: DrawnText[]; walks: [number, number][][]; plotBoxes: Box[]; size: { width: number; height: number } } {
  const svg = [...html.matchAll(/<svg class="map"[\s\S]*?<\/svg>/g)][which]?.[0] ?? "";
  expect(svg, "the page holds a drawing").not.toBe("");
  const view = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const attr = (tag: string, name: string): string => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? "";
  const texts = [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map((m) => {
    const tag = m[1] ?? "";
    const anchor = attr(tag, "text-anchor") === "" ? "start" : (attr(tag, "text-anchor") as "start" | "middle" | "end");
    const size = Number(attr(tag, "font-size") || 12);
    const content = (m[2] ?? "").replace(/&amp;/g, "&");
    return { text: content, tab: /class="tab-text"/.test(tag), box: boxOf(content, size, { x: Number(attr(tag, "x")), y: Number(attr(tag, "y")), anchor }) };
  });
  const points = (value: string): [number, number][] => value.trim().split(/\s+/).map((pair) => pair.split(",").map(Number) as [number, number]);
  const walks = [...svg.matchAll(/<polyline class="walk" points="([^"]*)"/g)].map((m) => points(m[1] ?? ""));
  const plotBoxes: Box[] = [];
  const boxOfPoints = (list: [number, number][]): Box => ({ x0: Math.min(...list.map((p) => p[0])), y0: Math.min(...list.map((p) => p[1])), x1: Math.max(...list.map((p) => p[0])), y1: Math.max(...list.map((p) => p[1])) });
  for (const m of svg.matchAll(/<polygon class="outline" points="([^"]*)"/g)) plotBoxes.push(boxOfPoints(points(m[1] ?? "")));
  for (const m of svg.matchAll(/<path class="arch" d="M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)A([\d.-]+) [\d.-]+ 0 0 1 ([\d.-]+) [\d.-]+L/g)) {
    const [x0, y1, , yArc, r, x1] = m.slice(1).map(Number) as [number, number, number, number, number, number];
    plotBoxes.push({ x0, y0: (yArc as number) - r, x1, y1 });
  }
  return { texts, walks, plotBoxes, size: { width: Number(view?.[1]), height: Number(view?.[2]) } };
}

const overlap = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Every way a text of the drawing can lie on something it should keep off. Empty when the drawing is clear. */
function labelFaults(html: string, which = 0): string[] {
  const { texts, walks, plotBoxes, size } = readDrawing(html, which);
  const faults: string[] = [];
  for (const t of texts) {
    for (const walk of walks) if (distanceToLine(t.box, walk) < WALK_BAND / 2) faults.push(`"${t.text}" lies on a walk`);
    for (const plot of plotBoxes) if (overlap(t.box, plot)) faults.push(`"${t.text}" lies on a plot`);
    if (t.box.x0 < 0 || t.box.y0 < 0 || t.box.x1 > size.width || t.box.y1 > size.height) faults.push(`"${t.text}" leaves the drawing`);
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (overlap((texts[i] as DrawnText).box, (texts[j] as DrawnText).box)) faults.push(`"${(texts[i] as DrawnText).text}" lies on "${(texts[j] as DrawnText).text}"`);
    }
  }
  return faults;
}

describe("T22 the drawn map keeps every code and name off the walk, the plots and each other (C5.12)", () => {
  const SOUTH_AND_NORTH = ["LF-01", "LF-04", "LF-06", "LF-09"];

  it("the checker sees a name lying on a walk, a plot and another name", () => {
    expect(WALK_BAND).toBe(12);
    const svg = (...parts: string[]) => `<svg class="map" viewBox="0 0 200 100">${parts.join("")}</svg>`;
    const walk = `<polyline class="walk" points="10,50 190,50"/>`;
    expect(labelFaults(svg(walk, `<text x="100" y="54" font-size="12" text-anchor="middle">Yew Walk</text>`))).toEqual([`"Yew Walk" lies on a walk`]);
    expect(labelFaults(svg(`<polygon class="outline" points="60,10 140,10 140,40 60,40"/>`, `<text x="100" y="30" font-size="12" text-anchor="middle">Y07</text>`))).toEqual([`"Y07" lies on a plot`]);
    expect(labelFaults(svg(`<text x="20" y="20" font-size="12">Gate</text>`, `<text x="30" y="22" font-size="12">Walk</text>`))).toEqual([`"Gate" lies on "Walk"`]);
    expect(labelFaults(svg(walk, `<text x="100" y="20" font-size="12" text-anchor="middle">Clear</text>`))).toEqual([]);
  });

  it("holds for the page of Lantern Fold, with outlines, and no text box lies over the walk band", async () => {
    await env.must([settings({ outlines: true })]);
    const html = buildFamilyHtml(built().file, FAMILY_WORDS);
    const { texts, walks } = readDrawing(html);
    expect(walks).toHaveLength(1);
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(distanceToLine(t.box, walks[0] as [number, number][]), t.text).toBeGreaterThanOrEqual(WALK_BAND / 2);
    expect(labelFaults(html)).toEqual([]);
  });

  it("holds with plots north and south of the walk, with outlines on and off", async () => {
    for (const outlines of [true, false]) {
      await env.must([settings({ outlines }), ...SOUTH_AND_NORTH.map((ref) => withLine(ref))]);
      const file = built().file;
      expect(file.plots.length).toBe(5);
      expect(labelFaults(buildFamilyHtml(file, FAMILY_WORDS)), `page, outlines ${outlines}`).toEqual([]);
      expect(labelFaults(buildFamilyPrint(file, FAMILY_WORDS, { paper: "A4", orientation: "portrait" })), `print, outlines ${outlines}`).toEqual([]);
    }
  });

  it("holds with the gate and path names that are longer, and with a site with no outline", async () => {
    await env.must([settings({ outlines: true, gateName: "The old lych gate by the yew", pathNames: { [WALK_PATH_ID]: "The long gravel walk to the east" } })]);
    expect(labelFaults(buildFamilyHtml(built().file, FAMILY_WORDS))).toEqual([]);
  });

  it("writes a plot code on its tab only, never beside the plot", async () => {
    await env.must([settings({ outlines: true }), ...SOUTH_AND_NORTH.map((ref) => withLine(ref))]);
    const html = buildFamilyHtml(built().file, FAMILY_WORDS);
    const { texts } = readDrawing(html);
    const codes = new Set(built().file.plots.map((p) => p.code));
    const written = texts.filter((t) => codes.has(t.text));
    expect(written.length).toBe(codes.size);
    for (const t of written) expect(t.tab, `${t.text} is on a tab`).toBe(true);
    expect(texts.filter((t) => !t.tab).map((t) => t.text).sort()).toEqual(["Lantern Gate", "N", "Yew Walk"]);
  });

  it("draws the tab of the selected plot alone, and of every plot for a print of the whole map", async () => {
    await env.must([settings({ outlines: true }), withLine("LF-09")]);
    const file = built().file;
    const tabsIn = (svg: string): string[] => [...svg.matchAll(/<text class="tab-text"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1] as string);
    const one = familyMapSvg(file, { width: 320, label: "Map", selectedPlotId: file.plots[0]?.id });
    expect(tabsIn(one)).toEqual(["Y07"]);
    expect(tabsIn(familyMapSvg(file, { width: 320, label: "Map" }))).toEqual([]);
    expect(tabsIn(familyMapSvg(file, { width: 320, label: "Map", allTabs: true })).sort()).toEqual(["Y07", "Y09"]);
  });

  it("writes a name with no clear place under the drawing, beside a sample of its mark", async () => {
    await env.must([settings({ outlines: true })]);
    const svg = familyMapSvg(built().file, { width: 320, label: "Map" });
    expect(svg).toContain(`<rect class="gate-sample"`);
    expect(svg).toContain(`<polyline class="walk-sample"`);
    const { texts, size } = readDrawing(svg.startsWith("<svg") ? svg : "");
    const gate = texts.find((t) => t.text === "Lantern Gate");
    expect(gate).toBeDefined();
    expect(gate?.box.y1 ?? 0).toBeLessThanOrEqual(size.height);
  });

  it("is in grays in the print and shows one location with its gate, walk, outlines, selected plot and tab", async () => {
    await env.must([settings({ outlines: true })]);
    const html = buildFamilyHtml(built().file, FAMILY_WORDS);
    const rules = printRules(html);
    expect(rules).toContain("body.only-selected");
    expect(rules).toMatch(/\.plotg:not\(\.on\)/);
    expect(rules).toMatch(new RegExp(`\\.tab\\{fill:${GRAY}`, "i"));
    expect(rules).toMatch(new RegExp(`\\.walk\\{stroke:${GRAY}`, "i"));
    expect(html).toContain("only-selected");
    expect(html).toContain("all-tabs");
  });

  it("shows every tab with script off, and none until a plot is chosen with script on", () => {
    const css = /<style>([\s\S]*?)<\/style>/.exec(buildFamilyHtml(built().file, FAMILY_WORDS))?.[1] ?? "";
    expect(css).toMatch(/html\.has-script \.selbits\{display:none\}/);
    expect(css).toMatch(/html\.has-script \.plotg\.on \.selbits\{display:inline\}/);
    expect(css).not.toMatch(/(^|\})\.selbits\{display:none\}/);
  });
});
