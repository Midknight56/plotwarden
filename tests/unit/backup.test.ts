// T10 (backup, verify, staged restore) and the archive bounds of T32. Requirements P13.
// A register is built through the paper test adapter, backed up, damaged on purpose and restored.
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  backupFilename,
  buildBackup,
  classifyFile,
  collectBlobRefs,
  compareLineage,
  exportBackup,
  restoreBackup,
  verifyBackup,
} from "../../template/src/data/backup";
import type { BackupMigration, VerifiedBackup } from "../../template/src/data/backup";
import { openRegisterDb, requestResult } from "../../template/src/data/db";
import { readBlobs } from "../../template/src/data/siteAdmin";
import { commit, listSites, readEvents, readSite } from "../../template/src/data/transaction";
import type { StoredEvent } from "../../template/src/events";
import { DEFAULT_BACKDROP } from "../../template/src/map/coordinates";
import { LIMITS } from "../../template/src/limits";
import { mintId } from "../../template/src/site";
import type { Site } from "../../template/src/types";
import { failingDb, quotaError } from "../helpers/failStorage";
import { PAPER_KIND, PaperEnv } from "../helpers/paperAdapter";
import type { PaperState } from "../helpers/paperAdapter";
import { unzipSync } from "fflate";
import { ascii, forgeBackup, makeJpeg, makePng, zipSync, zipWithNames } from "../helpers/paperFiles";
import { FIXED_NOW, fixedClock } from "../helpers/clock";
import { fid } from "../helpers/site";

const ON = "2026-04-20";
const PLAN = makePng({ width: 120, height: 80 });
const PHOTO = makeJpeg({ width: 300, height: 200 });
const KIND = { kind: PAPER_KIND };

/** A register with a layout, a backdrop, a placed and an unplaced burial, a photo and a correction. */
async function register(title = "Lantern Fold"): Promise<PaperEnv> {
  const env = await PaperEnv.create(title);
  const codes = ["P01", "P02", "P03"];
  await env.dispatch([
    {
      type: "layout_apply",
      sections: [{ sectionId: "00000000-0000-4000-8000-0000000000e1", name: "Paper" }],
      plots: codes.map((code) => ({
        plotId: fid(`plot:${code}`),
        code,
        sectionId: "00000000-0000-4000-8000-0000000000e1",
        spaces: [{ spaceId: fid(`space:${code}`) }],
      })),
      gate: { name: "Lantern Gate", at: [10, 10] },
    },
  ]);
  await env.dispatch([{ type: "set_backdrop", blobId: "plan-1", transform: DEFAULT_BACKDROP }], ON, mintId(), [{ id: "plan-1", type: "image/png", bytes: PLAN }]);
  await env.dispatch([
    { type: "record_burial", burialId: fid("b1"), claimId: fid("c1"), plotId: fid("plot:P01"), spaceId: fid("space:P01"), sourceRef: "R1", name: "Alder Ashgrove", dateText: "1850", page: "P1", normalized: { sourceRef: "R1" } },
    { type: "record_burial", burialId: fid("b2"), sourceRef: "R2", name: "Cove Ashgrove", dateText: "unknown", page: "P1", normalized: { sourceRef: "R2" } },
  ]);
  await env.dispatch(
    [{ type: "add_photo", photoId: "ph1", plotId: fid("plot:P01"), blobId: "photo-1", imageType: "jpeg", width: 300, height: 200, bytes: PHOTO.length, caption: { text: "A stone in snow" } }],
    ON,
    mintId(),
    [{ id: "photo-1", type: "image/jpeg", bytes: PHOTO }],
  );
  const events = await readEvents(env.db, env.site.id);
  const claimEvent = events.find((e) => e.type === "claim_added") as StoredEvent;
  await env.dispatch([{ type: "void_claim", claimId: fid("c1"), correctsEventId: claimEvent.eventId, reason: "Entered twice" }]);
  return env;
}

async function parts(env: PaperEnv) {
  const site = (await readSite(env.db, env.site.id)) as Site;
  const events = await readEvents(env.db, env.site.id);
  const blobs = await readBlobs(env.db, env.site.id);
  return { site, events, blobs };
}

