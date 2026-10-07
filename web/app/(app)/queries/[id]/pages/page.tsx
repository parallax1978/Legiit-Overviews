// Pages tab: the cited pages of the latest report with page details: measures, Claude's tags and where
// Google quotes each page, then the platform note and the coverage matrix with what winners share, the
// gaps and how each page differs. Before a report exists it shows how far history is from unlocking one.
import type { ReactNode } from "react";
import { CoverageMatrix, MatrixLegend, type CellState, type MatrixColumn, type MatrixRow } from "@/components/query/coverage-matrix";
import { displayUrl, pageAnchorId } from "@/components/query/page-anchor";
import { PageCard } from "@/components/query/page-card";
import { SectionCard, SectionEmpty } from "@/components/query/section-card";
import {
  Alert,
  Card,
  CardHeader,
  CheckList,
  Chip,
  EmptyState,
  ErrorCard,
  FileTextIcon,
  LoaderIcon,
  LocalTime,
  NumberBadge,
  ProgressBar,
  RetryButton,
  Tag,
} from "@/components/ui";
import { formatCount, formatShare, hostOf, plural, REPORT_KIND_LABELS, REPORT_STAGE_LABELS } from "@/lib/format";
import { getTrackedQuery, type TrackedQueryDetail } from "@/lib/queries";
import { getPagesData, type PageInfo, type PagesReportRow } from "@/lib/query/pages";
import { currentTime, historyDays } from "@/lib/query/window";
import type { ReportPageDetail, SeriesMetrics } from "@/lib/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await getTrackedQuery(id);
  return { title: data ? `Pages: ${data.display_keyword}` : "Pages" };
}

export default async function PagesTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: q } = await getTrackedQuery(id);
  if (!q) return null;

  const res = await getPagesData(q.id);
  if (!res.data) {
    return (
      <ErrorCard title="The cited pages didn't load" detail={res.error} action={<RetryButton />}>
        We couldn&rsquo;t read this query&rsquo;s report just now. Try again in a moment.
      </ErrorCard>
    );
  }

  const { report, pages, newer } = res.data;
  if (!report) return <NoReport q={q} />;

  const details = report.page_details ?? [];
  const metrics = report.metrics;
  const titles = new Map((metrics?.sources ?? []).map((s) => [s.url_key, s.title]));
  const ownKey = q.own_url_key;

  return (
    <div className="space-y-6">
      <ReportHeader report={report} />
      {newer && (
        <Alert tone="brand" title={`A newer ${REPORT_KIND_LABELS[newer.kind]?.toLowerCase() ?? "report"} is on its way`}>
          {REPORT_STAGE_LABELS[newer.stage]}. These pages are from the last finished report until it is ready.
        </Alert>
      )}
      {report.stage === "failed" && (
        <Alert tone="bad" title="This report failed">
          {report.error ?? "Something went wrong while building it."} A new report is built automatically at the next window.
        </Alert>
      )}
      {(report.stage === "pages" || report.stage === "brief") && <ProgressCard report={report} pages={pages} />}

      {details.length === 0 ? (
        report.stage === "pages" ? null : (
          <EmptyState icon={<FileTextIcon />} title="No pages to analyse" body="No page outside the big platforms was cited in this report's window, so there is nothing to compare." />
        )
      ) : (
        <section aria-labelledby="pages-heading" className="space-y-4">
          <div>
            <h2 id="pages-heading" className="text-lg font-semibold tracking-tight text-ink">
              Cited pages
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              The {plural(details.length, "page")} Google cited most in the window{ownKey && details.some((d) => d.url_key === ownKey) ? ", plus yours" : ""}, in
              order of how often. Measured in code, tagged by Claude.
            </p>
          </div>
          <PageIndex details={details} titles={titles} />
          {details.map((d) => (
            <PageCard key={d.url_key} detail={d} page={pages[d.url_key]} title={titles.get(d.url_key) ?? null} present={metrics?.present ?? null} isOwn={d.url_key === ownKey} />
          ))}
        </section>
      )}

      <PlatformNote metrics={metrics} />

      <MatrixSection report={report} details={details} pages={pages} ownKey={ownKey} />
    </div>
  );
}

