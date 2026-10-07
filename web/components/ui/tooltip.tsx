"use client";
// Tooltip: a small dark label shown on hover and keyboard focus.
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TooltipProps {
  /** Tooltip text. Keep it short. */
  content: ReactNode;
  /** The element the tooltip describes. */
  children: ReactNode;
  side?: "top" | "bottom";
  /**
   * Make the wrapper focusable so keyboard users can reach the tooltip (default true).
   * Set false when the child is already a button or link.
   */
  focusable?: boolean;
  className?: string;
}

/** Wraps children and shows `content` above (or below) on hover/focus. */
export function Tooltip({ content, children, side = "top", focusable = true, className }: TooltipProps) {
  const id = useId();
  return (
    <span
      className={cn("group/tip relative inline-flex", className)}
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={id}
    >
      {children}
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute left-1/2 z-40 w-max max-w-64 -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-xs font-normal leading-snug text-white opacity-0 shadow-pop transition-opacity",
          "group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        )}
      >
        {content}
      </span>
    </span>
  );
}
