// Own-page tracking: match levels and the quoted heading per snapshot, first_seen / regained /
// brand_mention events with their notifications, own page parsing, and re-matching history.
import { contentParsing } from "./dataforseo.ts";
import { must, serviceClient } from "./db.ts";
import { matchLevel, normalizeUrl, regDomain } from "./normalize.ts";
import { locatePassage, outlineFromMarkdown } from "./passage.ts";
import type { MatchLevel, ParsedSentence } from "./types.ts";

const RANK: Record<MatchLevel, number> = { exact_url: 4, path_prefix: 3, same_host: 2, same_domain: 1 };
const DAY_MS = 86_400_000;
/** Brand names matched per query; the database constraint tracked_queries_brand_names_check keeps the same cap. */
export const MAX_BRANDS = 10;

export interface TrackedForMatch {
  id: string;
  own_url_key: string | null;
  brand_names: string[];
}

export interface OwnPageForMatch {
  markdown: string | null;
  resolved_url: string | null;
}

export interface CitationForMatch {
  idx: number;
  url_key: string;
  passage: string | null;
  /** Every distinct passage Google quoted from the page in that capture; `passage` is the first. */
  passages?: string[];
}

export interface SnapshotMatch {
  level: MatchLevel | null;
  citation_idx: number | null;
  brand_mentioned: boolean;
  brand_name: string | null; // the first brand found in the overview
  quoted_heading: string | null; // heading of the own page under which Google's passage sits
}

/**
 * Best match of one snapshot against a tracked query: the highest matchLevel over its citations
 * (against the own URL and, when known, the URL it resolves to), whether a brand is named in the
 * overview text, and, for an exact-URL citation, the own-page heading Google quoted from.
 */
export function matchSnapshot(
  tq: TrackedForMatch,
  ownPage: OwnPageForMatch | null,
  citations: CitationForMatch[],
  overviewText: string,
): SnapshotMatch {
  const keys = ownKeys(tq, ownPage);
  let best: { level: MatchLevel; c: CitationForMatch } | null = null;
  for (const c of citations) {
    for (const k of keys) {
      const level = matchLevel(c.url_key, k);
      if (!level) continue;
      if (!best || RANK[level] > RANK[best.level] || (RANK[level] === RANK[best.level] && c.idx < best.c.idx)) {
        best = { level, c };
      }
    }
  }
  const brand = findBrand(overviewText, tq.brand_names ?? []);
  let quoted: string | null = null;
  if (best?.level === "exact_url" && ownPage?.markdown) {
    // Google may quote several passages of the page in one capture: the first one under a heading wins.
    for (const passage of new Set([...(best.c.passages ?? []), best.c.passage])) {
      if (!passage) continue;
      const loc = locatePassage(ownPage.markdown, passage);
      if (loc.found && loc.heading) {
        quoted = loc.heading;
        break;
      }
    }
  }
  return {
    level: best?.level ?? null,
    citation_idx: best?.c.idx ?? null,
    brand_mentioned: brand !== null,
    brand_name: brand,
    quoted_heading: quoted,
  };
}

/**
 * Matches a newly ingested snapshot for every tracked query of its series that has an own URL or
 * brand names, paused ones included (their matches are recorded without events or notifications, so
 * the history is complete when tracking resumes). Events and notifications are created only when the
 * own_matches row is new, so running this again for the same snapshot creates nothing. Returns the
 * events created.
 */
