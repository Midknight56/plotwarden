// Import a spreadsheet saved as CSV: read it, match its columns, review every row, then write once.
// Nothing is written until Import. A file with an error writes nothing. The staged rows and the keeper's fixes are kept
// as a draft on this device, so a refresh or a save made from another tab loses neither.
import { useEffect, useMemo, useRef, useState } from "react";
import type { FieldDef, SheetDef } from "../adapter";
import type { DateOrder } from "../calendar";
import { detectSeparator, parseCsv, readCsvBytes } from "../data/csv";
import type { CsvTable, Separator } from "../data/csv";
import { columnGuide } from "../data/csvExport";
import { commitImport, leftOutCsv, restageWith, stageImport } from "../data/importBatch";
import type { Selection, SheetImporter, StageInput } from "../data/importBatch";
import { IMPORT_SCREEN, importFromDraft, importToDraft } from "../data/importDraft";
import { applyMapping, fieldsForSheet, suggestMapping } from "../data/mapping";
import type { MappedRow, MappingColumn } from "../data/mapping";
import type { DomainError } from "../types";
import type { BaseState } from "../base";
import { Button, ButtonLink, Notice, RadioGroup, SelectField, TextArea } from "./controls";
import { downloadText } from "./download";
import { ImportReview } from "./ImportReview";
import type { Staged } from "./ImportReview";
import { commitMessage, errorMessage } from "./messages";
import { useScreenDraft } from "./screenDraft";
import { useRegister, useShell } from "./shellContext";
import { Status } from "./Status";
import type { StatusState } from "./Status";

type Importer = SheetImporter<BaseState, { type: string }>;

/** What the rows come from: the table, how its columns match the register and the date order. */
interface Source {
  table: CsvTable;
  columns: MappingColumn[];
  dateOrder: DateOrder | undefined;
  importer: Importer;
  sheet: SheetDef;
}