async function backupOf(env: PaperEnv): Promise<Uint8Array> {
  const made = await exportBackup(env.db, env.site.id, "2026-04-20T09:30:00+00:00");
  if (!made.ok) throw new Error(JSON.stringify(made.error));
  return made.value.bytes;
}

async function verified(bytes: Uint8Array, kind = PAPER_KIND): Promise<VerifiedBackup> {
  const r = await verifyBackup(bytes, { kind });
  if (!r.ok) throw new Error(`verify refused: ${JSON.stringify(r.error)}`);
  return r.value;
}

async function code(bytes: Uint8Array, options: Parameters<typeof verifyBackup>[1] = KIND): Promise<string> {
  const r = await verifyBackup(bytes, options);
  return r.ok ? "ok" : r.error.code;
}

async function freshDb(): Promise<IDBDatabase> {
  const opened = await openRegisterDb(new IDBFactory());
  if (!opened.ok) throw new Error("storage");
  return opened.value;
}

/** A state with the site ID blanked, so a copy under a new ID compares equal. */
function plain(state: PaperState, siteId: string): unknown {
  return JSON.parse(JSON.stringify(state).split(siteId).join("SITE"));
}

describe("writing a backup", () => {
  it("is a zip with the manifest, the site, the events and one entry for each image", async () => {
    const env = await register();
    const bytes = await backupOf(env);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const v = await verified(bytes);
    expect(v.manifest.format).toBe("plot.backup.v1");
    expect(v.manifest.schemaVersion).toBe(1);
    expect(v.manifest.entries.map((e) => e.path).sort()).toEqual(["events.json", "images/photo-1.jpg", "images/plan-1.png", "site.json"]);
    expect(v.manifest.counts).toEqual({ events: v.events.length, images: 2 });
    expect(v.manifest.revision).toBe(env.revision);
    for (const entry of v.manifest.entries) expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives the same bytes for the same register", async () => {
    const env = await register();
    const input = await parts(env);
    const a = await buildBackup({ ...input, createdAt: FIXED_NOW });
    const b = await buildBackup({ ...input, createdAt: FIXED_NOW });
    expect(a).toEqual(b);
  });

  it("holds the site, the events and the image bytes exactly", async () => {
    const env = await register();
    const input = await parts(env);
    const v = await verified(await backupOf(env));
    const { lastSeq: _lastSeq, ...siteRow } = input.site as Site & { lastSeq: number };
    expect(v.site).toEqual(siteRow);
    expect(v.events).toEqual(input.events);
    expect(v.blobs.map((b) => [b.id, b.type, [...b.bytes]]).sort()).toEqual(input.blobs.map((b) => [b.id, b.type, [...b.bytes]]).sort());
  });

  it("carries the settings the restore needs", async () => {
    const env = await register();
    const made = await exportBackup(env.db, env.site.id, FIXED_NOW, { motion: "reduce", paper: "A4" });
    if (!made.ok) throw new Error("export");
    expect((await verified(made.value.bytes)).manifest.settings).toEqual({ motion: "reduce", paper: "A4" });
  });

  it("names the file by its date and nothing private", () => {
    expect(backupFilename("2026-04-20")).toBe("register-backup-2026-04-20.pkr.zip");
  });

  it("says the register is not there", async () => {
    const env = await register();
    const r = await exportBackup(env.db, mintId(), FIXED_NOW);
    expect(!r.ok && r.error.code).toBe("site_missing");
  });
});

