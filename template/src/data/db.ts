// Open the register database and run transactions. Browser IndexedDB only.
import { err, ok } from "../types";
import type { Result } from "../types";
import { MIGRATIONS, latestVersion, runUpgrade } from "./migrate";
import type { Migration } from "./migrate";

export const DB_NAME = "plotwarden";

export interface OpenOptions {
  name?: string;
  migrations?: readonly Migration[];
  /** Called after this connection has closed itself because another tab needs a newer schema. */
  onVersionChange?: () => void;
}

/**
 * Open the database. Returns `storage_unavailable` when there is no IndexedDB
 * or the browser refuses, `upgrade_failed` when a migration throws and
 * `schema_too_new` when the stored schema is newer than this code knows.
 */
export function openRegisterDb(factory: IDBFactory | undefined, options?: OpenOptions): Promise<Result<IDBDatabase>> {
  if (factory === undefined) return Promise.resolve(err("storage_unavailable"));
  const migrations = options?.migrations ?? MIGRATIONS;
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(options?.name ?? DB_NAME, latestVersion(migrations));
    } catch {
      resolve(err("storage_unavailable"));
      return;
    }
    let upgradeFailed = false;
    request.onupgradeneeded = (event) => {
      try {
        runUpgrade(request.result, request.transaction as IDBTransaction, event.oldVersion, migrations);
      } catch {
        upgradeFailed = true;
        try {
          request.transaction?.abort();
        } catch {
          // The transaction had already ended.
        }
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        options?.onVersionChange?.();
      };
      resolve(ok(db));
    };
    request.onerror = (event) => {
      event.preventDefault?.();
      if (upgradeFailed) resolve(err("upgrade_failed"));
      else if (request.error?.name === "VersionError") resolve(err("schema_too_new"));
      else resolve(err("storage_unavailable"));
    };
  });
}

/** Wait for one request. */
export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export type StorageFailure = "quota" | "storage_abort";

/** A quota error is told apart so the screen can say so. Anything else is an abort. */
export function classifyError(error: unknown): StorageFailure {
  const name = (error as { name?: string } | null | undefined)?.name;
  const code = (error as { code?: number } | null | undefined)?.code;
  return name === "QuotaExceededError" || code === 22 ? "quota" : "storage_abort";
}

/**
 * Run `body` inside one transaction. Resolves only when the transaction fires
 * `complete`. If `body` throws or the transaction aborts, every write in it is
 * rolled back and the result names the failure.
 */
export function transact<T>(
  db: IDBDatabase,
  stores: readonly string[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction) => Promise<T>,
): Promise<Result<T, { code: StorageFailure }>> {
  return new Promise((resolve) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction([...stores], mode);
    } catch (error) {
      resolve({ ok: false, error: { code: classifyError(error) } });
      return;
    }
    let value: T | undefined;
    let finished = false;
    let failure: StorageFailure | undefined;
    tx.oncomplete = () => {
      resolve(
        finished && failure === undefined
          ? { ok: true, value: value as T }
          : { ok: false, error: { code: failure ?? "storage_abort" } },
      );
    };
    tx.onabort = () => {
      resolve({ ok: false, error: { code: failure ?? classifyError(tx.error) } });
    };
    tx.onerror = () => {
      // An abort follows. It resolves the result.
    };
    body(tx).then(
      (result) => {
        value = result;
        finished = true;
      },
      (error: unknown) => {
        failure = classifyError(error);
        try {
          tx.abort();
        } catch {
          // The transaction had already ended.
        }
      },
    );
  });
}
