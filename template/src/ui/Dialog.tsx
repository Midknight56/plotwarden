// A modal dialog. Escape closes it and focus goes back to the control that opened it.
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "./controls";
import { useShell } from "./shellContext";

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

  return (
    <dialog
      ref={ref}
      aria-label={title}
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
