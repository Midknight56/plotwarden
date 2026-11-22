// T09: one transaction per commit, idempotent operations, stale revisions,
// aborts, quota, unique keys, drafts and upgrades. Uses fake-indexeddb.
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";
import { applyCore, canonicalJson, emptyCoreState, replay, checkSequence, type CoreEvent, type DraftEvent } from "../../template/src/events";
import { decideCore, type CoreCommand } from "../../template/src/commands";
import { createSite, mintId } from "../../template/src/site";
import { DB_NAME, openRegisterDb } from "../../template/src/data/db";
import { MIGRATIONS, STORE_NAMES, latestVersion, type Migration } from "../../template/src/data/migrate";
import {
  broadcastRevision,
  commit,
  listSites,
  onRevision,
  readEvents,
  readSite,
  saveNewSite,
  type CommitInput,
  type RevisionMessage,
} from "../../template/src/data/transaction";
import {
  RECOVERY_FILENAME,
  buildRecoveryFile,
  deleteDraft,
  listDrafts,
  loadDraft,
  saveDraft,
  type Draft,
} from "../../template/src/data/drafts";
import type { CoreState, Site } from "../../template/src/types";
import { FIXED_NOW, fixedClock } from "../helpers/clock";
import { failingDb, quotaError, refusingFactory, writeError } from "../helpers/failStorage";
import { fid, plotAdded } from "../helpers/site";

const ON = "2026-04-20";
const NOW = fixedClock(FIXED_NOW);

