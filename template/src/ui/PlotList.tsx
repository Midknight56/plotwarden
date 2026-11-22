// The plot list: every plot, with filters. It holds the same plots and the same selection as the map.
import { useMemo } from "react";
import { AsAtField } from "./AsAtField";
import { ButtonLink, SelectField } from "./controls";
import { STATE_FILTERS, asAtOf, claimFloorFor, matchesFilter, parseFilter, plotCountText, plotRows, queryOf } from "./plotView";
import type { StateFilter } from "./plotView";
import { useRegister, useShell } from "./shellContext";

const FILTER_KEYS: Record<StateFilter, string> = {
  all: "filterAll",
  free: "stateFree",
  reserved: "stateReserved",
  taken: "stateTaken",
  unusable: "stateUnusable",
  checking: "needsChecking",
};

export function PlotList() {
  const { t, app, route, navigate } = useShell();
  const open = useRegister();
  const base = `#/r/${open.site.id}`;
  const filter = parseFilter(route.query.get("state"));
  const sectionId = route.query.get("section") ?? "";
  const selected = route.query.get("plot") ?? "";
  // The view date is in the address as `asAt`, a date and nothing else. Today has no `asAt`.
  const asAt = asAtOf(route.query, open.today);
  const viewDate = asAt ?? open.today;

  const floor = useMemo(() => claimFloorFor(app, open.state), [app, open.state]);
  const rows = useMemo(() => plotRows(open, t, viewDate, floor), [open, t, viewDate, floor]);
  const shown = rows.filter((r) => matchesFilter(r, filter) && (sectionId === "" || r.plot.sectionId === sectionId));
  const sections = Object.values(open.state.map.sections).sort((a, b) => a.displayOrder - b.displayOrder);

  const link = (patch: { state?: string; section?: string; asAt?: string }) => {
    const state = patch.state ?? (filter === "all" ? "" : filter);
    const section = patch.section ?? sectionId;
    return `${base}/list${queryOf({ state, section, plot: selected, asAt: patch.asAt ?? asAt })}`;
  };

  return (
    <section className="stack">
      <h1>{t("plotListLink")}</h1>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
        <ButtonLink href={`${base}/map${queryOf({ asAt })}`}>{t("backToMap")}</ButtonLink>
      </div>

      <AsAtField
        date={viewDate}
        today={open.today}
        onChange={(date) => navigate(link({ asAt: date === open.today ? "" : date }).slice(1), { search: route.search })}
      />

      <nav aria-label={t("showStatus")}>
        <ul className="actions plain">
          {STATE_FILTERS.map((f) => (
            <li key={f}>
              <ButtonLink href={link({ state: f === "all" ? "" : f })} aria-current={f === filter ? "page" : undefined} primary={f === filter}>
                {t(FILTER_KEYS[f])}
              </ButtonLink>
            </li>
          ))}
        </ul>
      </nav>

      {sections.length === 0 ? null : (
        <SelectField
          label={t("chooseSection")}
          value={sectionId}
          onChange={(value) => navigate(link({ section: value }).slice(1), { replace: true })}
          options={[{ value: "", label: t("allSections") }, ...sections.map((s) => ({ value: s.sectionId, label: s.name }))]}
        />
      )}

      {rows.length === 0 ? (
        <div className="stack">
          <p>{t("noPlotsInSection")}</p>
          <div className="actions">
            <ButtonLink href={`${base}/map/edit`}>{t("addYourMap")}</ButtonLink>
          </div>
        </div>
      ) : shown.length === 0 ? (
        <div className="stack">
          <p>{t("noMatches")}</p>
          <div className="actions">
            <ButtonLink href={`${base}/list${queryOf({ asAt })}`}>{t("clearFilters")}</ButtonLink>
          </div>
        </div>
      ) : (
        <div className="stack">
          <p>{plotCountText(shown.length, t)}</p>
          <ul className="cards plain">
            {shown.map((row) => (
              <li key={row.plot.plotId} className={`card${row.plot.plotId === selected ? " selected" : ""}`} aria-current={row.plot.plotId === selected ? "true" : undefined}>
                <p>
                  {row.plot.code} · {row.sectionName ?? t("noSection")} · {row.stateText}
                </p>
                {row.plot.priorCodes.length === 0 ? null : <p>{row.plot.priorCodes.map((c) => t("wasCode", { code: c })).join(" · ")}</p>}
                <div className="actions">
                  <ButtonLink href={`${base}/plot/${row.plot.plotId}`}>{t("plotTitle", { code: row.plot.code })}</ButtonLink>
                  <ButtonLink href={`${base}/map${queryOf({ plot: row.plot.plotId, asAt })}`}>{t("showOnMap")}</ButtonLink>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