describe("restoring as a new register", () => {
  it("gives the same state under a new site ID and a new exchange key, with every record ID kept", async () => {
    const env = await register();
    const bytes = await backupOf(env);
    const target = await freshDb();
    const restored = await restoreBackup(target, await verified(bytes), { mode: "new" });
    if (!restored.ok) throw new Error(JSON.stringify(restored.error));
    expect(restored.value).toMatchObject({ title: "Lantern Fold", revision: env.revision, events: (await readEvents(env.db, env.site.id)).length, images: 2, rotatedKey: true, forked: false });
    expect(restored.value.siteId).not.toBe(env.site.id);

    const site = (await readSite(target, restored.value.siteId)) as Site;
    expect(site.siteKey).not.toBe(env.site.siteKey);
    expect(site.lineageId).toBe(env.site.lineageId);
    expect(site.revision).toBe(env.revision);
    const events = await readEvents(target, site.id);
    const replayed = env.register.replay(site, events);
    if (!replayed.ok) throw new Error("replay");
    expect(plain(replayed.value, site.id)).toEqual(plain(env.state, env.site.id));
    expect(Object.keys(replayed.value.core.plots)).toEqual(Object.keys(env.state.core.plots));
  });

  it("keeps the attached images, byte for byte, with their IDs", async () => {
    const env = await register();
    const target = await freshDb();
    const restored = await restoreBackup(target, await verified(await backupOf(env)), { mode: "new" });
    if (!restored.ok) throw new Error("restore");
    const blobs = await readBlobs(target, restored.value.siteId);
    expect(blobs.map((b) => b.id).sort()).toEqual(["photo-1", "plan-1"]);
    expect([...(blobs.find((b) => b.id === "photo-1")?.bytes ?? [])]).toEqual([...PHOTO]);
    expect([...(blobs.find((b) => b.id === "plan-1")?.bytes ?? [])]).toEqual([...PLAN]);
  });

  it("gives every event a new ID and points each correction at the new ID of its original", async () => {
    const env = await register();
    const original = await readEvents(env.db, env.site.id);
    const target = await freshDb();
    const restored = await restoreBackup(target, await verified(await backupOf(env)), { mode: "new" });
    if (!restored.ok) throw new Error("restore");
    const copy = await readEvents(target, restored.value.siteId);
    expect(copy.length).toBe(original.length);
    expect(copy.every((e) => e.siteId === restored.value.siteId)).toBe(true);
    expect(copy.some((e) => original.some((o) => o.eventId === e.eventId))).toBe(false);
    original.forEach((o, i) => {
      const c = copy[i] as StoredEvent;
      expect([c.seq, c.type, c.opId, c.recordedAt, c.payloadVersion, c.sourceRef]).toEqual([o.seq, o.type, o.opId, o.recordedAt, o.payloadVersion, o.sourceRef]);
      expect(c.payload).toEqual(o.payload);
    });
    const voided = copy.find((e) => e.corrects !== undefined) as StoredEvent;
    expect(copy.find((e) => e.eventId === voided.corrects)?.type).toBe("claim_added");
  });

  it("can sit beside the register it came from, and says so", async () => {
    const env = await register();
    const eventsBefore = await readEvents(env.db, env.site.id);
    const restored = await restoreBackup(env.db, await verified(await backupOf(env)), { mode: "new" });
    if (!restored.ok) throw new Error(JSON.stringify(restored.error));
    expect(restored.value.forked).toBe(true);
    expect((await listSites(env.db)).length).toBe(2);
    expect(await readEvents(env.db, env.site.id)).toEqual(eventsBefore);
    expect(await readSite(env.db, env.site.id)).toMatchObject({ siteKey: env.site.siteKey, revision: env.revision });
  });

  it("rebuilds the unique keys, so a taken code is still taken, and accepts the next change", async () => {
    const env = await register();
    const target = await freshDb();
    const restored = await restoreBackup(target, await verified(await backupOf(env)), { mode: "new" });
    if (!restored.ok) throw new Error("restore");
    const keys = ((await requestResult(target.transaction("uniqueKeys").objectStore("uniqueKeys").getAll())) as { key: string }[]).map((k) => k.key);
    expect(keys).toEqual(expect.arrayContaining(["code:p01", "code:p02", "code:p03", "source:Burials:R1", "source:Burials:R2"]));
    const taken = await commit(target, {
      siteId: restored.value.siteId,
      expectedRevision: restored.value.revision,
      opId: mintId(),
      commands: ["x"],
      events: [{ event: { type: "plot_added", plotId: "new-plot", code: "p01", spaces: [] } as { type: string }, entityIds: ["new-plot"], payloadVersion: 1 }],
      uniqueKeys: [{ key: "code:p01", owner: "new-plot" }],
    });
    expect(!taken.ok && taken.error.code).toBe("key_taken");
    const next = await commit(target, {
      siteId: restored.value.siteId,
      expectedRevision: restored.value.revision,
      opId: mintId(),
      commands: ["y"],
      events: [{ event: { type: "north_set", degrees: 9 } as { type: string }, entityIds: [], payloadVersion: 1 }],
      now: fixedClock(FIXED_NOW),
    });
    expect(next).toMatchObject({ ok: true, revision: restored.value.revision + 1 });
  });

  it("writes nothing when storage is full, and leaves every other register alone", async () => {
    const env = await register();
    const target = await freshDb();
    const other = await register("Thimble Beds");
    const otherRestore = await restoreBackup(target, await verified(await backupOf(other)), { mode: "new" });
    if (!otherRestore.ok) throw new Error("restore");
    const before = await listSites(target);
    const eventsBefore = await readEvents(target, otherRestore.value.siteId);
    const full = failingDb(target, { store: "events", method: "add", error: quotaError(), skip: 3 });
    const r = await restoreBackup(full, await verified(await backupOf(env)), { mode: "new" });
    expect(r).toMatchObject({ ok: false, error: { code: "quota" } });
    expect(await listSites(target)).toEqual(before);
    expect(await readEvents(target, otherRestore.value.siteId)).toEqual(eventsBefore);
    expect(((await requestResult(target.transaction("events").objectStore("events").count())) as number)).toBe(eventsBefore.length);
  });
});

