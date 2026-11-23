// The Exchange screen: send the committee a small list of checks, and read the slip that comes back.
// The keeper sees the exact fields before anything is written. A download commits the keys first and hands over
// the file only after the transaction completes. A slip is read, never applied: only "Record receipt" writes, and
// it writes receipts alone. A record is changed only through its own screen.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { reviewFileName } from "../exchange/packet";
import { isValidLocalDate } from "../calendar";
import { Button, ButtonLink, Notice, TextField, focusFirstInvalid } from "./controls";
import { downloadText } from "./download";
import { checksAt, fileHolds, planExchange, readSlipFor } from "./exchangeFlow";
import type { ExchangePlan, ReadResult, ReturnedRow } from "./exchangeFlow";
import { commitMessage, errorMessage } from "./messages";
import { useRegister, useShell } from "./shellContext";
import { Status } from "./Status";
import type { StatusState } from "./Status";

/** The word for each rule: the four actions of the Desk. */
const REASON_KEYS: Readonly<Record<string, string>> = {
  placement_missing: "actionCheckLocation",
  reading_unclear: "actionReadStone",
  offer_late: "actionCheckReply",
  fee_late: "actionCheckPayment",
};

const PROBLEM_KEYS: Readonly<Record<string, string>> = {
  required: "exProblemRequired",
  over_limit: "exProblemOverLimit",
  private_string: "exProblemPrivate",
  looks_like_amount: "exProblemAmount",
  looks_like_contact: "exProblemContact",
  invalid_date: "invalidDate",
};

const STATUS_KEYS: Readonly<Record<string, string>> = {
  ready: "readyToCheck",
  changed: "sourceHasChanged",
  closed: "issueAlreadyClosed",
  received: "alreadyReceived",
};

const REFUSAL_KEYS: Readonly<Record<string, string>> = {
  other_register: "slipOtherRegister",
  not_slip: "slipIsReview",
  wrong_file: "slipNotSlip",
  not_json: "slipNotSlip",
  unknown_format: "slipNotSlip",
  newer_version: "needsNewerVersion",
  invalid: "slipInvalid",
  too_big: "slipTooBig",
};

interface Done {
  name: string;
  text: string;
}

