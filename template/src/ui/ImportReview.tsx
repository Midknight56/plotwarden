// The review of an import or of typed rows: counts, the rows that need a choice, and the button that writes.
// It changes nothing in the register. The caller commits.
import { useState } from "react";
import type { FieldDef, SheetDef } from "../adapter";
import type { BaseState } from "../base";
import { chooseConflict, fixRow, leaveOut, restoreRow } from "../data/importBatch";
import type { ConflictChoice, StagedImport, StagedRow } from "../data/importBatch";
import { fieldsForSheet } from "../data/mapping";
import type { CellError } from "../data/mapping";
import { Button, Notice, SelectField, TextField } from "./controls";
import { reasonText } from "./copy";
import { Dialog } from "./Dialog";
import { useShell } from "./shellContext";

export type Staged = StagedImport<BaseState, { type: string }, { type: string }>;
type Row = StagedRow<{ type: string }>;

const PAGE_SIZE = 50;

export type Filter = "attention" | "ready" | "unchanged" | "unplaced" | "conflict" | "error" | "left_out";

const STATUS_WORD: Record<string, string> = {
  ready: "rowStatusReady",
  unchanged: "rowStatusUnchanged",
  unplaced: "rowStatusUnplaced",
  conflict: "rowStatusConflict",
  error: "rowStatusError",
  left_out: "rowStatusLeftOut",
};

/** The words of one cell problem: "Check Source ref in row 117. Enter a value." */
export function cellErrorText(t: ReturnType<typeof useShell>["t"], error: CellError, label?: string): string {
  // An app may give its own words for a code with a `reason_{code}` entry in its catalog.
  const key = `reason_${error.code}`;
  const own = t(key);
  return t("checkField", { field: label ?? error.heading, n: error.row, reason: own === key ? reasonText(error.code) : own });
}

/**
 * The words for a filter that shows no row. The list "Rows to check" holds only errors and conflicts, so when it is
 * empty but some rows wait for a plot, it says where those rows went. Every other filter says "No rows to show.".
 */
export function emptyRowsWords(t: ReturnType<typeof useShell>["t"], filter: Filter, unplaced: number): string {
  if (filter !== "attention" || unplaced < 1) return t("noRowsToShow");
  return unplaced === 1 ? t("nothingToFixUnplacedOne") : t("nothingToFixUnplaced", { count: unplaced });
}

function FixForm({ row, fields, onSave }: { row: Row; fields: readonly FieldDef[]; onSave: (cells: Record<string, string>) => void }) {
  const { t } = useShell();
  const [cells, setCells] = useState<Record<string, string>>({ ...row.cells });
  return (
    <form
      className="stack"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSave(cells);
      }}
    >
      {row.errors.map((e) => (
        <p key={`${e.field}-${e.code}`} className="error">
          {cellErrorText(t, e)}
        </p>
      ))}
      {fields.map((f) => (
        <TextField key={f.key} label={f.label} value={cells[f.key] ?? ""} onChange={(v) => setCells((c) => ({ ...c, [f.key]: v }))} autoComplete="off" />
      ))}
      <div className="actions">
        <button type="submit" className="button primary">
          {t("saveRow")}
        </button>
      </div>
    </form>
  );
}

export interface ImportReviewProps {
  staged: Staged;
  onChange: (next: Staged) => void;
  onCommit: () => void;
  onCancel: () => void;
  busy: boolean;
  sheet: SheetDef;
  fields: readonly FieldDef[];
  /** Typed rows are fixed in place, so they offer no Fix row or Leave row out. */
  mode: "import" | "entry";
  /** Words for the download of left out rows. */
  onDownloadLeftOut?: () => void;
}

