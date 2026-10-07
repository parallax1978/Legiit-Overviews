// Text primitives: Eyebrow, SectionLabel, Kicker, SectionHeading, PageHeader and LabelValue.
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EyebrowProps extends HTMLAttributes<HTMLParagraphElement> {
  /** brand on light backgrounds, soft (brand-soft) on plum. */
  tone?: "brand" | "soft";
}

/** 11px uppercase label with 0.18em tracking: "HOW IT WORKS". */
export function Eyebrow({ tone = "brand", className, ...props }: EyebrowProps) {
  return <p className={cn("eyebrow", tone === "brand" ? "text-brand" : "text-brand-soft", className)} {...props} />;
}

/** Uppercase 11px ink-soft label inside cards: "WHY THIS SITE CAN WIN IT". */
export function SectionLabel({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[11px] font-semibold uppercase tracking-wide text-ink-soft", className)} {...props} />;
}

/** Small uppercase muted kicker above an app page title: "AI OVERVIEW". */
export function Kicker({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs font-medium uppercase tracking-wide text-ink-muted", className)} {...props} />;
}

export interface SectionHeadingProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned controls. */
  action?: ReactNode;
  as?: "h2" | "h3";
  id?: string;
  className?: string;
}

/** 18px semibold heading for a section of an app page, with optional muted line and action. */
export function SectionHeading({ title, description, action, as: Heading = "h2", id, className }: SectionHeadingProps) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        <Heading id={id} className="text-lg font-semibold tracking-tight text-ink">
          {title}
        </Heading>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export interface PageHeaderProps {
  /** Uppercase muted line above the title. */
  kicker?: ReactNode;
  title: ReactNode;
  /** Muted meta line under the title: "United States · en · Desktop". */
  meta?: ReactNode;
  /** One-paragraph 18px summary. */
  summary?: ReactNode;
  /** Chips beside the title (status). */
  badges?: ReactNode;
  /** Buttons on the right. */
  actions?: ReactNode;
  className?: string;
}

/** App page header: kicker, 24px title with badges, meta line, optional summary, actions on the right. */
export function PageHeader({ kicker, title, meta, summary, badges, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0 flex-1">
        {kicker && <Kicker>{kicker}</Kicker>}
        <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", kicker ? "mt-1" : "")}>
          <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {badges}
        </div>
        {meta && <div className="mt-1.5 text-sm text-ink-muted">{meta}</div>}
        {summary && <p className="mt-3 text-lg leading-7 text-ink">{summary}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A " · " separated row of meta items that wraps cleanly. */
export function MetaList({ items, className }: { items: ReactNode[]; className?: string }) {
  const shown = items.filter((x) => x !== null && x !== undefined && x !== false && x !== "");
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}>
      {shown.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-x-1.5">
          {item}
          {i < shown.length - 1 && <span aria-hidden="true">·</span>}
        </span>
      ))}
    </span>
  );
}

export interface LabelValueProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Uppercase label over a value, for the 3-column rows in report cards ("DEMAND 222,000 a month"). */
export function LabelValue({ label, children, className }: LabelValueProps) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

/** Grid wrapper (a <dl>) for LabelValue items: 1 column on phones, 3 from sm. */
export function LabelValueGrid({ className, ...props }: HTMLAttributes<HTMLDListElement>) {
  return <dl className={cn("grid grid-cols-1 gap-4 sm:grid-cols-3", className)} {...props} />;
}
