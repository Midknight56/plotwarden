// Thimble Beds, the invented practice allotment (spec 04, task 4.12, A9). Expected numbers are from
// hand-totals.md sections 2.1, 2.4, 5.1, 5.2 and 5.5, typed here from that file. The walkthrough is built
// through the real register in its own workspace, and the private fields hold every privacy canary.
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { openRegisterDb } from "../../template/src/data/db";
import { restartWalkthrough, seedWalkthrough } from "../../template/src/data/seed";
import { listSites, readEvents, readSite, saveNewSite } from "../../template/src/data/transaction";
import { scanForCanaries } from "../../template/src/output/privacy";
import { search } from "../../template/src/search";
import type { SearchEntry } from "../../template/src/search";
import { createSite, mintId, siteLibrary } from "../../template/src/site";
import { plotSummaryAt, siteTotalsAt } from "../../template/src/status";
import { allotRecords, allotRegister } from "../../apps/allotment-register/src/adapter";
import { chargeSummary, chargesOfTenancy } from "../../apps/allotment-register/src/fees";
import { buildAvailabilityFile, nextFreePlot } from "../../apps/allotment-register/src/projection";
import { allotReviewFacts } from "../../apps/allotment-register/src/review";
import { nextApplicant, queueView } from "../../apps/allotment-register/src/rules";
import type { AllotState } from "../../apps/allotment-register/src/types";
import { thimbleBeds } from "../../apps/allotment-register/src/walkthrough";
import { APPLICANTS, AVAILABILITY_CANARIES, CONTACTS, TENANTS } from "../helpers/gardenCanaries";

const register = allotRegister();
const TODAY = "2026-04-20";
let db: IDBDatabase;
let state: AllotState;
let siteId: string;
let n = 0;
const newId = () => `00000000-0000-4000-8000-${(0x400000 + ++n).toString(16).padStart(12, "0")}`;

async function load(): Promise<{ state: AllotState; siteId: string }> {
  const made = await seedWalkthrough(db, register as never, thimbleBeds, { newId });
  if (!made.ok) throw new Error(`seed refused: ${JSON.stringify(made.error)}`);
  const replayed = register.replay(made.value, await readEvents(db, made.value.id));
  if (!replayed.ok) throw new Error("replay refused");
  return { state: replayed.value, siteId: made.value.id };
}

beforeEach(async () => {
  n = 0;
  const opened = await openRegisterDb(new IDBFactory());
  if (!opened.ok) throw new Error("storage");
  db = opened.value;
  ({ state, siteId } = await load());
});

const codeOf = (plotId: string) => state.core.plots[plotId]?.code;
const byCode = (code: string) => Object.values(state.core.plots).find((p) => p.code === code)?.plotId as string;

describe("Thimble Beds at the fixed date (hand totals 2.1 and 5.2)", () => {
  it("is read at the fixed review date, in its own workspace, in pounds, as a practice site", async () => {
    expect(thimbleBeds.today).toBe(TODAY);
    const sites = await listSites(db);
    expect(siteLibrary(sites, { kind: "allotment", workspace: "own" })).toEqual([]);
    expect(sites.find((s) => s.id === siteId)).toMatchObject({ workspace: "walkthrough", title: "Thimble Beds", kind: "allotment", currency: "GBP" });
  });

  it("has six plots B01 to B06 in two rows: taken 3, free 2, unusable 1, none to check", () => {
    expect(Object.values(state.core.plots).map((p) => p.code).sort()).toEqual(["B01", "B02", "B03", "B04", "B05", "B06"]);
    const totals = siteTotalsAt(state.core, TODAY);
    expect(totals.plots.byPrimary).toEqual({ free: 2, reserved: 0, taken: 3, unusable: 1 });
    expect(totals.plots.needsChecking).toBe(0);
    expect(totals.spaces.total).toBe(6);
    expect(totals.freePlots).toBe(2);
    const primary = (code: string) => plotSummaryAt(state.core, byCode(code), TODAY)?.primary;
    for (const code of ["B03", "B05"]) expect(primary(code)).toBe("free");
    for (const code of ["B01", "B02", "B04"]) expect(primary(code)).toBe("taken");
    expect(primary("B06")).toBe("unusable");
    const sections = Object.values(state.core.plots).map((p) => [p.code, state.map.sections[p.sectionId as string]?.name]);
    expect(sections.sort()).toEqual([["B01", "Sunny Row"], ["B02", "Sunny Row"], ["B03", "Sunny Row"], ["B04", "Shady Row"], ["B05", "Shady Row"], ["B06", "Shady Row"]]);
  });

  it("has three open tenancies with their source refs and dates", () => {
    const rows = Object.values(state.tenancies).map((t) => [codeOf(t.plotId), state.people[t.personId]?.displayName, t.start, t.sourceRef, t.endExclusive]);
    expect(rows).toEqual([
      ["B01", "Marlo Fennick", "2024-04-01", "TB-T1", undefined],
      ["B02", "Ada Stonecrop", "2025-04-01", "TB-T2", undefined],
      ["B04", "Ilse Burrowby", "2023-04-01", "TB-T4", undefined],
    ]);
  });

  it("has Tavi first and Olin second on one joined date, by sequence and not by application ID", () => {
    const rows = queueView(state);
    expect(rows.map((r) => [r.name, r.joinedOn, r.sequence])).toEqual([["Tavi Bramblequill", "2026-01-10", 1], ["Olin Reedwhorl", "2026-01-10", 2]]);
    expect((rows[0]?.applicationId as string) > (rows[1]?.applicationId as string)).toBe(true);
    expect(nextApplicant(state)?.name).toBe("Tavi Bramblequill");
    expect(nextFreePlot(state, TODAY)?.code).toBe("B03");
  });

  it("has the older GBP 30.00 charge on B02, overdue at the review date, and nothing on B03", () => {
    const b02 = Object.values(state.tenancies).find((t) => codeOf(t.plotId) === "B02");
    const charges = chargesOfTenancy(state, b02?.tenancyId as string);
    expect(charges).toHaveLength(1);
    expect(chargeSummary(state, charges[0]?.entryId as string, TODAY)).toMatchObject({ charged: 3000, received: 0, balance: 3000, status: "overdue", dueOn: "2025-06-30" });
    expect(Object.values(state.ledger).filter((e) => e.type === "charge")).toHaveLength(1);
    expect(Object.values(state.seasons).map((s) => s.name)).toEqual(["Season 2025"]);
    expect(Object.values(state.offers)).toEqual([]);
  });

  it("finds Marlo at B01 and lists the two applicants with no plot", () => {
    const byPlot = new Map<string, SearchEntry["names"]>();
    for (const r of allotRecords(state)) if (r.plotId !== undefined) byPlot.set(r.plotId, [...(byPlot.get(r.plotId) ?? []), r.name]);
    const entries: SearchEntry[] = Object.values(state.core.plots).map((p) => ({ siteId, plotId: p.plotId, code: p.code, priorCodes: p.priorCodes, names: byPlot.get(p.plotId) ?? [] }));
    const hits = search(entries, siteId, "Fennick");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ display: "Marlo Fennick", code: "B01" });
    expect(allotRecords(state).filter((r) => r.plotId === undefined).map((r) => r.name.display)).toEqual(["Tavi Bramblequill", "Olin Reedwhorl"]);
  });
});

