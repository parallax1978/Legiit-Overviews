// Chips: rounded status pills with a dot (good, warn, bad, brand, grey), query status, survival bucket,
// confidence, match level and grey keyword tags.
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BUCKET_LABELS, matchLevelLabel, STATUS_LABELS } from "@/lib/format";
import type { Bucket, Confidence, TrackedQueryStatus } from "@/lib/types";

export type ChipTone = "good" | "warn" | "bad" | "brand" | "grey" | "ink";

const TONES: Record<ChipTone, { chip: string; dot: string }> = {
  good: { chip: "bg-good-soft text-good ring-good-soft", dot: "bg-good" },
  warn: { chip: "bg-warn-soft text-warn ring-warn-soft", dot: "bg-warn" },
  bad: { chip: "bg-bad-soft text-bad ring-bad-soft", dot: "bg-bad" },
  brand: { chip: "bg-brand-faint text-brand-strong ring-brand-soft", dot: "bg-brand" },
  grey: { chip: "bg-surface-sunken text-ink-muted ring-line", dot: "bg-ink-soft" },
  ink: { chip: "bg-ink text-white ring-ink", dot: "bg-white" },
};

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  /** 6px dot in the text colour before the label. */
  dot?: boolean;
  /** Icon before the label (replaces the dot). */
  icon?: ReactNode;
  /** sm: 11px text, tighter padding. */
  size?: "sm" | "md";
}

/** Rounded-full 12px chip with an optional dot. */
export function Chip({ tone = "grey", dot = false, icon, size = "md", className, children, ...props }: ChipProps) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset",
        size === "md" ? "px-2 py-0.5 text-xs" : "px-1.5 py-px text-[11px]",
        t.chip,
        className,
      )}
      {...props}
    >
      {icon ?? (dot && <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", t.dot)} />)}
      {children}
    </span>
  );
}

export interface StatusChipProps extends Omit<ChipProps, "tone" | "dot" | "children"> {
  /** tracking (green), watching (amber), paused (grey). */
  status: TrackedQueryStatus;
}

const STATUS_TONES: Record<TrackedQueryStatus, ChipTone> = { tracking: "good", watching: "warn", paused: "grey" };

/** A tracked query's status: Tracking, Watching or Paused, with a dot. */
export function StatusChip({ status, ...props }: StatusChipProps) {
  return (
    <Chip tone={STATUS_TONES[status] ?? "grey"} dot {...props}>
      {STATUS_LABELS[status] ?? status}
    </Chip>
  );
}

export interface BucketChipProps extends Omit<ChipProps, "tone" | "dot" | "children"> {
  /** core >= 80% (green), recurring 40 to 80% (brand), rotating < 40% (grey). */
  bucket: Bucket;
}

const BUCKET_TONES: Record<Bucket, ChipTone> = { core: "good", recurring: "brand", rotating: "grey" };

/** Source survival bucket in uppercase: CORE, RECURRING, ROTATING. */
export function BucketChip({ bucket, className, ...props }: BucketChipProps) {
  return (
    <Chip tone={BUCKET_TONES[bucket] ?? "grey"} dot className={cn("text-[11px] font-semibold uppercase tracking-wide", className)} {...props}>
      {BUCKET_LABELS[bucket] ?? bucket}
    </Chip>
  );
}

export interface ConfidenceChipProps extends Omit<ChipProps, "tone" | "dot" | "children"> {
  confidence: Confidence;
}

const CONFIDENCE_TONES: Record<Confidence, ChipTone> = { high: "good", medium: "warn", low: "grey" };

/** "High confidence" (over 20 renders), "Medium" (10 to 20), "Low" (under 10). */
export function ConfidenceChip({ confidence, ...props }: ConfidenceChipProps) {
  const label = confidence.charAt(0).toUpperCase() + confidence.slice(1);
  return (
    <Chip tone={CONFIDENCE_TONES[confidence] ?? "grey"} dot {...props}>
      {label} confidence
    </Chip>
  );
}

export interface LevelChipProps extends Omit<ChipProps, "tone" | "dot" | "children"> {
  /** Own-page match level; null shows "Not cited". */
  level: string | null | undefined;
  /** Prefix the label with "Cited: ". Default true. */
  prefix?: boolean;
}

/** Own-page citation level: exact URL and same section in green, wider matches in brand, none in grey. */
export function LevelChip({ level, prefix = true, ...props }: LevelChipProps) {
  const tone: ChipTone = !level ? "grey" : level === "exact_url" || level === "path_prefix" ? "good" : "brand";
  return (
    <Chip tone={tone} dot {...props}>
      {level && prefix ? `Cited: ${matchLevelLabel(level)}` : matchLevelLabel(level)}
    </Chip>
  );
}

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** Muted trailing value, e.g. a search volume. */
  value?: ReactNode;
}

/** Grey keyword tag with an optional muted value: "arabica beans 74,000". */
export function Tag({ value, className, children, ...props }: TagProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md bg-surface-sunken px-2 py-0.5 text-xs text-ink", className)} {...props}>
      {children}
      {value !== undefined && <span className="text-ink-soft tabular-nums">{value}</span>}
    </span>
  );
}
