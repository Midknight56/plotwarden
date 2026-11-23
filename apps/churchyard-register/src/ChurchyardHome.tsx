// The warden desk. One job, find a burial, with one main action. On a wide screen the search, the selected
// plot and the map sit side by side under a one line summary such as "Y07 · Yew Walk · Taken".
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { buildSheet } from "../../../template/src/map/sheet";
import { search } from "../../../template/src/search";
import type { SearchEntry, SearchName } from "../../../template/src/search";
import { Button, ButtonLink, CODE_MARK, CodeTabbed, LinkGroup, TextField, keepSearch } from "../../../template/src/ui/controls";
import { formatPartialDate } from "../../../template/src/ui/copy";
import { plotRows } from "../../../template/src/ui/plotView";
import { useShell } from "../../../template/src/ui/shellContext";
import { MapKey, SheetSvg, useElementWidth } from "../../../template/src/ui/SiteMap";
import { Status } from "../../../template/src/ui/Status";
import { churchRecords } from "./adapter";
import { reservationLine } from "./copy";
import { useIntent, useChurch } from "./intent";
import { unplacedBurials } from "./history";
import { LANTERN_EXAMPLE } from "./walkthrough";

/** A stand in plot ID for burials that have no plot. It is never shown. */
const UNPLACED = "unplaced";

/** The mark of a plot state: a small arch with the mark of its state in it. It holds no words and is hidden from a screen reader. */
function StateMark({ state, small }: { state: string | undefined; small?: boolean }) {
  if (state === undefined) return null;
  return (
    <svg className={small === true ? "mark-swatch small" : "mark-swatch"} viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
      <path className={`plot ${state}`} d="M5 25V13a9 9 0 0 1 18 0V25Z" />
      {state === "reserved" ? <line className="mark" x1="8" y1="22" x2="20" y2="10" /> : null}
      {state === "taken" ? <circle className="mark solid" cx="14" cy="17" r="4.5" /> : null}
      {state === "unusable" ? (
        <g className="mark">
          <line x1="9" y1="12" x2="19" y2="22" />
          <line x1="9" y1="22" x2="19" y2="12" />
        </g>
      ) : null}
    </svg>
  );
}

