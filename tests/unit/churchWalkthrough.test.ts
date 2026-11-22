// Lantern Fold, the invented practice churchyard (spec 03, task 3.11, C8). Expected numbers are from
// hand-totals.md sections 1 and 4, typed here from that file. The walkthrough is built through the real
// register in its own workspace, and the private fields hold every privacy canary.
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { openRegisterDb } from "../../template/src/data/db";
import { restartWalkthrough, seedWalkthrough } from "../../template/src/data/seed";
import { listSites, readEvents } from "../../template/src/data/transaction";
import { scanForCanaries } from "../../template/src/output/privacy";
import { search } from "../../template/src/search";
import type { SearchEntry } from "../../template/src/search";
import { plotSummaryAt, siteTotalsAt } from "../../template/src/status";
import { plotSummaryText } from "../../template/src/ui/copy";
import { siteLibrary } from "../../template/src/site";
import { churchRecords, churchRegister } from "../../apps/churchyard-register/src/adapter";
import { periodReport, unplacedBurials } from "../../apps/churchyard-register/src/history";
import { buildFamilyFile } from "../../apps/churchyard-register/src/projection";
import { churchReviewFacts } from "../../apps/churchyard-register/src/review";
import type { ChurchState } from "../../apps/churchyard-register/src/types";
import { lanternFold } from "../../apps/churchyard-register/src/walkthrough";
import { APPROVED_NAME, VISITOR_CANARIES } from "../helpers/privacyCanaries";

const register = churchRegister();
const TODAY = "2026-04-20";
let db: IDBDatabase;
let state: ChurchState;
let siteId: string;
let n = 0;
const newId = () => `00000000-0000-4000-8000-${(0x300000 + ++n).toString(16).padStart(12, "0")}`;

async function load(): Promise<{ state: ChurchState; siteId: string }> {
  const made = await seedWalkthrough(db, register as never, lanternFold, { newId });
  if (!made.ok) throw new Error(`seed refused: ${JSON.stringify(made.error)}`);
  const replayed = register.replay(made.value, await readEvents(db, made.value.id));
  if (!replayed.ok) throw new Error("replay refused");
  return { state: replayed.value, siteId: made.value.id };
}

beforeEach(async () => {
  const opened = await openRegisterDb(new IDBFactory());
  if (!opened.ok) throw new Error("storage");
  db = opened.value;
  ({ state, siteId } = await load());
});

describe("Lantern Fold at the fixed date (hand totals section 1)", () => {
  it("is read at the fixed review date, in its own workspace, as a practice site", async () => {
    expect(lanternFold.today).toBe(TODAY);
    const sites = await listSites(db);
    const own = siteLibrary(sites, { kind: "churchyard", workspace: "own" });
    expect(own).toEqual([]);
    expect(sites.find((s) => s.id === siteId)).toMatchObject({ workspace: "walkthrough", title: "Lantern Fold", kind: "churchyard" });
  });

  it("has twelve plots Y01 to Y12: free 3, reserved 2, taken 6, unusable 1, none to check", () => {
    const totals = siteTotalsAt(state.core, TODAY);
    expect(Object.values(state.core.plots).map((p) => p.code).sort()).toEqual(["Y01", "Y02", "Y03", "Y04", "Y05", "Y06", "Y07", "Y08", "Y09", "Y10", "Y11", "Y12"]);
    expect(totals.plots.byPrimary).toEqual({ free: 3, reserved: 2, taken: 6, unusable: 1 });
    expect(totals.plots.needsChecking).toBe(0);
    expect(totals.spaces.total).toBe(13);
    expect(totals.spaces.byState).toEqual({ free: 3, reserved: 2, taken: 7, unusable: 1 });
    expect(totals.availableSpaces).toBe(3);
    expect(totals.freePlots).toBe(3);
    const byCode = (state: ChurchState, code: string) => Object.values(state.core.plots).find((p) => p.code === code)?.plotId as string;
    const primary = (code: string) => plotSummaryAt(state.core, byCode(state, code), TODAY)?.primary;
    for (const code of ["Y03", "Y08", "Y10"]) expect(primary(code)).toBe("free");
    for (const code of ["Y02", "Y11"]) expect(primary(code)).toBe("reserved");
    for (const code of ["Y01", "Y04", "Y05", "Y06", "Y07", "Y09"]) expect(primary(code)).toBe("taken");
    expect(primary("Y12")).toBe("unusable");
  });

  it("has eight burials, seven placed and one unplaced, and Y07 reads 2 of 2 spaces used", () => {
    const live = Object.values(state.burials);
    expect(live).toHaveLength(8);
    expect(live.filter((b) => b.spaceId !== undefined)).toHaveLength(7);
    expect(unplacedBurials(state)).toHaveLength(1);
    const y07 = Object.values(state.core.plots).find((p) => p.code === "Y07");
    expect(y07?.spaces).toHaveLength(2);
    const summary = plotSummaryAt(state.core, y07?.plotId as string, TODAY);
    expect(plotSummaryText(summary as NonNullable<typeof summary>)).toBe("Taken · 2 of 2 spaces used");
  });

  it("has two active reservations by two living holders, kept apart from every burial", () => {
    expect(Object.values(state.reservations).filter((r) => r.released === undefined)).toHaveLength(2);
    expect(Object.keys(state.people)).toHaveLength(2);
    const burials = JSON.stringify(state.burials);
    for (const person of Object.values(state.people)) expect(burials).not.toContain(person.displayName);
  });

  it("finds Mirel Quillmoss at Y07 in Yew Walk, and nothing else for that name", () => {
    const records = churchRecords(state);
    const byPlot = new Map<string, SearchEntry["names"]>();
    for (const r of records) if (r.plotId !== undefined) byPlot.set(r.plotId, [...(byPlot.get(r.plotId) ?? []), r.name]);
    const entries: SearchEntry[] = Object.values(state.core.plots).map((p) => ({ siteId, plotId: p.plotId, code: p.code, priorCodes: p.priorCodes, names: byPlot.get(p.plotId) ?? [] }));
    const hits = search(entries, siteId, "Quillmoss");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ display: APPROVED_NAME, code: "Y07" });
    const section = state.map.sections[Object.values(state.core.plots).find((p) => p.code === "Y07")?.sectionId as string]?.name;
    expect(section).toBe("Yew Walk");
  });
});

