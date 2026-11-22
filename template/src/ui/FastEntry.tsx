// Fast entry and one record: typed rows checked together, then saved together.
// One board serves both. Fast entry adds the page beside the rows, the repeat aids, paste and a draft.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, FormEvent, KeyboardEvent } from "react";
import type { FieldDef, SheetDef } from "../adapter";
import type { DateOrder } from "../calendar";
import { buildRecoveryFile, deleteDraft, listDrafts, saveDraft } from "../data/drafts";
import type { Draft } from "../data/drafts";
import {
  addRow,
  choosePage,
  fillPlotSequence,
  firstProblem,
  focusProblem,
  fromDraft,
  markSaved,
  newSession,
  parseDraftFile,
  pasteCells,
  removeRow,
  repeatFromAbove,
  rowsToMapped,
  setCell,
  setCurrentRow,
  toDraft,
} from "../data/fastEntry";
import type { EntrySession } from "../data/fastEntry";
import { commitImport, stageImport } from "../data/importBatch";
import type { SheetImporter } from "../data/importBatch";
import { fieldsForSheet } from "../data/mapping";
import type { CellError } from "../data/mapping";
import type { BaseState } from "../base";
import { Button, ButtonLink, Notice, SelectField, TextField } from "./controls";
import { downloadText } from "./download";
import { commitMessage } from "./messages";
import { cellErrorText, ImportReview } from "./ImportReview";
import type { Staged } from "./ImportReview";
import { ReferencePage } from "./ReferencePage";
import { useRegister, useShell } from "./shellContext";
import { Status } from "./Status";
import type { StatusState } from "./Status";

type Importer = SheetImporter<BaseState, { type: string }>;

