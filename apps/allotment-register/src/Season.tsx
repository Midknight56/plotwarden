// Season setup. A season has a name, a span, an optional due date and a standard fee for future charges.
// Charges are applied to the tenancies the secretary selects: one charge per tenancy and season, so a repeat is
// harmless. A fee of nothing is only ever a waiver with a reason. No tax, no proration, no money is sent.
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { intervalsOverlap } from "../../../template/src/calendar";
import { parseMoney } from "../../../template/src/money";
import { Button, ButtonLink, CheckField, Notice, SelectField, TextField } from "../../../template/src/ui/controls";
import { useShell } from "../../../template/src/ui/shellContext";
import { Status } from "../../../template/src/ui/Status";
import { liveChargeOf } from "./fees";
import { useAllot, useIntent, useMoney } from "./intent";
import type { Tenancy } from "./types";

function NewSeasonForm({ onSaved }: { onSaved(id: string): void }) {
  const { t, newId } = useShell();
  const open = useAllot();
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [due, setDue] = useState("");
  const [fee, setFee] = useState("");
  const [local, setLocal] = useState<Record<string, string>>({});
  const seasonId = useRef(newId());
  const errors = { ...intent.fieldErrors, ...local };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocal({});
    const parsed = parseMoney(fee);
    if (!parsed.ok || parsed.value === undefined) {
      setLocal({ standardFee: parsed.ok ? t("enterField", { field: t("standardFee") }) : t("enterAmount") });
      window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const outcome = await intent.send(
      [{ type: "new_season", seasonId: seasonId.current, name, start, endExclusive: end, ...(due === "" ? {} : { dueOn: due }), standardFee: parsed.value }],
      { done: t("seasonSaved") },
    );
    if (outcome.ok) {
      onSaved(seasonId.current);
      seasonId.current = newId();
      setName("");
      setStart("");
      setEnd("");
      setDue("");
      setFee("");
    }
  };

  return (
    <form ref={form} className="stack card" onSubmit={(e) => void submit(e)} noValidate aria-labelledby="new-season-heading">
      <h2 id="new-season-heading">{t("newSeason")}</h2>
      <TextField label={t("seasonName")} value={name} onChange={setName} error={errors["seasonName"]} autoComplete="off" />
      <TextField label={t("startDate")} type="date" value={start} onChange={setStart} error={errors["start"]} />
      <TextField label={t("endDate")} type="date" value={end} onChange={setEnd} error={errors["end"]} />
      <TextField label={t("dueDate")} type="date" value={due} onChange={setDue} error={errors["due"]} />
      <TextField label={t("standardFee")} inputMode="decimal" value={fee} onChange={setFee} error={errors["standardFee"]} hint={t("hint_amount")} autoComplete="off" />
      <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
      <div className="actions">
        <Button primary type="submit" disabled={intent.busy}>
          {t("newSeason")}
        </Button>
      </div>
    </form>
  );
}

interface Pick {
  selected: boolean;
  waive: boolean;
  reason: string;
}

