// Private backup (.pkr.zip), verify, migrate and staged restore. No React.
// Everything is checked in memory before the first write. The write is one transaction.
import { unzipSync, zipSync } from "fflate";
import { z } from "zod";
import type { IsoInstant, LocalDate } from "../calendar";
import { batches, canonicalJson, checkSequence } from "../events";
import type { StoredEvent } from "../events";
import { LIMITS } from "../limits";
import { err, ok } from "../types";
import type { Result, Site, Uuid } from "../types";
import { requestResult, transact } from "./db";
import { keySourceOfStored, uniqueKeysFor } from "./importBatch";
import { readBlobs } from "./siteAdmin";
import type { BlobRow } from "./siteAdmin";
import { listSites, readEvents, readSite } from "./transaction";
import type { SiteRow } from "./transaction";

export const BACKUP_FORMAT = "plot.backup.v1";
export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_SUFFIX = ".pkr.zip";

export interface ManifestEntry {
  path: string;
  byteLength: number;
  sha256: string;
}

export interface Manifest {
  format: string;
  schemaVersion: number;
  siteKind: string;
  siteId: Uuid;
  lineageId: Uuid;
  revision: number;
  createdAt: IsoInstant;
  entries: ManifestEntry[];
  counts: { events: number; images: number };
  settings?: Record<string, string>;
}

export interface BackupInput {
  site: Site;
  events: readonly StoredEvent[];
  blobs: readonly BlobRow[];
  createdAt: IsoInstant;
  settings?: Record<string, string>;
}

export interface VerifiedBackup {
  manifest: Manifest;
  site: Site;
  events: StoredEvent[];
  blobs: BlobRow[];
  /** True when an older backup was brought up to date in memory. */
  migrated: boolean;
}

export interface BackupMigration {
  from: number;
  /** Change the parts in memory. A throw refuses the backup. */
  migrate(parts: { site: Site; events: StoredEvent[] }): { site: Site; events: StoredEvent[] };
}

export type FileType = "backup" | "zip" | "visitor" | "review" | "slip" | "layout" | "draft" | "unknown";

export type LineageRelation = "same" | "forward" | "backward" | "fork";

export type RestoreOptions =
  | { mode: "new"; newId?: () => string }
  | { mode: "replace"; currentSiteId: Uuid; typedTitle: string };

export interface RestoreResult {
  siteId: Uuid;
  title: string;
  revision: number;
  events: number;
  images: number;
  /** The exchange key was changed, so old review files refer to the earlier copy. */
  rotatedKey: boolean;
  /** The copies differ at some event, or another register of this device shares the lineage. */
  forked: boolean;
  relation?: LineageRelation;
}

const encoder = new TextEncoder();
const MANIFEST = "manifest.json";
const SITE_FILE = "site.json";
const EVENTS_FILE = "events.json";
const IMAGE_PATH = /^images\/([A-Za-z0-9_-]{1,64})\.(jpg|png|webp)$/;
const EXT_OF_TYPE: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const TYPE_OF_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const FIXED_TIME = new Date(2020, 0, 1);

function corrupt(reason: string, extra?: Record<string, string | number>) {
  return err("corrupt", { reason, ...extra });
}

