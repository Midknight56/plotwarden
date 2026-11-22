// Map setup: generate rows of plots, or bring in a finished layout. Nothing is written until Apply.
import { useRef, useState } from "react";
import { planGrid, parseSkips, gridCommand } from "../map/generate";
import type { ExistingPlot, GridPlan, GridSpec } from "../map/generate";
import { buildLayoutFile, LAYOUT_FILENAME, layoutFileText, parseLayoutFile, planLayoutImport } from "../map/layoutFile";
import type { LayoutConflict } from "../map/layoutFile";
import type { LayoutCommand } from "../map/edit";
import { normalizeCode } from "../plot";
import type { DomainError } from "../types";
import { Button, ButtonLink, CheckField, Notice, RadioGroup, TextField, focusFirstInvalid } from "./controls";
import { downloadText } from "./download";
import { commitMessage, errorMessage } from "./messages";
import type { MessageContext } from "./messages";
import { useRegister, useShell } from "./shellContext";
import { Status } from "./Status";
import type { StatusState } from "./Status";

interface Fields {
  section: string;
  prefix: string;
  first: string;
  digits: string;
  rows: string;
  columns: string;
  width: string;
  height: string;
  east: string;
  north: string;
  rowSpacing: string;
  columnSpacing: string;
  rotation: string;
  skip: string;
  numbering: "across" | "down";
  startRow: "north" | "south";
  startColumn: "west" | "east";
  reverse: boolean;
}

const INITIAL: Fields = {
  section: "",
  prefix: "",
  first: "1",
  digits: "3",
  rows: "",
  columns: "",
  width: "",
  height: "",
  east: "0",
  north: "0",
  rowSpacing: "0",
  columnSpacing: "0",
  rotation: "0",
  skip: "",
  numbering: "across",
  startRow: "north",
  startColumn: "west",
  reverse: false,
};

type FieldKey = keyof Fields;

const whole = (text: string): number | undefined => (/^-?\d{1,9}$/.test(text.trim()) ? Number(text.trim()) : undefined);

interface Pending {
  source: "grid" | "file";
  command: LayoutCommand;
  count: number;
  first?: string | undefined;
  last?: string | undefined;
  retained: number;
  moves: { plotId: string; code: string }[];
  collisions: { code: string; sectionName?: string | undefined }[];
  skipped: number;
}

