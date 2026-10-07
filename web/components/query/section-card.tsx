// SectionCard: a white card opened by an uppercase section label and a muted line, with flush content
// (lists and tables bring their own padding and dividers).
import type { ReactNode } from "react";
import { Card, SectionLabel } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface SectionCardProps {
  /** Anchor id; the label gets `${id}-label`. */
  id: string;
  label: ReactNode;
  description?: ReactNode;
  /** Right side of the header (legend, controls). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Classes for the body wrapper. */
  bodyClassName?: string;
}

export function SectionCard({ id, label, description, action, children, className, bodyClassName }: SectionCardProps) {
  return (
    <Card padding="none" className={cn("scroll-mt-20", className)} id={id}>
      <section aria-labelledby={`${id}-label`}>
        <div className="flex flex-col gap-x-4 gap-y-2 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 sm:flex-1">
            <SectionLabel id={`${id}-label`} role="heading" aria-level={2}>
              {label}
            </SectionLabel>
            {description && <div className="mt-1 text-sm leading-6 text-ink-muted">{description}</div>}
          </div>
          {action && <div className="flex flex-wrap items-center gap-2 sm:max-w-[50%] sm:shrink-0">{action}</div>}
        </div>
        <div className={cn("mt-4", bodyClassName)}>{children}</div>
      </section>
    </Card>
  );
}

/** Muted note inside a section card when it has nothing to show yet. */
export function SectionEmpty({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("px-5 pb-5", className)}>
      <p className="rounded-lg bg-surface-alt px-4 py-3 text-sm leading-6 text-ink-muted">{children}</p>
    </div>
  );
}
