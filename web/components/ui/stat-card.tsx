// StatCard and StatGrid: the 4-up metric cards (label, line icon, big number, caption).
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type StatTone = "brand" | "good" | "warn" | "bad" | "ink";

const VALUE_TONES: Record<StatTone, string> = {
  brand: "text-brand",
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  ink: "text-ink",
};

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  /** One muted line under the number. */
  caption?: ReactNode;
  /** Thin line icon top-right (e.g. <ActivityIcon />). */
  icon?: ReactNode;
  /** brand for the hero metric, good for good news, ink (default) otherwise. */
  tone?: StatTone;
  /** Makes the card a link. */
  href?: string;
  /** Makes the card a button (e.g. opens an evidence drawer). */
  onClick?: () => void;
  /** For a button card that opens a dialog. */
  "aria-haspopup"?: "dialog";
  /** Native tooltip, e.g. what clicking the card shows. */
  title?: string;
  className?: string;
}

/** Metric card: small muted label with icon, 24px bold number, 12px caption. */
export function StatCard({ label, value, caption, icon, tone = "ink", href, onClick, title, className, ...aria }: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] text-ink-muted">{label}</p>
        {icon && <span className="text-ink-soft">{icon}</span>}
      </div>
      <p className={cn("mt-2 text-2xl font-bold tracking-tight tabular-nums", VALUE_TONES[tone])}>{value}</p>
      {caption && <p className="mt-1 text-xs text-ink-muted">{caption}</p>}
    </>
  );
  const classes = cn(
    "block rounded-card border border-line bg-white p-4 text-left shadow-card",
    (href || onClick) && "transition-colors hover:border-line-strong hover:bg-surface-alt/50",
    className,
  );
  if (href) {
    return (
      <Link href={href} className={classes} title={title}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(classes, "w-full")} title={title} aria-haspopup={aria["aria-haspopup"]}>
        {body}
      </button>
    );
  }
  return (
    <div className={classes} title={title}>
      {body}
    </div>
  );
}

/** Row of stat cards: 2 columns on phones, 4 from md. */
export function StatGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-4", className)}>{children}</div>;
}
