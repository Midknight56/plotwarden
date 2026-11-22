// One plot: its spaces and state, history, notes, photos, previous codes, rename and the status actions.
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { intervalCovers, localDateOf } from "../calendar";
import { browserCodec, normalizeImage } from "../data/images";
import { historyOf } from "../events";
import { livePhotos } from "../notes";
import { claimInterval, spaceStateAt } from "../status";
import type { Claim } from "../types";
import { Button, ButtonLink, CheckField, SelectField, TextArea, TextField, focusFirstInvalid } from "./controls";
import { useBlobUrl } from "./blobUrl";
import { Dialog } from "./Dialog";
import { commitMessage, errorMessage } from "./messages";
import { plotRows, sectionNameOf } from "./plotView";
import { useRegister, useShell } from "./shellContext";
import type { AnyCommand, RunOutcome } from "./shellContext";
import { Status } from "./Status";
import type { StatusState } from "./Status";
import { DraftOffer, useScreenDraft } from "./screenDraft";
import { stateWord } from "./copy";

const EVENT_KEYS: Readonly<Record<string, string>> = {
  plot_added: "eventPlotAdded",
  plot_renamed: "eventPlotRenamed",
  space_retired: "eventSpaceRetired",
  spaces_confirmed_empty: "eventSpacesConfirmed",
  claim_added: "eventClaimAdded",
  claim_ended: "eventClaimEnded",
  claim_voided: "eventClaimVoided",
  section_added: "eventSectionAdded",
  section_changed: "eventSectionChanged",
  shapes_set: "eventShapesSet",
  shape_moved: "eventShapeMoved",
  path_set: "eventPathSet",
  gate_set: "eventGateSet",
  north_set: "eventNorthSet",
  backdrop_set: "eventBackdropSet",
  backdrop_changed: "eventBackdropChanged",
  backdrop_removed: "eventBackdropRemoved",
  note_added: "eventNoteAdded",
  photo_added: "eventPhotoAdded",
  photo_removed: "eventPhotoRemoved",
};

/** The words for an event. An app may name its own events with `event_{type}` in its catalog. */
function eventWord(t: (key: string) => string, type: string): string {
  const shared = EVENT_KEYS[type];
  if (shared !== undefined) return t(shared);
  const own = `event_${type}`;
  const text = t(own);
  return text === own ? t("eventOther") : text;
}

function PhotoImage({ blobId, alt }: { blobId: string; alt: string }) {
  const open = useRegister();
  const url = useBlobUrl(open.site.id, blobId);
  return url === undefined ? null : <img className="photo" src={url} alt={alt} />;
}

type Action = "check" | "free" | "unusable" | "return";

