// Live tab: the latest capture rebuilt as Google showed it (citation chips, sources), the 7-day stat row,
// the capture timeline, what changed on the latest day, and the organic top 10. Watching queries get the
// recent captures and when we check next.
import type { ReactNode } from "react";
import { CaptureStatusChip } from "@/components/query/capture-status";
import { DayDiff, completeDays, dayHasChanges } from "@/components/query/day-diff";
import { OrganicList } from "@/components/query/organic-list";
import { OverviewText, SourceList } from "@/components/query/overview";
import { ShareValue } from "@/components/query/share-value";
import { CaptureTimeline } from "@/components/query/timeline";
import {
  ActivityIcon,
  Alert,
  BarChartIcon,
  Card,
  CardHeader,
  ClockIcon,
  ConfidenceChip,
  EmptyState,
  ErrorCard,
  LayersIcon,
  LinkIcon,
  LocalTime,
  OverviewGlyph,
  RefreshIcon,
  RetryButton,
  SearchIcon,
  SectionLabel,
  StatCard,
  StatGrid,
} from "@/components/ui";
import { formatCount, formatDayUTC, formatDecimal, formatShare, plural } from "@/lib/format";
import { getTrackedQuery, type TrackedQueryDetail } from "@/lib/queries";
import { getCaptureStatuses, getLatestCaptures, getSeriesMetrics, type CaptureStatusRow, type LiveSnapshot } from "@/lib/query/metrics";
import { currentTime, windowBounds } from "@/lib/query/window";
import type { SeriesMetrics } from "@/lib/types";

const DAY = 86_400_000;

export default async function LiveTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: q } = await getTrackedQuery(id);
  // The layout renders the error card or notFound() for these cases.
  if (!q) return null;

  const now = currentTime();
  const seriesId = q.series.id;
  const week = windowBounds("7d", q.first_captured_at, now);
  const timelineFrom = new Date(Math.floor(now / DAY) * DAY - 6 * DAY).toISOString();
  const [metricsRes, capturesRes, statusesRes] = await Promise.all([
    getSeriesMetrics(seriesId, week.from, week.to),
    getLatestCaptures(seriesId),
    getCaptureStatuses(seriesId, timelineFrom),
  ]);

  if (!capturesRes.data) {
    return (
      <ErrorCard title="The latest capture didn't load" detail={capturesRes.error} action={<RetryButton />}>
        We couldn&rsquo;t read this query&rsquo;s captures just now. Capturing continues in the background.
      </ErrorCard>
    );
  }

  const { latest, lastPresent } = capturesRes.data;
  const trackingStart = earliest(q.series.created_at, q.first_captured_at);

  if (!latest) {
    return (
      <EmptyState
        icon={<ClockIcon />}
        title="The first capture is on its way"
        body={
          <>
            We capture this search every 3 hours. The first result usually lands within a few minutes; the next scheduled check is{" "}
            <LocalTime value={q.series.next_capture_at} format="relative" />.
          </>
        }
      />
    );
  }

  const timeline = !statusesRes.data ? (
    <ErrorCard title="The capture timeline didn't load" detail={statusesRes.error} action={<RetryButton />} />
  ) : (
    <TimelineCard captures={statusesRes.data} now={now} from={timelineFrom} trackingStart={trackingStart} />
  );

  if (q.status === "watching" || !lastPresent) {
    return (
      <div className="space-y-6 max-sm:overflow-x-clip">
        <WatchingCard q={q} captures={statusesRes.data ?? []} />
        <div className="grid gap-6 lg:grid-cols-2">
          {timeline}
          <OrganicCard snapshot={latest} />
        </div>
      </div>
    );
  }

  const shown = latest.status === "present" ? latest : lastPresent;
  const organicSnap = latest.organic.length ? latest : shown;

  return (
    <div className="space-y-6 max-sm:overflow-x-clip">
      {!metricsRes.data ? (
        <ErrorCard title="The 7-day numbers didn't load" detail={metricsRes.error} action={<RetryButton />} />
      ) : (
        <StatRow m={metricsRes.data} />
      )}

      <LatestCard latest={latest} shown={shown} />

      <div className="grid gap-6 lg:grid-cols-2">
        {timeline}
        {metricsRes.data ? <ChangesCard m={metricsRes.data} now={now} patternsHref={`/queries/${q.id}/patterns?window=7d`} /> : null}
      </div>

      <OrganicCard snapshot={organicSnap} />
    </div>
  );
}

