// Drafts and the recovery file. Browser IndexedDB only.
// A draft is raw, unsaved input. It never changes a revision or an event.
import { canonicalJson } from "../events";
import { err, ok } from "../types";
import type { Result, Uuid } from "../types";
import { requestResult, transact } from "./db";

export interface Draft {
  draftId: Uuid;
  siteId: Uuid;
  kind: string;
  baseRevision: number;
  rawRows: unknown[];
  mapping: Record<string, string>;
  currentRow: number;
  commands: unknown[];
  /** True when a temporary page photo was in use and must be chosen again. */
  pageImageNeedsReselect: boolean;
  savedAt: string;
}

/** A fixed name. It holds no site name, ID or person. */
export const RECOVERY_FILENAME = "register-recovery.json";

export async function saveDraft(db: IDBDatabase, draft: Draft): Promise<Result<true>> {
  const result = await transact(db, ["drafts"], "readwrite", async (tx) => {
    await requestResult(tx.objectStore("drafts").put(draft));
  });
  return result.ok ? ok(true) : err(result.error.code);
}

export async function loadDraft(db: IDBDatabase, siteId: Uuid, draftId: Uuid): Promise<Draft | undefined> {
  return (await requestResult(db.transaction("drafts").objectStore("drafts").get([siteId, draftId]))) as Draft | undefined;
}

export async function listDrafts(db: IDBDatabase, siteId: Uuid): Promise<Draft[]> {
  const index = db.transaction("drafts").objectStore("drafts").index("bySite");
  return (await requestResult(index.getAll(siteId))) as Draft[];
}

export async function deleteDraft(db: IDBDatabase, siteId: Uuid, draftId: Uuid): Promise<void> {
  await transact(db, ["drafts"], "readwrite", async (tx) => {
    await requestResult(tx.objectStore("drafts").delete([siteId, draftId]));
  });
}

/** The `plot.draft.v1` file for a draft. It restores only to a draft preview. */
export function buildRecoveryFile(draft: Draft): { filename: string; text: string } {
  const body = {
    format: "plot.draft.v1",
    kind: draft.kind,
    siteId: draft.siteId,
    baseRevision: draft.baseRevision,
    rawRows: draft.rawRows,
    mapping: draft.mapping,
    currentRow: draft.currentRow,
    commands: draft.commands,
    pageImageNeedsReselect: draft.pageImageNeedsReselect,
  };
  return { filename: RECOVERY_FILENAME, text: canonicalJson(body) };
}
