// A modal dialog. Escape closes it and focus goes back to the control that opened it.
import { useEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button } from "./controls";
import { useShell } from "./shellContext";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ open, title, onClose, children }: DialogProps) {
  const { t } = useShell();
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      opener.current?.focus();
    }
  }, [open]);

  /** Keep Tab and Shift+Tab inside the dialog: from the last control to the first, and from the first to the last. */
  const keepFocusInside = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return;
    const dialog = ref.current;
    if (dialog === null) return;
    const controls = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (first === undefined || last === undefined) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onKeyDown={keepFocusInside}
      onCancel={(event) => {
        // Escape. Close through the state, so focus goes back to the opener.
        event.preventDefault();
        onClose();
      }}
    >
      {open ? (
        <div className="dialog-body">
          <h2>{title}</h2>
          {children}
          <div className="actions">
            <Button onClick={onClose}>{t("closeDialog")}</Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
