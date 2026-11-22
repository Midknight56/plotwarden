// Import a spreadsheet saved as CSV: read it, match its columns, review every row, then write once.
// Nothing is written until Import. A file with an error writes nothing.
import { useMemo, useRef, useState } from "react";
import type { FieldDef, SheetDef } from "../adapter";
import type { DateOrder } from "../calendar";
import { detectSeparator, parseCsv, readCsvBytes } from "../data/csv";
import type { CsvTable, Separator } from "../data/csv";
import { columnGuide } from "../data/csvExport";
import { commitImport, leftOutCsv, stageImport } from "../data/importBatch";
import { applyMapping, fieldsForSheet, suggestMapping } from "../data/mapping";
import type { MappingColumn } from "../data/mapping";
import type { DomainError } from "../types";
import { Button, ButtonLink, Notice, RadioGroup, SelectField, TextArea } from "./controls";
import { downloadText } from "./download";
import { ImportReview } from "./ImportReview";
import type { Staged } from "./ImportReview";
import { commitMessage, errorMessage } from "./messages";
import { useRegister, useShell } from "./shellContext";
import { Status } from "./Status";
import type { StatusState } from "./Status";

export function ImportWizard() {
  const shell = useShell();
  const { app, db, register, t, newId } = shell;
  const open = useRegister();
  const base = `#/r/${open.site.id}`;
  const allFields = app.adapter.fields;

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
  const dateOrder: DateOrder | undefined = order === "" ? undefined : order;

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
    if (text.trim() === "") {
      setMessages([{ phase: "error", text: t("chooseCsvMessage") }]);
      return;
    }
    let use: { table: CsvTable; columns: MappingColumn[] } | undefined = table !== undefined && parsedFrom === text ? { table, columns } : undefined;
    if (use === undefined) use = prepare(text, separator);
    if (use === undefined) {
      setStaged(undefined);
      return;
    }
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
    setStaged(
      stageImport({
        register,
        importer,
        rows: applied.value,
        columns: use.columns,
        sheet,
        fields: allFields,
        state: open.state,
        siteId: open.site.id,
        baseRevision: open.revision,
        effectiveOn: open.today,
        options: { newId, ...(dateOrder === undefined ? {} : { dateOrder }) },
      }),
    );
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
    await open.reload();
    setStaged(undefined);
    setTable(undefined);
    setFileText("");
    setPasteText("");
    setParsedFrom("");
    setSaved({ count: result.written, unplaced: result.unplaced });
    setStatus({ phase: "saved" });
  };

  const cancel = () => {
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
      <Status status={status} actions={{ tryAgain: () => setStatus({ phase: "idle" }), openLatest: () => void open.reload(), keepEditing: () => setStatus({ phase: "idle" }) }} />

      {staged === undefined ? null : (
        <ImportReview staged={staged} onChange={setStaged} onCommit={() => void commit()} onCancel={cancel} busy={busy} sheet={sheet} fields={allFields} mode="import" onDownloadLeftOut={downloadLeftOut} />
      )}
    </section>
  );
}
