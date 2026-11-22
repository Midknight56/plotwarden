// Season fees. Each charge belongs to one tenancy in one season. The secretary records a payment already received
// elsewhere, in whole pence, and the balance follows: it is never negative and never more than the charge. A payment
// that is too large is refused and the input stays as it was. A payment is undone only by a reversal of its exact amount.
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { parseMoney } from "../../../template/src/money";
import { Button, ButtonLink, Notice, TextField } from "../../../template/src/ui/controls";
import { useShell } from "../../../template/src/ui/shellContext";
import { Status } from "../../../template/src/ui/Status";
import { paymentMessage } from "./copy";
import { chargeSummary } from "./fees";
import type { ChargeSummary } from "./fees";
import { useAllot, useIntent, useMoney } from "./intent";
import type { LedgerEntry } from "./types";

const STATUS_KEYS = { due: "feeDue", part_paid: "feePartPaid", paid: "feePaid", overdue: "feeOverdue", reversed: "feeReversed" } as const;

function ReverseReceiptForm({ receipt, code, onDone }: { receipt: LedgerEntry; code: string; onDone(message: string): void }) {
  const { t, newId } = useShell();
  const open = useAllot();
  const money = useMoney();
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const [shown, setShown] = useState(false);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(open.today);
  const reversalId = useRef(newId());
  const label = `${receipt.on} · ${money(receipt.minorUnits)}`;
  if (!shown) {
    return (
      <div className="actions">
        <Button onClick={() => setShown(true)}>{`${t("reversePayment")}: ${label}`}</Button>
      </div>
    );
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await intent.send([{ type: "reverse_entry", reversalId: reversalId.current, entryId: receipt.entryId, reason }], { done: t("paymentReversedDone"), on: date });
    if (outcome.ok) {
      onDone(`${t("paymentReversedDone")} ${t("saved")}`);
      reversalId.current = newId();
      setShown(false);
      setReason("");
    }
  };
  return (
    <form ref={form} className="stack" onSubmit={(e) => void submit(e)} noValidate aria-label={`${t("reversePayment")} ${code} ${label}`}>
      <TextField label={`${t("reverseReason")}: ${label}`} value={reason} onChange={setReason} error={intent.fieldErrors["reason"]} autoComplete="off" />
      <TextField label={`${t("paymentDate")}: ${label}`} type="date" value={date} onChange={setDate} error={intent.fieldErrors["reversalDate"]} />
      <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
      <div className="actions">
        <Button primary type="submit" disabled={intent.busy}>
          {t("reversePayment")}
        </Button>
        <Button onClick={() => setShown(false)}>{t("cancel")}</Button>
      </div>
    </form>
  );
}