const opened: IDBDatabase[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

async function connect(factory: IDBFactory, options?: Parameters<typeof openRegisterDb>[1]): Promise<IDBDatabase> {
  const result = await openRegisterDb(factory, options);
  if (!result.ok) throw new Error(`open failed: ${JSON.stringify(result.error)}`);
  opened.push(result.value);
  return result.value;
}

function makeSite(title = "Lantern Fold"): Site {
  const result = createSite({
    id: mintId(),
    lineageId: mintId(),
    siteKey: mintId(),
    kind: "churchyard",
    title,
    zone: "Europe/London",
    createdAt: FIXED_NOW,
  });
  if (!result.ok) throw new Error("site");
  return result.value;
}

async function freshSite(title?: string): Promise<{ factory: IDBFactory; db: IDBDatabase; site: Site }> {
  const factory = new IDBFactory();
  const db = await connect(factory);
  const site = makeSite(title);
  const saved = await saveNewSite(db, site);
  if (!saved.ok) throw new Error("save site");
  return { factory, db, site };
}

function draft(event: CoreEvent): DraftEvent {
  return { event, entityIds: [], effectiveOn: ON, payloadVersion: 1 };
}

let counter = 0;
function input(site: Site, over: Partial<CommitInput> = {}): CommitInput {
  counter += 1;
  const code = `P${counter}`;
  return {
    siteId: site.id,
    expectedRevision: 0,
    opId: mintId(),
    commands: [{ type: "add_plot", code }],
    events: [draft(plotAdded(code))],
    now: NOW,
    ...over,
  };
}

function tx(db: IDBDatabase, store: string, mode: IDBTransactionMode = "readonly") {
  return db.transaction(store, mode).objectStore(store);
}

function all<T = unknown>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = tx(db, store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

function put(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, "readwrite");
    t.objectStore(store).put(value);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

async function counts(db: IDBDatabase) {
  const result: Record<string, number> = {};
  for (const name of ["sites", "events", "indexes", "uniqueKeys", "blobs", "operations"]) {
    result[name] = (await all(db, name)).length;
  }
  return result;
}

describe("T09 database and upgrades", () => {
  it("opens with the nine stores and records schema version 1", async () => {
    const db = await connect(new IDBFactory());
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(1);
    expect([...db.objectStoreNames].sort()).toEqual([...STORE_NAMES].sort());
    expect(STORE_NAMES).toHaveLength(9);
    const rows = await all<{ version: number }>(db, "migrations");
    expect(rows.map((r) => r.version)).toEqual([1]);
    expect(latestVersion(MIGRATIONS)).toBe(1);
  });

  it("returns storage_unavailable when there is no IndexedDB", async () => {
    const result = await openRegisterDb(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("storage_unavailable");
  });

  it("returns storage_unavailable when the browser refuses to open", async () => {
    const result = await openRegisterDb(refusingFactory());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("storage_unavailable");
  });

  const V2: Migration = { version: 2, up: (db) => void db.createObjectStore("extra", { keyPath: "id" }) };

  it("upgrades 1 to 2 and keeps the data, whatever order the list is in", async () => {
    const factory = new IDBFactory();
    const first = await connect(factory);
    const site = makeSite();
    await saveNewSite(first, site);
    first.close();

    const second = await connect(factory, { migrations: [V2, ...MIGRATIONS] });
    expect(second.version).toBe(2);
    expect([...second.objectStoreNames]).toContain("extra");
    expect((await readSite(second, site.id))?.title).toBe("Lantern Fold");
    const rows = await all<{ version: number }>(second, "migrations");
    expect(rows.map((r) => r.version).sort()).toEqual([1, 2]);
  });

  it("stays at version 1 with its data when an upgrade fails part way", async () => {
    const factory = new IDBFactory();
    const first = await connect(factory);
    const site = makeSite();
    await saveNewSite(first, site);
    first.close();

    const broken: Migration = {
      version: 2,
      up(db) {
        db.createObjectStore("half", { keyPath: "id" });
        throw new Error("upgrade interrupted");
      },
    };
    const failed = await openRegisterDb(factory, { migrations: [...MIGRATIONS, broken] });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error.code).toBe("upgrade_failed");

    const again = await connect(factory);
    expect(again.version).toBe(1);
    expect([...again.objectStoreNames]).not.toContain("half");
    expect((await readSite(again, site.id))?.id).toBe(site.id);
  });

  it("closes an older connection when another tab needs a newer schema", async () => {
    const factory = new IDBFactory();
    let told = 0;
    const older = await connect(factory, { onVersionChange: () => void (told += 1) });
    const newer = await connect(factory, { migrations: [...MIGRATIONS, V2] });
    expect(newer.version).toBe(2);
    expect(told).toBe(1);
    expect(() => older.transaction("sites")).toThrow();
  });

  it("says schema_too_new when the stored schema is newer than the code", async () => {
    const factory = new IDBFactory();
    await connect(factory, { migrations: [...MIGRATIONS, V2] });
    const result = await openRegisterDb(factory);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("schema_too_new");
  });
});

describe("T09 sites", () => {
  it("saves a new site at revision 0 and lists it without the sequence counter", async () => {
    const { db, site } = await freshSite();
    const row = await readSite(db, site.id);
    expect(row).toMatchObject({ id: site.id, revision: 0, lastSeq: 0, kind: "churchyard" });
    const listed = await listSites(db);
    expect(listed).toEqual([site]);
    expect(Object.keys(listed[0]!)).not.toContain("lastSeq");
  });

  it("refuses to save the same site twice", async () => {
    const { db, site } = await freshSite();
    const again = await saveNewSite(db, site);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("site_exists");
    expect(await listSites(db)).toHaveLength(1);
  });

  it("refuses a site that does not start at revision 0", async () => {
    const db = await connect(new IDBFactory());
    const result = await saveNewSite(db, { ...makeSite(), revision: 3 });
    expect(result.ok).toBe(false);
    expect(await listSites(db)).toHaveLength(0);
  });

  it("returns nothing for an unknown site", async () => {
    const { db } = await freshSite();
    expect(await readSite(db, mintId())).toBeUndefined();
  });
});

describe("T09 commit", () => {
  it("writes events with the D6 fields, raises the revision once and returns after completion", async () => {
    const { db, site } = await freshSite();
    const batch = input(site, {
      events: [draft(plotAdded("A1")), { ...draft(plotAdded("A2")), sourceRef: "book 1" }],
      newId: (() => {
        let n = 0;
        return () => fid(`commit-event:${++n}`);
      })(),
    });
    const result = await commit(db, batch);
    expect(result).toEqual({
      ok: true,
      revision: 1,
      eventIds: [fid("commit-event:1"), fid("commit-event:2")],
      replayed: false,
    });
    const events = await readEvents(db, site.id);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      eventId: fid("commit-event:1"),
      siteId: site.id,
      seq: 1,
      opId: batch.opId,
      type: "plot_added",
      recordedAt: "2026-04-20T09:30:00.000+00:00",
      effectiveOn: ON,
      payloadVersion: 1,
    });
    expect(events[1]).toMatchObject({ seq: 2, opId: batch.opId, sourceRef: "book 1" });
    const row = await readSite(db, site.id);
    expect(row).toMatchObject({ revision: 1, lastSeq: 2 });
  });

  it("continues the sequence in the next batch", async () => {
    const { db, site } = await freshSite();
    await commit(db, input(site));
    const second = await commit(db, input(site, { expectedRevision: 1, events: [draft(plotAdded("B1")), draft(plotAdded("B2"))] }));
    expect(second).toMatchObject({ ok: true, revision: 2 });
    const events = await readEvents(db, site.id);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(new Set(events.map((e) => e.opId)).size).toBe(2);
    expect(checkSequence(events, site.id).ok).toBe(true);
  });

  it("refuses a stale revision, says which is current, and writes nothing", async () => {
    const { db, site } = await freshSite();
    await commit(db, input(site));
    const before = await counts(db);
    const result = await commit(db, input(site, { expectedRevision: 0, uniqueKeys: [{ key: "code:x", owner: "o" }] }));
    expect(result).toEqual({ ok: false, error: { code: "stale_revision", current: 1 } });
    expect(await counts(db)).toEqual(before);
  });

  it("lets only one of two tabs commit against the same revision", async () => {
    const factory = new IDBFactory();
    const tabA = await connect(factory);
    const tabB = await connect(factory);
    const site = makeSite();
    await saveNewSite(tabA, site);
    const [a, b] = await Promise.all([commit(tabA, input(site)), commit(tabB, input(site))]);
    const results = [a, b];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const failed = results.find((r) => !r.ok);
    expect(failed).toMatchObject({ ok: false, error: { code: "stale_revision" } });
    expect(await readEvents(tabA, site.id)).toHaveLength(1);
    expect((await readSite(tabA, site.id))?.revision).toBe(1);
  });

  it("returns the earlier result for the same operation and writes nothing (double press)", async () => {
    const { db, site } = await freshSite();
    const batch = input(site);
    const first = await commit(db, batch);
    const again = await commit(db, { ...batch, expectedRevision: 0 });
    expect(first.ok && first.replayed).toBe(false);
    expect(again).toEqual({ ok: true, revision: 1, eventIds: first.ok ? first.eventIds : [], replayed: true });
    expect(await readEvents(db, site.id)).toHaveLength(1);
    expect((await readSite(db, site.id))?.revision).toBe(1);
  });

  it("answers the same operation with the earlier result even after the revision moved on", async () => {
    const { db, site } = await freshSite();
    const batch = input(site);
    await commit(db, batch);
    await commit(db, input(site, { expectedRevision: 1 }));
    const again = await commit(db, { ...batch, expectedRevision: 1 });
    expect(again).toMatchObject({ ok: true, revision: 1, replayed: true });
    expect((await readSite(db, site.id))?.revision).toBe(2);
  });

  it("writes once when the same operation is pressed twice at the same moment", async () => {
    const { db, site } = await freshSite();
    const batch = input(site);
    const [a, b] = await Promise.all([commit(db, batch), commit(db, batch)]);
    expect([a, b].every((r) => r.ok)).toBe(true);
    const replayedFlags = [a, b].map((r) => r.ok && r.replayed).sort();
    expect(replayedFlags).toEqual([false, true]);
    expect(await readEvents(db, site.id)).toHaveLength(1);
    expect((await readSite(db, site.id))?.revision).toBe(1);
  });

  it("refuses the same operation with different content and writes nothing", async () => {
    const { db, site } = await freshSite();
    const batch = input(site);
    await commit(db, batch);
    const before = await counts(db);
    const different = await commit(db, { ...batch, expectedRevision: 1, commands: [{ type: "add_plot", code: "OTHER" }] });
    expect(different).toEqual({ ok: false, error: { code: "op_conflict" } });
    expect(await counts(db)).toEqual(before);
  });

  it("treats the same commands in another key order as the same content", async () => {
    const { db, site } = await freshSite();
    const batch = input(site, { commands: [{ type: "add_plot", code: "Q", spaces: 2 }] });
    await commit(db, batch);
    const again = await commit(db, { ...batch, commands: [{ spaces: 2, code: "Q", type: "add_plot" }] });
    expect(again).toMatchObject({ ok: true, replayed: true });
  });

  it("returns site_missing for a site that does not exist", async () => {
    const { db } = await freshSite();
    const result = await commit(db, input(makeSite()));
    expect(result).toEqual({ ok: false, error: { code: "site_missing" } });
  });

  it("refuses a batch with no events", async () => {
    const { db, site } = await freshSite();
    const result = await commit(db, input(site, { events: [] }));
    expect(result.ok).toBe(false);
    expect((await readSite(db, site.id))?.revision).toBe(0);
  });
});