function earliest(...values: (string | null | undefined)[]): string | null {
  const times = values.map((v) => (v ? Date.parse(v) : Number.NaN)).filter((t) => !Number.isNaN(t));
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

function StatRow({ m }: { m: SeriesMetrics }) {
  return (
    <StatGrid>
      <StatCard
        label="Overview shown"
        icon={<OverviewGlyph className="text-brand" />}
        tone="brand"
        value={<ShareValue share={m.presence_rate} n={m.renders} />}
        caption="Renders with an AI Overview, last 7 days"
      />
      <StatCard
        label="Change rate"
        icon={<RefreshIcon />}
        value={<ShareValue share={m.change_rate} n={m.renders > 1 ? m.renders - 1 : 0} />}
        caption="Renders that differ from the one before"
      />
      <StatCard
        label="Citations per overview"
        icon={<LinkIcon />}
        value={
          <>
            {formatDecimal(m.citations_per_render, 1)}
            <span className="ml-1.5 align-middle text-xs font-medium tracking-normal text-ink-muted">n={formatCount(m.present)}</span>
          </>
        }
        caption="Distinct URLs cited per overview"
      />
      <StatCard
        label="Confidence"
        icon={<BarChartIcon />}
        value={
          <>
            {formatCount(m.renders)}
            <span className="ml-1.5 text-sm font-medium tracking-normal text-ink-muted">{m.renders === 1 ? "render" : "renders"}</span>
          </>
        }
        caption={<ConfidenceChip confidence={m.confidence} size="sm" />}
      />
    </StatGrid>
  );
}

function LatestCard({ latest, shown }: { latest: LiveSnapshot; shown: LiveSnapshot }) {
  const stale = latest.id !== shown.id;
  return (
    <Card padding="none">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <SectionLabel>Latest capture</SectionLabel>
          <p className="mt-1 text-sm text-ink">
            <LocalTime value={latest.captured_at} format="datetime" className="font-semibold" />{" "}
            <span className="text-ink-muted">
              (<LocalTime value={latest.captured_at} format="relative" />)
            </span>
          </p>
        </div>
        <CaptureStatusChip status={latest.status} />
      </div>

      {stale && (
        <div className="px-5 pt-4">
          <Alert tone={latest.status === "error" ? "warn" : "info"}>
            {latest.status === "error"
              ? "The latest capture failed, so it isn't counted. "
              : "Google showed no AI Overview in the latest capture. "}
            Below is the last overview we saw, captured <LocalTime value={shown.captured_at} format="datetime" />.
          </Alert>
        </div>
      )}

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-label="AI Overview" className="min-w-0 self-start rounded-lg border border-line bg-white p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-faint text-brand">
              <OverviewGlyph className="h-3.5 w-3.5" />
            </span>
            <p className="text-sm font-semibold text-ink">AI Overview</p>
            <p className="ml-auto text-xs text-ink-muted">
              {plural(shown.citations.length, "source")}
              {typeof shown.formats.word_count === "number" && ` · ${formatCount(shown.formats.word_count)} words`}
            </p>
          </div>
          {shown.sentences.length ? (
            <OverviewText sentences={shown.sentences} citations={shown.citations} />
          ) : (
            <p className="text-sm text-ink-muted">Google showed an overview in this capture, but it had no text we could read.</p>
          )}
        </section>
        <section aria-labelledby="live-sources" className="min-w-0">
          <SectionLabel id="live-sources">Sources cited ({formatCount(shown.citations.length)})</SectionLabel>
          {shown.citations.length ? (
            <SourceList citations={shown.citations} className="mt-3" />
          ) : (
            <p className="mt-2 text-sm text-ink-muted">This overview cited no sources.</p>
          )}
        </section>
      </div>
    </Card>
  );
}

function TimelineCard({ captures, now, from, trackingStart }: { captures: CaptureStatusRow[]; now: number; from: string; trackingStart: string | null }) {
  const counted = captures.filter((c) => c.status !== "error");
  const present = counted.filter((c) => c.status === "present").length;
  const errors = captures.length - counted.length;
  // Calendar days, unlike the rolling 7 days of the stat row above, so the card names its own span.
  const span = `${formatDayUTC(from)} to ${formatDayUTC(now)}`;
  return (
    <Card>
      <CardHeader
        as="h2"
        title={`Captures, ${span} (UTC days)`}
        description={
          counted.length
            ? `${formatCount(present)} of ${plural(counted.length, "capture")} showed an overview (${formatShare(present / counted.length, counted.length)})${errors ? `; ${plural(errors, "capture")} failed and ${errors === 1 ? "isn't" : "aren't"} counted` : ""}.`
            : `No captures from ${span} yet.`
        }
      />
      <CaptureTimeline className="mt-4" captures={captures} now={now} trackingStart={trackingStart} />
    </Card>
  );
}

function ChangesCard({ m, now, patternsHref }: { m: SeriesMetrics; now: number; patternsHref: string }) {
  // Only full UTC days are compared: today is still being captured, so most of what it "dropped" just
  // hasn't been captured yet.
  const days = completeDays(m.daily, m.window.from, now);
  const last = days[days.length - 1];
  const prev = days[days.length - 2];
  const todayKey = new Date(now).toISOString().slice(0, 10);
  const today = m.daily.find((d) => d.day === todayKey && d.renders > 0);
  const title = last && prev ? `What changed on ${formatDayUTC(last.day)}` : "What changed";

  let body: ReactNode;
  if (!last || !prev) {
    body = (
      <EmptyInline icon={<ActivityIcon />}>
        Changes show once two full UTC days are captured: we compare each full day with the day before.
      </EmptyInline>
    );
  } else if (!dayHasChanges(last)) {
    body = (
      <EmptyInline icon={<ActivityIcon />}>
        Nothing changed. The overview used the same claims, brands and sources as on {formatDayUTC(prev.day)}.
      </EmptyInline>
    );
  } else {
    body = <DayDiff diff={last} limit={6} moreHref={`${patternsHref}#daily`} className="mt-4" />;
  }

  return (
    <Card>
      <CardHeader
        as="h2"
        title={title}
        description={
          last && prev ? (
            <>
              {formatDayUTC(last.day)} against {formatDayUTC(prev.day)} (full UTC days): {plural(last.present, "overview")} in {plural(last.renders, "render")}.
              {today && ` Today is still being captured (${plural(today.renders, "render")} so far), so it is compared tomorrow.`}
            </>
          ) : undefined
        }
      />
      {body}
    </Card>
  );
}

function EmptyInline({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-lg bg-surface-alt px-4 py-3 text-sm leading-6 text-ink-muted">
      <span className="mt-0.5 text-ink-soft">{icon}</span>
      <p>{children}</p>
    </div>
  );
}

function OrganicCard({ snapshot }: { snapshot: LiveSnapshot }) {
  const cited = new Set(snapshot.citations.map((c) => c.url_key));
  const top = snapshot.organic.filter((r) => r.rank <= 10);
  const citedInTop = top.filter((r) => cited.has(r.url_key)).length;
  return (
    <Card padding="none">
      <div className="px-5 pt-5">
        <CardHeader
          as="h2"
          title="Organic top 10"
          description={
            <>
              Capture of <LocalTime value={snapshot.captured_at} format="datetime" />.{" "}
              {!top.length
                ? null
                : snapshot.status === "present"
                  ? `${plural(citedInTop, "result")} in the top 10 ${citedInTop === 1 ? "is" : "are"} also cited in the overview.`
                  : "No overview in this capture, so nothing is cited."}
            </>
          }
        />
      </div>
      {top.length ? (
        <OrganicList results={top} citedKeys={cited} className="mt-3 border-t border-line" />
      ) : (
        <div className="px-5 pb-5">
          <EmptyInline icon={<SearchIcon />}>This capture had no organic results we could read.</EmptyInline>
        </div>
      )}
    </Card>
  );
}

function WatchingCard({ q, captures }: { q: TrackedQueryDetail; captures: CaptureStatusRow[] }) {
  const recent = [...captures].reverse().slice(0, 8);
  return (
    <Card padding="none">
      <div className="flex items-start gap-3 px-5 py-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn">
          <LayersIcon />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-bold tracking-tight text-ink">Watching for an AI Overview</h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            Google hasn&rsquo;t shown an AI Overview for this search in {plural(q.renders, "capture")} so far. We check every 3 hours; the next
            check is <LocalTime value={q.series.next_capture_at} format="relative" />. When one appears, tracking starts on its own and
            the Patterns, Pages and Brief tabs begin to fill.
          </p>
        </div>
      </div>
      <div className="border-t border-line px-5 py-4">
        <SectionLabel>Last captures</SectionLabel>
        {recent.length ? (
          <ul className="mt-2 divide-y divide-line">
            {recent.map((c) => (
              <li key={c.captured_at} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <LocalTime value={c.captured_at} format="datetime" className="text-ink" />
                <CaptureStatusChip status={c.status} size="sm" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">No captures in the last 7 days.</p>
        )}
      </div>
    </Card>
  );
}