describe("restoring this register", () => {
  async function setup() {
    const env = await register();
    const early = await backupOf(env);
    await env.dispatch([{ type: "layout_apply", north: 40 }]);
    return { env, early };
  }

  it("refuses a backup of another register", async () => {
    const { env } = await setup();
    const other = await register("Other");
    const r = await restoreBackup(env.db, await verified(await backupOf(other)), { mode: "replace", currentSiteId: env.site.id, typedTitle: "Lantern Fold" });
    expect(!r.ok && r.error.code).toBe("foreign_site");
  });

  it("refuses a backup of the same site ID under another lineage", async () => {
    const { env } = await setup();
    const input = await parts(env);
    const lineage = mintId();
    const forged = await forgeBackup(input, { manifest: (m) => ({ ...m, lineageId: lineage }), site: (s) => ({ ...s, lineageId: lineage }) });
    const r = await restoreBackup(env.db, await verified(forged), { mode: "replace", currentSiteId: env.site.id, typedTitle: "Lantern Fold" });
    expect(!r.ok && r.error.code).toBe("foreign_site");
  });

  it("needs the typed name, and changes nothing without it", async () => {
    const { env, early } = await setup();
    const events = await readEvents(env.db, env.site.id);
    const r = await restoreBackup(env.db, await verified(early), { mode: "replace", currentSiteId: env.site.id, typedTitle: "Lantern" });
    expect(!r.ok && r.error.code).toBe("title_mismatch");
    expect(await readEvents(env.db, env.site.id)).toEqual(events);
  });

  it("goes back to the earlier copy, rotates the exchange key and says so", async () => {
    const { env, early } = await setup();
    const keyBefore = env.site.siteKey;
    const earlier = await verified(early);
    const r = await restoreBackup(env.db, earlier, { mode: "replace", currentSiteId: env.site.id, typedTitle: " Lantern Fold " });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.value).toMatchObject({ siteId: env.site.id, rotatedKey: true, relation: "backward", revision: earlier.manifest.revision });
    const site = (await readSite(env.db, env.site.id)) as Site;
    expect(site.siteKey).not.toBe(keyBefore);
    expect(site.revision).toBe(earlier.manifest.revision);
    expect(await readEvents(env.db, env.site.id)).toEqual(earlier.events);
    expect((await readBlobs(env.db, env.site.id)).length).toBe(2);
  });

  it("keeps the key when the backup is the same copy or a later one", async () => {
    const env = await register();
    const input = await parts(env);
    const same = await restoreBackup(env.db, await verified(await backupOf(env)), { mode: "replace", currentSiteId: env.site.id, typedTitle: "Lantern Fold" });
    expect(same).toMatchObject({ ok: true, value: { relation: "same", rotatedKey: false } });

    const last = input.events[input.events.length - 1] as StoredEvent;
    const later: StoredEvent = { ...last, eventId: mintId(), seq: last.seq + 1, opId: mintId(), type: "north_set", payload: { degrees: 77 }, entityIds: [] };
    const forward = await forgeBackup(input, {
      events: (e) => [...e, later],
      manifest: (m) => ({ ...m, revision: (m["revision"] as number) + 1, counts: { events: input.events.length + 1, images: 2 } }),
      site: (s) => ({ ...s, revision: (s["revision"] as number) + 1 }),
    });
    const r = await restoreBackup(env.db, await verified(forward), { mode: "replace", currentSiteId: env.site.id, typedTitle: "Lantern Fold" });
    expect(r).toMatchObject({ ok: true, value: { relation: "forward", rotatedKey: false } });
    expect((await readSite(env.db, env.site.id))?.siteKey).toBe(env.site.siteKey);
    expect((await readSite(env.db, env.site.id))?.revision).toBe(env.revision + 1);
  });

  it("rotates the key when the copies differ at some event, which is a fork", async () => {
    const env = await register();
    const input = await parts(env);
    const forked = await forgeBackup(input, { events: (e) => e.map((x, i) => (i === e.length - 1 ? { ...(x as object), eventId: mintId() } : x)) });
    const r = await restoreBackup(env.db, await verified(forked), { mode: "replace", currentSiteId: env.site.id, typedTitle: "Lantern Fold" });
    expect(r).toMatchObject({ ok: true, value: { relation: "fork", rotatedKey: true } });
  });

  it("writes nothing when storage is full, and the register stays as it was", async () => {
    const { env, early } = await setup();
    const siteBefore = await readSite(env.db, env.site.id);
    const eventsBefore = await readEvents(env.db, env.site.id);
    const blobsBefore = await readBlobs(env.db, env.site.id);
    const full = failingDb(env.db, { store: "events", method: "add", error: quotaError(), skip: 2 });
    const r = await restoreBackup(full, await verified(early), { mode: "replace", currentSiteId: env.site.id, typedTitle: "Lantern Fold" });
    expect(r).toMatchObject({ ok: false, error: { code: "quota" } });
    expect(await readSite(env.db, env.site.id)).toEqual(siteBefore);
    expect(await readEvents(env.db, env.site.id)).toEqual(eventsBefore);
    expect(await readBlobs(env.db, env.site.id)).toEqual(blobsBefore);
  });
});