/** A fixed name with the date and no private value. */
export function backupFilename(date: LocalDate): string {
  return `register-backup-${date}${BACKUP_SUFFIX}`;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildBackup(input: BackupInput): Promise<Uint8Array> {
  const { lastSeq: _lastSeq, ...siteRow } = input.site as Site & { lastSeq?: number };
  const files: [string, Uint8Array][] = [
    [SITE_FILE, encoder.encode(canonicalJson(siteRow))],
    [EVENTS_FILE, encoder.encode(canonicalJson([...input.events]))],
  ];
  for (const blob of [...input.blobs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const ext = EXT_OF_TYPE[blob.type];
    if (ext === undefined) throw new Error(`Cannot back up a blob of type ${blob.type}`);
    files.push([`images/${blob.id}.${ext}`, blob.bytes]);
  }
  const entries: ManifestEntry[] = [];
  for (const [path, bytes] of files) entries.push({ path, byteLength: bytes.length, sha256: await sha256Hex(bytes) });
  const manifest: Manifest = {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    siteKind: input.site.kind,
    siteId: input.site.id,
    lineageId: input.site.lineageId,
    revision: input.site.revision,
    createdAt: input.createdAt,
    entries,
    counts: { events: input.events.length, images: input.blobs.length },
  };
  if (input.settings !== undefined) manifest.settings = input.settings;
  const archive: Record<string, [Uint8Array, { level: 0 }]> = { [MANIFEST]: [encoder.encode(canonicalJson(manifest)), { level: 0 }] };
  for (const [path, bytes] of files) archive[path] = [bytes, { level: 0 }];
  return zipSync(archive, { mtime: FIXED_TIME });
}

/** Read the register from the database and build its backup. */
export async function exportBackup(
  db: IDBDatabase,
  siteId: Uuid,
  createdAt: IsoInstant,
  settings?: Record<string, string>,
): Promise<Result<{ bytes: Uint8Array; events: number; images: number; revision: number }>> {
  const row = await readSite(db, siteId);
  if (row === undefined) return err("site_missing", { siteId });
  const events = await readEvents(db, siteId);
  const blobs = await readBlobs(db, siteId);
  const input: BackupInput = { site: row, events, blobs, createdAt };
  if (settings !== undefined) input.settings = settings;
  const bytes = await buildBackup(input);
  return ok({ bytes, events: events.length, images: blobs.length, revision: row.revision });
}

const isZip = (bytes: Uint8Array): boolean =>
  bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05) && (bytes[3] === 0x04 || bytes[3] === 0x06);

/** Decide what a file is from its bytes. The file name is never read. */
export function classifyFile(bytes: Uint8Array): FileType {
  if (isZip(bytes)) {
    try {
      const found = unzipSync(bytes, { filter: (f) => f.name === MANIFEST });
      const raw = found[MANIFEST];
      if (raw !== undefined) {
        const manifest = JSON.parse(new TextDecoder().decode(raw)) as { format?: unknown };
        if (typeof manifest.format === "string" && /^plot\.backup\.v\d+$/.test(manifest.format)) return "backup";
      }
    } catch {
      // A zip that cannot be read is still a zip.
    }
    return "zip";
  }
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 2 * 1024 * 1024))).trimStart();
  if (head.startsWith("{")) {
    try {
      const format = (JSON.parse(head) as { format?: unknown }).format;
      if (typeof format === "string") {
        if (/^plot\.review\.v\d+$/.test(format)) return "review";
        if (/^plot\.slip\.v\d+$/.test(format)) return "slip";
        if (/^plot\.layout\.v\d+$/.test(format)) return "layout";
        if (/^plot\.draft\.v\d+$/.test(format)) return "draft";
        if (format === "plot.family.v1" || format === "plot.availability.v1") return "visitor";
      }
    } catch {
      return "unknown";
    }
  } else if (head.startsWith("<") && (head.includes("plot.family.v1") || head.includes("plot.availability.v1"))) {
    return "visitor";
  }
  return "unknown";
}

/** Every blob ID that events point at: `blobId`, `blobIds` and `imageRefs`. */
export function collectBlobRefs(events: readonly StoredEvent[]): string[] {
  const found = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "blobId" && typeof child === "string") found.add(child);
      else if ((key === "blobIds" || key === "imageRefs") && Array.isArray(child)) {
        for (const id of child) if (typeof id === "string") found.add(id);
      } else walk(child);
    }
  };
  for (const event of events) walk(event.payload);
  return [...found];
}

const manifestSchema = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.number().int().min(1),
  siteKind: z.string().min(1),
  siteId: z.string().min(1),
  lineageId: z.string().min(1),
  revision: z.number().int().min(0),
  createdAt: z.string().min(1),
  entries: z.array(z.strictObject({ path: z.string().min(1), byteLength: z.number().int().min(0), sha256: z.string().regex(/^[0-9a-f]{64}$/) })),
  counts: z.strictObject({ events: z.number().int().min(0), images: z.number().int().min(0) }),
  settings: z.record(z.string(), z.string()).optional(),
});

const siteSchema = z.strictObject({
  id: z.string().min(1),
  lineageId: z.string().min(1),
  siteKey: z.string().min(1),
  kind: z.string().min(1),
  workspace: z.enum(["own", "walkthrough"]),
  schemaVersion: z.number().int().min(1),
  title: z.string().min(1),
  locale: z.string().min(1),
  zone: z.string().min(1),
  createdAt: z.string().min(1),
  revision: z.number().int().min(0),
  currency: z.enum(["GBP", "EUR", "USD", "CAD"]).optional(),
});