// ------------------------------------------------------------------ header, progress, empty

function ReportHeader({ report }: { report: PagesReportRow }) {
  const tone = report.stage === "ready" ? "good" : report.stage === "failed" ? "bad" : "brand";
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{REPORT_KIND_LABELS[report.kind] ?? "Report"}</h2>
        <p className="mt-0.5 text-sm text-ink-muted">
          <LocalTime value={report.window_start} format="date" /> to <LocalTime value={report.window_end} format="date" /> · n=
          {formatCount(report.renders)} renders
          {report.metrics ? `, ${formatCount(report.metrics.present)} with an overview` : ""}
        </p>
      </div>
      <Chip tone={tone} dot className="self-start">
        {REPORT_STAGE_LABELS[report.stage] ?? report.stage}
      </Chip>
    </div>
  );
}

function ProgressCard({ report, pages }: { report: PagesReportRow; pages: Record<string, PageInfo> }) {
  const keys = report.page_urls.length ? report.page_urls : (report.page_details ?? []).map((d) => d.url_key);
  const rows = keys.map((k) => pages[k]);
  const parsed = rows.filter((p) => p && p.parse_status !== "pending").length;
  const ok = rows.filter((p) => p?.parse_status === "ok");
  const tagged = ok.filter((p) => p.tag_status === "done" || p.tag_status === "failed").length;
  const failed = rows.filter((p) => p?.parse_status === "failed").length;

  if (report.stage === "brief") {
    return (
      <Alert tone="brand" title="Comparing the pages">
        Every page is read and tagged. Claude is now building the coverage matrix and the brief; they appear here and on the Brief tab when ready.
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <LoaderIcon className="animate-spin text-brand" /> Studying the cited pages
          </span>
        }
        description="We read each page Google cites most, measure it, then Claude tags what it covers. The matrix and brief follow once every page is done."
      />
      {keys.length ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ProgressLine label="Pages read" done={parsed} total={keys.length} note={failed ? `${failed} couldn't be read` : undefined} />
          <ProgressLine label="Pages tagged" done={tagged} total={ok.length} />
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">Choosing which pages to study.</p>
      )}
    </Card>
  );
}

function ProgressLine({ label, done, total, note }: { label: string; done: number; total: number; note?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink">{label}</span>
        <span className="tabular-nums text-ink-muted">
          {formatCount(done)} of {formatCount(total)}
        </span>
      </div>
      <ProgressBar value={total ? done / total : 0} className="mt-2" label={label} valueText={`${done} of ${total}`} />
      {note && <p className="mt-1 text-xs text-ink-muted">{note}</p>}
    </div>
  );
}

function NoReport({ q }: { q: TrackedQueryDetail }) {
  const days = historyDays(q.first_captured_at, currentTime());
  const body: ReactNode =
    q.status === "watching" ? (
      "Reports start once Google shows an AI Overview for this search. We check every 3 hours."
    ) : (
      <>
        <p>
          The preliminary report unlocks at 3 days of history and the full report at 7. Each one studies the pages Google cites most. This query has{" "}
          {plural(days, "day")} of history.
        </p>
        <div className="mx-auto mt-4 max-w-xs text-left">
          <ProgressBar value={Math.min(days, 7)} max={7} label="Days of history" valueText={`${days} of 7 days`} />
          <div className="relative mt-1.5 h-4 text-[11px] text-ink-soft">
            <span className="absolute left-0">Day 0</span>
            <span className="absolute -translate-x-1/2" style={{ left: `${(3 / 7) * 100}%` }}>
              Day 3 preliminary
            </span>
            <span className="absolute right-0">Day 7 full</span>
          </div>
        </div>
      </>
    );
  return (
    <EmptyState
      icon={<FileTextIcon />}
      title={q.status === "watching" ? "No report yet" : days >= 3 ? "The first report is being prepared" : "Not enough history for a report yet"}
      body={body}
    />
  );
}