describe("Thimble Beds availability file and review (hand totals 5.5 and 5.6)", () => {
  it("lists B03 and B05 with the words of the walkthrough and no person, fee or queue", () => {
    let k = 0;
    const out = buildAvailabilityFile(state, { asOf: TODAY, revision: 1, newPublicId: () => `w${++k}` });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.file.freePlots.map((p) => p.code)).toEqual(["B03", "B05"]);
    expect(out.file.neutralGround).toHaveLength(4);
    expect(out.file.siteTitle).toBe("Thimble Beds");
    expect(out.file.gate.name).toBe("Thimble Gate");
    expect(out.file.paths.map((p) => p.name)).toEqual(["Grass Walk"]);
    expect(out.file.sections.map((s) => s.label).sort()).toEqual(["Shady Row", "Sunny Row"]);
    expect(out.file.instructions).toBe("Ask the secretary at the hut on Saturday morning. Say the plot code.");
    expect(scanForCanaries(out.file, AVAILABILITY_CANARIES)).toEqual([]);
  });

  it("holds the canaries in its private fields, so the scan above has something to find", () => {
    const found = scanForCanaries(state, AVAILABILITY_CANARIES).sort();
    expect(found).toEqual([...APPLICANTS, ...TENANTS, ...CONTACTS, "GBP"].sort());
  });

  it("raises one review fact at the review date: the old charge on B02", () => {
    const facts = allotReviewFacts(state, TODAY);
    expect(facts.map((f) => f.rule)).toEqual(["fee_late"]);
    expect(allotReviewFacts(state, "2025-06-30")).toEqual([]);
  });
});

describe("restarting Thimble Beds (A9.2)", () => {
  it("rebuilds the same practice garden and leaves a register of the keeper's own where it is", async () => {
    const made = createSite({ id: mintId(), lineageId: mintId(), siteKey: mintId(), kind: "allotment", title: "My own beds", zone: "Europe/London", createdAt: "2026-04-01T08:00:00.000Z", currency: "EUR" });
    if (!made.ok) throw new Error("site");
    await saveNewSite(db, made.value);
    const before = await listSites(db);
    const again = await restartWalkthrough(db, register as never, thimbleBeds, { newId });
    expect(again.ok).toBe(true);
    const after = await listSites(db);
    expect(after).toHaveLength(before.length);
    expect(siteLibrary(after, { kind: "allotment", workspace: "own" }).map((s) => s.title)).toEqual(["My own beds"]);
    expect(await readSite(db, made.value.id)).toBeDefined();
    const reloaded = await load();
    expect(siteTotalsAt(reloaded.state.core, TODAY).plots.byPrimary).toEqual({ free: 2, reserved: 0, taken: 3, unusable: 1 });
    expect(reloaded.siteId).not.toBe(siteId);
  });

  it("builds in six revisions, one for each part of the story", async () => {
    expect((await readSite(db, siteId))?.revision).toBe(6);
  });
});
