// Formatting helpers: percentages with sample size, counts, dates (UTC and the viewer's locale) and labels.
// Every function is pure and safe on the server and in the browser. Server output uses en-US and UTC so
// it never differs between renders; <LocalTime> (components/ui/local-time.tsx) switches to the viewer's
// locale and time zone after hydration.

import type { Bucket, Confidence, Device, MatchLevel, ReportKind, ReportStage, TrackedQueryStatus } from "./types";

const DASH = "–";

const intCache = new Map<string, Intl.NumberFormat>();
function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + JSON.stringify(options);
  let f = intCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, options);
    intCache.set(key, f);
  }
  return f;
}

function isNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

// ------------------------------------------------------------------ numbers

/** A 0..1 share as a percentage: 0.8214 -> "82%". Null, undefined and NaN give "–". */
export function formatPercent(share: number | null | undefined, digits = 0): string {
  if (!isNum(share)) return DASH;
  const pct = share * 100;
  // Never show 100% for a share that isn't exactly 1, or 0% for one that isn't exactly 0.
  let rounded = Number(pct.toFixed(digits));
  const step = 1 / 10 ** digits;
  if (rounded >= 100 && share < 1) rounded = 100 - step;
  if (rounded <= 0 && share > 0) rounded = step;
  return `${rounded.toFixed(digits)}%`;
}

/** A share with its sample size, the app's standard for every metric: "82% · n=56". */
export function formatShare(share: number | null | undefined, n: number | null | undefined, digits = 0): string {
  return `${formatPercent(share, digits)} · n=${isNum(n) ? formatCount(n) : DASH}`;
}

/** An integer count with thousands separators: 1234 -> "1,234". */
export function formatCount(n: number | null | undefined): string {
  if (!isNum(n)) return DASH;
  return numberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

/** A decimal with a fixed number of digits: 2.456 -> "2.5". */
export function formatDecimal(n: number | null | undefined, digits = 1): string {
  if (!isNum(n)) return DASH;
  return numberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/** A compact count for tight spaces: 12400 -> "12.4K". */
export function formatCompact(n: number | null | undefined): string {
  if (!isNum(n)) return DASH;
  return numberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** "1 render", "56 renders". Pass the plural form when it isn't singular + "s". */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatCount(n)} ${n === 1 ? singular : pluralForm}`;
}

// ------------------------------------------------------------------ dates

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  // Bare dates (YYYY-MM-DD) are UTC days.
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Oct 7, 2026" in UTC. */
export function formatDateUTC(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return DASH;
  return d.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });
}

/** "Oct 7, 2026, 13:02 UTC". */
export function formatDateTimeUTC(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return DASH;
  const date = formatDateUTC(d);
  const time = d.toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time} UTC`;
}

/** A UTC day for charts and daily lists: "2026-10-07" -> "Oct 7". */
export function formatDayUTC(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return DASH;
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
}

/** A date in a given locale and time zone (defaults: the runtime's). "Oct 7, 2026". */
export function formatDate(value: string | number | Date | null | undefined, locale?: string, timeZone?: string): string {
  const d = toDate(value);
  if (!d) return DASH;
  return d.toLocaleDateString(locale, { timeZone, year: "numeric", month: "short", day: "numeric" });
}

/** A date and time in a given locale and time zone (defaults: the runtime's). "Oct 7, 2026, 9:02 AM". */
export function formatDateTime(value: string | number | Date | null | undefined, locale?: string, timeZone?: string): string {
  const d = toDate(value);
  if (!d) return DASH;
  return d.toLocaleString(locale, {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.34524],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

/** "3 hours ago", "in 2 days", "just now". */
export function formatRelative(value: string | number | Date | null | undefined, now: number = Date.now(), locale = "en-US"): string {
  const d = toDate(value);
  if (!d) return DASH;
  let delta = (d.getTime() - now) / 1000;
  if (Math.abs(delta) < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(delta) < size) return rtf.format(Math.round(delta), unit);
    delta /= size;
  }
  return formatDate(d, locale);
}

/** Whole UTC days between two instants (b - a), floored. */
export function daysBetween(a: string | number | Date, b: string | number | Date = Date.now()): number {
  const da = toDate(a);
  const db = toDate(b);
  if (!da || !db) return 0;
  return Math.floor((db.getTime() - da.getTime()) / 86_400_000);
}

// ------------------------------------------------------------------ labels

const languageNames = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" });
  } catch {
    return null;
  }
})();

/** "en" -> "English". Falls back to the code. */
export function languageName(code: string | null | undefined): string {
  if (!code) return DASH;
  try {
    return languageNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** "desktop" -> "Desktop". */
export function deviceLabel(device: Device | string | null | undefined): string {
  if (device === "desktop") return "Desktop";
  if (device === "mobile") return "Mobile";
  return device ? String(device) : DASH;
}

export const STATUS_LABELS: Record<TrackedQueryStatus, string> = {
  tracking: "Tracking",
  watching: "Watching",
  paused: "Paused",
};

export const MATCH_LEVEL_LABELS: Record<MatchLevel, string> = {
  exact_url: "Exact URL",
  path_prefix: "Same section",
  same_host: "Same subdomain",
  same_domain: "Same domain",
};

/** "exact_url" -> "Exact URL"; unknown values are prettified. */
export function matchLevelLabel(level: string | null | undefined): string {
  if (!level) return "Not cited";
  return (MATCH_LEVEL_LABELS as Record<string, string>)[level] ?? humanize(level);
}

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  preliminary: "Preliminary report",
  full: "Full report",
  refresh: "Day-28 refresh",
};

export const REPORT_STAGE_LABELS: Record<ReportStage, string> = {
  pages: "Studying cited pages",
  brief: "Writing the brief",
  ready: "Ready",
  failed: "Failed",
};

export const BUCKET_LABELS: Record<Bucket, string> = {
  core: "Core",
  recurring: "Recurring",
  rotating: "Rotating",
};

/** Survival bucket for a share: core >= 0.8, recurring >= 0.4, rotating below. */
export function bucketForShare(share: number): Bucket {
  if (share >= 0.8) return "core";
  if (share >= 0.4) return "recurring";
  return "rotating";
}

/** Confidence for a number of non-error renders: low < 10, medium 10 to 20, high > 20. */
export function confidenceForRenders(n: number): Confidence {
  if (n < 10) return "low";
  if (n <= 20) return "medium";
  return "high";
}

/** "best_for_labels" -> "Best for labels". */
export function humanize(value: string): string {
  const s = value.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The host of a URL without "www.", or the input when it isn't a URL. */
export function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Shortens text to max characters on a word boundary, adding an ellipsis. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
