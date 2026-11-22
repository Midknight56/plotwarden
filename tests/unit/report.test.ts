// T23 print documents and the private report (spec 03, C5.9 and C6). The family print is built from the
// visitor object alone, in its own document. The private report is a table model with repeated headings.
import { beforeEach, describe, expect, it } from "vitest";
import { scanForCanaries } from "../../template/src/output/privacy";
import type { FamilyFile } from "../../template/src/output/privacy";
import { DENSE_PLOT_LIMIT, buildFamilyPrint, buildReportPrint } from "../../template/src/output/print";
import type { PrintOptions, ReportTable } from "../../template/src/output/print";
import { buildFamilyFile } from "../../apps/churchyard-register/src/projection";
import { APPROVED_NAME, VISITOR_CANARIES } from "../helpers/privacyCanaries";
import { ChurchEnv, WALK_PATH_ID, id } from "../helpers/churchEnv";
import { FAMILY_WORDS } from "../helpers/familyWords";
import { buildFold } from "../helpers/lanternFold";

const DIRECTIONS = "Enter at Lantern Gate. Follow Yew Walk to row Y. Look for Y07.";
const A4: PrintOptions = { paper: "A4", orientation: "portrait" };

let file: FamilyFile;

beforeEach(async () => {
  const env = await ChurchEnv.create();
  await buildFold(env, { geometry: true });
  await env.must([
    { type: "set_public", siteName: "Lantern Fold", gateName: "Lantern Gate", directions: DIRECTIONS, sectionNames: { [id("section:Yew Walk")]: "Yew Walk" }, pathNames: { [WALK_PATH_ID]: "Yew Walk" } },
    { type: "approve_burial", burialId: id("burial:LF-07A"), includeYear: true },
  ]);
  let n = 0;
  const out = buildFamilyFile(env.state, { asOf: "2026-04-20", revision: env.revision, newPublicId: () => `q${++n}` });
  if (!out.ok) throw new Error("no family file");
  file = out.file;
});

/** Every colour in a document, as red, green and blue. */
function colours(html: string): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const m of html.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    const hex = m[1] as string;
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    out.push([parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]);
  }
  for (const m of html.matchAll(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/g)) out.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  return out;
}

function denseFile(plots: number, sections: number): FamilyFile {
  const sectionRows = Array.from({ length: sections }, (_, s) => ({ id: `s${s + 1}`, label: `Row ${s + 1}` }));
  const plotRows = Array.from({ length: plots }, (_, i) => ({
    id: `p${i + 1}`,
    code: `Z${String(i + 1).padStart(3, "0")}`,
    sectionId: `s${(i % sections) + 1}`,
    outline: [
      [1000 + (i % 10) * 800, 1000 + Math.floor(i / 10) * 900],
      [1600 + (i % 10) * 800, 1000 + Math.floor(i / 10) * 900],
      [1600 + (i % 10) * 800, 1700 + Math.floor(i / 10) * 900],
      [1000 + (i % 10) * 800, 1700 + Math.floor(i / 10) * 900],
    ] as [number, number][],
  }));
  return {
    format: "plot.family.v1",
    asOf: "2026-04-20",
    siteTitle: "Dense Yard",
    north: 0,
    gate: { name: "South Gate", x: 500, y: 500 },
    paths: [{ name: "Main Walk", points: [[500, 500], [9000, 500]] }],
    sections: sectionRows,
    plots: plotRows,
    burials: plotRows.slice(0, 5).map((p, i) => ({ id: `b${i + 1}`, name: `Person Number${i + 1}`, plotId: p.id })),
  };
}

