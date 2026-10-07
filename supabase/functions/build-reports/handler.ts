// build-reports (cron): creates due reports, stores their metrics once the window's captures are
// extracted, picks and parses the cited pages, locates Google's passages in them, and moves a report
// from 'pages' to 'brief' once its pages are parsed and tagged (submit-batches then writes the brief).
import { must, serviceClient } from "../_shared/db.ts";
import { json, requireCron } from "../_shared/http.ts";
import { normalizeUrl } from "../_shared/normalize.ts";
import { ensurePages, foreignUrl, locatePassages, needsParse, type PageRef, type PageState } from "../_shared/pages.ts";
import type { PassageLocation, SeriesMetrics, SourceMetric } from "../_shared/types.ts";

/** Cited pages analysed per report (plus the user's own page). */
export const TOP_PAGES = 10;
/** Metrics wait this long for the window's last captures to be extracted before being computed anyway. */
export const EXTRACTION_WAIT_MS = 3 * 3_600_000;
/**
 * A report whose pages have all been attempted but have not settled goes to the brief anyway this
 * long after the later of its creation and its pages' last parse attempt.
 */
export const SETTLE_TIMEOUT_MS = 6 * 3_600_000;
/** A report whose metrics could not be computed for this long is marked failed. */
const METRICS_TIMEOUT_MS = 6 * 3_600_000;
/** Stop starting new work (reports, page parses) after this long so the response goes out before the wall-clock limit. */
const TIME_BUDGET_MS = 110_000;

export interface PageDetail {
  url_key: string;
  ref: string; // P<n>
  share: number;
  passages: PassageLocation[];
}

interface ReportRow {
  id: string;
  tracked_query_id: string;
  series_id: string;
  kind: string;
  window_start: string;
  window_end: string;
  /** metrics->sources; null until the report's metrics are stored. */
  sources: SourceMetric[] | null;
  page_urls: string[];
  page_details: PageDetail[] | null;
  created_at: string;
  tracked_queries: { own_url: string | null } | null;
}

interface PageRow extends PageState {
  url: string;
  markdown: string | null;
}

export interface BuildSummary {
  created: { id: string; tracked_query_id: string; kind: string }[];
  metrics: number;
  metrics_failed: number;
  /** Reports whose metrics wait for the window's captures to be extracted. */
  waiting_extraction: number;
  selected: number;
  parsed: number;
  parse_failed: number;
  advanced: number;
  forced: number;
  waiting: number;
}

export interface BuildOptions {
  now?: Date;
  /** Limits the run to these tracked queries (tests). */
  trackedQueryIds?: string[];
  /** Caps the pages parsed in this run (tests); production parses until the time budget is spent. */
  parseBudget?: number;
}

/**
 * The pages a report analyses: the most-cited non-platform sources plus the user's own page. The
 * own page's key is derived from its URL here, never read from the user-writable tracked query,
 * because the pages cache is shared: a stored key could point another user's page at this URL.
 */
export function selectPages(sources: SourceMetric[], own: { url: string | null }): { refs: PageRef[]; shares: Map<string, number> } {
  const refs: PageRef[] = [];
  const shares = new Map<string, number>();
  for (const s of sources) {
    if (refs.length >= TOP_PAGES) break;
    if (s.platform || shares.has(s.url_key)) continue;
    refs.push({ url_key: s.url_key, url: s.url });
    shares.set(s.url_key, s.share);
  }
  if (own.url) {
    const key = normalizeUrl(own.url);
    if (!shares.has(key)) {
      refs.push({ url_key: key, url: own.url });
      shares.set(key, sources.find((s) => s.url_key === key)?.share ?? 0);
    }
  }
  return { refs, shares };
}

/** A page is settled when its parse is current and, if it parsed, its tags are done or failed. */
export function pageSettled(page: PageRow | undefined, now: number): boolean {
  if (!page || foreignUrl(page) || needsParse(page, 7, now)) return false;
  if (page.parse_status === "failed") return true;
  return page.tag_status === "done" || page.tag_status === "failed";
}

/** A page has been attempted once its row exists and a parse has run, whatever the outcome. */
function pageAttempted(page: PageRow | undefined): boolean {
  return !!page && page.parse_status !== "pending";
}