export function ChurchyardHome() {
  const { t, route, navigate } = useShell();
  const open = useChurch();
  const base = `#/r/${open.site.id}`;
  const query = route.search;
  const plotParam = route.query.get("plot") ?? "";
  const [text, setText] = useState(query);
  const holder = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const width = useElementWidth(holder);

  const rows = useMemo(() => plotRows(open, t), [open, t]);
  const records = useMemo(() => churchRecords(open.state), [open.state]);
  const lost = unplacedBurials(open.state);

  const hits = useMemo(() => {
    if (query.trim() === "") return [];
    const byPlot = new Map<string, SearchName[]>();
    for (const r of records) byPlot.set(r.plotId ?? UNPLACED, [...(byPlot.get(r.plotId ?? UNPLACED) ?? []), r.name]);
    const entries: SearchEntry[] = rows.map(({ plot }) => ({ siteId: open.site.id, plotId: plot.plotId, code: plot.code, priorCodes: plot.priorCodes, names: byPlot.get(plot.plotId) ?? [] }));
    const nowhere = byPlot.get(UNPLACED);
    if (nowhere !== undefined) entries.push({ siteId: open.site.id, plotId: UNPLACED, code: "", priorCodes: [], names: nowhere });
    return search(entries, open.site.id, query);
  }, [query, records, rows, open.site.id]);

  const rowOf = (plotId: string) => rows.find((r) => r.plot.plotId === plotId);
  // A search with one answer shows that plot at once. Otherwise the keeper chooses with "Show on map".
  const onlyHit = hits.length === 1 && hits[0] !== undefined && hits[0].plotId !== UNPLACED ? hits[0].plotId : "";
  const selectedId = plotParam !== "" ? plotParam : onlyHit;
  const selected = rowOf(selectedId);

  const sheet = useMemo(
    () =>
      buildSheet(
        {
          map: open.state.map,
          plots: rows.map((r) => ({ plotId: r.plot.plotId, code: r.plot.code, mark: { ...(r.summary.primary === undefined ? {} : { state: r.summary.primary }), needsChecking: r.summary.needsChecking } })),
          ...(selectedId === "" ? {} : { selectedPlotId: selectedId }),
        },
        // In a column of a desk the map is no taller than 320 px, so it and its key end above the fold of a laptop.
        { width, zoom: 1, ...(width >= 520 ? { maxHeight: 320 } : {}) },
      ),
    [open.state.map, rows, selectedId, width],
  );

  // After "Show on map", the selected plot's heading takes focus, so the result is announced and in view.
  useEffect(() => {
    if (plotParam !== "") heading.current?.focus({ preventScroll: false });
  }, [plotParam]);

  const go = (q: string, plot = "") => navigate(`/r/${open.site.id}${plot === "" ? "" : `?plot=${plot}`}`, q === "" ? undefined : { search: q });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    go(text.trim());
  };
  const clear = () => {
    setText("");
    go("");
  };
  // The practice register offers one search to try. A register that the keeper started never does.
  const practice = open.site.workspace === "walkthrough";
  const tryExample = () => {
    setText(LANTERN_EXAMPLE);
    go(LANTERN_EXAMPLE);
  };

  const empty = rows.length === 0 && records.length === 0;
  const burialsHere = Object.values(open.state.burials).filter((b) => b.voided !== true && b.plotId === selectedId);
  const nameOf = (b: { recordedName?: string; nameUnknown: boolean }) => (b.nameUnknown ? t("nameUnknown") : (b.recordedName ?? ""));
  const stateKey = selected?.summary.primary;

  return (
    <section className="stack">
      <div className="desk-head on-ground">
        <h1>{open.site.title}</h1>
        {selected === undefined ? (
          <p className="lead">{t("deskLead")}</p>
        ) : (
          <p className="summary-line" aria-live="polite">
            <StateMark state={stateKey} />
            <span>{t("summaryLine", { code: selected.plot.code, section: selected.sectionName ?? t("noSection"), state: selected.stateText })}</span>
          </p>
        )}
        <ButtonLink href="#/">{t("changeRegister")}</ButtonLink>
      </div>
      {route.query.get("restarted") === "1" ? <p className="notice good" role="status">{t("walkthroughRestarted")}</p> : null}
      {empty ? (
        <section className="stack card" aria-label={t("startWithMapOrRecord")}>
          <p>{t("startWithMapOrRecord")}</p>
          <div className="actions">
            <ButtonLink href={`${base}/map/edit`} primary>
              {t("addYourMap")}
            </ButtonLink>
            <ButtonLink href={`${base}/burial/new`}>{t("recordBurial")}</ButtonLink>
            <ButtonLink href={`${base}/add/import`}>{t("importSpreadsheet")}</ButtonLink>
          </div>
        </section>
      ) : null}

      <div className="desk">
        <section className="stack card desk-find" aria-labelledby="find-heading">
          <h2 id="find-heading">{t("findBurial")}</h2>
          <form className="stack" role="search" aria-label={t("searchThisRegister")} onSubmit={submit}>
            <TextField label={t("nameOrCode")} value={text} onChange={setText} autoComplete="off" />
            <div className="actions">
              <Button primary type="submit">
                {t("search")}
              </Button>
              {query === "" ? null : <Button onClick={clear}>{t("clearSearch")}</Button>}
              {practice ? (
                <Button quiet onClick={() => tryExample()}>
                  {t("tryExample", { example: LANTERN_EXAMPLE })}
                </Button>
              ) : null}
            </div>
          </form>
          <p>{t("searchScope", { site: open.site.title })}</p>
          {query.trim() === "" ? (
            <p>{t("searchPrompt")}</p>
          ) : hits.length === 0 ? (
            <div className="stack">
              <p>{t("noMatchesFor", { query })}</p>
              <div className="actions">
                <Button onClick={clear}>{t("clearFilters")}</Button>
              </div>
            </div>
          ) : (
            <div className="stack results">
              <h3>{t("resultsHeading")}</h3>
              <p>{hits.length === 1 ? t("foundOne") : t("foundMany", { count: hits.length })}</p>
              <ul className="cards plain">
                {hits.map((hit, i) => {
                  const row = rowOf(hit.plotId);
                  const nowhere = hit.plotId === UNPLACED;
                  return (
                    <li key={`${hit.plotId}-${hit.recordId ?? i}`} className="card">
                      <p>
                        <strong>{hit.display === undefined ? t("plotTitle", { code: hit.code }) : t("burialAt", { name: hit.display, code: nowhere ? t("locationToConfirm") : hit.code, section: row?.sectionName ?? t("noSection") })}</strong>
                      </p>
                      {nowhere ? (
                        <p>{t("locationToConfirm")}</p>
                      ) : (
                        <p className="state-line">
                          <StateMark state={row?.summary.primary} small />
                          <span>{row?.line}</span>
                        </p>
                      )}
                      {hit.via === "priorCode" ? <p>{t("wasCode", { code: hit.matchedText })}</p> : null}
                      {hit.via === "sourceRef" ? <p>{t("sourceOf", { ref: hit.matchedText })}</p> : null}
                      {hit.via === "name" && (hit.source !== undefined || hit.date !== undefined) ? <p>{[hit.source === undefined ? "" : t("sourceOf", { ref: hit.source }), hit.date ?? ""].filter((s) => s !== "").join(" · ")}</p> : null}
                      <div className="actions">
                        {hit.recordId === undefined ? (
                          <ButtonLink href={`${base}/plot/${hit.plotId}`}>{t("openPlot")}</ButtonLink>
                        ) : (
                          <ButtonLink href={`${base}/burial/${hit.recordId}`}>{t("openBurial")}</ButtonLink>
                        )}
                        {nowhere ? null : (
                          <ButtonLink href={`${base}?plot=${hit.plotId}`} onClick={(e) => keepSearch(e, () => go(query, hit.plotId))}>
                            {t("showOnMap")}
                          </ButtonLink>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        <div className="stack desk-main">
          <section className="stack" aria-labelledby="selected-heading">
            <div className="desk-main-head on-ground">
              <h2 id="selected-heading" ref={heading} tabIndex={-1}>
                {t("selectedPlot")}
              </h2>
              {selected === undefined ? null : (
                <div className="actions">
                  <ButtonLink href={`${base}/plot/${selected.plot.plotId}`}>{t("openPlot")}</ButtonLink>
                  <ButtonLink href={`${base}/map?plot=${selected.plot.plotId}`}>{t("siteMap")}</ButtonLink>
                </div>
              )}
            </div>
            {selected === undefined ? (
              <p className="ground-note">{t("noPlotSelected")}</p>
            ) : (
              <div className="card stack">
                <p className="state-line">
                  <StateMark state={stateKey} small />
                  <span>
                    <CodeTabbed text={t("summaryLine", { code: CODE_MARK, section: selected.sectionName ?? t("noSection"), state: selected.stateText })} code={selected.plot.code} />
                  </span>
                </p>
                {burialsHere.length === 0 ? null : (
                  <ul className="plain stack">
                    {burialsHere.map((b) => (
                      <li key={b.burialId} className="stack">
                        <span>
                          <span className="burial-name">{nameOf(b)}</span>
                          {` · ${formatPartialDate(b.date)}`}
                        </span>
                        <div className="actions">
                          <ButtonLink href={`${base}/burial/${b.burialId}`}>{t("openBurial")}</ButtonLink>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {plotParam !== "" && query !== "" ? (
                  <div className="actions">
                    <Button onClick={() => go(query)}>{t("backToResults")}</Button>
                  </div>
                ) : null}
              </div>
            )}
          </section>
          <div ref={holder} className="sheet-scroll" role="region" aria-label={t("siteMap")} tabIndex={0}>
            {sheet.empty ? <p className="lead">{t("noMapYet")}</p> : <SheetSvg model={sheet} label={t("mapDescription")} />}
          </div>
          <MapKey />
        </div>

        <div className="desk-index on-ground">
          <LinkGroup id="group-records" title={t("groupRecords")}>
            <li>
              <ButtonLink href={`${base}/burial/new`}>{t("recordBurial")}</ButtonLink>
            </li>
            <li>
              <ButtonLink href={`${base}/reserve`}>{t("reserveSpace")}</ButtonLink>
            </li>
            <li>
              <ButtonLink href={`${base}/unplaced`}>{lost.length === 0 ? t("unplacedBurials") : `${t("unplacedBurials")} · ${lost.length}`}</ButtonLink>
            </li>
            <li>
              <ButtonLink href={`${base}/add`}>{t("addRecords")}</ButtonLink>
            </li>
          </LinkGroup>
          <LinkGroup id="group-share" title={t("groupShare")}>
            <li>
              <ButtonLink href={`${base}/family`}>{t("makeFamilyMap")}</ButtonLink>
            </li>
            <li>
              <ButtonLink href={`${base}/report`}>{t("reportsLink")}</ButtonLink>
            </li>
            <li>
              <ButtonLink href={`${base}/exchange`}>{t("committeeReview")}</ButtonLink>
            </li>
          </LinkGroup>
          <LinkGroup id="group-site" title={t("groupSite")}>
            <li>
              <ButtonLink href={`${base}/map`}>{t("mapLink")}</ButtonLink>
            </li>
            <li>
              <ButtonLink href={`${base}/list`}>{t("plotListLink")}</ButtonLink>
            </li>
            <li>
              <ButtonLink href={`${base}/backup`}>{t("backUp")}</ButtonLink>
            </li>
          </LinkGroup>
        </div>
      </div>
    </section>
  );
}

/** Under the heading of a plot: its burials and reservations, and the ways to add to it. */
export function ChurchPlotExtras({ plotId }: { plotId: string }) {
  const { t, newId } = useShell();
  const open = useChurch();
  const base = `#/r/${open.site.id}`;
  const intent = useIntent();
  const [label, setLabel] = useState("");
  const burials = Object.values(open.state.burials).filter((b) => b.voided !== true && b.plotId === plotId);
  const reservations = Object.values(open.state.reservations).filter((r) => r.plotId === plotId);
  const plot = open.state.core.plots[plotId];
  const addSpace = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await intent.send([{ type: "add_space", plotId, spaceId: newId(), ...(label.trim() === "" ? {} : { label }) }], { done: t("spaceAdded") });
    if (outcome.ok) setLabel("");
  };
  return (
    <section className="card stack" aria-labelledby="church-plot-heading">
      <h2 id="church-plot-heading">{t("reportBurials")}</h2>
      {burials.length === 0 ? <p>{t("noBurialsInPlot")}</p> : null}
      <ul className="plain stack">
        {burials.map((b) => (
          <li key={b.burialId} className="stack">
            <span>
              <span className="burial-name">{b.nameUnknown ? t("nameUnknown") : (b.recordedName ?? "")}</span>
              {` · ${[formatPartialDate(b.date), t("sourceOf", { ref: b.sourceRef })].join(" · ")}`}
            </span>
            <div className="actions">
              <ButtonLink href={`${base}/burial/${b.burialId}`}>{t("openBurial")}</ButtonLink>
            </div>
          </li>
        ))}
        {reservations.map((r) => (
          <li key={r.reservationId}>
            {reservationLine(t, {
              plot: plot?.code ?? "",
              space: plot?.spaces.find((s) => s.spaceId === r.spaceId)?.label ?? "",
              ...(r.released === undefined ? {} : { released: r.released }),
            })}
          </li>
        ))}
      </ul>
      <div className="actions">
        <ButtonLink href={`${base}/burial/new?plot=${plotId}`}>{t("recordBurial")}</ButtonLink>
        <ButtonLink href={`${base}/reserve?plot=${plotId}`}>{t("reserveSpace")}</ButtonLink>
      </div>
      <form className="stack" onSubmit={(e) => void addSpace(e)} noValidate>
        <h3>{t("manageSpaces")}</h3>
        <TextField label={t("spaceLabelField")} value={label} onChange={setLabel} autoComplete="off" />
        <Status status={intent.status} actions={{ tryAgain: () => intent.setStatus({ phase: "idle" }), openLatest: () => void open.reload() }} />
        <div className="actions">
          <Button type="submit" disabled={intent.busy}>
            {t("addSpace")}
          </Button>
        </div>
      </form>
    </section>
  );
}
