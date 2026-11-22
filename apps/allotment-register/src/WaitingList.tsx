// The waiting list. Applicants are in the order of their joined date and their join sequence, which never changes.
// An applicant with an open offer keeps their place and shows "Offer pending". A person has one open request.
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button, ButtonLink, Notice, SelectField, TextArea, TextField } from "../../../template/src/ui/controls";
import { useShell } from "../../../template/src/ui/shellContext";
import { Status } from "../../../template/src/ui/Status";
import { useAllot, useIntent } from "./intent";
import { nextApplicant, queueView } from "./rules";
import type { Application } from "./types";

/** A withdrawn request leaves the list and this form with it, so the page says what happened through `onDone`. */
function WithdrawForm({ application, name, onDone }: { application: Application; name: string; onDone(message: string): void }) {
  const { t } = useShell();
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const open = useAllot();
  const [reason, setReason] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await intent.send([{ type: "withdraw_applicant", applicationId: application.applicationId, reason }], { done: t("requestWithdrawn") });
    if (outcome.ok) onDone(`${t("requestWithdrawn")} ${t("saved")}`);
  };
  return (
    <form ref={form} className="stack" onSubmit={(e) => void submit(e)} noValidate aria-label={`${t("withdrawRequest")} ${name}`}>
      <TextField label={`${t("reasonLabel")}: ${name}`} value={reason} onChange={setReason} error={intent.fieldErrors["reason"]} autoComplete="off" />
      <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
      <div className="actions">
        <Button primary type="submit" disabled={intent.busy}>
          {t("confirmWithdraw")}
        </Button>
      </div>
    </form>
  );
}