const eventSchema = z.strictObject({
  eventId: z.string().min(1),
  siteId: z.string().min(1),
  seq: z.number().int().min(1),
  opId: z.string().min(1),
  entityIds: z.array(z.string()),
  type: z.string().min(1),
  recordedAt: z.string().min(1),
  effectiveOn: z.string().optional(),
  payloadVersion: z.number().int().min(0),
  sourceRef: z.string().optional(),
  corrects: z.string().optional(),
  payload: z.unknown(),
});

function parseJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

interface DirectoryEntry {
  name: string;
  size: number;
}

/**
 * Check a backup before anything is written: size, entries, limits, hashes,
 * version, kind and structure. Any failure writes nothing. The result is the
 * parts, in memory.
 */
export async function verifyBackup(
  bytes: Uint8Array,
  options: { kind: string; migrations?: readonly BackupMigration[]; currentVersion?: number },
): Promise<Result<VerifiedBackup>> {
  const currentVersion = options.currentVersion ?? BACKUP_SCHEMA_VERSION;
  if (bytes.length > LIMITS.archiveCompressedBytes) {
    return err("over_limit", { item: "archiveCompressedBytes", limit: LIMITS.archiveCompressedBytes, value: bytes.length });
  }
  if (!isZip(bytes)) return err("wrong_file", { found: classifyFile(bytes) });

  // Pass one reads the directory and the manifest only. Nothing else is inflated.
  const directory: DirectoryEntry[] = [];
  let manifestBytes: Uint8Array | undefined;
  try {
    const first = unzipSync(bytes, {
      filter(file) {
        directory.push({ name: file.name, size: file.originalSize });
        return file.name === MANIFEST;
      },
    });
    manifestBytes = first[MANIFEST];
  } catch {
    return corrupt("unreadable_archive");
  }
  if (manifestBytes === undefined) return err("wrong_file", { found: "zip" });

  let rawManifest: unknown;
  try {
    rawManifest = parseJson(manifestBytes);
  } catch {
    return corrupt("manifest_not_json");
  }
  if (rawManifest === null || typeof rawManifest !== "object" || Array.isArray(rawManifest)) return err("wrong_file", { found: "zip" });
  const raw = rawManifest as Record<string, unknown>;
  if (typeof raw["format"] !== "string" || !/^plot\.backup\.v\d+$/.test(raw["format"])) return err("wrong_file", { found: "zip" });
  const formatVersion = Number(/\d+$/.exec(raw["format"])?.[0]);
  if (formatVersion > 1 || (typeof raw["schemaVersion"] === "number" && raw["schemaVersion"] > currentVersion)) {
    return err("newer_version");
  }

  // Names and sizes, from the directory alone.
  const seen = new Set<string>();
  let images = 0;
  let decoded = 0;
  let photoBytes = 0;
  for (const entry of directory) {
    if (seen.has(entry.name)) return corrupt("repeated_name");
    seen.add(entry.name);
    const isFixed = entry.name === MANIFEST || entry.name === SITE_FILE || entry.name === EVENTS_FILE;
    const image = IMAGE_PATH.test(entry.name);
    if (!isFixed && !image) return corrupt("unexpected_entry");
    if (image) {
      images += 1;
      photoBytes += entry.size;
    }
    decoded += entry.size;
  }
  if (images > LIMITS.archiveAttachmentEntries) {
    return err("over_limit", { item: "archiveAttachmentEntries", limit: LIMITS.archiveAttachmentEntries, value: images });
  }
  if (decoded > LIMITS.archiveDecodedBytes) {
    return err("over_limit", { item: "archiveDecodedBytes", limit: LIMITS.archiveDecodedBytes, value: decoded });
  }
  if (photoBytes > LIMITS.archivePhotoBytesPerSite) {
    return err("over_limit", { item: "archivePhotoBytesPerSite", limit: LIMITS.archivePhotoBytesPerSite, value: photoBytes });
  }

  const parsedManifest = manifestSchema.safeParse(raw);
  if (!parsedManifest.success) return corrupt("manifest_shape", { path: parsedManifest.error.issues[0]?.path.join(".") ?? "" });
  const manifest = parsedManifest.data as Manifest;
  if (manifest.siteKind !== options.kind) return err("wrong_kind", { siteKind: manifest.siteKind });

  // Pass two inflates every entry. The buffer of each is the size the directory gave.
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return corrupt("unreadable_archive");
  }
  for (const entry of directory) {
    if ((files[entry.name]?.length ?? -1) !== entry.size) return corrupt("size_differs_from_directory", { path: entry.name });
  }

  const listed = new Set<string>();
  for (const entry of manifest.entries) {
    if (listed.has(entry.path) || entry.path === MANIFEST) return corrupt("repeated_listing", { path: entry.path });
    listed.add(entry.path);
    const content = files[entry.path];
    if (content === undefined) return corrupt("missing_entry", { path: entry.path });
    if (content.length !== entry.byteLength) return corrupt("wrong_length", { path: entry.path });
    if ((await sha256Hex(content)) !== entry.sha256) return corrupt("wrong_hash", { path: entry.path });
  }
  for (const name of Object.keys(files)) {
    if (name !== MANIFEST && !listed.has(name)) return corrupt("unlisted_entry", { path: name });
  }
  if (!listed.has(SITE_FILE) || !listed.has(EVENTS_FILE)) return corrupt("missing_entry");

  let rawSite: unknown;
  let rawEvents: unknown;
  try {
    rawSite = parseJson(files[SITE_FILE] as Uint8Array);
    rawEvents = parseJson(files[EVENTS_FILE] as Uint8Array);
  } catch {
    return corrupt("not_json");
  }
  const parsedSite = siteSchema.safeParse(rawSite);
  if (!parsedSite.success) return corrupt("site_shape");
  const parsedEvents = z.array(eventSchema).safeParse(rawEvents);
  if (!parsedEvents.success) return corrupt("events_shape");
  let parts = { site: parsedSite.data as Site, events: parsedEvents.data as StoredEvent[] };

  // An older backup is brought up to date with the migration list, in memory.
  let migrated = false;
  for (let version = manifest.schemaVersion; version < currentVersion; version += 1) {
    const step = options.migrations?.find((m) => m.from === version);
    if (step === undefined) return corrupt("no_migration", { from: version });
    try {
      parts = step.migrate(parts);
    } catch {
      return corrupt("migration_failed", { from: version });
    }
    migrated = true;
  }
  const { site, events } = parts;

  if (site.id !== manifest.siteId || site.lineageId !== manifest.lineageId || site.kind !== manifest.siteKind) {
    return corrupt("site_differs_from_manifest");
  }
  const sequence = checkSequence(events, site.id);
  if (!sequence.ok) return corrupt("bad_sequence", { code: sequence.error.code });
  const ids = new Set(events.map((e) => e.eventId));
  if (ids.size !== events.length) return corrupt("repeated_event_id");
  for (const event of events) if (event.corrects !== undefined && !ids.has(event.corrects)) return corrupt("dangling_correction");
  const revision = batches(events).length;
  if (revision !== manifest.revision || revision !== site.revision) return corrupt("wrong_revision");
  if (manifest.counts.events !== events.length) return corrupt("wrong_count");

  const blobs: BlobRow[] = [];
  for (const name of Object.keys(files)) {
    const match = IMAGE_PATH.exec(name);
    if (match !== null) blobs.push({ id: match[1] as string, type: TYPE_OF_EXT[match[2] as string] as string, bytes: files[name] as Uint8Array });
  }
  if (manifest.counts.images !== blobs.length) return corrupt("wrong_count");
  const have = new Set(blobs.map((b) => b.id));
  for (const ref of collectBlobRefs(events)) if (!have.has(ref)) return corrupt("dangling_reference", { ref });

  return ok({ manifest, site, events, blobs, migrated });
}

