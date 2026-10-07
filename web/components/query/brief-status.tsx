// Brief states before a brief is ready: locked (not enough history yet), in progress (pages parsed,
// tagged, brief being written) and failed. The Draft score tab reuses the locked and in-progress notes.
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { CheckIcon, ClockIcon, FileTextIcon, LoaderIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { cn } from "@/lib/cn";
import { REPORT_KIND_LABELS, formatDayUTC, formatDecimal, plural } from "@/lib/format";
import type { PageProgress, ReportSummary } from "@/lib/query/report";
import type { TrackedQueryStatus } from "@/lib/types";

const PRELIMINARY_DAYS = 3;
const FULL_DAYS = 7;

/** "Sep 30 to Oct 7" for a report window (UTC days). */
export function reportWindow(r: Pick<ReportSummary, "window_start" | "window_end">): string {
  return `${formatDayUTC(r.window_start)} to ${formatDayUTC(r.window_end)}`;
}

/** Days of history from the first capture to now, as a fraction. */
export function historyDays(firstCapturedAt: string | null, now: number = Date.now()): number {
  if (!firstCapturedAt) return 0;
  const t = Date.parse(firstCapturedAt);
  return Number.isFinite(t) ? Math.max(0, (now - t) / 86_400_000) : 0;
}

export interface BriefLockedProps {
  status: TrackedQueryStatus;
  /** Days of capture history (fractional). */
  days: number;
  /** What unlocks: "brief" on the Brief tab, "draft" on the Draft score tab. */
  context?: "brief" | "draft";
}

/** No report yet: when the preliminary (day 3) and full (day 7) briefs unlock, with a history bar. */
export function BriefLocked({ status, days, context = "brief" }: BriefLockedProps) {
  const draft = context === "draft";
  if (status === "watching") {
    return (
      <EmptyState
        icon={<ClockIcon />}
        title="Waiting for an AI Overview"
        body={`${draft ? "Draft scoring needs a brief, and the brief" : "The brief"} starts once Google shows an AI Overview for this search. We check every 3 hours and notify you when it appears.`}
      />
    );
  }
  if (status === "paused") {
    return (
      <EmptyState
        icon={<ClockIcon />}
        title="Tracking is paused"
        body={`Briefs are built from fresh captures. Resume tracking from the Actions menu and the ${draft ? "brief, and draft scoring with it," : "brief"} unlocks at ${PRELIMINARY_DAYS} days of history.`}
      />
    );
  }
  const started = days >= PRELIMINARY_DAYS;
  const title = draft
    ? "Draft scoring opens with your first brief"
    : started
      ? "Your first brief is on its way"
      : `Your brief unlocks at ${PRELIMINARY_DAYS} days of history`;
  const next = days < PRELIMINARY_DAYS ? `Preliminary at day ${PRELIMINARY_DAYS}` : days < FULL_DAYS ? `Full brief at day ${FULL_DAYS}` : "Full brief due";
  return (
    <Card padding="lg">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-faint text-brand">
          <FileTextIcon />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold tracking-tight text-ink">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            {draft ? "Your draft is scored against the brief. " : ""}A preliminary brief is written at day {PRELIMINARY_DAYS} of history and
            the full brief at day {FULL_DAYS}, from every capture so far. Reports start on the hour; studying the cited pages and writing the
            brief usually takes about an hour more.
          </p>
        </div>
      </div>
      <div className="mt-6">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-medium tabular-nums text-ink">{formatDecimal(days, 1)} days of history</span>
          <span className="text-xs text-ink-muted">{next}</span>
        </div>
        <div className="relative mt-2">
          <ProgressBar
            value={Math.min(days, FULL_DAYS)}
            max={FULL_DAYS}
            size="lg"
            label="Days of capture history"
            valueText={`${formatDecimal(days, 1)} of ${FULL_DAYS} days`}
          />
          <span aria-hidden="true" className="absolute top-0 h-2 w-0.5 bg-white" style={{ left: `${(PRELIMINARY_DAYS / FULL_DAYS) * 100}%` }} />
        </div>
        <div className="relative mt-2 h-4 text-[11px] text-ink-muted" aria-hidden="true">
          <span className="absolute left-0">Day 0</span>
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(PRELIMINARY_DAYS / FULL_DAYS) * 100}%` }}>
            Day {PRELIMINARY_DAYS}
          </span>
          <span className="absolute right-0">Day {FULL_DAYS}</span>
        </div>
      </div>
    </Card>
  );
}

function Step({ state, title, detail, children }: { state: "done" | "active" | "waiting"; title: string; detail: ReactNode; children?: ReactNode }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          state === "done" && "bg-good-soft text-good",
          state === "active" && "bg-brand-faint text-brand",
          state === "waiting" && "bg-surface-sunken text-ink-soft",
        )}
      >
        {state === "done" ? <CheckIcon /> : state === "active" ? <LoaderIcon className="animate-spin" /> : <ClockIcon />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-[15px] font-semibold text-ink">{title}</p>
          <p className="text-xs tabular-nums text-ink-muted">{detail}</p>
        </div>
        {children}
      </div>
    </li>
  );
}

export interface BriefProgressProps {
  report: ReportSummary;
  progress: PageProgress | null;
}

/** A report still being built: pages parsed, pages tagged, brief being written. */
export function BriefProgress({ report, progress }: BriefProgressProps) {
  const p = progress ?? { total: report.page_urls.length, parsed: 0, parsedOk: 0, tagged: 0 };
  const parsedDone = report.stage !== "pages" || (p.total > 0 && p.parsed >= p.total);
  const taggedDone = report.stage !== "pages" || (parsedDone && p.tagged >= p.parsedOk);
  const writing = report.stage === "brief";
  return (
    <Card padding="none">
      <div className="p-5 sm:p-6">
        <CardHeader
          as="h2"
          eyebrow="In progress"
          title={`${REPORT_KIND_LABELS[report.kind]} · ${reportWindow(report)}`}
          description={`Built from ${plural(report.renders, "render")}. We study the most-cited pages, then Claude writes the brief from the counts. This page updates when you reload it.`}
        />
      </div>
      <ol className="divide-y divide-line border-t border-line">
        <Step
          state={parsedDone ? "done" : "active"}
          title="Reading the cited pages"
          detail={p.total ? `${p.parsed} of ${plural(p.total, "page")} parsed` : "Choosing pages"}
        >
          {!parsedDone && p.total > 0 && <ProgressBar className="mt-2" value={p.parsed} max={p.total} label="Pages parsed" />}
        </Step>
        <Step
          state={taggedDone ? "done" : parsedDone ? "active" : "waiting"}
          title="Tagging topics, entities and evidence"
          detail={p.parsedOk ? `${p.tagged} of ${plural(p.parsedOk, "page")} tagged` : "After parsing"}
        >
          {parsedDone && !taggedDone && p.parsedOk > 0 && <ProgressBar className="mt-2" value={p.tagged} max={p.parsedOk} label="Pages tagged" />}
        </Step>
        <Step
          state={writing ? "active" : "waiting"}
          title="Writing the brief"
          detail={writing ? (report.brief_submitted ? "Usually within an hour" : "Queued") : "After tagging"}
        />
      </ol>
    </Card>
  );
}

/** A report that failed, with its error in plain words. */
export function BriefFailed({ report }: { report: ReportSummary }) {
  return (
    <Alert tone="bad" title={`The ${REPORT_KIND_LABELS[report.kind].toLowerCase()} for ${reportWindow(report)} failed`}>
      <p>{report.error?.trim() || "No error was recorded."}</p>
      <p className="mt-1">
        Your captures are safe. The next report is built from scratch at its milestone: the full report at day 7, then a refresh every 28
        days.
      </p>
    </Alert>
  );
}

/** Short note on the Draft score tab while the first brief is still being built. */
export function BriefPendingNote({ queryId, report }: { queryId: string; report: ReportSummary }) {
  return (
    <EmptyState
      icon={<LoaderIcon className="animate-spin" />}
      title="Your brief is being written"
      body={
        <>
          Scoring compares your draft with the brief, so it opens when the {REPORT_KIND_LABELS[report.kind].toLowerCase()} is ready.{" "}
          <Link href={`/queries/${queryId}/brief`} className="font-medium text-brand hover:text-brand-strong">
            See its progress
          </Link>
          .
        </>
      }
    />
  );
}
