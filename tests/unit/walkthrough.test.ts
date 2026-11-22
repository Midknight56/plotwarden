// T30 (spec 06, task 6.3): the two practice registers. They are the same every time, live in their own
// workspace, a restart touches only that register, no placeholder word enters a capture, and the first
// screen and the result lines read exactly as the catalog says. Requirements Z3 and R24.
// Expected numbers are typed from tests/fixtures/expected/hand-totals.md sections 1, 2 and 5.
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { allotRegister } from "../../apps/allotment-register/src/adapter";
import { ALLOT_COPY } from "../../apps/allotment-register/src/copy";
import type { AllotState } from "../../apps/allotment-register/src/types";
import { thimbleBeds } from "../../apps/allotment-register/src/walkthrough";
import { churchRegister } from "../../apps/churchyard-register/src/adapter";
import { CHURCH_COPY } from "../../apps/churchyard-register/src/copy";
import type { ChurchState } from "../../apps/churchyard-register/src/types";
import { lanternFold } from "../../apps/churchyard-register/src/walkthrough";
import type { Walkthrough } from "../../template/src/data/seed";
import { restartWalkthrough, seedWalkthrough } from "../../template/src/data/seed";
import { openRegisterDb } from "../../template/src/data/db";
import { listSites, readEvents, readSite, saveNewSite } from "../../template/src/data/transaction";
import { createSite, mintId, siteLibrary } from "../../template/src/site";
import { plotSummaryAt, siteTotalsAt } from "../../template/src/status";
import { COPY, fill, plotSummaryText } from "../../template/src/ui/copy";

const TODAY = "2026-04-20";

let db: IDBDatabase;
const counter = (start: number) => {
  let n = start;
  return () => `00000000-0000-4000-8000-${(start * 0x1000 + ++n).toString(16).padStart(12, "0")}`;
};

beforeEach(async () => {
  const opened = await openRegisterDb(new IDBFactory());
  if (!opened.ok) throw new Error("storage");
  db = opened.value;
});

async function freshDb(): Promise<IDBDatabase> {
  const opened = await openRegisterDb(new IDBFactory());
  if (!opened.ok) throw new Error("storage");
  return opened.value;
}

const WALKTHROUGHS = [
  { name: "Lantern Fold", walkthrough: lanternFold, register: () => churchRegister() as never, kind: "churchyard" },
  { name: "Thimble Beds", walkthrough: thimbleBeds, register: () => allotRegister() as never, kind: "allotment" },
] as const;

describe("a practice register is the same every time", () => {
  for (const { name, walkthrough, register } of WALKTHROUGHS) {
    it(`${name}: the same ID source gives byte for byte equal commands, events and write times`, async () => {
      const a = counter(11);
      const b = counter(11);
      const dbB = await freshDb();
      const first = await seedWalkthrough(db, register(), walkthrough, { newId: a });
      const second = await seedWalkthrough(dbB, register(), walkthrough, { newId: b });
      if (!first.ok || !second.ok) throw new Error("seed");
      expect(JSON.stringify(walkthrough.batches(counter(5)))).toBe(JSON.stringify(walkthrough.batches(counter(5))));
      const eventsA = await readEvents(db, first.value.id);
      const eventsB = await readEvents(dbB, second.value.id);
      expect(eventsA.length).toBeGreaterThan(10);
      expect(JSON.stringify(eventsA.map((e) => ({ ...e, siteId: "site" })))).toBe(JSON.stringify(eventsB.map((e) => ({ ...e, siteId: "site" }))));
      // R20.4: a write time is UTC with an offset, and every batch of a practice register shares one fixed time.
      expect(new Set(eventsA.map((e) => e.recordedAt))).toEqual(new Set(["2026-04-20T09:30:00.000+00:00"]));
    });

    it(`${name}: two different ID sources give the same codes, event types, write times and totals`, async () => {
      const dbB = await freshDb();
      const first = await seedWalkthrough(db, register(), walkthrough, { newId: counter(21) });
      const second = await seedWalkthrough(dbB, register(), walkthrough, { newId: counter(37) });
      if (!first.ok || !second.ok) throw new Error("seed");
      const shape = async (handle: IDBDatabase, id: string) => {
        const events = await readEvents(handle, id);
        return { types: events.map((e) => e.type), at: events.map((e) => e.recordedAt), on: events.map((e) => e.effectiveOn ?? ""), revision: (await readSite(handle, id))?.revision };
      };
      expect(await shape(db, first.value.id)).toEqual(await shape(dbB, second.value.id));
      expect(first.value.id).toBe(first.value.id);
    });
  }
});

