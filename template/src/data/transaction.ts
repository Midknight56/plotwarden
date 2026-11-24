// Commit, with revision check, operation record and unique keys. Browser IndexedDB only.
// Design D6. One readwrite transaction over sites, events, indexes, uniqueKeys,
// blobs and operations. The result resolves only after the transaction completes.
import { writeTime } from "../calendar";
import { hashBatch, makeStoredEvent } from "../events";
import type { DraftEvent, StoredEvent } from "../events";
import { LIMITS } from "../limits";
import { err, ok } from "../types";
import type { Result, Site, Uuid } from "../types";
import { requestResult, transact } from "./db";

export type SiteRow = Site & { lastSeq: number };

export interface UniqueKeyRequest {
  key: string;
  owner: string;
  /** Text for the message, for example the section name. */
  label?: string;
}

export interface IndexWrite {
  name: string;
  key: string;
  value: unknown;
}

export interface BlobWrite {
  id: string;
  type: string;
  bytes: Uint8Array;
}

export interface CommitInput {
  siteId: Uuid;
  expectedRevision: number;
  opId: Uuid;
  /** The command batch. Its canonical JSON is hashed to tell a repeat from a different change. */
  commands: unknown;
  events: readonly DraftEvent[];
  uniqueKeys?: readonly UniqueKeyRequest[];
  indexes?: readonly IndexWrite[];
  blobs?: readonly BlobWrite[];
  now?: () => Date;
  newId?: () => string;
}

export type CommitErrorCode =
  | "stale_revision"
  | "op_conflict"
  | "key_taken"
  | "storage_abort"
  | "quota"
  | "over_limit"
  | "site_missing"
  | "empty_batch";

export interface CommitError {
  code: CommitErrorCode;
  key?: string;
  label?: string;
  /** The revision now stored, for "Open latest". */
  current?: number;
}

export type CommitResult =
  | { ok: true; revision: number; eventIds: string[]; replayed: boolean }
  | { ok: false; error: CommitError };

export interface RevisionMessage {
  siteId: Uuid;
  revision: number;
}

interface OperationRecord {
  siteId: Uuid;
  opId: Uuid;
  batchHash: string;
  revision: number;
  eventIds: string[];
}

interface UniqueKeyRow {
  siteId: Uuid;
  key: string;
  owner: string;
}

const COMMIT_STORES = ["sites", "events", "indexes", "uniqueKeys", "blobs", "operations"] as const;
const CHANNEL = "plotwarden.revisions";

/** The newest revision of each site that this tab committed. It is per page, so another tab never shares it. */
const ownRevisions = new Map<Uuid, number>();

/** Save a new site at revision 0. Refuses a site that already exists. */
export async function saveNewSite(db: IDBDatabase, site: Site): Promise<Result<true>> {
  if (site.revision !== 0) return err("bad_revision", { revision: site.revision });
  const result = await transact(db, ["sites"], "readwrite", async (tx) => {
    const store = tx.objectStore("sites");
    if ((await requestResult(store.get(site.id))) !== undefined) return false;
    const row: SiteRow = { ...site, lastSeq: 0 };
    store.put(row);
    return true;
  });
  if (!result.ok) return err(result.error.code);
  return result.value ? ok(true) : err("site_exists", { siteId: site.id });
}

export async function readSite(db: IDBDatabase, siteId: Uuid): Promise<SiteRow | undefined> {
  const row = (await requestResult(db.transaction("sites").objectStore("sites").get(siteId))) as SiteRow | undefined;
  return row;
}

/** Every site, without the internal sequence counter. */
export async function listSites(db: IDBDatabase): Promise<Site[]> {
  const rows = (await requestResult(db.transaction("sites").objectStore("sites").getAll())) as SiteRow[];
  return rows.map((row) => {
    const { lastSeq: _lastSeq, ...site } = row;
    return site;
  });
}

/** Every event of a site in write order. */
export async function readEvents(db: IDBDatabase, siteId: Uuid): Promise<StoredEvent[]> {
  const index = db.transaction("events").objectStore("events").index("bySite");
  const rows = (await requestResult(index.getAll(siteId))) as StoredEvent[];
  return rows.sort((a, b) => a.seq - b.seq);
}

function failure(error: CommitError): CommitResult {
  return { ok: false, error };
}

/**
 * Commit one batch. Order inside the transaction: look up the operation,
 * read the site, compare the revision, check the event limit, reserve unique
 * keys, write events, indexes and blobs, write the operation, raise the
 * revision by one. Any failure leaves every store as it was.
 */
