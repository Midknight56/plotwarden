// Back up this register, and restore a backup as a new register or over this one.
// A backup is checked in memory first. The register that is there stays as it was until the copy is whole.
import { useContext, useState } from "react";
import { backupFilename, compareLineage, exportBackup, restoreBackup, verifyBackup } from "../data/backup";
import type { RestoreResult, VerifiedBackup } from "../data/backup";
import { buildRecoveryFile } from "../data/drafts";
import { writeTime } from "../calendar";
import type { DomainError } from "../types";
import { Button, ButtonLink, Notice, TextField } from "./controls";
import { downloadBytes, downloadText } from "./download";
import { errorMessage } from "./messages";
import { RegisterContext, useShell } from "./shellContext";
import { Status } from "./Status";
import type { StatusState } from "./Status";

function BackUp() {
  const { db, t, now } = useShell();
  const open = useContext(RegisterContext);
  const [status, setStatus] = useState<StatusState>({ phase: "idle" });
  const [ready, setReady] = useState<{ bytes: Uint8Array; filename: string } | undefined>();
  if (open === null) return null;
  const base = `#/r/${open.site.id}`;

  const make = async () => {
    setStatus({ phase: "working", text: t("preparingBackup") });
    const made = await exportBackup(db, open.site.id, writeTime(now()));
    if (!made.ok) {
      setStatus({ phase: "error", code: made.error.code, text: errorMessage(t, made.error) });
      return;
    }
    const filename = backupFilename(open.today);
    setReady({ bytes: made.value.bytes, filename });
    downloadBytes(filename, made.value.bytes, "application/zip");
    setStatus({ phase: "idle" });
  };

  return (
    <section className="stack">
      <h1>{t("backUpRegister")}</h1>
      <p>{t("backupPrivate")}</p>
      <div className="actions">
        <Button primary onClick={() => void make()}>
          {t("downloadBackup")}
        </Button>
        <ButtonLink href={`${base}/restore`}>{t("restoreBackup")}</ButtonLink>
        <ButtonLink href={base}>{t("backToRegister")}</ButtonLink>
      </div>
      <Status status={status} actions={{ tryAgain: () => setStatus({ phase: "idle" }) }} />
      {ready === undefined ? null : (
        <div className="stack">
          <Notice tone="good">{t("backupWritten")}</Notice>
          <div className="actions">
            <Button onClick={() => downloadBytes(ready.filename, ready.bytes, "application/zip")}>{t("downloadAgain")}</Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Facts({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section className="stack card">
      <h2>{title}</h2>
      <ul className="plain">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}

function Restore({ inRegister }: { inRegister: boolean }) {
  const { app, db, t, bumpSites, newId, now } = useShell();
  const open = useContext(RegisterContext);
  const [verified, setVerified] = useState<VerifiedBackup | undefined>();
  const [bytesRead, setBytesRead] = useState(false);
  const [problem, setProblem] = useState<string | undefined>();
  const [status, setStatus] = useState<StatusState>({ phase: "idle" });
  const [done, setDone] = useState<RestoreResult | undefined>();
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const refusal = (error: DomainError): string => {
    switch (error.code) {
      case "wrong_file": {
        const found = String(error.detail?.["found"] ?? "");
        if (found === "visitor") return t("visitorCopyFile");
        if (found === "review" || found === "slip") return t("reviewFile");
        return t("otherKindOfFile");
      }
      case "newer_version":
        return t("needsNewerVersion");
      case "wrong_kind":
        return t("wrongKindOfRegister");
      case "corrupt":
        return t("backupIncomplete");
      default:
        return errorMessage(t, error);
    }
  };

  const choose = async (file: File | undefined) => {
    if (file === undefined) return;
    setVerified(undefined);
    setDone(undefined);
    setProblem(undefined);
    setTyped("");
    setTypedError(undefined);
    setBytesRead(false);
    setStatus({ phase: "working", text: t("verifying") });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await verifyBackup(bytes, { kind: app.adapter.kind });
    setStatus({ phase: "idle" });
    setBytesRead(true);
    if (!result.ok) {
      setProblem(refusal(result.error));
      return;
    }
    setVerified(result.value);
  };

  const finish = async (result: Awaited<ReturnType<typeof restoreBackup>>) => {
    setBusy(false);
    if (!result.ok) {
      const code = result.error.code;
      setStatus({
        phase: "error",
        code,
        text: code === "title_mismatch" ? t("restoreNeedsName") : code === "foreign_site" ? t("backupOtherRegister") : `${errorMessage(t, result.error)} ${t("restoreFailed")}`,
      });
      return;
    }
    setDone(result.value);
    setVerified(undefined);
    setStatus({ phase: "saved", text: t("restored", { site: result.value.title }) });
    bumpSites();
    if (open !== null) await open.reload();
  };

  const restoreNew = async () => {
    if (verified === undefined || busy) return;
    setBusy(true);
    setStatus({ phase: "working", text: t("restoring") });
    await finish(await restoreBackup(db, verified, { mode: "new" }));
  };

  const restoreHere = async () => {
    if (verified === undefined || open === null || busy) return;
    if (typed.trim() !== open.site.title) {
      setTypedError(t("restoreNeedsName"));
      return;
    }
    setBusy(true);
    setStatus({ phase: "working", text: t("restoring") });
    await finish(await restoreBackup(db, verified, { mode: "replace", currentSiteId: open.site.id, typedTitle: typed }));
  };

  const same = verified !== undefined && open !== null && verified.site.id === open.site.id && verified.site.lineageId === open.site.lineageId;
  const relation = same && verified !== undefined && open !== null ? compareLineage(open.events, verified.events) : undefined;

  // What the keeper has put in is the backup file they chose, which stays where it is, and the site name they typed.
  // A failed restore leaves both on this screen. The recovery file holds the typed name, for the site the backup is of.
  // Another tab cannot make a restore stale, so there is no "Keep my draft" here.
  const recovery = () => {
    const file = buildRecoveryFile({
      draftId: newId(),
      siteId: verified?.site.id ?? open?.site.id ?? "none",
      kind: app.adapter.kind,
      baseRevision: open?.revision ?? 0,
      rawRows: [{ typedName: typed }],
      mapping: { screen: "restore" },
      currentRow: 0,
      commands: [],
      pageImageNeedsReselect: false,
      savedAt: now().toISOString(),
    });
    downloadText(file.filename, file.text, "application/json");
  };

  return (
    <section className="stack">
      <h1>{t("restoreBackup")}</h1>
      <p>{t("restoreBackupHint")}</p>
      <div className="actions">
        {inRegister && open !== null ? (
          <>
            <ButtonLink href={`#/r/${open.site.id}/backup`}>{t("backUpRegister")}</ButtonLink>
            <ButtonLink href={`#/r/${open.site.id}`}>{t("backToRegister")}</ButtonLink>
          </>
        ) : (
          <ButtonLink href="#/">{t("backToRegisters")}</ButtonLink>
        )}
      </div>

      <div className="field">
        <label htmlFor="backup-file">{t("chooseBackup")}</label>
        <input
          id="backup-file"
          type="file"
          onChange={(e) => {
            void choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {problem === undefined ? null : (
        <div className="notice error" role="alert">
          <p>{problem}</p>
          {bytesRead ? <p>{t("chooseAnotherFile")}</p> : null}
        </div>
      )}
      <Status status={status} actions={{ tryAgain: () => setStatus({ phase: "idle" }), downloadRecovery: recovery }} />

      {done === undefined ? null : (
        <div className="stack">
          {done.rotatedKey && inRegister ? <Notice>{t("keyRotatedWarning")}</Notice> : null}
          <div className="actions">
            <ButtonLink href={`#/r/${done.siteId}`} primary>
              {t("openSite", { site: done.title })}
            </ButtonLink>
          </div>
        </div>
      )}

      {verified === undefined ? null : (
        <div className="stack">
          {open === null ? null : (
            <Facts
              title={t("thisRegisterHeading")}
              lines={[t("factSite", { site: open.site.title }), t("factRevision", { n: open.revision }), t("factRecords", { n: open.events.length })]}
            />
          )}
          <Facts
            title={t("thisBackupHeading")}
            lines={[
              t("factSite", { site: verified.site.title }),
              t("factRevision", { n: verified.manifest.revision }),
              t("factRecords", { n: verified.manifest.counts.events }),
              t("factImages", { n: verified.manifest.counts.images }),
              t("factMade", { date: verified.manifest.createdAt.slice(0, 10) }),
            ]}
          />
          <div className="actions">
            <Button primary onClick={() => void restoreNew()} disabled={busy}>
              {t("restoreAsNew")}
            </Button>
          </div>

          {inRegister && open !== null ? (
            <section className="stack" aria-label={t("restoreOptions")}>
              <h2>{t("restoreOptions")}</h2>
              {same ? (
                <>
                  {relation === "backward" ? <Notice>{t("restoreGoesBack")}</Notice> : null}
                  {relation === "fork" ? <Notice>{t("restoreForks")}</Notice> : null}
                  <p>{t("backupFirst")}</p>
                  <TextField label={t("typeSiteName")} value={typed} error={typedError} onChange={(v) => { setTyped(v); setTypedError(undefined); }} autoComplete="off" />
                  <div className="actions">
                    <Button onClick={() => void restoreHere()} disabled={busy || typed.trim() !== open.site.title}>
                      {t("restoreThis")}
                    </Button>
                    <Button onClick={() => setVerified(undefined)}>{t("keepMyCurrent")}</Button>
                  </div>
                </>
              ) : (
                <p>{t("backupOtherRegister")}</p>
              )}
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}

export function BackupRestore({ mode }: { mode: "backup" | "restore" | "library" }) {
  if (mode === "backup") return <BackUp />;
  return <Restore inRegister={mode === "restore"} />;
}
