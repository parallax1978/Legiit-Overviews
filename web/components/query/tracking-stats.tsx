// Tracking tab summary: the four stat cards from tracking_summary() and the explainer shown before a
// URL is set (what we check on every capture, closest match first).
import { Card } from "@/components/ui/card";
import { CheckList } from "@/components/ui/feedback";
import { CalendarIcon, QuoteIcon, TargetIcon, TrendingUpIcon } from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import { formatCount, formatPercent, matchLevelLabel, truncate } from "@/lib/format";
import type { TrackingSummaryData } from "@/lib/query/tracking";

function shareCaption(cited: number, present: number, noun: string): string {
  if (present === 0) return "n=0 · no AI Overview in this window";
  return `n=${formatCount(present)} overviews · ${formatCount(cited)} ${noun}`;
}

export function TrackingStats({ summary }: { summary: TrackingSummaryData }) {
  const brandTracked = summary.brand_names.length > 0;
  const brandShare = summary.present_7d > 0 ? summary.brand_7d / summary.present_7d : null;
  const latest = summary.latest;
  return (
    <StatGrid>
      <StatCard
        label="Cited, last 7 days"
        icon={<TargetIcon />}
        tone={summary.cited_7d > 0 ? "brand" : "ink"}
        value={formatPercent(summary.survival_7d)}
        caption={shareCaption(summary.cited_7d, summary.present_7d, "cited")}
      />
      <StatCard
        label="Cited, last 28 days"
        icon={<CalendarIcon />}
        value={formatPercent(summary.survival_28d)}
        caption={shareCaption(summary.cited_28d, summary.present_28d, "cited")}
      />
      <StatCard
        label="Brand named, 7 days"
        icon={<QuoteIcon />}
        value={brandTracked ? formatPercent(brandShare) : "–"}
        caption={brandTracked ? shareCaption(summary.brand_7d, summary.present_7d, "named it") : "Add a brand name to track this"}
      />
      <StatCard
        label="Latest match"
        icon={<TrendingUpIcon />}
        tone={latest?.level === "exact_url" || latest?.level === "path_prefix" ? "good" : latest?.level ? "brand" : "ink"}
        value={latest?.level ? matchLevelLabel(latest.level) : <span className="text-ink-soft">Not cited</span>}
        caption={
          latest ? (
            <span className="block">
              {latest.quoted_heading ? (
                <span className="block truncate" title={latest.quoted_heading}>
                  &ldquo;{truncate(latest.quoted_heading, 60)}&rdquo;
                </span>
              ) : null}
              <LocalTime value={latest.captured_at} format="relative" />
            </span>
          ) : (
            "None in the last 28 days"
          )
        }
      />
    </StatGrid>
  );
}

/** What gets checked on every capture; shown until the user adds a URL. */
export function TrackingExplainer({ brandTracked }: { brandTracked: boolean }) {
  return (
    <Card padding="lg" tinted>
      <h3 className="text-base font-bold tracking-tight text-ink">Add your page to see when Google cites it</h3>
      <p className="mt-1.5 text-sm leading-6 text-ink-muted">
        On every capture, 8 times a day, we compare each citation in the AI Overview with your URL and record the closest match:
      </p>
      <CheckList
        className="mt-4"
        items={[
          <span key="exact">
            <strong className="font-semibold text-ink">Exact URL</strong>: your page itself, also after redirects and its canonical tag.
          </span>,
          <span key="path">
            <strong className="font-semibold text-ink">Same section</strong>: another page under your URL&rsquo;s path.
          </span>,
          <span key="host">
            <strong className="font-semibold text-ink">Same subdomain</strong>: any page on the same host, such as blog.yoursite.com.
          </span>,
          <span key="domain">
            <strong className="font-semibold text-ink">Same domain</strong>: any page on yoursite.com.
          </span>,
          <span key="brand">
            <strong className="font-semibold text-ink">Brand named</strong>: the answer text names your brand, cited or not
            {brandTracked ? " (already on for the names you added)." : "."}
          </span>,
        ]}
      />
      <p className="mt-4 text-sm leading-6 text-ink-muted">
        YouTube, Reddit, Medium, LinkedIn, Facebook and Quora count only at exact URL or same section, because the rest of those sites
        isn&rsquo;t yours. When you save, we also re-check the last 28 days so the history fills in right away.
      </p>
    </Card>
  );
}