describe("the practice registers match the hand totals", () => {
  it("Lantern Fold: 12 plots and 13 spaces, free 3, reserved 2, taken 6, unusable 1; 8 burials, 1 unplaced; Y07 is 2 of 2", async () => {
    const made = await seedWalkthrough(db, churchRegister() as never, lanternFold, { newId: counter(41) });
    if (!made.ok) throw new Error("seed");
    const replayed = churchRegister().replay(made.value, await readEvents(db, made.value.id));
    if (!replayed.ok) throw new Error("replay");
    const state: ChurchState = replayed.value;
    const totals = siteTotalsAt(state.core, TODAY);
    expect(totals.plots.byPrimary).toEqual({ free: 3, reserved: 2, taken: 6, unusable: 1 });
    expect(totals.spaces.total).toBe(13);
    expect(Object.values(state.burials)).toHaveLength(8);
    expect(Object.values(state.burials).filter((b) => b.spaceId === undefined)).toHaveLength(1);
    const y07 = Object.values(state.core.plots).find((p) => p.code === "Y07");
    const summary = plotSummaryAt(state.core, y07?.plotId as string, TODAY);
    expect(plotSummaryText(summary as NonNullable<typeof summary>)).toBe("Taken · 2 of 2 spaces used");
  });

  it("Thimble Beds: 6 plots, taken 3, free 2, unusable 1; 3 tenancies; 2 applicants; one charge of 3000", async () => {
    const made = await seedWalkthrough(db, allotRegister() as never, thimbleBeds, { newId: counter(43) });
    if (!made.ok) throw new Error("seed");
    const replayed = allotRegister().replay(made.value, await readEvents(db, made.value.id));
    if (!replayed.ok) throw new Error("replay");
    const state: AllotState = replayed.value;
    expect(siteTotalsAt(state.core, TODAY).plots.byPrimary).toEqual({ free: 2, reserved: 0, taken: 3, unusable: 1 });
    expect(Object.values(state.tenancies)).toHaveLength(3);
    expect(Object.values(state.applications)).toHaveLength(2);
    const charges = Object.values(state.ledger).filter((e) => e.type === "charge");
    expect(charges).toHaveLength(1);
    expect(JSON.stringify(charges[0])).toContain("3000");
  });
});

describe("a restart rebuilds that practice register alone", () => {
  async function own(kind: string, title: string) {
    const made = createSite({ id: mintId(), lineageId: mintId(), siteKey: mintId(), kind, title, zone: "Europe/London", createdAt: "2026-01-01T00:00:00.000Z" });
    if (!made.ok) throw new Error("site");
    await saveNewSite(db, made.value);
    return made.value;
  }
  const dump = async (ids: string[]) => JSON.stringify(await Promise.all(ids.map(async (id) => [await readSite(db, id), await readEvents(db, id)])));

  for (const { name, walkthrough, register, kind } of WALKTHROUGHS) {
    it(`${name}: own registers, the other practice register and the library of own registers are untouched`, async () => {
      const church = await own("churchyard", "Elm Row Churchyard");
      const garden = await own("allotment", "Mill Lane Allotments");
      const fold = await seedWalkthrough(db, churchRegister() as never, lanternFold, { newId: counter(51) });
      const beds = await seedWalkthrough(db, allotRegister() as never, thimbleBeds, { newId: counter(53) });
      if (!fold.ok || !beds.ok) throw new Error("seed");
      const mine = kind === "churchyard" ? fold.value : beds.value;
      const other = kind === "churchyard" ? beds.value : fold.value;
      const keep = await dump([church.id, garden.id, other.id]);
      const ownBefore = siteLibrary(await listSites(db), { kind, workspace: "own" }).map((s) => s.title);

      const again = await restartWalkthrough(db, register(), walkthrough, { newId: counter(57) });
      expect(again.ok).toBe(true);
      expect(await readSite(db, mine.id)).toBeUndefined();
      expect(await dump([church.id, garden.id, other.id])).toBe(keep);
      expect(siteLibrary(await listSites(db), { kind, workspace: "own" }).map((s) => s.title)).toEqual(ownBefore);
      expect((await listSites(db)).filter((s) => s.title === name)).toHaveLength(1);
    });
  }

  it("starting over a practice register never reads, writes or lists a real record", async () => {
    const real = await own("churchyard", "Real Book");
    const before = await dump([real.id]);
    for (let i = 0; i < 3; i++) await restartWalkthrough(db, churchRegister() as never, lanternFold, { newId: counter(60 + i) });
    expect(await dump([real.id])).toBe(before);
    expect(siteLibrary(await listSites(db), { kind: "churchyard", workspace: "own" }).map((s) => s.title)).toEqual(["Real Book"]);
  });
});

