// The family map: the keeper chooses what a visitor sees. Each burial is approved one by one, with the name and
// the year the keeper allows. Nothing else leaves this device. The preview shows exactly what will be in the file.
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { downloadText } from "../../../template/src/ui/download";
import { Button, ButtonLink, CheckField, Notice, SelectField, TextArea, TextField } from "../../../template/src/ui/controls";
import { formatPartialDate } from "../../../template/src/ui/copy";
import { useShell } from "../../../template/src/ui/shellContext";
import { Status } from "../../../template/src/ui/Status";
import { buildFamilyHtml, visitorFileName } from "../../../template/src/output/visitorHtml";
import { buildFamilyPrint } from "../../../template/src/output/print";
import { familyWords } from "./copy";
import { plotChoices } from "./history";
import { printHtml, useIntent, useChurch } from "./intent";
import { buildFamilyFile, isStalePreview } from "./projection";
import type { FamilyBuild } from "./projection";
import { approvalStatus } from "./rules";
import type { ChurchState } from "./types";

interface Row {
  include: boolean;
  shown: string;
  year: boolean;
}

interface FormState {
  siteName: string;
  gateName: string;
  directions: string;
  sectionNames: Record<string, string>;
  pathNames: Record<string, string>;
  includePath: Record<string, boolean>;
  plotCodes: Record<string, string>;
  rows: Record<string, Row>;
}

/** What the form says for the register as it is saved. */
function fromState(state: ChurchState): FormState {
  const rows: Record<string, Row> = {};
  for (const b of Object.values(state.burials)) {
    if (b.voided === true || b.nameUnknown || b.recordedName === undefined) continue;
    const approval = state.approvals[b.burialId];
    const status = approvalStatus(state, b.burialId);
    rows[b.burialId] = { include: status !== "none", shown: approval?.name ?? b.recordedName, year: approval?.includeYear === true };
  }
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
    directions: state.pub.directions ?? "",
    sectionNames,
    pathNames,
    includePath,
    plotCodes,
    rows,
  };
}

