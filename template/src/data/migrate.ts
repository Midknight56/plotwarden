// Schema versions and the upgrade runner. Browser IndexedDB only.
// Each migration runs inside the upgrade transaction. If one throws, the
// transaction is aborted and the database stays at its old version.

export interface Migration {
  version: number;
  up(db: IDBDatabase, tx: IDBTransaction): void;
}

export const STORE_NAMES = [
  "sites",
  "events",
  "indexes",
  "uniqueKeys",
  "blobs",
  "operations",
  "drafts",
  "imports",
  "migrations",
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

/** Version 1: the nine stores. */
const V1: Migration = {
  version: 1,
  up(db) {
    db.createObjectStore("sites", { keyPath: "id" });
    const events = db.createObjectStore("events", { keyPath: ["siteId", "seq"] });
    events.createIndex("bySite", "siteId", { unique: false });
    events.createIndex("eventId", "eventId", { unique: true });
    db.createObjectStore("indexes", { keyPath: ["siteId", "name", "key"] });
    db.createObjectStore("uniqueKeys", { keyPath: ["siteId", "key"] });
    db.createObjectStore("blobs", { keyPath: ["siteId", "id"] });
    db.createObjectStore("operations", { keyPath: ["siteId", "opId"] });
    const drafts = db.createObjectStore("drafts", { keyPath: ["siteId", "draftId"] });
    drafts.createIndex("bySite", "siteId", { unique: false });
    db.createObjectStore("imports", { keyPath: ["siteId", "importId"] });
    db.createObjectStore("migrations", { keyPath: "version" });
  },
};

export const MIGRATIONS: readonly Migration[] = [V1];

/** The highest version in a list, or 0 for an empty list. */
export function latestVersion(migrations: readonly Migration[]): number {
  return migrations.reduce((max, m) => Math.max(max, m.version), 0);
}

/** Run every migration above `oldVersion`, in order, and record each one. */
export function runUpgrade(
  db: IDBDatabase,
  tx: IDBTransaction,
  oldVersion: number,
  migrations: readonly Migration[],
): void {
  const pending = migrations.filter((m) => m.version > oldVersion).sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    migration.up(db, tx);
    tx.objectStore("migrations").put({ version: migration.version });
  }
}
