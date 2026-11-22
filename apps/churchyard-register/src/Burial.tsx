// Record a burial, open one, and correct one. The words on the stone are in Memorial.tsx.
// A burial is permanent: a name, date or space changes only by a correction that names the original.
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { isValidLocalDate } from "../../../template/src/calendar";
import type { PartialDate } from "../../../template/src/calendar";
import { historyOf } from "../../../template/src/events";
import { Button, ButtonLink, CheckField, Notice, RadioGroup, SelectField, TextArea, TextField, keepSearch } from "../../../template/src/ui/controls";
import { formatPartialDate } from "../../../template/src/ui/copy";
import { useShell } from "../../../template/src/ui/shellContext";
import { Status } from "../../../template/src/ui/Status";
import { findEventId, plotChoices } from "./history";
import type { PlotChoice } from "./history";
import { useIntent, useChurch } from "./intent";
import { StoneSection } from "./Memorial";
import { claimStartOf, isValidPartial, possibleMatches } from "./rules";
import type { Burial } from "./types";

export type DateKind = "exact" | "month" | "year" | "unknown";

/** Read the date fields as the keeper typed them, at the precision they chose. Nothing is filled in. */
export function parseDateField(kind: DateKind, text: string): { date: PartialDate; dateText: string } | undefined {
  const value = text.trim();
  let date: PartialDate | undefined;
  if (kind === "unknown") return { date: { p: "unknown" }, dateText: "" };
  if (kind === "year" && /^\d{4}$/.test(value)) date = { p: "year", y: Number(value) };
  if (kind === "month" && /^\d{4}-\d{2}$/.test(value)) date = { p: "month", y: Number(value.slice(0, 4)), m: Number(value.slice(5, 7)) };
  if (kind === "exact" && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValidLocalDate(value)) {
    date = { p: "day", y: Number(value.slice(0, 4)), m: Number(value.slice(5, 7)), d: Number(value.slice(8, 10)) };
  }
  return date !== undefined && isValidPartial(date) ? { date, dateText: value } : undefined;
}

/** The kind and the text a stored date shows in the fields, for a correction. */
export function dateFieldsOf(date: PartialDate): { kind: DateKind; text: string } {
  const two = (n: number) => String(n).padStart(2, "0");
  switch (date.p) {
    case "unknown":
      return { kind: "unknown", text: "" };
    case "year":
      return { kind: "year", text: String(date.y) };
    case "month":
      return { kind: "month", text: `${date.y}-${two(date.m)}` };
    case "day":
      return { kind: "exact", text: `${date.y}-${two(date.m)}-${two(date.d)}` };
  }
}

export function DateFields({
  kind,
  text,
  onKind,
  onText,
  error,
  name = "burialDate",
}: {
  kind: DateKind;
  text: string;
  onKind: (kind: DateKind) => void;
  onText: (text: string) => void;
  error?: string | undefined;
  name?: string;
}) {
  const { t } = useShell();
  const inputType = kind === "exact" ? "date" : kind === "month" ? "month" : "number";
  return (
    <div className="stack">
      <RadioGroup
        legend={t("dateKind")}
        name={`${name}-kind`}
        value={kind}
        onChange={(v) => onKind(v as DateKind)}
        options={[
          { value: "exact", label: t("exactDate") },
          { value: "month", label: t("monthAndYear") },
          { value: "year", label: t("yearOnly") },
          { value: "unknown", label: t("dateUnknown") },
        ]}
      />
      {kind === "unknown" ? null : (
        <TextField
          label={t("burialDate")}
          type={inputType}
          {...(kind === "year" ? { min: 1000, max: 9999, inputMode: "numeric" as const } : {})}
          value={text}
          onChange={onText}
          error={error}
        />
      )}
    </div>
  );
}