const randomPublicId = (): string => `p${globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

const MISSING: Readonly<Record<string, string>> = { siteName: "missingSiteName", gate: "missingGate", gateName: "missingGateName" };

export function FamilySheet() {
  const { t, settings } = useShell();
  const open = useChurch();
  const base = `#/r/${open.site.id}`;
  const form = useRef<HTMLFormElement>(null);
  const intent = useIntent(form);
  const saved = useMemo(() => fromState(open.state), [open.state]);
  const [edit, setEdit] = useState<FormState>(saved);
  const [filter, setFilter] = useState("");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [preview, setPreview] = useState<FamilyBuild | undefined>();
  const [previewRevision, setPreviewRevision] = useState(-1);
  const [notice, setNotice] = useState<string | undefined>();

  const plots = useMemo(() => plotChoices(open.state, open.today), [open.state, open.today]);
  const plotOf = (plotId: string | undefined) => plots.find((p) => p.plotId === plotId);
  const dirty = JSON.stringify(edit) !== JSON.stringify(saved);
  const burials = Object.values(open.state.burials)
    .filter((b) => b.voided !== true && !b.nameUnknown && b.recordedName !== undefined)
    .filter((b) => {
      const q = filter.trim().toLowerCase();
      return q === "" || (b.recordedName ?? "").toLowerCase().includes(q) || (plotOf(b.plotId)?.code ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => (plotOf(a.plotId)?.code ?? "~").localeCompare(plotOf(b.plotId)?.code ?? "~", "en", { numeric: true }));
  const unnamed = Object.values(open.state.burials).filter((b) => b.voided !== true && b.nameUnknown).length;

  const setRow = (id: string, patch: Partial<Row>) => setEdit((e) => ({ ...e, rows: { ...e.rows, [id]: { ...(e.rows[id] as Row), ...patch } } }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setNotice(undefined);
    const commands: { type: string; [k: string]: unknown }[] = [];
    const includedPlots = new Set(Object.entries(edit.rows).filter(([, r]) => r.include).map(([id]) => open.state.burials[id]?.plotId));
    const plotCodes = Object.fromEntries(
      Object.entries(edit.plotCodes).filter(([plotId, code]) => includedPlots.has(plotId) && code.trim() !== "" && code.trim() !== open.state.core.plots[plotId]?.code),
    );
    commands.push({
      type: "set_public",
      siteName: edit.siteName,
      gateName: edit.gateName,
      directions: edit.directions,
      sectionNames: Object.fromEntries(Object.entries(edit.sectionNames).filter(([, v]) => v.trim() !== "")),
      pathNames: Object.fromEntries(Object.entries(edit.pathNames).filter(([id, v]) => edit.includePath[id] === true && v.trim() !== "")),
      plotCodes,
    });
    for (const [burialId, row] of Object.entries(edit.rows)) {
      const approval = open.state.approvals[burialId];
      const status = approvalStatus(open.state, burialId);
      const hasYear = open.state.burials[burialId]?.date.p !== "unknown";
      if (row.include) {
        const wantYear = row.year && hasYear;
        if (status !== "approved" || approval?.name !== row.shown.trim() || approval?.includeYear !== wantYear) {
          commands.push({ type: "approve_burial", burialId, ...(row.shown.trim() === "" ? {} : { name: row.shown.trim() }), includeYear: wantYear });
        }
      } else if (approval !== undefined && approval.withdrawn !== true) {
        commands.push({ type: "withdraw_approval", burialId });
      }
    }
    await intent.send(commands, { done: t("familySettingsSaved") });
  };

  const clearPublic = async () => {
    const outcome = await intent.send([{ type: "set_public", siteName: "", gateName: "", directions: "", sectionNames: {}, pathNames: {}, plotCodes: {} }], { done: t("familySettingsSaved") });
    if (outcome.ok) setPreview(undefined);
  };

  const makePreview = () => {
    setNotice(undefined);
    setPreview(buildFamilyFile(open.state, { asOf: open.today, revision: open.revision, newPublicId: randomPublicId }));
    setPreviewRevision(open.revision);
  };

  const stale = preview?.ok === true && (isStalePreview(preview.preview, open.revision) || open.stale);

  /** Build again from the latest committed state, immediately before a file or a print is made. */
  const fresh = (): Extract<FamilyBuild, { ok: true }> | undefined => {
    if (open.stale) {
      setNotice(t("previewStale"));
      return undefined;
    }
    const built = buildFamilyFile(open.state, { asOf: open.today, revision: open.revision, newPublicId: randomPublicId });
    setPreview(built);
    setPreviewRevision(open.revision);
    if (!built.ok) return undefined;
    return built;
  };

  const download = () => {
    const built = fresh();
    if (built === undefined) return;
    downloadText(visitorFileName("family", open.today), buildFamilyHtml(built.file, familyWords()), "text/html");
    setNotice(`${t("yourCopyReady")} ${t("filenameWarning")}`);
  };

  const print = () => {
    const built = fresh();
    if (built === undefined) return;
    setNotice(t("preparingPrint"));
    printHtml(buildFamilyPrint(built.file, familyWords(), { paper: settings.paper, orientation }));
    window.setTimeout(() => setNotice(t("printPreviewReady")), 0);
  };

  const gate = open.state.map.gate;
  const fieldText: Readonly<Record<string, string>> = {
    siteName: "fieldSiteName",
    gateName: "fieldGateName",
    pathNames: "fieldPathNames",
    sectionNames: "fieldSectionNames",
    plotCodes: "fieldPlotCodes",
    directions: "fieldDirections",
    names: "fieldNames",
    years: "fieldYears",
  };

  return (
    <section className="stack">
      <h1>{t("familyMap")}</h1>
      <p className="lead">{t("familyLead")}</p>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
      </div>

      <form ref={form} className="stack" onSubmit={(e) => void save(e)} noValidate>
        <TextField label={t("publicSiteName")} value={edit.siteName} onChange={(v) => setEdit((e) => ({ ...e, siteName: v }))} autoComplete="off" />

        <section className="card stack" aria-labelledby="gate-heading">
          <h2 id="gate-heading">{t("chooseGate")}</h2>
          {gate === undefined ? (
            <>
              <p>{t("missingGate")}</p>
              <div className="actions">
                <ButtonLink href={`${base}/map/edit`}>{t("editMap")}</ButtonLink>
              </div>
            </>
          ) : (
            <TextField label={t("publicGateName")} value={edit.gateName} onChange={(v) => setEdit((e) => ({ ...e, gateName: v }))} autoComplete="off" />
          )}
        </section>

        <TextArea label={t("publicDirections")} value={edit.directions} onChange={(v) => setEdit((e) => ({ ...e, directions: v }))} rows={3} />

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

        <section className="stack" aria-labelledby="burials-heading">
          <h2 id="burials-heading">{t("reportBurials")}</h2>
          <TextField label={t("nameOrCode")} value={filter} onChange={setFilter} autoComplete="off" />
          {unnamed === 0 ? null : <p className="hint">{t("nameUnknown")}: {unnamed}</p>}
          <ul className="cards plain">
            {burials.map((b) => {
              const row = edit.rows[b.burialId] ?? { include: false, shown: b.recordedName ?? "", year: false };
              const choice = plotOf(b.plotId);
              const status = approvalStatus(open.state, b.burialId);
              const label = `${t("includeBurial")}: ${b.recordedName ?? ""} · ${choice?.code ?? t("locationToConfirm")}`;
              return (
                <li key={b.burialId} className="card">
                  <CheckField label={label} checked={row.include} onChange={(v) => setRow(b.burialId, { include: v, shown: row.shown === "" ? (b.recordedName ?? "") : row.shown })} />
                  <p className="hint">{[t("sourceOf", { ref: b.sourceRef }), formatPartialDate(b.date), choice === undefined ? t("locationToConfirm") : choice.sectionName].filter((x) => x !== "").join(" · ")}</p>
                  {status === "review" ? <p className="notice info">{t("reviewAgain")}</p> : null}
                  {row.include ? (
                    <>
                      <TextField label={`${t("nameShownToVisitors")}: ${b.recordedName ?? ""}`} value={row.shown} onChange={(v) => setRow(b.burialId, { shown: v })} error={intent.fieldErrors["shownName"]} autoComplete="off" />
                      {b.date.p === "unknown" ? null : <CheckField label={`${t("includeYear")}: ${b.recordedName ?? ""}`} checked={row.year} onChange={(v) => setRow(b.burialId, { year: v })} />}
                      {choice === undefined ? null : (
                        <TextField label={`${t("publicPlotCode")}: ${choice.code}`} value={edit.plotCodes[choice.plotId] ?? choice.code} onChange={(v) => setEdit((e) => ({ ...e, plotCodes: { ...e.plotCodes, [choice.plotId]: v } }))} autoComplete="off" />
                      )}
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
        <div className="actions">
          <Button primary type="submit" disabled={intent.busy || !dirty}>
            {t("saveFamilySettings")}
          </Button>
          <Button disabled={intent.busy} onClick={() => void clearPublic()}>
            {t("clearPublicDetails")}
          </Button>
        </div>
      </form>

      <section className="card stack" aria-labelledby="preview-heading">
        <h2 id="preview-heading">{t("previewAsVisitor")}</h2>
        {dirty ? <p className="notice info">{t("saveFirst")}</p> : null}
        <div className="actions">
          <Button onClick={makePreview} disabled={dirty}>
            {t("previewAsVisitor")}
          </Button>
        </div>
        {preview === undefined ? null : preview.ok ? (
          <div className="preview-frame stack" data-revision={previewRevision}>
            {stale ? <p className="notice error" role="alert">{t("reviewPublicAgain")}</p> : null}
            <h3>{preview.preview.siteName}</h3>
            {preview.preview.noNames ? <p>{t("noNamesSelected")}</p> : (
              <ul className="plain stack" aria-label={t("willAppear")}>
                {preview.preview.included.map((i) => (
                  <li key={i.burialId}>{[i.name, i.year === undefined ? "" : String(i.year), t("summaryLine", { code: i.plotCode, section: i.sectionLabel, state: t("willAppear") })].filter((x) => x !== "").join(" · ")}</li>
                ))}
              </ul>
            )}
            {preview.preview.withheld.map((w) => (
              <p key={w.burialId}>{t("withheldLine", { code: w.plotCode, withheld: t("withheldLabel") })}</p>
            ))}
            {preview.preview.needsReview.map((r) => (
              <p key={r.burialId}>{t("needsReviewLine", { code: r.plotCode === "" ? t("locationToConfirm") : r.plotCode })}</p>
            ))}
            {preview.preview.notPlaced === 0 ? null : <p>{t("notPlacedLine", { count: preview.preview.notPlaced })}</p>}
            <h3>{t("fieldsIncluded")}</h3>
            <ul className="plain">
              {preview.preview.fields.map((f) => (
                <li key={f}>{t(fieldText[f] ?? "fieldNames")}</li>
              ))}
            </ul>
            <h3>{t("leftOut")}</h3>
            <ul className="plain">
              {preview.preview.excluded.map((e) => (
                <li key={e.category}>{t("leftOutLine", { category: t(`cat${e.category.charAt(0).toUpperCase()}${e.category.slice(1)}`), count: e.count })}</li>
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
              <Button primary onClick={download} disabled={stale === true}>
                {t("downloadFamilyCopy")}
              </Button>
              <Button onClick={print} disabled={stale === true}>
                {t("printFamilyMap")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="preview-frame stack" role="alert">
            {preview.missing.map((m) => (
              <p key={m}>{t(MISSING[m] ?? "missingSiteName")}</p>
            ))}
            {preview.flagged.map((f) => (
              <p key={f.field}>{t("flaggedField", { field: t(fieldText[f.field] ?? "fieldNames") })}</p>
            ))}
          </div>
        )}
        {notice === undefined ? null : <Notice tone="good">{notice}</Notice>}
      </section>
    </section>
  );
}
