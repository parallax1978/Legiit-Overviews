// ProgressBar: 6px rounded meter, brand fill on surface-sunken, for shares and progress.
import { cn } from "@/lib/cn";

export type ProgressTone = "brand" | "good" | "warn" | "bad" | "ink";

const FILL: Record<ProgressTone, string> = {
  brand: "bg-brand",
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  ink: "bg-ink-muted",
};

export interface ProgressBarProps {
  /** Value from 0 to max (default max 1, so shares pass straight in). Null renders an empty track. */
  value: number | null | undefined;
  max?: number;
  tone?: ProgressTone;
  /** sm 4px, md 6px (default), lg 8px. */
  size?: "sm" | "md" | "lg";
  /** Accessible name, e.g. "Presence rate, last 7 days". */
  label?: string;
  /** Text read by screen readers instead of the raw number, e.g. "82% · n=56". */
  valueText?: string;
  className?: string;
}

/** Horizontal meter. Width follows the parent; set a width with className (e.g. "w-24"). */
export function ProgressBar({ value, max = 1, tone = "brand", size = "md", label, valueText, className }: ProgressBarProps) {
  const v = typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(value, 0), max) : 0;
  const pct = max > 0 ? (v / max) * 100 : 0;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={valueText}
      className={cn(
        "w-full overflow-hidden rounded-full bg-surface-sunken",
        size === "sm" && "h-1",
        size === "md" && "h-1.5",
        size === "lg" && "h-2",
        className,
      )}
    >
      <div className={cn("h-full rounded-full", FILL[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}