export function PlotDetails({ plotId }: { plotId: string }) {
  const { t, newId, app } = useShell();
  const open = useRegister();
  const base = `#/r/${open.site.id}`;
  const plot = open.state.core.plots[plotId];
  const row = useMemo(() => plotRows(open, t).find((r) => r.plot.plotId === plotId), [open, t, plotId]);

  const [status, setStatus] = useState<StatusState>({ phase: "idle" });
  const [action, setAction] = useState<Action | undefined>();
  const [spaceId, setSpaceId] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(open.today);
  const [fieldError, setFieldError] = useState<{ field: string; text: string } | undefined>();
  const [needsCorrection, setNeedsCorrection] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [claimChoice, setClaimChoice] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [newCode, setNewCode] = useState("");
  const [note, setNote] = useState("");
  const [photoFile, setPhotoFile] = useState<File | undefined>();
  const [caption, setCaption] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLDivElement>(null);
  const opId = useRef<string | undefined>(undefined);
  const kept = useScreenDraft(`plot:${plotId}`);

  /** What was typed, as plain text, for a draft. A chosen photo file is not kept: it must be chosen again. */
  const typedText = (): Record<string, string> => ({ action: action ?? "", spaceId, reason, date, claimChoice, correctionReason, newCode, note, caption });
  const restoreTyped = (saved: Record<string, string>) => {
    const picked = (["check", "free", "unusable", "return"] as const).find((a) => a === saved["action"]);
    setAction(picked);
    setSpaceId(saved["spaceId"] ?? "");
    setReason(saved["reason"] ?? "");
    setDate(saved["date"] ?? open.today);
    setClaimChoice(saved["claimChoice"] ?? "");
    setCorrectionReason(saved["correctionReason"] ?? "");
    setNewCode(saved["newCode"] ?? "");
    setNote(saved["note"] ?? "");
    setCaption(saved["caption"] ?? "");
  };
  if (plot === undefined || row === undefined) {
    return (
      <section className="stack">
        <h1>{t("pageNotFound")}</h1>
        <div className="actions">
          <ButtonLink href={`${base}/list`}>{t("backToPlotList")}</ButtonLink>
        </div>
      </section>
    );
  }

  const spaces = plot.spaces.filter((s) => !s.retired);
  const chosenSpace = spaceId === "" ? (spaces[0]?.spaceId ?? "") : spaceId;
  const claims = Object.values(open.state.core.claims).filter((c) => spaces.some((s) => s.spaceId === c.spaceId));
  const context = {
    sectionName: (id: string) => open.state.map.sections[id]?.name,
    plotSectionName: (id: string) => {
      const owner = open.state.core.plots[id];
      return owner === undefined ? undefined : sectionNameOf(open, owner);
    },
  };

  const finish = (outcome: RunOutcome, done: string, field?: string) => {
    setBusy(false);
    if (outcome.ok) {
      opId.current = undefined;
      void kept.discard();
      setStatus({ phase: "saved", text: done });
      return true;
    }
    const text = outcome.error !== undefined ? errorMessage(t, outcome.error, context) : commitMessage(t, outcome.commit ?? { code: "storage_abort" });
    // A rule's error that sits on a field is said once, on the field. A failure of the save itself (another tab saved
    // first, or the write failed) is not about a field, so it goes where its buttons are.
    const onField = field !== undefined && outcome.commit === undefined;
    setStatus(onField ? { phase: "idle" } : { phase: "error", code: outcome.commit?.code ?? outcome.code, text });
    setNeedsCorrection(outcome.code === "taken_needs_correction");
    if (onField) {
      setFieldError({ field, text });
      window.setTimeout(() => focusFirstInvalid(form.current), 0);
    }
    return false;
  };

  const history = historyOf(open.events).filter((h) => {
    const event = open.events.find((e) => e.eventId === h.eventId);
    if (event === undefined) return false;
    const payload = event.payload as { plotId?: unknown } | undefined;
    return event.entityIds.includes(plotId) || spaces.some((s) => event.entityIds.includes(s.spaceId)) || payload?.plotId === plotId;
  });

  const confirm = async () => {
    if (busy || action === undefined) return;
    const needsReason = action === "free" || action === "unusable";
    if (needsReason && reason.trim() === "") {
      const text = t("enterField", { field: t("reason") });
      setFieldError({ field: "reason", text });
      window.setTimeout(() => focusFirstInvalid(form.current), 0);
      return;
    }
    setFieldError(undefined);
    setNeedsCorrection(false);
    const covers = (c: Claim) => c.voided !== true && c.spaceId === chosenSpace && intervalCovers(claimInterval(c), date);
    let command: AnyCommand;
    if (action === "check") {
      command = { type: "confirm_empty", spaceIds: [chosenSpace] };
    } else if (action === "unusable") {
      command = { type: "add_claim", claimId: newId(), spaceId: chosenSpace, mode: "unusable", start: date, endable: true, reason: reason.trim() };
    } else if (action === "return") {
      const claim = claims.find((c) => covers(c) && c.mode === "unusable");
      if (claim === undefined) {
        setStatus({ phase: "error", code: "none", text: t("alreadyFree") });
        return;
      }
      command = { type: "return_to_use", claimId: claim.claimId };
    } else {
      const claim = claims.find((c) => covers(c) && c.mode !== "unusable");
      if (claim === undefined) {
        setStatus({ phase: "error", code: "none", text: t("alreadyFree") });
        return;
      }
      command = { type: "end_claim", claimId: claim.claimId, reason: reason.trim() };
    }
    setBusy(true);
    setStatus({ phase: "saving" });
    opId.current ??= newId();
    const outcome = await open.run([command], { on: date, opId: opId.current });
    if (finish(outcome, t("statusChanged"))) {
      setAction(undefined);
      setReason("");
    }
  };

  const correct = async () => {
    if (busy) return;
    const claim = claims.find((c) => c.claimId === (claimChoice === "" ? claims[0]?.claimId : claimChoice));
    if (claim === undefined) return;
    if (correctionReason.trim() === "") {
      setFieldError({ field: "correction", text: t("enterField", { field: t("reasonForCorrection") }) });
      return;
    }
    const added = open.events.find((e) => e.type === "claim_added" && (e.payload as { claim?: { claimId?: string } }).claim?.claimId === claim.claimId);
    if (added === undefined) return;
    setBusy(true);
    setStatus({ phase: "saving" });
    const outcome = await open.run([{ type: "void_claim", claimId: claim.claimId, correctsEventId: added.eventId, reason: correctionReason.trim() }]);
    if (finish(outcome, t("entryCorrected"))) {
      setCorrecting(false);
      setCorrectionReason("");
      setNeedsCorrection(false);
    }
  };

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (newCode.trim() === "") {
      const text = t("enterField", { field: t("newPlotCode") });
      setFieldError({ field: "code", text });
      window.setTimeout(() => focusFirstInvalid(form.current), 0);
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    setStatus({ phase: "saving" });
    const outcome = await open.run([{ type: "rename_plot", plotId, code: newCode.trim() }]);
    if (finish(outcome, t("plotRenamed"), "code")) setNewCode("");
  };

  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (note.trim() === "") {
      setFieldError({ field: "note", text: t("enterField", { field: t("noteLabel") }) });
      window.setTimeout(() => focusFirstInvalid(form.current), 0);
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    setStatus({ phase: "saving" });
    const outcome = await open.run([{ type: "add_note", noteId: newId(), plotId, text: note }]);
    if (finish(outcome, t("noteAdded"), "note")) setNote("");
  };

  const addPhoto = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (photoFile === undefined) {
      setFieldError({ field: "photo", text: t("enterField", { field: t("choosePhoto") }) });
      window.setTimeout(() => focusFirstInvalid(form.current), 0);
      return;
    }
    if (!pending && caption.trim() === "") {
      setFieldError({ field: "caption", text: t("enterField", { field: t("description") }) });
      window.setTimeout(() => focusFirstInvalid(form.current), 0);
      return;
    }
    setFieldError(undefined);
    setBusy(true);
    setStatus({ phase: "working", text: t("readingImage") });
    const normalized = await normalizeImage(new Uint8Array(await photoFile.arrayBuffer()), browserCodec);
    if (!normalized.ok) {
      setBusy(false);
      setStatus({ phase: "error", code: normalized.error.code, text: errorMessage(t, normalized.error) });
      return;
    }
    const blobId = newId();
    const image = normalized.value;
    setStatus({ phase: "saving" });
    const outcome = await open.run(
      [
        {
          type: "add_photo",
          photoId: newId(),
          plotId,
          blobId,
          imageType: image.imageType,
          width: image.width,
          height: image.height,
          bytes: image.bytes.length,
          caption: pending ? { pending: true } : { text: caption.trim() },
        },
      ],
      { blobs: [{ id: blobId, type: `image/${image.imageType === "jpeg" ? "jpeg" : image.imageType}`, bytes: image.bytes }] },
    );
    if (outcome.ok) {
      setPhotoFile(undefined);
      setCaption("");
      setPending(false);
      const input = document.querySelector<HTMLInputElement>('input[type="file"][data-photo]');
      if (input !== null) input.value = "";
      finish(outcome, t("photoAdded"));
    } else if (outcome.commit?.code === "quota") {
      setBusy(false);
      setStatus({ phase: "error", code: "quota", text: `${t("photoQuota")} ${t("chooseSmallerImage")}.` });
    } else {
      finish(outcome, t("photoAdded"));
    }
  };

  const removePhoto = async (photoId: string) => {
    if (busy) return;
    setBusy(true);
    setStatus({ phase: "saving" });
    finish(await open.run([{ type: "remove_photo", photoId, plotId }]), t("photoRemoved"));
  };

  const notes = open.state.notes[plotId]?.notes ?? [];
  const photos = livePhotos(open.state.notes, plotId);
  const errorFor = (field: string) => (fieldError?.field === field ? fieldError.text : undefined);

  return (
    <section className="stack" ref={form}>
      <h1>{t("plotTitle", { code: plot.code })}</h1>
      <p>{row.line}</p>
      <div className="actions">
        <ButtonLink href={`${base}/list?plot=${plotId}`}>{t("backToPlotList")}</ButtonLink>
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
        <ButtonLink href={`${base}/map?plot=${plotId}`}>{t("showOnMap")}</ButtonLink>
      </div>
      {app.plotExtras === undefined ? null : <app.plotExtras plotId={plotId} />}
      <Status
        status={status}
        actions={{
          tryAgain: () => setStatus({ phase: "idle" }),
          keepEditing: () => setStatus({ phase: "idle" }),
          openLatest: () => void open.reload(),
          ...kept.actions(typedText, setStatus),
        }}
      />
      <DraftOffer draft={kept} onResume={restoreTyped} />
      {needsCorrection ? (
        <div className="actions">
          <Button onClick={() => setCorrecting(true)}>{t("correctAnEntry")}</Button>
        </div>
      ) : null}

      <section className="card stack" aria-labelledby="codes-heading">
        <h2 id="codes-heading">{t("previousCodes")}</h2>
        {plot.priorCodes.length === 0 ? (
          <p>{t("noPreviousCodes")}</p>
        ) : (
          <ul className="plain">
            {plot.priorCodes.map((c) => (
              <li key={c}>{t("wasCode", { code: c })}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack" aria-labelledby="spaces-heading">
        <h2 id="spaces-heading">{t("spaces")}</h2>
        <ul className="plain stack">
          {spaces.map((s) => {
            const view = spaceStateAt(open.state.core, s.spaceId, open.today);
            return (
              <li key={s.spaceId}>
                {t("spaceLine", { label: s.label, state: view?.state === undefined ? t("needsChecking") : stateWord(view.state) })}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card stack" aria-labelledby="status-heading">
        <h2 id="status-heading">{t("physicalStatus")}</h2>
        {spaces.length > 1 ? (
          <SelectField label={t("chooseSpace")} value={chosenSpace} onChange={setSpaceId} options={spaces.map((s) => ({ value: s.spaceId, label: s.label }))} />
        ) : null}
        <div className="actions">
          <Button aria-pressed={action === "check"} onClick={() => setAction("check")}>
            {t("checkPlot")}
          </Button>
          <Button aria-pressed={action === "free"} onClick={() => setAction("free")}>
            {t("markFree")}
          </Button>
          <Button aria-pressed={action === "unusable"} onClick={() => setAction("unusable")}>
            {t("markUnusable")}
          </Button>
          <Button aria-pressed={action === "return"} onClick={() => setAction("return")}>
            {t("returnToUse")}
          </Button>
        </div>
        {action === undefined ? null : (
          <div className="stack">
            <TextArea label={t("reason")} value={reason} onChange={setReason} error={errorFor("reason")} name="reason" />
            <TextField label={t("effectiveDate")} type="date" value={date} onChange={setDate} />
            <div className="actions">
              <Button primary onClick={() => void confirm()} disabled={busy}>
                {t("confirmChange")}
              </Button>
              <Button onClick={() => setAction(undefined)}>{t("cancel")}</Button>
            </div>
          </div>
        )}
        {claims.length === 0 ? null : (
          <div className="actions">
            <Button onClick={() => setCorrecting(true)}>{t("correctAnEntry")}</Button>
          </div>
        )}
      </section>

      <Dialog open={correcting} title={t("correctAnEntry")} onClose={() => setCorrecting(false)}>
        <p>{t("correctionHint")}</p>
        <SelectField
          label={t("chooseEntry")}
          value={claimChoice === "" ? (claims[0]?.claimId ?? "") : claimChoice}
          onChange={setClaimChoice}
          options={claims.map((c) => ({ value: c.claimId, label: `${t(c.mode === "taken" ? "stateTaken" : c.mode === "held" ? "stateReserved" : "stateUnusable")} · ${c.sourceRef ?? c.start ?? c.claimId.slice(0, 8)}` }))}
        />
        <TextArea label={t("reasonForCorrection")} value={correctionReason} onChange={setCorrectionReason} error={errorFor("correction")} />
        <div className="actions">
          <Button primary onClick={() => void correct()} disabled={busy}>
            {t("recordCorrection")}
          </Button>
        </div>
      </Dialog>

      <section className="card stack" aria-labelledby="rename-heading">
        <h2 id="rename-heading">{t("renamePlot")}</h2>
        <form className="stack" onSubmit={(e) => void rename(e)} noValidate>
          <TextField label={t("newPlotCode")} value={newCode} onChange={setNewCode} error={errorFor("code")} autoComplete="off" />
          <div className="actions">
            <Button primary type="submit" disabled={busy}>
              {t("renamePlot")}
            </Button>
          </div>
        </form>
      </section>

      <section className="card stack" aria-labelledby="history-heading">
        <h2 id="history-heading">{t("history")}</h2>
        {history.length === 0 ? (
          <p>{t("noEventsYet")}</p>
        ) : (
          <ul className="plain stack">
            {history.map((h) => {
              const event = open.events.find((e) => e.eventId === h.eventId);
              const when = h.effectiveOn ?? localDateOf(h.recordedAt, open.site.zone);
              const ref = h.sourceRef === undefined ? "" : ` · ${t("sourceOf", { ref: h.sourceRef })}`;
              return (
                <li key={h.eventId}>
                  {t("historyLine", { what: eventWord(t, event?.type ?? ""), date: when })}
                  {ref}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card stack" aria-labelledby="notes-heading">
        <h2 id="notes-heading">{t("notes")}</h2>
        {notes.length === 0 ? (
          <p>{t("noNotes")}</p>
        ) : (
          <ul className="plain stack">
            {notes.map((n) => (
              <li key={n.noteId} className="note-text">
                {n.text}
              </li>
            ))}
          </ul>
        )}
        <form className="stack" onSubmit={(e) => void addNote(e)} noValidate>
          <TextArea label={t("noteLabel")} value={note} onChange={setNote} error={errorFor("note")} />
          <div className="actions">
            <Button primary type="submit" disabled={busy}>
              {t("addNote")}
            </Button>
          </div>
        </form>
      </section>

      <section className="card stack" aria-labelledby="photos-heading">
        <h2 id="photos-heading">{t("photos")}</h2>
        {photos.length === 0 ? (
          <p>{t("noPhotos")}</p>
        ) : (
          <ul className="plain stack">
            {photos.map((p) => (
              <li key={p.photoId} className="stack">
                <PhotoImage blobId={p.blobId} alt={"text" in p.caption ? p.caption.text : t("descriptionPending")} />
                <p>{"text" in p.caption ? p.caption.text : t("descriptionPending")}</p>
                <div className="actions">
                  <Button onClick={() => void removePhoto(p.photoId)} disabled={busy}>
                    {t("removePhoto")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form className="stack" onSubmit={(e) => void addPhoto(e)} noValidate>
          <div className="field">
            <label htmlFor="photo-file">{t("choosePhoto")}</label>
            <input
              id="photo-file"
              data-photo="true"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-invalid={errorFor("photo") === undefined ? undefined : true}
              onChange={(e) => setPhotoFile(e.target.files?.[0])}
            />
            {errorFor("photo") === undefined ? null : <p className="error" role="alert">{errorFor("photo")}</p>}
          </div>
          <TextField label={t("description")} value={caption} onChange={setCaption} error={errorFor("caption")} disabled={pending} autoComplete="off" />
          <CheckField label={t("descriptionPending")} checked={pending} onChange={setPending} />
          <div className="actions">
            <Button primary type="submit" disabled={busy}>
              {t("addPhoto")}
            </Button>
          </div>
        </form>
      </section>
    </section>
  );
}