export async function commit(db: IDBDatabase, input: CommitInput): Promise<CommitResult> {
  if (input.events.length === 0) return failure({ code: "empty_batch" });

  // Hash before the transaction opens. A transaction closes if it waits on anything but its own requests.
  const batchHash = await hashBatch(input.commands);
  const now = input.now ?? (() => new Date());
  const newId = input.newId ?? (() => globalThis.crypto.randomUUID());

  const outcome = await transact(db, COMMIT_STORES, "readwrite", async (tx): Promise<CommitResult> => {
    const sites = tx.objectStore("sites");
    const operations = tx.objectStore("operations");
    const uniqueKeys = tx.objectStore("uniqueKeys");

    const earlier = (await requestResult(operations.get([input.siteId, input.opId]))) as OperationRecord | undefined;
    if (earlier !== undefined) {
      return earlier.batchHash === batchHash
        ? { ok: true, revision: earlier.revision, eventIds: earlier.eventIds, replayed: true }
        : failure({ code: "op_conflict" });
    }

    const row = (await requestResult(sites.get(input.siteId))) as SiteRow | undefined;
    if (row === undefined) return failure({ code: "site_missing" });
    if (row.revision !== input.expectedRevision) return failure({ code: "stale_revision", current: row.revision });
    if (row.lastSeq + input.events.length > LIMITS.eventsPerSite) return failure({ code: "over_limit" });

    const wanted = input.uniqueKeys ?? [];
    const existing = (await Promise.all(
      wanted.map((k) => requestResult(uniqueKeys.get([input.siteId, k.key]))),
    )) as (UniqueKeyRow | undefined)[];
    for (const [i, found] of existing.entries()) {
      const request = wanted[i] as UniqueKeyRequest;
      if (found !== undefined && found.owner !== request.owner) {
        const error: CommitError = { code: "key_taken", key: request.key };
        if (request.label !== undefined) error.label = request.label;
        return failure(error);
      }
    }

    const recordedAt = writeTime(now());
    const eventIds = input.events.map(() => newId());
    const writes: Promise<unknown>[] = [];
    // If one write throws, the ones already queued reject with AbortError when the
    // transaction aborts. Listen to each, so none is left unhandled.
    const queue = (request: IDBRequest): void => {
      const pending = requestResult(request);
      pending.catch(() => undefined);
      writes.push(pending);
    };
    for (const k of wanted) {
      const keyRow: UniqueKeyRow = { siteId: input.siteId, key: k.key, owner: k.owner };
      queue(uniqueKeys.put(keyRow));
    }
    const eventStore = tx.objectStore("events");
    input.events.forEach((draft, i) => {
      const stored = makeStoredEvent(draft, {
        eventId: eventIds[i] as string,
        siteId: input.siteId,
        seq: row.lastSeq + 1 + i,
        opId: input.opId,
        recordedAt,
      });
      queue(eventStore.add(stored));
    });
    const indexStore = tx.objectStore("indexes");
    for (const w of input.indexes ?? []) {
      queue(indexStore.put({ siteId: input.siteId, name: w.name, key: w.key, value: w.value }));
    }
    const blobStore = tx.objectStore("blobs");
    for (const b of input.blobs ?? []) {
      queue(blobStore.put({ siteId: input.siteId, id: b.id, type: b.type, bytes: b.bytes }));
    }
    await Promise.all(writes);

    const revision = input.expectedRevision + 1;
    const record: OperationRecord = { siteId: input.siteId, opId: input.opId, batchHash, revision, eventIds };
    await requestResult(operations.put(record));
    const updated: SiteRow = { ...row, revision, lastSeq: row.lastSeq + input.events.length };
    await requestResult(sites.put(updated));
    return { ok: true, revision, eventIds, replayed: false };
  });

  if (!outcome.ok) return failure({ code: outcome.error.code });
  // The transaction has completed. Only now may the screen say "Saved on this device." and other tabs hear of it.
  if (outcome.value.ok && !outcome.value.replayed) {
    ownRevisions.set(input.siteId, Math.max(ownRevisions.get(input.siteId) ?? 0, outcome.value.revision));
    broadcastRevision({ siteId: input.siteId, revision: outcome.value.revision });
  }
  return outcome.value;
}

/** Tell other open tabs the new revision. Does nothing where BroadcastChannel is missing. */
export function broadcastRevision(message: RevisionMessage): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // A failed notice must never undo a saved change.
  }
}

/**
 * Whether a message of the channel is news from another tab. The channel also reaches the other channel objects of
 * the tab that sent the message, so a tab hears its own save. A revision that this tab holds, or wrote itself, is not
 * news. A commit checks the expected revision, so a revision this tab wrote cannot also have come from another tab.
 */
export function heardFromOtherTab(message: RevisionMessage, known: number): boolean {
  return message.revision > known && message.revision > (ownRevisions.get(message.siteId) ?? 0);
}

/** Hear revisions committed in other tabs. Returns a function that stops listening. */
export function onRevision(handler: (message: RevisionMessage) => void | Promise<void>): () => void {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent) => {
    void handler(event.data as RevisionMessage);
  };
  return () => channel.close();
}