export async function applyMatches(snapshotId: string): Promise<string[]> {
  const db = serviceClient();
  const snap = must(
    await db.from("snapshots").select("id, series_id, status, sentences, overview_markdown").eq("id", snapshotId).maybeSingle(),
    "load snapshot",
  ) as SnapshotRow | null;
  if (!snap || snap.status === "error") return [];
  const tqs = (await selectAll<TrackedForMatch>((from, to) =>
    db.from("tracked_queries").select("id, own_url_key, brand_names").eq("series_id", snap.series_id).order("id").range(from, to)
  )).filter(isConfigured);
  if (!tqs.length) return [];

  const citations = snap.status === "present"
    ? must(await db.from("citations").select("idx, url_key, passage, passages").eq("snapshot_id", snapshotId), "load citations") as CitationForMatch[]
    : [];
  const pages = await ownPages(tqs.map((t) => t.id));
  const text = overviewText(snap);
  const events: string[] = [];
  for (const tq of tqs) {
    const m = matchSnapshot(tq, pages.get(tq.id) ?? null, citations, text);
    const created = must(
      await db.rpc("record_own_match", {
        p_tracked_query_id: tq.id,
        p_snapshot_id: snapshotId,
        p_level: m.level,
        p_brand_mentioned: m.brand_mentioned,
        p_citation_idx: m.citation_idx,
        p_quoted_heading: m.quoted_heading,
        p_brand_name: m.brand_name,
      }),
      "record own match",
    ) as string[] | null;
    events.push(...(created ?? []));
  }
  return events;
}

/**
 * Parses the tracked query's own URL with DataForSEO and stores it in own_pages. Clears the row when
 * the URL is unset. Throws when the page can't be parsed; a row for a different URL is then reset so
 * an old page's headings are never reported for the new one.
 */
export async function parseOwnPage(trackedQueryId: string): Promise<{ url: string; parsed_at: string } | null> {
  const db = serviceClient();
  const tq = must(
    await db.from("tracked_queries").select("id, own_url").eq("id", trackedQueryId).maybeSingle(),
    "load tracked query",
  ) as { id: string; own_url: string | null } | null;
  if (!tq) throw new Error(`tracked query ${trackedQueryId} not found`);
  if (!tq.own_url) {
    must(await db.from("own_pages").delete().eq("tracked_query_id", trackedQueryId), "clear own page");
    return null;
  }

  let markdown: string | null;
  try {
    const page = await contentParsing(tq.own_url);
    if (page.status_code !== null && page.status_code >= 400) throw new Error(`${tq.own_url} returned HTTP ${page.status_code}`);
    markdown = page.markdown ?? markdownFromContent(page.page_content);
    if (!markdown?.trim()) throw new Error(`${tq.own_url} has no readable content`);
  } catch (e) {
    const current = must(
      await db.from("own_pages").select("url").eq("tracked_query_id", trackedQueryId).maybeSingle(),
      "load own page",
    ) as { url: string } | null;
    if (current?.url !== tq.own_url) {
      must(
        await db.from("own_pages").upsert(
          { tracked_query_id: trackedQueryId, url: tq.own_url, resolved_url: null, parsed_at: null, markdown: null, outline: null },
          { onConflict: "tracked_query_id" },
        ),
        "reset own page",
      );
    }
    throw e;
  }

  const parsedAt = new Date().toISOString();
  must(
    await db.from("own_pages").upsert(
      {
        tracked_query_id: trackedQueryId,
        url: tq.own_url,
        resolved_url: null, // content_parsing does not report redirects
        parsed_at: parsedAt,
        markdown,
        outline: outlineFromMarkdown(markdown),
      },
      { onConflict: "tracked_query_id" },
    ),
    "save own page",
  );
  return { url: tq.own_url, parsed_at: parsedAt };
}

/**
 * Recomputes own_matches for the series' snapshots of the last `days` days (after the own URL or
 * brands changed). History creates at most one first_seen and one brand_mention event, at the earliest
 * matching snapshot, each with one notification dated at that render; when the page has dropped out
 * since, own_match_events records the loss at once and says so in the same notification. Returns how
 * many snapshots cite the page or name a brand.
 */
