// One user intent, one operation. A screen sends its commands through here: a repeat press while the
// commit is running does nothing, a retry keeps the same operation ID, "Saved on this device." shows only
// after the transaction completes, and an error that sits on a field moves focus to the first invalid field.
import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import type { LocalDate } from "../../../template/src/calendar";
import { formatMoney } from "../../../template/src/money";
import type { Currency } from "../../../template/src/types";
import { commitMessage } from "../../../template/src/ui/messages";
import { useRegister, useShell } from "../../../template/src/ui/shellContext";
import type { AnyCommand, OpenRegister, RunOutcome } from "../../../template/src/ui/shellContext";
import type { StatusState } from "../../../template/src/ui/Status";
import { allotError } from "./copy";
import type { AllotState } from "./types";

/** The open register, with its state read as an allotment. The shell only opens a site of this app's kind. */
export function useAllot(): Omit<OpenRegister, "state"> & { state: AllotState } {
  return useRegister() as unknown as Omit<OpenRegister, "state"> & { state: AllotState };
}

/** Money in the currency of the open garden. */
export function useMoney(): (minor: number) => string {
  const open = useAllot();
  return (minor) => formatMoney(minor, (open.state.currency ?? "GBP") as Currency);
}

/** A refusal that belongs to one field says so there, so focus goes to it and the input stays editable. */
const CODE_FIELD: Readonly<Record<string, string>> = {
  open_request: "applicant",
  exceeds_balance: "amount",
  charge_reversed: "amount",
  season_exists: "seasonName",
  not_overdue: "release",
};

export interface Intent {
  status: StatusState;
  /** The words of each field that failed, by field key. */
  fieldErrors: Readonly<Record<string, string>>;
  busy: boolean;
  setStatus(status: StatusState): void;
  clearErrors(): void;
  /** `fields` names the field a refusal code belongs to on this screen, ahead of the shared map. */
  send(commands: AnyCommand[], options: { done: string; on?: LocalDate; fields?: Readonly<Record<string, string>> }): Promise<RunOutcome>;
}

/** Focus the first field marked invalid inside a form, after the screen has drawn the error. */
function focusInvalid(root: HTMLElement | null): void {
  window.setTimeout(() => root?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
}

export function useIntent(form?: RefObject<HTMLElement | null>): Intent {
  const open = useRegister();
  const { t, newId } = useShell();
  const [status, setStatus] = useState<StatusState>({ phase: "idle" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const opId = useRef<string | undefined>(undefined);

  const send = useCallback<Intent["send"]>(
    async (commands, options) => {
      if (running.current) return { ok: false, code: "busy" };
      running.current = true;
      setBusy(true);
      setFieldErrors({});
      setStatus({ phase: "saving" });
      opId.current ??= newId();
      const outcome = await open.run(commands, { opId: opId.current, ...(options.on === undefined ? {} : { on: options.on }) });
      running.current = false;
      setBusy(false);
      if (outcome.ok) {
        opId.current = undefined;
        setStatus({ phase: "saved", text: `${options.done} ${t("saved")}` });
        return outcome;
      }
      const text = outcome.error !== undefined ? allotError(t, outcome.error) : commitMessage(t, outcome.commit ?? { code: "storage_abort" });
      const fields = outcome.error?.fields ?? [];
      const own = outcome.error === undefined ? undefined : (options.fields?.[outcome.error.code] ?? CODE_FIELD[outcome.error.code]);
      if (fields.length > 0) {
        // An error that sits on a field is said once, on the field. The same words are not repeated in a status.
        setFieldErrors(Object.fromEntries(fields.map((f) => [f.field, allotError(t, { code: "invalid_input", fields: [f] })])));
        setStatus({ phase: "idle" });
        focusInvalid(form?.current ?? null);
      } else if (own !== undefined && outcome.error !== undefined) {
        setFieldErrors({ [own]: allotError(t, outcome.error) });
        setStatus({ phase: "idle" });
        focusInvalid(form?.current ?? null);
      } else {
        setStatus({ phase: "error", code: outcome.commit?.code ?? outcome.code, text });
      }
      // A refusal is a new decision. A failed save is a retry of the same one.
      if (outcome.error !== undefined) opId.current = undefined;
      return outcome;
    },
    [form, newId, open, t],
  );

  return { status, fieldErrors, busy, setStatus, clearErrors: () => setFieldErrors({}), send };
}

/**
 * Hand a print document to the browser. The document is its own page in a frame that is not shown, so the
 * screen is never what gets printed. The browser may cancel: this never says a page was printed.
 */
export function printHtml(html: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("data-print-frame", "");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:absolute;width:1px;height:1px;border:0;left:-10000px;top:0;";
  frame.srcdoc = html;
  frame.onload = () => {
    const view = frame.contentWindow;
    if (view === null) return;
    view.focus();
    view.print();
  };
  document.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), 120_000);
}
