// Card family: white 12px-radius panels with a line border, plus header, section and browser-frame variants.
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Padding = "none" | "sm" | "md" | "lg";

const PADDING: Record<Padding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-5 sm:p-6",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** none | sm 16px | md 20px | lg 20px, 24px from sm. Default md. */
  padding?: Padding;
  /** Tinted surface (surface-alt) instead of white, as in "How it works" step cards. */
  tinted?: boolean;
  /** Raised shadow for floating cards. */
  raised?: boolean;
}

/** White card: 1px line border, 12px radius, soft shadow. */
export function Card({ padding = "md", tinted = false, raised = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-line",
        tinted ? "bg-surface-alt" : "bg-white",
        raised ? "shadow-pop" : "shadow-card",
        PADDING[padding],
        className,
      )}
      {...props}
    />
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  /** Small uppercase label above the title. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Right-aligned buttons or chips. */
  action?: ReactNode;
  /** Heading level for the title. Default h3. */
  as?: "h2" | "h3" | "h4";
  className?: string;
}

/** Title row inside a card: optional eyebrow, 16px bold title, muted description, right-side action. */
export function CardHeader({ title, eyebrow, description, action, as: Heading = "h3", className }: CardHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="eyebrow text-brand">{eyebrow}</p>}
        <Heading className={cn("text-base font-bold tracking-tight text-ink", eyebrow ? "mt-1" : "")}>{title}</Heading>
        {description && <p className="mt-1 text-sm leading-6 text-ink-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/** A full-bleed section inside a padding="none" card, separated from the previous one by a line. */
export function CardSection({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-t border-line p-5 first:border-t-0", className)} {...props} />;
}

export interface BrowserCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Text in the address pill, e.g. "Legiit Overviews · best crm · Patterns". */
  label: string;
  /** Classes for the body under the bar. */
  bodyClassName?: string;
  /** No body padding (for content with its own sections). */
  flush?: boolean;
}

/** Marketing "browser frame": a 36px surface-alt bar with three dots and a page-name pill. */
export function BrowserCard({ label, bodyClassName, flush = false, className, children, ...props }: BrowserCardProps) {
  return (
    <div className={cn("overflow-hidden rounded-card border border-line bg-white shadow-card", className)} {...props}>
      <div className="flex items-center gap-2 border-b border-line bg-surface-alt px-3 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        </span>
        <span className="ml-1 min-w-0 truncate rounded-md bg-white px-2 py-0.5 text-[11px] text-ink-muted ring-1 ring-inset ring-line">
          {label}
        </span>
      </div>
      <div className={cn(!flush && "p-4 sm:p-5", bodyClassName)}>{children}</div>
    </div>
  );
}