describe("T09 unique keys", () => {
  it("reserves a key for its owner", async () => {
    const { db, site } = await freshSite();
    await commit(db, input(site, { uniqueKeys: [{ key: "code:y07", owner: "plot-1" }] }));
    const rows = await all<{ siteId: string; key: string; owner: string }>(db, "uniqueKeys");
    expect(rows).toEqual([{ siteId: site.id, key: "code:y07", owner: "plot-1" }]);
  });

  it("refuses a key that belongs to another entity, names it, and writes nothing from the batch", async () => {
    const { db, site } = await freshSite();
    await commit(db, input(site, { uniqueKeys: [{ key: "code:y07", owner: "plot-1" }] }));
    const before = await counts(db);
    const result = await commit(
      db,
      input(site, {
        expectedRevision: 1,
        uniqueKeys: [
          { key: "code:fresh", owner: "plot-2" },
          { key: "code:y07", owner: "plot-2", label: "Yew Walk" },
        ],
      }),
    );
    expect(result).toEqual({ ok: false, error: { code: "key_taken", key: "code:y07", label: "Yew Walk" } });
    expect(await counts(db)).toEqual(before);
    expect((await readSite(db, site.id))?.revision).toBe(1);
  });

  it("accepts a key its owner already holds", async () => {
    const { db, site } = await freshSite();
    await commit(db, input(site, { uniqueKeys: [{ key: "code:y07", owner: "plot-1" }] }));
    const again = await commit(db, input(site, { expectedRevision: 1, uniqueKeys: [{ key: "code:y07", owner: "plot-1" }] }));
    expect(again.ok).toBe(true);
  });

  it("keeps keys apart between sites", async () => {
    const factory = new IDBFactory();
    const db = await connect(factory);
    const one = makeSite("One");
    const two = makeSite("Two");
    await saveNewSite(db, one);
    await saveNewSite(db, two);
    await commit(db, input(one, { uniqueKeys: [{ key: "code:y07", owner: "a" }] }));
    const result = await commit(db, input(two, { uniqueKeys: [{ key: "code:y07", owner: "b" }] }));
    expect(result.ok).toBe(true);
  });
});

