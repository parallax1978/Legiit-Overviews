"use client";
// Drawer: right-side modal panel (for evidence lists) with focus trap, Esc to close, scroll lock and focus return.
// The body is a focusable region so keyboard users can scroll it.
import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { XIcon } from "./icons";
import { useIsClient } from "./local-time";
import { useModal } from "./use-modal";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Uppercase label above the title. */
  eyebrow?: ReactNode;
  /** Muted line under the title (e.g. "82% · n=56"). */
  description?: ReactNode;
  /** Sticky footer (buttons, pagination). */
  footer?: ReactNode;
  /** md 448px, lg 512px (default), xl 640px. Full width on phones. */
  size?: "md" | "lg" | "xl";
  children: ReactNode;
}

/** Modal panel sliding in from the right. Renders nothing while closed. */
export function Drawer({ open, onClose, title, eyebrow, description, footer, size = "lg", children }: DrawerProps) {
  const isClient = useIsClient();
  const titleId = useId();
  const descId = useId();
  const panelRef = useModal<HTMLDivElement>(open, isClient, onClose);

  if (!open || !isClient) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-ink/40" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex h-full w-full animate-slide-in-right flex-col bg-white shadow-pop outline-none",
          size === "md" && "max-w-md",
          size === "lg" && "max-w-lg",
          size === "xl" && "max-w-2xl",
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow text-brand">{eyebrow}</p>}
            <h2 id={titleId} className={cn("text-base font-bold tracking-tight text-ink", eyebrow && "mt-1")}>
              {title}
            </h2>
            {description && (
              <div id={descId} className="mt-0.5 text-sm text-ink-muted">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 rounded-full p-1.5 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <XIcon />
          </button>
        </div>
        {/* The scrolling body takes focus on open (and is the Tab stop after Close), so arrow keys,
            Page Up/Down and Space scroll a long evidence list. */}
        <div
          role="region"
          aria-labelledby={titleId}
          tabIndex={0}
          data-modal-initial
          className="flex-1 overflow-y-auto px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        >
          {children}
        </div>
        {footer && <div className="border-t border-line bg-white px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
