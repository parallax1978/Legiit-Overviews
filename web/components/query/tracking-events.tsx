// Citation events for the Tracking tab, newest first: first seen, lost, regained and brand mentioned,
// with the match level, the heading Google quoted, and a note when a lost alert was held for a
// Google-wide change.
import { Card } from "@/components/ui/card";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/feedback";
import { BellIcon, InfoIcon } from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { matchLevelLabel } from "@/lib/format";
import type { CitationEventKind, CitationEventRow } from "@/lib/types";

const KINDS: Record<CitationEventKind, { label: string; tone: ChipTone }> = {
  first_seen: { label: "First seen", tone: "good" },
  lost: { label: "Lost", tone: "bad" },
  regained: { label: "Regained", tone: "good" },
  brand_mention: { label: "Brand mentioned", tone: "brand" },
};

function summary(e: CitationEventRow): string {
  switch (e.kind) {
    case "first_seen":
      return "Google cited your page for the first time.";
    case "lost":
      return "No AI Overview cited your page for 2 days.";
    case "regained":
      return "Google cited your page again after losing it.";
    case "brand_mention":
      return "The answer named your brand for the first time.";
    default:
      return "";
  }
}

export function TrackingEvents({ events }: { events: CitationEventRow[] }) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={<BellIcon />}
        title="No events yet"
        body="We log the first time Google cites your page, when it drops out of every overview for 2 days, when it comes back, and the first time the answer names your brand. Each event also sends a notification."
      />
    );
  }
  return (
    <Card padding="none">
      <ol className="divide-y divide-line">
        {events.map((e) => {
          const kind = KINDS[e.kind] ?? { label: e.kind, tone: "grey" as ChipTone };
          return (
            <li key={e.id} className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={kind.tone} dot>
                    {kind.label}
                  </Chip>
                  {e.level && e.kind !== "brand_mention" && <span className="text-sm font-medium text-ink">{matchLevelLabel(e.level)}</span>}
                </div>
                <p className="mt-1.5 text-sm text-ink-muted">{summary(e)}</p>
                {e.quoted_heading && (
                  <p className="mt-1 break-words text-sm text-ink">
                    <span className="text-ink-muted">Quoted from </span>&ldquo;{e.quoted_heading}&rdquo;
                  </p>
                )}
                {e.held_for_platform_event && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warn-soft/60 px-3 py-2 text-xs leading-5 text-ink">
                    <InfoIcon className="mt-0.5 h-3.5 w-3.5 text-warn" />
                    <span>Alert held: Google changed overviews broadly that day, so this wasn&rsquo;t sent as your loss.</span>
                  </p>
                )}
              </div>
              <LocalTime value={e.created_at} format="datetime" className="shrink-0 text-xs text-ink-muted sm:pt-1" />
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