function ChargeForm({ seasonId }: { seasonId: string }) {
  const { t, newId } = useShell();
  const open = useAllot();
  const money = useMoney();
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const season = open.state.seasons[seasonId];
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [preview, setPreview] = useState(false);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | undefined>();
  const chargeIds = useRef(new Map<string, string>());
  const errors = { ...intent.fieldErrors, ...local };

  const tenancies = useMemo(() => {
    if (season === undefined) return [];
    const natural = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });
    return Object.values(open.state.tenancies)
      .filter((x) => intervalsOverlap(x.endExclusive === undefined ? { start: x.start } : { start: x.start, endExclusive: x.endExclusive }, { start: season.start, endExclusive: season.endExclusive }))
      .sort((a, b) => natural(open.state.core.plots[a.plotId]?.code ?? "", open.state.core.plots[b.plotId]?.code ?? ""));
  }, [open.state.tenancies, open.state.core.plots, season]);

  if (season === undefined) return null;
  const codeOf = (x: Tenancy) => open.state.core.plots[x.plotId]?.code ?? "";
  const nameOf = (x: Tenancy) => open.state.people[x.personId]?.displayName ?? "";
  const charged = (x: Tenancy) => liveChargeOf(open.state, x.tenancyId, seasonId) !== undefined;
  const pick = (x: Tenancy): Pick => picks[x.tenancyId] ?? { selected: false, waive: false, reason: "" };
  const chosen = tenancies.filter((x) => pick(x).selected && !charged(x));
  const setPick = (x: Tenancy, patch: Partial<Pick>) => {
    setPreview(false);
    setPicks((p) => ({ ...p, [x.tenancyId]: { ...pick(x), ...patch } }));
  };
  const chargeIdOf = (x: Tenancy): string => {
    let id = chargeIds.current.get(x.tenancyId);
    if (id === undefined) {
      id = newId();
      chargeIds.current.set(x.tenancyId, id);
    }
    return id;
  };

  const goPreview = (event: FormEvent) => {
    event.preventDefault();
    setLocal({});
    setDone(undefined);
    const missing = chosen.filter((x) => pick(x).waive && pick(x).reason.trim() === "");
    if (missing.length > 0) {
      setLocal(Object.fromEntries(missing.map((x) => [`reason:${x.tenancyId}`, t("enterField", { field: t("reasonLabel") })])));
      window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setPreview(true);
  };

  const apply = async () => {
    const outcome = await intent.send(
      [
        {
          type: "apply_charges",
          seasonId,
          items: chosen.map((x) => ({ chargeId: chargeIdOf(x), tenancyId: x.tenancyId, ...(pick(x).waive ? { waiveReason: pick(x).reason } : {}) })),
        },
      ],
      { done: t("chargesApplied", { count: chosen.length }) },
    );
    if (outcome.ok) {
      setDone(`${t("chargesApplied", { count: chosen.length })} ${t("saved")}`);
      setPicks({});
      setPreview(false);
      intent.setStatus({ phase: "idle" });
    } else setPreview(false);
  };

  return (
    <form ref={form} className="stack card" onSubmit={goPreview} noValidate aria-labelledby="charge-heading">
      <h2 id="charge-heading">{`${t("selectTenancies")} · ${season.name}`}</h2>
      {done === undefined ? null : <Notice tone="good">{done}</Notice>}
      <p className="hint">{`${t("standardFee")}: ${money(season.standardFee)}`}</p>
      {tenancies.length === 0 ? <p>{t("noTenanciesInSeason")}</p> : null}
      <ul className="plain stack">
        {tenancies.map((x) => (
          <li key={x.tenancyId} className="stack">
            {charged(x) ? (
              <p>{t("alreadyChargedLine", { plot: `${codeOf(x)} · ${nameOf(x)}` })}</p>
            ) : (
              <>
                <CheckField label={`${t("selectTenancies")}: ${codeOf(x)} · ${nameOf(x)}`} checked={pick(x).selected} onChange={(v) => setPick(x, { selected: v })} />
                {pick(x).selected ? (
                  <div className="stack indent">
                    <CheckField label={`${t("waiveFee")}: ${codeOf(x)}`} checked={pick(x).waive} onChange={(v) => setPick(x, { waive: v })} />
                    {pick(x).waive ? (
                      <TextField label={`${t("reasonLabel")}: ${codeOf(x)}`} value={pick(x).reason} onChange={(v) => setPick(x, { reason: v })} error={errors[`reason:${x.tenancyId}`]} autoComplete="off" />
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
      {preview ? (
        <div className="stack review" role="region" aria-label={t("chargesPreviewHeading")}>
          <h3>{t("chargesPreviewHeading")}</h3>
          <ul className="plain">
            {chosen.map((x) => (
              <li key={x.tenancyId}>{pick(x).waive ? t("willWaive", { plot: codeOf(x), name: nameOf(x), reason: pick(x).reason }) : t("willCharge", { plot: codeOf(x), name: nameOf(x), amount: money(season.standardFee) })}</li>
            ))}
          </ul>
          <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
          <div className="actions">
            <Button primary onClick={() => void apply()} disabled={intent.busy}>
              {t("applyCharges")}
            </Button>
            <Button onClick={() => setPreview(false)}>{t("cancel")}</Button>
          </div>
        </div>
      ) : (
        <>
          <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
          <div className="actions">
            <Button primary type="submit" disabled={chosen.length === 0}>
              {t("previewCharges")}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}

export function SeasonScreen() {
  const { t, route } = useShell();
  const open = useAllot();
  const base = `#/r/${open.site.id}`;
  const seasons = Object.values(open.state.seasons).sort((a, b) => (a.start < b.start ? 1 : -1));
  const wanted = route.query.get("season") ?? "";
  const [seasonId, setSeasonId] = useState(wanted);
  const chosen = seasons.some((s) => s.seasonId === seasonId) ? seasonId : (seasons[0]?.seasonId ?? "");

  return (
    <section className="stack">
      <h1>{t("newSeason")}</h1>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
        <ButtonLink href={`${base}/payments`}>{t("seasonFees")}</ButtonLink>
      </div>
      <NewSeasonForm onSaved={(id) => setSeasonId(id)} />
      {seasons.length === 0 ? (
        <p>{t("noSeasons")}</p>
      ) : (
        <div className="stack">
          <SelectField label={t("chooseSeason")} value={chosen} onChange={setSeasonId} options={seasons.map((s) => ({ value: s.seasonId, label: s.name }))} />
          <ChargeForm key={chosen} seasonId={chosen} />
        </div>
      )}
    </section>
  );
}
