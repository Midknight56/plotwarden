// The page of the paper register beside the rows: a photo kept in memory, with zoom, turn and page number.
// The photo stays on this device. It is never written unless the keeper chooses to keep it.
import type { EntrySession } from "../data/fastEntry";
import { nextPage, previousPage, rotatePage, setKeepPage, zoomIn, zoomOut } from "../data/fastEntry";
import { Button, CheckField } from "./controls";
import { useShell } from "./shellContext";

export function ReferencePage({
  session,
  onSession,
  url,
  onChoose,
}: {
  session: EntrySession;
  onSession: (change: (s: EntrySession) => EntrySession) => void;
  url: string | undefined;
  onChoose: (file: File) => void;
}) {
  const { t } = useShell();
  const { page } = session;
  return (
    <section className="stack page-panel" aria-label={t("registerPage")}>
      <h2>{t("registerPage")}</h2>
      <div className="field">
        <label htmlFor="page-photo">{t("choosePagePhoto")}</label>
        <input
          id="page-photo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file !== undefined) onChoose(file);
            e.target.value = "";
          }}
        />
      </div>
      {url === undefined ? (
        <p>{t("choosePageOrEnter")}</p>
      ) : (
        <>
          <div className="page-view" tabIndex={0} role="region" aria-label={t("showPage")}>
            <img
              src={url}
              alt={t("registerPage")}
              style={{ transform: `rotate(${page.rotation}deg) scale(${page.zoom})`, transformOrigin: "center top" }}
            />
          </div>
          <p>{t("pageStaysHere")}</p>
          <CheckField label={t("keepPage")} checked={session.keepPage} onChange={(on) => onSession((s) => setKeepPage(s, on))} />
        </>
      )}
      <div className="actions">
        <Button onClick={() => onSession((s) => previousPage(s))} disabled={page.index <= 1}>
          {t("previousPage")}
        </Button>
        <Button onClick={() => onSession((s) => nextPage(s))}>{t("nextPage")}</Button>
        <Button onClick={() => onSession((s) => zoomIn(s))} disabled={url === undefined}>
          {t("enlarge")}
        </Button>
        <Button onClick={() => onSession((s) => zoomOut(s))} disabled={url === undefined}>
          {t("reduce")}
        </Button>
        <Button onClick={() => onSession((s) => rotatePage(s))} disabled={url === undefined}>
          {t("rotate")}
        </Button>
      </div>
      <p>{t("pageNumber", { n: page.index })}</p>
      <p>{t("zoomPercent", { percent: Math.round(page.zoom * 100) })}</p>
    </section>
  );
}