describe("T09 indexes, blobs and other sites", () => {
  it("writes indexes and blobs in the same transaction as the events", async () => {
    const { db, site } = await freshSite();
    const bytes = new Uint8Array([1, 2, 3]);
    await commit(
      db,
      input(site, {
        indexes: [{ name: "byCode", key: "y07", value: { plotId: "p1" } }],
        blobs: [{ id: "page-1", type: "image/webp", bytes }],
      }),
    );
    const indexes = await all<{ siteId: string; name: string; key: string; value: unknown }>(db, "indexes");
    expect(indexes).toEqual([{ siteId: site.id, name: "byCode", key: "y07", value: { plotId: "p1" } }]);
    const blobs = await all<{ siteId: string; id: string; type: string; bytes: Uint8Array }>(db, "blobs");
    expect(blobs).toHaveLength(1);
    expect(blobs[0]).toMatchObject({ siteId: site.id, id: "page-1", type: "image/webp" });
    expect([...blobs[0]!.bytes]).toEqual([1, 2, 3]);
  });

  it("writes none of them when the commit is refused", async () => {
    const { db, site } = await freshSite();
    await commit(db, input(site));
    const before = await counts(db);
    const refused = await commit(
      db,
      input(site, {
        expectedRevision: 0,
        indexes: [{ name: "byCode", key: "q", value: 1 }],
        blobs: [{ id: "b", type: "image/png", bytes: new Uint8Array([9]) }],
      }),
    );
    expect(refused.ok).toBe(false);
    expect(await counts(db)).toEqual(before);
  });

  it("a commit to one site never changes another site (own and walkthrough)", async () => {
    const factory = new IDBFactory();
    const db = await connect(factory);
    const own = makeSite("Own");
    const walk = { ...makeSite("Practice"), workspace: "walkthrough" as const };
    await saveNewSite(db, own);
    await saveNewSite(db, walk);
    const ownBefore = JSON.stringify(await readSite(db, own.id));
    await commit(db, input(walk));
    expect(JSON.stringify(await readSite(db, own.id))).toBe(ownBefore);
    expect(await readEvents(db, own.id)).toEqual([]);
    expect(await readEvents(db, walk.id)).toHaveLength(1);
  });
});

