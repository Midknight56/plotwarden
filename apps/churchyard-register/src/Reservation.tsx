// Reservations and requests. A reservation holds a space for a living holder, who is kept apart from every burial.
// A request holds nothing. A reservation is released with a date and a reason, or becomes a burial by name.
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button, ButtonLink, TextField } from "../../../template/src/ui/controls";
import { useShell } from "../../../template/src/ui/shellContext";
import { Status } from "../../../template/src/ui/Status";
import { LocationFields } from "./Burial";
import { plotChoices } from "./history";
import type { PlotChoice } from "./history";
import { useIntent, useChurch } from "./intent";
import type { Reservation } from "./types";

function spaceLabelOf(plots: PlotChoice[], r: { plotId: string; spaceId: string }): string {
  return plots.find((p) => p.plotId === r.plotId)?.spaces.find((s) => s.spaceId === r.spaceId)?.label ?? "";
}

function ReleaseForm({ reservation, plots }: { reservation: Reservation; plots: PlotChoice[] }) {
  const { t } = useShell();
  const open = useChurch();
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const [date, setDate] = useState(open.today);
  const [reason, setReason] = useState("");
  const [showing, setShowing] = useState(false);
  const code = open.state.core.plots[reservation.plotId]?.code ?? "";

  if (!showing) {
    return (
      <div className="actions">
        <Button onClick={() => setShowing(true)}>{t("releaseReservation")}</Button>
        <ButtonLink href={`#/r/${open.site.id}/burial/new?reservation=${reservation.reservationId}`}>{t("recordBurialInSpace")}</ButtonLink>
      </div>
    );
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await intent.send([{ type: "release_reservation", reservationId: reservation.reservationId, reason }], { done: t("reservationReleased"), on: date });
    if (outcome.ok) setShowing(false);
  };
  return (
    <form ref={form} className="stack" onSubmit={(e) => void submit(e)} noValidate aria-label={`${t("releaseReservation")} ${code}`}>
      <TextField label={t("releaseDate")} type="date" value={date} onChange={setDate} error={intent.fieldErrors["start"]} />
      <TextField label={t("releaseReason")} value={reason} onChange={setReason} error={intent.fieldErrors["reason"]} autoComplete="off" />
      <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }) }} />
      <div className="actions">
        <Button primary type="submit" disabled={intent.busy}>
          {t("releaseReservation")}
        </Button>
        <Button onClick={() => setShowing(false)}>{t("cancel")}</Button>
      </div>
      <p className="hint">{spaceLabelOf(plots, reservation) === "" ? code : t("spaceIsReserved", { plot: code, space: spaceLabelOf(plots, reservation) })}</p>
    </form>
  );
}

function FulfilForm({ requestId, plots }: { requestId: string; plots: PlotChoice[] }) {
  const { t, newId } = useShell();
  const open = useChurch();
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const [where, setWhere] = useState({ plotId: "", spaceId: "" });
  const [start, setStart] = useState(open.today);
  const ids = useRef({ reservation: newId(), claim: newId() });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (where.spaceId === "") {
      intent.setStatus({ phase: "error", code: "invalid_input", text: t("enterField", { field: t("spaceLabel") }) });
      return;
    }
    await intent.send([{ type: "fulfil_request", requestId, reservationId: ids.current.reservation, spaceId: where.spaceId, claimId: ids.current.claim, start }], { done: t("recordReservation") });
  };
  return (
    <form ref={form} className="stack" onSubmit={(e) => void submit(e)} noValidate>
      <LocationFields plots={plots} plotId={where.plotId} spaceId={where.spaceId} onChange={setWhere} errors={intent.fieldErrors} onlyFree />
      <TextField label={t("startDate")} type="date" value={start} onChange={setStart} error={intent.fieldErrors["start"]} />
      <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }) }} />
      <div className="actions">
        <Button primary type="submit" disabled={intent.busy}>
          {t("recordReservation")}
        </Button>
      </div>
    </form>
  );
}