/** Section, plot and space, in that order. A plot with one space needs no space choice. */
export function LocationFields({
  plots,
  plotId,
  spaceId,
  onChange,
  errors = {},
  allowUnknown = false,
  onlyFree = false,
  disabled = false,
}: {
  plots: PlotChoice[];
  plotId: string;
  spaceId: string;
  onChange: (next: { plotId: string; spaceId: string }) => void;
  errors?: Readonly<Record<string, string>>;
  allowUnknown?: boolean;
  /** Offer only plots and spaces that are checked and free. */
  onlyFree?: boolean;
  disabled?: boolean;
}) {
  const { t } = useShell();
  const usable = (p: PlotChoice) => !onlyFree || p.spaces.some((s) => s.checked && s.state === "free");
  const chosen = plots.find((p) => p.plotId === plotId);
  const [sectionId, setSectionId] = useState(chosen?.sectionId ?? "");
  const sections = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of plots) if (usable(p) && p.sectionId !== undefined) seen.set(p.sectionId, p.sectionName);
    return [...seen.entries()];
  }, [plots, onlyFree]);
  const inSection = plots.filter((p) => usable(p) && (sectionId === "" || p.sectionId === sectionId));
  const spaces = (chosen?.spaces ?? []).filter((s) => !onlyFree || (s.checked && s.state === "free"));
  return (
    <div className="stack">
      <SelectField
        label={t("sectionLabel")}
        value={sectionId}
        disabled={disabled}
        onChange={(v) => {
          setSectionId(v);
          onChange({ plotId: "", spaceId: "" });
        }}
        options={[{ value: "", label: t("noSectionChoice") }, ...sections.map(([id, name]) => ({ value: id, label: name }))]}
      />
      <SelectField
        label={t("plotLabel")}
        value={plotId}
        disabled={disabled}
        error={errors["plot"]}
        onChange={(v) => {
          const next = plots.find((p) => p.plotId === v);
          const free = next?.spaces.filter((s) => !onlyFree || (s.checked && s.state === "free")) ?? [];
          onChange({ plotId: v, spaceId: free.length === 1 ? (free[0]?.spaceId ?? "") : "" });
        }}
        options={[{ value: "", label: allowUnknown ? t("locationUnknown") : t("choosePlotField") }, ...inSection.map((p) => ({ value: p.plotId, label: p.sectionName === "" ? p.code : `${p.code} · ${p.sectionName}` }))]}
      />
      {chosen !== undefined && spaces.length > 1 ? (
        <SelectField
          label={t("spaceLabel")}
          value={spaceId}
          disabled={disabled}
          error={errors["space"]}
          onChange={(v) => onChange({ plotId, spaceId: v })}
          options={[{ value: "", label: t("chooseSpace") }, ...spaces.map((s) => ({ value: s.spaceId, label: s.label }))]}
        />
      ) : null}
    </div>
  );
}

function NotFoundHere() {
  const { t } = useShell();
  const open = useChurch();
  return (
    <section className="stack">
      <h1>{t("pageNotFound")}</h1>
      <div className="actions">
        <ButtonLink href={`#/r/${open.site.id}`}>{t("backToRegister")}</ButtonLink>
      </div>
    </section>
  );
}

export function BurialRoute({ arg }: { arg?: string }) {
  if (arg === undefined) return <NotFoundHere />;
  return arg === "new" ? <BurialForm /> : <BurialDetail burialId={arg} />;
}

const foldName = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ");

