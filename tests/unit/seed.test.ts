// The practice register machinery (spec 03, task 3.11, T30 for the template part): a walkthrough opens in its
// own workspace, is built once, restarts alone, and never touches a register of the keeper's own.
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { openRegisterDb } from "../../template/src/data/db";
import { seedWalkthrough, restartWalkthrough } from "../../template/src/data/seed";
import type { Walkthrough } from "../../template/src/data/seed";
import { listSites, readEvents, readSite, saveNewSite } from "../../template/src/data/transaction";
import { createSite, mintId, siteLibrary } from "../../template/src/site";
import { PAPER_KIND, paperRegister } from "../helpers/paperKind";
import type { PaperState } from "../helpers/paperKind";

const register = paperRegister();

const practice: Walkthrough = {
  siteTitle: "Practice Yard",
  zone: "Europe/London",
  today: "2026-04-20",
  startedAt: "2026-04-20T09:30:00.000Z",
  batches: (newId) => {
    const section = newId();
    const plot = newId();
    const space = newId();
    return [
      { commands: [{ type: "layout_apply", sections: [{ sectionId: section, name: "Row" }], plots: [{ plotId: plot, code: "P01", sectionId: section, spaces: [{ spaceId: space }] }] }], on: "2026-04-20" },
      { commands: [{ type: "confirm_empty", spaceIds: [space] }], on: "2026-04-20" },
    ];
  },
};

let db: IDBDatabase;
let n = 0;
const newId = () => `00000000-0000-4000-8000-${(0x200000 + ++n).toString(16).padStart(12, "0")}`;

beforeEach(async () => {
  n = 0;
  const opened = await openRegisterDb(new IDBFactory());
  if (!opened.ok) throw new Error("storage");
  db = opened.value;
});

async function ownSite(title = "My Own Book") {
  const made = createSite({ id: mintId(), lineageId: mintId(), siteKey: mintId(), kind: PAPER_KIND, title, zone: "Europe/London", createdAt: "2026-01-01T00:00:00.000Z" });
  if (!made.ok) throw new Error("site");
  await saveNewSite(db, made.value);
  return made.value;
}

describe("seeding a walkthrough", () => {
  it("makes a site in the walkthrough workspace, of the register's kind, with one revision per batch", async () => {
    const made = await seedWalkthrough(db, register as never, practice, { newId });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.value).toMatchObject({ kind: PAPER_KIND, workspace: "walkthrough", title: "Practice Yard", zone: "Europe/London", createdAt: "2026-04-20T09:30:00.000Z" });
    const row = await readSite(db, made.value.id);
    expect(row?.revision).toBe(2);
    const events = await readEvents(db, made.value.id);
    expect(new Set(events.map((e) => e.recordedAt)).size).toBe(1);
    expect(events[0]?.recordedAt.startsWith("2026-04-20T09:30:00")).toBe(true);
    const replayed = register.replay(made.value, events);
    expect(replayed.ok).toBe(true);
    if (replayed.ok) {
      const state = replayed.value as PaperState;
      expect(Object.values(state.core.plots).map((p) => p.code)).toEqual(["P01"]);
      expect(Object.values(state.core.plots)[0]?.spaces[0]?.checked).toBe(true);
    }
  });

  it("is built once: opening it again finds the same site and writes nothing", async () => {
    const first = await seedWalkthrough(db, register as never, practice, { newId });
    const second = await seedWalkthrough(db, register as never, practice, { newId });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.value.id).toBe(first.value.id);
    expect((await listSites(db)).filter((s) => s.workspace === "walkthrough")).toHaveLength(1);
    expect((await readSite(db, first.ok ? first.value.id : ""))?.revision).toBe(2);
  });

  it("never shows in the keeper's own library", async () => {
    await ownSite();
    await seedWalkthrough(db, register as never, practice, { newId });
    const sites = await listSites(db);
    expect(siteLibrary(sites, { kind: PAPER_KIND, workspace: "own" }).map((s) => s.title)).toEqual(["My Own Book"]);
    expect(siteLibrary(sites, { kind: PAPER_KIND, workspace: "walkthrough" }).map((s) => s.title)).toEqual(["Practice Yard"]);
  });
});

describe("restarting a walkthrough", () => {
  it("rebuilds only the walkthrough: the keeper's own register keeps every event and its revision", async () => {
    const mine = await ownSite();
    const before = JSON.stringify(await readEvents(db, mine.id));
    const rowBefore = JSON.stringify(await readSite(db, mine.id));
    const first = await seedWalkthrough(db, register as never, practice, { newId });
    if (!first.ok) throw new Error("seed");
    const again = await restartWalkthrough(db, register as never, practice, { newId });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.id).not.toBe(first.value.id);
    expect(await readSite(db, first.value.id)).toBeUndefined();
    expect(await readEvents(db, first.value.id)).toEqual([]);
    expect(JSON.stringify(await readEvents(db, mine.id))).toBe(before);
    expect(JSON.stringify(await readSite(db, mine.id))).toBe(rowBefore);
    expect((await listSites(db)).map((s) => s.title).sort()).toEqual(["My Own Book", "Practice Yard"]);
  });

  it("starts the practice register when there is none to restart", async () => {
    const out = await restartWalkthrough(db, register as never, practice, { newId });
    expect(out.ok).toBe(true);
  });

  it("refuses a walkthrough whose commands the register refuses, and leaves no half built site", async () => {
    const broken: Walkthrough = { ...practice, siteTitle: "Broken", batches: () => [{ commands: [{ type: "make_tea" }], on: "2026-04-20" }] };
    const out = await seedWalkthrough(db, register as never, broken, { newId });
    expect(out.ok).toBe(false);
    expect((await listSites(db)).filter((s) => s.title === "Broken")).toEqual([]);
  });
});
