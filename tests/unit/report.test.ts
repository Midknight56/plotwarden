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
import { reportCsv, reportTable, seasonReport } from "../../apps/allotment-register/src/fees";
import { GardenEnv, id as gid } from "../helpers/gardenEnv";
import { SEASON_2025, SEASON_2026, app as gapp, buildThimble, chargeId, claim as gclaim, person as gperson, tenancy as gtenancy } from "../helpers/thimbleBeds";

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

describe("T23 the season report (spec 04, A5, hand totals 5.4)", () => {
  // The words are keys here, so the numbers are what is tested. The copy test checks the real words.
  const say = (key: string, values?: Record<string, string | number>): string =>
    values === undefined ? key : `${key}(${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(",")})`;
  const OFFER = gid("offer:b03");
  const B03 = chargeId("B03:2026");
  let garden: GardenEnv;

  /** Hand totals 2.2, 2.3 and 2.5: the B03 offer, Season 2026, two receipts and the B02 handover. */
  async function gardenYear(): Promise<void> {
    garden = await GardenEnv.create();
    await buildThimble(garden);
    await garden.must([{ type: "make_offer", offerId: OFFER, applicationId: gapp("tavi"), spaceId: gid("space:B03:1"), claimId: gclaim("hold:b03"), replyBy: "2026-04-18" }], "2026-04-04");
    await garden.must([{ type: "accept_offer", offerId: OFFER, tenancyId: gtenancy("B03"), claimId: gclaim("tenancy:B03") }], "2026-04-10");
    await garden.must([{ type: "new_season", ...SEASON_2026 }], "2026-04-01");
    await garden.must([{ type: "apply_charges", seasonId: SEASON_2026.seasonId, items: [{ chargeId: B03, tenancyId: gtenancy("B03") }] }], "2026-04-10");
    await garden.must([{ type: "record_receipt", receiptId: gid("receipt:one"), chargeId: B03, amount: 1200, ref: "TB-RCPT-1" }], "2026-05-02");
    await garden.must([{ type: "record_receipt", receiptId: gid("receipt:two"), chargeId: B03, amount: 2400 }], "2026-06-01");
    await garden.must(
      [{ type: "hand_over", tenancyId: gtenancy("B02"), newTenancyId: gid("tenancy:B02:new"), claimId: gclaim("tenancy:B02:new"), personId: gperson("Hale Pennywort"), holderName: "Hale Pennywort" }],
      "2026-05-01",
    );
  }

  const report = (seasonId: string, asOf: string) => seasonReport(garden.state, { seasonId, asOf, revision: garden.revision });

  it("Season 2026 as at 2026-05-02 has one row: 3600 charged, 1200 received, 2400 due", async () => {
    await gardenYear();
    const r = report(SEASON_2026.seasonId, "2026-05-02");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ plotCode: "B03", holder: "Tavi Bramblequill", charged: 3600, received: 1200, reversed: 0, balance: 2400, status: "part_paid" });
    expect(r.totals).toEqual({ charged: 3600, received: 1200, balanceDue: 2400 });
    expect(r.empty).toBe(false);
    expect(r).toMatchObject({ basis: "current_corrections", asOf: "2026-05-02", currency: "GBP" });
  });

  it("Season 2026 as at 2026-06-30 has both receipts and nothing due", async () => {
    await gardenYear();
    const r = report(SEASON_2026.seasonId, "2026-06-30");
    expect(r.rows[0]).toMatchObject({ received: 3600, balance: 0, status: "paid" });
    expect(r.totals).toEqual({ charged: 3600, received: 3600, balanceDue: 0 });
  });

  it("counts a reversed receipt net, and shows the reversal beside it", async () => {
    await gardenYear();
    await garden.must([{ type: "reverse_entry", reversalId: gid("rev:one"), entryId: gid("receipt:one"), reason: "Entered on the wrong plot" }], "2026-07-01");
    const r = report(SEASON_2026.seasonId, "2026-07-01");
    expect(r.rows[0]).toMatchObject({ charged: 3600, received: 3600, reversed: 1200, balance: 1200 });
    expect(r.totals).toEqual({ charged: 3600, received: 2400, balanceDue: 1200 });
    // As at a date before the reversal, the report is as it was.
    expect(report(SEASON_2026.seasonId, "2026-06-30").totals).toEqual({ charged: 3600, received: 3600, balanceDue: 0 });
  });

  it("opens Season 2025 with the holder of that time, not today's holder, and the old balance of 3000", async () => {
    await gardenYear();
    const r = report(SEASON_2025.seasonId, "2026-05-02");
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ plotCode: "B02", holder: "Ada Stonecrop", charged: 3000, received: 0, balance: 3000, status: "overdue" });
    expect(r.totals).toEqual({ charged: 3000, received: 0, balanceDue: 3000 });
  });

  it("counts nothing twice through a change of holder: two seasons and a handover add up to every charge", async () => {
    await gardenYear();
    await garden.must([{ type: "apply_charges", seasonId: SEASON_2026.seasonId, items: [{ chargeId: chargeId("B02:new"), tenancyId: gid("tenancy:B02:new") }] }], "2026-05-02");
    const s26 = report(SEASON_2026.seasonId, "2026-05-02");
    const s25 = report(SEASON_2025.seasonId, "2026-05-02");
    expect(s26.rows.map((x) => [x.plotCode, x.holder])).toEqual([["B02", "Hale Pennywort"], ["B03", "Tavi Bramblequill"]]);
    expect(s26.totals.charged + s25.totals.charged).toBe(Object.values(garden.state.ledger).filter((e) => e.type === "charge").reduce((n, e) => n + e.minorUnits, 0));
    expect(s26.totals).toEqual({ charged: 7200, received: 1200, balanceDue: 6000 });
  });

  it("lists the plot handovers up to the date, and the waiting list as it stood", async () => {
    await gardenYear();
    expect(report(SEASON_2026.seasonId, "2026-05-02").handovers).toEqual([{ plotCode: "B02", on: "2026-05-01", from: "Ada Stonecrop", to: "Hale Pennywort" }]);
    expect(report(SEASON_2026.seasonId, "2026-04-30").handovers).toEqual([]);
    expect(report(SEASON_2026.seasonId, "2026-05-02").waiting).toEqual([{ position: 1, name: "Olin Reedwhorl", joinedOn: "2026-01-10", pending: false }]);
    expect(report(SEASON_2026.seasonId, "2026-04-05").waiting.map((w) => [w.position, w.name, w.pending])).toEqual([
      [1, "Tavi Bramblequill", true],
      [2, "Olin Reedwhorl", false],
    ]);
    expect(report(SEASON_2026.seasonId, "2026-01-09").waiting).toEqual([]);
  });

  it("says there are no charges for a season that has none", async () => {
    garden = await GardenEnv.create();
    await buildThimble(garden);
    await garden.must([{ type: "new_season", ...SEASON_2026 }], "2026-04-01");
    const r = report(SEASON_2026.seasonId, "2026-04-20");
    expect(r.empty).toBe(true);
    expect(r.rows).toEqual([]);
    expect(r.totals).toEqual({ charged: 0, received: 0, balanceDue: 0 });
    expect(reportTable(garden.state, r, say).sections[0]?.emptyText).toBe("noChargesInSeason");
  });

  it("makes a table with the scope, the totals in the currency, and the three parts", async () => {
    await gardenYear();
    const table = reportTable(garden.state, report(SEASON_2026.seasonId, "2026-05-02"), say);
    expect(table.title).toBe("seasonReport");
    expect(table.subtitle).toBe("privateRegisterReport");
    expect(table.scope).toEqual(["seasonLine(season=Season 2026)", "reportAsAtLine(date=2026-05-02)", `reportBasis(date=2026-05-02,revision=${garden.revision})`]);
    expect(table.totals).toEqual([
      { label: "feesCharged", value: "GBP 36.00" },
      { label: "feesReceived", value: "GBP 12.00" },
      { label: "balanceDue", value: "GBP 24.00" },
    ]);
    expect(table.sections.map((s) => s.heading)).toEqual(["seasonFees", "plotHandovers", "waitingListOrder"]);
    expect(table.sections[0]?.rows).toEqual([["B03", "Tavi Bramblequill", "GBP 36.00", "GBP 12.00", "GBP 0.00", "GBP 24.00", "feePartPaid"]]);
    expect(table.sections[1]?.rows).toEqual([["B02", "2026-05-01", "Ada Stonecrop", "Hale Pennywort"]]);
    expect(table.sections[2]?.rows).toEqual([["1", "Olin Reedwhorl", "2026-01-10"]]);
    expect(table.footer).toBe("reportPrivateFooter");
  });

  it("prints with repeated headings and no script, from the table alone", async () => {
    await gardenYear();
    const html = buildReportPrint(reportTable(garden.state, report(SEASON_2026.seasonId, "2026-05-02"), say), A4);
    expect(html).toContain("<thead>");
    expect(html).toContain("<h1>seasonReport</h1>");
    expect(html).toContain("Tavi Bramblequill");
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("break-inside:avoid");
  });

  it("writes a CSV with the byte order mark, a heading row, a row for each part, and escapes a formula", async () => {
    await gardenYear();
    await garden.must([{ type: "end_tenancy", tenancyId: gtenancy("B01") }], "2026-05-03");
    await garden.must([{ type: "record_tenancy", tenancyId: gid("tenancy:B01:2"), claimId: gclaim("tenancy:B01:2"), personId: gid("person:formula"), holderName: "=HYPERLINK(\"x\")", spaceId: gid("space:B01:1"), start: "2026-05-03", sourceRef: "TB-F" }]);
    await garden.must([{ type: "apply_charges", seasonId: SEASON_2026.seasonId, items: [{ chargeId: chargeId("B01:f"), tenancyId: gid("tenancy:B01:2") }] }], "2026-05-03");
    const csv = reportCsv(garden.state, report(SEASON_2026.seasonId, "2026-05-03"), say);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe("partHeading,plotLabel,holderHeading,amountCharged,amountReceived,reversedHeading,stillDue,statusHeading,dateHeading,detailHeading");
    expect(lines).toHaveLength(1 + 2 + 1 + 1);
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csv).not.toMatch(/,=HYPERLINK/);
    expect(lines[1]).toContain("GBP 36.00");
  });

  it("is built the same after a reload", async () => {
    await gardenYear();
    const again = seasonReport(await garden.reload(), { seasonId: SEASON_2026.seasonId, asOf: "2026-05-02", revision: garden.revision });
    expect(again).toEqual(report(SEASON_2026.seasonId, "2026-05-02"));
  });
});