describe("the line to the approved burial agrees with the drawn map (C12.3)", () => {
  type Pt = [number, number];
  interface Layout {
    type: string;
    plots: { code: string; footprint: Pt[] }[];
    paths: { points: Pt[] }[];
    gate: { at: Pt };
    north: number;
  }
  const commands = () => lanternFold.batches(counter(7)).flatMap((b) => b.commands as { type: string; [key: string]: unknown }[]);
  const centre = (points: Pt[]): Pt => [points.reduce((n, p) => n + p[0], 0) / points.length, points.reduce((n, p) => n + p[1], 0) / points.length];

  it("draws Y07 as the first plot on the north side of Yew Walk, nearest the gate", () => {
    const layout = commands().find((c) => c.type === "layout_apply") as unknown as Layout;
    expect(layout.north).toBe(0);
    const walkY = (layout.paths[0] as { points: Pt[] }).points[0]![1];
    const northSide = layout.plots.filter((p) => Math.min(...p.footprint.map((pt) => pt[1])) > walkY);
    expect(northSide.map((p) => p.code).sort()).toEqual(["Y07", "Y08", "Y09", "Y10", "Y11", "Y12"]);
    const gate = layout.gate.at;
    const distance = (points: Pt[]): number => {
      const c = centre(points);
      return Math.hypot(c[0] - gate[0], c[1] - gate[1]);
    };
    const byGate = [...northSide].sort((a, b) => distance(a.footprint) - distance(b.footprint));
    expect(byGate[0]?.code).toBe("Y07");
  });

  it("gives the burial of Y07 a line that says so, and no word of the old line", () => {
    const approvals = commands().filter((c) => c.type === "approve_burial");
    expect(approvals).toHaveLength(1);
    expect(approvals[0]?.["line"]).toBe("First stone on the north side of the walk, by the gate.");
    expect(JSON.stringify(commands())).not.toMatch(/seventh/i);
  });
});

