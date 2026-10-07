"use client";
// Sideways-scrolling containers that show they scroll: the edge with hidden content fades out, and an
// optional hint says so while anything is hidden. Used by the tab bar and the coverage matrix on phones.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/cn";

const FADE = "32px";

export interface ScrollEdges {
  /** Content is hidden to the left. */
  start: boolean;
  /** Content is hidden to the right. */
  end: boolean;
}

/** Tracks whether a horizontally scrolling element has content hidden at either edge. */
export function useScrollEdges(ref: RefObject<HTMLElement | null>): ScrollEdges {
  const [edges, setEdges] = useState<ScrollEdges>({ start: false, end: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [ref]);
  return edges;
}

/** A mask that fades the edges with hidden content (only the end edge with `endOnly`). */
export function fadeMask({ start, end }: ScrollEdges, endOnly = false): CSSProperties | undefined {
  const fadeStart = start && !endOnly;
  if (!fadeStart && !end) return undefined;
  const image = `linear-gradient(to right, ${fadeStart ? `transparent, #000 ${FADE}` : "#000, #000"}, ${end ? `#000 calc(100% - ${FADE}), transparent` : "#000"})`;
  return { maskImage: image, WebkitMaskImage: image };
}

export interface ScrollFadeProps {
  children: ReactNode;
  className?: string;
  /** Fade only the right edge (for content with a sticky first column). */
  endOnly?: boolean;
  /** Shown under the scroller while content is hidden to the right, e.g. "Scroll sideways for all 10 pages". */
  hint?: ReactNode;
  hintClassName?: string;
}

/** A sideways scroller (overflow-x-auto) with edge fades and an optional hint. */
export function ScrollFade({ children, className, endOnly = false, hint, hintClassName }: ScrollFadeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(ref);
  return (
    <>
      <div ref={ref} className={cn("overflow-x-auto", className)} style={fadeMask(edges, endOnly)}>
        {children}
      </div>
      {hint && edges.end && <p className={cn("mt-2 text-xs text-ink-muted", hintClassName)}>{hint}</p>}
    </>
  );
}