describe("T09 failures never report success", () => {
  const plans = [
    { name: "a failed event write", store: "events", method: "add", error: writeError(), code: "storage_abort" },
    { name: "a full disk on the event write", store: "events", method: "add", error: quotaError(), code: "quota" },
    { name: "a full disk on the operation record", store: "operations", method: "put", error: quotaError(), code: "quota" },
    { name: "a failed site update", store: "sites", method: "put", error: writeError(), code: "storage_abort" },
  ] as const;

  it.each(plans)("says $code after $name and leaves every store as it was", async (plan) => {
    const { db, site } = await freshSite();
    const before = await counts(db);
    const bad = failingDb(db, { store: plan.store, method: plan.method, error: plan.error });
    const batch = input(site, { uniqueKeys: [{ key: "code:p", owner: "o" }], indexes: [{ name: "n", key: "k", value: 1 }] });
    const result = await commit(bad, batch);
    expect(result).toEqual({ ok: false, error: { code: plan.code } });
    expect(await counts(db)).toEqual(before);
    expect((await readSite(db, site.id))?.revision).toBe(0);

    // The same operation can be tried again once storage works.
    const retry = await commit(db, batch);
    expect(retry).toMatchObject({ ok: true, revision: 1, replayed: false });
  });

  it("keeps the input in memory and builds a recovery file from it", async () => {
    const { db, site } = await freshSite();
    const bad = failingDb(db, { store: "events", method: "add", error: writeError() });
    const batch = input(site);
    const result = await commit(bad, batch);
    expect(result.ok).toBe(false);
    const file = buildRecoveryFile({
      draftId: mintId(),
      siteId: site.id,
      kind: site.kind,
      baseRevision: batch.expectedRevision,
      rawRows: [],
      mapping: {},
      currentRow: 0,
      commands: batch.commands as unknown[],
      pageImageNeedsReselect: false,
      savedAt: FIXED_NOW,
    });
    expect(JSON.parse(file.text).commands).toEqual(batch.commands);
  });

  it("is all or nothing when the connection closes during a write (refresh)", async () => {
    const { factory, db, site } = await freshSite();
    const pending = commit(db, input(site));
    db.close();
    const result = await pending;
    const check = await connect(factory);
    const row = await readSite(check, site.id);
    const events = await readEvents(check, site.id);
    if (result.ok) {
      expect(row?.revision).toBe(1);
      expect(events).toHaveLength(1);
    } else {
      expect(result.error.code).toBe("storage_abort");
      expect(row?.revision).toBe(0);
      expect(events).toHaveLength(0);
    }
  });
});

