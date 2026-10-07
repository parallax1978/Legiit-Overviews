// 28-day citation strip for the Tracking tab: one column per UTC day, its height the share of that day's
// overviews citing the user's page, its colour the closest match level, with a dot when the brand was named.
// Each column shows its numbers in a tooltip on hover or focus (tap on phones).
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatDayUTC, formatPercent, matchLevelLabel, plural } from "@/lib/format";
import type { MatchLevel, TrackingDay } from "@/lib/types";

const DAYS = 28;

/** Bar colour per match level, closest first. Shared with the legend. */
export const LEVEL_FILL: Record<MatchLevel, string> = {
  exact_url: "bg-good",
  path_prefix: "bg-good/50",
  same_host: "bg-brand",
  same_domain: "bg-brand/45",
};

const LEVEL_ORDER: MatchLevel[] = ["exact_url", "path_prefix", "same_host", "same_domain"];

interface Column extends TrackingDay {
  /** True for days before the first capture, padded so the strip always spans 28 days. */
  empty: boolean;
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** The last 28 days ending today (UTC), filled from the summary's daily rows. */
function columns(daily: TrackingDay[]): Column[] {
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const last = daily.length ? daily[daily.length - 1].day : new Date().toISOString().slice(0, 10);
  return Array.from({ length: DAYS }, (_, i) => {
    const day = addDays(last, i - (DAYS - 1));
    const d = byDay.get(day);
    return d ? { ...d, empty: false } : { day, renders: 0, present: 0, cited: 0, best_level: null, brand: 0, empty: true };
  });
}

function describe(c: Column, brandTracked: boolean): string {
  const day = formatDayUTC(c.day);
  if (c.empty || c.renders === 0) return `${day}: no captures`;
  if (c.present === 0) return `${day}: no AI Overview in ${plural(c.renders, "capture")}`;
  const parts = [`${day}: cited in ${c.cited} of ${plural(c.present, "overview")} (${formatPercent(c.cited / c.present)})`];
  if (c.best_level) parts.push(`closest match ${matchLevelLabel(c.best_level)}`);
  if (brandTracked) parts.push(c.brand > 0 ? `brand named in ${c.brand}` : "brand not named");
  return parts.join(" · ");
}

export function TrackingStrip({ daily, brandTracked }: { daily: TrackingDay[]; brandTracked: boolean }) {
  const cols = columns(daily);
  const anyData = cols.some((c) => !c.empty && c.renders > 0);

  return (
    <Card padding="lg">
      <CardHeader
        title="Last 28 days"
        description="One column per day (UTC). Height is the share of that day's AI Overviews that cited your page; colour is the closest match."
      />
      {!anyData ? (
        <p className="mt-5 rounded-lg bg-surface-alt px-4 py-6 text-center text-sm text-ink-muted">
          No captures in the last 28 days yet. Days fill in as captures arrive, 8 a day.
        </p>
      ) : (
        <>
          <div className="mt-6 flex h-28 items-stretch gap-[2px] sm:gap-1" role="list" aria-label="Citations per day, last 28 days">
            {cols.map((c, i) => {
              const share = c.present > 0 ? c.cited / c.present : 0;
              const label = describe(c, brandTracked);
              // Edge columns anchor their tooltip inwards so it never spills past the screen on phones.
              const align = i < 10 ? "left-0" : i > DAYS - 11 ? "right-0" : "left-1/2 -translate-x-1/2";
              return (
                <div
                  key={c.day}
                  role="listitem"
                  tabIndex={0}
                  aria-label={label}
                  className="group/day relative flex min-w-0 flex-1 cursor-default flex-col items-center gap-1.5 rounded-sm outline-offset-1"
                >
                  <div
                    className={cn(
                      "relative w-full flex-1 overflow-hidden rounded-sm",
                      c.empty || c.renders === 0 ? "bg-transparent" : c.present === 0 ? "bg-surface-sunken/50" : "bg-surface-sunken",
                      "group-hover/day:ring-1 group-hover/day:ring-line-strong group-focus/day:ring-1 group-focus/day:ring-brand",
                    )}
                  >
                    {(c.empty || c.renders === 0) && <div className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-line-strong" />}
                    {c.cited > 0 && (
                      <div
                        className={cn("absolute inset-x-0 bottom-0 rounded-sm", c.best_level ? LEVEL_FILL[c.best_level] : "bg-ink-soft")}
                        style={{ height: `${Math.max(6, share * 100)}%` }}
                      />
                    )}
                  </div>
                  <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", c.brand > 0 ? "bg-brand" : "bg-transparent")} />
                  <span
                    role="tooltip"
                    className={cn(
                      "pointer-events-none absolute bottom-full z-40 mb-1.5 w-max max-w-56 rounded-md bg-ink px-2 py-1 text-xs leading-snug text-white opacity-0 shadow-pop transition-opacity",
                      "group-hover/day:opacity-100 group-focus/day:opacity-100",
                      align,
                    )}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-ink-soft tabular-nums" aria-hidden="true">
            <span>{formatDayUTC(cols[0].day)}</span>
            <span>{formatDayUTC(cols[Math.floor(DAYS / 2)].day)}</span>
            <span>{formatDayUTC(cols[DAYS - 1].day)}</span>
          </div>
        </>
      )}
      <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-4 text-xs text-ink-muted" aria-label="Legend">
        {LEVEL_ORDER.map((level) => (
          <li key={level} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("h-2.5 w-2.5 rounded-sm", LEVEL_FILL[level])} />
            {matchLevelLabel(level)}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-surface-sunken ring-1 ring-inset ring-line" />
          Not cited
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-2.5 rounded-full bg-line-strong" />
          No captures
        </li>
        {brandTracked && (
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" />
            Brand named
          </li>
        )}
      </ul>
    </Card>
  );
}
