// Metric windows for the query tabs: ?window=7d|28d|all, ending at the next full hour so the bounds
// (and anything cached on them) stay stable for up to an hour.

export type WindowKey = "7d" | "28d" | "all";

export const WINDOW_KEYS: readonly WindowKey[] = ["7d", "28d", "all"];

const HOUR = 3_600_000;
const DAY = 86_400_000;

export const WINDOW_LABELS: Record<WindowKey, string> = {
  "7d": "Last 7 days",
  "28d": "Last 28 days",
  all: "Since start",
};

/** Short labels for the window selector. */
export const WINDOW_SHORT_LABELS: Record<WindowKey, string> = {
  "7d": "7 days",
  "28d": "28 days",
  all: "Since start",
};

export interface QueryWindow {
  key: WindowKey;
  /** Inclusive start, ISO. */
  from: string;
  /** Exclusive end, ISO: now rounded up to the next hour. */
  to: string;
  label: string;
  /** True when the key came from the default rule rather than the URL. */
  defaulted: boolean;
  /** Whole days between the first capture and now (0 before the first capture). */
  historyDays: number;
}

/** `now` rounded up to the next full hour (unchanged when already on the hour). */
export function windowEnd(now: number = Date.now()): Date {
  return new Date(Math.ceil(now / HOUR) * HOUR);
}

function isWindowKey(v: unknown): v is WindowKey {
  return typeof v === "string" && (WINDOW_KEYS as readonly string[]).includes(v);
}

/** Whole days of history since the first capture. */
export function historyDays(firstCapturedAt: string | null | undefined, now: number = Date.now()): number {
  if (!firstCapturedAt) return 0;
  const first = Date.parse(firstCapturedAt);
  if (Number.isNaN(first)) return 0;
  return Math.max(0, Math.floor((now - first) / DAY));
}

/**
 * Resolves the ?window= parameter. Without a valid value: 7d when the series has at least 7 days of
 * history, otherwise all. "all" starts at the hour of the first capture.
 */
export function parseWindow(
  param: string | string[] | undefined,
  firstCapturedAt: string | null | undefined,
  now: number = Date.now(),
): QueryWindow {
  const raw = Array.isArray(param) ? param[0] : param;
  const days = historyDays(firstCapturedAt, now);
  const defaulted = !isWindowKey(raw);
  const key: WindowKey = isWindowKey(raw) ? raw : days >= 7 ? "7d" : "all";
  return { key, ...windowBounds(key, firstCapturedAt, now), label: WINDOW_LABELS[key], defaulted, historyDays: days };
}

/** [from, to) for a window key. */
export function windowBounds(key: WindowKey, firstCapturedAt: string | null | undefined, now: number = Date.now()): { from: string; to: string } {
  const to = windowEnd(now);
  let from: number;
  if (key === "7d") from = to.getTime() - 7 * DAY;
  else if (key === "28d") from = to.getTime() - 28 * DAY;
  else {
    const first = firstCapturedAt ? Date.parse(firstCapturedAt) : Number.NaN;
    from = Number.isNaN(first) ? to.getTime() - 7 * DAY : Math.floor(first / HOUR) * HOUR;
  }
  return { from: new Date(from).toISOString(), to: to.toISOString() };
}

/** The href of a tab with a window parameter. */
export function windowHref(path: string, key: WindowKey): string {
  return `${path}?window=${key}`;
}

/** The current time in ms (the server's clock for one render). */
export function currentTime(): number {
  return Date.now();
}
