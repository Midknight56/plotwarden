// The copy catalog for foundation errors and labels. No React.
// Plain short words. No dash between words. The middle dot is the only separator.
// Braces are filled with values from committed data, as plain text.
import { MONTH_NAMES } from "../calendar";
import type { PartialDate } from "../calendar";
import type { PlotSummary } from "../status";
import { SCREEN_COPY } from "./copyScreens";
import type { PhysicalState } from "../types";

export const FOUNDATION_COPY: Readonly<Record<string, string>> = {
  saved: "Saved on this device.",
  saving: "Saving changes…",
  staleRevision: "This register changed in another tab.",
  opConflict: "This change was already saved with different details. Open latest to check it.",
  keyTaken: "Code {code} is already in {section}.",
  spaceTaken: "This plot is already taken.",
  storageAbort: "Changes are still in this tab. Download a recovery file.",
  quota: "This browser could not save the register.",
  invalidDate: "Use a valid date.",
  openCommitment: "A plot with an open commitment cannot be archived.",
  exceedsBalance: "Amount exceeds the balance of {amount}.",
  stateFree: "Free",
  stateReserved: "Reserved",
  stateTaken: "Taken",
  stateUnusable: "Unusable",
  needsChecking: "Needs checking",
  locationToConfirm: "Location to confirm",
  dateUnknown: "Date unknown",
  plotUsed: "{state} · {used} of {total} spaces used",
  correctAnEntry: "Correct an entry",
  actionKeepDraft: "Keep my draft",
  actionOpenLatest: "Open latest",
  actionKeepEditing: "Keep editing",
  actionTryAgain: "Try again",
  actionDownloadRecovery: "Download recovery file",
  actionDownloadBackup: "Download backup",
  actionContinueInTab: "Continue in this tab",
};

/** The whole catalog: the foundation words and the words of the shared screens. */
export const COPY: Readonly<Record<string, string>> = { ...FOUNDATION_COPY, ...SCREEN_COPY };

/** Error code to catalog key. Codes without an entry here get their words with their own feature. */
const ERROR_KEYS: Readonly<Record<string, string>> = {
  stale_revision: "staleRevision",
  op_conflict: "opConflict",
  key_taken: "keyTaken",
  space_taken: "spaceTaken",
  storage_abort: "storageAbort",
  quota: "quota",
  invalid_date: "invalidDate",
  open_commitment: "openCommitment",
  exceeds_balance: "exceedsBalance",
};

/** Buttons that go with an error. Design D6. */
export const ERROR_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  stale_revision: [COPY["actionKeepDraft"] as string, COPY["actionOpenLatest"] as string],
  op_conflict: [COPY["actionOpenLatest"] as string],
  key_taken: [COPY["actionKeepEditing"] as string],
  storage_abort: [COPY["actionTryAgain"] as string, COPY["actionDownloadRecovery"] as string],
  quota: [COPY["actionDownloadBackup"] as string, COPY["actionContinueInTab"] as string],
};

/**
 * Put each value in once, as plain text. A brace inside a value is never read
 * as a new field. A missing value is a bug and throws.
 */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`No value for {${key}}`);
    return String(value);
  });
}

/** The words for an error code, or undefined when the code has no entry yet. */
export function errorText(code: string, values: Readonly<Record<string, string | number>> = {}): string | undefined {
  const key = ERROR_KEYS[code];
  const template = key === undefined ? undefined : COPY[key];
  return template === undefined ? undefined : fill(template, values);
}

const STATE_KEYS: Readonly<Record<PhysicalState, string>> = {
  free: "stateFree",
  reserved: "stateReserved",
  taken: "stateTaken",
  unusable: "stateUnusable",
};

export function stateWord(state: PhysicalState): string {
  return COPY[STATE_KEYS[state]] as string;
}

/** A date at the precision it was stored: "1874", "March 1874", "3 March 1874", "Date unknown". */
export function formatPartialDate(value: PartialDate): string {
  switch (value.p) {
    case "unknown":
      return COPY["dateUnknown"] as string;
    case "year":
      return String(value.y);
    case "month":
      return `${MONTH_NAMES[value.m - 1]} ${value.y}`;
    case "day":
      return `${value.d} ${MONTH_NAMES[value.m - 1]} ${value.y}`;
  }
}

/**
 * One line for a plot, for example "Taken · 2 of 2 spaces used". A one space
 * plot shows its state alone. "Needs checking" is added, never merged into a state.
 */
export function plotSummaryText(summary: PlotSummary): string {
  const checking = COPY["needsChecking"] as string;
  if (summary.primary === undefined) return summary.needsChecking ? checking : "";
  const state = stateWord(summary.primary);
  const head =
    summary.spaceCount > 1
      ? fill(COPY["plotUsed"] as string, { state, used: summary.counts.taken, total: summary.spaceCount })
      : state;
  return summary.needsChecking ? `${head} · ${checking}` : head;
}

/** The reason on a row that needs attention, from the error code. A code with no entry gets a plain line. */
export function reasonText(code: string, catalog: Readonly<Record<string, string>> = COPY): string {
  return catalog[`reason_${code}`] ?? (catalog["reason_unknown"] as string);
}
