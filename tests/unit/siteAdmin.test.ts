// T02 support: removing exactly one register after a typed name, and the display zone. Requirements P14.4, P14.5.
import { describe, expect, it } from "vitest";
import { requestResult } from "../../template/src/data/db";
import { loadDraft, saveDraft } from "../../template/src/data/drafts";
import type { Draft } from "../../template/src/data/drafts";
import { readBlob, readBlobs, removeSite, setSiteZone } from "../../template/src/data/siteAdmin";
import { commit, listSites, readEvents, readSite, saveNewSite } from "../../template/src/data/transaction";
import { createSite, mintId } from "../../template/src/site";
import type { Site } from "../../template/src/types";
import { PaperEnv } from "../helpers/paperAdapter";
import { FIXED_NOW, fixedClock } from "../helpers/clock";

async function addSite(db: IDBDatabase, title: string): Promise<Site> {
  const made = createSite({ id: mintId(), lineageId: mintId(), siteKey: mintId(), kind: "paper", title, zone: "Europe/London", createdAt: FIXED_NOW });
  if (!made.ok) throw new Error("site");
  const saved = await saveNewSite(db, made.value);
  if (!saved.ok) throw new Error("save");
  return made.value;
}

async function fill(db: IDBDatabase, site: Site, blobByte: number) {
  const result = await commit(db, {
    siteId: site.id,
    expectedRevision: 0,
    opId: mintId(),
    commands: [{ site: site.title }],
    events: [
      { event: { type: "north_set", degrees: 5 } as { type: string }, entityIds: [], payloadVersion: 1, effectiveOn: "2026-01-01" },
      { event: { type: "north_set", degrees: 6 } as { type: string }, entityIds: [], payloadVersion: 1, effectiveOn: "2026-01-01" },
    ],
    uniqueKeys: [{ key: `code:${site.title}`, owner: site.id }],
    blobs: [{ id: `blob-${site.title}`, type: "image/png", bytes: new Uint8Array([blobByte, blobByte, blobByte]) }],
    now: fixedClock(FIXED_NOW),
  });
  if (!result.ok) throw new Error(`commit ${JSON.stringify(result.error)}`);
  const draft: Draft = {
    draftId: mintId(),
    siteId: site.id,
    kind: "paper",
    baseRevision: 1,
    rawRows: [{ a: "b" }],
    mapping: {},
    currentRow: 0,
    commands: [],
    pageImageNeedsReselect: false,
    savedAt: FIXED_NOW,
  };
  await saveDraft(db, draft);
  return draft;
}

async function countAll(db: IDBDatabase, store: string): Promise<number> {
  return (await requestResult(db.transaction(store).objectStore(store).count())) as number;
}

describe("reading blobs", () => {
  it("reads one blob and all blobs of a site", async () => {
    const env = await PaperEnv.create("Lantern");
    await fill(env.db, env.site, 7);
    const one = await readBlob(env.db, env.site.id, "blob-Lantern");
    expect(one).toEqual({ id: "blob-Lantern", type: "image/png", bytes: new Uint8Array([7, 7, 7]) });
    expect((await readBlobs(env.db, env.site.id)).map((b) => b.id)).toEqual(["blob-Lantern"]);
    expect(await readBlob(env.db, env.site.id, "none")).toBeUndefined();
  });
});

describe("removing one register", () => {
  it("refuses until the typed name is the title, and removes nothing", async () => {
    const env = await PaperEnv.create("Lantern");
    await fill(env.db, env.site, 7);
    const wrong = await removeSite(env.db, env.site.id, "lantern fold");
    expect(!wrong.ok && wrong.error.code).toBe("title_mismatch");
    const empty = await removeSite(env.db, env.site.id, "");
    expect(!empty.ok && empty.error.code).toBe("title_mismatch");
    expect(await readSite(env.db, env.site.id)).toBeDefined();
    expect((await readEvents(env.db, env.site.id)).length).toBe(2);
  });

  it("removes every row of that register and no row of another", async () => {
    const env = await PaperEnv.create("Lantern");
    const other = await addSite(env.db, "Thimble");
    const draftA = await fill(env.db, env.site, 7);
    const draftB = await fill(env.db, other, 9);
    const sitesBefore = (await listSites(env.db)).length;
    expect(sitesBefore).toBe(2);

    const removed = await removeSite(env.db, env.site.id, " Lantern ");
    expect(removed).toEqual({ ok: true, value: { events: 2, blobs: 1, uniqueKeys: 1, operations: 1, drafts: 1 } });

    expect(await readSite(env.db, env.site.id)).toBeUndefined();
    expect(await readEvents(env.db, env.site.id)).toEqual([]);
    expect(await readBlobs(env.db, env.site.id)).toEqual([]);
    expect(await loadDraft(env.db, env.site.id, draftA.draftId)).toBeUndefined();

    expect((await listSites(env.db)).map((s) => s.title)).toEqual(["Thimble"]);
    expect((await readEvents(env.db, other.id)).length).toBe(2);
    expect((await readBlobs(env.db, other.id)).length).toBe(1);
    expect(await loadDraft(env.db, other.id, draftB.draftId)).toBeDefined();
    expect(await countAll(env.db, "uniqueKeys")).toBe(1);
    expect(await countAll(env.db, "operations")).toBe(1);
    expect(await countAll(env.db, "events")).toBe(2);
    expect(await countAll(env.db, "migrations")).toBe(1);
  });

  it("says so when the register is not there", async () => {
    const env = await PaperEnv.create("Lantern");
    const r = await removeSite(env.db, mintId(), "x");
    expect(!r.ok && r.error.code).toBe("site_missing");
  });
});

describe("the display zone", () => {
  it("changes the zone and nothing else", async () => {
    const env = await PaperEnv.create("Lantern");
    await fill(env.db, env.site, 7);
    const before = await readSite(env.db, env.site.id);
    const events = await readEvents(env.db, env.site.id);
    const r = await setSiteZone(env.db, env.site.id, "America/Toronto");
    expect(r).toEqual({ ok: true, value: true });
    const after = await readSite(env.db, env.site.id);
    expect(after).toEqual({ ...before, zone: "America/Toronto" });
    expect(after?.revision).toBe(before?.revision);
    expect(await readEvents(env.db, env.site.id)).toEqual(events);
  });

  it("refuses a zone that does not exist and a register that is not there", async () => {
    const env = await PaperEnv.create("Lantern");
    const bad = await setSiteZone(env.db, env.site.id, "Mars/Olympus");
    expect(!bad.ok && bad.error.code).toBe("bad_zone");
    expect((await readSite(env.db, env.site.id))?.zone).toBe("Europe/London");
    const none = await setSiteZone(env.db, mintId(), "Europe/London");
    expect(!none.ok && none.error.code).toBe("site_missing");
  });
});
