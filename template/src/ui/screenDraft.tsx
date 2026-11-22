// A screen's own draft: keep what the keeper typed, offer it again on the next visit, and hand it over as a recovery file.
// One draft for each screen of one register. It holds raw input only and never changes a revision or an event.
import { useCallback, useEffect, useRef, useState } from "react";
import { buildRecoveryFile, deleteDraft, listDrafts, saveDraft } from "../data/drafts";
import type { Draft } from "../data/drafts";
import { Button, Notice } from "./controls";
import { downloadText } from "./download";
import { useRegister, useShell } from "./shellContext";
import type { StatusActions, StatusState } from "./Status";

export interface ScreenDraft {
  /** The draft left by an earlier visit, until it is resumed or discarded. */
  pending: Draft | undefined;
  /** The identity of a draft made now. It is the same for every save of this screen. */
  meta(): { draftId: string; siteId: string; kind: string; baseRevision: number; savedAt: string };
  /** True only after the draft is stored. */
  save(draft: Draft): Promise<boolean>;
  download(draft: Draft): void;
  /** Delete the stored draft and any offer of it. */
  discard(): Promise<void>;
  /** Stop offering the draft, and keep it stored. */
  forget(): void;
  /** A draft of typed fields: one row of text and the name of the screen. */
  ofFields(fields: Record<string, string>): Draft;
  /** The two buttons of an error: keep what was typed, or take it as a file. */
  actions(fields: () => Record<string, string>, setStatus: (status: StatusState) => void): Pick<StatusActions, "keepDraft" | "downloadRecovery">;
}

export function useScreenDraft(screen: string): ScreenDraft {
  const { db, app, now, newId, t } = useShell();
  const open = useRegister();
  const siteId = open.site.id;
  const kind = app.adapter.kind;
  const [pending, setPending] = useState<Draft | undefined>();
  const id = useRef<string | undefined>(undefined);
  const revision = useRef(open.revision);
  revision.current = open.revision;

  useEffect(() => {
    let current = true;
    void listDrafts(db, siteId).then((found) => {
      if (!current) return;
      const mine = found.filter((d) => d.kind === kind && d.mapping["screen"] === screen && d.rawRows.length > 0).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))[0];
      if (mine !== undefined) {
        id.current = mine.draftId;
        setPending(mine);
      }
    });
    return () => {
      current = false;
    };
  }, [db, siteId, kind, screen]);

  const meta = useCallback(() => {
    id.current ??= newId();
    return { draftId: id.current, siteId, kind, baseRevision: revision.current, savedAt: now().toISOString() };
  }, [newId, now, siteId, kind]);

  const save = useCallback(async (draft: Draft) => (await saveDraft(db, draft)).ok, [db]);
  const download = useCallback((draft: Draft) => {
    const file = buildRecoveryFile(draft);
    downloadText(file.filename, file.text, "application/json");
  }, []);
  const discard = useCallback(async () => {
    const stored = id.current;
    id.current = undefined;
    setPending(undefined);
    if (stored !== undefined) await deleteDraft(db, siteId, stored);
  }, [db, siteId]);
  const forget = useCallback(() => setPending(undefined), []);

  const ofFields = useCallback(
    (fields: Record<string, string>): Draft => ({ ...meta(), rawRows: [{ ...fields }], mapping: { screen }, currentRow: 0, commands: [], pageImageNeedsReselect: false }),
    [meta, screen],
  );

  const actions = useCallback<ScreenDraft["actions"]>(
    (fields, setStatus) => ({
      keepDraft: () => {
        void save(ofFields(fields())).then((ok) => setStatus(ok ? { phase: "working", text: t("draftKept") } : { phase: "error", code: "storage_abort", text: t("storageAbort") }));
      },
      downloadRecovery: () => download(ofFields(fields())),
    }),
    [save, download, ofFields, t],
  );

  return { pending, meta, save, download, discard, forget, ofFields, actions };
}

/** The offer of a draft left by an earlier visit. Resume gives its fields back. Discard deletes it. */
export function DraftOffer({ draft, onResume }: { draft: ScreenDraft; onResume: (fields: Record<string, string>) => void }) {
  const { t } = useShell();
  const [restored, setRestored] = useState(false);
  if (restored) return <Notice>{t("draftRestoredInput")}</Notice>;
  if (draft.pending === undefined) return null;
  const fields = draft.pending.rawRows[0] as Record<string, string> | undefined;
  return (
    <section className="stack card" aria-label={t("draftFoundInput")}>
      <p>{t("draftFoundInput")}</p>
      <div className="actions">
        <Button
          primary
          onClick={() => {
            if (fields !== undefined) onResume({ ...fields });
            draft.forget();
            setRestored(true);
          }}
        >
          {t("resumeDraft")}
        </Button>
        <Button onClick={() => void draft.discard()}>{t("discardDraft")}</Button>
      </div>
    </section>
  );
}