export function Exchange() {
  const { app, t, newId } = useShell();
  const open = useRegister();
  const adapter = app.adapter;
  const base = `#/r/${open.site.id}`;
  const form = useRef<HTMLFormElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const returnedHeading = useRef<HTMLHeadingElement>(null);
  const busy = useRef(false);

  const [asOf, setAsOf] = useState(open.today);
  const [alias, setAlias] = useState(open.state.review.alias ?? "Site 1");
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<ExchangePlan | undefined>();
  const [showNames, setShowNames] = useState(false);
  const [done, setDone] = useState<Done | undefined>();
  const [note, setNote] = useState<string | undefined>();
  const [status, setStatus] = useState<StatusState>({ phase: "idle" });
  const [slip, setSlip] = useState<{ bytes: Uint8Array; opId: string } | undefined>();
  const [receiptStatus, setReceiptStatus] = useState<StatusState>({ phase: "idle" });

  const empty = open.revision < 1;
  const checks = useMemo(() => checksAt(adapter, open.state, asOf), [adapter, open.state, asOf]);
  const labelOf = (subjectId: string, fallback: string): string => typed[subjectId] ?? fallback;

  const reading: ReadResult | undefined = useMemo(
    () => (slip === undefined ? undefined : readSlipFor({ bytes: slip.bytes, site: open.site, state: open.state, adapter, today: open.today })),
    [slip, open.site, open.state, open.today, adapter],
  );

  useEffect(() => {
    if (plan !== undefined) previewHeading.current?.focus();
  }, [plan]);

  useEffect(() => {
    if (slip !== undefined && reading?.ok === true) returnedHeading.current?.focus();
    // Focus moves once, when a slip is opened. Reading it again after a receipt does not move focus.
  }, [slip]);

  /** Any change to an input takes the preview and the result away until a preview is made again. */
  const touched = (): void => {
    setPlan(undefined);
    setShowNames(false);
    setDone(undefined);
    setNote(undefined);
    setErrors({});
    setStatus({ phase: "idle" });
  };

  const problemText = (code: string): string => t(PROBLEM_KEYS[code] ?? "reason_unknown");

  const preview = (event: FormEvent): void => {
    event.preventDefault();
    setDone(undefined);
    setNote(undefined);
    setStatus({ phase: "idle" });
    const labels: Record<string, string> = {};
    for (const check of checks) labels[check.subjectId] = labelOf(check.subjectId, check.label);
    const result = planExchange({ site: open.site, state: open.state, revision: open.revision, adapter, asOf, alias, labels, mint: newId });
    if (result.ok) {
      setErrors({});
      setShowNames(false);
      setPlan(result.plan);
      return;
    }
    setPlan(undefined);
    if (result.code === "invalid") {
      setErrors(Object.fromEntries(result.fields.map((f) => [f.field, problemText(f.code)])));
      window.setTimeout(() => focusFirstInvalid(form.current), 0);
    } else {
      setNote(result.code === "empty_register" ? t("emptyRegisterReview") : t("reason_unknown"));
    }
  };

  /** The register moved on since the preview, so the preview is taken away and made again from the latest revision. */
  const outOfDate = async (): Promise<void> => {
    busy.current = false;
    setPlan(undefined);
    setNote(t("reviewDetailsAgain"));
    setStatus({ phase: "idle" });
    await open.reload();
  };

  const download = async (): Promise<void> => {
    if (plan === undefined || busy.current) return;
    busy.current = true;
    if (open.stale || plan.basedOn !== open.revision) {
      await outOfDate();
      return;
    }
    let committed = false;
    if (plan.command !== undefined) {
      setStatus({ phase: "saving" });
      const outcome = await open.run([plan.command], { opId: plan.opId });
      if (!outcome.ok) {
        if (outcome.code === "stale_revision") {
          await outOfDate();
          return;
        }
        busy.current = false;
        const text = outcome.commit !== undefined ? commitMessage(t, outcome.commit) : outcome.error !== undefined ? errorMessage(t, outcome.error) : t("reason_unknown");
        setStatus({ phase: "error", code: outcome.code, text });
        return;
      }
      committed = !outcome.replayed;
    }
    // The transaction has completed, so the file may go out and "Saved on this device." may be said.
    const name = reviewFileName(plan.asOf);
    downloadText(name, plan.text, "application/json");
    setDone({ name, text: plan.text });
    setStatus({ phase: "saved", text: committed ? `${t("yourCopyReady")} ${t("saved")}` : t("yourCopyReady") });
    busy.current = false;
  };

  const downloadAgain = (): void => {
    if (done !== undefined) downloadText(done.name, done.text, "application/json");
  };

  const chooseSlip = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    setReceiptStatus({ phase: "idle" });
    setSlip({ bytes, opId: newId() });
  };

  const record = async (): Promise<void> => {
    if (slip === undefined || reading?.ok !== true || reading.receipt === undefined || busy.current) return;
    busy.current = true;
    const count = reading.receipt.decisions.length;
    setReceiptStatus({ phase: "saving" });
    const outcome = await open.run([reading.receipt], { opId: slip.opId });
    busy.current = false;
    if (!outcome.ok) {
      const text = outcome.commit !== undefined ? commitMessage(t, outcome.commit) : outcome.error !== undefined ? errorMessage(t, outcome.error) : t("reason_unknown");
      setReceiptStatus({ phase: "error", code: outcome.code, text });
      return;
    }
    setReceiptStatus({ phase: "saved", text: t("receiptsRecorded", { count }) });
  };

  const receiptReady = reading?.ok === true && reading.receipt !== undefined;
  const primary: "receipt" | "download" | "preview" | "none" = receiptReady ? "receipt" : plan !== undefined && done === undefined ? "download" : done !== undefined ? "none" : "preview";

  const reasonOf = (rule: string | undefined): string => (rule === undefined ? "" : t(REASON_KEYS[rule] ?? "reason_unknown"));

  const returnedLine = (row: ReturnedRow): string => {
    const label = row.label ?? t("unknownItem");
    return row.rule === undefined ? label : `${label} · ${reasonOf(row.rule)}`;
  };

  // What the last action said, and the buttons that go with it. It stands at the foot of what you type.
  const notices = (
    <>
      {note === undefined ? null : <Notice tone="error">{note}</Notice>}
      <Status status={status} actions={{ openLatest: () => void open.reload(), keepDraft: () => setStatus({ phase: "idle" }), tryAgain: () => setStatus({ phase: "idle" }) }} />
    </>
  );

  return (
    <section className="stack page">
      <div className="page-head on-ground">
        <h1>{t("committeeReview")}</h1>
        <ButtonLink href={base} quiet>
          {t("backToRegister")}
        </ButtonLink>
      </div>
      <p className="ground-note">{t("committeeReviewHint")}</p>

      <div className="review-layout">
        {empty ? (
          <>
            <Notice>{t("emptyRegisterReview")}</Notice>
            {notices}
          </>
        ) : (
          <form ref={form} className="stack card review-input" onSubmit={preview} noValidate>
            <div className="field-grid">
              <TextField
                label={t("chooseReviewDate")}
                type="date"
                value={asOf}
                error={errors["asOf"]}
                onChange={(v) => {
                  touched();
                  setAsOf(v);
                }}
              />
              <TextField
                label={t("siteNameForCommittee")}
                value={alias}
                error={errors["alias"]}
                autoComplete="off"
                onChange={(v) => {
                  touched();
                  setAlias(v);
                }}
              />
            </div>
            {checks.length === 0 ? (
              isValidLocalDate(asOf) ? <p>{t("noOpenChecks")}</p> : null
            ) : (
              <fieldset className="choice">
                <legend>{t("reviewPlotLabels")}</legend>
                <p className="hint">{t("labelsHint")}</p>
                {checks.map((check, i) => (
                  <TextField
                    key={check.subjectId}
                    label={t("labelForItem", { n: i + 1 })}
                    value={labelOf(check.subjectId, check.label)}
                    error={errors[`label:${check.subjectId}`]}
                    autoComplete="off"
                    onChange={(v) => {
                      touched();
                      setTyped((now) => ({ ...now, [check.subjectId]: v }));
                    }}
                  />
                ))}
              </fieldset>
            )}
            <div className="actions">
              <Button type="submit" primary={primary === "preview"}>
                {t("previewReviewFile")}
              </Button>
            </div>
            {notices}
          </form>
        )}

        {plan === undefined ? null : (
          <section className="card stack review-preview" aria-labelledby="preview-heading">
            <h2 id="preview-heading" ref={previewHeading} tabIndex={-1}>
              {t("reviewFilePreview")}
            </h2>
            <p>{plan.preview.count === 1 ? t("oneCheckInFile") : t("checksInFile", { count: plan.preview.count })}</p>
            <p>{t("fileSize", { bytes: plan.preview.bytes })}</p>
            <h3>{t("fileHoldsHeading")}</h3>
            <ul className="plain stack">
              {fileHolds(plan.preview).map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
            <div className="actions">
              <Button aria-expanded={showNames} onClick={() => setShowNames((now) => !now)}>
                {showNames ? t("hideFieldNames") : t("showFieldNames")}
              </Button>
            </div>
            {showNames ? (
              <div className="stack">
                <h3>{t("fieldsInFile")}</h3>
                <ul className="plain stack">
                  <li>{t("wholeFileFields", { fields: plan.preview.siteFields.join(", ") })}</li>
                  <li>{t("eachCheckFields", { fields: plan.preview.issueFields.join(", ") })}</li>
                </ul>
              </div>
            ) : null}
            <ul className="cards plain">
              {plan.preview.rows.map((row, i) => (
                <li key={`${row.label}-${i}`} className="card">
                  {t("checkRowLine", { label: row.label, reason: reasonOf(row.rule), version: row.factVersion })}
                </li>
              ))}
            </ul>
            <div className="actions">
              {done === undefined ? (
                <Button primary={primary === "download"} onClick={() => void download()} disabled={status.phase === "saving"}>
                  {t("downloadReviewFile")}
                </Button>
              ) : (
                <Button onClick={downloadAgain}>{t("downloadAgain")}</Button>
              )}
            </div>
          </section>
        )}

        <div className="stack card review-slip">
          <div className="field">
            <label htmlFor="slip-file">{t("openReturnSlip")}</label>
            <input id="slip-file" type="file" accept=".json,application/json" onChange={(e) => void chooseSlip(e)} />
            <p className="hint">{t("openReturnSlipHint")}</p>
          </div>
          {reading === undefined || reading.ok ? null : (
            <div className="notice error" role="alert">
              <p>{t(REFUSAL_KEYS[reading.code] ?? "reason_unknown")}</p>
              <p>{t("chooseAnotherFile")}</p>
            </div>
          )}
        </div>
      </div>

      {reading === undefined || !reading.ok ? null : (
        <section className="card stack" aria-labelledby="returned-heading">
          <h2 id="returned-heading" ref={returnedHeading} tabIndex={-1}>
            {t("reviewReturnedChecks")}
          </h2>
          <p>{t("slipAsAt", { date: reading.slip.packetAsOf, revision: reading.slip.packetRevision })}</p>
          <ul className="cards plain">
            {reading.rows.map((row) => (
              <li key={row.actionId} className="card stack">
                <p>
                  <strong>{returnedLine(row)}</strong>
                </p>
                <p className={`badge ${row.status === "changed" ? "bad" : row.status === "received" ? "good" : ""}`}>{t(STATUS_KEYS[row.status] ?? "reason_unknown")}</p>
                <p>{t("returnedRowLine", { decision: t(row.disposition === "checked" ? "decisionChecked" : "decisionNeedsKeeper"), date: row.reviewedOn })}</p>
                {row.link === undefined ? null : (
                  <div className="actions">
                    <ButtonLink href={`${base}/${row.link}`}>{t("openMatchingRecord")}</ButtonLink>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {reading.receipt === undefined ? (
            <p>{t("nothingToReceive")}</p>
          ) : (
            <div className="stack">
              <p>{t("receiptNote")}</p>
              <div className="actions">
                <Button primary={primary === "receipt"} onClick={() => void record()} disabled={receiptStatus.phase === "saving"}>
                  {t("recordReceipt")}
                </Button>
              </div>
            </div>
          )}
          <Status status={receiptStatus} actions={{ openLatest: () => void open.reload(), keepDraft: () => setReceiptStatus({ phase: "idle" }), tryAgain: () => setReceiptStatus({ phase: "idle" }) }} />
        </section>
      )}
    </section>
  );
}
