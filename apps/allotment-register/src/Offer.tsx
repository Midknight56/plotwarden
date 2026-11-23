// Offers. The secretary chooses a free plot, sees who is passed over and why, reviews the offer, and records it.
// An offer is a local record that holds the plot. The register never contacts the applicant.
// An open offer is accepted, declined or, when its reply date has passed, released.
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button, ButtonLink, CheckField, Notice, SelectField, TextField } from "../../../template/src/ui/controls";
import { useShell } from "../../../template/src/ui/shellContext";
import { Status } from "../../../template/src/ui/Status";
import { useAllot, useIntent } from "./intent";
import { freePlotsAt } from "./projection";
import { isOverdue, offerPlan, queueView } from "./rules";
import type { Offer } from "./types";

interface CardProps {
  offer: Offer;
  onDone(message: string): void;
}

/** One open offer with the three things that can happen to it. */
function OfferCard({ offer, onDone }: CardProps) {
  const { t, newId } = useShell();
  const open = useAllot();
  const acceptForm = useRef<HTMLFormElement>(null);
  const declineForm = useRef<HTMLFormElement>(null);
  const releaseForm = useRef<HTMLFormElement>(null);
  const accept = useIntent(acceptForm);
  const decline = useIntent(declineForm);
  const release = useIntent(releaseForm);
  const [begins, setBegins] = useState(open.today);
  const [choice, setChoice] = useState("");
  const [declineReason, setDeclineReason] = useState("");
  const [withdraw, setWithdraw] = useState(false);
  const [releaseReason, setReleaseReason] = useState("");
  const ids = useRef({ tenancy: newId(), claim: newId() });
  const [local, setLocal] = useState<Record<string, string>>({});

  const code = open.state.core.plots[offer.plotId]?.code ?? "";
  const application = open.state.applications[offer.applicationId];
  const name = open.state.people[application?.personId ?? ""]?.displayName ?? "";
  const late = isOverdue(offer, open.today);
  const sectionOf = open.state.core.plots[offer.plotId]?.sectionId;
  const sectionName = sectionOf === undefined ? t("noSection") : (open.state.map.sections[sectionOf]?.name ?? t("noSection"));

  const doAccept = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await accept.send([{ type: "accept_offer", offerId: offer.offerId, tenancyId: ids.current.tenancy, claimId: ids.current.claim }], { done: t("offerAccepted", { name, plot: code }), on: begins, fields: { plot_not_free: "start", tenancy_overlap: "start" } });
    if (outcome.ok) onDone(`${t("offerAccepted", { name, plot: code })} ${t("saved")}`);
  };

  const doDecline = async (event: FormEvent) => {
    event.preventDefault();
    setLocal({});
    if (choice === "") {
      setLocal({ choice: t("chooseChoice") });
      window.setTimeout(() => declineForm.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const message = choice === "keep_place" ? t("offerDeclinedKept", { name }) : t("offerDeclinedLeft", { name });
    const outcome = await decline.send([{ type: "decline_offer", offerId: offer.offerId, choice, ...(declineReason.trim() === "" ? {} : { reason: declineReason }) }], { done: message });
    if (outcome.ok) onDone(`${message} ${t("saved")}`);
  };

  const doRelease = async (event: FormEvent) => {
    event.preventDefault();
    const message = withdraw ? t("offerReleasedLeft", { name, plot: code }) : t("offerReleased", { plot: code });
    const outcome = await release.send([{ type: "release_offer", offerId: offer.offerId, withdraw, ...(releaseReason.trim() === "" ? {} : { reason: releaseReason }) }], { done: message });
    if (outcome.ok) onDone(`${message} ${t("saved")}`);
  };

  return (
    <li className="card">
      <h3>{t("offerSummary", { plot: code, name })}</h3>
      <p>{sectionName}</p>
      <p>{offer.replyBy === undefined ? t("offerNoReply", { date: offer.offeredOn }) : t("offerDates", { date: offer.offeredOn, reply: offer.replyBy })}</p>
      {late ? <p className="badge bad">{t("replyOverdue")}</p> : null}
      {offer.skipped.length === 0 ? null : (
        <ul className="plain">
          {offer.skipped.map((s) => {
            const who = open.state.people[open.state.applications[s.applicationId]?.personId ?? ""]?.displayName ?? "";
            return <li key={s.applicationId}>{s.kind === "pending" ? t("skipPending", { name: who }) : s.kind === "preference" ? t("skipPreference", { name: who }) : t("reasonSkipped", { reason: `${who}. ${s.reason ?? ""}` })}</li>;
          })}
        </ul>
      )}

      <form ref={acceptForm} className="stack" onSubmit={(e) => void doAccept(e)} noValidate aria-label={`${t("acceptOffer")} ${code}`}>
        <TextField label={`${t("acceptDate")}: ${code}`} type="date" value={begins} onChange={setBegins} error={accept.fieldErrors["start"]} />
        <Status status={accept.status} actions={{ tryAgain: () => accept.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
        <div className="actions">
          <Button primary type="submit" disabled={accept.busy}>
            {t("acceptOffer")}
          </Button>
        </div>
      </form>

      <form ref={declineForm} className="stack" onSubmit={(e) => void doDecline(e)} noValidate aria-label={`${t("declineOffer")} ${code}`}>
        <SelectField
          label={`${t("declineChoice")}: ${code}`}
          value={choice}
          onChange={setChoice}
          error={local["choice"] ?? decline.fieldErrors["choice"]}
          options={[
            { value: "", label: "" },
            { value: "keep_place", label: t("keepPlace") },
            { value: "leave_list", label: t("leaveList") },
          ]}
        />
        <TextField label={`${t("reasonLabel")}: ${code}`} value={declineReason} onChange={setDeclineReason} error={decline.fieldErrors["reason"]} autoComplete="off" />
        <Status status={decline.status} actions={{ tryAgain: () => decline.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
        <div className="actions">
          <Button type="submit" disabled={decline.busy}>
            {t("declineOffer")}
          </Button>
        </div>
      </form>

      {late ? (
        <form ref={releaseForm} className="stack" onSubmit={(e) => void doRelease(e)} noValidate aria-label={`${t("releaseOverdueOffer")} ${code}`}>
          <CheckField label={`${t("withdrawAlso")}: ${code}`} checked={withdraw} onChange={setWithdraw} />
          {withdraw ? <TextField label={`${t("reasonLabel")} ${code}`} value={releaseReason} onChange={setReleaseReason} error={release.fieldErrors["reason"]} autoComplete="off" /> : null}
          <Status status={release.status} actions={{ tryAgain: () => release.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
          <div className="actions">
            <Button type="submit" disabled={release.busy}>
              {t("releaseOverdueOffer")}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

export function OfferScreen() {
  const { t, route, newId } = useShell();
  const open = useAllot();
  const base = `#/r/${open.site.id}`;
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const today = open.today;

  const free = useMemo(() => freePlotsAt(open.state, today), [open.state, today]);
  const queue = useMemo(() => queueView(open.state), [open.state]);
  const wanted = route.query.get("plot") ?? "";
  const [plotChoice, setPlotChoice] = useState(wanted);
  const plotId = free.some((p) => p.plotId === plotChoice) ? plotChoice : (free[0]?.plotId ?? "");
  const plot = free.find((p) => p.plotId === plotId);
  const firstFit = plotId === "" ? undefined : offerPlan(open.state, plotId, "").firstFit;
  const [applicantChoice, setApplicantChoice] = useState("");
  const eligible = queue.filter((r) => !r.pending);
  const applicationId = eligible.some((r) => r.applicationId === applicantChoice) ? applicantChoice : (firstFit?.applicationId ?? eligible[0]?.applicationId ?? "");
  const chosen = queue.find((r) => r.applicationId === applicationId);
  const plan = plotId === "" || applicationId === "" ? undefined : offerPlan(open.state, plotId, applicationId);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [replyBy, setReplyBy] = useState("");
  const [review, setReview] = useState(false);
  const [local, setLocal] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | undefined>();
  const ids = useRef({ offer: newId(), claim: newId() });

  const errors = { ...intent.fieldErrors, ...local };
  const nameOf = (id: string) => open.state.people[open.state.applications[id]?.personId ?? ""]?.displayName ?? "";
  const sectionName = (sectionId: string | undefined) => (sectionId === undefined ? t("noSection") : (open.state.map.sections[sectionId]?.name ?? t("noSection")));
  const openOffers = Object.values(open.state.offers)
    .filter((o) => o.state === "open")
    .sort((a, b) => (a.offeredOn < b.offeredOn ? -1 : 1));
  const exceptional = (plan?.skipped ?? []).filter((s) => s.kind === "exceptional");

  const goReview = (event: FormEvent) => {
    event.preventDefault();
    setLocal({});
    setResult(undefined);
    const missing = exceptional.filter((s) => (reasons[s.applicationId] ?? "").trim() === "");
    if (missing.length > 0) {
      setLocal(Object.fromEntries(missing.map((s) => [`skipReason:${s.applicationId}`, t("err_skip_reason_required")])));
      window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setReview(true);
  };

  const record = async () => {
    if (plot === undefined || chosen === undefined) return;
    const skipReasons = Object.fromEntries(exceptional.map((s) => [s.applicationId, reasons[s.applicationId] ?? ""]));
    const outcome = await intent.send(
      [
        {
          type: "make_offer",
          offerId: ids.current.offer,
          applicationId: chosen.applicationId,
          spaceId: open.state.core.plots[plot.plotId]?.spaces[0]?.spaceId,
          claimId: ids.current.claim,
          ...(replyBy === "" ? {} : { replyBy }),
          skipReasons,
        },
      ],
      { done: t("offerReserved", { plot: plot.code, name: chosen.name }), on: today },
    );
    if (outcome.ok) {
      setResult(`${t("offerReserved", { plot: plot.code, name: chosen.name })} ${t("tellApplicant")} ${t("saved")}`);
      ids.current = { offer: newId(), claim: newId() };
      setReview(false);
      setReasons({});
      setReplyBy("");
      setApplicantChoice("");
      intent.setStatus({ phase: "idle" });
    } else {
      setReview(false);
    }
  };

  return (
    <section className="stack page">
      <div className="page-head">
        <h1>{t("makeOffer")}</h1>
        <div className="actions">
          <ButtonLink href={base} quiet>
            {t("backToRegister")}
          </ButtonLink>
          <ButtonLink href={`${base}/waiting`}>{t("waitingList")}</ButtonLink>
        </div>
      </div>
      {result === undefined ? null : (
        <Notice tone="good">
          {result}
        </Notice>
      )}

      <div className="offer-layout">
        {free.length === 0 || queue.length === 0 ? (
          <section className="stack card offer-card">
            <p>{free.length === 0 ? t("noFreePlot") : t("noOneWaiting")}</p>
            <p className="hint">{free.length === 0 ? t("noFreePlotHint") : t("noApplicantHint")}</p>
          </section>
        ) : (
          <form ref={form} className="stack card offer-card" onSubmit={goReview} noValidate aria-labelledby="offer-heading">
            <h2 id="offer-heading">{t("offerHeading")}</h2>
            <div className="field-grid">
              <SelectField
                label={t("chooseFreePlot")}
                value={plotId}
                onChange={(v) => {
                  setPlotChoice(v);
                  setApplicantChoice("");
                  setReview(false);
                }}
                options={free.map((p) => ({ value: p.plotId, label: `${p.code} · ${sectionName(p.sectionId)}` }))}
              />
              {eligible.length === 0 ? (
                <p>{t("noEligibleApplicant")}</p>
              ) : (
                <div className="field-pair">
                  <SelectField
                    label={t("offerTo")}
                    value={applicationId}
                    onChange={(v) => {
                      setApplicantChoice(v);
                      setReview(false);
                    }}
                    options={eligible.map((r) => ({ value: r.applicationId, label: `${t("positionLabel")} ${r.position} · ${r.name}` }))}
                  />
                  {chosen === undefined ? null : <p className="hint">{`${t("positionLabel")} ${chosen.position} · ${chosen.name} · ${t("joinedLabel")} ${chosen.joinedOn}`}</p>}
                </div>
              )}
            </div>
            {plan === undefined || plan.skipped.length === 0 ? null : (
              <div className="stack soft-panel" role="group" aria-label={t("skippedNotice")}>
                <p>{t("skippedNotice")}</p>
                {plan.skipped.map((s) =>
                  s.kind === "exceptional" ? (
                    <TextField
                      key={s.applicationId}
                      label={`${t("whySkip")} ${nameOf(s.applicationId)}`}
                      value={reasons[s.applicationId] ?? ""}
                      onChange={(v) => setReasons((r) => ({ ...r, [s.applicationId]: v }))}
                      error={errors[`skipReason:${s.applicationId}`]}
                      autoComplete="off"
                    />
                  ) : (
                    <p key={s.applicationId}>{s.kind === "pending" ? t("skipPending", { name: nameOf(s.applicationId) }) : t("skipPreference", { name: nameOf(s.applicationId) })}</p>
                  ),
                )}
              </div>
            )}
            <TextField label={t("replyBy")} type="date" value={replyBy} onChange={setReplyBy} error={errors["replyBy"]} />
            {review && plot !== undefined && chosen !== undefined ? (
              <div className="stack review" role="region" aria-label={t("reviewOffer")}>
                <p className="lead">{t("offerReserved", { plot: plot.code, name: chosen.name })}</p>
                <p>{replyBy === "" ? t("offerNoReply", { date: today }) : t("offerDates", { date: today, reply: replyBy })}</p>
                <p>{t("tellApplicant")}</p>
                <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
                <div className="actions">
                  <Button primary onClick={() => void record()} disabled={intent.busy}>
                    {t("recordOffer")}
                  </Button>
                  <Button onClick={() => setReview(false)}>{t("cancel")}</Button>
                </div>
              </div>
            ) : (
              <>
                <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
                <div className="actions">
                  <Button primary type="submit" disabled={plot === undefined || chosen === undefined}>
                    {t("reviewOffer")}
                  </Button>
                </div>
              </>
            )}
          </form>
        )}

        <section className="stack offer-list" aria-labelledby="open-offers-heading">
          <h2 id="open-offers-heading">{t("openOffers")}</h2>
          {openOffers.length === 0 ? <p>{t("noOpenOffers")}</p> : null}
          <ul className="cards plain">
            {openOffers.map((o) => (
              <OfferCard key={o.offerId} offer={o} onDone={(message) => setResult(message)} />
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
