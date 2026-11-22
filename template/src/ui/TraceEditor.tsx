// Trace: draw a section, a plot, a path or a gate over the plots already there, by pointing or by typing East and North.
// Beside the drawing sit the private reference plan and the two revise tools.
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { DEFAULT_BACKDROP, boundsOf, checkBackdropTransform, fromScreen, toScreen } from "../map/coordinates";
import type { BackdropTransform, Point } from "../map/coordinates";
import { EMPTY_DRAFT, draftAdd, draftClose, draftLast, draftUndo } from "../map/edit";
import type { ShapeDraft } from "../map/edit";
import { planRenumber } from "../map/generate";
import { pathCrossings } from "../map/geometry";
import { buildSheet } from "../map/sheet";
import { normalizeCode } from "../plot";
import { browserCodec, normalizeImage } from "../data/images";
import { Button, ButtonLink, CheckField, RadioGroup, SelectField, TextField, focusFirstInvalid } from "./controls";
import { useBlobUrl } from "./blobUrl";
import { Dialog } from "./Dialog";
import { commitMessage, errorMessage } from "./messages";
import type { MessageContext } from "./messages";
import { plotRows } from "./plotView";
import { useRegister, useShell } from "./shellContext";
import type { AnyCommand, RunOutcome } from "./shellContext";
import { DraftOffer, useScreenDraft } from "./screenDraft";
import { SheetSvg } from "./SiteMap";
import { useElementWidth } from "./SiteMap";
import { Status } from "./Status";
import type { StatusState } from "./Status";

type Target = "section" | "plot" | "path" | "gate";
const TARGETS: readonly Target[] = ["section", "plot", "path", "gate"];

function targetOf(value: string | null): Target {
  return TARGETS.includes(value as Target) ? (value as Target) : "section";
}

const whole = (text: string): number | undefined => (/^-?\d{1,9}$/.test(text.trim()) ? Number(text.trim()) : undefined);

/** The points of a drawing as plain text, "east,north;east,north", for a draft. */
const pointsToText = (points: readonly (readonly [number, number])[]): string => points.map((p) => `${p[0]},${p[1]}`).join(";");

/** The points of a draft. A part that is not two whole numbers is left out. */
function pointsFromText(text: string | undefined): Point[] {
  const points: Point[] = [];
  for (const part of (text ?? "").split(";")) {
    const [a, b, ...rest] = part.split(",");
    const e = whole(a ?? "");
    const n = whole(b ?? "");
    if (e !== undefined && n !== undefined && rest.length === 0) points.push([e, n]);
  }
  return points;
}