describe("T09 limits", () => {
  async function withLastSeq(n: number) {
    const ctx = await freshSite();
    const row = await readSite(ctx.db, ctx.site.id);
    await put(ctx.db, "sites", { ...row, lastSeq: n });
    return ctx;
  }

  it("accepts the 100,000th event", async () => {
    const { db, site } = await withLastSeq(99_999);
    const result = await commit(db, input(site));
    expect(result).toMatchObject({ ok: true, revision: 1 });
    expect((await readSite(db, site.id))?.lastSeq).toBe(100_000);
  });

  it("refuses the 100,001st event and writes nothing", async () => {
    const { db, site } = await withLastSeq(100_000);
    const before = await counts(db);
    const result = await commit(db, input(site));
    expect(result).toEqual({ ok: false, error: { code: "over_limit" } });
    expect(await counts(db)).toEqual(before);
  });

  it("refuses a batch that would cross the limit", async () => {
    const { db, site } = await withLastSeq(99_999);
    const result = await commit(db, input(site, { events: [draft(plotAdded("X1")), draft(plotAdded("X2"))] }));
    expect(result).toEqual({ ok: false, error: { code: "over_limit" } });
  });
});

describe("T09 replay from the database equals the state in memory", () => {
  it("rebuilds the same state after several batches", async () => {
    const { db, site } = await freshSite();
    const ctx = { spacesPerPlot: { min: 1, max: 12 } };
    let state: CoreState = emptyCoreState(site.id);
    let revision = 0;
    const commands: CoreCommand[] = [
      { type: "add_plot", plotId: fid("rp:1"), code: "Y01", spaces: [{ spaceId: fid("rs:1") }] },
      { type: "add_plot", plotId: fid("rp:2"), code: "Y02", spaces: [{ spaceId: fid("rs:2") }, { spaceId: fid("rs:3") }] },
      { type: "confirm_empty", spaceIds: [fid("rs:2")] },
      { type: "add_claim", claimId: "c1", spaceId: fid("rs:1"), mode: "taken", endable: false, start: "1874-03-03", sourceRef: "book 1" },
      { type: "rename_plot", plotId: fid("rp:1"), code: "Z01" },
    ];
    for (const command of commands) {
      const decided = decideCore(state, command, ON, ctx);
      if (!decided.ok) throw new Error(JSON.stringify(decided.error));
      const result = await commit(db, {
        siteId: site.id,
        expectedRevision: revision,
        opId: mintId(),
        commands: [command],
        events: decided.value,
        now: NOW,
      });
      expect(result.ok).toBe(true);
      revision += 1;
      state = decided.value.reduce((s, d) => applyCore(s, d.event), state);
    }
    const stored = await readEvents(db, site.id);
    const replayed = replay<CoreState, CoreEvent>(applyCore, emptyCoreState(site.id), stored);
    expect(replayed.ok && replayed.value).toEqual(state);
    expect((await readSite(db, site.id))?.revision).toBe(5);
  });
});

describe("T09 telling other tabs", () => {
  it("sends the new revision only after the commit is complete", async () => {
    const { factory, db, site } = await freshSite();
    const other = await connect(factory);
    const seen: { message: RevisionMessage; storedRevision: number | undefined }[] = [];
    const stop = onRevision(async (message) => {
      const row = await readSite(other, message.siteId);
      seen.push({ message, storedRevision: row?.revision });
    });
    await commit(db, input(site));
    await new Promise((r) => setTimeout(r, 80));
    stop();
    expect(seen).toEqual([{ message: { siteId: site.id, revision: 1 }, storedRevision: 1 }]);
  });

  it("sends nothing when the commit fails", async () => {
    const { db, site } = await freshSite();
    const messages: RevisionMessage[] = [];
    const stop = onRevision((m) => void messages.push(m));
    const bad = failingDb(db, { store: "events", method: "add", error: writeError() });
    await commit(bad, input(site));
    await commit(db, input(site, { expectedRevision: 5 }));
    await new Promise((r) => setTimeout(r, 80));
    stop();
    expect(messages).toEqual([]);
  });

  it("carries a message from one tab to another", async () => {
    const messages: RevisionMessage[] = [];
    const stop = onRevision((m) => void messages.push(m));
    broadcastRevision({ siteId: "s", revision: 7 });
    await new Promise((r) => setTimeout(r, 80));
    stop();
    expect(messages).toEqual([{ siteId: "s", revision: 7 }]);
  });
});

