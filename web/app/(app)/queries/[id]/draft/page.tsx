// Draft score tab: score a pasted draft or a URL against the newest ready brief, see the selected
// result (?score=<id>, default the newest finished one) and the query's scoring history.
import { notFound } from "next/navigation";
import { BriefLocked, BriefPendingNote, historyDays, reportWindow } from "@/components/query/brief-status";
import { DraftHistory } from "@/components/query/draft-history";
import { DraftFailed, DraftResult } from "@/components/query/draft-result";
import { DraftScorer } from "@/components/query/draft-scorer";
import { ErrorCard } from "@/components/ui/feedback";
import { RetryButton } from "@/components/ui/retry-button";
import { SectionHeading } from "@/components/ui/typography";
import { REPORT_KIND_LABELS } from "@/lib/format";
import { getTrackedQuery, isUuid } from "@/lib/queries";
import { getDraftScore, getDraftScores, getReports, getWinnersFaq, runningScore } from "@/lib/query/report";
import type { DraftScoreResult, DraftScoreRow } from "@/lib/types";

export const metadata = { title: "Draft score" };

export default async function DraftTab({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ score?: string | string[] }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { data: q } = await getTrackedQuery(id);
  if (!q) notFound();

  const [reports, scores] = await Promise.all([getReports(q.id), getDraftScores(q.id)]);
  if (reports.data === null || scores.data === null) {
    return (
      <ErrorCard title="Draft scores didn't load" detail={reports.error ?? scores.error} action={<RetryButton />}>
        We couldn&rsquo;t read your brief or past scores just now. Try again in a moment.
      </ErrorCard>
    );
  }

  const ready = reports.data.find((r) => r.stage === "ready") ?? null;
  const history = scores.data;

  if (!ready && history.length === 0) {
    const building = reports.data.find((r) => r.stage === "pages" || r.stage === "brief");
    if (building) return <BriefPendingNote queryId={q.id} report={building} />;
    return <BriefLocked status={q.status} days={historyDays(q.first_captured_at)} context="draft" />;
  }

  const requested = typeof sp.score === "string" && isUuid(sp.score) ? sp.score : null;
  const selectedId = (requested && history.find((s) => s.id === requested)?.id) || history.find((s) => s.status === "done")?.id || null;
  const selected = selectedId ? await getDraftScore(q.id, selectedId) : null;
  if (selected?.error) {
    return (
      <ErrorCard title="This score didn't load" detail={selected.error} action={<RetryButton />}>
        We couldn&rsquo;t read this draft score just now. Try again in a moment.
      </ErrorCard>
    );
  }
  const row = selected?.data ?? null;
  const faq = row?.status === "done" && row.report_id ? await getWinnersFaq(row.report_id, q.own_url_key) : null;

  const running = runningScore(history);

  return (
    <div className="space-y-8">
      <section className="space-y-4" aria-labelledby="draft-new-score">
        <SectionHeading
          id="draft-new-score"
          title="Score a draft"
          description={
            ready
              ? `Measured like a cited page and checked against the ${REPORT_KIND_LABELS[ready.kind].toLowerCase()} (${reportWindow(ready)}).`
              : "Scoring opens again when a brief is ready."
          }
        />
        {ready ? <DraftScorer trackedQueryId={q.id} running={running} /> : null}
      </section>

      {row && (
        <section className="space-y-4" aria-labelledby="draft-result">
          <h2 id="draft-result" className="sr-only">
            Result
          </h2>
          {row.status === "done" && row.result ? (
            <DraftResult row={row as DraftScoreRow & { result: DraftScoreResult }} faq={faq} />
          ) : row.status === "failed" ? (
            <DraftFailed row={row} />
          ) : null}
        </section>
      )}

      {history.length > 0 && (
        <section className="space-y-4" aria-labelledby="draft-history">
          <SectionHeading id="draft-history" title="History" description="Every draft you scored for this search. Pick one to see its result." />
          <DraftHistory queryId={q.id} scores={history} selectedId={row?.id ?? null} />
        </section>
      )}
    </div>
  );
}