export function MapEditor() {
  const { t, newId } = useShell();
  const open = useRegister();
  const base = `#/r/${open.site.id}`;
  const [fields, setFields] = useState<Fields>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [pending, setPending] = useState<Pending | undefined>();
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [none, setNone] = useState(false);
  const [status, setStatus] = useState<StatusState>({ phase: "idle" });
  const [added, setAdded] = useState<number | undefined>();
  const [fileMessages, setFileMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const opId = useRef<string | undefined>(undefined);
  const gridParts = useRef<{ plan: GridPlan; section: { sectionId: string; name: string } } | undefined>(undefined);

  const set = <K extends FieldKey>(key: K, value: Fields[K]) => {
    setFields((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (e[key] === undefined) return e;
      const { [key]: _gone, ...rest } = e;
      return rest;
    });
  };

  const context: MessageContext = {
    sectionName: (id) => open.state.map.sections[id]?.name,
  };

  const fail = (found: Partial<Record<FieldKey, string>>) => {
    setErrors(found);
    window.setTimeout(() => focusFirstInvalid(form.current), 0);
  };

  const preview = () => {
    setStatus({ phase: "idle" });
    setAdded(undefined);
    setFileMessages([]);
    setNone(false);
    const found: Partial<Record<FieldKey, string>> = {};
    const badNumber = (key: FieldKey, label: string) => {
      found[key] = t("badNumber", { field: label });
    };
    const need = (key: FieldKey, label: string, min: number, max: number): number => {
      const n = whole(fields[key] as string);
      if (n === undefined || n < min || n > max) {
        badNumber(key, label);
        return 0;
      }
      return n;
    };
    if (fields.section.trim() === "") found.section = t("enterField", { field: t("sectionName") });
    const firstNumber = need("first", t("firstNumber"), 0, 999_999_999);
    const digits = need("digits", t("digits"), 0, 12);
    const rows = need("rows", t("rows"), 1, 10_000);
    const columns = need("columns", t("columns"), 1, 10_000);
    const cellWidth = need("width", t("plotWidth"), 1, 10_000);
    const cellHeight = need("height", t("plotHeight"), 1, 10_000);
    const east = need("east", t("startEast"), 0, 10_000);
    const north = need("north", t("startNorth"), 0, 10_000);
    const rowSpacing = need("rowSpacing", t("rowSpacing"), 0, 10_000);
    const columnSpacing = need("columnSpacing", t("columnSpacing"), 0, 10_000);
    const rotation = need("rotation", t("rotation"), -359, 359);
    if (Object.keys(found).length > 0) {
      fail(found);
      return;
    }
    const skips = parseSkips(fields.skip, rows, columns);
    if (!skips.ok) {
      fail({ skip: errorMessage(t, skips.error, context) });
      return;
    }
    const spec: GridSpec = {
      prefix: fields.prefix.trim(),
      firstNumber,
      digits,
      rows,
      columns,
      origin: [east, north],
      cellWidth,
      cellHeight,
      columnSpacing,
      rowSpacing,
      numbering: fields.numbering,
      startRow: fields.startRow,
      startColumn: fields.startColumn,
      reverseAlternate: fields.reverse,
      rotation,
      skip: skips.value,
    };
    const name = fields.section.trim();
    const sameName = Object.values(open.state.map.sections).find((s) => normalizeCode(s.name) === normalizeCode(name));
    const section = { sectionId: sameName?.sectionId ?? newId(), name: sameName?.name ?? name };
    const existing: ExistingPlot[] = Object.values(open.state.core.plots).map((p) => {
      const entry: ExistingPlot = { plotId: p.plotId, code: p.code, priorCodes: p.priorCodes };
      if (p.sectionId !== undefined) {
        entry.sectionId = p.sectionId;
        const sn = open.state.map.sections[p.sectionId]?.name;
        if (sn !== undefined) entry.sectionName = sn;
      }
      const shape = open.state.map.shapes[p.plotId];
      if (shape !== undefined) entry.footprint = shape;
      return entry;
    });
    const planned = planGrid(spec, section, existing);
    if (!planned.ok) {
      setPending(undefined);
      const field = planned.error.detail?.["item"];
      const key: FieldKey | undefined = field === "firstNumber" ? "first" : undefined;
      if (key !== undefined) fail({ [key]: errorMessage(t, planned.error, context) });
      else setStatus({ phase: "error", code: planned.error.code, text: errorMessage(t, planned.error, context) });
      return;
    }
    const plan = planned.value;
    gridParts.current = { plan, section };
    setApproved(new Set());
    const codeOf = (id: string) => open.state.core.plots[id]?.code ?? id;
    const next: Pending = {
      source: "grid",
      command: gridCommand(plan, section, newId),
      count: plan.added.length,
      first: plan.first,
      last: plan.last,
      retained: plan.retained.length,
      moves: plan.moved.map((m) => ({ plotId: m.plotId, code: codeOf(m.plotId) })),
      collisions: plan.collisions.map((c) => ({ code: c.code, sectionName: c.sectionName })),
      skipped: plan.skipped.length,
    };
    setPending(next);
    setNone(plan.added.length === 0 && plan.moved.length === 0 && plan.collisions.length === 0);
  };

  const conflictText = (c: LayoutConflict): string => {
    switch (c.rule) {
      case "footprint_differs":
        return t("conflictFootprint", { code: c.code ?? "" });
      case "code_in_other_section":
        return c.section === undefined ? t("conflictCodeNoSection", { code: c.code ?? "" }) : t("conflictCodeOther", { code: c.code ?? "", section: c.section });
      case "outline_differs":
        return t("conflictOutline", { name: c.name ?? "" });
      case "gate_differs":
        return t("conflictGate", { name: c.name ?? "" });
      case "north_differs":
        return t("conflictNorth");
      default:
        return t("conflictPath", { name: c.name ?? "" });
    }
  };

  const readFile = async (file: File | undefined) => {
    setStatus({ phase: "idle" });
    setAdded(undefined);
    setPending(undefined);
    setNone(false);
    setFileMessages([]);
    if (file === undefined) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      setFileMessages([t("notLayoutFile")]);
      return;
    }
    const parsed = parseLayoutFile(text);
    if (!parsed.ok) {
      setFileMessages([parsed.error.code === "newer_version" ? t("needsNewerVersion") : t("notLayoutFile")]);
      return;
    }
    const plan = planLayoutImport(parsed.value, open.state, newId);
    if (plan.conflicts.length > 0) {
      setFileMessages([t("layoutBlocked"), ...plan.conflicts.map(conflictText)]);
      return;
    }
    if (plan.command === undefined) {
      setNone(true);
      return;
    }
    opId.current = undefined;
    setPending({
      source: "file",
      command: plan.command,
      count: plan.addedPlots,
      retained: plan.retainedPlots,
      moves: [],
      collisions: [],
      skipped: 0,
    });
  };

  const apply = async () => {
    if (pending === undefined || busy) return;
    let command = pending.command;
    if (pending.source === "grid" && gridParts.current !== undefined) {
      command = gridCommand(gridParts.current.plan, gridParts.current.section, newId, [...approved]);
      // Reuse the IDs of the preview, so a repeated press is the same operation.
      command = pending.command.type === "layout_apply" && command.type === "layout_apply" ? { ...command, plots: pending.command.plots, moves: command.moves } : command;
    }
    setBusy(true);
    setStatus({ phase: "saving" });
    opId.current ??= newId();
    const outcome = await open.run([command], { opId: opId.current });
    setBusy(false);
    if (outcome.ok) {
      opId.current = undefined;
      setStatus({ phase: "saved", text: t("mapSaved") });
      setAdded(pending.count);
      setPending(undefined);
      gridParts.current = undefined;
      setFields((f) => ({ ...f }));
      return;
    }
    const text = outcome.error !== undefined ? errorMessage(t, outcome.error as DomainError, context) : commitMessage(t, outcome.commit ?? { code: "storage_abort" });
    setStatus({ phase: "error", code: outcome.commit?.code ?? outcome.code, text });
  };

  const downloadLayout = () => {
    downloadText(LAYOUT_FILENAME, layoutFileText(buildLayoutFile(open.state)), "application/json");
  };

  const sections = Object.values(open.state.map.sections).sort((a, b) => a.displayOrder - b.displayOrder);
  const err = (key: FieldKey) => errors[key];

  return (
    <section className="stack">
      <h1>{t("mapSetup")}</h1>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
        <ButtonLink href={`${base}/map`}>{t("backToMap")}</ButtonLink>
      </div>

      <Status status={status} actions={{ tryAgain: () => setStatus({ phase: "idle" }), openLatest: () => void open.reload(), keepEditing: () => setStatus({ phase: "idle" }) }} />
      {added !== undefined ? <Notice tone="good">{t("plotsAdded", { count: added })}</Notice> : null}

      <section className="stack" aria-label={t("tracingHeading")}>
        <h2>{t("tracingHeading")}</h2>
        <ul className="actions plain">
          <li>
            <ButtonLink href={`${base}/map/trace?target=section`}>{t("traceSection")}</ButtonLink>
          </li>
          <li>
            <ButtonLink href={`${base}/map/trace?target=plot`}>{t("tracePlot")}</ButtonLink>
          </li>
          <li>
            <ButtonLink href={`${base}/map/trace?target=path`}>{t("addPath")}</ButtonLink>
          </li>
          <li>
            <ButtonLink href={`${base}/map/trace?target=gate`}>{t("addGate")}</ButtonLink>
          </li>
        </ul>
      </section>

      <form
        ref={form}
        className="stack"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          preview();
        }}
      >
        <h2>{t("generateRows")}</h2>
        <TextField label={t("sectionName")} value={fields.section} onChange={(v) => set("section", v)} error={err("section")} autoComplete="off" />
        <TextField label={t("prefix")} value={fields.prefix} onChange={(v) => set("prefix", v)} autoComplete="off" />
        <TextField label={t("firstNumber")} value={fields.first} onChange={(v) => set("first", v)} error={err("first")} inputMode="numeric" />
        <TextField label={t("digits")} value={fields.digits} onChange={(v) => set("digits", v)} error={err("digits")} inputMode="numeric" />
        <TextField label={t("rows")} value={fields.rows} onChange={(v) => set("rows", v)} error={err("rows")} inputMode="numeric" />
        <TextField label={t("columns")} value={fields.columns} onChange={(v) => set("columns", v)} error={err("columns")} inputMode="numeric" />
        <TextField label={t("plotWidth")} value={fields.width} onChange={(v) => set("width", v)} error={err("width")} inputMode="numeric" />
        <TextField label={t("plotHeight")} value={fields.height} onChange={(v) => set("height", v)} error={err("height")} inputMode="numeric" />
        <TextField label={t("startEast")} value={fields.east} onChange={(v) => set("east", v)} error={err("east")} inputMode="numeric" />
        <TextField label={t("startNorth")} value={fields.north} onChange={(v) => set("north", v)} error={err("north")} inputMode="numeric" />
        <TextField label={t("rowSpacing")} value={fields.rowSpacing} onChange={(v) => set("rowSpacing", v)} error={err("rowSpacing")} inputMode="numeric" />
        <TextField label={t("columnSpacing")} value={fields.columnSpacing} onChange={(v) => set("columnSpacing", v)} error={err("columnSpacing")} inputMode="numeric" />
        <TextField label={t("rotation")} value={fields.rotation} onChange={(v) => set("rotation", v)} error={err("rotation")} inputMode="numeric" />
        <TextField label={t("skipPlaces")} value={fields.skip} onChange={(v) => set("skip", v)} error={err("skip")} hint={t("skipHint")} autoComplete="off" />
        <RadioGroup
          legend={t("gridNumbering")}
          name="numbering"
          value={fields.numbering}
          onChange={(v) => set("numbering", v === "down" ? "down" : "across")}
          options={[
            { value: "across", label: t("numberAcross") },
            { value: "down", label: t("numberDown") },
          ]}
        />
        <RadioGroup
          legend={t("firstRowIs")}
          name="startRow"
          value={fields.startRow}
          onChange={(v) => set("startRow", v === "south" ? "south" : "north")}
          options={[
            { value: "north", label: t("northSide") },
            { value: "south", label: t("southSide") },
          ]}
        />
        <RadioGroup
          legend={t("firstColumnIs")}
          name="startColumn"
          value={fields.startColumn}
          onChange={(v) => set("startColumn", v === "east" ? "east" : "west")}
          options={[
            { value: "west", label: t("westSide") },
            { value: "east", label: t("eastSide") },
          ]}
        />
        <CheckField label={t("reverseAlternate")} checked={fields.reverse} onChange={(v) => set("reverse", v)} />
        <div className="actions">
          <button type="submit" className="button primary">
            {t("previewPlots")}
          </button>
        </div>
      </form>

      {pending === undefined && !none ? null : (
        <section className="stack" aria-label={t("previewHeading")}>
          <h2>{t("previewHeading")}</h2>
          {none ? <p>{t("nothingNewToAdd")}</p> : null}
          {pending === undefined ? null : (
            <>
              {pending.count > 0 ? <p>{t("plotsToAdd", { count: pending.count })}</p> : null}
              {pending.first === undefined ? null : <p>{t("firstCode", { code: pending.first })}</p>}
              {pending.last === undefined ? null : <p>{t("lastCode", { code: pending.last })}</p>}
              {pending.skipped === 0 ? null : <p>{t("skippedCount", { count: pending.skipped })}</p>}
              {pending.retained === 0 ? null : <p>{t("retainedCount", { count: pending.retained })}</p>}
              {pending.collisions.length === 0 ? null : (
                <div className="stack">
                  <h3>{t("collisionHeading")}</h3>
                  <ul>
                    {pending.collisions.map((c) => (
                      <li key={c.code}>
                        {c.sectionName === undefined ? t("conflictCodeNoSection", { code: c.code }) : t("conflictCodeOther", { code: c.code, section: c.sectionName })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {pending.moves.length === 0 ? null : (
                <div className="stack">
                  <h3>{t("moveListHeading")}</h3>
                  {pending.moves.map((m) => (
                    <CheckField
                      key={m.plotId}
                      label={`${m.code} · ${t("moveLinkedPlot")}`}
                      checked={approved.has(m.plotId)}
                      onChange={(on) =>
                        setApproved((a) => {
                          const next = new Set(a);
                          if (on) next.add(m.plotId);
                          else next.delete(m.plotId);
                          return next;
                        })
                      }
                    />
                  ))}
                </div>
              )}
              {pending.collisions.length === 0 && (pending.count > 0 || approved.size > 0) ? (
                <div className="actions">
                  <Button primary onClick={() => void apply()} disabled={busy}>
                    {t("applyLayout")}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      )}

      <section className="stack" aria-label={t("layoutFileHeading")}>
        <h2>{t("layoutFileHeading")}</h2>
        <div className="field">
          <label htmlFor="layout-file">{t("chooseLayoutFile")}</label>
          <input
            id="layout-file"
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              void readFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {fileMessages.length === 0 ? null : (
          <div className="notice error" role="alert">
            {fileMessages.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}
        <div className="actions">
          <Button onClick={downloadLayout}>{t("downloadSiteLayout")}</Button>
        </div>
      </section>

      <section className="stack" aria-label={t("sectionsHeading")}>
        <h2>{t("sectionsHeading")}</h2>
        {sections.length === 0 ? (
          <p>{t("noSectionsYet")}</p>
        ) : (
          <ul>
            {sections.map((s) => (
              <li key={s.sectionId}>{s.name}</li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
