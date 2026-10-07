// NumberBadge and NumberedList: the 28px numbered circle and the bordered list of numbered rows.
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface NumberBadgeProps {
  n: ReactNode;
  /** faint: brand-faint circle with brand number (rows). solid: brand circle, white number (steps). */
  tone?: "faint" | "solid";
  /** sm 24px, md 28px (default), lg 32px. */
  size?: "sm" | "md" | "lg";
  className?: string;
}

/** Numbered circle. */
export function NumberBadge({ n, tone = "faint", size = "md", className }: NumberBadgeProps) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums",
        tone === "faint" ? "bg-brand-faint text-brand-strong" : "bg-brand text-white",
        size === "sm" && "h-6 w-6 text-[11px]",
        size === "md" && "h-7 w-7 text-xs",
        size === "lg" && "h-8 w-8 text-sm",
        className,
      )}
    >
      {n}
    </span>
  );
}

/** Bordered, divided list container for numbered rows (an <ol>). */
export function NumberedList({ className, ...props }: HTMLAttributes<HTMLOListElement>) {
  return <ol className={cn("divide-y divide-line rounded-card border border-line bg-white", className)} {...props} />;
}

export interface NumberedRowProps {
  n: ReactNode;
  title: ReactNode;
  /** Small line above the title (e.g. a green action label). */
  overline?: ReactNode;
  /** Muted 12px line under the title. */
  meta?: ReactNode;
  /** Content under the meta line (progress bars, tags). */
  children?: ReactNode;
  /** Right-aligned chips. */
  aside?: ReactNode;
  /** On phones, show the aside chips in a row under the title instead of a column on the right. */
  stackAside?: boolean;
  className?: string;
}

/** One numbered row: circle, 15px semibold title, meta, and chips on the right. */
export function NumberedRow({ n, title, overline, meta, children, aside, stackAside = false, className }: NumberedRowProps) {
  return (
    <li className={cn("flex items-start gap-3 px-4 py-3.5", className)}>
      <NumberBadge n={n} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        {overline && <div className="text-[11px] font-semibold">{overline}</div>}
        <div className="text-[15px] font-semibold leading-snug text-ink">{title}</div>
        {aside && stackAside && <div className="mt-1.5 flex flex-wrap items-center gap-1 sm:hidden">{aside}</div>}
        {meta && <div className="mt-0.5 text-xs text-ink-muted">{meta}</div>}
        {children}
      </div>
      {aside && <div className={cn("shrink-0 flex-col items-end gap-1", stackAside ? "hidden sm:flex" : "flex")}>{aside}</div>}
    </li>
  );
}
