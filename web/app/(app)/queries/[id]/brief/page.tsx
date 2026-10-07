// Brief tab: the selected report's brief (?report=<id>, default the newest ready one) with evidence for
// every claim and entity, Markdown export, the checks run on it, and the changes since the first brief
// on a 28-day refresh. Before a brief is ready it shows when it unlocks or how far the report has got.
import Link from "next/link";
import { notFound } from "next/navigation";
import { BriefChecks } from "@/components/query/brief-checks";
import { BriefDiffCard } from "@/components/query/brief-diff";
import { BriefExport } from "@/components/query/brief-export";
import type { RefContext } from "@/components/query/brief-refs";
import { BriefReportSelect } from "@/components/query/brief-report-select";
import { BriefFailed, BriefLocked, BriefProgress, historyDays, reportWindow } from "@/components/query/brief-status";
import { BriefView } from "@/components/query/brief-view";
import { extractedOf } from "@/components/query/patterns-sections";
import { ConfidenceChip } from "@/components/ui/chip";
import { Alert, ErrorCard } from "@/components/ui/feedback";
import { FileTextIcon, LayersIcon, SparklesIcon, TargetIcon } from "@/components/ui/icons";
import { RetryButton } from "@/components/ui/retry-button";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { MetaList } from "@/components/ui/typography";
import { REPORT_KIND_LABELS, REPORT_STAGE_LABELS, formatCount, plural } from "@/lib/format";
import { getTrackedQuery, isUuid } from "@/lib/queries";
import {
  compareBriefs,
  defaultReport,
  getPageProgress,
  getReportBrief,
  getReportDetail,
  getReports,
  type ReportSummary,
  type StoredBrief,
} from "@/lib/query/report";
import { getRefMetrics } from "@/lib/query/ref-metrics";

export const metadata = { title: "Brief" };

/** Every typed ref in a stored brief, for resolving merged claims and entities. */
function briefRefs(brief: StoredBrief): (string | null)[] {
  const b = brief.brief;
  return [
    ...b.must_cover.flatMap((m) => m.claim_refs),
    ...b.entities.map((e) => e.entity_ref),
    ...b.new_to_cite.flatMap((n) => n.evidence_refs),
  ];
}

function optionLabel(r: ReportSummary): string {
  const state = r.stage === "ready" ? "" : r.stage === "failed" ? " · failed" : " · in progress";
  return `${REPORT_KIND_LABELS[r.kind]} · ${reportWindow(r)}${state}`;
}

function keywordSlug(keyword: string): string {
  return (
    keyword
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "query"
  );
}