describe("a backup that is damaged, wrong or too new", () => {
  async function base() {
    const env = await register();
    return { env, input: await parts(env), bytes: await backupOf(env) };
  }

  it("refuses a truncated archive", async () => {
    const { bytes } = await base();
    expect(await code(bytes.slice(0, Math.floor(bytes.length / 2)))).toBe("corrupt");
    expect(await code(bytes.slice(0, 30))).toBe("corrupt");
  });

  it("refuses a changed byte in an image, in the events or in the site", async () => {
    const { input } = await base();
    const flip = (b: Uint8Array) => {
      const c = new Uint8Array(b);
      c[Math.floor(c.length / 2)] = (c[Math.floor(c.length / 2)] as number) ^ 1;
      return c;
    };
    expect(await code(await forgeBackup(input, { tamper: { "images/photo-1.jpg": flip } }))).toBe("corrupt");
    expect(await code(await forgeBackup(input, { tamper: { "events.json": flip } }))).toBe("corrupt");
    expect(await code(await forgeBackup(input, { tamper: { "site.json": flip } }))).toBe("corrupt");
  });

  it("refuses an entry that is listed and missing, one that is there and not listed, and a length that is wrong", async () => {
    const { input } = await base();
    expect(await code(await forgeBackup(input, { dropFiles: ["images/plan-1.png"] }))).toBe("corrupt");
    expect(await code(await forgeBackup(input, { unlisted: { "images/extra-1.png": PLAN } }))).toBe("corrupt");
    expect(await code(await forgeBackup(input, { manifest: (m) => ({ ...m, entries: (m["entries"] as { byteLength: number }[]).map((e, i) => (i === 0 ? { ...e, byteLength: e.byteLength + 1 } : e)) }) }))).toBe("corrupt");
  });

  it("refuses an entry that is not on the list of allowed names, however it is named", async () => {
    const { input } = await base();
    for (const name of ["evil.js", "images/run.exe", "images/a.html", "../escape.png", "images/../x.png", "/etc/passwd", "images\\a.png", "C:/x.png", "images/sub/a.png", "images/.png", "readme.txt"]) {
      expect(await code(await forgeBackup(input, { extraFiles: { [name]: ascii("x") } })), name).toBe("corrupt");
    }
  });

  it("refuses a name that is used twice", async () => {
    const { input } = await base();
    const good = await forgeBackup(input);
    expect(await code(good)).toBe("ok");
    // The same archive with one listed image written a second time under the same name.
    const entries = Object.entries(unzipSync(good));
    const twice = zipWithNames([...entries, ["images/plan-1.png", PLAN]]);
    expect(await code(twice)).toBe("corrupt");
  });

  it("refuses the wrong shape: not JSON, not a list, a gap, a repeat, a wrong revision and a dangling image", async () => {
    const { input } = await base();
    const e = input.events;
    expect(await code(await forgeBackup(input, { events: () => ({ not: "a list" }) }))).toBe("corrupt");
    expect(await code(await forgeBackup(input, { events: (x) => x.filter((_, i) => i !== 2) }))).toBe("corrupt");
    expect(await code(await forgeBackup(input, { events: (x) => [...x, x[0]] }))).toBe("corrupt");
    expect(await code(await forgeBackup(input, { events: (x) => x.map((ev, i) => (i === 1 ? { ...(ev as object), eventId: (x[0] as { eventId: string }).eventId } : ev)) }))).toBe("corrupt");
    expect(await code(await forgeBackup(input, { manifest: (m) => ({ ...m, revision: (m["revision"] as number) + 1 }) }))).toBe("corrupt");
    expect(await code(await forgeBackup(input, { manifest: (m) => ({ ...m, counts: { events: e.length + 1, images: 2 } }) }))).toBe("corrupt");
    expect(await code(await forgeBackup(input, { events: (x) => x.map((ev) => ((ev as { type: string }).type === "photo_added" ? { ...(ev as { payload: object }), payload: { ...(ev as { payload: object }).payload, blobId: "ghost" } } : ev)) }))).toBe("corrupt");
    expect(await code(await forgeBackup(input, { site: (s) => ({ ...s, id: mintId() }) }))).toBe("corrupt");
    expect(await code(await forgeBackup(input, { site: (s) => ({ ...s, extra: 1 }) }))).toBe("corrupt");
    expect(await code(await forgeBackup(input, { events: (x) => x.map((ev, i) => (i === 0 ? { ...(ev as object), corrects: mintId() } : ev)) }))).toBe("corrupt");
  });

  it("refuses a newer version before it reads the rest, and says so", async () => {
    const { input } = await base();
    const newer = await forgeBackup(input, { manifest: (m) => ({ ...m, schemaVersion: 2, somethingNew: { a: 1 } }) });
    expect(await code(newer)).toBe("newer_version");
    const format = await forgeBackup(input, { manifest: (m) => ({ ...m, format: "plot.backup.v2", entries: "different" }) });
    expect(await code(format)).toBe("newer_version");
  });

  it("refuses a backup of another kind of register", async () => {
    const { bytes } = await base();
    expect(await code(bytes, { kind: "garden" })).toBe("wrong_kind");
  });

  it("brings an older backup up to date in memory, or refuses it", async () => {
    const { bytes } = await base();
    const migration: BackupMigration = {
      from: 1,
      migrate: ({ site, events }) => ({ site: { ...site, title: `${site.title} (moved up)` }, events }),
    };
    const ok = await verifyBackup(bytes, { kind: PAPER_KIND, currentVersion: 2, migrations: [migration] });
    expect(ok.ok && ok.value.migrated).toBe(true);
    expect(ok.ok && ok.value.site.title).toBe("Lantern Fold (moved up)");
    expect(await code(bytes, { kind: PAPER_KIND, currentVersion: 3, migrations: [migration] })).toBe("corrupt");
    const broken: BackupMigration = { from: 1, migrate: () => { throw new Error("no"); } };
    expect(await code(bytes, { kind: PAPER_KIND, currentVersion: 2, migrations: [broken] })).toBe("corrupt");
    expect((await verified(bytes)).migrated).toBe(false);
  });

  it("does not open a file that is not a backup, and names what it is", async () => {
    const found = async (bytes: Uint8Array) => {
      const r = await verifyBackup(bytes, KIND);
      return r.ok ? "ok" : `${r.error.code}:${r.error.detail?.["found"]}`;
    };
    const html = ascii('<!doctype html><html><body><script id="data" type="application/json">{"format":"plot.family.v1"}</script></body></html>');
    expect(await found(html)).toBe("wrong_file:visitor");
    expect(await found(ascii('<html><script>{"format":"plot.availability.v1"}</script></html>'))).toBe("wrong_file:visitor");
    expect(await found(ascii('{"format":"plot.review.v1","issues":[]}'))).toBe("wrong_file:review");
    expect(await found(ascii('{"format":"plot.slip.v1"}'))).toBe("wrong_file:slip");
    expect(await found(ascii('{"format":"plot.layout.v1"}'))).toBe("wrong_file:layout");
    expect(await found(ascii('{"format":"plot.draft.v1"}'))).toBe("wrong_file:draft");
    expect(await found(ascii("Source ref,Name\nR1,A\n"))).toBe("wrong_file:unknown");
    expect(await found(new Uint8Array(0))).toBe("wrong_file:unknown");
    expect(await found(zipSync({ "manifest.json": ascii('{"format":"other"}') }))).toBe("wrong_file:zip");
  });

  it("tells the kinds of file apart by their bytes, never by a name", async () => {
    const { bytes } = await base();
    expect(classifyFile(bytes)).toBe("backup");
    expect(classifyFile(zipSync({ "a.txt": ascii("x") }))).toBe("zip");
    expect(classifyFile(ascii('  {"format":"plot.review.v1"}'))).toBe("review");
    expect(classifyFile(ascii("plain words"))).toBe("unknown");
    expect(classifyFile(new Uint8Array([0xff, 0xfe, 0, 1]))).toBe("unknown");
  });
});