export function compareLineage(
  current: readonly { eventId: string }[],
  backup: readonly { eventId: string }[],
): LineageRelation {
  const shared = Math.min(current.length, backup.length);
  for (let i = 0; i < shared; i += 1) {
    if ((current[i] as { eventId: string }).eventId !== (backup[i] as { eventId: string }).eventId) return "fork";
  }
  if (current.length === backup.length) return "same";
  return backup.length > current.length ? "forward" : "backward";
}

function sectionNamesOf(events: readonly StoredEvent[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const event of events) {
    if (event.type !== "section_added" && event.type !== "section_changed") continue;
    const payload = event.payload as { sectionId?: unknown; name?: unknown };
    if (typeof payload.sectionId === "string" && typeof payload.name === "string") names.set(payload.sectionId, payload.name);
  }
  return names;
}

type Replaced = { failure: string } | { failure?: undefined; relation: LineageRelation; rotate: boolean };

const WRITE_STORES = ["sites", "events", "uniqueKeys", "blobs", "operations", "indexes"] as const;

function siteRange(siteId: Uuid): IDBKeyRange {
  return IDBKeyRange.bound([siteId], [siteId, []]);
}

/**
 * Write a verified backup in one transaction, so the register that is there
 * stays in place until the new one is whole. A failure leaves every register
 * as it was.
 */
