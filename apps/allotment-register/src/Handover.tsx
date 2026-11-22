// A handover. On the day, the outgoing tenancy ends at the start of the day and the incoming one begins on it.
// The old holder, the new holder, both dates and the old balance are shown before the keeper confirms.
// The old balance stays with the old holder. It never moves to the new one.
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button, ButtonLink, Notice, TextField } from "../../../template/src/ui/controls";
import { useShell } from "../../../template/src/ui/shellContext";
import { Status } from "../../../template/src/ui/Status";
import { tenancyBalance } from "./fees";
import { useAllot, useIntent, useMoney } from "./intent";

export function HandoverScreen({ arg }: { arg?: string }) {
  const { t, newId } = useShell();
  const open = useAllot();
  const money = useMoney();
  const base = `#/r/${open.site.id}`;
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const tenancy = arg === undefined ? undefined : open.state.tenancies[arg];
  const [date, setDate] = useState(open.today);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [review, setReview] = useState(false);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | undefined>();
  const ids = useRef({ tenancy: newId(), claim: newId(), person: newId() });
  const errors = { ...intent.fieldErrors, ...local };

  if (tenancy === undefined) {
    return (
      <section className="stack">
        <h1>{t("handOverPlot")}</h1>
        <p>{t("err_no_such_tenancy")}</p>
        <div className="actions">
          <ButtonLink href={`${base}/tenancy`}>{t("currentTenancies")}</ButtonLink>
        </div>
      </section>
    );
  }
  const code = open.state.core.plots[tenancy.plotId]?.code ?? "";
  const old = open.state.people[tenancy.personId]?.displayName ?? "";
  const balance = tenancyBalance(open.state, tenancy.tenancyId, date);
  const ended = tenancy.endExclusive !== undefined && tenancy.endExclusive <= date;

  const goReview = (event: FormEvent) => {
    event.preventDefault();
    setLocal({});
    setDone(undefined);
    if (name.trim() === "") {
      setLocal({ holder: t("enterField", { field: t("newHolder") }) });
      window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setReview(true);
  };

  const confirm = async () => {
    const outcome = await intent.send(
      [{ type: "hand_over", tenancyId: tenancy.tenancyId, newTenancyId: ids.current.tenancy, claimId: ids.current.claim, personId: ids.current.person, holderName: name, ...(contact.trim() === "" ? {} : { contact }) }],
      { done: t("handoverDone", { plot: code, name: name.trim(), old }), on: date },
    );
    if (outcome.ok) {
      setDone(`${t("handoverDone", { plot: code, name: name.trim(), old })} ${t("saved")}`);
      setReview(false);
      intent.setStatus({ phase: "idle" });
    } else setReview(false);
  };

  return (
    <section className="stack">
      <h1>{t("handOverPlot")}</h1>
      <div className="actions">
        <ButtonLink href={`${base}/tenancy`}>{t("currentTenancies")}</ButtonLink>
      </div>
      {done === undefined ? null : <Notice tone="good">{done}</Notice>}
      {done !== undefined ? null : (
        <form ref={form} className="stack card" onSubmit={goReview} noValidate aria-labelledby="handover-heading">
          <h2 id="handover-heading">{`${code} · ${t("previousHolder")}`}</h2>
          <dl className="facts">
            <div>
              <dt>{t("previousHolder")}</dt>
              <dd>{old}</dd>
            </div>
            <div>
              <dt>{t("tenancyBegins")}</dt>
              <dd>{tenancy.start}</dd>
            </div>
            <div>
              <dt>{t("outstandingBalance")}</dt>
              <dd>{money(balance)}</dd>
            </div>
          </dl>
          <TextField label={t("handoverDate")} type="date" value={date} onChange={(v) => { setDate(v); setReview(false); }} error={errors["end"]} />
          <TextField label={t("newHolder")} value={name} onChange={(v) => { setName(v); setReview(false); }} error={errors["holder"]} autoComplete="off" />
          <TextField label={t("contactDetails")} value={contact} onChange={setContact} error={errors["contact"]} autoComplete="off" />
          {ended ? <p className="notice error" role="alert">{t("err_tenancy_ended")}</p> : null}
          {review ? (
            <div className="stack review" role="region" aria-label={t("reviewHandover")}>
              <p className="lead">{t("handoverReview", { plot: code, old, name: name.trim(), date, balance: money(balance) })}</p>
              <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
              <div className="actions">
                <Button primary onClick={() => void confirm()} disabled={intent.busy}>
                  {t("confirmHandover")}
                </Button>
                <Button onClick={() => setReview(false)}>{t("cancel")}</Button>
              </div>
            </div>
          ) : (
            <>
              <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
              <div className="actions">
                <Button primary type="submit" disabled={ended}>
                  {t("reviewHandover")}
                </Button>
              </div>
            </>
          )}
        </form>
      )}
    </section>
  );
}
