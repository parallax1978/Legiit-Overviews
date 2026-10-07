// Server loader for the Pages tab: the report whose cited pages we show (the newest ready one with
// page details, else the newest), the parsed pages behind it, and a newer report still in progress.
import "server-only";
import { cache } from "react";
import type { Loaded } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { PageMeasures, PageRow, ReportKind, ReportPageDetail, ReportRow, ReportStage } from "@/lib/types";
import { normalizeMetrics } from "./metrics";

/** What Claude tagged on a page (PageTagOutput). */
export interface PageTags {
  topics: string[];
  entities: string[];
  evidence: { kind: string; description: string; excerpt: string }[];
  questions_answered: string[];
  answer_sentence: string | null;
  approach: string;
}

export interface PageInfo {
  url_key: string;
  url: string;
  reg_domain: string;
  parse_status: PageRow["parse_status"];
  parse_error: string | null;
  tag_status: PageRow["tag_status"];
  measures: PageMeasures | null;
  tags: PageTags | null;
}

export type PagesReportRow = Pick<
  ReportRow,
  "id" | "kind" | "stage" | "window_start" | "window_end" | "renders" | "metrics" | "page_urls" | "page_details" | "analysis" | "error" | "created_at"
>;

export interface PagesData {
  /** Null when the query has no report yet. */
  report: PagesReportRow | null;
  /** Parsed pages of the report by url_key. */
  pages: Record<string, PageInfo>;
  /** A report newer than the one shown that is still being built. */
  newer: { kind: ReportKind; stage: ReportStage } | null;
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function toTags(raw: unknown): PageTags | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<PageTags>;
  return {
    topics: arr<string>(t.topics),
    entities: arr<string>(t.entities),
    evidence: arr<PageTags["evidence"][number]>(t.evidence),
    questions_answered: arr<string>(t.questions_answered),
    answer_sentence: t.answer_sentence ?? null,
    approach: typeof t.approach === "string" ? t.approach : "",
  };
}

const LIST_COLUMNS = "id, kind, stage, created_at, page_details";
const REPORT_COLUMNS = "id, kind, stage, window_start, window_end, renders, metrics, page_urls, page_details, analysis, error, created_at";

/** The report and pages for the Pages tab of one tracked query. */
export const getPagesData = cache(async (trackedQueryId: string): Promise<Loaded<PagesData>> => {
  const supabase = await createClient();
  const { data: list, error: listError } = await supabase
    .from("reports")
    .select(LIST_COLUMNS)
    .eq("tracked_query_id", trackedQueryId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (listError) return { data: null, error: listError.message };
  const rows = (list ?? []) as { id: string; kind: ReportKind; stage: ReportStage; created_at: string; page_details: unknown }[];
  if (!rows.length) return { data: { report: null, pages: {}, newer: null }, error: null };

  const ready = rows.find((r) => r.stage === "ready" && arr(r.page_details).length > 0);
  const chosen = ready ?? rows[0];
  const newest = rows[0];
  const newer = chosen.id !== newest.id && (newest.stage === "pages" || newest.stage === "brief") ? { kind: newest.kind, stage: newest.stage } : null;

  const { data: full, error: reportError } = await supabase.from("reports").select(REPORT_COLUMNS).eq("id", chosen.id).maybeSingle();
  if (reportError) return { data: null, error: reportError.message };
  if (!full) return { data: { report: null, pages: {}, newer: null }, error: null };
  const report = full as PagesReportRow;
  report.page_urls = arr<string>(report.page_urls);
  report.page_details = report.page_details ? arr<ReportPageDetail>(report.page_details).map((d) => ({ ...d, passages: arr(d.passages) })) : null;
  report.metrics = report.metrics ? normalizeMetrics(report.metrics) : null;

  const keys = [...new Set([...report.page_urls, ...(report.page_details ?? []).map((d) => d.url_key)])];
  const pages: Record<string, PageInfo> = {};
  if (keys.length) {
    const { data: pageRows, error: pagesError } = await supabase
      .from("pages")
      .select("url_key, url, reg_domain, parse_status, parse_error, tag_status, measures, tags")
      .in("url_key", keys);
    if (pagesError) return { data: null, error: pagesError.message };
    for (const p of (pageRows ?? []) as (Omit<PageInfo, "tags"> & { tags: unknown })[]) {
      pages[p.url_key] = { ...p, tags: toTags(p.tags) };
    }
  }
  return { data: { report, pages, newer }, error: null };
});