export function ReservationScreen() {
  const { t, route, newId } = useShell();
  const open = useChurch();
  const base = `#/r/${open.site.id}`;
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const plots = useMemo(() => plotChoices(open.state, open.today), [open.state, open.today]);
  const [holder, setHolder] = useState("");
  const [contact, setContact] = useState("");
  const [where, setWhere] = useState({ plotId: route.query.get("plot") ?? "", spaceId: "" });
  const [start, setStart] = useState(open.today);
  const [sourceRef, setSourceRef] = useState("");
  const ids = useRef({ reservation: newId(), claim: newId(), holder: newId(), request: newId() });
  const [local, setLocal] = useState<Record<string, string>>({});
  const errors = { ...intent.fieldErrors, ...local };

  const free = plots.filter((p) => p.spaces.some((s) => s.checked && s.state === "free"));
  const freeCount = free.reduce((n, p) => n + p.spaces.filter((s) => s.checked && s.state === "free").length, 0);
  const reservations = Object.values(open.state.reservations).sort((a, b) => (a.start < b.start ? 1 : -1));
  const requests = Object.values(open.state.requests).sort((a, b) => (a.on < b.on ? -1 : 1));
  const holderOf = (id: string) => open.state.people[id];

  const reset = () => {
    ids.current = { reservation: newId(), claim: newId(), holder: newId(), request: newId() };
    setHolder("");
    setContact("");
    setWhere({ plotId: "", spaceId: "" });
    setSourceRef("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocal({});
    if (where.spaceId === "") {
      setLocal({ plot: t("enterField", { field: t("spaceLabel") }) });
      window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const command = {
      type: "record_reservation",
      reservationId: ids.current.reservation,
      holderId: ids.current.holder,
      holderName: holder,
      ...(contact.trim() === "" ? {} : { contact }),
      spaceId: where.spaceId,
      claimId: ids.current.claim,
      start,
      ...(sourceRef.trim() === "" ? {} : { sourceRef: sourceRef.trim() }),
    };
    const code = plots.find((p) => p.plotId === where.plotId);
    const label = code?.spaces.find((s) => s.spaceId === where.spaceId)?.label ?? "";
    const outcome = await intent.send([command], { done: t("spaceIsReserved", { plot: code?.code ?? "", space: label }) });
    if (outcome.ok) reset();
  };

  const request = async () => {
    setLocal({});
    const outcome = await intent.send([{ type: "add_request", requestId: ids.current.request, holderId: ids.current.holder, holderName: holder, ...(contact.trim() === "" ? {} : { contact }) }], { done: t("requestRecorded") });
    if (outcome.ok) reset();
  };

  return (
    <section className="stack">
      <h1>{t("reserveSpace")}</h1>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
      </div>
      <form ref={form} className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <TextField label={t("reservationHolder")} value={holder} onChange={setHolder} error={errors["holder"]} autoComplete="off" />
        <TextField label={t("contactDetails")} value={contact} onChange={setContact} error={errors["contact"]} autoComplete="off" />
        <p>{freeCount === 1 ? t("freeSpacesOne") : t("freeSpaces", { count: freeCount })}</p>
        <p className="hint">{t("availableSpaces")}</p>
        {freeCount === 0 ? <p>{t("noFreeSpaces")}</p> : <LocationFields plots={plots} plotId={where.plotId} spaceId={where.spaceId} onChange={setWhere} errors={errors} onlyFree />}
        <TextField label={t("startDate")} type="date" value={start} onChange={setStart} error={errors["start"]} />
        <TextField label={t("sourceRefLabel")} value={sourceRef} onChange={setSourceRef} error={errors["sourceRef"]} autoComplete="off" />
        <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
        <div className="actions">
          <Button primary type="submit" disabled={intent.busy}>
            {t("recordReservation")}
          </Button>
          <Button disabled={intent.busy} onClick={() => void request()}>
            {t("reserveForNext")}
          </Button>
        </div>
      </form>

      <section className="stack" aria-labelledby="reservations-heading">
        <h2 id="reservations-heading">{t("reservationsHeading")}</h2>
        {reservations.length === 0 ? <p>{t("noReservations")}</p> : null}
        <ul className="cards plain">
          {reservations.map((r) => {
            const person = holderOf(r.holderId);
            const code = open.state.core.plots[r.plotId]?.code ?? "";
            const closed = r.released !== undefined || r.convertedTo !== undefined;
            return (
              <li key={r.reservationId} className="card">
                <p>
                  <strong>{t("spaceIsReserved", { plot: code, space: spaceLabelOf(plots, r) })}</strong>
                </p>
                <p>{[person?.displayName, person?.contact, r.sourceRef, r.start].filter((x) => x !== undefined && x !== "").join(" · ")}</p>
                {r.released === undefined ? null : <p>{t("releasedOn", { date: r.released.on, reason: r.released.reason })}</p>}
                {r.convertedTo === undefined ? null : (
                  <>
                    <p>{t("convertedNote")}</p>
                    <div className="actions">
                      <ButtonLink href={`${base}/burial/${r.convertedTo}`}>{t("openBurial")}</ButtonLink>
                    </div>
                  </>
                )}
                {closed ? null : <ReleaseForm reservation={r} plots={plots} />}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="stack" aria-labelledby="requests-heading">
        <h2 id="requests-heading">{t("requestsHeading")}</h2>
        {requests.length === 0 ? <p>{t("noRequests")}</p> : null}
        <ul className="cards plain">
          {requests.map((r) => {
            const person = holderOf(r.holderId);
            return (
              <li key={r.requestId} className="card">
                <p>
                  <strong>{[t("requestFor"), person?.displayName].filter(Boolean).join(" · ")}</strong>
                </p>
                <p>{[person?.contact, r.on].filter((x) => x !== undefined && x !== "").join(" · ")}</p>
                {r.reservationId === undefined ? <FulfilForm requestId={r.requestId} plots={plots} /> : <p>{t("convertedNote")}</p>}
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}
