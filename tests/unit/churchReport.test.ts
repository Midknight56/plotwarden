// The private report as a table and as CSV (spec 03, task 3.10, T23 private part, C6).
// Expected numbers are from hand-totals.md section 4. A cell that starts like a formula is escaped.
import { beforeEach, describe, expect, it } from "vitest";
import { CHURCH_COPY } from "../../apps/churchyard-register/src/copy";
import { periodReport, reportCsv, reportTable } from "../../apps/churchyard-register/src/history";
import { COPY, fill } from "../../template/src/ui/copy";
import { ChurchEnv, id, layoutYewWalk, plotId, spaceId } from "../helpers/churchEnv";
import { buildFold } from "../helpers/lanternFold";

const say = (key: string, values?: Record<string, string | number>): string => fill({ ...COPY, ...CHURCH_COPY }[key] ?? key, values ?? {});

let env: ChurchEnv;
const report = (from: string, through: string) => periodReport(env.state, { from, through, asOf: "2026-04-20", revision: env.revision });

beforeEach(async () => {
  env = await ChurchEnv.create();
  await buildFold(env);
});

describe("the report table (C6.1, C6.4)", () => {
  it("heads the report, shows the period and the basis, and gives the counts of period A", () => {
    const table = reportTable(env.state, report("1880-01-01", "1950-12-31"), say);
    expect(table.title).toBe("Burial and reservation report");
    expect(table.subtitle).toBe("Private register report");
    expect(table.scope).toEqual(["From 1880-01-01", "Through 1950-12-31", `As at 2026-04-20. Uses current corrections. Revision ${env.revision}.`]);
    const totals = Object.fromEntries(table.totals.map((t) => [t.label, t.value]));
    expect(totals).toMatchObject({ Burials: "4", "Date incomplete": "1", "Reservations made": "0", "Reservations released": "0", "Open spaces": "3" });
  });

  it("lists burials, date incomplete, reservations, open spaces and location to confirm as parts apart", () => {
    const table = reportTable(env.state, report("1880-01-01", "1950-12-31"), say);
    expect(table.sections.map((s) => s.heading)).toEqual(["Burials", "Date incomplete", "Reservations made", "Reservations released", "Open spaces", "Location to confirm"]);
    const rows = (heading: string) => table.sections.find((s) => s.heading === heading)?.rows ?? [];
    expect(rows("Burials").map((r) => r[0])).toEqual(["LF-07A", "LF-04", "LF-07B", "LF-06"]);
    expect(rows("Burials")[0]).toEqual(["LF-07A", "Mirel Quillmoss", "2 June 1889", "Y07"]);
    expect(rows("Date incomplete")).toEqual([["LF-05", "Name unknown", "Date unknown", "Y05"]]);
    expect(rows("Open spaces").map((r) => r[0])).toEqual(["Y03 is free.", "Y08 is free.", "Y10 is free."]);
    expect(rows("Location to confirm")).toEqual([["LF-H1", "Perrin Gladwyn", "1790"]]);
    expect(table.sections.find((s) => s.heading === "Reservations made")?.emptyText).toBe("No events in this period.");
  });

  it("lists the reservations made in 2025-09-01 to 2026-02-28 without the holder's name", () => {
    const table = reportTable(env.state, report("2025-09-01", "2026-02-28"), say);
    const made = table.sections.find((s) => s.heading === "Reservations made")?.rows ?? [];
    expect(made.map((r) => r[0])).toEqual(["LF-R1", "LF-R2"]);
    expect(JSON.stringify(table)).not.toContain("Odalys");
    expect(JSON.stringify(table)).not.toContain("Wren");
  });

  it("shows the release with its date and reason", async () => {
    await env.must([{ type: "release_reservation", reservationId: id("reservation:LF-R1"), reason: "No longer needed" }], "2026-03-01");
    const table = reportTable(env.state, report("2026-03-01", "2026-03-31"), say);
    expect(table.sections.find((s) => s.heading === "Reservations released")?.rows).toEqual([["LF-R1", "Y02", "1", "2026-03-01", "No longer needed"]]);
  });

  it("says there are no events when the register has none in the period", async () => {
    const empty = await ChurchEnv.create();
    const r = periodReport(empty.state, { from: "2025-01-01", through: "2025-12-31", asOf: "2026-04-20", revision: 0 });
    const table = reportTable(empty.state, r, say);
    expect(table.sections).toHaveLength(1);
    expect(table.sections[0]?.emptyText).toBe("No events in this period.");
    expect(table.sections[0]?.rows).toEqual([]);
  });

  it("describes a free space in a part occupied plot explicitly", async () => {
    const fresh = await ChurchEnv.create();
    await layoutYewWalk(fresh, { extra: [{ code: "Z01", spaces: 2 }] });
    await fresh.must([{ type: "confirm_empty", spaceIds: [spaceId("Z01", 2)] }]);
    await fresh.must([{ type: "record_burial", burialId: id("burial:Z"), sourceRef: "Z-1", recordedName: "Ann Hartley", date: { p: "year", y: 1900 }, dateText: "1900", plotId: plotId("Z01"), spaceId: spaceId("Z01", 1), claimId: id("claim:Z") }]);
    const r = periodReport(fresh.state, { from: "1800-01-01", through: "1999-12-31", asOf: "2026-04-20", revision: fresh.revision });
    const open = reportTable(fresh.state, r, say).sections.find((s) => s.heading === "Open spaces")?.rows ?? [];
    expect(open).toEqual([["Z01, space 2 is free. Space 1 holds a burial."]]);
  });
});

describe("the private CSV (C6.6)", () => {
  it("has a heading row, a part and a source ref on every row, and a byte order mark", () => {
    const text = reportCsv(env.state, report("1880-01-01", "1950-12-31"), say);
    expect(text.startsWith("\uFEFF")).toBe(true);
    const lines = text.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe("Part,Source ref,Name,Date,Plot,Space,Detail");
    expect(lines.some((l) => l.startsWith("Burials,LF-07A,Mirel Quillmoss,2 June 1889,Y07"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Location to confirm,LF-H1,Perrin Gladwyn,1790"))).toBe(true);
  });

  it("escapes a name that starts like a formula, so a spreadsheet does not run it", async () => {
    const original = await env.eventIdOf("burial_recorded", id("burial:LF-04"));
    await env.must([{ type: "correct_burial", burialId: id("burial:LF-04"), recordedName: '=HYPERLINK("http://x","y")', correctsEventId: original, reason: "r", correctionRef: "p" }]);
    const text = reportCsv(env.state, report("1880-01-01", "1950-12-31"), say);
    expect(text).toContain("\"'=HYPERLINK(\"\"http://x\"\",\"\"y\"\")\"");
    for (const line of text.slice(1).split("\r\n")) {
      for (const cell of line.split(",")) expect(/^[=+@\t\r]/.test(cell)).toBe(false);
    }
  });

  it("leaves the stored name exactly as typed", async () => {
    const original = await env.eventIdOf("burial_recorded", id("burial:LF-04"));
    await env.must([{ type: "correct_burial", burialId: id("burial:LF-04"), recordedName: "+Plus Name", correctsEventId: original, reason: "r", correctionRef: "p" }]);
    expect(env.state.burials[id("burial:LF-04")]?.recordedName).toBe("+Plus Name");
  });
});
