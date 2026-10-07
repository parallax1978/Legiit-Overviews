// Tracking tab: the user's own page and brand names, cited share over 7 and 28 days, a 28-day daily
// strip, citation events, and a banner when Google changed overviews broadly in the last 3 days.
import { notFound } from "next/navigation";
import { TrackingEvents } from "@/components/query/tracking-events";
import { TrackingOwnPage } from "@/components/query/tracking-own-page";
import { TrackingExplainer, TrackingStats } from "@/components/query/tracking-stats";
import { TrackingStrip } from "@/components/query/tracking-strip";
import { Alert, ErrorCard } from "@/components/ui/feedback";
import { RetryButton } from "@/components/ui/retry-button";
import { SectionHeading } from "@/components/ui/typography";
import { formatDayUTC } from "@/lib/format";
import { getTrackedQuery } from "@/lib/queries";
import { getTrackingData } from "@/lib/query/tracking";

export const metadata = { title: "Tracking" };

export default async function TrackingTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: q } = await getTrackedQuery(id);
  if (!q) notFound();

  const { data, error } = await getTrackingData(q.id);
  if (error || !data) {
    return (
      <ErrorCard title="Tracking didn't load" detail={error} action={<RetryButton />}>
        We couldn&rsquo;t read your citation history just now. Matching keeps running on every capture; try again in a moment.
      </ErrorCard>
    );
  }

  const { summary, exact, events, ownPage, platformEvents } = data;
  const ownUrl = summary?.own_url ?? q.own_url;
  const brandNames = summary?.brand_names ?? q.brand_names ?? [];
  const configured = Boolean(ownUrl) || brandNames.length > 0;
  const latestPlatform = platformEvents[0];

  return (
    <div className="space-y-8">
      {latestPlatform && (
        <Alert tone="warn" title={`Google-wide change detected on ${formatDayUTC(latestPlatform.day)}`}>
          Overviews changed across many searches that day, so lost alerts are held that day. A drop then is more likely Google&rsquo;s change
          than your page.
        </Alert>
      )}

      <TrackingOwnPage
        trackedQueryId={q.id}
        ownUrl={ownUrl}
        brandNames={brandNames}
        parsedAt={ownPage?.url === ownUrl ? (ownPage?.parsed_at ?? null) : null}
      />

      {!ownUrl && <TrackingExplainer brandTracked={brandNames.length > 0} />}

      {configured && summary && (
        <section className="space-y-4" aria-labelledby="tracking-summary">
          <SectionHeading
            id="tracking-summary"
            title="How often Google cites you"
            description="Share of renders with an AI Overview that cited your exact URL. The daily strip counts any match level and colours each day by its closest match."
          />
          <TrackingStats summary={summary} exact={ownUrl ? exact : null} />
          <TrackingStrip daily={summary.daily} brandTracked={brandNames.length > 0} />
        </section>
      )}

      {configured && (
        <section className="space-y-4" aria-labelledby="tracking-events">
          <SectionHeading id="tracking-events" title="Events" description="Newest first. Each one also sends you a notification." />
          <TrackingEvents events={events} ownUrlKey={ownUrl ? q.own_url_key : null} />
        </section>
      )}
    </div>
  );
}