export function BurialForm() {
  const { t, route, newId } = useShell();
  const open = useChurch();
  const base = `#/r/${open.site.id}`;
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const plots = useMemo(() => plotChoices(open.state, open.today), [open.state, open.today]);

  const reservationId = route.query.get("reservation") ?? "";
  const reservation = open.state.reservations[reservationId];
  const holder = reservation === undefined ? undefined : open.state.people[reservation.holderId];
  const startPlot = reservation?.plotId ?? route.query.get("plot") ?? "";
  const startSpace = reservation?.spaceId ?? (plots.find((p) => p.plotId === startPlot)?.spaces.length === 1 ? (plots.find((p) => p.plotId === startPlot)?.spaces[0]?.spaceId ?? "") : "");

  const [name, setName] = useState("");
  const [unknown, setUnknown] = useState(false);
  const [kind, setKind] = useState<DateKind>("unknown");
  const [dateText, setDateText] = useState("");
  const [where, setWhere] = useState({ plotId: startPlot, spaceId: startSpace });
  const [sourceRef, setSourceRef] = useState("");
  const [page, setPage] = useState("");
  const [local, setLocal] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<{ burialId: string } | undefined>();
  const ids = useRef({ burial: newId(), claim: newId() });

  const same = useMemo(() => {
    const key = foldName(name);
    if (key === "" || unknown) return [];
    return Object.values(open.state.burials).filter((b) => b.voided !== true && b.recordedName !== undefined && foldName(b.recordedName) === key);
  }, [name, unknown, open.state.burials]);

  const errors = { ...intent.fieldErrors, ...local };
  const chosenPlot = plots.find((p) => p.plotId === where.plotId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocal({});
    setSaved(undefined);
    const parsed = parseDateField(kind, dateText);
    if (parsed === undefined) {
      setLocal({ burialDate: t("invalidDate") });
      window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const placed = where.plotId !== "" && where.spaceId !== "";
    const command: Record<string, unknown> = {
      type: "record_burial",
      burialId: ids.current.burial,
      sourceRef: sourceRef.trim(),
      date: parsed.date,
      dateText: parsed.dateText,
      ...(unknown ? { nameUnknown: true } : { recordedName: name }),
      ...(page.trim() === "" ? {} : { page }),
      ...(where.plotId !== "" ? { plotId: where.plotId, ...(where.spaceId === "" ? {} : { spaceId: where.spaceId }) } : {}),
      ...(placed ? { claimId: ids.current.claim } : {}),
      ...(reservation === undefined ? {} : { reservationId }),
    };
    const done = placed ? t("burialRecorded", { plot: chosenPlot?.code ?? "" }) : t("burialSavedUnplaced");
    const outcome = await intent.send([command as { type: string }], { done });
    if (outcome.ok) {
      setSaved({ burialId: ids.current.burial });
      ids.current = { burial: newId(), claim: newId() };
      setName("");
      setUnknown(false);
      setKind("unknown");
      setDateText("");
      setSourceRef("");
      setPage("");
      if (reservation === undefined) setWhere({ plotId: "", spaceId: "" });
    }
  };

  return (
    <section className="stack">
      <h1>{reservation === undefined ? t("recordBurial") : t("recordBurialInSpace")}</h1>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
      </div>
      {reservation === undefined ? null : (
        <section className="card stack" aria-label={t("reservationsHeading")}>
          <p>{t("spaceIsReserved", { plot: open.state.core.plots[reservation.plotId]?.code ?? "", space: chosenPlot?.spaces.find((s) => s.spaceId === reservation.spaceId)?.label ?? "" })}</p>
          <p>{[holder?.displayName, t("reservedFrom", { plot: open.state.core.plots[reservation.plotId]?.code ?? "", space: chosenPlot?.spaces.find((s) => s.spaceId === reservation.spaceId)?.label ?? "", date: reservation.start })].filter(Boolean).join(" · ")}</p>
        </section>
      )}
      <form ref={form} className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <TextField label={t("recordedName")} value={name} onChange={setName} error={errors["recordedName"]} disabled={unknown} autoComplete="off" />
        <CheckField label={t("nameUnknown")} checked={unknown} onChange={(v) => { setUnknown(v); if (v) setName(""); }} />
        {same.length === 0 ? null : (
          <section className="card stack" aria-label={t("possibleNameMatch")}>
            <h2>{t("possibleNameMatch")}</h2>
            <ul className="plain stack">
              {same.map((b) => (
                <li key={b.burialId}>{[b.recordedName, b.sourceRef, formatPartialDate(b.date)].join(" · ")}</li>
              ))}
            </ul>
          </section>
        )}
        <DateFields kind={kind} text={dateText} onKind={(k) => { setKind(k); setDateText(""); }} onText={setDateText} error={errors["burialDate"]} />
        <LocationFields plots={plots} plotId={where.plotId} spaceId={where.spaceId} onChange={setWhere} errors={errors} allowUnknown disabled={reservation !== undefined} />
        <TextField label={t("sourceRefLabel")} value={sourceRef} onChange={setSourceRef} error={errors["sourceRef"]} autoComplete="off" />
        <TextField label={t("pageLabel")} value={page} onChange={setPage} autoComplete="off" />
        <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload(), keepDraft: () => intent.setStatus({ phase: "idle" }) }} />
        <div className="actions">
          <Button primary type="submit" disabled={intent.busy}>
            {reservation === undefined ? t("saveBurial") : t("recordBurialInSpace")}
          </Button>
        </div>
      </form>
      {saved === undefined ? null : (
        <div className="actions">
          <ButtonLink href={`${base}/burial/${saved.burialId}`}>{t("openBurial")}</ButtonLink>
          <ButtonLink href={`${base}/burial/new`}>{t("recordBurial")}</ButtonLink>
        </div>
      )}
    </section>
  );
}