function ChargeCard({ summary, target }: { summary: ChargeSummary; target: boolean }) {
  const { t, newId } = useShell();
  const open = useAllot();
  const money = useMoney();
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(open.today);
  const [ref, setRef] = useState("");
  const [local, setLocal] = useState<Record<string, string>>({});
  const [note, setNote] = useState<string | undefined>();
  const receiptId = useRef(newId());
  const errors = { ...intent.fieldErrors, ...local };
  const card = useRef<HTMLLIElement>(null);
  // A committee check names this charge. The shell puts focus on the page heading and scrolls to the top when a page
  // opens, so wait for that, then bring the charge into view. No animation, and focus stays where the shell put it.
  useEffect(() => {
    if (!target) return undefined;
    const wait = window.setTimeout(() => card.current?.scrollIntoView({ block: "start" }), 0);
    return () => window.clearTimeout(wait);
  }, [target]);

  const charge = summary.charge;
  const tenancy = open.state.tenancies[charge.tenancyId];
  const code = tenancy === undefined ? "" : (open.state.core.plots[tenancy.plotId]?.code ?? "");
  const holder = open.state.people[tenancy?.personId ?? ""]?.displayName ?? "";
  const season = open.state.seasons[charge.seasonId];
  const live = summary.status !== "reversed";
  const payable = live && summary.balance > 0;
  const currency = open.state.currency ?? "GBP";
  const ownedReceipts = summary.receipts;
  const anyLive = ownedReceipts.some((r) => !r.reversed);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocal({});
    setNote(undefined);
    const parsed = parseMoney(amount);
    if (!parsed.ok || parsed.value === undefined || parsed.value === 0) {
      setLocal({ amount: !parsed.ok || parsed.value === 0 ? t("enterAmount") : t("enterField", { field: t("amountReceived") }) });
      window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const pence = parsed.value;
    const message = paymentMessage(t, pence, Math.max(0, summary.balance - pence), currency);
    const outcome = await intent.send(
      [{ type: "record_receipt", receiptId: receiptId.current, chargeId: charge.entryId, amount: pence, ...(ref.trim() === "" ? {} : { ref: ref.trim() }) }],
      { done: message, on: date },
    );
    if (outcome.ok) {
      receiptId.current = newId();
      setAmount("");
      setRef("");
    }
  };

  const reverseCharge = async () => {
    await intent.send([{ type: "reverse_entry", reversalId: newId(), entryId: charge.entryId, reason: t("reverseCharge") }], { done: t("chargeReversedDone") });
  };

  return (
    <li ref={card} className="card" {...(target ? { "aria-current": "true" as const } : {})}>
      <h3>{t("chargeLine", { season: season?.name ?? "", plot: code, name: holder })}</h3>
      <p className={`badge ${summary.status === "overdue" ? "bad" : summary.status === "paid" ? "good" : ""}`}>{t(STATUS_KEYS[summary.status])}</p>
      {charge.waiver === undefined ? null : <p>{`${t("waiveFee")}: ${charge.waiver}`}</p>}
      <dl className="facts">
        <div>
          <dt>{t("amountCharged")}</dt>
          <dd>{money(summary.charged)}</dd>
        </div>
        <div>
          <dt>{t("amountReceived")}</dt>
          <dd>{money(summary.received - summary.reversed)}</dd>
        </div>
        <div>
          <dt>{t("stillDue")}</dt>
          <dd>{money(summary.balance)}</dd>
        </div>
      </dl>
      {summary.dueOn === undefined ? null : <p className="hint">{`${t("dueDate")}: ${summary.dueOn}`}</p>}

      {note === undefined ? null : <Notice tone="good">{note}</Notice>}
      {ownedReceipts.length === 0 ? null : (
        <section className="stack" aria-label={`${t("receiptsHeading")} ${code}`}>
          <h4>{t("receiptsHeading")}</h4>
          <ul className="plain stack">
            {ownedReceipts.map(({ entry, reversed }) => (
              <li key={entry.entryId} className="stack">
                <span>{entry.ref === undefined ? t("receiptLine", { date: entry.on, amount: money(entry.minorUnits) }) : t("receiptLineRef", { date: entry.on, amount: money(entry.minorUnits), ref: entry.ref })}</span>
                {reversed ? <span className="hint">{t("receiptReversedLine", { date: reversalDate(open.state.ledger, entry.entryId), reason: reversalReason(open.state.ledger, entry.entryId) })}</span> : <ReverseReceiptForm receipt={entry} code={code} onDone={setNote} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {payable ? (
        <form ref={form} className="stack" onSubmit={(e) => void submit(e)} noValidate aria-label={`${t("recordPayment")} ${code}`}>
          <TextField label={t("amountReceived")} inputMode="decimal" value={amount} onChange={setAmount} error={errors["amount"]} hint={t("hint_amount")} autoComplete="off" />
          <TextField label={t("paymentDate")} type="date" value={date} onChange={setDate} error={errors["paymentDate"]} />
          <TextField label={t("receiptReference")} value={ref} onChange={setRef} error={errors["receiptRef"]} autoComplete="off" />
          <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
          <div className="actions">
            <Button primary type="submit" disabled={intent.busy}>
              {t("recordPayment")}
            </Button>
          </div>
        </form>
      ) : (
        <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }) }} />
      )}
      {live && !anyLive && ownedReceipts.length === 0 ? (
        <div className="actions">
          <Button onClick={() => void reverseCharge()} disabled={intent.busy}>{`${t("reverseCharge")}: ${code}`}</Button>
        </div>
      ) : null}
    </li>
  );
}

const reversalOf = (ledger: Record<string, LedgerEntry>, entryId: string): LedgerEntry | undefined => Object.values(ledger).find((e) => e.type === "reversal" && e.reverses === entryId);
const reversalDate = (ledger: Record<string, LedgerEntry>, entryId: string): string => reversalOf(ledger, entryId)?.on ?? "";
const reversalReason = (ledger: Record<string, LedgerEntry>, entryId: string): string => reversalOf(ledger, entryId)?.reason ?? "";

/** `arg` is the charge a committee check names (`#/r/<site>/payments/<charge>`). Its season is shown even when it is a past one. */
export function PaymentsScreen({ arg }: { arg?: string }) {
  const { t } = useShell();
  const open = useAllot();
  const base = `#/r/${open.site.id}`;
  const today = open.today;
  const [showPrevious, setShowPrevious] = useState(false);
  const seasons = useMemo(() => Object.values(open.state.seasons).sort((a, b) => (a.start < b.start ? 1 : -1)), [open.state.seasons]);
  const current = seasons.find((s) => s.start <= today && today < s.endExclusive) ?? seasons[0];
  const named = arg === undefined ? undefined : open.state.ledger[arg];
  const namedCharge = named?.type === "charge" ? named.entryId : undefined;
  const namedSeason = named?.type === "charge" ? named.seasonId : undefined;
  const shown = showPrevious ? seasons : seasons.filter((s) => s === current || s.seasonId === namedSeason);
  const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

  return (
    <section className="stack">
      <h1>{t("seasonFees")}</h1>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
        <ButtonLink href={`${base}/season`} primary>
          {t("newSeason")}
        </ButtonLink>
        <ButtonLink href={`${base}/report`}>{t("seasonReport")}</ButtonLink>
      </div>
      {seasons.length === 0 ? <p>{t("noSeasons")}</p> : null}
      {shown.map((season) => {
        const charges = Object.values(open.state.ledger)
          .filter((e) => e.type === "charge" && e.seasonId === season.seasonId)
          .map((e) => chargeSummary(open.state, e.entryId, today) ?? chargeSummary(open.state, e.entryId, e.on))
          .filter((s): s is ChargeSummary => s !== undefined)
          .sort((a, b) => natural(open.state.core.plots[open.state.tenancies[a.charge.tenancyId]?.plotId ?? ""]?.code ?? "", open.state.core.plots[open.state.tenancies[b.charge.tenancyId]?.plotId ?? ""]?.code ?? ""));
        return (
          <section key={season.seasonId} className="stack" aria-labelledby={`season-${season.seasonId}`}>
            <h2 id={`season-${season.seasonId}`}>{`${season.name} · ${season.start} · ${season.endExclusive}`}</h2>
            {charges.length === 0 ? <p>{t("noChargesInSeason")}</p> : null}
            <ul className="cards plain">
              {charges.map((s) => (
                <ChargeCard key={s.charge.entryId} summary={s} target={s.charge.entryId === namedCharge} />
              ))}
            </ul>
          </section>
        );
      })}
      {seasons.length < 2 ? null : (
        <div className="actions">
          <Button onClick={() => setShowPrevious((v) => !v)} aria-expanded={showPrevious}>
            {showPrevious ? t("hidePreviousSeasons") : t("showPreviousSeasons")}
          </Button>
        </div>
      )}
    </section>
  );
}
