// Server data for the Brief and Draft score tabs: the query's reports, the selected report with its
// stored brief, page progress for reports still being built, and draft scores. Also the pure helpers
// those tabs share (typed refs, brief comparison). RLS scopes every read.
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { BriefChecks, DraftScoreRow, ReportKind, ReportPageDetail, ReportRow, ReportStage, SeriesMetrics } from "@/lib/types";

// ------------------------------------------------------------------ stored brief (BriefOutput with typed refs)

export type CellState = "covered" | "partial" | "missing";
export type HowToProduce =
  | "original_data"
  | "first_hand_test"
  | "new_statistics"
  | "better_comparison"
  | "useful_table"
  | "unanswered_question"
  | "better_examples";

/**
 * reports.analysis: BriefOutput from supabase/functions/_shared/schemas.ts with every short ref replaced
 * by a typed ref: `claim:<group uuid>`, `entity:<entity uuid>` or `page:<url_key>`.
 */
export interface StoredBrief {
  summary: string;
  matrix: {
    topics: { topic: string; claim_refs: string[]; cells: { page_ref: string; state: CellState }[] }[];
    entities: { entity: string; entity_ref: string | null; cells: { page_ref: string; state: CellState }[] }[];
  };
  common_to_all: string[];
  gaps: { gap: string; why: string; claim_refs: string[] }[];
  page_notes: { page_ref: string; does_differently: string }[];
  brief: {
    answer_first: { text: string; max_words: number };
    must_cover: { topic: string; why: string; claim_refs: string[] }[];
    entities: { name: string; entity_ref: string | null; role: "recommended" | "mentioned"; note: string }[];
    format: { structure: string; table_columns: string[]; list_items: number | null };
    evidence_to_match: { what: string; page_refs: string[] }[];
    new_to_cite: { idea: string; why_google_lacks_it: string; how_to_produce: HowToProduce; evidence_refs: string[] }[];
    questions: string[];
    outline: { heading: string; level: number; purpose: string; target_words: number; covers: string[] }[];
    checklist: string[];
    avoid: string[];
  };
}

export type TypedRef = { kind: "claim" | "entity"; id: string } | { kind: "page"; id: string };

/** Splits a typed ref ("claim:<uuid>", "entity:<uuid>", "page:<url_key>"); null for anything else. */
export function parseRef(ref: string | null | undefined): TypedRef | null {
  if (!ref) return null;
  const i = ref.indexOf(":");
  if (i <= 0) return null;
  const kind = ref.slice(0, i);
  const id = ref.slice(i + 1);
  if (!id) return null;
  if (kind === "claim" || kind === "entity" || kind === "page") return { kind, id };
  return null;
}

/** Text compared across briefs: NFKC, lowercase, punctuation and symbols removed, spaces collapsed. */
export function normText(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A brief stored in reports.analysis, defensively filled so the tab never crashes on a partial row. */
export function asStoredBrief(value: unknown): StoredBrief | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<StoredBrief>;
  const b = v.brief;
  if (!b || typeof b !== "object") return null;
  const arr = <T>(x: T[] | undefined | null): T[] => (Array.isArray(x) ? x : []);
  return {
    summary: typeof v.summary === "string" ? v.summary : "",
    matrix: { topics: arr(v.matrix?.topics), entities: arr(v.matrix?.entities) },
    common_to_all: arr(v.common_to_all),
    gaps: arr(v.gaps),
    page_notes: arr(v.page_notes),
    brief: {
      answer_first: {
        text: b.answer_first?.text ?? "",
        max_words: typeof b.answer_first?.max_words === "number" ? b.answer_first.max_words : 0,
      },
      must_cover: arr(b.must_cover).map((m) => ({ ...m, claim_refs: arr(m.claim_refs) })),
      entities: arr(b.entities),
      format: {
        structure: b.format?.structure ?? "",
        table_columns: arr(b.format?.table_columns),
        list_items: typeof b.format?.list_items === "number" ? b.format.list_items : null,
      },
      evidence_to_match: arr(b.evidence_to_match).map((e) => ({ ...e, page_refs: arr(e.page_refs) })),
      new_to_cite: arr(b.new_to_cite).map((n) => ({ ...n, evidence_refs: arr(n.evidence_refs) })),
      questions: arr(b.questions),
      outline: arr(b.outline).map((o) => ({ ...o, covers: arr(o.covers) })),
      checklist: arr(b.checklist),
      avoid: arr(b.avoid),
    },
  };
}