export async function rematch(trackedQueryId: string, days = 28): Promise<number> {
  const db = serviceClient();
  const tq = must(
    await db.from("tracked_queries").select("id, series_id, own_url_key, brand_names").eq("id", trackedQueryId).maybeSingle(),
    "load tracked query",
  ) as (TrackedForMatch & { series_id: string }) | null;
  if (!tq) throw new Error(`tracked query ${trackedQueryId} not found`);

  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const snaps = await selectAll<SnapshotRow & { captured_at: string }>((from, to) =>
    db.from("snapshots")
      .select("id, series_id, status, captured_at, sentences, overview_markdown")
      .eq("series_id", tq.series_id)
      .gte("captured_at", since)
      .in("status", ["present", "absent"])
      .order("captured_at")
      .order("id")
      .range(from, to)
  );
  const ids = snaps.map((s) => s.id);
  if (!isConfigured(tq)) {
    must(await db.rpc("replace_own_matches", { p_tracked_query_id: tq.id, p_snapshot_ids: ids, p_rows: [] }), "clear own matches");
    return 0;
  }

  const page = (await ownPages([tq.id])).get(tq.id) ?? null;
  const domains = [...new Set(ownKeys(tq, page).map((k) => regDomain(k.split(/[/?]/)[0].split(":")[0])))];
  const bySnapshot = new Map<string, CitationForMatch[]>();
  if (domains.length) {
    const present = snaps.filter((s) => s.status === "present").map((s) => s.id);
    for (let i = 0; i < present.length; i += 100) {
      const rows = await selectAll<CitationForMatch & { snapshot_id: string }>((from, to) =>
        db.from("citations")
          .select("snapshot_id, idx, url_key, passage, passages")
          .in("snapshot_id", present.slice(i, i + 100))
          .in("reg_domain", domains)
          .order("snapshot_id")
          .order("idx")
          .range(from, to)
      );
      for (const r of rows) {
        const list = bySnapshot.get(r.snapshot_id) ?? [];
        list.push(r);
        bySnapshot.set(r.snapshot_id, list);
      }
    }
  }

  const matches = snaps.map((s) => ({ snap: s, m: matchSnapshot(tq, page, bySnapshot.get(s.id) ?? [], overviewText(s)) }));
  must(
    await db.rpc("replace_own_matches", {
      p_tracked_query_id: tq.id,
      p_snapshot_ids: ids,
      p_rows: matches.map(({ snap, m }) => ({
        snapshot_id: snap.id,
        level: m.level,
        brand_mentioned: m.brand_mentioned,
        citation_idx: m.citation_idx,
        quoted_heading: m.quoted_heading,
      })),
    }),
    "replace own matches",
  );

  const firstCited = matches.find(({ m }) => m.level);
  if (firstCited) {
    must(
      await db.rpc("own_match_events", {
        p_tracked_query_id: tq.id,
        p_snapshot_id: firstCited.snap.id,
        p_level: firstCited.m.level,
        p_quoted_heading: firstCited.m.quoted_heading,
        p_brand_name: null,
        p_allow_regained: false,
        p_at: firstCited.snap.captured_at,
      }),
      "history citation event",
    );
  }
  const firstBrand = matches.find(({ m }) => m.brand_mentioned);
  if (firstBrand) {
    must(
      await db.rpc("own_match_events", {
        p_tracked_query_id: tq.id,
        p_snapshot_id: firstBrand.snap.id,
        p_level: null,
        p_quoted_heading: null,
        p_brand_name: firstBrand.m.brand_name,
        p_allow_regained: false,
        p_at: firstBrand.snap.captured_at,
      }),
      "history brand event",
    );
  }
  return matches.filter(({ m }) => m.level || m.brand_mentioned).length;
}

/**
 * Re-parses up to `limit` own pages last parsed more than 7 days ago. A failed re-parse keeps the old
 * content and moves parsed_at forward, so one broken page can't hold up the others.
 */
