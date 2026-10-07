"use client";
// Dialog: centered modal for confirmations (e.g. removing a query), with the same focus handling as Drawer.
import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsClient } from "./local-time";
import { useModal } from "./use-modal";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Body text under the title. */
  children?: ReactNode;
  /** Buttons, right-aligned. Mark the safe default with data-autofocus. */
  actions?: ReactNode;
}

/** Small centered modal with a title, text and action buttons. Esc and the backdrop close it. */
export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  const isClient = useIsClient();
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useModal<HTMLDivElement>(open, isClient, onClose);

  if (!open || !isClient) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 animate-fade-in bg-ink/40" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
        tabIndex={-1}
        className="relative w-full max-w-sm animate-toast-in rounded-2xl border border-line bg-white p-6 shadow-pop outline-none"
      >
        <h2 id={titleId} className="text-lg font-bold tracking-tight text-ink">
          {title}
        </h2>
        {children && (
          <div id={bodyId} className="mt-2 text-sm leading-6 text-ink-muted">
            {children}
          </div>
        )}
        {actions && <div className="mt-6 flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