export interface ListDiff {
  added: string[];
  removed: string[];
}

export interface BriefDiff {
  mustCover: ListDiff;
  entities: ListDiff;
  newToCite: ListDiff;
}

function diffList(before: string[], after: string[]): ListDiff {
  const b = new Set(before.map(normText));
  const a = new Set(after.map(normText));
  const uniq = (xs: string[]) => {
    const seen = new Set<string>();
    return xs.filter((x) => {
      const k = normText(x);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  return {
    added: uniq(after).filter((x) => !b.has(normText(x))),
    removed: uniq(before).filter((x) => !a.has(normText(x))),
  };
}

/** What changed from the first brief to a refresh: must-cover topics, entities and new-to-cite ideas. */
export function compareBriefs(first: StoredBrief, latest: StoredBrief): BriefDiff {
  return {
    mustCover: diffList(
      first.brief.must_cover.map((m) => m.topic),
      latest.brief.must_cover.map((m) => m.topic),
    ),
    entities: diffList(
      first.brief.entities.map((e) => e.name),
      latest.brief.entities.map((e) => e.name),
    ),
    newToCite: diffList(
      first.brief.new_to_cite.map((n) => n.idea),
      latest.brief.new_to_cite.map((n) => n.idea),
    ),
  };
}

// ------------------------------------------------------------------ loaders

export type Loaded<T> = { data: T; error: null } | { data: null; error: string };

/** A report without its large JSON columns, for selectors and status. */
export interface ReportSummary {
  id: string;
  kind: ReportKind;
  stage: ReportStage;
  window_start: string;
  window_end: string;
  renders: number;
  page_urls: string[];
  brief_submitted: boolean;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** A ready or in-progress report with everything the Brief tab renders. */
export interface ReportDetail extends ReportSummary {
  metrics: SeriesMetrics | null;
  page_details: ReportPageDetail[] | null;
  analysis: StoredBrief | null;
  brief_markdown: string | null;
  brief_checks: BriefChecks | null;
}

const SUMMARY_COLUMNS = "id, kind, stage, window_start, window_end, renders, page_urls, brief_submitted, error, created_at, updated_at";

/** The query's reports, newest first. */
export const getReports = cache(async (trackedQueryId: string): Promise<Loaded<ReportSummary[]>> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select(SUMMARY_COLUMNS)
    .eq("tracked_query_id", trackedQueryId)
    .order("created_at", { ascending: false });
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []) as ReportSummary[], error: null };
});

/** One report with its metrics, page details, brief and checks. */
export const getReportDetail = cache(async (reportId: string): Promise<Loaded<ReportDetail | null>> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select(`${SUMMARY_COLUMNS}, metrics, page_details, analysis, brief_markdown, brief_checks`)
    .eq("id", reportId)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null, error: null };
  const row = data as Omit<ReportRow, "tracked_query_id" | "series_id">;
  return {
    data: {
      ...(row as ReportSummary),
      metrics: row.metrics ?? null,
      page_details: Array.isArray(row.page_details) ? row.page_details : null,
      analysis: asStoredBrief(row.analysis),
      brief_markdown: row.brief_markdown ?? null,
      brief_checks: row.brief_checks ?? null,
    },
    error: null,
  };
});

/** The stored brief of a report (for comparisons), or null. */
export const getReportBrief = cache(async (reportId: string): Promise<Loaded<StoredBrief | null>> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("reports").select("analysis").eq("id", reportId).maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: asStoredBrief((data as { analysis: unknown } | null)?.analysis), error: null };
});

export interface PageProgress {
  total: number;
  parsed: number; // parse finished (ok or failed)
  parsedOk: number;
  tagged: number; // tagging finished (done or failed) among pages parsed ok
}

