// WindowControl: the metric window selector (7 days, 28 days, since start) as links styled like
// SegmentedControl, so the window lives in the URL and works without JavaScript.
import Link from "next/link";
import { cn } from "@/lib/cn";
import { WINDOW_KEYS, WINDOW_SHORT_LABELS, windowHref, type WindowKey } from "@/lib/query/window";

export interface WindowControlProps {
  /** Path of the tab, e.g. /queries/<id>/patterns. */
  path: string;
  value: WindowKey;
  className?: string;
}

export function WindowControl({ path, value, className }: WindowControlProps) {
  return (
    <nav aria-label="Time window" className={cn("inline-flex rounded-full bg-surface-sunken p-1", className)}>
      {WINDOW_KEYS.map((key) => {
        const active = key === value;
        return (
          <Link
            key={key}
            href={windowHref(path, key)}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex select-none items-center justify-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors sm:px-4 sm:py-1.5 sm:text-sm",
              active ? "bg-white text-ink shadow-sm ring-1 ring-line" : "text-ink-muted hover:text-ink",
            )}
          >
            {WINDOW_SHORT_LABELS[key]}
          </Link>
        );
      })}
    </nav>
  );
}
