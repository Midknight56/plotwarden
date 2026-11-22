// The secretary desk. One job, offer the next free plot, with one main action. It shows the next free plot
// and the next applicant side by side, says why anyone is passed over, and keeps the plan of the beds beside them.
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { buildSheet } from "../../../template/src/map/sheet";
import { siteTotalsAt } from "../../../template/src/status";
import { search } from "../../../template/src/search";
import type { SearchEntry, SearchName } from "../../../template/src/search";
import { Button, ButtonLink, TextField } from "../../../template/src/ui/controls";
import { plotRows } from "../../../template/src/ui/plotView";
import { useShell } from "../../../template/src/ui/shellContext";
import { MapKey, SheetSvg, useElementWidth } from "../../../template/src/ui/SiteMap";
import { allotRecords } from "./adapter";
import { useAllot } from "./intent";
import { freePlotsAt } from "./projection";
import { isOverdue, offerPlan, queueView } from "./rules";

/** A stand in plot ID for applicants, who have no plot. It is never shown. */
const WAITING = "waiting";

/** One bed as a small picture: a footprint, a strip of hatching and a peg that holds the code. */
function BedMark({ code }: { code: string }) {
  const peg = Math.max(34, code.length * 8 + 12);
  const width = Math.max(64, peg + 20);
  return (
    <svg className="bed-mark" width={width} height="52" viewBox={`0 0 ${width} 52`} aria-hidden="true" focusable="false">
      <rect className="bed" x="2" y="2" width={width - 4} height="48" />
      <path className="hatch" d={Array.from({ length: Math.floor((width - 14) / 6) }, (_, i) => `M${8 + i * 6} 13L${15 + i * 6} 6`).join("")} />
      <rect className="peg" x={(width - peg) / 2} y="26" width={peg} height="20" />
      <text x={width / 2} y="40.5" fontSize="12" textAnchor="middle">
        {code}
      </text>
    </svg>
  );
}