/** How far a report's pages have got through parsing and tagging. */
export async function getPageProgress(urls: string[]): Promise<Loaded<PageProgress>> {
  if (urls.length === 0) return { data: { total: 0, parsed: 0, parsedOk: 0, tagged: 0 }, error: null };
  const supabase = await createClient();
  const { data, error } = await supabase.from("pages").select("url_key, parse_status, tag_status").in("url_key", urls);
  if (error) return { data: null, error: error.message };
  const rows = (data ?? []) as { url_key: string; parse_status: string; tag_status: string }[];
  const ok = rows.filter((r) => r.parse_status === "ok");
  return {
    data: {
      total: urls.length,
      parsed: rows.filter((r) => r.parse_status === "ok" || r.parse_status === "failed").length,
      parsedOk: ok.length,
      tagged: ok.filter((r) => r.tag_status === "done" || r.tag_status === "failed").length,
    },
    error: null,
  };
}

/** The default report to show: the newest ready one, else the newest. */
export function defaultReport(reports: ReportSummary[]): ReportSummary | null {
  return reports.find((r) => r.stage === "ready") ?? reports[0] ?? null;
}

// ------------------------------------------------------------------ draft scores

/** A draft score without its input text and full result, for the history list. */
export interface DraftScoreSummary {
  id: string;
  source: "url" | "text";
  status: DraftScoreRow["status"];
  score: number | null;
  url: string | null;
  error: string | null;
  created_at: string;
}

const HISTORY_LIMIT = 30;

/** The query's draft scores, newest first (URL inputs only; pasted text stays out of the list). */
export const getDraftScores = cache(async (trackedQueryId: string): Promise<Loaded<DraftScoreSummary[]>> => {
  const supabase = await createClient();
  const [list, urls] = await Promise.all([
    supabase
      .from("draft_scores")
      .select("id, source, status, score:result->score, error, created_at")
      .eq("tracked_query_id", trackedQueryId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    supabase
      .from("draft_scores")
      .select("id, input")
      .eq("tracked_query_id", trackedQueryId)
      .eq("source", "url")
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);
  const error = list.error ?? urls.error;
  if (error) return { data: null, error: error.message };
  const urlById = new Map(((urls.data ?? []) as { id: string; input: string }[]).map((r) => [r.id, r.input]));
  const rows = (list.data ?? []) as { id: string; source: "url" | "text"; status: DraftScoreRow["status"]; score: unknown; error: string | null; created_at: string }[];
  return {
    data: rows.map((r) => ({
      id: r.id,
      source: r.source,
      status: r.status,
      score: typeof r.score === "number" ? r.score : null,
      url: urlById.get(r.id) ?? null,
      error: r.error,
      created_at: r.created_at,
    })),
    error: null,
  };
});

/** A score still marked running after this long is treated as stuck (matches score-draft). */
const RUNNING_WINDOW_MS = 10 * 60_000;

/** The newest score when it is still running (and not stuck), for the scorer to resume polling. */
export function runningScore(history: DraftScoreSummary[], now: number = Date.now()): { id: string; created_at: string; source: "url" | "text" } | null {
  const newest = history[0];
  if (newest?.status !== "running" || now - Date.parse(newest.created_at) >= RUNNING_WINDOW_MS) return null;
  return { id: newest.id, created_at: newest.created_at, source: newest.source };
}

/** One draft score with its result, scoped to the tracked query. */
export const getDraftScore = cache(async (trackedQueryId: string, id: string): Promise<Loaded<DraftScoreRow | null>> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("draft_scores")
    .select("id, tracked_query_id, report_id, source, input, status, result, error, created_at")
    .eq("tracked_query_id", trackedQueryId)
    .eq("id", id)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: (data as DraftScoreRow | null) ?? null, error: null };
});

/** Share of a report's cited pages (own page excluded) that have an FAQ section, with the count measured. */
export const getWinnersFaq = cache(async (reportId: string, ownUrlKey: string | null): Promise<{ withFaq: number; measured: number } | null> => {
  const supabase = await createClient();
  const { data: report, error } = await supabase.from("reports").select("page_urls").eq("id", reportId).maybeSingle();
  if (error || !report) return null;
  const keys = ((report as { page_urls: string[] }).page_urls ?? []).filter((k) => k !== ownUrlKey);
  if (keys.length === 0) return null;
  const { data, error: pagesError } = await supabase.from("pages").select("url_key, has_faq:measures->has_faq").in("url_key", keys).eq("parse_status", "ok");
  if (pagesError) return null;
  const rows = (data ?? []) as { url_key: string; has_faq: unknown }[];
  const measured = rows.filter((r) => typeof r.has_faq === "boolean");
  return { withFaq: measured.filter((r) => r.has_faq === true).length, measured: measured.length };
});
