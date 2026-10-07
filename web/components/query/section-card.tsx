// SectionCard: a top-level section of a query tab: an 18px h2 heading with a muted line and optional
// controls, and a white card below with flush content (lists and tables bring their own padding and
// dividers). Same heading pattern as the Brief tab and docs/brand.md ("section headings at 18px 600
// with cards below").
import type { ReactNode } from "react";
import { Card, SectionHeading } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface SectionCardProps {
  /** Anchor id; the heading gets `${id}-label`. */
  id: string;
  label: ReactNode;
  description?: ReactNode;
  /** Right side of the heading (legend, controls). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Classes for the card under the heading. */
  bodyClassName?: string;
}

export function SectionCard({ id, label, description, action, children, className, bodyClassName }: SectionCardProps) {
  return (
    <section id={id} aria-labelledby={`${id}-label`} className={cn("flex scroll-mt-20 flex-col gap-3", className)}>
      <SectionHeading id={`${id}-label`} title={label} description={description} action={action} />
      <Card padding="none" className={cn("flex-1 overflow-hidden", bodyClassName)}>
        {children}
      </Card>
    </section>
  );
}

/** Muted note inside a section card when it has nothing to show yet. */
export function SectionEmpty({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("p-5", className)}>
      <p className="rounded-lg bg-surface-alt px-4 py-3 text-sm leading-6 text-ink-muted">{children}</p>
    </div>
  );
}