describe("T09 drafts stay apart from the register", () => {
  function sample(site: Site, over: Partial<Draft> = {}): Draft {
    return {
      draftId: mintId(),
      siteId: site.id,
      kind: site.kind,
      baseRevision: 0,
      rawRows: [{ ref: "R001", name: "Mirel Quillmoss" }],
      mapping: { ref: "sourceRef" },
      currentRow: 1,
      commands: [{ type: "add_plot", code: "C001" }],
      pageImageNeedsReselect: true,
      savedAt: FIXED_NOW,
      ...over,
    };
  }

  it("saves, loads, lists and deletes by site without touching revision or events", async () => {
    const { db, site } = await freshSite();
    const d = sample(site);
    expect(await saveDraft(db, d)).toEqual({ ok: true, value: true });
    expect(await loadDraft(db, site.id, d.draftId)).toEqual(d);
    expect(await listDrafts(db, site.id)).toEqual([d]);
    expect((await readSite(db, site.id))?.revision).toBe(0);
    expect(await readEvents(db, site.id)).toEqual([]);
    await deleteDraft(db, site.id, d.draftId);
    expect(await loadDraft(db, site.id, d.draftId)).toBeUndefined();
    expect(await listDrafts(db, site.id)).toEqual([]);
  });

  it("replaces a draft with the same ID", async () => {
    const { db, site } = await freshSite();
    const d = sample(site);
    await saveDraft(db, d);
    await saveDraft(db, { ...d, currentRow: 9 });
    expect((await listDrafts(db, site.id)).map((x) => x.currentRow)).toEqual([9]);
  });

  it("lists only the drafts of one site", async () => {
    const { db, site } = await freshSite();
    const other = makeSite("Other");
    await saveNewSite(db, other);
    await saveDraft(db, sample(site));
    await saveDraft(db, sample(other));
    expect(await listDrafts(db, site.id)).toHaveLength(1);
    expect(await listDrafts(db, other.id)).toHaveLength(1);
  });

  it("says quota when a draft cannot be saved", async () => {
    const { db, site } = await freshSite();
    const bad = failingDb(db, { store: "drafts", method: "put", error: quotaError() });
    const result = await saveDraft(bad, sample(site));
    expect(result).toMatchObject({ ok: false, error: { code: "quota" } });
    expect(await listDrafts(db, site.id)).toEqual([]);
  });

  it("builds a recovery file with a fixed name and no private value in the name", () => {
    const site = makeSite();
    const d = sample(site);
    const file = buildRecoveryFile(d);
    expect(file.filename).toBe(RECOVERY_FILENAME);
    expect(file.filename).toBe("register-recovery.json");
    expect(file.filename).not.toContain(site.id);
    expect(file.filename).not.toContain("Quillmoss");
  });

  it("writes the plot.draft.v1 fields and no others, as canonical JSON", () => {
    const site = makeSite();
    const d = sample(site);
    const file = buildRecoveryFile(d);
    const parsed = JSON.parse(file.text) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      ["baseRevision", "commands", "currentRow", "format", "kind", "mapping", "pageImageNeedsReselect", "rawRows", "siteId"].sort(),
    );
    expect(parsed).toMatchObject({
      format: "plot.draft.v1",
      kind: "churchyard",
      siteId: site.id,
      baseRevision: 0,
      currentRow: 1,
      pageImageNeedsReselect: true,
    });
    expect(file.text).toBe(canonicalJson(parsed));
    expect(buildRecoveryFile(d).text).toBe(file.text);
    expect(file.text).not.toContain(d.draftId);
  });
});