/**
 * The URL to parse a page from: the first of its stored URL, the URL Google cited and the key
 * itself that normalises to the key, so a page is never fetched from a URL another key stands for.
 * Null when none does (the key came from an older normalisation); such a page is skipped.
 */
export function pageUrl(key: string, page: { url?: string | null } | undefined, cited: string | undefined): string | null {
  for (const u of [page?.url, cited, `https://${key}`]) if (u && normalizeUrl(u) === key) return u;
  return null;
}

export async function buildReports(opts: BuildOptions = {}): Promise<BuildSummary> {
  const db = serviceClient();
  const started = Date.now();
  const deadline = started + TIME_BUDGET_MS;
  const now = opts.now ?? new Date();
  const scope = opts.trackedQueryIds ?? null;
  let budget = opts.parseBudget ?? Infinity;
  const summary: BuildSummary = {
    created: [], metrics: 0, metrics_failed: 0, waiting_extraction: 0, selected: 0, parsed: 0, parse_failed: 0, advanced: 0, forced: 0, waiting: 0,
  };

  // 1. Create the reports that are due (idempotent; serialised in SQL).
  const created = must(
    await db.rpc("create_due_reports", { p_now: now.toISOString(), p_tracked_query_ids: scope }),
    "create_due_reports",
  ) as { id: string; tracked_query_id: string; kind: string }[];
  summary.created = created.map((r) => ({ id: r.id, tracked_query_id: r.tracked_query_id, kind: r.kind }));

  // 2. Work through every report still at stage 'pages', oldest first.
  let query = db.from("reports")
    .select("id, tracked_query_id, series_id, kind, window_start, window_end, sources:metrics->sources, page_urls, page_details, created_at, tracked_queries(own_url)")
    .eq("stage", "pages")
    .order("created_at", { ascending: true })
    .limit(200);
  if (scope) query = query.in("tracked_query_id", scope);
  const reports = must(await query, "load reports") as unknown as ReportRow[];

  for (const report of reports) {
    if (Date.now() >= deadline) break;
    try {
      budget -= await processReport(report, now, budget, deadline, summary);
    } catch (e) {
      console.error(`report ${report.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return summary;
}

/** Present captures in the window whose extraction has not finished (they would count as renders without claims). */
async function unextractedInWindow(report: ReportRow): Promise<number> {
  const { count, error } = await serviceClient().from("snapshots").select("id", { count: "exact", head: true })
    .eq("series_id", report.series_id).eq("status", "present")
    .gte("captured_at", report.window_start).lt("captured_at", report.window_end)
    .in("extraction", ["pending", "submitted", "reused"]);
  if (error) throw new Error(`count unextracted: ${error.message}`);
  return count ?? 0;
}

/** Moves one report at stage 'pages' forward. Returns the number of page parses it used. */
async function processReport(report: ReportRow, now: Date, budget: number, deadline: number, summary: BuildSummary): Promise<number> {
  const db = serviceClient();
  const age = now.getTime() - Date.parse(report.created_at);

  // Metrics at the window end, once the window's captures are extracted (extraction lags capture by
  // an hour or so; a capture counted before its claims exist would understate every share).
  if (!report.sources) {
    if (age < EXTRACTION_WAIT_MS && await unextractedInWindow(report) > 0) {
      summary.waiting_extraction++;
      return 0;
    }
    const { data, error } = await db.rpc("series_metrics", {
      p_series_id: report.series_id, p_from: report.window_start, p_to: report.window_end,
    });
    if (error || !data) {
      summary.metrics_failed++;
      console.error(`report ${report.id}: metrics failed: ${error?.message ?? "no data"}`);
      if (age > METRICS_TIMEOUT_MS) {
        await db.from("reports").update({ stage: "failed", error: `metrics: ${error?.message ?? "no data"}`, updated_at: now.toISOString() })
          .eq("id", report.id).eq("stage", "pages");
      }
      return 0;
    }
    const metrics = data as SeriesMetrics;
    must(
      await db.from("reports").update({ metrics, renders: metrics.renders, updated_at: now.toISOString() }).eq("id", report.id),
      "save metrics",
    );
    report.sources = metrics.sources ?? [];
    summary.metrics++;
  }

  // Page selection, once.
  const { refs, shares } = selectPages(report.sources ?? [], { url: report.tracked_queries?.own_url ?? null });
  if (!report.page_details) {
    report.page_urls = refs.map((r) => r.url_key);
    summary.selected++;
  } else {
    // Keep the stored selection; the shares come from the stored details.
    for (const d of report.page_details) shares.set(d.url_key, d.share);
  }
  const keys = report.page_urls;
  const urlOf = new Map(refs.map((r) => [r.url_key, r.url]));

  // Parse what is missing, stale or stored under a URL that is not the key's, within the run's time
  // budget (and the test cap).
  let pages = await loadPages(keys);
  const urls = new Map(keys.map((k) => [k, pageUrl(k, pages.get(k), urlOf.get(k))]));
  const skipped = new Set(keys.filter((k) => !urls.get(k)));
  if (skipped.size) console.warn(`report ${report.id}: no URL normalises to ${[...skipped].join(", ")}; not parsed`);
  const toParse = keys
    .filter((k) => !skipped.has(k) && (foreignUrl(pages.get(k)) || needsParse(pages.get(k), 7, now.getTime())))
    .slice(0, Math.max(0, budget));
  if (toParse.length && Date.now() < deadline) {
    const r = await ensurePages(toParse.map((k) => ({ url_key: k, url: urls.get(k)! })), 7, 4, deadline);
    summary.parsed += r.parsed.length;
    summary.parse_failed += r.failed.length;
    pages = await loadPages(keys);
  }

  // Google's passages located in each page.
  const passages = await windowPassages(report, keys);
  const details: PageDetail[] = keys.map((k, i) => {
    const page = pages.get(k);
    const markdown = page?.parse_status === "ok" && !foreignUrl(page) ? page.markdown : null;
    return { url_key: k, ref: `P${i + 1}`, share: shares.get(k) ?? 0, passages: locatePassages(markdown, passages.get(k) ?? [], k) };
  });

  // The escape covers slow tagging, not parse starvation: it needs every page to have been parsed
  // (or to have failed) at least once, and its clock starts at the latest parse attempt.
  const open = keys.filter((k) => !skipped.has(k) && !pageSettled(pages.get(k), now.getTime()));
  const settled = open.length === 0;
  const attempted = keys.every((k) => skipped.has(k) || pageAttempted(pages.get(k)));
  const lastAttempt = Math.max(
    Date.parse(report.created_at),
    ...keys.map((k) => pages.get(k)).map((p) => Date.parse(p?.parse_attempted_at ?? p?.parsed_at ?? "")).filter(Number.isFinite),
  );
  const forced = !settled && attempted && now.getTime() - lastAttempt > SETTLE_TIMEOUT_MS;
  if (forced) console.warn(`report ${report.id}: pages not settled after 6 hours (${open.join(", ")}); moving to the brief anyway`);
  const update: Record<string, unknown> = { page_urls: keys, page_details: details, updated_at: now.toISOString() };
  if (settled || forced) Object.assign(update, { stage: "brief", brief_submitted: false });
  must(await db.from("reports").update(update).eq("id", report.id).eq("stage", "pages"), "save report pages");
  if (settled) summary.advanced++;
  else if (forced) summary.forced++;
  else summary.waiting++;
  return toParse.length;
}

async function loadPages(keys: string[]): Promise<Map<string, PageRow>> {
  if (!keys.length) return new Map();
  const rows = must(
    await serviceClient().from("pages").select("url_key, url, parse_status, parsed_at, parse_attempted_at, tag_status, markdown").in("url_key", keys),
    "load pages",
  ) as PageRow[];
  return new Map(rows.map((r) => [r.url_key, r]));
}

async function windowPassages(report: ReportRow, keys: string[]): Promise<Map<string, string[]>> {
  if (!keys.length) return new Map();
  const rows = must(
    await serviceClient().rpc("window_passages", {
      p_series_id: report.series_id, p_from: report.window_start, p_to: report.window_end, p_url_keys: keys,
    }),
    "window_passages",
  ) as { url_key: string; passages: string[] }[];
  return new Map(rows.map((r) => [r.url_key, r.passages]));
}

export async function handle(req: Request): Promise<Response> {
  const denied = requireCron(req);
  if (denied) return denied;
  return json(await buildReports());
}
