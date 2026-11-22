// T22 visitor projections, family part (spec 03, C4 and C5). The family file holds only what the keeper
// approved. Expected values come from hand-totals.md sections 1 and 4. The availability part comes with spec 04.
import { beforeEach, describe, expect, it } from "vitest";
import { parseFamily, scanForCanaries } from "../../template/src/output/privacy";
import type { FamilyFile } from "../../template/src/output/privacy";
import { buildFamilyFile, isStalePreview } from "../../apps/churchyard-register/src/projection";
import type { ChurchCommand } from "../../apps/churchyard-register/src/types";
import { APPROVED_NAME, CONTACT, LIVING_HOLDERS, OTHER_OCCUPANT, VISITOR_CANARIES } from "../helpers/privacyCanaries";
import { ChurchEnv, WALK_PATH_ID, id, plotId } from "../helpers/churchEnv";
import { buildFold } from "../helpers/lanternFold";

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
