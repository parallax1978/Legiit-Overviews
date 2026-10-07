// Server loaders for the Live and Patterns tabs: series_metrics over a window, the latest capture with
// its citations, capture statuses for the timeline, and the exact organic overlap counts. Request-cached
// with React cache(); RLS applies.
import "server-only";
import { cache } from "react";
import type { Loaded } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { CitationRow, MetricEvidence, ParsedOrganic, ParsedSentence, SeriesMetrics, SnapshotFormats, SnapshotStatus } from "@/lib/types";

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/** Fills missing arrays so the tabs can map over every list without checks. */
export function normalizeMetrics(raw: unknown): SeriesMetrics {
  const m = (raw ?? {}) as Partial<SeriesMetrics>;
  return {
    window: m.window ?? { from: "", to: "" },
    renders: m.renders ?? 0,
    present: m.present ?? 0,
    errors: m.errors ?? 0,
    days: m.days ?? 0,
    // Metrics stored before these existed shared one denominator (present) and had no pending count.
    extracted: m.extracted ?? m.present ?? 0,
    extraction_pending: m.extraction_pending ?? 0,
    answer_lead: m.answer_lead ?? undefined,
    presence_rate: m.presence_rate ?? null,
    change_rate: m.change_rate ?? null,
    confidence: m.confidence ?? "low",
    citation_stability: { url: m.citation_stability?.url ?? null, domain: m.citation_stability?.domain ?? null },
    citations_per_render: m.citations_per_render ?? null,
    median_word_count: m.median_word_count ?? null,
    organic_overlap: { top10: m.organic_overlap?.top10 ?? null, top20: m.organic_overlap?.top20 ?? null },
    claims: arr(m.claims),
    entities: arr(m.entities),
    sources: arr(m.sources),
    domains: arr(m.domains),
    formats: arr(m.formats),
    unsupported_claims: arr(m.unsupported_claims),
    daily: arr<SeriesMetrics["daily"][number]>(m.daily).map((d) => ({
      ...d,
      claims_added: arr(d.claims_added),
      claims_dropped: arr(d.claims_dropped),
      entities_added: arr(d.entities_added),
      entities_dropped: arr(d.entities_dropped),
      citations_added: arr(d.citations_added),
      citations_dropped: arr(d.citations_dropped),
    })),
  };
}

/** `series_metrics(series, from, to)`: every count the tabs show, computed in SQL. */
export const getSeriesMetrics = cache(async (seriesId: string, from: string, to: string): Promise<Loaded<SeriesMetrics>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("series_metrics", { p_series_id: seriesId, p_from: from, p_to: to });
  if (error) return { data: null, error: error.message };
  return { data: normalizeMetrics(data), error: null };
});

/** One capture as the Live tab shows it. */
export interface LiveSnapshot {
  id: string;
  captured_at: string;
  status: SnapshotStatus;
  sentences: ParsedSentence[];
  organic: ParsedOrganic[];
  formats: Partial<SnapshotFormats>;
  citations: Pick<CitationRow, "idx" | "url" | "url_key" | "host" | "reg_domain" | "title" | "source" | "passage">[];
}

export interface LatestCaptures {
  /** The newest capture of any status, or null before the first capture. */
  latest: LiveSnapshot | null;
  /** The newest capture that showed an overview (the latest itself when it did), or null. */
  lastPresent: LiveSnapshot | null;
}

const SNAPSHOT_COLUMNS = "id, captured_at, status, sentences, organic, formats";

type SnapshotBase = Omit<LiveSnapshot, "citations">;

function toBase(row: Record<string, unknown>): SnapshotBase {
  return {
    id: row.id as string,
    captured_at: row.captured_at as string,
    status: row.status as SnapshotStatus,
    sentences: arr<ParsedSentence>(row.sentences).map((s) => ({ ...s, citations: arr<number>(s.citations) })),
    organic: arr<ParsedOrganic>(row.organic),
    formats: (row.formats ?? {}) as Partial<SnapshotFormats>,
  };
}

/** The latest capture and the latest one with an overview, each with its citations. */
export const getLatestCaptures = cache(async (seriesId: string): Promise<Loaded<LatestCaptures>> => {
  const supabase = await createClient();
  const [latestRes, presentRes] = await Promise.all([
    supabase.from("snapshots").select(SNAPSHOT_COLUMNS).eq("series_id", seriesId).order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("snapshots")
      .select(SNAPSHOT_COLUMNS)
      .eq("series_id", seriesId)
      .eq("status", "present")
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (latestRes.error) return { data: null, error: latestRes.error.message };
  if (presentRes.error) return { data: null, error: presentRes.error.message };

  const latestBase = latestRes.data ? toBase(latestRes.data) : null;
  const presentBase = presentRes.data ? toBase(presentRes.data) : null;
  const ids = [...new Set([latestBase?.id, presentBase?.id].filter((x): x is string => !!x))];
  const byId = new Map<string, LiveSnapshot["citations"]>();
  if (ids.length) {
    const { data, error } = await supabase
      .from("citations")
      .select("snapshot_id, idx, url, url_key, host, reg_domain, title, source, passage")
      .in("snapshot_id", ids)
      .order("idx", { ascending: true });
    if (error) return { data: null, error: error.message };
    for (const row of (data ?? []) as (LiveSnapshot["citations"][number] & { snapshot_id: string })[]) {
      const { snapshot_id, ...c } = row;
      const list = byId.get(snapshot_id) ?? [];
      list.push(c);
      byId.set(snapshot_id, list);
    }
  }
  const withCitations = (s: SnapshotBase | null): LiveSnapshot | null => (s ? { ...s, citations: byId.get(s.id) ?? [] } : null);
  return { data: { latest: withCitations(latestBase), lastPresent: withCitations(presentBase) }, error: null };
});

export interface CaptureStatusRow {
  captured_at: string;
  status: SnapshotStatus;
}

/** Capture times and statuses since `from`, oldest first (the Live timeline and capture list). */
export const getCaptureStatuses = cache(async (seriesId: string, from: string): Promise<Loaded<CaptureStatusRow[]>> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("snapshots")
    .select("captured_at, status")
    .eq("series_id", seriesId)
    .gte("captured_at", from)
    .order("captured_at", { ascending: true })
    .limit(1000);
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as CaptureStatusRow[], error: null };
});

/** Organic overlap counted exactly: cited (render, URL) pairs, and how many rank in the organic top 10 and 20. */
export interface OverlapCounts {
  occurrences: number;
  top10: number;
  top20: number;
}

/**
 * The numerators and denominator of series_metrics' organic_overlap, from metric_evidence (kind
 * overlap) with one item each, so the Patterns tab can show the exact n. Null when either call fails.
 */
export const getOverlapCounts = cache(async (seriesId: string, from: string, to: string): Promise<OverlapCounts | null> => {
  const supabase = await createClient();
  const call = (key: "top10" | "top20") =>
    supabase.rpc("metric_evidence", { p_series_id: seriesId, p_kind: "overlap", p_key: key, p_from: from, p_to: to, p_limit: 1 });
  const [top10, top20] = await Promise.all([call("top10"), call("top20")]);
  if (top10.error || top20.error) return null;
  const a = (top10.data ?? {}) as Partial<MetricEvidence>;
  const b = (top20.data ?? {}) as Partial<MetricEvidence>;
  if (typeof a.occurrences !== "number" || typeof a.citations !== "number" || typeof b.citations !== "number") return null;
  return { occurrences: a.occurrences, top10: a.citations, top20: b.citations };
});