export function WaitingList() {
  const { t, newId } = useShell();
  const open = useAllot();
  const base = `#/r/${open.site.id}`;
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const rows = useMemo(() => queueView(open.state), [open.state]);
  const next = nextApplicant(open.state);
  const sections = Object.values(open.state.map.sections).sort((a, b) => a.displayOrder - b.displayOrder);
  const people = Object.values(open.state.people).sort((a, b) => a.displayName.localeCompare(b.displayName));
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [joined, setJoined] = useState(open.today);
  const [section, setSection] = useState("");
  const [same, setSame] = useState("");
  const [openRow, setOpenRow] = useState<{ id: string; mode: "view" | "withdraw" } | undefined>();
  const [history, setHistory] = useState(false);
  const [notice, setNotice] = useState<string | undefined>();
  const ids = useRef({ application: newId(), person: newId() });

  const sectionName = (id: string | undefined) => (id === undefined ? t("noPreference") : (open.state.map.sections[id]?.name ?? t("noPreference")));
  const reset = () => {
    ids.current = { application: newId(), person: newId() };
    setName("");
    setContact("");
    setSection("");
    setSame("");
    setJoined(open.today);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(undefined);
    const personId = same === "" ? ids.current.person : same;
    const known = open.state.people[personId];
    const outcome = await intent.send(
      [
        {
          type: "add_applicant",
          applicationId: ids.current.application,
          personId,
          ...(known === undefined ? { name } : {}),
          ...(contact.trim() === "" || known !== undefined ? {} : { contact }),
          joinedOn: joined,
          ...(section === "" ? {} : { preferredSectionId: section }),
        },
      ],
      { done: t("applicantAdded", { name: known?.displayName ?? name.trim() }) },
    );
    if (outcome.ok) reset();
  };

  const everyone = Object.values(open.state.applications).sort((a, b) => (a.joinedOn === b.joinedOn ? a.sequence - b.sequence : a.joinedOn < b.joinedOn ? -1 : 1));
  const nameOf = (a: Application) => open.state.people[a.personId]?.displayName ?? "";
  const offerOf = (a: Application) => (a.offerId === undefined ? undefined : open.state.offers[a.offerId]);

  return (
    <section className="stack">
      <h1>{t("waitingList")}</h1>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
        <ButtonLink href={`${base}/offer`} primary>
          {t("makeOffer")}
        </ButtonLink>
      </div>

      {notice === undefined ? null : <Notice tone="good">{notice}</Notice>}

      <section className="stack" aria-labelledby="order-heading">
        <h2 id="order-heading">{t("waitingListOrder")}</h2>
        {next === undefined ? null : <p className="lead">{`${t("nextEligible")}: ${next.name}`}</p>}
        {rows.length === 0 ? <p>{t("noOneWaiting")}</p> : null}
        <ol className="cards plain">
          {rows.map((r) => {
            const application = open.state.applications[r.applicationId] as Application;
            const shown = openRow?.id === r.applicationId ? openRow.mode : undefined;
            const offer = offerOf(application);
            return (
              <li key={r.applicationId} className="card">
                <p>
                  <strong>{`${t("positionLabel")} ${r.position} · ${r.name}`}</strong>
                </p>
                <p>{`${t("joinedLabel")}: ${r.joinedOn} · ${t("preferredSection")}: ${sectionName(application.preferredSectionId)}`}</p>
                {r.pending ? <p className="badge">{t("reasonPending")}</p> : null}
                {shown === "view" ? (
                  <div className="stack">
                    <h3>{t("requestOf", { name: r.name })}</h3>
                    <p>{t("sequenceLine", { sequence: application.sequence })}</p>
                    {application.sourceRef === undefined ? null : <p>{t("sourceOf", { ref: application.sourceRef })}</p>}
                    {open.state.people[application.personId]?.contact === undefined ? null : <p>{`${t("contactDetails")}: ${open.state.people[application.personId]?.contact}`}</p>}
                    {offer === undefined ? null : <p>{t("offerMadeLine", { code: open.state.core.plots[offer.plotId]?.code ?? "", date: offer.offeredOn })}</p>}
                  </div>
                ) : null}
                {shown === "withdraw" ? <WithdrawForm application={application} name={r.name} onDone={setNotice} /> : null}
                <div className="actions">
                  <Button onClick={() => setOpenRow(shown === "view" ? undefined : { id: r.applicationId, mode: "view" })}>{`${t("viewRequest")}: ${r.name}`}</Button>
                  {r.pending ? null : <Button onClick={() => setOpenRow(shown === "withdraw" ? undefined : { id: r.applicationId, mode: "withdraw" })}>{`${t("withdrawRequest")}: ${r.name}`}</Button>}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="actions">
          <Button onClick={() => setHistory((h) => !h)} aria-expanded={history}>
            {history ? t("hideHistory") : t("showHistory")}
          </Button>
        </div>
        {history ? (
          <div className="stack">
            <h3>{t("historyHeading")}</h3>
            <ul className="plain stack">
              {everyone.map((a) => (
                <li key={a.applicationId}>
                  {[
                    nameOf(a),
                    a.joinedOn,
                    a.state === "withdrawn" && a.withdrawn !== undefined ? t("withdrawnLine", { date: a.withdrawn.on, reason: a.withdrawn.reason }) : "",
                    a.state === "housed" ? t("housedLine") : "",
                  ]
                    .filter((x) => x !== "")
                    .join(" · ")}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <form ref={form} className="stack card" onSubmit={(e) => void submit(e)} noValidate aria-labelledby="add-heading">
        <h2 id="add-heading">{t("addApplicant")}</h2>
        {people.length === 0 ? null : (
          <SelectField
            label={t("existingPerson")}
            value={same}
            onChange={(v) => setSame(v)}
            error={same === "" ? undefined : intent.fieldErrors["applicant"]}
            options={[{ value: "", label: t("newPerson") }, ...people.map((p) => ({ value: p.personId, label: p.displayName }))]}
          />
        )}
        {same === "" ? (
          <>
            <TextField label={t("applicantLabel")} value={name} onChange={setName} error={intent.fieldErrors["applicant"]} autoComplete="off" />
            <TextArea label={t("contactDetails")} value={contact} onChange={setContact} error={intent.fieldErrors["contact"]} rows={2} />
          </>
        ) : null}
        <TextField label={t("joinedDate")} type="date" value={joined} onChange={setJoined} error={intent.fieldErrors["joinedOn"]} />
        {sections.length === 0 ? null : (
          <SelectField label={t("preferredSection")} value={section} onChange={setSection} options={[{ value: "", label: t("noPreference") }, ...sections.map((s) => ({ value: s.sectionId, label: s.name }))]} />
        )}
        <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
        <div className="actions">
          <Button primary type="submit" disabled={intent.busy}>
            {t("addApplicant")}
          </Button>
        </div>
      </form>
    </section>
  );
}
