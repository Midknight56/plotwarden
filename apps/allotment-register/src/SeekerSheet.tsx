// The availability map: the secretary chooses what a plot seeker sees. Free plots are chosen one by one, and the
// words are the public ones. No person, fee, queue place or reason is ever in the file. The preview shows exactly
// what will be in it, and a plot that is no longer free drops out of it when the file is made.
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { buildAvailabilityHtml, availabilityFileName } from "../../../template/src/output/availabilityHtml";
import { buildAvailabilityPrint } from "../../../template/src/output/print";
import { Button, ButtonLink, CheckField, Notice, SelectField, TextArea, TextField } from "../../../template/src/ui/controls";
import { downloadText } from "../../../template/src/ui/download";
import { useShell } from "../../../template/src/ui/shellContext";
import { Status } from "../../../template/src/ui/Status";
import { availabilityWords } from "./copy";
import { printHtml, useAllot, useIntent } from "./intent";
import { buildAvailabilityFile, freePlotsAt, isStalePreview } from "./projection";
import type { AvailabilityBuild } from "./projection";
import type { AllotState } from "./types";

interface FormState {
  siteName: string;
  gateName: string;
  instructions: string;
  sectionNames: Record<string, string>;
  pathNames: Record<string, string>;
  includePath: Record<string, boolean>;
  plotCodes: Record<string, string>;
  listed: Record<string, boolean>;
}

/** What the form says for the register as it is saved. */
function fromState(state: AllotState): FormState {
  const pathNames: Record<string, string> = {};
  const includePath: Record<string, boolean> = {};
  for (const p of Object.values(state.map.paths)) {
    pathNames[p.pathId] = state.pub.pathNames[p.pathId] ?? p.name;
    includePath[p.pathId] = state.pub.pathNames[p.pathId] !== undefined;
  }
  const sectionNames: Record<string, string> = {};
  for (const s of Object.values(state.map.sections)) sectionNames[s.sectionId] = state.pub.sectionNames[s.sectionId] ?? "";
  const plotCodes: Record<string, string> = {};
  for (const p of Object.values(state.core.plots)) plotCodes[p.plotId] = state.pub.plotCodes[p.plotId] ?? p.code;
  return {
    siteName: state.pub.siteName ?? "",
    gateName: state.pub.gateName ?? "",
    instructions: state.pub.instructions ?? "",
    sectionNames,
    pathNames,
    includePath,
    plotCodes,
    listed: Object.fromEntries(Object.keys(state.pub.listed).map((id) => [id, true])),
  };
}