export function ImportWizard() {
  const shell = useShell();
  const { app, db, register, t, newId } = shell;
  const open = useRegister();
  const base = `#/r/${open.site.id}`;
  const allFields = app.adapter.fields;
  const draft = useScreenDraft(IMPORT_SCREEN);

  const [sheetName, setSheetName] = useState(app.importers[0]?.sheet ?? "");
  const importer = app.importers.find((i) => i.sheet === sheetName) ?? app.importers[0];
  const sheet: SheetDef | undefined = importer === undefined ? undefined : app.adapter.sheets.find((s) => s.name === importer.sheet);
  const fields: FieldDef[] = useMemo(() => (sheet === undefined ? [] : fieldsForSheet(sheet, allFields)), [sheet, allFields]);

  const [fileText, setFileText] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [separator, setSeparator] = useState<"" | Separator>("");
  const [unclear, setUnclear] = useState<{ comma: string[][]; semicolon: string[][] } | undefined>();
  const [table, setTable] = useState<CsvTable | undefined>();
  const [parsedFrom, setParsedFrom] = useState("");
  const [columns, setColumns] = useState<MappingColumn[]>([]);
  const [order, setOrder] = useState<"" | "dmy" | "mdy">("");
  const [staged, setStaged] = useState<Staged | undefined>();
  const [messages, setMessages] = useState<{ phase: "error" | "good"; text: string }[]>([]);
  const [status, setStatus] = useState<StatusState>({ phase: "idle" });
  const [saved, setSaved] = useState<{ count: number; unplaced: number } | undefined>();
  const [busy, setBusy] = useState(false);
  const opId = useRef<string | undefined>(undefined);
  const committing = useRef(false);
  const dateOrder: DateOrder | undefined = order === "" ? undefined : order;

  /** The register as it is now, ready to stage a table. */
  const stageInput = (source: Source, rows: MappedRow[]): StageInput<BaseState, { type: string }, { type: string }> => ({
    register,
    importer: source.importer,
    rows,
    columns: source.columns,
    sheet: source.sheet,
    fields: allFields,
    state: open.state,
    siteId: open.site.id,
    baseRevision: open.revision,
    effectiveOn: open.today,
    options: { newId, events: open.events, ...(source.dateOrder === undefined ? {} : { dateOrder: source.dateOrder }) },
  });

  /** Stage the table again against the register as it is now, keeping the choices already made. */
  const restage = (selection: Selection, from?: Source): boolean => {
    const source = from ?? (table !== undefined && importer !== undefined && sheet !== undefined ? { table, columns, dateOrder, importer, sheet } : undefined);
    if (source === undefined) return false;
    const applied = applyMapping(source.table, { columns: source.columns }, source.sheet, allFields, source.dateOrder === undefined ? undefined : { dateOrder: source.dateOrder });
    if (!applied.ok) return false;
    opId.current = undefined;
    setStaged(restageWith(stageInput(source, applied.value), selection));
    return true;
  };

  // The register moved on under a staged import, for example by a save from another tab. Check every row again with the
  // fixes, the left out rows and the conflict choices kept, so Open latest loses none of them.
  useEffect(() => {
    if (staged === undefined || committing.current || staged.baseRevision === open.revision) return;
    if (restage(staged.selection)) setStatus({ phase: "idle" });
    // Only a change of revision restages.
  }, [open.revision]);

  // Keep the staged rows and the fixes on this device as they change, so a refresh loses nothing.
  useEffect(() => {
    if (staged === undefined || table === undefined) return;
    void draft.save(importToDraft({ sheet: sheetName, table, columns, dateOrder: order }, staged.selection, draft.meta()));
    // The draft follows the staged import and nothing else.
  }, [staged]);

  if (importer === undefined || sheet === undefined) return <p role="alert">{t("reason_unknown")}</p>;

  const fail = (error: DomainError) => {
    const text = error.code === "empty_file" || error.code === "not_utf8" ? t("chooseCsvMessage") : errorMessage(t, error);
    setMessages([{ phase: "error", text }]);
  };

  /** Read the text into a table. Returns the table and its columns, or nothing when it must stop. */
  const prepare = (text: string, chosen: "" | Separator): { table: CsvTable; columns: MappingColumn[] } | undefined => {
    let use: Separator;
    if (chosen !== "") use = chosen;
    else {
      const guess = detectSeparator(text);
      if (guess.separator === "unclear") {
        setUnclear(guess.previews);
        setTable(undefined);
        setMessages([]);
        return undefined;
      }
      use = guess.separator;
    }
    const parsed = parseCsv(text, { separator: use });
    if (!parsed.ok) {
      fail(parsed.error);
      setTable(undefined);
      return undefined;
    }
    const mapping = suggestMapping(parsed.value.headings, fields);
    setUnclear(undefined);
    setTable(parsed.value);
    setColumns(mapping.columns);
    setParsedFrom(text);
    setMessages([]);
    return { table: parsed.value, columns: mapping.columns };
  };

  const chooseFile = async (file: File | undefined) => {
    if (file === undefined) return;
    setStaged(undefined);
    setSaved(undefined);
    setStatus({ phase: "idle" });
    setPasteText("");
    setSeparator("");
    setUnclear(undefined);
    setTable(undefined);
    const text = readCsvBytes(new Uint8Array(await file.arrayBuffer()));
    if (!text.ok) {
      setFileText("");
      fail(text.error);
      return;
    }
    setFileText(text.value);
    prepare(text.value, "");
  };

  const review = () => {
    setSaved(undefined);
    setStatus({ phase: "idle" });
    const text = pasteText.trim() !== "" ? pasteText : fileText;
    // A draft that was resumed has its table and no text. Its table is used as it is.
    const resumed = text.trim() === "" && table !== undefined;
    if (text.trim() === "" && !resumed) {
      setMessages([{ phase: "error", text: t("chooseCsvMessage") }]);
      return;
    }
    let use: { table: CsvTable; columns: MappingColumn[] } | undefined = table !== undefined && (resumed || parsedFrom === text) ? { table, columns } : undefined;
    if (use === undefined) use = prepare(text, separator);
    if (use === undefined) {
      setStaged(undefined);
      return;
    }
    const source: Source = { table: use.table, columns: use.columns, dateOrder, importer, sheet };
    const applied = applyMapping(use.table, { columns: use.columns }, sheet, allFields, dateOrder === undefined ? undefined : { dateOrder });
    if (!applied.ok) {
      const d = applied.error.detail;
      const text2 = applied.error.code === "missing_required_column" ? t("enterField", { field: String(d?.["field"] ?? "") }) : errorMessage(t, applied.error);
      setStaged(undefined);
      setMessages([{ phase: "error", text: text2 }]);
      return;
    }
    setMessages([]);
    opId.current = undefined;
    setStaged(stageImport(stageInput(source, applied.value)));
  };

  const commit = async () => {
    if (staged === undefined || busy) return;
    setBusy(true);
    committing.current = true;
    setStatus({ phase: "saving" });
    opId.current ??= newId();
    const result = await commitImport(db, staged, { opId: opId.current, now: shell.now, newId });
    setBusy(false);
    if (!result.ok) {
      committing.current = false;
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
    await open.reload();
    await draft.discard();
    committing.current = false;
    setStaged(undefined);
    setTable(undefined);
    setFileText("");
    setPasteText("");
    setParsedFrom("");
    setSaved({ count: result.written, unplaced: result.unplaced });
    setStatus({ phase: "saved" });
  };

  const cancel = () => {
    void draft.discard();
    setStaged(undefined);
    setTable(undefined);
    setFileText("");
    setPasteText("");
    setParsedFrom("");
    setUnclear(undefined);
    setSeparator("");
    setMessages([]);
    setStatus({ phase: "idle" });
  };

  /** What the keeper has now, as a draft: the table, the column choices and every fix. */
  const currentDraft = () => (staged === undefined || table === undefined ? undefined : importToDraft({ sheet: sheetName, table, columns, dateOrder: order }, staged.selection, draft.meta()));

  const keepDraft = () => {
    const now = currentDraft();
    if (now === undefined) return;
    void draft.save(now).then((ok) => setStatus(ok ? { phase: "working", text: t("draftKept") } : { phase: "error", code: "storage_abort", text: t("storageAbort") }));
  };

  const downloadRecovery = () => {
    const now = currentDraft();
    if (now !== undefined) draft.download(now);
  };

  /** Take back a draft from an earlier visit: its table, columns and fixes, checked against the register as it is now. */
  const resume = () => {
    const found = draft.pending === undefined ? undefined : importFromDraft(draft.pending);
    const wanted = found === undefined ? undefined : app.importers.find((i) => i.sheet === found.source.sheet);
    const wantedSheet = wanted === undefined ? undefined : app.adapter.sheets.find((s) => s.name === wanted.sheet);
    if (found === undefined || wanted === undefined || wantedSheet === undefined) {
      setMessages([{ phase: "error", text: t("reason_unknown") }]);
      void draft.discard();
      return;
    }
    const dateChoice: DateOrder | undefined = found.source.dateOrder === "" ? undefined : found.source.dateOrder;
    setSheetName(wanted.sheet);
    setTable(found.source.table);
    setColumns(found.source.columns);
    setOrder(found.source.dateOrder);
    setSeparator("");
    setUnclear(undefined);
    setFileText("");
    setPasteText("");
    setParsedFrom("");
    draft.forget();
    if (restage(found.selection, { table: found.source.table, columns: found.source.columns, dateOrder: dateChoice, importer: wanted, sheet: wantedSheet })) {
      setMessages([{ phase: "good", text: t("draftRestoredImport") }]);
    } else setMessages([{ phase: "error", text: t("reason_unknown") }]);
  };

  const downloadGuide = () => {
    const words = {
      heading: t("guideHeading"),
      needed: t("guideNeeded"),
      format: t("guideFormat"),
      yes: t("wordYes"),
      no: t("wordNo"),
      text: t("guideText", { max: "{max}" }),
      date: t("guideDate"),
      number: t("guideNumber"),
      money: t("guideMoney"),
      choice: t("guideChoice", { choices: "{choices}" }),
    };
    downloadText("column-guide.csv", columnGuide(sheet, allFields, words), "text/csv");
    setMessages([{ phase: "good", text: t("columnsGuideReady") }]);
  };

  const downloadLeftOut = () => {
    if (staged === undefined) return;
    downloadText("left-out-rows.csv", leftOutCsv(staged, [t("rowWord"), t("sourceRef"), t("leftOutReason")]), "text/csv");
  };

  const setColumn = (index: number, fieldKey: string) => {
    setStaged(undefined);
    setColumns((all) =>
      all.map((c) => {
        if (c.index !== index) return c;
        const { fieldKey: _old, ...rest } = c;
        return fieldKey === "" ? rest : { ...rest, fieldKey };
      }),
    );
  };

  const preview = (rows: string[][]) =>
    rows
      .slice(0, 3)
      .map((r) => r.join(" | "))
      .join("\n");

  return (
    <section className="stack">
      <h1>{t("importSpreadsheet")}</h1>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
        <ButtonLink href={`${base}/add`}>{t("backToAdd")}</ButtonLink>
      </div>

      {draft.pending === undefined || staged !== undefined || table !== undefined ? null : (
        <section className="stack card" aria-label={t("draftFound")}>
          <p>{t("draftFound")}</p>
          <div className="actions">
            <Button primary onClick={resume}>
              {t("resumeDraft")}
            </Button>
            <Button onClick={() => void draft.discard()}>{t("discardDraft")}</Button>
          </div>
        </section>
      )}
      {app.importers.length > 1 ? (
        <SelectField
          label={t("chooseSheet")}
          value={sheetName}
          onChange={(v) => {
            setSheetName(v);
            cancel();
          }}
          options={app.importers.map((i) => ({ value: i.sheet, label: i.sheet }))}
        />
      ) : null}

      <div className="actions">
        <Button onClick={downloadGuide}>{t("downloadColumnGuide")}</Button>
      </div>

      <section className="stack" aria-label={t("importFileHeading")}>
        <h2>{t("importFileHeading")}</h2>
        <div className="field">
          <label htmlFor="csv-file">{t("chooseCsv")}</label>
          <input
            id="csv-file"
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={(e) => {
              void chooseFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        <TextArea
          label={t("pasteSpreadsheet")}
          value={pasteText}
          onChange={(v) => {
            setPasteText(v);
            setStaged(undefined);
            setTable(undefined);
            setUnclear(undefined);
            if (v.trim() !== "") setFileText("");
          }}
          rows={6}
        />
      </section>

      {unclear !== undefined || separator !== "" ? (
        <section className="stack">
          <RadioGroup
            legend={t("separator")}
            name="separator"
            value={separator}
            onChange={(v) => {
              setSeparator(v === "semicolon" ? "semicolon" : "comma");
              setStaged(undefined);
            }}
            options={[
              { value: "comma", label: t("comma") },
              { value: "semicolon", label: t("semicolon") },
            ]}
          />
          {unclear === undefined ? null : (
            <div className="stack">
              <pre className="preview">{`${t("comma")}\n${preview(unclear.comma)}`}</pre>
              <pre className="preview">{`${t("semicolon")}\n${preview(unclear.semicolon)}`}</pre>
            </div>
          )}
        </section>
      ) : null}

      {table === undefined ? null : (
        <section className="stack" aria-label={t("matchColumns")}>
          <h2>{t("matchColumns")}</h2>
          <p>{t("mappingHeading")}</p>
          {columns.map((c) => (
            <fieldset key={c.index} className="card stack">
              <legend>{`${t("columnLine", { n: c.index + 1 })} · ${c.heading}`}</legend>
              <SelectField
                label={t("registerField")}
                value={c.fieldKey ?? ""}
                onChange={(v) => setColumn(c.index, v)}
                options={[{ value: "", label: t("ignoreColumn") }, ...fields.map((f) => ({ value: f.key, label: f.label }))]}
              />
            </fieldset>
          ))}
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
        </section>
      )}

      {messages.map((m) => (
        <Notice key={m.text} tone={m.phase}>
          {m.text}
        </Notice>
      ))}

      <div className="actions">
        <Button primary onClick={review}>
          {t("reviewImport")}
        </Button>
      </div>

      {saved === undefined ? null : <Notice tone="good">{t("savedCount", { count: saved.count, unplaced: saved.unplaced })}</Notice>}
      <Status
        status={status}
        actions={{ tryAgain: () => setStatus({ phase: "idle" }), openLatest: () => void open.reload(), keepEditing: () => setStatus({ phase: "idle" }), keepDraft, downloadRecovery }}
      />

      {staged === undefined ? null : (
        <ImportReview staged={staged} onChange={setStaged} onCommit={() => void commit()} onCancel={cancel} busy={busy} sheet={sheet} fields={allFields} mode="import" onDownloadLeftOut={downloadLeftOut} />
      )}

      {staged === undefined ? null : (
        <section className="stack" aria-label={t("recoveryHeading")}>
          <h2>{t("recoveryHeading")}</h2>
          <p>{t("recoveryHint")}</p>
          <div className="actions">
            <Button onClick={downloadRecovery}>{t("actionDownloadRecovery")}</Button>
          </div>
        </section>
      )}
    </section>
  );
}
