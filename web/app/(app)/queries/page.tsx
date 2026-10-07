// Queries list: the signed-in user's tracked queries from my_queries(), with 7-day presence and report stage.
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Chip, LevelChip, StatusChip } from "@/components/ui/chip";
import { EmptyState, ErrorCard } from "@/components/ui/feedback";
import {
  ActivityIcon,
  ChevronRightIcon,
  EyeIcon,
  GlobeIcon,
  LayersIcon,
  MonitorIcon,
  PlusIcon,
  SmartphoneIcon,
  SparklesIcon,
  TargetIcon,
} from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { ProgressBar } from "@/components/ui/progress-bar";
import { RetryButton } from "@/components/ui/retry-button";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/typography";
import { deviceLabel, formatCount, formatPercent, plural, REPORT_KIND_LABELS, REPORT_STAGE_LABELS } from "@/lib/format";
import { getMyQueries } from "@/lib/queries";
import type { MyQuery } from "@/lib/types";

export const metadata: Metadata = { title: "Queries" };

function ReportLine({ q }: { q: MyQuery }) {
  if (q.report) {
    const tone = q.report.stage === "ready" ? "good" : q.report.stage === "failed" ? "bad" : "brand";
    return (
      <Chip tone={tone} dot size="sm">
        {REPORT_KIND_LABELS[q.report.kind] ?? q.report.kind}: {REPORT_STAGE_LABELS[q.report.stage] ?? q.report.stage}
      </Chip>
    );
  }
  if (q.status === "watching") return <span>No overview yet, checking every 3 hours</span>;
  const daysLeft = Math.max(0, 3 - (q.history_days ?? 0));
  return <span>{daysLeft > 0 ? `First report in ${plural(daysLeft, "day")}` : "First report being prepared"}</span>;
}

function QueryRow({ q }: { q: MyQuery }) {
  const DeviceIcon = q.device === "mobile" ? SmartphoneIcon : MonitorIcon;
  return (
    <li>
      <Link
        href={`/queries/${q.tracked_query_id}`}
        className="group flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-surface-alt/70 sm:flex-row sm:items-center sm:gap-5 sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="min-w-0 break-words text-[15px] font-semibold text-ink group-hover:text-brand-strong">{q.display_keyword}</span>
            <StatusChip status={q.status} />
            {q.own_level_7d && <LevelChip level={q.own_level_7d} />}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip tone="grey" icon={<GlobeIcon className="h-3 w-3" />}>
              {q.location_name}
            </Chip>
            <Chip tone="grey">{q.language_code}</Chip>
            <Chip tone="grey" icon={<DeviceIcon className="h-3 w-3" />}>
              {deviceLabel(q.device)}
            </Chip>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-muted">
            <span>{plural(q.history_days ?? 0, "day")} of history</span>
            <span aria-hidden="true">·</span>
            <span>
              Last capture <LocalTime value={q.last_captured_at} format="relative" />
            </span>
            <span aria-hidden="true">·</span>
            <ReportLine q={q} />
          </div>
        </div>
        <div className="w-full shrink-0 sm:w-44">
          <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Overview shown, 7 days</p>
            <p className="text-sm font-semibold tabular-nums sm:mt-0.5">
              {formatPercent(q.presence_rate_7d)}
              <span className="font-normal text-ink-muted"> · n={formatCount(q.renders_7d ?? 0)}</span>
            </p>
          </div>
          <ProgressBar
            value={q.presence_rate_7d}
            className="mt-1.5"
            label="Overview shown, last 7 days"
            valueText={`${formatPercent(q.presence_rate_7d)} of ${q.renders_7d ?? 0} renders`}
          />
        </div>
        <ChevronRightIcon className="hidden text-ink-soft transition-colors group-hover:text-brand sm:block" />
      </Link>
    </li>
  );
}

export default async function QueriesPage() {
  const { data: queries, error } = await getMyQueries();

  const header = (meta: ReactNode) => (
    <PageHeader
      kicker="Your queries"
      title="Queries"
      meta={meta}
      actions={
        <ButtonLink href="/queries/new" glow iconLeft={<PlusIcon />}>
          Add Query
        </ButtonLink>
      }
    />
  );

  if (error || !queries) {
    return (
      <>
        {header("Every search you track, captured every 3 hours.")}
        <ErrorCard className="mt-8" title="Your queries didn't load" detail={error} action={<RetryButton />}>
          We couldn&rsquo;t read your queries just now. Your tracking keeps running; try again in a moment.
        </ErrorCard>
      </>
    );
  }

  if (queries.length === 0) {
    return (
      <>
        {header("Every search you track, captured every 3 hours.")}
        <EmptyState
          className="mt-8"
          icon={<SparklesIcon className="h-5 w-5" />}
          title="Track your first AI Overview"
          body="Add a search that matters to your business. We check Google for an AI Overview right away, then capture it every 3 hours and count what keeps showing up."
          action={
            <ButtonLink href="/queries/new" glow iconLeft={<PlusIcon />}>
              Add Your First Query
            </ButtonLink>
          }
        />
      </>
    );
  }

  const counts = { tracking: 0, watching: 0, paused: 0 };
  let renders = 0;
  let present = 0;
  let withUrl = 0;
  let cited = 0;
  for (const q of queries) {
    counts[q.status] = (counts[q.status] ?? 0) + 1;
    renders += q.renders_7d ?? 0;
    present += q.present_7d ?? 0;
    if (q.own_url) withUrl += 1;
    if (q.own_level_7d) cited += 1;
  }
  const meta = [
    plural(queries.length, "query", "queries"),
    `${counts.tracking} tracking`,
    counts.watching ? `${counts.watching} watching` : null,
    counts.paused ? `${counts.paused} paused` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {header(meta)}
      <StatGrid className="mt-8">
        <StatCard label="Queries" icon={<LayersIcon />} value={formatCount(queries.length)} caption={`${counts.tracking} with an overview`} />
        <StatCard
          label="Overview shown"
          icon={<EyeIcon />}
          tone="brand"
          value={renders ? formatPercent(present / renders) : "–"}
          caption={`last 7 days · n=${formatCount(renders)}`}
        />
        <StatCard label="Renders captured" icon={<ActivityIcon />} value={formatCount(renders)} caption="last 7 days, 8 a day per device" />
        <StatCard
          label="Your page cited"
          icon={<TargetIcon />}
          tone={cited > 0 ? "good" : "ink"}
          value={formatCount(cited)}
          caption={withUrl ? `of ${plural(withUrl, "query", "queries")} with your URL` : "add your URL on a query"}
        />
      </StatGrid>
      <h2 className="mt-10 text-lg font-semibold tracking-tight">All queries</h2>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-card border border-line bg-white shadow-card">
        {queries.map((q) => (
          <QueryRow key={q.tracked_query_id} q={q} />
        ))}
      </ul>
    </>
  );
}