export function AllotmentHome() {
  const { t, route, navigate } = useShell();
  const open = useAllot();
  const base = `#/r/${open.site.id}`;
  const query = route.query.get("q") ?? "";
  const plotParam = route.query.get("plot") ?? "";
  const [text, setText] = useState(query);
  const holder = useRef<HTMLDivElement>(null);
  const width = useElementWidth(holder);
  const today = open.today;

  const rows = useMemo(() => plotRows(open, t), [open, t]);
  const totals = useMemo(() => siteTotalsAt(open.state.core, today), [open.state.core, today]);
  const free = useMemo(() => freePlotsAt(open.state, today), [open.state, today]);
  const nextPlot = free[0];
  const queue = useMemo(() => queueView(open.state), [open.state]);
  const plan = useMemo(() => (nextPlot === undefined ? undefined : offerPlan(open.state, nextPlot.plotId, "")), [nextPlot, open.state]);
  // The next applicant is the first in order whose preference fits the next free plot. Others are passed over.
  const nextRow = plan?.firstFit ?? queue.find((r) => !r.pending);
  const passedOver = nextRow === undefined ? [] : queue.filter((r) => r.position < nextRow.position);
  const overdue = Object.values(open.state.offers).filter((o) => isOverdue(o, today));
  const sectionOf = (sectionId: string | undefined): string => (sectionId === undefined ? t("noSection") : (open.state.map.sections[sectionId]?.name ?? t("noSection")));
  const ready = nextPlot !== undefined && nextRow !== undefined;

  const records = useMemo(() => allotRecords(open.state), [open.state]);
  const hits = useMemo(() => {
    if (query.trim() === "") return [];
    const byPlot = new Map<string, SearchName[]>();
    for (const r of records) byPlot.set(r.plotId ?? WAITING, [...(byPlot.get(r.plotId ?? WAITING) ?? []), r.name]);
    const entries: SearchEntry[] = rows.map(({ plot }) => ({ siteId: open.site.id, plotId: plot.plotId, code: plot.code, priorCodes: plot.priorCodes, names: byPlot.get(plot.plotId) ?? [] }));
    const nobody = byPlot.get(WAITING);
    if (nobody !== undefined) entries.push({ siteId: open.site.id, plotId: WAITING, code: "", priorCodes: [], names: nobody });
    return search(entries, open.site.id, query);
  }, [query, records, rows, open.site.id]);

  const selectedId = plotParam;
  const selected = rows.find((r) => r.plot.plotId === selectedId);
  const sheet = useMemo(
    () =>
      buildSheet(
        {
          map: open.state.map,
          plots: rows.map((r) => ({ plotId: r.plot.plotId, code: r.plot.code, mark: { ...(r.summary.primary === undefined ? {} : { state: r.summary.primary }), needsChecking: r.summary.needsChecking } })),
          ...(selectedId === "" ? {} : { selectedPlotId: selectedId }),
        },
        { width, zoom: 1 },
      ),
    [open.state.map, rows, selectedId, width],
  );

  const go = (q: string) => navigate(`/r/${open.site.id}${q === "" ? "" : `?q=${encodeURIComponent(q)}`}`);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    go(text.trim());
  };
  const empty = rows.length === 0 && queue.length === 0;
  const reasonOf = (r: (typeof queue)[number]): string => {
    if (r.pending) return t("reasonPending");
    return t("reasonPreference");
  };

  return (
    <section className="stack">
      <h1>{open.site.title}</h1>
      <p className="lead">{t("deskLead")}</p>
      <div className="actions">
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
            <ButtonLink href={`${base}/waiting`}>{t("addApplicant")}</ButtonLink>
            <ButtonLink href={`${base}/add/import`}>{t("importSpreadsheet")}</ButtonLink>
          </div>
        </section>
      ) : null}

      <div className="hero">
        <section className="card hero-card" aria-labelledby="next-plot-heading">
          <h2 id="next-plot-heading">{t("nextFreePlot")}</h2>
          {nextPlot === undefined ? (
            <>
              <p className="big">{t("noFreePlot")}</p>
              <p className="hint">{t("noFreePlotHint")}</p>
            </>
          ) : (
            <div className="hero-body">
              <BedMark code={nextPlot.code} />
              <p className="big">{nextPlot.code}</p>
              <p>{t("summaryLine", { code: nextPlot.code, section: sectionOf(nextPlot.sectionId), state: t("stateFree") })}</p>
            </div>
          )}
        </section>
        <section className="card hero-card" aria-labelledby="next-applicant-heading">
          <h2 id="next-applicant-heading">{t("nextApplicant")}</h2>
          {nextRow === undefined ? (
            <>
              <p className="big">{t("noOneWaiting")}</p>
              <p className="hint">{t("noApplicantHint")}</p>
            </>
          ) : (
            <>
              <p className="big">{nextRow.name}</p>
              <p>{t("joinedOn", { date: nextRow.joinedOn })}</p>
              {passedOver.length === 0 ? (
                <p className="hint">{t("firstInOrder")}</p>
              ) : (
                <ul className="plain stack" aria-label={t("skippedNotice")}>
                  {passedOver.map((r) => (
                    <li key={r.applicationId}>{`${r.name} · ${reasonOf(r)}`}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      <div className="actions main-action">
        {ready ? (
          <ButtonLink href={`${base}/offer?plot=${nextPlot.plotId}`} primary>
            {t("makeOffer")}
          </ButtonLink>
        ) : (
          <Button primary disabled>
            {t("makeOffer")}
          </Button>
        )}
      </div>
      {overdue.length === 0 ? null : (
        <p className="notice error" role="alert">
          {t("replyOverdue")} · {overdue.map((o) => open.state.core.plots[o.plotId]?.code).join(", ")}{" "}
          <a href={`${base}/offer`}>{t("openOffers")}</a>
        </p>
      )}

      <div className="garden-desk">
        <div className="stack">
          <nav aria-label={t("deskAtAGlance")}>
            <ul className="counts plain" aria-label={t("deskAtAGlance")}>
              <li>{t("freeCount", { count: totals.plots.byPrimary.free })}</li>
              <li>{t("reservedCount", { count: totals.plots.byPrimary.reserved })}</li>
              <li>{t("takenCount", { count: totals.plots.byPrimary.taken })}</li>
              <li>{t("unusableCount", { count: totals.plots.byPrimary.unusable })}</li>
            </ul>
          </nav>
          <nav aria-label={t("searchThisRegister")}>
            <ul className="actions plain">
              <li>
                <ButtonLink href={`${base}/waiting`}>{queue.length === 0 ? t("waitingList") : `${t("waitingList")} · ${queue.length}`}</ButtonLink>
              </li>
              <li>
                <ButtonLink href={`${base}/tenancy`}>{t("currentTenancies")}</ButtonLink>
              </li>
              <li>
                <ButtonLink href={`${base}/payments`}>{t("seasonFees")}</ButtonLink>
              </li>
              <li>
                <ButtonLink href={`${base}/seeker`}>{t("makeAvailabilityMap")}</ButtonLink>
              </li>
              <li>
                <ButtonLink href={`${base}/report`}>{t("reportsLink")}</ButtonLink>
              </li>
            </ul>
          </nav>
          <nav aria-label={t("mainNavigation")}>
            <ul className="actions plain">
              <li>
                <ButtonLink href={`${base}/map`}>{t("mapLink")}</ButtonLink>
              </li>
              <li>
                <ButtonLink href={`${base}/list`}>{t("plotListLink")}</ButtonLink>
              </li>
              <li>
                <ButtonLink href={`${base}/add`}>{t("addRecords")}</ButtonLink>
              </li>
              <li>
                <ButtonLink href={`${base}/backup`}>{t("backUp")}</ButtonLink>
              </li>
            </ul>
          </nav>

          <section className="stack" aria-labelledby="find-heading">
            <h2 id="find-heading">{t("searchHeading")}</h2>
            <form className="stack" role="search" aria-label={t("searchThisRegister")} onSubmit={submit}>
              <TextField label={t("nameOrCode")} value={text} onChange={setText} autoComplete="off" />
              <div className="actions">
                <Button primary={false} type="submit">
                  {t("search")}
                </Button>
                {query === "" ? null : (
                  <Button
                    onClick={() => {
                      setText("");
                      go("");
                    }}
                  >
                    {t("clearSearch")}
                  </Button>
                )}
              </div>
            </form>
            {query.trim() === "" ? (
              <p>{t("searchPrompt")}</p>
            ) : hits.length === 0 ? (
              <p>{t("noMatchesFor", { query })}</p>
            ) : (
              <div className="stack">
                <h3>{t("resultsHeading")}</h3>
                <p>{hits.length === 1 ? t("foundOne") : t("foundMany", { count: hits.length })}</p>
                <ul className="cards plain">
                  {hits.map((hit, i) => {
                    const waiting = hit.plotId === WAITING;
                    const row = rows.find((r) => r.plot.plotId === hit.plotId);
                    return (
                      <li key={`${hit.plotId}-${hit.recordId ?? i}`} className="card">
                        <p>
                          <strong>{waiting ? `${hit.display ?? ""} · ${t("waitingFor")}` : hit.display === undefined ? t("plotTitle", { code: hit.code }) : t("tenantOf", { code: hit.code }) + ` · ${hit.display}`}</strong>
                        </p>
                        {waiting || row === undefined ? null : <p>{row.line}</p>}
                        {hit.via === "priorCode" ? <p>{t("wasCode", { code: hit.matchedText })}</p> : null}
                        {hit.via === "sourceRef" ? <p>{t("sourceOf", { ref: hit.matchedText })}</p> : null}
                        <div className="actions">
                          {waiting ? <ButtonLink href={`${base}/waiting`}>{t("waitingList")}</ButtonLink> : <ButtonLink href={`${base}/plot/${hit.plotId}`}>{t("openPlot")}</ButtonLink>}
                          {waiting ? null : <ButtonLink href={`${base}?q=${encodeURIComponent(query)}&plot=${hit.plotId}`}>{t("showOnMap")}</ButtonLink>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>

        <div className="stack">
          <h2 id="plan-heading">{t("deskPlan")}</h2>
          {selected === undefined ? null : (
            <p className="summary-line" aria-live="polite">
              {t("summaryLine", { code: selected.plot.code, section: selected.sectionName ?? t("noSection"), state: selected.stateText })}
            </p>
          )}
          <div ref={holder} className="sheet-scroll" role="region" aria-label={t("siteMap")} tabIndex={0}>
            {sheet.empty ? <p className="lead">{t("noMapYet")}</p> : <SheetSvg model={sheet} label={t("mapDescription")} />}
          </div>
          <MapKey />
        </div>
      </div>
    </section>
  );
}

/** Under the heading of a plot: who holds it, its offers and the ways to act on it. */
export function AllotPlotExtras({ plotId }: { plotId: string }) {
  const { t } = useShell();
  const open = useAllot();
  const base = `#/r/${open.site.id}`;
  const plot = open.state.core.plots[plotId];
  const tenancies = Object.values(open.state.tenancies)
    .filter((x) => x.plotId === plotId)
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  const offers = Object.values(open.state.offers).filter((o) => o.plotId === plotId && o.state === "open");
  const isFree = freePlotsAt(open.state, open.today).some((p) => p.plotId === plotId);
  const nameOf = (personId: string) => open.state.people[personId]?.displayName ?? "";
  return (
    <section className="card stack" aria-labelledby="allot-plot-heading">
      <h2 id="allot-plot-heading">{t("currentTenancies")}</h2>
      {tenancies.length === 0 && offers.length === 0 ? <p>{t("noTenancies")}</p> : null}
      <ul className="plain stack">
        {tenancies.map((x) => (
          <li key={x.tenancyId} className="stack">
            <span>{`${nameOf(x.personId)} · ${x.endExclusive === undefined ? t("tenancySpan", { start: x.start }) : t("tenancySpanTo", { start: x.start, end: x.endExclusive })}${x.sourceRef === undefined ? "" : ` · ${t("sourceOf", { ref: x.sourceRef })}`}`}</span>
            {x.endExclusive === undefined ? (
              <div className="actions">
                <ButtonLink href={`${base}/handover/${x.tenancyId}`}>{`${t("handOverPlot")}: ${plot?.code ?? ""}`}</ButtonLink>
              </div>
            ) : null}
          </li>
        ))}
        {offers.map((o) => (
          <li key={o.offerId}>{t("offerSummary", { plot: plot?.code ?? "", name: nameOf(open.state.applications[o.applicationId]?.personId ?? "") })}</li>
        ))}
      </ul>
      <div className="actions">
        {isFree ? <ButtonLink href={`${base}/offer?plot=${plotId}`}>{t("makeOffer")}</ButtonLink> : null}
        <ButtonLink href={`${base}/tenancy`}>{t("recordTenancy")}</ButtonLink>
      </div>
    </section>
  );
}