export async function refreshOwnPages(limit = 5, seriesIds?: string[]): Promise<{ parsed: number; failed: number }> {
  const db = serviceClient();
  let q = db.from("own_pages")
    .select("tracked_query_id, tracked_queries!inner(series_id)")
    .lt("parsed_at", new Date(Date.now() - 7 * DAY_MS).toISOString())
    .order("parsed_at")
    .limit(limit);
  if (seriesIds) q = q.in("tracked_queries.series_id", seriesIds);
  const due = must(await q, "load stale own pages") as { tracked_query_id: string }[];
  let parsed = 0;
  let failed = 0;
  for (const row of due) {
    try {
      await parseOwnPage(row.tracked_query_id);
      parsed++;
    } catch (e) {
      failed++;
      console.error(`re-parse own page ${row.tracked_query_id}:`, e instanceof Error ? e.message : e);
      must(
        await db.from("own_pages").update({ parsed_at: new Date().toISOString() }).eq("tracked_query_id", row.tracked_query_id),
        "defer own page",
      );
    }
  }
  return { parsed, failed };
}

// ------------------------------------------------------------------ helpers

interface SnapshotRow {
  id: string;
  series_id: string;
  status: string;
  sentences: ParsedSentence[] | null;
  overview_markdown: string | null;
}

function isConfigured(tq: TrackedForMatch): boolean {
  return Boolean(tq.own_url_key) || (tq.brand_names ?? []).some((b) => b.trim());
}

/**
 * The first brand named in the text (whole words, case-insensitive), or null. One pass with one
 * regular expression over the first MAX_BRANDS names, longest first so an overlapping shorter name
 * never hides a longer one; the ingestion path runs this for every tracked query of a series.
 */
export function findBrand(text: string, brands: string[]): string | null {
  const names = [...new Set((brands ?? []).map((b) => b.trim()).filter(Boolean))].slice(0, MAX_BRANDS)
    .sort((a, b) => b.length - a.length);
  if (!names.length) return null;
  const alternatives = names.map((n) => n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const m = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${alternatives})(?=$|[^\\p{L}\\p{N}])`, "u").exec(text.toLowerCase());
  if (!m) return null;
  return names.find((n) => n.toLowerCase() === m[1]) ?? m[1];
}

function ownKeys(tq: TrackedForMatch, page: OwnPageForMatch | null): string[] {
  const keys = [tq.own_url_key, page?.resolved_url ? normalizeUrl(page.resolved_url) : null].filter((k): k is string => Boolean(k));
  return [...new Set(keys)];
}

function overviewText(s: SnapshotRow): string {
  const sentences = Array.isArray(s.sentences) ? s.sentences : [];
  return sentences.length ? sentences.map((x) => x.text).join("\n") : s.overview_markdown ?? "";
}

async function ownPages(ids: string[]): Promise<Map<string, OwnPageForMatch>> {
  const out = new Map<string, OwnPageForMatch>();
  for (let i = 0; i < ids.length; i += 100) {
    const rows = must(
      await serviceClient().from("own_pages").select("tracked_query_id, markdown, resolved_url").in("tracked_query_id", ids.slice(i, i + 100)),
      "load own pages",
    ) as (OwnPageForMatch & { tracked_query_id: string })[];
    for (const r of rows) out.set(r.tracked_query_id, r);
  }
  return out;
}

/**
 * Reads every page of a ranged query (PostgREST caps each response at max_rows, 1000 here). The query
 * needs a stable order; `page` adds `.range(from, to)` to it.
 */
export async function selectAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const size = 500;
  const out: T[] = [];
  for (let from = 0;; from += size) {
    const rows = must(await page(from, from + size - 1), "paged select") as T[];
    out.push(...rows);
    if (rows.length < size) return out;
  }
}

/** Markdown from DataForSEO's structured page content, for pages parsed without page_as_markdown. */
function markdownFromContent(pc: any): string | null {
  const lines: string[] = [];
  for (const topic of [...(pc?.main_topic ?? []), ...(pc?.secondary_topic ?? [])]) {
    if (topic?.h_title) lines.push(`${"#".repeat(Math.min(6, Math.max(1, Number(topic.level) || 2)))} ${topic.h_title}`);
    for (const c of topic?.primary_content ?? []) if (c?.text) lines.push(String(c.text));
  }
  return lines.length ? lines.join("\n\n") : null;
}
