"use client";
// Hint: the shared Tooltip's look, but removed from layout while hidden (display: none) and alignable to
// the start or end of its anchor. The shared Tooltip is only transparent while hidden, so a label near
// the right edge widens the page; Hint is for dense, edge-adjacent anchors (citation chips, timeline
// slots, matrix headers).
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface HintProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  /** center (default) on the anchor, or start/end edges aligned with it. */
  align?: "center" | "start" | "end";
  /** Make the wrapper focusable (default false; anchors are usually links or buttons). */
  focusable?: boolean;
  className?: string;
}

export function Hint({ content, children, side = "top", align = "center", focusable = false, className }: HintProps) {
  const id = useId();
  return (
    <span className={cn("group/hint relative inline-flex", className)} tabIndex={focusable ? 0 : undefined} aria-describedby={id}>
      {children}
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute z-40 hidden w-max max-w-[min(16rem,calc(100vw-2rem))] rounded-md bg-ink px-2 py-1 text-left text-xs font-normal leading-snug text-white shadow-pop",
          "group-hover/hint:block group-focus-within/hint:block",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
          align === "center" && "left-1/2 -translate-x-1/2",
          align === "start" && "left-0",
          align === "end" && "right-0",
        )}
      >
        {content}
      </span>
    </span>
  );
}