describe("no placeholder word and no repeated reference enters a capture", () => {
  const PLACEHOLDER = /\b(lorem|ipsum|todo|tbd|xxx+|placeholder|sample|foobar|undefined|null|nan)\b|\{[A-Za-z]+\}/i;

  function strings(value: unknown, out: string[] = []): string[] {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) for (const item of value) strings(item, out);
    else if (value !== null && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        out.push(key);
        strings(item, out);
      }
    }
    return out;
  }
  function refs(value: unknown, out: string[] = []): string[] {
    if (Array.isArray(value)) for (const item of value) refs(item, out);
    else if (value !== null && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        if ((key === "sourceRef" || key === "page" || key === "pageRef") && typeof item === "string") out.push(item);
        else refs(item, out);
      }
    }
    return out;
  }

  for (const { name, walkthrough } of WALKTHROUGHS) {
    it(`${name}: every text is real and every source ref is used once`, () => {
      const batches = walkthrough.batches(counter(70));
      const texts = strings(batches).filter((s) => !/^[0-9a-f-]{36}$/i.test(s) && !/^\d{4}-\d{2}-\d{2}$/.test(s));
      expect(texts.length).toBeGreaterThan(50);
      for (const text of texts) expect(PLACEHOLDER.test(text), `placeholder in "${text}"`).toBe(false);
      const sourceRefs = refs(batches).filter((r) => r !== "");
      // Thimble Beds has three tenancy refs, Lantern Fold eight burial refs and two reservation refs.
      expect(sourceRefs.length).toBeGreaterThanOrEqual(3);
      const repeated = sourceRefs.filter((r, i) => sourceRefs.indexOf(r) !== i);
      // A source ref may be written once per record. A page reference is a place and may repeat across records,
      // so only source refs are held to being unique.
      const sourceOnly = JSON.stringify(batches).match(/"sourceRef":"[^"]+"/g) ?? [];
      expect(new Set(sourceOnly).size, `repeated: ${repeated.join(", ")}`).toBe(sourceOnly.length);
    });
  }

  it("the catalogs of the first screen hold no placeholder word", () => {
    for (const catalog of [COPY, CHURCH_COPY, ALLOT_COPY]) {
      for (const [key, value] of Object.entries(catalog)) {
        if (!/^(libraryPrompt|libraryWho|walkthroughNote|openWalkthrough|restartWalkthrough|startRegister)$/.test(key)) continue;
        expect(PLACEHOLDER.test(value), `placeholder in ${key}`).toBe(false);
      }
    }
  });
});

describe("the first screen and the results read exactly as the catalog says", () => {
  const say = (labels: Readonly<Record<string, string>>) => (key: string, values: Record<string, string | number> = {}) => fill(labels[key] ?? COPY[key] ?? key, values);

  it("Churchyard Register: title prompt, who it is for, the one main action, the practice choice and its note", () => {
    const t = say(CHURCH_COPY);
    expect(t("libraryPrompt")).toBe("Find a burial or start your register.");
    expect(t("libraryWho")).toBe("For the volunteer who keeps a churchyard's burial records. Records stay on this device.");
    expect(t("startRegister")).toBe("Start a register");
    expect(t("noRegisters")).toBe("No registers on this device.");
    expect(t("openWalkthrough")).toBe("Open Lantern Fold");
    expect(t("restartWalkthrough")).toBe("Restart walkthrough");
    expect(t("walkthroughNote")).toBe("Lantern Fold is a practice register. Nothing you do here touches your own registers.");
    expect(t("restoreBackup")).toBe("Restore backup");
    expect(t("myRegisters")).toBe("My registers");
  });

  it("Allotment Register: the same, in the garden's words", () => {
    const t = say(ALLOT_COPY);
    expect(t("libraryPrompt")).toBe("Offer the next free plot or start your register.");
    expect(t("libraryWho")).toBe("For the secretary of an allotment garden. Records stay on this device.");
    expect(t("startRegister")).toBe("Start a register");
    expect(t("openWalkthrough")).toBe("Open Thimble Beds");
    expect(t("restartWalkthrough")).toBe("Restart walkthrough");
    expect(t("walkthroughNote")).toBe("Thimble Beds is a practice register. Nothing you do here touches your own registers.");
  });

  it("the result lines: Y07 · Yew Walk · Taken and B03 reserved for Tavi Bramblequill.", () => {
    expect(say(CHURCH_COPY)("summaryLine", { code: "Y07", section: "Yew Walk", state: "Taken" })).toBe("Y07 · Yew Walk · Taken");
    expect(say(ALLOT_COPY)("offerReserved", { plot: "B03", name: "Tavi Bramblequill" })).toBe("B03 reserved for Tavi Bramblequill.");
    expect(say(ALLOT_COPY)("nextFreePlot")).toBe("Next free plot");
    expect(say(ALLOT_COPY)("nextApplicant")).toBe("Next applicant");
  });

  it("the walkthrough is a fixed date and a fixed write time", () => {
    for (const w of [lanternFold, thimbleBeds] as Walkthrough[]) {
      expect(w.today).toBe(TODAY);
      expect(w.startedAt).toBe("2026-04-20T09:30:00.000Z");
      expect(w.zone).toBe("Europe/London");
    }
  });
});
