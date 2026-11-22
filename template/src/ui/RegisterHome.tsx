// A register's home: search, the way to the map, the list, new records and the backup.
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { search } from "../search";
import type { SearchEntry, SearchName } from "../search";
import { Button, ButtonLink, Notice, TextField } from "./controls";
import { plotRows } from "./plotView";
import { useRegister, useShell } from "./shellContext";

/** A stand in plot ID for records that have no plot. It is never shown. */
const UNPLACED = "unplaced";

export function RegisterHome() {
  const { app, t, route, navigate } = useShell();
  const open = useRegister();
  const query = route.query.get("q") ?? "";
  const [text, setText] = useState(query);
  const base = `#/r/${open.site.id}`;

  const rows = useMemo(() => plotRows(open, t), [open, t]);
  const records = useMemo(() => app.records(open.state), [app, open.state]);
  const unplaced = records.filter((r) => r.plotId === undefined);

  const hits = useMemo(() => {
    if (query.trim() === "") return [];
    const byPlot = new Map<string, SearchName[]>();
    for (const r of records) {
      const key = r.plotId ?? UNPLACED;
      byPlot.set(key, [...(byPlot.get(key) ?? []), r.name]);
    }
    const entries: SearchEntry[] = rows.map(({ plot }) => ({
      siteId: open.site.id,
      plotId: plot.plotId,
      code: plot.code,
      priorCodes: plot.priorCodes,
      names: byPlot.get(plot.plotId) ?? [],
    }));
    const lost = byPlot.get(UNPLACED);
    if (lost !== undefined) entries.push({ siteId: open.site.id, plotId: UNPLACED, code: "", priorCodes: [], names: lost });
    return search(entries, open.site.id, query);
  }, [query, records, rows, open.site.id]);

  const rowOf = (plotId: string) => rows.find((r) => r.plot.plotId === plotId);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    navigate(`/r/${open.site.id}${text.trim() === "" ? "" : `?q=${encodeURIComponent(text.trim())}`}`);
  };
  const clear = () => {
    setText("");
    navigate(`/r/${open.site.id}`);
  };
  const empty = rows.length === 0 && records.length === 0;

  return (
    <section className="stack">
      <h1>{open.site.title}</h1>
      <div className="actions">
        <ButtonLink href="#/">{t("changeRegister")}</ButtonLink>
      </div>
      {route.query.get("new") === "1" ? <Notice tone="good">{t("registerCreated")}</Notice> : null}
      {empty ? (
        <section className="stack card" aria-label={t("startWithMapOrRecord")}>
          <p>{t("startWithMapOrRecord")}</p>
          <div className="actions">
            <ButtonLink href={`${base}/map/edit`} primary>
              {t("addYourMap")}
            </ButtonLink>
            <ButtonLink href={`${base}/add`}>{t("enterRecords")}</ButtonLink>
            <ButtonLink href={`${base}/add/import`}>{t("importSpreadsheet")}</ButtonLink>
          </div>
        </section>
      ) : null}

      <form className="stack" role="search" aria-label={t("searchThisRegister")} onSubmit={submit}>
        <TextField label={t("nameOrCode")} value={text} onChange={setText} autoComplete="off" />
        <div className="actions">
          <Button primary type="submit">
            {t("search")}
          </Button>
          {query === "" ? null : <Button onClick={clear}>{t("clearSearch")}</Button>}
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
        <div className="stack">
          <h2>{t("resultsHeading")}</h2>
          <p>{hits.length === 1 ? t("foundOne") : t("foundMany", { count: hits.length })}</p>
          <ul className="cards plain">
            {hits.map((hit, i) => {
              const row = rowOf(hit.plotId);
              const lost = hit.plotId === UNPLACED;
              return (
                <li key={`${hit.plotId}-${hit.recordId ?? i}`} className="card">
                  <p>
                    <strong>{hit.display ?? t("plotTitle", { code: hit.code })}</strong>
                  </p>
                  {lost ? <p>{t("locationToConfirm")}</p> : <p>{row?.line}</p>}
                  {hit.via === "priorCode" ? <p>{t("wasCode", { code: hit.matchedText })}</p> : null}
                  {hit.via === "sourceRef" ? <p>{t("sourceOf", { ref: hit.matchedText })}</p> : null}
                  {hit.via === "name" && (hit.source !== undefined || hit.date !== undefined) ? (
                    <p>{[hit.source, hit.date].filter((s) => s !== undefined && s !== "").join(" · ")}</p>
                  ) : null}
                  {lost ? null : (
                    <div className="actions">
                      <ButtonLink href={`${base}/plot/${hit.plotId}`}>{t("openPlot")}</ButtonLink>
                      <ButtonLink href={`${base}/map?plot=${hit.plotId}`}>{t("showOnMap")}</ButtonLink>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {unplaced.length === 0 || query.trim() !== "" ? null : (
        <section className="stack card" aria-labelledby="unplaced-heading">
          <h2 id="unplaced-heading">{t("locationToConfirm")}</h2>
          <ul className="plain stack">
            {unplaced.map((r) => (
              <li key={r.name.recordId}>
                {r.name.display} · {t("sourceOf", { ref: r.name.sourceRef ?? "" })}
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav aria-label={t("searchThisRegister")}>
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
    </section>
  );
}