describe("Lantern Fold family file and review (hand totals 1 and 4.5)", () => {
  it("shares one name, Mirel Quillmoss, with the gate and directions the plan gives", () => {
    const out = buildFamilyFile(state, { asOf: TODAY, revision: 1, newPublicId: (() => { let k = 0; return () => `w${++k}`; })() });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.file.burials.map((b) => b.name)).toEqual([APPROVED_NAME]);
    expect("year" in (out.file.burials[0] ?? {})).toBe(false);
    expect(out.file.burials[0]?.directions).toBe("Enter at Lantern Gate. Follow Yew Walk to row Y. Look for Y07.");
    expect(out.file.gate.name).toBe("Lantern Gate");
    expect(out.file.plots.map((p) => p.code)).toEqual(["Y07"]);
    expect(out.file.paths.map((p) => p.name)).toEqual(["Yew Walk"]);
    expect(out.preview.withheld).toHaveLength(1);
    expect(scanForCanaries(out.file, VISITOR_CANARIES)).toEqual([]);
  });

  it("holds every canary in its private fields, so the scan above has something to find", () => {
    expect(scanForCanaries(state, VISITOR_CANARIES).sort()).toEqual([...VISITOR_CANARIES].sort());
  });

  it("raises two review facts: one unplaced burial and one unclear reading", () => {
    const facts = churchReviewFacts(state, TODAY);
    expect(facts.map((f) => f.rule).sort()).toEqual(["placement_missing", "reading_unclear"]);
  });

  it("keeps the inscription's line breaks", () => {
    const memorial = Object.values(state.memorials)[0];
    expect(memorial?.reading.split("\n").length).toBeGreaterThan(2);
    expect(memorial?.unclear).toBe(true);
  });
});

describe("Lantern Fold period report (hand totals 4.2 and 4.4)", () => {
  it("counts period A as 4 inside, 1 date incomplete, and two reservations made from September 2025", () => {
    const a = periodReport(state, { from: "1880-01-01", through: "1950-12-31", asOf: TODAY, revision: 0 });
    expect([a.burials.inside.length, a.burials.incomplete.length, a.burials.outside]).toEqual([4, 1, 3]);
    const made = periodReport(state, { from: "2025-09-01", through: "2026-02-28", asOf: TODAY, revision: 0 });
    expect(made.reservationsMade).toHaveLength(2);
  });
});

describe("restarting Lantern Fold (C8.2)", () => {
  it("rebuilds the same practice churchyard and leaves the library of own registers empty", async () => {
    const before = await listSites(db);
    const again = await restartWalkthrough(db, register as never, lanternFold, { newId });
    expect(again.ok).toBe(true);
    const after = await listSites(db);
    expect(after).toHaveLength(before.length);
    const reloaded = await load();
    expect(siteTotalsAt(reloaded.state.core, TODAY).plots.byPrimary).toEqual({ free: 3, reserved: 2, taken: 6, unusable: 1 });
    expect(siteLibrary(after, { kind: "churchyard", workspace: "own" })).toEqual([]);
  });
});