const randomPublicId = (): string => `p${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

const MISSING: Readonly<Record<string, string>> = { siteName: "missingSiteName", gate: "missingGate", gateName: "missingGateName" };

const FIELD_TEXT: Readonly<Record<string, string>> = {
  siteName: "fieldSiteName",
  gateName: "fieldGateName",
  pathNames: "fieldPathNames",
  sectionNames: "fieldSectionNames",
  plotCodes: "fieldPlotCodes",
  instructions: "fieldInstructions",
  freePlots: "fieldFreePlots",
};

const CATEGORY_TEXT: Readonly<Record<string, string>> = { people: "catPeople", applicants: "catApplicants", tenancies: "catTenancies", charges: "catCharges", offers: "catOffers" };

export function SeekerSheet() {
  const { t, settings } = useShell();
  const open = useAllot();
  const base = `#/r/${open.site.id}`;
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const saved = useMemo(() => fromState(open.state), [open.state]);
  const [edit, setEdit] = useState<FormState>(saved);
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [preview, setPreview] = useState<AvailabilityBuild | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  const free = useMemo(() => freePlotsAt(open.state, open.today), [open.state, open.today]);
  // Only a chosen plot that is free counts: a plot that is not free is left out when the file is made.
  const freeIds = new Set(free.map((p) => p.plotId));
  const norm = (f: FormState) => JSON.stringify({ ...f, listed: Object.keys(f.listed).filter((id) => f.listed[id] === true && freeIds.has(id)).sort() });
  const dirty = norm(edit) !== norm(saved);
  const sectionName = (id: string | undefined) => (id === undefined ? t("noSection") : (open.state.map.sections[id]?.name ?? t("noSection")));
  const gate = open.state.map.gate;
  const notFree = Object.keys(open.state.pub.listed)
    .filter((id) => open.state.core.plots[id] !== undefined && !free.some((f) => f.plotId === id))
    .map((id) => open.state.core.plots[id]?.code ?? "");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(undefined);
    const listed = free.filter((p) => edit.listed[p.plotId] === true).map((p) => p.plotId);
    const listedSet = new Set(listed);
    const plotCodes = Object.fromEntries(Object.entries(edit.plotCodes).filter(([plotId, code]) => listedSet.has(plotId) && code.trim() !== "" && code.trim() !== open.state.core.plots[plotId]?.code));
    await intent.send(
      [
        {
          type: "set_public",
          siteName: edit.siteName,
          gateName: edit.gateName,
          instructions: edit.instructions,
          sectionNames: Object.fromEntries(Object.entries(edit.sectionNames).filter(([, v]) => v.trim() !== "")),
          pathNames: Object.fromEntries(Object.entries(edit.pathNames).filter(([id, v]) => edit.includePath[id] === true && v.trim() !== "")),
          plotCodes,
          listed,
        },
      ],
      { done: t("publicDetailsSaved") },
    );
  };

  const clearPublic = async () => {
    const outcome = await intent.send([{ type: "set_public", siteName: "", gateName: "", instructions: "", sectionNames: {}, pathNames: {}, plotCodes: {}, listed: [] }], { done: t("publicDetailsSaved") });
    if (outcome.ok) {
      // The form says what the register now says. The old values must not stay in the fields.
      setEdit(fromState({ ...open.state, pub: { sectionNames: {}, pathNames: {}, plotCodes: {}, listed: {} } }));
      setPreview(undefined);
    }
  };

  const makePreview = () => {
    setNotice(undefined);
    setPreview(buildAvailabilityFile(open.state, { asOf: open.today, revision: open.revision, newPublicId: randomPublicId }));
  };

  const stale = preview?.ok === true && (isStalePreview(preview.preview, open.revision) || open.stale);

  /** Build again from the latest committed state, immediately before a file or a print is made. */
  const fresh = (): Extract<AvailabilityBuild, { ok: true }> | undefined => {
    if (open.stale) {
      setNotice(t("previewStale"));
      return undefined;
    }
    const built = buildAvailabilityFile(open.state, { asOf: open.today, revision: open.revision, newPublicId: randomPublicId });
    setPreview(built);
    return built.ok ? built : undefined;
  };

  const download = () => {
    const built = fresh();
    if (built === undefined) return;
    downloadText(availabilityFileName(open.today), buildAvailabilityHtml(built.file, availabilityWords()), "text/html");
    setNotice(`${t("yourCopyReady")} ${t("filenameWarning")}`);
  };

  const print = () => {
    const built = fresh();
    if (built === undefined) return;
    setNotice(t("preparingPrint"));
    printHtml(buildAvailabilityPrint(built.file, availabilityWords(), { paper: settings.paper, orientation }));
    window.setTimeout(() => setNotice(t("printPreviewReady")), 0);
  };

  return (
    <section className="stack">
      <h1>{t("availabilityMap")}</h1>
      <p className="lead">{t("availabilityLead")}</p>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
      </div>

      <form ref={form} className="stack" onSubmit={(e) => void save(e)} noValidate>
        <TextField label={t("publicSiteName")} value={edit.siteName} onChange={(v) => setEdit((e) => ({ ...e, siteName: v }))} error={intent.fieldErrors["siteName"]} autoComplete="off" />

        <section className="card stack" aria-labelledby="gate-heading">
          <h2 id="gate-heading">{t("fieldGateName")}</h2>
          {gate === undefined ? (
            <>
              <p>{t("missingGate")}</p>
              <div className="actions">
                <ButtonLink href={`${base}/map/edit`}>{t("editMap")}</ButtonLink>
              </div>
            </>
          ) : (
            <TextField label={t("publicGateName")} value={edit.gateName} onChange={(v) => setEdit((e) => ({ ...e, gateName: v }))} error={intent.fieldErrors["gateName"]} autoComplete="off" />
          )}
        </section>

        <TextArea label={t("visitorInstructions")} value={edit.instructions} onChange={(v) => setEdit((e) => ({ ...e, instructions: v }))} error={intent.fieldErrors["instructions"]} rows={3} />

        {Object.values(open.state.map.paths).length === 0 ? null : (
          <section className="card stack" aria-labelledby="paths-heading">
            <h2 id="paths-heading">{t("fieldPathNames")}</h2>
            {Object.values(open.state.map.paths).map((p) => (
              <div key={p.pathId} className="stack">
                <CheckField label={`${t("includePath")}: ${p.name}`} checked={edit.includePath[p.pathId] === true} onChange={(v) => setEdit((e) => ({ ...e, includePath: { ...e.includePath, [p.pathId]: v } }))} />
                {edit.includePath[p.pathId] === true ? (
                  <TextField label={t("publicPathName")} value={edit.pathNames[p.pathId] ?? ""} onChange={(v) => setEdit((e) => ({ ...e, pathNames: { ...e.pathNames, [p.pathId]: v } }))} autoComplete="off" />
                ) : null}
              </div>
            ))}
          </section>
        )}

        {Object.values(open.state.map.sections).length === 0 ? null : (
          <section className="card stack" aria-labelledby="sections-heading">
            <h2 id="sections-heading">{t("fieldSectionNames")}</h2>
            {Object.values(open.state.map.sections).map((s) => (
              <TextField key={s.sectionId} label={`${t("publicSectionName")}: ${s.name}`} value={edit.sectionNames[s.sectionId] ?? ""} onChange={(v) => setEdit((e) => ({ ...e, sectionNames: { ...e.sectionNames, [s.sectionId]: v } }))} autoComplete="off" />
            ))}
          </section>
        )}

        <section className="stack" aria-labelledby="free-heading">
          <h2 id="free-heading">{t("chooseFreePlots")}</h2>
          {free.length === 0 ? <p>{t("noFreePlot")}</p> : null}
          <ul className="cards plain">
            {free.map((p) => (
              <li key={p.plotId} className="card">
                <CheckField label={`${t("includePlot")}: ${p.code} · ${sectionName(p.sectionId)}`} checked={edit.listed[p.plotId] === true} onChange={(v) => setEdit((e) => ({ ...e, listed: { ...e.listed, [p.plotId]: v } }))} />
                {edit.listed[p.plotId] === true ? (
                  <TextField label={`${t("publicPlotCode")}: ${p.code}`} value={edit.plotCodes[p.plotId] ?? p.code} onChange={(v) => setEdit((e) => ({ ...e, plotCodes: { ...e.plotCodes, [p.plotId]: v } }))} autoComplete="off" />
                ) : null}
              </li>
            ))}
          </ul>
          {notFree.map((code) => (
            <p key={code} className="hint">
              {t("listedNotFreeLine", { code })}
            </p>
          ))}
        </section>

        <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
        <div className="actions">
          <Button primary type="submit" disabled={intent.busy || !dirty}>
            {t("savePublicDetails")}
          </Button>
          <Button disabled={intent.busy} onClick={() => void clearPublic()}>
            {t("clearPublicDetails")}
          </Button>
        </div>
      </form>

      <section className="card stack" aria-labelledby="preview-heading">
        <h2 id="preview-heading">{t("previewAsVisitor")}</h2>
        {dirty ? <p id="save-first" className="notice info">{t("saveFirst")}</p> : null}
        <div className="actions">
          <Button onClick={makePreview} disabled={dirty} aria-describedby={dirty ? "save-first" : undefined}>
            {t("previewAsVisitor")}
          </Button>
        </div>
        {preview === undefined ? null : preview.ok ? (
          <div className="preview-frame stack" data-revision={preview.preview.revision}>
            {stale ? (
              <p className="notice error" role="alert">
                {t("reviewPublicAgain")}
              </p>
            ) : null}
            <h3>{preview.preview.siteName}</h3>
            {preview.preview.noPlots ? (
              <p>{t("noFreePlotsListed")}</p>
            ) : (
              <ul className="plain stack" aria-label={t("willAppear")}>
                {preview.preview.included.map((i) => (
                  <li key={i.plotId}>{t("summaryLine", { code: i.code, section: i.sectionLabel, state: t("willAppear") })}</li>
                ))}
              </ul>
            )}
            {preview.preview.listedNotFree.map((p) => (
              <p key={p.plotId}>{t("listedNotFreeLine", { code: p.code })}</p>
            ))}
            <p>{t("neutralLine", { count: preview.preview.neutralCount })}</p>
            <h3>{t("fieldsIncluded")}</h3>
            <ul className="plain">
              {preview.preview.fields.map((f) => (
                <li key={f}>{t(FIELD_TEXT[f] ?? "fieldFreePlots")}</li>
              ))}
            </ul>
            <h3>{t("leftOut")}</h3>
            <ul className="plain">
              {preview.preview.excluded.map((e) => (
                <li key={e.category}>{t("leftOutLine", { category: t(CATEGORY_TEXT[e.category] ?? "catPeople"), count: e.count })}</li>
              ))}
            </ul>
            <SelectField
              label={t("orientationChoice")}
              value={orientation}
              onChange={(v) => setOrientation(v === "landscape" ? "landscape" : "portrait")}
              options={[
                { value: "portrait", label: t("portrait") },
                { value: "landscape", label: t("landscape") },
              ]}
            />
            <div className="actions">
              <Button primary onClick={download} disabled={stale === true || dirty} aria-describedby={dirty ? "save-first" : undefined}>
                {t("downloadAvailabilityCopy")}
              </Button>
              <Button onClick={print} disabled={stale === true || dirty} aria-describedby={dirty ? "save-first" : undefined}>
                {t("printAvailabilityMap")}
              </Button>
              <Button onClick={() => setPreview(undefined)}>{t("cancel")}</Button>
            </div>
          </div>
        ) : (
          <div className="preview-frame stack" role="alert">
            {preview.missing.map((m) => (
              <p key={m}>{t(MISSING[m] ?? "missingSiteName")}</p>
            ))}
            {preview.flagged.map((f) => (
              <p key={f.field}>{t("flaggedField", { field: t(FIELD_TEXT[f.field] ?? "fieldFreePlots") })}</p>
            ))}
          </div>
        )}
        {notice === undefined ? null : <Notice tone="good">{notice}</Notice>}
      </section>
    </section>
  );
}
