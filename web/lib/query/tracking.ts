// Server data for the Tracking tab: tracking_summary(), the query's citation events, its parsed own
// page and recent Google-wide platform events. RLS scopes every read to the signed-in user.
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CitationEventRow, MatchLevel, OwnPageRow, PlatformEventRow, TrackingDay } from "@/lib/types";

/** Result of `tracking_summary(p_tracked_query_id)` (the SQL in 20261007000002_metrics.sql). */
export interface TrackingSummaryData {
  own_url: string | null;
  brand_names: string[];
  renders_7d: number;
  present_7d: number;
  cited_7d: number;
  survival_7d: number | null;
  renders_28d: number;
  present_28d: number;
  cited_28d: number;
  survival_28d: number | null;
  brand_7d: number;
  latest: { captured_at: string; level: MatchLevel | null; quoted_heading: string | null } | null;
  daily: TrackingDay[];
}

/** Present renders whose citations included the exact own URL (match level exact_url). */
export interface ExactCited {
  cited_7d: number;
  cited_28d: number;
}

export interface TrackingData {
  summary: TrackingSummaryData | null;
  /** Exact-URL citations; tracking_summary's cited_* count any match level (same host, domain too). */
  exact: ExactCited | null;
  events: CitationEventRow[];
  ownPage: Pick<OwnPageRow, "url" | "resolved_url" | "parsed_at"> | null;
  /** Platform events in the last 3 UTC days, newest first. */
  platformEvents: Pick<PlatformEventRow, "id" | "day">[];
}

export type TrackingResult = { data: TrackingData; error: null } | { data: null; error: string };

const EVENT_LIMIT = 50;
const PLATFORM_EVENT_DAYS = 3;

/** The UTC date `days` before now as YYYY-MM-DD. */
function utcDayAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/** Counts own_matches at exact_url on present renders since `since` (counted in SQL). */
async function exactCount(supabase: Awaited<ReturnType<typeof createClient>>, trackedQueryId: string, since: string) {
  return supabase
    .from("own_matches")
    .select("snapshot_id, snapshots!inner(captured_at, status)", { count: "exact", head: true })
    .eq("tracked_query_id", trackedQueryId)
    .eq("level", "exact_url")
    .eq("snapshots.status", "present")
    .gte("snapshots.captured_at", since);
}

/** Everything the Tracking tab shows for one tracked query, loaded in parallel. */
export const getTrackingData = cache(async (trackedQueryId: string): Promise<TrackingResult> => {
  const supabase = await createClient();
  const now = Date.now();
  const [summary, events, ownPage, platform, exact7, exact28] = await Promise.all([
    supabase.rpc("tracking_summary", { p_tracked_query_id: trackedQueryId }),
    supabase
      .from("citation_events")
      .select("id, tracked_query_id, snapshot_id, kind, level, quoted_heading, held_for_platform_event, created_at")
      .eq("tracked_query_id", trackedQueryId)
      .order("created_at", { ascending: false })
      .limit(EVENT_LIMIT),
    supabase.from("own_pages").select("url, resolved_url, parsed_at").eq("tracked_query_id", trackedQueryId).maybeSingle(),
    supabase
      .from("platform_events")
      .select("id, day")
      .gte("day", utcDayAgo(PLATFORM_EVENT_DAYS))
      .order("day", { ascending: false }),
    // Same rolling windows as tracking_summary (now - 7 days, now - 28 days).
    exactCount(supabase, trackedQueryId, new Date(now - 7 * 86_400_000).toISOString()),
    exactCount(supabase, trackedQueryId, new Date(now - 28 * 86_400_000).toISOString()),
  ]);
  const error = summary.error ?? events.error ?? ownPage.error ?? platform.error;
  if (error) return { data: null, error: error.message };
  const raw = summary.data as TrackingSummaryData | null;
  return {
    data: {
      summary: raw ? { ...raw, brand_names: raw.brand_names ?? [], daily: Array.isArray(raw.daily) ? raw.daily : [] } : null,
      exact: exact7.error || exact28.error ? null : { cited_7d: exact7.count ?? 0, cited_28d: exact28.count ?? 0 },
      events: (events.data ?? []) as CitationEventRow[],
      ownPage: (ownPage.data as TrackingData["ownPage"]) ?? null,
      platformEvents: (platform.data ?? []) as TrackingData["platformEvents"],
    },
    error: null,
  };
});
