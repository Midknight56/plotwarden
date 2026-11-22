// A message for the state of an action: saving, saved, or a failure with the buttons that go with it.
import { useContext, useState } from "react";
import { Button } from "./controls";
import { RegisterContext, useShell } from "./shellContext";

export type StatusState =
  | { phase: "idle" }
  | { phase: "working"; text: string }
  | { phase: "saving" }
  | { phase: "saved"; text?: string }
  | { phase: "error"; code: string; text: string };

export interface StatusActions {
  keepDraft?: () => void;
  openLatest?: () => void;
  tryAgain?: () => void;
  downloadRecovery?: () => void;
  downloadBackup?: () => void;
  continueInTab?: () => void;
  keepEditing?: () => void;
}

/** Which buttons go with which failure, from the design of the stale and storage texts. */
const ACTIONS: Readonly<Record<string, readonly { key: string; callback: keyof StatusActions }[]>> = {
  stale_revision: [
    { key: "actionKeepDraft", callback: "keepDraft" },
    { key: "actionOpenLatest", callback: "openLatest" },
  ],
  op_conflict: [{ key: "actionOpenLatest", callback: "openLatest" }],
  key_taken: [{ key: "actionKeepEditing", callback: "keepEditing" }],
  storage_abort: [
    { key: "actionTryAgain", callback: "tryAgain" },
    { key: "actionDownloadRecovery", callback: "downloadRecovery" },
  ],
  quota: [
    { key: "actionDownloadBackup", callback: "downloadBackup" },
    { key: "actionContinueInTab", callback: "continueInTab" },
  ],
};

export function Status({ status, actions = {} }: { status: StatusState; actions?: StatusActions }) {
  const { t, navigate } = useShell();
  const open = useContext(RegisterContext);
  const [dismissed, setDismissed] = useState<StatusState | undefined>(undefined);
  if (status.phase === "idle" || dismissed === status) return null;
  // A full store or a failed save has two ways on in every screen: take the backup, or go on typing in this tab.
  // A screen may give its own.
  const defaults: StatusActions = { continueInTab: () => setDismissed(status) };
  if (open !== null) defaults.downloadBackup = () => navigate(`/r/${open.site.id}/backup`);
  const given = { ...defaults, ...actions };
  if (status.phase === "working") {
    return (
      <p className="notice info" role="status" aria-live="polite">
        {status.text}
      </p>
    );
  }
  if (status.phase === "saving") {
    return (
      <p className="notice info" role="status" aria-live="polite">
        {t("saving")}
      </p>
    );
  }
  if (status.phase === "saved") {
    return (
      <p className="notice good" role="status" aria-live="polite">
        {status.text ?? t("saved")}
      </p>
    );
  }
  const buttons = (ACTIONS[status.code] ?? []).filter((a) => given[a.callback] !== undefined);
  return (
    <div className="notice error" role="alert">
      <p>{status.text}</p>
      {buttons.length === 0 ? null : (
        <div className="actions">
          {buttons.map((a) => (
            <Button key={a.key} onClick={given[a.callback]}>
              {t(a.key)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
