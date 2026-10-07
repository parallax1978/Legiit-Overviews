// Feedback blocks: EmptyState, Alert (inline notice), ErrorCard (failed data load) and CheckList.
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AlertTriangleIcon, CheckCircleIcon, CheckIcon, InfoIcon, XIcon } from "./icons";

export interface EmptyStateProps {
  /** Icon in a brand-faint circle. */
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  /** Buttons under the text. */
  action?: ReactNode;
  className?: string;
}

/** Centered empty state inside a dashed-free white card. */
export function EmptyState({ icon, title, body, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center rounded-card border border-line bg-white px-6 py-12 text-center shadow-card", className)}>
      {icon && <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-faint text-brand">{icon}</span>}
      <h3 className={cn("text-base font-bold tracking-tight text-ink", icon && "mt-4")}>{title}</h3>
      {body && <div className="mt-1.5 max-w-md text-sm leading-6 text-ink-muted">{body}</div>}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export type AlertTone = "info" | "good" | "warn" | "bad" | "brand";

const ALERT_TONES: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: { box: "border-line bg-white text-ink", icon: <InfoIcon className="text-ink-soft" /> },
  good: { box: "border-good/20 bg-good-soft/60 text-ink", icon: <CheckCircleIcon className="text-good" /> },
  warn: { box: "border-warn/25 bg-warn-soft/60 text-ink", icon: <AlertTriangleIcon className="text-warn" /> },
  bad: { box: "border-bad/20 bg-bad-soft/60 text-ink", icon: <AlertTriangleIcon className="text-bad" /> },
  brand: { box: "border-brand/30 bg-brand-faint text-ink", icon: <InfoIcon className="text-brand" /> },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons or links on the right (wraps under on phones). */
  action?: ReactNode;
  /** Shows a close button. */
  onDismiss?: () => void;
  className?: string;
}

/** Inline notice with an icon: info, good, warn, bad, brand. Uses role="alert" for bad. */
export function Alert({ tone = "info", title, children, action, onDismiss, className }: AlertProps) {
  const t = ALERT_TONES[tone];
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={cn("flex flex-wrap items-start gap-x-3 gap-y-2 rounded-card border px-4 py-3 text-sm", t.box, className)}
    >
      <span className="mt-0.5">{t.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn("leading-6 text-ink-muted", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="rounded-md p-0.5 text-ink-soft hover:text-ink">
          <XIcon />
        </button>
      )}
    </div>
  );
}

export interface ErrorCardProps {
  title?: ReactNode;
  /** Technical detail (e.g. the database error message), shown small. */
  detail?: string | null;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Card shown when data fails to load, instead of crashing the page. */
export function ErrorCard({ title = "This didn't load", detail, children, action, className }: ErrorCardProps) {
  return (
    <div role="alert" className={cn("rounded-card border border-bad/20 bg-white p-5 shadow-card", className)}>
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bad-soft text-bad">
          <AlertTriangleIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{title}</p>
          <div className="mt-1 text-sm leading-6 text-ink-muted">
            {children ?? "Something went wrong while loading this. Try again in a moment."}
          </div>
          {detail && <p className="mt-2 break-words font-mono text-xs text-ink-soft">{detail}</p>}
          {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
        </div>
      </div>
    </div>
  );
}

export interface CheckListProps {
  items: ReactNode[];
  /** check: brand ticks, muted text (default). cross: grey crosses. good: green ticks, ink text. */
  tone?: "check" | "cross" | "good";
  className?: string;
}

/** List with a small icon before each item. */
export function CheckList({ items, tone = "check", className }: CheckListProps) {
  return (
    <ul className={cn("space-y-2.5 text-sm", className)}>
      {items.map((item, i) => (
        <li key={i} className={cn("flex items-start gap-2", tone === "good" ? "text-ink" : "text-ink-muted")}>
          {tone === "cross" ? (
            <XIcon className="mt-0.5 text-ink-soft" />
          ) : (
            <CheckIcon className={cn("mt-0.5", tone === "good" ? "text-good" : "text-brand")} />
          )}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