export function ImportReview({ staged, onChange, onCommit, onCancel, busy, sheet, fields, mode, onDownloadLeftOut }: ImportReviewProps) {
  const { t } = useShell();
  const sheetFields = fieldsForSheet(sheet, fields);
  const labelOf = (key: string) => sheetFields.find((f) => f.key === key)?.label ?? key;
  const [filter, setFilter] = useState<Filter>("attention");
  const [page, setPage] = useState(0);
  const [fixing, setFixing] = useState<number | undefined>();
  const { counts } = staged;

  const shown = staged.rows.filter((r) => (filter === "attention" ? r.status === "error" || r.status === "conflict" : r.status === filter));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const at = Math.min(page, pages - 1);
  const visible = shown.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE);
  const fixingRow = fixing === undefined ? undefined : staged.rows.find((r) => r.rowNumber === fixing);

  const importLabel = staged.writes === 1 ? t(mode === "import" ? "importOneRecord" : "saveOneRecord") : t(mode === "import" ? "importRecords" : "saveRecords", { count: staged.writes });
  const blocked = counts.errors > 0 || counts.conflicts > 0;
  const nothing = !blocked && staged.writes === 0;

  const countItems: [string, number][] = [
    [t("countReady"), counts.ready],
    [t("countUnchanged"), counts.unchanged],
    [t("countUnplaced"), counts.unplaced],
    [t("countConflicts"), counts.conflicts],
    [t("countErrors"), counts.errors],
    [t("countLeftOut"), counts.leftOut],
  ];

  const rowLine = (row: Row) => (row.sourceRef === undefined || row.sourceRef === "" ? t("rowLine", { n: row.rowNumber, ref: t("noRefYet") }) : t("rowLine", { n: row.rowNumber, ref: row.sourceRef }));

  const changed = (row: Row): string[] => {
    const keys = new Set([...Object.keys(row.before ?? {}), ...Object.keys(row.after ?? {})]);
    return [...keys].filter((k) => (row.before?.[k] ?? "") !== (row.after?.[k] ?? ""));
  };

  return (
    <section className="stack" aria-label={t("reviewHeading")}>
      <h2>{t("reviewHeading")}</h2>
      <ul className="counts plain" aria-label={t("reviewImport")}>
        {countItems.map(([label, n]) => (
          <li key={label}>{`${label} ${n}`}</li>
        ))}
      </ul>

      {nothing ? <Notice>{t("nothingToImport")}</Notice> : null}
      {blocked ? <Notice tone="error">{t("importBlocked")}</Notice> : null}

      {mode === "import" ? (
        <SelectField
          label={t("rowFilter")}
          value={filter}
          onChange={(v) => {
            setFilter(v as Filter);
            setPage(0);
          }}
          options={[
            { value: "attention", label: t("rowsToCheck") },
            { value: "error", label: t("countErrors") },
            { value: "conflict", label: t("countConflicts") },
            { value: "left_out", label: t("countLeftOut") },
            { value: "ready", label: t("countReady") },
            { value: "unplaced", label: t("countUnplaced") },
            { value: "unchanged", label: t("countUnchanged") },
          ]}
        />
      ) : null}

      {visible.length === 0 ? (
        mode === "import" ? (
          <p>{emptyRowsWords(t, filter, counts.unplaced)}</p>
        ) : null
      ) : (
        <ul className="cards plain">
          {visible.map((row) => (
            <li key={row.rowNumber} className="card stack">
              <h3>{rowLine(row)}</h3>
              <p>{t(STATUS_WORD[row.status] ?? "rowStatusReady")}</p>
              {row.errors.map((e) => (
                <p key={`${e.field}-${e.code}`} className="error">
                  {cellErrorText(t, e, labelOf(e.field))}
                </p>
              ))}
              {row.status === "conflict"
                ? changed(row).map((key) => (
                    <div key={key} className="stack">
                      <p>{labelOf(key)}</p>
                      <p>{`${t("beforeLabel")} ${row.before?.[key] ?? ""}`}</p>
                      <p>{`${t("afterLabel")} ${row.after?.[key] ?? ""}`}</p>
                    </div>
                  ))
                : null}
              {row.status === "left_out" && row.leftOutReason !== undefined ? <p>{row.leftOutReason}</p> : null}
              <div className="actions">
                {row.status === "conflict" ? (
                  <>
                    <Button onClick={() => onChange(chooseConflict(staged, row.rowNumber, "keep_current" as ConflictChoice))}>{t("keepCurrent")}</Button>
                    <Button onClick={() => onChange(chooseConflict(staged, row.rowNumber, "record_correction" as ConflictChoice))}>{t("recordCorrection")}</Button>
                  </>
                ) : null}
                {mode === "import" && row.status === "error" ? <Button onClick={() => setFixing(row.rowNumber)}>{t("fixRow")}</Button> : null}
                {mode === "import" && (row.status === "error" || row.status === "conflict") ? (
                  <Button onClick={() => onChange(leaveOut(staged, row.rowNumber, t("countLeftOut")))}>{t("leaveRowOut")}</Button>
                ) : null}
                {row.status === "left_out" ? <Button onClick={() => onChange(restoreRow(staged, row.rowNumber))}>{t("restoreRow")}</Button> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <div className="actions">
          <Button onClick={() => setPage(Math.max(0, at - 1))} disabled={at === 0}>
            {t("previousPage")}
          </Button>
          <p>{t("pageOfPages", { page: at + 1, pages })}</p>
          <Button onClick={() => setPage(Math.min(pages - 1, at + 1))} disabled={at >= pages - 1}>
            {t("nextPage")}
          </Button>
        </div>
      ) : null}

      <div className="actions">
        <Button primary onClick={onCommit} disabled={busy || blocked || staged.writes === 0}>
          {importLabel}
        </Button>
        {mode === "import" && counts.leftOut > 0 && onDownloadLeftOut !== undefined ? <Button onClick={onDownloadLeftOut}>{t("downloadLeftOut")}</Button> : null}
        <Button onClick={onCancel}>{mode === "import" ? t("cancelImport") : t("cancel")}</Button>
      </div>

      <Dialog open={fixingRow !== undefined} title={t("fixRowTitle", { n: fixing ?? 0 })} onClose={() => setFixing(undefined)}>
        {fixingRow === undefined ? null : (
          <FixForm
            key={fixingRow.rowNumber}
            row={fixingRow}
            fields={sheetFields}
            onSave={(cells) => {
              onChange(fixRow(staged, fixingRow.rowNumber, cells));
              setFixing(undefined);
            }}
          />
        )}
      </Dialog>
    </section>
  );
}