describe("T23 the family print is its own document (C5.9)", () => {
  it("is built from the visitor object alone: the name, plot, entrance, directions and date, no script", () => {
    const html = buildFamilyPrint(file, FAMILY_WORDS, A4);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    for (const word of [APPROVED_NAME, "Y07", "Lantern Gate", DIRECTIONS, "As at 2026-04-20", "1889", "Yew Walk"]) expect(html).toContain(word);
    expect(html).not.toContain("<script");
    expect(scanForCanaries(html, VISITOR_CANARIES)).toEqual([]);
    expect(html).toContain("<svg");
  });

  it("sets the page size for A4 and Letter, portrait and landscape", () => {
    expect(buildFamilyPrint(file, FAMILY_WORDS, { paper: "A4", orientation: "portrait" })).toContain("@page{size:A4 portrait;");
    expect(buildFamilyPrint(file, FAMILY_WORDS, { paper: "A4", orientation: "landscape" })).toContain("@page{size:A4 landscape;");
    expect(buildFamilyPrint(file, FAMILY_WORDS, { paper: "Letter", orientation: "portrait" })).toContain("@page{size:Letter portrait;");
    expect(buildFamilyPrint(file, FAMILY_WORDS, { paper: "Letter", orientation: "landscape" })).toContain("@page{size:Letter landscape;");
  });

  it("is legible in grayscale: every colour is a gray, and every plot has its code in words", () => {
    const html = buildFamilyPrint(file, FAMILY_WORDS, A4);
    const all = colours(html);
    expect(all.length).toBeGreaterThan(2);
    for (const [r, g, b] of all) expect(r === g && g === b).toBe(true);
    expect(html).toMatch(/<text[^>]*>Y07<\/text>/);
  });

  it("escapes every private looking character in a name", () => {
    const hostile: FamilyFile = { ...file, burials: [{ ...(file.burials[0] as FamilyFile["burials"][number]), name: "<b>=A&B</b>" }] };
    const html = buildFamilyPrint(hostile, FAMILY_WORDS, A4);
    expect(html).toContain("&lt;b&gt;=A&amp;B&lt;/b&gt;");
    expect(html).not.toContain("<b>");
  });

  it("says no names were selected and still prints the map", () => {
    const html = buildFamilyPrint({ ...file, burials: [], plots: [] }, FAMILY_WORDS, A4);
    expect(html).toContain(FAMILY_WORDS.noNames);
    expect(html).toContain("Lantern Gate");
  });

  it("splits a dense map into an overview with a section index and one numbered sheet per section", () => {
    const dense = denseFile(DENSE_PLOT_LIMIT + 30, 3);
    const html = buildFamilyPrint(dense, FAMILY_WORDS, A4);
    expect(html.match(/data-sheet="overview"/g)).toHaveLength(1);
    expect(html.match(/data-sheet="section"/g)).toHaveLength(3);
    for (const label of ["Row 1", "Row 2", "Row 3"]) expect(html).toContain(label);
    expect(html).toMatch(/Sheet 1 of 3/);
    expect(html).toMatch(/Sheet 3 of 3/);
    expect(html).toContain("break-after:page");
  });

  it("keeps a map of 60 plots on one sheet", () => {
    const html = buildFamilyPrint(denseFile(DENSE_PLOT_LIMIT, 3), FAMILY_WORDS, A4);
    expect(html.match(/data-sheet="overview"/g)).toHaveLength(1);
    expect(html.match(/data-sheet="section"/g)).toBeNull();
  });
});

describe("T23 the private report print (C6.7)", () => {
  const table: ReportTable = {
    title: "Burial and reservation report",
    subtitle: "Private register report",
    scope: ["From 1880-01-01", "Through 1950-12-31", "As at 2026-04-20 · revision 12 · current corrections"],
    totals: [
      { label: "Burials", value: "4" },
      { label: "Date incomplete", value: "1" },
    ],
    sections: [
      { heading: "Burials", columns: ["Source ref", "Name", "Date"], rows: Array.from({ length: 80 }, (_, i) => [`LF-${i}`, i === 0 ? "<i>Edda</i> & Co" : `Name ${i}`, "1871"]), emptyText: "No events in this period." },
      { heading: "Reservations made", columns: ["Source ref", "Space"], rows: [], emptyText: "No events in this period." },
      { heading: "Location to confirm", columns: ["Source ref", "Name"], rows: [["LF-H1", "Perrin Gladwyn"]], emptyText: "None" },
    ],
    footer: "Private. Do not share.",
  };

  it("repeats the heading row on each page, never cuts a row in two and lists each part apart", () => {
    const html = buildReportPrint(table, A4);
    expect(html.match(/<thead>/g)).toHaveLength(2);
    expect(html).toContain("thead{display:table-header-group");
    expect(html).toContain("tr{break-inside:avoid");
    expect(html.indexOf("Burials")).toBeLessThan(html.indexOf("Reservations made"));
    expect(html.indexOf("Reservations made")).toBeLessThan(html.indexOf("Location to confirm"));
    for (const text of [table.title, table.subtitle, "Through 1950-12-31", "Date incomplete", table.footer]) expect(html).toContain(text);
    expect(html).toContain("@page{size:A4 portrait;");
  });

  it("says so when a part has no rows, escapes cells, and carries no script", () => {
    const html = buildReportPrint(table, { paper: "Letter", orientation: "landscape" });
    expect(html).toContain("No events in this period.");
    expect(html).toContain("&lt;i&gt;Edda&lt;/i&gt; &amp; Co");
    expect(html).not.toContain("<i>");
    expect(html).not.toContain("<script");
    expect(html).toContain("@page{size:Letter landscape;");
  });

  it("is legible in grayscale", () => {
    for (const [r, g, b] of colours(buildReportPrint(table, A4))) expect(r === g && g === b).toBe(true);
  });
});