type CorrectionKind = "edit" | "move" | "void";

function CorrectionSection({ burial }: { burial: Burial }) {
  const { t, newId } = useShell();
  const open = useChurch();
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const plots = useMemo(() => plotChoices(open.state, open.today), [open.state, open.today]);
  const [action, setAction] = useState<CorrectionKind>("edit");
  const [name, setName] = useState(burial.recordedName ?? "");
  const [unknown, setUnknown] = useState(burial.nameUnknown);
  const start = dateFieldsOf(burial.date);
  const [kind, setKind] = useState<DateKind>(start.kind);
  const [dateText, setDateText] = useState(start.text);
  const [where, setWhere] = useState({ plotId: "", spaceId: "" });
  const [ref, setRef] = useState("");
  const [reason, setReason] = useState("");
  const [local, setLocal] = useState<Record<string, string>>({});
  const errors = { ...intent.fieldErrors, ...local };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLocal({});
    const original = findEventId(open.events, "burial_recorded", burial.burialId);
    const claimEvent = burial.claimId === undefined ? undefined : findEventId(open.events, "claim_added", burial.claimId);
    if (original === undefined) return;
    const common = { burialId: burial.burialId, correctsEventId: original, reason, correctionRef: ref };
    let command: Record<string, unknown>;
    if (action === "void") {
      command = { type: "void_burial", ...common, ...(claimEvent === undefined ? {} : { claimEventId: claimEvent }) };
    } else if (action === "move") {
      if (where.plotId === "" || where.spaceId === "" || claimEvent === undefined) {
        setLocal({ plot: t("enterField", { field: t("plotLabel") }) });
        window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
        return;
      }
      command = { type: "move_burial", ...common, spaceId: where.spaceId, claimId: newId(), claimEventId: claimEvent };
    } else {
      const parsed = parseDateField(kind, dateText);
      if (parsed === undefined) {
        setLocal({ burialDate: t("invalidDate") });
        window.setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
        return;
      }
      command = { type: "correct_burial", ...common, ...(unknown ? { nameUnknown: true } : { recordedName: name }), date: parsed.date, dateText: parsed.dateText };
      if (burial.claimId !== undefined && claimStartOf(parsed.date) !== open.state.core.claims[burial.claimId]?.start && claimEvent !== undefined) {
        command["claimId"] = newId();
        command["claimEventId"] = claimEvent;
      }
    }
    const outcome = await intent.send([command as { type: string }], { done: t("correctionSaved") });
    if (outcome.ok) {
      setRef("");
      setReason("");
    }
  };

  return (
    <section className="card stack" aria-labelledby="correct-heading">
      <h2 id="correct-heading">{t("correctionHeading")}</h2>
      <form ref={form} className="stack" onSubmit={(e) => void submit(e)} noValidate>
        <RadioGroup
          legend={t("correctionHeading")}
          name="correction"
          value={action}
          onChange={(v) => setAction(v as CorrectionKind)}
          options={[
            { value: "edit", label: t("correctNameDate") },
            ...(burial.spaceId === undefined ? [] : [{ value: "move", label: t("moveBurial") }]),
            { value: "void", label: t("voidBurial") },
          ]}
        />
        {action === "edit" ? (
          <>
            <TextField label={t("recordedName")} value={name} onChange={setName} error={errors["recordedName"]} disabled={unknown} autoComplete="off" />
            <CheckField label={t("nameUnknown")} checked={unknown} onChange={(v) => { setUnknown(v); if (v) setName(""); }} />
            <DateFields kind={kind} text={dateText} onKind={(k) => { setKind(k); setDateText(""); }} onText={setDateText} error={errors["burialDate"]} name="correct-date" />
          </>
        ) : null}
        {action === "move" ? <LocationFields plots={plots} plotId={where.plotId} spaceId={where.spaceId} onChange={setWhere} errors={errors} /> : null}
        <TextField label={t("correctionRefLabel")} value={ref} onChange={setRef} error={errors["correctionRef"]} autoComplete="off" />
        <TextArea label={t("reasonForCorrection")} value={reason} onChange={setReason} error={errors["reason"]} />
        <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
        <div className="actions">
          <Button primary type="submit" disabled={intent.busy}>
            {t("recordCorrection")}
          </Button>
        </div>
      </form>
    </section>
  );
}

