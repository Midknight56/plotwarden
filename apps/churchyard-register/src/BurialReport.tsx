// The private report: burials, reservations made and released, open spaces and burials with no plot.
// It counts by the date of each event. A partial burial date that straddles the period is "Date incomplete".
// It is private: it prints from its own table and exports a CSV that a spreadsheet will not run as a formula.
import { useMemo, useState } from "react";
import { coveredInterval } from "../../../template/src/calendar";
import { buildReportPrint } from "../../../template/src/output/print";
import { Button, ButtonLink, Notice, TextField } from "../../../template/src/ui/controls";
import { downloadText } from "../../../template/src/ui/download";
import { useShell } from "../../../template/src/ui/shellContext";
import { periodReport, reportCsv, reportTable } from "./history";
import { printHtml, useChurch } from "./intent";

export function BurialReport() {
  const { t, settings } = useShell();
  const open = useChurch();
  const base = `#/r/${open.site.id}`;
  const earliest = useMemo(() => {
    const days = Object.values(open.state.burials)
      .filter((b) => b.voided !== true)
      .map((b) => coveredInterval(b.date)?.first)
      .filter((d): d is string => d !== undefined)
      .sort();
    return days[0] ?? `${open.today.slice(0, 4)}-01-01`;
  }, [open.state.burials, open.today]);
  const [from, setFrom] = useState(`${earliest.slice(0, 4)}-01-01`);
  const [through, setThrough] = useState(open.today);
  const [notice, setNotice] = useState<string | undefined>();

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(through) && from <= through;
  const report = useMemo(
    () => (valid ? periodReport(open.state, { from, through, asOf: open.today, revision: open.revision }) : undefined),
    [valid, from, through, open.state, open.today, open.revision],
  );
  const table = useMemo(() => (report === undefined ? undefined : reportTable(open.state, report, t)), [open.state, report, t]);

  const download = () => {
    if (report === undefined) return;
    downloadText(`private-report-${open.today}.csv`, reportCsv(open.state, report, t), "text/csv");
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
      <h1>{t("reportHeading")}</h1>
      <p className="lead">{t("privateRegisterReport")}</p>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
      </div>
      <div className="stack">
        <TextField label={t("reportFrom")} type="date" value={from} onChange={setFrom} error={valid || from === "" ? undefined : t("invalidDate")} />
        <TextField label={t("reportThrough")} type="date" value={through} onChange={setThrough} error={valid || through === "" ? undefined : t("invalidDate")} />
      </div>

      {table === undefined ? null : (
        <div className="stack" aria-live="polite">
          <ul className="plain stack">
            {table.scope.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <ul className="counts plain" aria-label={t("reportHeading")}>
            {table.totals.map((row) => (
              <li key={row.label}>
                {row.label} · {row.value}
              </li>
            ))}
          </ul>
          {table.sections.map((section) => (
            <section key={section.heading} className="stack" aria-labelledby={`part-${section.heading.replace(/\s+/g, "-")}`}>
              <h2 id={`part-${section.heading.replace(/\s+/g, "-")}`}>{section.heading}</h2>
              {section.rows.length === 0 ? (
                <p>{section.emptyText}</p>
              ) : (
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