/** The natural size of an image, once it has loaded. */
function useImageSize(url: string | undefined): { width: number; height: number } | undefined {
  const [size, setSize] = useState<{ width: number; height: number }>();
  useEffect(() => {
    setSize(undefined);
    if (url === undefined) return;
    let current = true;
    const image = new Image();
    image.onload = () => {
      if (current) setSize({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.src = url;
    return () => {
      current = false;
    };
  }, [url]);
  return size;
}

export function TraceEditor() {
  const { t, newId, route } = useShell();
  const open = useRegister();
  const base = `#/r/${open.site.id}`;
  const backdrop = open.state.map.backdrop;

  const [target, setTarget] = useState<Target>(targetOf(route.query.get("target")));
  const kept = useScreenDraft("trace_edit");
  const [name, setName] = useState("");
  const [plotId, setPlotId] = useState("");
  const [east, setEast] = useState("");
  const [north, setNorth] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ east?: string; north?: string; name?: string; plot?: string }>({});
  const [draft, setDraft] = useState<ShapeDraft>(EMPTY_DRAFT);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [status, setStatus] = useState<StatusState>({ phase: "idle" });
  const [busy, setBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const form = useRef<HTMLElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const width = useElementWidth(holder);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const opId = useRef<string | undefined>(undefined);

  const rows = useMemo(() => plotRows(open, t), [open, t]);
  const context: MessageContext = {
    sectionName: (id) => open.state.map.sections[id]?.name,
    shape: target === "path" ? "path" : "polygon",
  };

  // The reference plan, as typed numbers. They show at once and are kept when a field is left.
  const stored = backdrop?.transform ?? DEFAULT_BACKDROP;
  const [typed, setTyped] = useState<Record<keyof BackdropTransform, string>>({
    scale: String(stored.scale),
    east: String(stored.east),
    north: String(stored.north),
    turn: String(stored.turn),
    opacity: String(stored.opacity),
  });
  const lastQueued = useRef<string>(JSON.stringify(stored));
  useEffect(() => {
    const now = backdrop?.transform ?? DEFAULT_BACKDROP;
    setTyped({ scale: String(now.scale), east: String(now.east), north: String(now.north), turn: String(now.turn), opacity: String(now.opacity) });
    lastQueued.current = JSON.stringify(now);
  }, [backdrop?.blobId]);

  const typedTransform = (): BackdropTransform | undefined => {
    const parts = { scale: whole(typed.scale), east: whole(typed.east), north: whole(typed.north), turn: whole(typed.turn), opacity: whole(typed.opacity) };
    if (Object.values(parts).some((v) => v === undefined)) return undefined;
    const checked = checkBackdropTransform(parts as BackdropTransform);
    return checked.ok ? checked.value : undefined;
  };
  const shownTransform = typedTransform() ?? stored;
  const imageUrl = useBlobUrl(open.site.id, backdrop?.blobId);
  const imageSize = useImageSize(imageUrl);

  const sheet = useMemo(() => {
    const content: Point[] = [];
    for (const r of rows) for (const p of open.state.map.shapes[r.plot.plotId] ?? []) content.push(p);
    for (const s of Object.values(open.state.map.sections)) for (const p of s.outline ?? []) content.push(p);
    for (const p of Object.values(open.state.map.paths)) for (const q of p.points) content.push(q);
    for (const p of draft.points) content.push(p);
    const bounds = boundsOf(content);
    const map = backdrop === undefined ? open.state.map : { ...open.state.map, backdrop: { ...backdrop, transform: shownTransform } };
    return buildSheet(
      {
        map,
        plots: rows.map((r) => ({ plotId: r.plot.plotId, code: r.plot.code, mark: { ...(r.summary.primary === undefined ? {} : { state: r.summary.primary }), needsChecking: r.summary.needsChecking } })),
      },
      { width, showBackdrop: true, ...(imageSize === undefined ? {} : { imageSize }), ...(bounds === undefined ? {} : { bounds }) },
    );
  }, [open.state.map, rows, draft, width, backdrop, shownTransform, imageSize]);

  const enqueue = (job: () => Promise<void>) => {
    chain.current = chain.current.then(job, job);
  };

  const finish = (outcome: RunOutcome, done: string): boolean => {
    setBusy(false);
    if (outcome.ok) {
      opId.current = undefined;
      void kept.discard();
      setStatus({ phase: "saved", text: done });
      return true;
    }
    const text = outcome.error !== undefined ? errorMessage(t, outcome.error, context) : commitMessage(t, outcome.commit ?? { code: "storage_abort" });
    setStatus({ phase: "error", code: outcome.commit?.code ?? outcome.code, text });
    return false;
  };

  // ---- the drawing -----------------------------------------------------------------

  const resetDraft = () => {
    setDraft(EMPTY_DRAFT);
    setReady(false);
    setMessage(undefined);
  };

  const addPointAt = (point: readonly [number, number]) => {
    setStatus({ phase: "idle" });
    setMessage(undefined);
    setReady(false);
    if (target === "gate") {
      setDraft({ points: [[point[0], point[1]]] });
      return;
    }
    const next = draftAdd(draft, point);
    if (!next.ok) {
      setMessage(errorMessage(t, next.error, context));
      return;
    }
    setDraft(next.value);
  };

  const addTyped = () => {
    const e = whole(east);
    const n = whole(north);
    const errors: { east?: string; north?: string } = {};
    if (e === undefined) errors.east = t("pointOutOfRange");
    if (n === undefined) errors.north = t("pointOutOfRange");
    if (e === undefined || n === undefined) {
      setFieldErrors(errors);
      window.setTimeout(() => focusFirstInvalid(form.current), 0);
      return;
    }
    setFieldErrors({});
    const next = target === "gate" ? undefined : draftAdd(draft, [e, n]);
    if (next !== undefined && !next.ok) {
      const bad = next.error.code === "bad_coordinate";
      if (bad) {
        setFieldErrors({ east: t("pointOutOfRange") });
        window.setTimeout(() => focusFirstInvalid(form.current), 0);
      } else setMessage(errorMessage(t, next.error, context));
      return;
    }
    addPointAt([e, n]);
  };

  const onSurface = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const site = fromScreen([event.clientX - rect.left, event.clientY - rect.top], sheet.view);
    if (!site.ok) return;
    setEast(String(site.value[0]));
    setNorth(String(site.value[1]));
    addPointAt(site.value);
  };

  const undo = () => {
    setStatus({ phase: "idle" });
    setMessage(undefined);
    setReady(false);
    setDraft((d) => draftUndo(d));
  };

  const close = () => {
    setStatus({ phase: "idle" });
    const shape = target === "path" ? "path" : "polygon";
    const closed = draftClose(draft, shape);
    if (!closed.ok) {
      setReady(false);
      setMessage(errorMessage(t, closed.error, context));
      return;
    }
    if (target === "path") {
      const shapes = rows.flatMap((r) => {
        const points = open.state.map.shapes[r.plot.plotId];
        return points === undefined ? [] : [{ id: r.plot.code, points }];
      });
      const crossed = pathCrossings(closed.value, shapes);
      if (crossed.length > 0) {
        setReady(false);
        setMessage(t("pathCrosses", { code: crossed[0] ?? "" }));
        return;
      }
    }
    setMessage(undefined);
    setReady(true);
  };

  const save = async () => {
    if (busy) return;
    const label = name.trim();
    const needsName = target === "section" || target === "path" || target === "gate";
    if (needsName && label === "") {
      setFieldErrors({ name: t("enterField", { field: t("name") }) });
      window.setTimeout(() => focusFirstInvalid(form.current), 0);
      return;
    }
    if (target === "plot" && plotId === "") {
      setFieldErrors({ plot: t("enterField", { field: t("plot") }) });
      window.setTimeout(() => focusFirstInvalid(form.current), 0);
      return;
    }
    setFieldErrors({});
    let command: AnyCommand;
    if (target === "gate") {
      const at = draftLast(draft);
      if (at === undefined) {
        setMessage(t("noPointsYet"));
        return;
      }
      command = { type: "layout_apply", gate: { name: label, at } };
    } else {
      const closed = draftClose(draft, target === "path" ? "path" : "polygon");
      if (!closed.ok) {
        setMessage(errorMessage(t, closed.error, context));
        return;
      }
      if (target === "path") command = { type: "layout_apply", paths: [{ pathId: newId(), name: label, points: closed.value }] };
      else if (target === "plot") command = { type: "layout_apply", moves: [{ plotId, footprint: closed.value }] };
      else {
        const same = Object.values(open.state.map.sections).find((s) => normalizeCode(s.name) === normalizeCode(label));
        command = { type: "layout_apply", sections: [{ sectionId: same?.sectionId ?? newId(), name: same?.name ?? label, outline: closed.value }] };
      }
    }
    setBusy(true);
    setStatus({ phase: "saving" });
    opId.current ??= newId();
    const outcome = await open.run([command], { opId: opId.current });
    if (finish(outcome, t("mapSaved"))) {
      resetDraft();
      setName("");
      setEast("");
      setNorth("");
    }
  };

  // ---- the reference plan ----------------------------------------------------------

  const chooseImage = async (file: File | undefined) => {
    if (file === undefined || busy) return;
    setBusy(true);
    setStatus({ phase: "working", text: t("readingImage") });
    const normalized = await normalizeImage(new Uint8Array(await file.arrayBuffer()), browserCodec);
    if (!normalized.ok) {
      setBusy(false);
      setStatus({ phase: "error", code: normalized.error.code, text: errorMessage(t, normalized.error) });
      return;
    }
    const image = normalized.value;
    const blobId = newId();
    setStatus({ phase: "saving" });
    const outcome = await open.run([{ type: "set_backdrop", blobId, transform: { ...DEFAULT_BACKDROP } }], {
      blobs: [{ id: blobId, type: `image/${image.imageType}`, bytes: image.bytes }],
    });
    if (outcome.ok) finish(outcome, t("saved"));
    else if (outcome.commit?.code === "quota") {
      setBusy(false);
      setStatus({ phase: "error", code: "quota", text: `${t("photoQuota")} ${t("chooseSmallerImage")}.` });
    } else finish(outcome, t("saved"));
  };

  const changeBackdrop = (patch: { transform?: BackdropTransform; locked?: boolean; hidden?: boolean }) => {
    enqueue(async () => {
      setStatus({ phase: "saving" });
      finish(await open.run([{ type: "change_backdrop", ...patch }]), t("saved"));
    });
  };

  const leaveField = () => {
    if (backdrop === undefined || backdrop.locked) return;
    const next = typedTransform();
    if (next === undefined) {
      setStatus({ phase: "error", code: "bad_value", text: t("badNumber", { field: t("referencePlan") }) });
      return;
    }
    if (JSON.stringify(next) !== lastQueued.current) {
      lastQueued.current = JSON.stringify(next);
      changeBackdrop({ transform: next });
    }
  };

  const lock = () => {
    const next = typedTransform();
    if (next === undefined) {
      setStatus({ phase: "error", code: "bad_value", text: t("badNumber", { field: t("referencePlan") }) });
      return;
    }
    const same = JSON.stringify(next) === lastQueued.current;
    lastQueued.current = JSON.stringify(next);
    changeBackdrop({ ...(same ? {} : { transform: next }), locked: true });
  };

  const removeImage = () => {
    enqueue(async () => {
      setStatus({ phase: "saving" });
      finish(await open.run([{ type: "remove_backdrop" }]), t("saved"));
    });
  };

  const locked = backdrop?.locked === true;
  const typedField = (key: keyof BackdropTransform, label: string) => (
    <TextField
      label={label}
      value={typed[key]}
      disabled={locked}
      inputMode="numeric"
      onChange={(v) => setTyped((s) => ({ ...s, [key]: v }))}
      onBlur={leaveField}
    />
  );

  const last = draftLast(draft);
  const readyText = target === "path" ? t("pathReady") : t("shapeReady");

  return (
    <section className="stack" ref={form}>
      <h1>{t("tracingHeading")}</h1>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
        <ButtonLink href={`${base}/map`}>{t("backToMap")}</ButtonLink>
        <ButtonLink href={`${base}/map/edit`}>{t("mapSetup")}</ButtonLink>
      </div>

      <RadioGroup
        legend={t("chooseTarget")}
        name="target"
        value={target}
        onChange={(v) => {
          setTarget(targetOf(v));
          resetDraft();
          setFieldErrors({});
        }}
        options={[
          { value: "section", label: t("traceSection") },
          { value: "plot", label: t("tracePlot") },
          { value: "path", label: t("addPath") },
          { value: "gate", label: t("addGate") },
        ]}
      />

      {target === "plot" ? (
        <SelectField
          label={t("plot")}
          value={plotId}
          error={fieldErrors.plot}
          onChange={(v) => setPlotId(v)}
          options={[{ value: "", label: t("noPlotChosen") }, ...rows.map((r) => ({ value: r.plot.plotId, label: r.line }))]}
        />
      ) : (
        <TextField label={t("name")} value={name} error={fieldErrors.name} onChange={setName} autoComplete="off" />
      )}

      <div ref={holder} className="sheet-scroll trace" role="region" aria-label={t("tracingHeading")}>
        <SheetSvg
          model={sheet}
          label={t("drawingSurface")}
          {...(imageUrl === undefined || backdrop === undefined ? {} : { image: { href: imageUrl } })}
          onSurface={onSurface}
          extra={
            draft.points.length === 0 ? null : (
              <g className="draft">
                {draft.points.length < 2 ? null : (
                  <polyline className="draft-line" points={draft.points.map((p) => toScreen(p, sheet.view).join(",")).join(" ")} />
                )}
                {draft.points.map((p, i) => {
                  const [x, y] = toScreen(p, sheet.view);
                  return <circle key={`${i}-${p[0]}-${p[1]}`} className="draft-point" cx={x} cy={y} r={5} />;
                })}
              </g>
            )
          }
        />
      </div>

      <div className="stack">
        <h2>{t("pointsHeading")}</h2>
        <TextField label={t("east")} value={east} error={fieldErrors.east} onChange={setEast} inputMode="numeric" />
        <TextField label={t("north")} value={north} error={fieldErrors.north} onChange={setNorth} inputMode="numeric" />
        <div className="actions">
          <Button onClick={addTyped}>{t("addPoint")}</Button>
        </div>
        <p aria-live="polite">{last === undefined ? t("noPointsYet") : t("lastPoint", { east: last[0], north: last[1] })}</p>
        {draft.points.length === 0 ? null : <p>{t("pointCount", { count: draft.points.length })}</p>}
        {message === undefined ? null : (
          <p className="notice error" role="alert">
            {message}
          </p>
        )}
        {ready ? (
          <p className="notice good" role="status">
            {readyText}
          </p>
        ) : null}
        <div className="actions">
          <Button onClick={undo} disabled={draft.points.length === 0}>
            {t("undoPoint")}
          </Button>
          {target === "section" || target === "plot" ? <Button onClick={close}>{t("closeShape")}</Button> : null}
          {target === "path" ? <Button onClick={close}>{t("finishPath")}</Button> : null}
          {target === "gate" ? (
            <Button primary onClick={() => void save()} disabled={busy || draft.points.length === 0}>
              {t("addGate")}
            </Button>
          ) : (
            <Button primary onClick={() => void save()} disabled={busy || !ready}>
              {t("saveMap")}
            </Button>
          )}
        </div>
        <Status
          status={status}
          actions={{
            tryAgain: () => setStatus({ phase: "idle" }),
            openLatest: () => void open.reload(),
            keepEditing: () => setStatus({ phase: "idle" }),
            ...kept.actions(() => ({ target, name, plotId, east, north, points: pointsToText(draft.points) }), setStatus),
          }}
        />
        <DraftOffer
          draft={kept}
          onResume={(saved) => {
            setTarget(targetOf(saved["target"] ?? null));
            setName(saved["name"] ?? "");
            setPlotId(saved["plotId"] ?? "");
            setEast(saved["east"] ?? "");
            setNorth(saved["north"] ?? "");
            setDraft({ points: pointsFromText(saved["points"]) });
            setReady(false);
          }}
        />
      </div>

      <section className="stack" aria-label={t("referencePlan")}>
        <h2>{t("referencePlan")}</h2>
        <p className="hint">{t("imageStays")}</p>
        {backdrop === undefined ? (
          <div className="field">
            <label htmlFor="plan-file">{t("chooseImage")}</label>
            <input
              id="plan-file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                void chooseImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        ) : (
          <>
            {typedField("scale", t("scale"))}
            {typedField("east", t("moveEast"))}
            {typedField("north", t("moveNorth"))}
            {typedField("turn", t("turn"))}
            {typedField("opacity", t("opacity"))}
            {locked ? <p className="hint">{t("imageLocked")}</p> : null}
            {backdrop.hidden ? <p className="hint">{t("imageHidden")}</p> : null}
            <div className="actions">
              {locked ? (
                <Button onClick={() => changeBackdrop({ locked: false })}>{t("unlockImage")}</Button>
              ) : (
                <Button onClick={lock}>{t("lockImage")}</Button>
              )}
              {backdrop.hidden ? (
                <Button onClick={() => changeBackdrop({ hidden: false })}>{t("showImage")}</Button>
              ) : (
                <Button onClick={() => changeBackdrop({ hidden: true })}>{t("hideImage")}</Button>
              )}
              <Button onClick={removeImage}>{t("removeImage")}</Button>
            </div>
          </>
        )}
      </section>

      <section className="stack" aria-label={t("reviseHeading")}>
        <h2>{t("reviseHeading")}</h2>
        <div className="actions">
          <Button onClick={() => setRenameOpen(true)}>{t("renamePlots")}</Button>
          <Button onClick={() => setEmptyOpen(true)}>{t("confirmEmptyPlots")}</Button>
        </div>
      </section>

      <RenameDialog open={renameOpen} onClose={() => setRenameOpen(false)} />
      <EmptyDialog open={emptyOpen} onClose={() => setEmptyOpen(false)} />
    </section>
  );
}

/** Give the plots of one section new codes in their present order. Nothing is written until Confirm change. */
function RenameDialog({ open: shown, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useShell();
  const reg = useRegister();
  const sections = Object.values(reg.state.map.sections).sort((a, b) => a.displayOrder - b.displayOrder);
  const [sectionId, setSectionId] = useState("");
  const [prefix, setPrefix] = useState("");
  const [first, setFirst] = useState("1");
  const [digits, setDigits] = useState("3");
  const [error, setError] = useState<string | undefined>();
  const [status, setStatus] = useState<StatusState>({ phase: "idle" });
  const [busy, setBusy] = useState(false);
  const chosen = sectionId === "" ? sections[0]?.sectionId : sectionId;
  const plots = Object.values(reg.state.core.plots)
    .filter((p) => p.sectionId === chosen)
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }))
    .map((p) => ({ plotId: p.plotId, code: p.code }));
  const firstNumber = whole(first);
  const digitCount = whole(digits);
  const plan =
    firstNumber === undefined || digitCount === undefined ? undefined : planRenumber(plots, { prefix: prefix.trim(), firstNumber, digits: digitCount });

  const confirm = async () => {
    if (busy) return;
    if (plan === undefined || !plan.ok) {
      setError(plan !== undefined && !plan.ok ? errorMessage(t, plan.error) : t("badNumber", { field: t("firstNumber") }));
      return;
    }
    if (plan.value.length === 0) {
      setError(t("nothingToRename"));
      return;
    }
    setError(undefined);
    setBusy(true);
    setStatus({ phase: "saving" });
    const outcome = await reg.run([{ type: "renumber_plots", renames: plan.value.map((s) => ({ plotId: s.plotId, code: s.to })) }]);
    setBusy(false);
    if (outcome.ok) setStatus({ phase: "saved", text: t("plotsRenamed", { count: plan.value.length }) });
    else {
      const text = outcome.error !== undefined ? errorMessage(t, outcome.error) : commitMessage(t, outcome.commit ?? { code: "storage_abort" });
      setStatus({ phase: "error", code: outcome.commit?.code ?? outcome.code, text });
    }
  };

  return (
    <Dialog open={shown} title={t("renamePlots")} onClose={onClose}>
      <div className="stack">
        <SelectField
          label={t("section")}
          value={chosen ?? ""}
          onChange={setSectionId}
          options={sections.map((s) => ({ value: s.sectionId, label: s.name }))}
        />
        <TextField label={t("prefix")} value={prefix} onChange={setPrefix} autoComplete="off" />
        <TextField label={t("firstNumber")} value={first} onChange={setFirst} inputMode="numeric" />
        <TextField label={t("digits")} value={digits} onChange={setDigits} inputMode="numeric" />
        {error === undefined ? null : (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <h3>{t("renamePreview")}</h3>
        {plan === undefined || !plan.ok || plan.value.length === 0 ? (
          <p>{t("nothingToRename")}</p>
        ) : (
          <ul>
            {plan.value.slice(0, 20).map((s) => (
              <li key={s.plotId}>{t("renameLine", { from: s.from, to: s.to })}</li>
            ))}
          </ul>
        )}
        <Status status={status} />
        <div className="actions">
          <Button primary onClick={() => void confirm()} disabled={busy}>
            {t("confirmChange")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Confirm that plots which have not been checked are empty. One command for the plots chosen. */
function EmptyDialog({ open: shown, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useShell();
  const reg = useRegister();
  const rows = useMemo(() => plotRows(reg, t).filter((r) => r.summary.needsChecking), [reg, t]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<StatusState>({ phase: "idle" });
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (busy || chosen.size === 0) return;
    const spaceIds = rows.filter((r) => chosen.has(r.plot.plotId)).flatMap((r) => r.plot.spaces.filter((s) => !s.retired).map((s) => s.spaceId));
    setBusy(true);
    setStatus({ phase: "saving" });
    const outcome = await reg.run([{ type: "confirm_empty", spaceIds }]);
    setBusy(false);
    if (outcome.ok) {
      setStatus({ phase: "saved", text: t("emptyChecked", { count: chosen.size }) });
      setChosen(new Set());
    } else {
      const text = outcome.error !== undefined ? errorMessage(t, outcome.error) : commitMessage(t, outcome.commit ?? { code: "storage_abort" });
      setStatus({ phase: "error", code: outcome.commit?.code ?? outcome.code, text });
    }
  };

  return (
    <Dialog open={shown} title={t("confirmEmptyPlots")} onClose={onClose}>
      <div className="stack">
        {rows.length === 0 ? (
          <p>{t("noUncheckedPlots")}</p>
        ) : (
          <>
            <p>{t("confirmEmptyHint")}</p>
            <div className="actions">
              <Button onClick={() => setChosen(new Set(rows.map((r) => r.plot.plotId)))}>{t("chooseAll")}</Button>
              <Button onClick={() => setChosen(new Set())}>{t("chooseNone")}</Button>
            </div>
            <ul className="plain checklist">
              {rows.map((r) => (
                <li key={r.plot.plotId}>
                  <CheckField
                    label={r.plot.code}
                    checked={chosen.has(r.plot.plotId)}
                    onChange={(on) =>
                      setChosen((c) => {
                        const next = new Set(c);
                        if (on) next.add(r.plot.plotId);
                        else next.delete(r.plot.plotId);
                        return next;
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </>
        )}
        <Status status={status} />
        {rows.length === 0 ? null : (
          <div className="actions">
            <Button primary onClick={() => void confirm()} disabled={busy || chosen.size === 0}>
              {t("confirmChange")}
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
