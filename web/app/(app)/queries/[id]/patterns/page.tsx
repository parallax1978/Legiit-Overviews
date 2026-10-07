// Patterns tab: what keeps showing up in the overview over a window (7 days, 28 days, since start), every
// share with its n and opening the captures behind it. Counts come from series_metrics in SQL.
import {
  ClaimsSection,
  DailySection,
  EntitiesSection,
  FormatsSection,
  OverlapSection,
  SourcesSection,
  UnsupportedSection,
  type WindowRef,
} from "@/components/query/patterns-sections";
import { cutFirstDay } from "@/components/query/day-diff";
import { HashScroll } from "@/components/query/hash-scroll";
import { ShareValue } from "@/components/query/share-value";
import { WindowControl } from "@/components/query/window-control";
import {
  ActivityIcon,
  Alert,
  BarChartIcon,
  ConfidenceChip,
  EmptyState,
  ErrorCard,
  LinkIcon,
  LocalTime,
  OverviewGlyph,
  RefreshIcon,
  RetryButton,
  StatCard,
  StatGrid,
} from "@/components/ui";
import { formatCount, formatShare, plural } from "@/lib/format";
import { getTrackedQuery } from "@/lib/queries";
import { getSeriesMetrics, getUnreadRenders } from "@/lib/query/metrics";
import { currentTime, parseWindow } from "@/lib/query/window";

export const metadata = { title: "Patterns" };

export default async function PatternsTab({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { data: q } = await getTrackedQuery(id);
  if (!q) return null;

  const now = currentTime();
  const win = parseWindow(sp.window, q.first_captured_at, now);
  const path = `/queries/${q.id}/patterns`;
  const [res, unread] = await Promise.all([getSeriesMetrics(q.series.id, win.from, win.to), getUnreadRenders(q.series.id, win.from, win.to)]);
  const w: WindowRef = { seriesId: q.series.id, from: win.from, to: win.to };

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{win.label}</h2>
        <p className="mt-0.5 text-sm text-ink-muted">
          <LocalTime value={win.from} format="date" /> to <LocalTime value={win.to} format="date" />
          {res.data && <> · n={formatCount(res.data.renders)} renders, {formatCount(res.data.present)} with an overview</>}
        </p>
      </div>
      <WindowControl path={path} value={win.key} className="self-start sm:self-auto" />
    </div>
  );

  const intro = (
    <Alert tone="brand" title="How these numbers are made">
      Claude reads each capture and matches its claims, brands and sources to the ones seen before. The database does all the counting. Click any
      percentage to open the captures and sentences behind it.
      {win.defaulted && win.key === "all" && " This query has less than 7 days of history, so the window starts at the first capture."}
      {unread ? (
        <>
          {" "}
          <strong className="font-semibold">
            {plural(unread, "render")} {unread === 1 ? "is" : "are"} still being read,
          </strong>{" "}
          so claim, brand and format shares are slightly low until {unread === 1 ? "it is" : "they are"} done, usually within the hour.
        </>
      ) : null}
    </Alert>
  );

  if (!res.data) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorCard title="The patterns didn't load" detail={res.error} action={<RetryButton />}>
          We couldn&rsquo;t compute the numbers for this window just now. Try again in a moment.
        </ErrorCard>
      </div>
    );
  }

  const m = res.data;

  if (m.present === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={<OverviewGlyph />}
          title={m.renders ? "No AI Overview in this window" : "No captures in this window yet"}
          body={
            m.renders
              ? `Google showed no overview in ${plural(m.renders, "capture")} here. Patterns appear once overviews do; a longer window may have some.`
              : "We capture this search every 3 hours. Patterns appear after the first captures with an AI Overview."
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      {intro}
      <HashScroll />

      <StatGrid>
        <StatCard
          label="Renders"
          icon={<ActivityIcon />}
          value={formatCount(m.renders)}
          caption={
            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <ConfidenceChip confidence={m.confidence} size="sm" />
              {m.errors > 0 && <span>{plural(m.errors, "failed capture")} not counted</span>}
            </span>
          }
        />
        <StatCard
          label="Overview shown"
          icon={<OverviewGlyph className="text-brand" />}
          tone="brand"
          value={<ShareValue share={m.presence_rate} n={m.renders} />}
          caption="Renders with an AI Overview"
        />
        <StatCard
          label="Change rate"
          icon={<RefreshIcon />}
          value={<ShareValue share={m.change_rate} n={m.renders > 1 ? m.renders - 1 : 0} />}
          caption="Renders that differ from the one before"
        />
        <StatCard
          label="Citation stability"
          icon={<LinkIcon />}
          value={<ShareValue share={m.citation_stability.url} n={m.present} />}
          caption={`URLs; domains ${formatShare(m.citation_stability.domain, m.present)}`}
        />
      </StatGrid>

      <ClaimsSection m={m} w={w} />
      <EntitiesSection m={m} w={w} />
      <div className="grid gap-6 lg:grid-cols-2">
        <FormatsSection m={m} w={w} />
        <OverlapSection m={m} />
      </div>
      <SourcesSection m={m} w={w} />
      <DailySection m={m} now={now} cutDay={win.key === "all" ? null : cutFirstDay(win.from)} />
      <UnsupportedSection m={m} w={w} />

      <p className="flex items-start gap-2 text-xs leading-5 text-ink-muted">
        <BarChartIcon className="mt-0.5 h-3.5 w-3.5 text-ink-soft" />
        <span>
          Shares are over renders with an overview (n). Failed captures are left out of every rate. Survival buckets: Core 80% or more, Recurring 40
          to 80%, Rotating under 40%.
        </span>
      </p>
    </div>
  );
}
