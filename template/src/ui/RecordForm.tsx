// Add records: the three ways in, and the form for one record.
import { ButtonLink } from "./controls";
import { SingleEntry } from "./FastEntry";
import { useRegister, useShell } from "./shellContext";

export function AddRecords() {
  const { t } = useShell();
  const open = useRegister();
  const base = `#/r/${open.site.id}`;
  return (
    <section className="stack">
      <h1>{t("addRecordsHeading")}</h1>
      <p>{t("chooseWay")}</p>
      <ul className="cards plain">
        <li className="card">
          <ButtonLink href={`${base}/add/one`} primary>
            {t("oneRecord")}
          </ButtonLink>
        </li>
        <li className="card">
          <ButtonLink href={`${base}/add/fast`}>{t("fastEntry")}</ButtonLink>
        </li>
        <li className="card">
          <ButtonLink href={`${base}/add/import`}>{t("importSpreadsheet")}</ButtonLink>
        </li>
      </ul>
      <div className="actions">
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
      </div>
    </section>
  );
}

/** One record: the same checks and the same save as fast entry, with one row. */
export function RecordForm() {
  return <SingleEntry />;
}