export function BurialDetail({ burialId }: { burialId: string }) {
  const { t, navigate } = useShell();
  const open = useChurch();
  const base = `#/r/${open.site.id}`;
  const burial = open.state.burials[burialId];
  const plot = burial?.plotId === undefined ? undefined : open.state.core.plots[burial.plotId];
  const choice = useMemo(() => plotChoices(open.state, open.today).find((p) => p.plotId === burial?.plotId), [open.state, open.today, burial?.plotId]);
  const history = useMemo(
    () => historyOf(open.events).filter((h) => open.events.find((e) => e.eventId === h.eventId)?.entityIds.includes(burialId) === true),
    [open.events, burialId],
  );
  if (burial === undefined || burial.voided === true) return <NotFoundHere />;
  const name = burial.nameUnknown ? t("nameUnknown") : (burial.recordedName ?? "");
  const spaceLabel = choice?.spaces.find((s) => s.spaceId === burial.spaceId)?.label ?? "";
  const same = possibleMatches(open.state).some((pair) => pair.includes(burialId));
  return (
    <section className="stack">
      <h1>{t("burialRecord")}</h1>
      <p className="summary-line">{plot === undefined ? `${name} · ${t("locationToConfirm")}` : t("burialAt", { name, code: plot.code, section: choice?.sectionName ?? "" })}</p>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
        {plot === undefined ? (
          <ButtonLink href={`${base}/unplaced`}>{t("chooseLocation")}</ButtonLink>
        ) : (
          <>
            <ButtonLink href={`${base}?plot=${plot.plotId}`} onClick={(e) => keepSearch(e, () => navigate(`/r/${open.site.id}?plot=${plot.plotId}`, { search: plot.code }))}>
              {t("showOnMap")}
            </ButtonLink>
            <ButtonLink href={`${base}/plot/${plot.plotId}`}>{t("openPlot")}</ButtonLink>
          </>
        )}
      </div>
      {burial.recordedName === undefined && !burial.nameUnknown ? null : (
        <dl className="card stack">
          <div>
            <dt>{t("recordedName")}</dt>
            <dd>{name}</dd>
          </div>
          <div>
            <dt>{t("burialDate")}</dt>
            <dd>{formatPartialDate(burial.date)}</dd>
          </div>
          <div>
            <dt>{t("sectionLabel")}</dt>
            <dd>{choice?.sectionName ?? t("locationUnknown")}</dd>
          </div>
          <div>
            <dt>{t("plotLabel")}</dt>
            <dd>{plot?.code ?? t("locationUnknown")}</dd>
          </div>
          {spaceLabel === "" || (choice?.spaces.length ?? 0) < 2 ? null : (
            <div>
              <dt>{t("spaceLabel")}</dt>
              <dd>{spaceLabel}</dd>
            </div>
          )}
          <div>
            <dt>{t("sourceHeading")}</dt>
            <dd>{burial.sourceRef}</dd>
          </div>
          {burial.page === undefined ? null : (
            <div>
              <dt>{t("pageLabel")}</dt>
              <dd>{burial.page}</dd>
            </div>
          )}
        </dl>
      )}
      {same ? (
        <Notice>
          {t("possibleNameMatch")}
        </Notice>
      ) : null}
      {same ? (
        <div className="actions">
          <ButtonLink href={`${base}/unplaced`}>{t("keepSeparate")}</ButtonLink>
        </div>
      ) : null}
      <StoneSection burial={burial} />
      <CorrectionSection burial={burial} />
      <section className="card stack" aria-labelledby="history-heading">
        <h2 id="history-heading">{t("burialHistory")}</h2>
        <ul className="plain stack">
          {history.map((h) => (
            <li key={h.eventId}>
              {t("historyLine", { what: t(`event_${h.type}`), date: h.effectiveOn ?? h.recordedAt.slice(0, 10) })}
              {h.sourceRef === undefined ? "" : ` · ${t("sourceOf", { ref: h.sourceRef })}`}
              {h.corrects === undefined ? "" : ` · ${t("correctionHeading")}`}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
