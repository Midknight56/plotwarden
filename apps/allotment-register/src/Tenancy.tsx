// Current tenancies. Each plot has one holder at a time. A tenancy ends at the start of its end date, so the
// plot is Free from that day, or it is handed over on that day. Past tenancies stay in view with their balances.
// A tenancy from a paper source is recorded here with its source ref.
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button, ButtonLink, SelectField, TextField } from "../../../template/src/ui/controls";
import { useShell } from "../../../template/src/ui/shellContext";
import { Status } from "../../../template/src/ui/Status";
import { tenancyBalance } from "./fees";
import { useAllot, useIntent, useMoney } from "./intent";
import { freePlotsAt } from "./projection";
import type { Tenancy } from "./types";

function EndForm({ tenancy, name, code }: { tenancy: Tenancy; name: string; code: string }) {
  const { t } = useShell();
  const open = useAllot();
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const [date, setDate] = useState(open.today);
  const [reason, setReason] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await intent.send([{ type: "end_tenancy", tenancyId: tenancy.tenancyId, ...(reason.trim() === "" ? {} : { reason }) }], { done: t("tenancyEnded", { plot: code, date }), on: date });
  };
  return (
    <form ref={form} className="stack" onSubmit={(e) => void submit(e)} noValidate aria-label={`${t("endTenancy")} ${code}`}>
      <TextField label={`${t("tenancyEnds")}: ${code} · ${name}`} type="date" value={date} onChange={setDate} error={intent.fieldErrors["end"]} />
      <TextField label={`${t("reasonLabel")}: ${code}`} value={reason} onChange={setReason} error={intent.fieldErrors["reason"]} autoComplete="off" />
      <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
      <div className="actions">
        <Button type="submit" disabled={intent.busy}>
          {t("endTenancy")}
        </Button>
      </div>
    </form>
  );
}