export default async function BriefTab({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ report?: string | string[] }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { data: q } = await getTrackedQuery(id);
  if (!q) notFound();

  const reports = await getReports(q.id);
  if (reports.data === null) {
    return (
      <ErrorCard title="The brief didn't load" detail={reports.error} action={<RetryButton />}>
        We couldn&rsquo;t read this query&rsquo;s reports just now. Try again in a moment.
      </ErrorCard>
    );
  }
  const list = reports.data;
  if (list.length === 0) return <BriefLocked status={q.status} days={historyDays(q.first_captured_at)} />;

  const requested = typeof sp.report === "string" && isUuid(sp.report) ? list.find((r) => r.id === sp.report) : undefined;
  const selected = requested ?? defaultReport(list)!;
  const selector =
    list.length > 1 ? <BriefReportSelect options={list.map((r) => ({ id: r.id, label: optionLabel(r) }))} value={selected.id} /> : null;

  if (selected.stage === "pages" || selected.stage === "brief") {
    const progress = await getPageProgress(selected.page_urls);
    const olderReady = list.find((r) => r.stage === "ready" && r.id !== selected.id);
    return (
      <div className="space-y-6">
        {selector && <div className="flex justify-end">{selector}</div>}
        <BriefProgress report={selected} progress={progress.data} />
        {olderReady && (
          <Alert tone="info" title="Your earlier brief is still available">
            Pick the {REPORT_KIND_LABELS[olderReady.kind].toLowerCase()} ({reportWindow(olderReady)}) in the Report menu above while this one is
            written.
          </Alert>
        )}
      </div>
    );
  }

  if (selected.stage === "failed") {
    return (
      <div className="space-y-6">
        {selector && <div className="flex justify-end">{selector}</div>}
        <BriefFailed report={selected} />
      </div>
    );
  }

  const detail = await getReportDetail(selected.id);
  if (detail.data === null) {
    return (
      <ErrorCard title="The brief didn't load" detail={detail.error} action={<RetryButton />}>
        We couldn&rsquo;t read this brief just now. Try again in a moment.
      </ErrorCard>
    );
  }
  const report = detail.data;
  const brief = report.analysis;
  if (!brief) {
    return (
      <div className="space-y-6">
        {selector && <div className="flex justify-end">{selector}</div>}
        <Alert tone="bad" title="This brief is empty">
          The report is marked {REPORT_STAGE_LABELS[report.stage].toLowerCase()} but has no brief stored. The next report rebuilds it.
        </Alert>
      </div>
    );
  }

  // Changes since the first brief: a refresh compared with the full report.
  const first = report.kind === "refresh" ? list.find((r) => r.kind === "full" && r.stage === "ready") : undefined;
  const firstBrief = first ? await getReportBrief(first.id) : null;
  const diff = firstBrief?.data ? compareBriefs(firstBrief.data, brief) : null;
  const newerRefresh = report.kind !== "refresh" ? list.find((r) => r.kind === "refresh" && r.stage === "ready") : undefined;

  // Chips read series_metrics over the report window at view time, so their share always matches the
  // evidence drawer they open, even after claims or entities were merged since the brief was written.
  const refMetrics = await getRefMetrics(q.series_id, report.window_start, report.window_end, report.metrics, briefRefs(brief));
  const metrics = refMetrics?.metrics ?? null;
  const ctx: RefContext = {
    queryId: q.id,
    seriesId: q.series_id,
    from: report.window_start,
    to: report.window_end,
    extracted: metrics ? extractedOf(metrics) : 0,
    claims: refMetrics?.claims ?? new Map(),
    entities: refMetrics?.entities ?? new Map(),
  };
  const b = brief.brief;
  const totalWords = b.outline.reduce((sum, s) => sum + (Number.isFinite(s.target_words) ? s.target_words : 0), 0);
  const fileName = `${keywordSlug(q.display_keyword)}-brief-${report.window_end.slice(0, 10)}`;

  return (
    <div className="space-y-10">
      <header className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="eyebrow text-brand">
            {REPORT_KIND_LABELS[report.kind]} · {reportWindow(report)}
          </p>
          {selector}
        </div>
        {brief.summary && <p className="text-lg leading-7 text-ink">{brief.summary}</p>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-muted">
          <MetaList
            items={[
              plural(metrics?.renders ?? report.renders, "render"),
              `${formatCount(metrics?.present ?? 0)} with an AI Overview`,
              plural(report.page_urls.length, "cited page") + " studied",
            ]}
          />
          {metrics && <ConfidenceChip confidence={metrics.confidence} />}
        </div>
        {report.brief_markdown ? (
          <BriefExport markdown={report.brief_markdown} fileName={fileName} />
        ) : (
          <p className="text-sm text-ink-muted">No Markdown export was stored for this brief.</p>
        )}
      </header>

      {newerRefresh && (
        <Alert
          tone="brand"
          title="A newer brief is ready"
          action={
            <Link href={`/queries/${q.id}/brief?report=${newerRefresh.id}`} className="text-sm font-semibold text-brand hover:text-brand-strong">
              Open the refresh
            </Link>
          }
        >
          The 28-day refresh ({reportWindow(newerRefresh)}) shows what changed since this brief.
        </Alert>
      )}

      <StatGrid>
        <StatCard label="Must cover" icon={<TargetIcon />} tone="brand" value={formatCount(b.must_cover.length)} caption="topics the overview repeats" />
        <StatCard label="Entities to name" icon={<LayersIcon />} value={formatCount(b.entities.length)} caption="seen in 2 or more renders" />
        <StatCard label="New to cite" icon={<SparklesIcon />} value={formatCount(b.new_to_cite.length)} caption="ideas no cited page has" />
        <StatCard label="Target length" icon={<FileTextIcon />} value={totalWords ? formatCount(totalWords) : "–"} caption="words across the outline" />
      </StatGrid>

      {diff && first && <BriefDiffCard diff={diff} firstLabel={`${REPORT_KIND_LABELS[first.kind].toLowerCase()} (${reportWindow(first)})`} />}

      <BriefView brief={brief} ctx={ctx} />

      {report.brief_checks && (
        <section className="space-y-4" aria-label="Checks">
          <BriefChecks checks={report.brief_checks} />
        </section>
      )}
    </div>
  );
}