export async function restoreBackup(
  db: IDBDatabase,
  verified: VerifiedBackup,
  options: RestoreOptions,
): Promise<Result<RestoreResult>> {
  const { site, blobs } = verified;

  if (options.mode === "new") {
    const newId = options.newId ?? (() => globalThis.crypto.randomUUID());
    const siteId = newId();
    const idOf = new Map(verified.events.map((e) => [e.eventId, newId()]));
    const events = verified.events.map((e) => {
      const { corrects, ...rest } = e;
      const copy: StoredEvent = { ...rest, siteId, eventId: idOf.get(e.eventId) as string };
      if (corrects !== undefined) copy.corrects = idOf.get(corrects) ?? corrects;
      return copy;
    });
    const row: SiteRow = { ...site, id: siteId, siteKey: newId(), lastSeq: events.length };
    const keys = uniqueKeysFor(events.map(keySourceOfStored), sectionNamesOf(events));
    const forked = (await listSites(db)).some((s) => s.lineageId === site.lineageId);

    const written = await transact(db, WRITE_STORES, "readwrite", async (tx) => {
      tx.objectStore("sites").add(row);
      const eventStore = tx.objectStore("events");
      for (const event of events) eventStore.add(event);
      const keyStore = tx.objectStore("uniqueKeys");
      for (const k of keys) keyStore.put({ siteId, key: k.key, owner: k.owner });
      const blobStore = tx.objectStore("blobs");
      for (const blob of blobs) blobStore.put({ siteId, id: blob.id, type: blob.type, bytes: blob.bytes });
    });
    if (!written.ok) return err(written.error.code);
    return ok({ siteId, title: site.title, revision: site.revision, events: events.length, images: blobs.length, rotatedKey: true, forked });
  }

  const outcome = await transact(db, WRITE_STORES, "readwrite", async (tx) => {
    const sites = tx.objectStore("sites");
    const current = (await requestResult(sites.get(options.currentSiteId))) as SiteRow | undefined;
    if (current === undefined) return { failure: "site_missing" } as Replaced;
    if (site.id !== current.id || site.lineageId !== current.lineageId) return { failure: "foreign_site" } as Replaced;
    if (options.typedTitle.trim() !== current.title) return { failure: "title_mismatch" } as Replaced;

    const stored = (await requestResult(tx.objectStore("events").index("bySite").getAll(current.id))) as StoredEvent[];
    stored.sort((a, b) => a.seq - b.seq);
    const relation = compareLineage(stored, verified.events);
    const rotate = relation === "backward" || relation === "fork";
    const siteKey = rotate ? globalThis.crypto.randomUUID() : current.siteKey;

    const range = siteRange(current.id);
    for (const name of ["events", "uniqueKeys", "blobs", "operations", "indexes"] as const) tx.objectStore(name).delete(range);
    const row: SiteRow = { ...site, id: current.id, siteKey, lastSeq: verified.events.length };
    sites.put(row);
    const eventStore = tx.objectStore("events");
    for (const event of verified.events) eventStore.add(event);
    const keyStore = tx.objectStore("uniqueKeys");
    for (const k of uniqueKeysFor(verified.events.map(keySourceOfStored), sectionNamesOf(verified.events))) {
      keyStore.put({ siteId: current.id, key: k.key, owner: k.owner });
    }
    const blobStore = tx.objectStore("blobs");
    for (const blob of blobs) blobStore.put({ siteId: current.id, id: blob.id, type: blob.type, bytes: blob.bytes });
    return { relation, rotate } as Replaced;
  });
  if (!outcome.ok) return err(outcome.error.code);
  if (outcome.value.failure !== undefined) return err(outcome.value.failure);
  return ok({
    siteId: options.currentSiteId,
    title: site.title,
    revision: site.revision,
    events: verified.events.length,
    images: blobs.length,
    rotatedKey: outcome.value.rotate,
    forked: outcome.value.relation === "fork",
    relation: outcome.value.relation,
  });
}