export function TenancyScreen() {
  const { t, newId } = useShell();
  const open = useAllot();
  const money = useMoney();
  const base = `#/r/${open.site.id}`;
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const today = open.today;
  const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

  const all = Object.values(open.state.tenancies);
  const current = all.filter((x) => x.endExclusive === undefined || x.endExclusive > today).sort((a, b) => natural(open.state.core.plots[a.plotId]?.code ?? "", open.state.core.plots[b.plotId]?.code ?? ""));
  const past = all.filter((x) => x.endExclusive !== undefined && x.endExclusive <= today).sort((a, b) => (a.endExclusive ?? "") < (b.endExclusive ?? "") ? 1 : -1);
  const nameOf = (x: Tenancy) => open.state.people[x.personId]?.displayName ?? "";
  const codeOf = (x: Tenancy) => open.state.core.plots[x.plotId]?.code ?? "";
  const plots = Object.values(open.state.core.plots).sort((a, b) => natural(a.code, b.code));
  const freeNow = useMemo(() => new Set(freePlotsAt(open.state, today).map((p) => p.plotId)), [open.state, today]);

  const [plotId, setPlotId] = useState("");
  const [holder, setHolder] = useState("");
  const [contact, setContact] = useState("");
  const [begins, setBegins] = useState("");
  const [ends, setEnds] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [local, setLocal] = useState<Record<string, string>>({});
  const ids = useRef({ tenancy: newId(), claim: newId(), person: newId() });
  const errors = { ...intent.fieldErrors, ...local };
  const [showPast, setShowPast] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocal({});
    const spaceId = open.state.core.plots[plotId]?.spaces[0]?.spaceId;
    if (spaceId === undefined) {
      setLocal({ plot: t("enterField", { field: t("plotLabel") }) });
      window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const outcome = await intent.send(
      [
        {
          type: "record_tenancy",
          tenancyId: ids.current.tenancy,
          claimId: ids.current.claim,
          personId: ids.current.person,
          holderName: holder,
          ...(contact.trim() === "" ? {} : { contact }),
          spaceId,
          start: begins,
          ...(ends === "" ? {} : { endExclusive: ends }),
          ...(sourceRef.trim() === "" ? {} : { sourceRef: sourceRef.trim() }),
        },
      ],
      { done: t("tenancyRecorded"), fields: { tenancy_overlap: "plot", plot_not_free: "plot" } },
    );
    if (outcome.ok) {
      ids.current = { tenancy: newId(), claim: newId(), person: newId() };
      setHolder("");
      setContact("");
      setBegins("");
      setEnds("");
      setSourceRef("");
    }
  };

  return (
    <section className="stack">
      <h1>{t("currentTenancies")}</h1>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
        <ButtonLink href={`${base}/payments`}>{t("seasonFees")}</ButtonLink>
      </div>
      {current.length === 0 ? <p>{t("noTenancies")}</p> : null}
      <ul className="cards plain">
        {current.map((x) => (
          <li key={x.tenancyId} className="card">
            <h2>{t("tenancyOf", { plot: codeOf(x), name: nameOf(x) })}</h2>
            <p>{x.endExclusive === undefined ? t("tenancySpan", { start: x.start }) : t("tenancySpanTo", { start: x.start, end: x.endExclusive })}</p>
            {x.sourceRef === undefined ? null : <p>{t("sourceOf", { ref: x.sourceRef })}</p>}
            <p>{`${t("outstandingBalance")}: ${money(tenancyBalance(open.state, x.tenancyId, today))}`}</p>
            <div className="actions">
              <ButtonLink href={`${base}/handover/${x.tenancyId}`}>{`${t("handOverPlot")}: ${codeOf(x)}`}</ButtonLink>
            </div>
            <EndForm tenancy={x} name={nameOf(x)} code={codeOf(x)} />
          </li>
        ))}
      </ul>

      {past.length === 0 ? null : (
        <section className="stack" aria-labelledby="past-heading">
          <h2 id="past-heading">{t("moreTenancies")}</h2>
          <div className="actions">
            <Button onClick={() => setShowPast((v) => !v)} aria-expanded={showPast}>
              {showPast ? t("hidePreviousSeasons") : t("showPreviousSeasons")}
            </Button>
          </div>
          {showPast ? (
            <ul className="cards plain">
              {past.map((x) => (
                <li key={x.tenancyId} className="card">
                  <p>
                    <strong>{t("tenancyOf", { plot: codeOf(x), name: nameOf(x) })}</strong>
                  </p>
                  <p>{t("tenancySpanTo", { start: x.start, end: x.endExclusive ?? "" })}</p>
                  <p>{`${t("outstandingBalance")}: ${money(tenancyBalance(open.state, x.tenancyId, today))}`}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

      <form ref={form} className="stack card" onSubmit={(e) => void submit(e)} noValidate aria-labelledby="record-heading">
        <h2 id="record-heading">{t("recordTenancy")}</h2>
        <SelectField
          label={t("choosePlot")}
          value={plotId}
          onChange={setPlotId}
          error={errors["plot"] ?? errors["space"]}
          options={[{ value: "", label: "" }, ...plots.map((p) => ({ value: p.plotId, label: `${p.code}${freeNow.has(p.plotId) ? "" : ` · ${t("notFreeNow")}`}` }))]}
        />
        <TextField label={t("plotHolder")} value={holder} onChange={setHolder} error={errors["holder"]} autoComplete="off" />
        <TextField label={t("contactDetails")} value={contact} onChange={setContact} error={errors["contact"]} autoComplete="off" />
        <TextField label={t("tenancyBegins")} type="date" value={begins} onChange={setBegins} error={errors["start"]} />
        <TextField label={t("tenancyEnds")} type="date" value={ends} onChange={setEnds} error={errors["end"]} />
        <TextField label={t("sourceRefLabel")} value={sourceRef} onChange={setSourceRef} error={errors["sourceRef"]} autoComplete="off" />
        <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
        <div className="actions">
          <Button primary type="submit" disabled={intent.busy}>
            {t("recordTenancy")}
          </Button>
        </div>
      </form>
    </section>
  );
}