// ------------------------------------------------------------------ page index and platform note

function PageIndex({ details, titles }: { details: ReportPageDetail[]; titles: Map<string, string | null> }) {
  return (
    <nav aria-label="Pages in this report" className="rounded-card border border-line bg-white p-2 shadow-card">
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5 sm:grid-cols-2">
        {details.map((d) => (
          <li key={d.url_key} className="min-w-0">
            <a href={`#${pageAnchorId(d.url_key)}`} className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm hover:bg-surface-alt">
              <NumberBadge n={d.ref} size="sm" />
              <span className="min-w-0 truncate text-ink">{titles.get(d.url_key) || displayUrl(d.url_key)}</span>
              <span className="ml-auto shrink-0 pl-2 text-xs text-ink-muted">{hostOf(`https://${d.url_key}`)}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function PlatformNote({ metrics }: { metrics: SeriesMetrics | null }) {
  const platforms = (metrics?.domains ?? []).filter((d) => d.platform);
  return (
    <SectionCard
      id="platforms"
      label="Platform pages"
      description="YouTube, Reddit, Facebook, Quora, Wikipedia and similar platforms are left out of the page analysis. When Google cites them, the answer is a presence on that platform (a video, a thread, an answer), not a page you write."
    >
      {platforms.length ? (
        <ul className="flex flex-wrap gap-2 px-5 pb-5">
          {platforms.map((p) => (
            <li key={p.reg_domain}>
              <Tag value={formatShare(p.share, metrics?.present)}>{p.reg_domain}</Tag>
            </li>
          ))}
        </ul>
      ) : (
        <SectionEmpty>No platform page was cited in this report&rsquo;s window.</SectionEmpty>
      )}
    </SectionCard>
  );
}

// ------------------------------------------------------------------ coverage matrix and analysis

interface Analysis {
  matrix: {
    topics: { topic: string; claim_refs: string[]; cells: { page_ref: string; state: CellState }[] }[];
    entities: { entity: string; entity_ref: string | null; cells: { page_ref: string; state: CellState }[] }[];
  };
  common_to_all: string[];
  gaps: { gap: string; why: string; claim_refs: string[] }[];
  page_notes: { page_ref: string; does_differently: string }[];
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function parseAnalysis(raw: unknown): Analysis | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Partial<Analysis>;
  return {
    matrix: {
      topics: arr<Analysis["matrix"]["topics"][number]>(a.matrix?.topics).map((t) => ({ ...t, claim_refs: arr(t.claim_refs), cells: arr(t.cells) })),
      entities: arr<Analysis["matrix"]["entities"][number]>(a.matrix?.entities).map((e) => ({ ...e, cells: arr(e.cells) })),
    },
    common_to_all: arr<string>(a.common_to_all),
    gaps: arr<Analysis["gaps"][number]>(a.gaps).map((g) => ({ ...g, claim_refs: arr(g.claim_refs) })),
    page_notes: arr<Analysis["page_notes"][number]>(a.page_notes),
  };
}

/** "page:<url_key>" -> url_key; other refs give null. */
function pageKey(ref: string): string | null {
  return ref.startsWith("page:") ? ref.slice(5) : null;
}

function cellsOf(cells: { page_ref: string; state: CellState }[]): Record<string, CellState> {
  const out: Record<string, CellState> = {};
  for (const c of cells) {
    const k = pageKey(c.page_ref);
    if (k) out[k] = c.state;
  }
  return out;
}

function MatrixSection({
  report,
  details,
  pages,
  ownKey,
}: {
  report: PagesReportRow;
  details: ReportPageDetail[];
  pages: Record<string, PageInfo>;
  ownKey: string | null;
}) {
  const analysis = parseAnalysis(report.analysis);
  if (!analysis) {
    if (report.stage === "failed") return null;
    return (
      <SectionCard id="matrix" label="Coverage matrix" description="Topics and entities against the cited pages, with what every winner has and the gaps no page fills.">
        <SectionEmpty>Claude builds the matrix after every page is read and tagged. It appears here with the brief.</SectionEmpty>
      </SectionCard>
    );
  }

  const columns: MatrixColumn[] = details.map((d) => ({
    url_key: d.url_key,
    ref: d.ref,
    host: hostOf(pages[d.url_key]?.url ?? `https://${d.url_key}`),
    isOwn: d.url_key === ownKey,
  }));
  const refOf = new Map(details.map((d) => [d.url_key, d.ref]));
  const topicRows: MatrixRow[] = analysis.matrix.topics.map((t, i) => ({ key: `t${i}`, label: t.topic, cells: cellsOf(t.cells) }));
  const entityRows: MatrixRow[] = analysis.matrix.entities.map((e, i) => ({ key: `e${i}`, label: e.entity, cells: cellsOf(e.cells) }));
  const claimLabels = new Map<string, string>([
    ...(report.metrics?.claims ?? []).map((c) => [c.group_id, c.label] as [string, string]),
    ...(report.metrics?.unsupported_claims ?? []).map((c) => [c.group_id, c.label] as [string, string]),
  ]);

  return (
    <>
      <SectionCard
        id="matrix"
        label="Coverage matrix"
        description={`Which cited page covers each topic and entity the overview keeps using. Hover a page number for its site${columns.some((c) => c.isOwn) ? "; your page is in green" : ""}.`}
        action={<MatrixLegend />}
      >
        {columns.length && (topicRows.length || entityRows.length) ? (
          <div className="space-y-6 pb-2">
            {topicRows.length > 0 && <CoverageMatrix rowLabel="Topic" rows={topicRows} columns={columns} className="border-t border-line" />}
            {entityRows.length > 0 && <CoverageMatrix rowLabel="Entity" rows={entityRows} columns={columns} className="border-t border-line" />}
          </div>
        ) : (
          <SectionEmpty>The matrix for this report is empty.</SectionEmpty>
        )}
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard id="common" label="What every winner has" description="Shared by all of the cited pages.">
          {analysis.common_to_all.length ? (
            <CheckList items={analysis.common_to_all} className="px-5 pb-5" />
          ) : (
            <SectionEmpty>The cited pages have nothing in common worth copying.</SectionEmpty>
          )}
        </SectionCard>
        <SectionCard id="gaps" label="Gaps no page fills" description="What the overview needs that none of the cited pages gives it.">
          {analysis.gaps.length ? (
            <ul className="space-y-4 px-5 pb-5">
              {analysis.gaps.map((g, i) => (
                <li key={i}>
                  <p className="text-sm font-semibold text-ink">{g.gap}</p>
                  {g.why && <p className="mt-0.5 text-sm leading-6 text-ink-muted">{g.why}</p>}
                  {g.claim_refs.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {g.claim_refs.map((r) => {
                        const label = r.startsWith("claim:") ? claimLabels.get(r.slice(6)) : undefined;
                        return label && label.trim() !== g.gap.trim() ? <Tag key={r}>{label}</Tag> : null;
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <SectionEmpty>Between them, the cited pages cover everything the overview uses.</SectionEmpty>
          )}
        </SectionCard>
      </div>

      {analysis.page_notes.length > 0 && (
        <SectionCard id="differences" label="How each page differs" description="What each cited page does that the others don't.">
          <ol className="divide-y divide-line border-t border-line">
            {analysis.page_notes.map((n, i) => {
              const key = pageKey(n.page_ref);
              const ref = key ? refOf.get(key) : undefined;
              return (
                <li key={i} className="flex items-start gap-3 px-5 py-3.5">
                  <NumberBadge n={ref ?? "?"} size="sm" className="mt-0.5" />
                  <div className="min-w-0">
                    {key && (
                      <a href={`#${pageAnchorId(key)}`} className="text-xs font-medium text-ink-muted hover:text-brand">
                        {displayUrl(key)}
                      </a>
                    )}
                    <p className="text-sm leading-6 text-ink">{n.does_differently}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </SectionCard>
      )}
    </>
  );
}