function Board({ single, importer, sheet }: { single: boolean; importer: Importer; sheet: SheetDef }) {
  const shell = useShell();
  const { app, db, register, t, newId, now } = shell;
  const open = useRegister();
  const base = `#/r/${open.site.id}`;
  const allFields = app.adapter.fields;
  const fields: FieldDef[] = useMemo(() => fieldsForSheet(sheet, allFields), [sheet, allFields]);
  const placementKey = importer.placementField ?? "plot";

  const [session, setSession] = useState<EntrySession>(newSession);
  const [order, setOrder] = useState<"" | "dmy" | "mdy">("");
  const [staged, setStaged] = useState<Staged | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ phase: "error" | "info" | "good"; text: string } | undefined>();
  const [status, setStatus] = useState<StatusState>({ phase: "idle" });
  const [saved, setSaved] = useState<{ count: number; unplaced: number } | undefined>();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Draft | undefined>();
  const [hasDraft, setHasDraft] = useState(false);
  const [pageUrl, setPageUrl] = useState<string | undefined>();
  const touched = useRef(false);
  const draftId = useRef<string | undefined>(undefined);
  const opId = useRef<string | undefined>(undefined);
  const dateOrder: DateOrder | undefined = order === "" ? undefined : order;

  // A draft left by an earlier visit is offered, never opened without a choice.
  useEffect(() => {
    if (single) return;
    let current = true;
    void listDrafts(db, open.site.id).then((found) => {
      if (!current) return;
      const mine = found.filter((d) => d.kind === app.adapter.kind && d.rawRows.length > 0 && d.mapping["screen"] === undefined);
      const latest = mine.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))[0];
      if (latest !== undefined) {
        setPending(latest);
        setHasDraft(true);
      }
    });
    return () => {
      current = false;
    };
  }, [single, db, open.site.id, app.adapter.kind]);

  // The photo of the page is held in memory for this visit only.
  useEffect(
    () => () => {
      if (pageUrl !== undefined) URL.revokeObjectURL(pageUrl);
    },
    [pageUrl],
  );

  // Move focus where a failed check or a key press asked for it.
  useEffect(() => {
    const target = session.focus;
    if (target === undefined) return;
    document.querySelector<HTMLElement>(`[data-cell="${target.row}:${target.field}"]`)?.focus();
    setSession((s) => {
      const { focus: _gone, ...rest } = s;
      return rest;
    });
  }, [session.focus]);

  const meta = () => ({
    draftId: draftId.current ?? newId(),
    siteId: open.site.id,
    kind: app.adapter.kind,
    baseRevision: open.revision,
    savedAt: now().toISOString(),
  });

  // Keep the draft in step with the rows, so an interrupted visit loses nothing.
  useEffect(() => {
    if (single || !touched.current || pending !== undefined) return;
    const unsaved = session.rows.some((r) => !r.saved && Object.values(r.cells).some((v) => v.trim() !== ""));
    void (async () => {
      if (!unsaved) {
        if (draftId.current !== undefined) {
          const id = draftId.current;
          draftId.current = undefined;
          await deleteDraft(db, open.site.id, id);
          setHasDraft(false);
        }
        return;
      }
      draftId.current ??= newId();
      await saveDraft(db, toDraft(session, meta()));
      setHasDraft(true);
    })();
    // The draft follows the session and nothing else.
  }, [session]);

  const update = (change: (s: EntrySession) => EntrySession) => {
    touched.current = true;
    opId.current = undefined;
    setStaged(undefined);
    setSaved(undefined);
    setStatus({ phase: "idle" });
    setSession(change);
  };

  const setField = (rowIndex: number, key: string, value: string) => {
    setErrors((e) => {
      const name = `${rowIndex + 1}:${key}`;
      if (e[name] === undefined) return e;
      const { [name]: _gone, ...rest } = e;
      return rest;
    });
    update((s) => setCell(s, rowIndex, key, value));
  };

  const labelOf = (key: string) => fields.find((f) => f.key === key)?.label ?? key;

  const showProblems = (found: readonly CellError[]) => {
    const next: Record<string, string> = {};
    for (const e of found) {
      const name = `${e.row}:${e.field}`;
      if (next[name] !== undefined) continue;
      next[name] = e.code === "required" ? t("enterField", { field: labelOf(e.field) }) : cellErrorText(t, e, labelOf(e.field));
    }
    setErrors(next);
    const first = firstProblem(found, fields);
    setSession((s) => focusProblem(s, first));
    if (first !== undefined && !single) setMessage({ phase: "error", text: t("rowNeedsAttention", { n: first.row }) });
  };

  const review = (event?: FormEvent) => {
    event?.preventDefault();
    setStatus({ phase: "idle" });
    setSaved(undefined);
    setMessage(undefined);
    setErrors({});
    const mapped = rowsToMapped(session, sheet, allFields, dateOrder === undefined ? undefined : { dateOrder });
    if (mapped.length === 0) {
      setMessage({ phase: "error", text: t("nothingToReview") });
      return;
    }
    const cellErrors = mapped.flatMap((r) => r.errors);
    if (cellErrors.length > 0) {
      setStaged(undefined);
      showProblems(cellErrors);
      return;
    }
    const result = stageImport({
      register,
      importer,
      rows: mapped,
      columns: fields.map((f, index) => ({ index, heading: f.label, fieldKey: f.key })),
      sheet,
      fields: allFields,
      state: open.state,
      siteId: open.site.id,
      baseRevision: open.revision,
      effectiveOn: open.today,
      options: { newId, events: open.events, ...(dateOrder === undefined ? {} : { dateOrder }) },
    });
    if (result.counts.errors > 0) {
      setStaged(undefined);
      showProblems(result.rows.flatMap((r) => r.errors));
      return;
    }
    setStaged(result);
  };

  const commit = async () => {
    if (staged === undefined || busy) return;
    setBusy(true);
    setStatus({ phase: "saving" });
    opId.current ??= newId();
    const result = await commitImport(db, staged, { opId: opId.current, now: shell.now, newId });
    setBusy(false);
    if (!result.ok) {
      const text =
        result.error !== undefined
          ? commitMessage(t, result.error)
          : result.code === "nothing_to_import"
            ? t("nothingToImport")
            : result.code === "import_has_conflicts" || result.code === "import_has_errors"
              ? t("importBlocked")
              : t("reason_unknown");
      setStatus({ phase: "error", code: result.error?.code ?? result.code, text });
      return;
    }
    opId.current = undefined;
    const written = staged.rows.filter((r) => r.commands.length > 0).map((r) => r.rowNumber);
    await open.reload();
    setStaged(undefined);
    touched.current = true;
    setSession((s) => (single ? newSession() : markSaved(s, written)));
    setSaved({ count: result.written, unplaced: result.unplaced });
    setStatus({ phase: "saved" });
  };

  const focusCell = (rowNumber: number, key: string) => setSession((s) => focusProblem(s, { row: rowNumber, field: key }));

  const keyDown = (event: KeyboardEvent<HTMLInputElement>, rowIndex: number, key: string) => {
    if (event.key !== "Enter" || single) return;
    event.preventDefault();
    const nextIndex = rowIndex + 1;
    if (nextIndex < session.rows.length) focusCell(nextIndex + 1, key);
    else update((s) => focusProblem(setCurrentRow(addRow(s), nextIndex), { row: nextIndex + 1, field: key }));
  };

  const paste = (event: ClipboardEvent<HTMLInputElement>, rowIndex: number, key: string) => {
    const text = (event.clipboardData?.getData("text/plain") ?? "").replace(/\r?\n+$/, "");
    if (!/[\t\n]/.test(text)) return;
    event.preventDefault();
    const result = pasteCells(session, rowIndex, key, text, fields);
    if (!result.ok) {
      const word = result.error.code === "paste_too_wide" ? "pasteTooWide" : result.error.code === "not_rectangular" ? "pasteNotRectangular" : result.error.code === "empty_paste" ? "pasteEmpty" : "reason_over_limit";
      setMessage({ phase: "error", text: t(word) });
      return;
    }
    setMessage(undefined);
    update(() => result.value);
  };

  const chosenRow = Math.min(session.currentRow, session.rows.length - 1);
  const aid = (kind: "section" | "page") => update((s) => repeatFromAbove(s, chosenRow, kind, fields, importer.sourceRefField));
  const sequence = () => {
    const result = fillPlotSequence(session, chosenRow, placementKey);
    if (!result.ok) {
      setMessage({ phase: "error", text: t(result.error.code === "no_trailing_number" ? "noTrailingNumber" : "noRowAbove") });
      return;
    }
    setMessage(undefined);
    update(() => result.value);
  };

  const choosePhoto = (file: File) => {
    setPageUrl(URL.createObjectURL(file));
    update((s) => choosePage(s));
  };

  const resume = () => {
    if (pending === undefined) return;
    draftId.current = pending.draftId;
    setSession(fromDraft(pending));
    setMessage({ phase: "good", text: t(pending.pageImageNeedsReselect ? "draftRestored" : "draftRestoredPlain") });
    setPending(undefined);
  };

  const discard = async () => {
    // The screen is cleared first, so the keeper never sees rows that are about to go.
    draftId.current = undefined;
    touched.current = false;
    if (pageUrl !== undefined) setPageUrl(undefined);
    setSession(newSession());
    setStaged(undefined);
    setErrors({});
    setPending(undefined);
    setHasDraft(false);
    setMessage(undefined);
    for (const d of await listDrafts(db, open.site.id)) if (d.kind === app.adapter.kind && d.mapping["screen"] === undefined) await deleteDraft(db, open.site.id, d.draftId);
  };

  const downloadRecovery = () => {
    const file = buildRecoveryFile(toDraft(session, meta()));
    downloadText(file.filename, file.text, "application/json");
  };

  /** The rows are saved as a draft as they change. This saves them once more and says so only when the store has them. */
  const keepDraft = () => {
    draftId.current ??= newId();
    void saveDraft(db, toDraft(session, meta())).then((result) => {
      setHasDraft(result.ok);
      setStatus(result.ok ? { phase: "working", text: t("draftKept") } : { phase: "error", code: "storage_abort", text: t("storageAbort") });
    });
  };

  const readRecovery = async (file: File | undefined) => {
    if (file === undefined) return;
    const parsed = parseDraftFile(await file.text(), { kind: app.adapter.kind, siteId: open.site.id });
    if (!parsed.ok) {
      const code = parsed.error.code;
      setMessage({ phase: "error", text: t(code === "newer_version" ? "needsNewerVersion" : code === "wrong_kind" || code === "foreign_site" ? "recoveryNotForThis" : "recoveryNotFile") });
      return;
    }
    update(() => fromDraft(parsed.value));
    setPending(undefined);
    setMessage({ phase: "good", text: t(parsed.value.pageImageNeedsReselect ? "draftRestored" : "draftRestoredPlain") });
  };

  const rows = session.rows;
  const rowFields = (rowIndex: number) =>
    fields.map((f) => (
      <TextField
        key={f.key}
        label={f.label}
        value={rows[rowIndex]?.cells[f.key] ?? ""}
        error={errors[`${rowIndex + 1}:${f.key}`]}
        disabled={rows[rowIndex]?.saved === true}
        autoComplete="off"
        data-cell={`${rowIndex + 1}:${f.key}`}
        onChange={(v) => setField(rowIndex, f.key, v)}
        onFocus={() => setSession((s) => (s.currentRow === rowIndex ? s : setCurrentRow(s, rowIndex)))}
        onKeyDown={(e) => keyDown(e, rowIndex, f.key)}
        onPaste={(e) => paste(e, rowIndex, f.key)}
      />
    ));

  return (
    <section className="stack">
      <h1>{single ? t("oneRecord") : t("fastEntry")}</h1>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
        <ButtonLink href={`${base}/add`}>{t("backToAdd")}</ButtonLink>
      </div>

      {!single && pending !== undefined ? (
        <div className="notice info" role="status">
          <p>{t("draftFound")}</p>
          <div className="actions">
            <Button primary onClick={resume}>
              {t("resumeDraft")}
            </Button>
          </div>
        </div>
      ) : null}
      {message === undefined ? null : <Notice tone={message.phase}>{message.text}</Notice>}

      <div className={single ? "entry" : "entry entry-wide"}>
        {single ? null : (
          <ReferencePage session={session} onSession={update} url={pageUrl} onChoose={choosePhoto} />
        )}
        <form className="stack rows" noValidate onSubmit={review}>
          <h2>{t("rowsHeading")}</h2>
          {rows.map((row, i) =>
            single ? (
              <div key={row.rowId} className="stack">
                {rowFields(i)}
              </div>
            ) : (
              <fieldset key={row.rowId} className="card stack">
                <legend>{t("rowTitle", { n: i + 1 })}</legend>
                <p className="hint">{row.saved ? t("rowSaved") : t("rowNotSaved")}</p>
                {rowFields(i)}
                {rows.length > 1 && !row.saved ? (
                  <div className="actions">
                    <Button onClick={() => update((s) => removeRow(s, i))}>{t("removeRow")}</Button>
                  </div>
                ) : null}
              </fieldset>
            ),
          )}
          {single ? null : (
            <div className="actions">
              <Button onClick={() => update((s) => focusProblem(setCurrentRow(addRow(s), s.rows.length), { row: s.rows.length + 1, field: fields[0]?.key ?? "" }))}>{t("addRow")}</Button>
              <Button onClick={sequence}>{t("fillPlotSequence")}</Button>
              <Button onClick={() => aid("section")}>{t("repeatSection")}</Button>
              <Button onClick={() => aid("page")}>{t("repeatPage")}</Button>
            </div>
          )}
          <SelectField
            label={t("dateOrder")}
            value={order}
            onChange={(v) => {
              setOrder(v === "dmy" ? "dmy" : v === "mdy" ? "mdy" : "");
              setStaged(undefined);
            }}
            options={[
              { value: "", label: t("orderYearFirst") },
              { value: "dmy", label: t("orderDayMonth") },
              { value: "mdy", label: t("orderMonthDay") },
            ]}
          />
          <div className="actions">
            <button type="submit" className="button primary">
              {t("reviewRows")}
            </button>
          </div>
        </form>
      </div>

      {saved === undefined ? null : <Notice tone="good">{t("savedCount", { count: saved.count, unplaced: saved.unplaced })}</Notice>}
      <Status status={status} actions={{ tryAgain: () => setStatus({ phase: "idle" }), openLatest: () => void open.reload(), keepEditing: () => setStatus({ phase: "idle" }), keepDraft, downloadRecovery }} />

      {staged === undefined ? null : (
        <ImportReview staged={staged} onChange={setStaged} onCommit={() => void commit()} onCancel={() => setStaged(undefined)} busy={busy} sheet={sheet} fields={allFields} mode="entry" />
      )}

      {single ? null : (
        <section className="stack" aria-label={t("recoveryHeading")}>
          <h2>{t("recoveryHeading")}</h2>
          <p>{t("recoveryHint")}</p>
          <div className="actions">
            <Button onClick={downloadRecovery}>{t("actionDownloadRecovery")}</Button>
            {hasDraft ? <Button onClick={() => void discard()}>{t("discardDraft")}</Button> : null}
          </div>
          <div className="field">
            <label htmlFor="recovery-file">{t("chooseRecoveryFile")}</label>
            <input
              id="recovery-file"
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                void readRecovery(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </section>
      )}
    </section>
  );
}

/** The sheet and importer a register enters rows with: its first. */
function useEntry(): { importer: Importer; sheet: SheetDef } | undefined {
  const { app } = useShell();
  const importer = app.importers[0];
  const sheet = importer === undefined ? undefined : app.adapter.sheets.find((s) => s.name === importer.sheet);
  return importer === undefined || sheet === undefined ? undefined : { importer, sheet };
}

export function FastEntry() {
  const entry = useEntry();
  const { t } = useShell();
  return entry === undefined ? <p role="alert">{t("reason_unknown")}</p> : <Board single={false} importer={entry.importer} sheet={entry.sheet} />;
}

export function SingleEntry() {
  const entry = useEntry();
  const { t } = useShell();
  return entry === undefined ? <p role="alert">{t("reason_unknown")}</p> : <Board single importer={entry.importer} sheet={entry.sheet} />;
}
