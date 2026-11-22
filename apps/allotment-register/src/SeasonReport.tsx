// The private season report: charges, receipts, reversals and balances side by side, each on its own tenancy,
// then the plot handovers and the waiting list order. A past season is shown with the holders of that time.
// It is private: it prints from its own table and exports a CSV that a spreadsheet will not run as a formula.
import { useMemo, useState } from "react";
import { buildReportPrint } from "../../../template/src/output/print";
import { Button, ButtonLink, Notice, SelectField, TextField } from "../../../template/src/ui/controls";
import { downloadText } from "../../../template/src/ui/download";
import { useShell } from "../../../template/src/ui/shellContext";
import { reportCsv, reportTable, seasonReport } from "./fees";
import { printHtml, useAllot } from "./intent";

export function SeasonReport() {
  const { t, settings, route } = useShell();
  const open = useAllot();
  const base = `#/r/${open.site.id}`;
  const seasons = useMemo(() => Object.values(open.state.seasons).sort((a, b) => (a.start < b.start ? 1 : -1)), [open.state.seasons]);
  const wanted = route.query.get("season") ?? "";
  const [seasonChoice, setSeasonChoice] = useState(wanted);
  const seasonId = seasons.some((s) => s.seasonId === seasonChoice) ? seasonChoice : (seasons.find((s) => s.start <= open.today && open.today < s.endExclusive) ?? seasons[0])?.seasonId ?? "";
  const [asAt, setAsAt] = useState(open.today);
  const [notice, setNotice] = useState<string | undefined>();

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(asAt);
  const report = useMemo(
    () => (valid && seasonId !== "" ? seasonReport(open.state, { seasonId, asOf: asAt, revision: open.revision }) : undefined),
    [valid, seasonId, asAt, open.state, open.revision],
  );
  const table = useMemo(() => (report === undefined ? undefined : reportTable(open.state, report, t)), [open.state, report, t]);

  const download = () => {
    if (report === undefined) return;
    downloadText(`private-season-report-${asAt}.csv`, reportCsv(open.state, report, t), "text/csv");
    setNotice(t("yourCopyReady"));
  };
  const print = () => {
    if (table === undefined) return;
    setNotice(t("preparingPrint"));
    printHtml(buildReportPrint(table, { paper: settings.paper, orientation: "portrait" }));
    window.setTimeout(() => setNotice(t("printPreviewReady")), 0);
  };

  return (
    <section className="stack">
      <h1>{t("seasonReport")}</h1>
      <p className="lead">{t("privateRegisterReport")}</p>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
        <ButtonLink href={`${base}/payments`}>{t("seasonFees")}</ButtonLink>
      </div>
      {seasons.length === 0 ? (
        <p>{t("noSeasons")}</p>
      ) : (
        <div className="stack">
          <SelectField label={t("seasonLabel")} value={seasonId} onChange={setSeasonChoice} options={seasons.map((s) => ({ value: s.seasonId, label: s.name }))} />
          <TextField label={t("asAtLabel")} type="date" value={asAt} onChange={setAsAt} error={valid || asAt === "" ? undefined : t("invalidDate")} />
        </div>
      )}

      {table === undefined ? null : (
        <div className="stack" aria-live="polite">
          <ul className="plain stack">
            {table.scope.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <ul className="counts plain" aria-label={t("seasonReport")}>
            {table.totals.map((row) => (
              <li key={row.label}>
                {row.label} · {row.value}
              </li>
            ))}
          </ul>
          {table.sections.map((section, index) => (
            <section key={section.heading} className="stack" aria-labelledby={`part-${index}`}>
              <h2 id={`part-${index}`}>{section.heading}</h2>
              {section.rows.length === 0 ? (
                <p>{section.emptyText}</p>
              ) : (
                <div className="table-scroll" role="region" aria-label={section.heading} tabIndex={0}>
                  <table className="report-table">
                    <thead>
                      <tr>
                        {section.columns.map((c) => (
                          <th key={c} scope="col">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row, i) => (
                        <tr key={`${section.heading}-${i}`}>
                          {row.map((cell, j) => (
                            <td key={j}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <div className="actions">
        <Button primary onClick={print} disabled={table === undefined}>
          {t("printPrivateReport")}
        </Button>
        <Button onClick={download} disabled={report === undefined}>
          {t("downloadPrivateCsv")}
        </Button>
      </div>
      {notice === undefined ? null : <Notice tone="good">{notice}</Notice>}
    </section>
  );
}
