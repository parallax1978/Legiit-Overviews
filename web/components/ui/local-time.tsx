"use client";
// LocalTime and useIsClient: show times in the viewer's locale and time zone without hydration mismatches.
import { useSyncExternalStore } from "react";
import { formatDate, formatDateTime, formatDateTimeUTC, formatDateUTC, formatRelative } from "@/lib/format";

const noopSubscribe = () => () => {};

/** False during server rendering and hydration, true afterwards. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

// One shared clock for relative times, ticking every 30 seconds while anything is subscribed.
let clockNow = 0;
let clockTimer: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();

function subscribeClock(listener: () => void): () => void {
  clockListeners.add(listener);
  if (!clockTimer) {
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      for (const l of clockListeners) l();
    }, 30_000);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

/** The current time in ms, refreshed every 30 seconds; 0 during server rendering and hydration. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeClock,
    () => clockNow || (clockNow = Date.now()),
    () => 0,
  );
}

export interface LocalTimeProps {
  /** ISO timestamp (or YYYY-MM-DD for a UTC day). */
  value: string | null | undefined;
  /** date "Oct 7, 2026", datetime "Oct 7, 2026, 9:02 AM" (default), relative "3 hours ago". */
  format?: "date" | "datetime" | "relative";
  className?: string;
}

/**
 * A <time> element. The server renders UTC; after hydration it switches to the viewer's locale
 * (or a relative time). The tooltip always shows the exact UTC time.
 */
export function LocalTime({ value, format = "datetime", className }: LocalTimeProps) {
  const isClient = useIsClient();
  const now = useNow();
  if (!value) return <span className={className}>–</span>;
  let text: string;
  if (!isClient) {
    text = format === "date" ? formatDateUTC(value) : formatDateTimeUTC(value);
  } else if (format === "date") {
    text = formatDate(value);
  } else if (format === "relative") {
    text = formatRelative(value, now || undefined, Intl.DateTimeFormat().resolvedOptions().locale);
  } else {
    text = formatDateTime(value);
  }
  return (
    <time dateTime={value} title={formatDateTimeUTC(value)} className={className}>
      {text}
    </time>
  );
}