describe("the archive bounds", () => {
  it("refuses 128 MiB and one byte more before it reads a thing", async () => {
    const atLimit = new Uint8Array(LIMITS.archiveCompressedBytes);
    expect(await code(atLimit)).not.toBe("over_limit");
    const r = await verifyBackup(new Uint8Array(LIMITS.archiveCompressedBytes + 1), KIND);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detail).toMatchObject({ item: "archiveCompressedBytes", limit: LIMITS.archiveCompressedBytes });
  });

  it("takes 5,000 images and refuses the 5,001st", async () => {
    const { input } = await (async () => {
      const env = await PaperEnv.create("Many");
      await env.dispatch([{ type: "layout_apply", north: 1 }]);
      return { input: await parts(env) };
    })();
    const files = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`images/i${i}.png`, new Uint8Array([i % 256])]));
    const fits = await forgeBackup(input, { extraFiles: files(LIMITS.archiveAttachmentEntries), manifest: (m) => m });
    const fitsResult = await verifyBackup(fits, KIND);
    expect(fitsResult.ok).toBe(true);
    const over = await forgeBackup(input, { extraFiles: files(LIMITS.archiveAttachmentEntries + 1) });
    const r = await verifyBackup(over, KIND);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detail).toMatchObject({ item: "archiveAttachmentEntries", limit: 5000 });
  });

  it("takes 160 MiB decoded and refuses one byte more", async () => {
    const manifest = ascii('{"format":"plot.backup.v1","schemaVersion":1}');
    const big = (n: number) => zipSync({ "manifest.json": manifest, "events.json": new Uint8Array(n) }, { level: 1 });
    // The manifest counts toward the total, so the events entry holds what is left.
    const room = LIMITS.archiveDecodedBytes - manifest.length;
    expect(await code(big(room))).not.toBe("over_limit");
    const r = await verifyBackup(big(room + 1), KIND);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detail).toMatchObject({ item: "archiveDecodedBytes", limit: LIMITS.archiveDecodedBytes });
  });

  it("takes 96 MiB of photos and refuses one byte more", async () => {
    const manifest = ascii('{"format":"plot.backup.v1","schemaVersion":1}');
    const photos = (n: number) => zipSync({ "manifest.json": manifest, "images/big.png": new Uint8Array(n) }, { level: 1 });
    expect(await code(photos(LIMITS.archivePhotoBytesPerSite))).not.toBe("over_limit");
    const r = await verifyBackup(photos(LIMITS.archivePhotoBytesPerSite + 1), KIND);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detail).toMatchObject({ item: "archivePhotoBytesPerSite", limit: LIMITS.archivePhotoBytesPerSite });
  });

  it("refuses an entry whose header gives a size other than the bytes", async () => {
    const env = await PaperEnv.create("Sizes");
    await env.dispatch([{ type: "layout_apply", north: 1 }], ON, mintId(), []);
    const good = await forgeBackup(await parts(env), { extraFiles: { "images/plan-1.png": PLAN } });
    expect(await code(good)).toBe("ok");
    const lying = new Uint8Array(good);
    const view = new DataView(lying.buffer);
    let patched = 0;
    for (let at = 0; at + 46 < lying.length; at += 1) {
      // A central directory record: PK 01 02. The size of the bytes is at 24. The name starts at 46.
      if (lying[at] === 0x50 && lying[at + 1] === 0x4b && lying[at + 2] === 0x01 && lying[at + 3] === 0x02) {
        const nameLength = view.getUint16(at + 28, true);
        const name = new TextDecoder().decode(lying.subarray(at + 46, at + 46 + nameLength));
        if (name === "images/plan-1.png") {
          view.setUint32(at + 24, view.getUint32(at + 24, true) - 1, true);
          patched += 1;
        }
      }
    }
    expect(patched).toBe(1);
    expect(await code(lying)).toBe("corrupt");
  });
});
describe("blob references and lineage", () => {
  const event = (payload: unknown): StoredEvent => ({
    eventId: "e", siteId: "s", seq: 1, opId: "o", entityIds: [], type: "x", recordedAt: "2026-01-01T00:00:00+00:00", payloadVersion: 1, payload,
  });

  it("collects blobId, blobIds and imageRefs at any depth", () => {
    expect(
      collectBlobRefs([event({ blobId: "a" }), event({ nested: { blobIds: ["b", "c"], deeper: [{ imageRefs: ["d"] }] } }), event({ other: "e", blobId: 5 })]).sort(),
    ).toEqual(["a", "b", "c", "d"]);
    expect(collectBlobRefs([event(undefined), event(null), event("text")])).toEqual([]);
  });

  it("compares two copies by their event IDs", () => {
    const ids = (...n: string[]) => n.map((eventId) => ({ eventId }));
    expect(compareLineage(ids("a", "b", "c"), ids("a", "b", "c"))).toBe("same");
    expect(compareLineage(ids("a", "b"), ids("a", "b", "c"))).toBe("forward");
    expect(compareLineage(ids("a", "b", "c"), ids("a", "b"))).toBe("backward");
    expect(compareLineage(ids("a", "b", "c"), ids("a", "x", "c"))).toBe("fork");
    expect(compareLineage(ids("a", "b", "c"), ids("a", "b", "x", "y"))).toBe("fork");
    expect(compareLineage(ids(), ids("a"))).toBe("forward");
    expect(compareLineage(ids(), ids())).toBe("same");
  });
});
