// Query page frame: report-style header (kicker, keyword, meta, status, actions) and the six tab links.
// Tab pages load their own data; getTrackedQuery(id) is cached per request, so calling it again is free.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { StatusChip } from "@/components/ui/chip";
import { Alert, ErrorCard } from "@/components/ui/feedback";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { RetryButton } from "@/components/ui/retry-button";
import { Tabs } from "@/components/ui/tabs";
import { MetaList, PageHeader } from "@/components/ui/typography";
import { deviceLabel, plural } from "@/lib/format";
import { getTrackedQuery } from "@/lib/queries";
import { QueryActions } from "./query-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { data } = await getTrackedQuery(id);
  const keyword = data?.display_keyword ?? "Query";
  // Live gets "<keyword> · Legiit Overviews"; each tab sets a plain title ("Patterns") that becomes
  // "Patterns · <keyword> · Legiit Overviews".
  return { title: { default: keyword, template: `%s · ${keyword} · Legiit Overviews` } };
}

export default async function QueryLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: q, error } = await getTrackedQuery(id);

  if (error) {
    return (
      <ErrorCard title="This query didn't load" detail={error} action={<RetryButton />}>
        We couldn&rsquo;t read this query just now. Its captures keep running; try again in a moment.
      </ErrorCard>
    );
  }
  if (!q) notFound();

  const base = `/queries/${q.id}`;
  const tabs = [
    { href: base, label: "Live", exact: true },
    { href: `${base}/patterns`, label: "Patterns" },
    { href: `${base}/pages`, label: "Pages" },
    { href: `${base}/brief`, label: "Brief" },
    { href: `${base}/draft`, label: "Draft score" },
    { href: `${base}/tracking`, label: "Tracking" },
  ];

  return (
    <div>
      <Link href="/queries" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeftIcon className="h-3.5 w-3.5" /> Queries
      </Link>
      <PageHeader
        className="mt-4"
        kicker="AI Overview"
        title={q.display_keyword}
        badges={<StatusChip status={q.status} />}
        meta={
          <MetaList
            items={[
              q.location?.name ?? `Location ${q.series.location_code}`,
              q.series.language_code,
              deviceLabel(q.series.device),
              <span key="since">
                Tracking since <LocalTime value={q.created_at} format="date" />
              </span>,
              `${plural(q.renders, "render")} captured`,
            ]}
          />
        }
        actions={<QueryActions id={q.id} keyword={q.display_keyword} status={q.status} resumeStatus={q.present > 0 ? "tracking" : "watching"} />}
      />
      {q.status === "watching" && (
        <Alert tone="warn" className="mt-5" title="No AI Overview on this search yet">
          We check every 3 hours. When an overview appears, tracking starts on its own and you get a notification.
        </Alert>
      )}
      {q.status === "paused" && (
        <Alert tone="info" className="mt-5" title="Paused">
          No new captures are scheduled for you. History stays here; resume from the menu to pick up again.
        </Alert>
      )}
      <Tabs className="mt-6" label="Query sections" tabs={tabs} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
