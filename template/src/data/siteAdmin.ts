// Reading blobs, removing one register, changing the display zone. Browser IndexedDB only.
import { isValidZone } from "../calendar";
import { err, ok } from "../types";
import type { Result, Uuid } from "../types";
import { requestResult, transact } from "./db";
import type { SiteRow } from "./transaction";

export interface BlobRow {
  id: string;
  type: string;
  bytes: Uint8Array;
}

export interface RemovedCounts {
  events: number;
  blobs: number;
  uniqueKeys: number;
  operations: number;
  drafts: number;
}

interface StoredBlob extends BlobRow {
  siteId: Uuid;
}

/** Every key of a store that starts with the site ID. Array keys sort after numbers and strings. */
function siteRange(siteId: Uuid): IDBKeyRange {
  return IDBKeyRange.bound([siteId], [siteId, []]);
}

export async function readBlob(db: IDBDatabase, siteId: Uuid, id: string): Promise<BlobRow | undefined> {
  const row = (await requestResult(db.transaction("blobs").objectStore("blobs").get([siteId, id]))) as StoredBlob | undefined;
  return row === undefined ? undefined : { id: row.id, type: row.type, bytes: row.bytes };
}

export async function readBlobs(db: IDBDatabase, siteId: Uuid): Promise<BlobRow[]> {
  const rows = (await requestResult(db.transaction("blobs").objectStore("blobs").getAll(siteRange(siteId)))) as StoredBlob[];
  return rows.map((row) => ({ id: row.id, type: row.type, bytes: row.bytes }));
}

const SITE_STORES = ["events", "indexes", "uniqueKeys", "blobs", "operations", "drafts", "imports"] as const;

/**
 * Remove one register and nothing else, in one transaction. The typed name
 * must equal its title. No other register, setting or migration record is touched.
 */
export async function removeSite(db: IDBDatabase, siteId: Uuid, typedTitle: string): Promise<Result<RemovedCounts>> {
  const outcome = await transact(db, ["sites", ...SITE_STORES], "readwrite", async (tx) => {
    const sites = tx.objectStore("sites");
    const row = (await requestResult(sites.get(siteId))) as SiteRow | undefined;
    if (row === undefined) return "site_missing" as const;
    if (typedTitle.trim() !== row.title) return "title_mismatch" as const;
    const range = siteRange(siteId);
    const counts: RemovedCounts = { events: 0, blobs: 0, uniqueKeys: 0, operations: 0, drafts: 0 };
    for (const name of SITE_STORES) {
      const store = tx.objectStore(name);
      if (name === "events" || name === "blobs" || name === "uniqueKeys" || name === "operations" || name === "drafts") {
        counts[name] = (await requestResult(store.count(range))) as number;
      }
      store.delete(range);
    }
    sites.delete(siteId);
    return counts;
  });
  if (!outcome.ok) return err(outcome.error.code);
  if (typeof outcome.value === "string") return err(outcome.value);
  return ok(outcome.value);
}

/** Change how write times are shown. The revision and every event stay as they are. */
export async function setSiteZone(db: IDBDatabase, siteId: Uuid, zone: string): Promise<Result<true>> {
  if (!isValidZone(zone)) return err("bad_zone", { zone });
  const outcome = await transact(db, ["sites"], "readwrite", async (tx) => {
    const sites = tx.objectStore("sites");
    const row = (await requestResult(sites.get(siteId))) as SiteRow | undefined;
    if (row === undefined) return false;
    sites.put({ ...row, zone });
    return true;
  });
  if (!outcome.ok) return err(outcome.error.code);
  return outcome.value ? ok(true) : err("site_missing", { siteId });
}
