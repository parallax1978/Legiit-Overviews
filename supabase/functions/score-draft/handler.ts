// score-draft (user): scores a pasted draft or a URL against the latest ready brief of a tracked
// query. Responds with the draft_scores id at once; measuring, Claude task E and scoring run as a
// background task that moves the row from 'running' to 'done' or 'failed'.
import { liveStructured } from "../_shared/claude.ts";
import { contentParsing } from "../_shared/dataforseo.ts";
import { must, serviceClient } from "../_shared/db.ts";
import { fail, json, requireUser } from "../_shared/http.ts";
import { mentionsBrand, normalizeUrl } from "../_shared/normalize.ts";
import { markdownFromPageContent, measurePage, plainText } from "../_shared/pages.ts";
import { wordsBefore } from "../_shared/passage.ts";
import { DRAFT_SCORE_SYSTEM, draftScoreUser } from "../_shared/prompts/draft-score.ts";
import { type BriefOutput, DraftScoreOutput } from "../_shared/schemas.ts";
import type { DraftScoreResult, PageMeasures } from "../_shared/types.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT = 200_000;
/** A query can have one draft being scored at a time; older running rows are treated as stuck. */
const RUNNING_WINDOW_MS = 10 * 60_000;
const DRAFT_SCORE_MAX_TOKENS = 8000;

export const WEIGHTS = { topic_coverage: 0.30, entity_coverage: 0.15, format_match: 0.15, answer_first: 0.15, evidence: 0.15, checklist: 0.10 };

type Brief = BriefOutput["brief"];
type CellState = "covered" | "partial" | "missing";

interface WinnerPage {
  url_key: string;
  measures: PageMeasures | null;
  tags: { evidence?: { kind: string }[] } | null;
}

export interface DraftJob {
  id: string;
  source: "url" | "text";
  input: string;
  keyword: string;
  language: string;
  brief: Brief;
  winners: WinnerPage[];
  /** Aliases of brief entities by entity id ("entity:<uuid>" refs resolved). */
  aliases: Map<string, string[]>;
}

// ------------------------------------------------------------------ request

export async function handle(req: Request): Promise<Response> {
  const auth = await requireUser(req);
  if ("response" in auth) return auth.response;
  if (req.method !== "POST") return fail("Use POST.", 405);

  let body: { tracked_query_id?: unknown; source?: unknown; input?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("Send a JSON body.");
  }
  const tqId = typeof body?.tracked_query_id === "string" ? body.tracked_query_id : "";
  const source = body?.source;
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (!UUID.test(tqId)) return fail("tracked_query_id is required.");
  if (source !== "url" && source !== "text") return fail('source must be "url" or "text".');
  if (!input) return fail(source === "url" ? "Enter the URL of your draft." : "Paste the text of your draft.");
  if (source === "text" && input.length > MAX_TEXT) return fail("The draft is too long; paste at most 200,000 characters.");
  if (source === "url" && !isHttpUrl(input)) return fail("Enter a full URL starting with http:// or https://.");

  const db = serviceClient();
  const tq = must(
    await db.from("tracked_queries")
      .select("id, user_id, display_keyword, own_url, own_url_key, series(keyword, language_code)")
      .eq("id", tqId).maybeSingle(),
    "load tracked query",
  ) as unknown as {
    id: string; user_id: string; display_keyword: string; own_url: string | null; own_url_key: string | null;
    series: { keyword: string; language_code: string } | null;
  } | null;
  if (!tq || tq.user_id !== auth.user.id) return fail("Query not found.", 404);

  const report = must(
    await db.from("reports").select("id, analysis, page_urls")
      .eq("tracked_query_id", tqId).eq("stage", "ready")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    "load report",
  ) as { id: string; analysis: BriefOutput | null; page_urls: string[] } | null;
  if (!report?.analysis?.brief) return fail("The brief isn't ready yet.", 409);

  const running = await db.from("draft_scores").select("id", { count: "exact", head: true })
    .eq("tracked_query_id", tqId).eq("status", "running")
    .gte("created_at", new Date(Date.now() - RUNNING_WINDOW_MS).toISOString());
  if (running.error) throw new Error(`check running scores: ${running.error.message}`);
  if ((running.count ?? 0) > 0) return fail("A draft for this query is already being scored. Try again in a minute.", 429);

  const row = must(
    await db.from("draft_scores").insert({ tracked_query_id: tqId, report_id: report.id, source, input, status: "running" })
      .select("id").single(),
    "create draft score",
  ) as { id: string };

  const ownKey = tq.own_url_key ?? (tq.own_url ? normalizeUrl(tq.own_url) : null);
  const work = loadJobContext(report, ownKey)
    .then((ctx) => runDraftScore({
      id: row.id,
      source,
      input,
      keyword: tq.display_keyword || tq.series?.keyword || "",
      language: tq.series?.language_code ?? "en",
      brief: report.analysis!.brief,
      ...ctx,
    }))
    .catch((e) => markFailed(row.id, e));
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) EdgeRuntime.waitUntil(work);
  else await work;

  return json({ draft_score_id: row.id });
}

function isHttpUrl(s: string): boolean {
  if (s.length > 2048) return false;
  try {
    const u = new URL(s);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.hostname;
  } catch {
    return false;
  }
}

async function loadJobContext(
  report: { analysis: BriefOutput | null; page_urls: string[] },
  ownKey: string | null,
): Promise<{ winners: WinnerPage[]; aliases: Map<string, string[]> }> {
  const db = serviceClient();
  const keys = (report.page_urls ?? []).filter((k) => k !== ownKey);
  const winners = keys.length
    ? must(
      await db.from("pages").select("url_key, measures, tags").in("url_key", keys).eq("parse_status", "ok"),
      "load cited pages",
    ) as WinnerPage[]
    : [];
  const ids = (report.analysis?.brief.entities ?? [])
    .map((e) => entityId(e.entity_ref))
    .filter((id): id is string => !!id);
  const aliases = new Map<string, string[]>();
  if (ids.length) {
    const rows = must(await db.from("entities").select("id, name, aliases").in("id", ids), "load entities") as
      { id: string; name: string; aliases: string[] }[];
    for (const r of rows) aliases.set(r.id, [r.name, ...(r.aliases ?? [])]);
  }
  return { winners, aliases };
}

function entityId(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const m = ref.match(/^entity:([0-9a-f-]{36})$/i);
  return m ? m[1] : null;
}

async function markFailed(id: string, e: unknown): Promise<void> {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`draft score ${id}: ${message}`);
  const { error } = await serviceClient().from("draft_scores").update({ status: "failed", error: message.slice(0, 1000) })
    .eq("id", id).eq("status", "running");
  if (error) console.error(`draft score ${id}: ${error.message}`);
}

/** Scores the draft and writes the result (or the failure) to its draft_scores row. */
export async function runDraftScore(job: DraftJob): Promise<void> {
  try {
    const result = await scoreDraft(job);
    must(
      await serviceClient().from("draft_scores").update({ status: "done", result, error: null }).eq("id", job.id),
      "save draft score",
    );
  } catch (e) {
    await markFailed(job.id, e);
  }
}

// ------------------------------------------------------------------ scoring

async function draftContent(job: DraftJob): Promise<{ markdown: string; pageContent: any | null; url: string }> {
  if (job.source === "text") return { markdown: job.input, pageContent: null, url: "" };
  let page;
  try {
    page = await contentParsing(job.input);
  } catch (e) {
    throw new Error(`Could not read the page: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (page.status_code !== null && page.status_code >= 400) throw new Error(`The page returned HTTP ${page.status_code}.`);
  const markdown = page.markdown && page.markdown.trim() ? page.markdown : markdownFromPageContent(page.page_content);
  if (!markdown.trim()) throw new Error("The page has no readable text.");
  return { markdown, pageContent: page.page_content, url: job.input };
}

/** Measures the draft, asks Claude for the judgement calls and combines both into a DraftScoreResult. */
export async function scoreDraft(job: DraftJob): Promise<DraftScoreResult> {
  const { markdown, pageContent, url } = await draftContent(job);
  const measures = measurePage(markdown, pageContent, url || "https://draft.invalid/");
  const winnersMedian = medianMeasures(job.winners.map((w) => w.measures).filter((m): m is PageMeasures => !!m));
  const brief = job.brief;

  const { output } = await liveStructured({
    task: "draftScore",
    system: DRAFT_SCORE_SYSTEM,
    user: draftScoreUser({ keyword: job.keyword, language: job.language, brief, draft_markdown: markdown }),
    schema: DraftScoreOutput,
    maxTokens: DRAFT_SCORE_MAX_TOKENS,
    fallback: true,
  });

  const text = plainText(markdown);
  const fixes: { priority: number; fix: string }[] = [];

  // Entities: whole-word mentions of the name or any alias.
  const entities = brief.entities.map((e) => {
    const id = entityId(e.entity_ref);
    const names = [e.name, ...((id && job.aliases.get(id)) || [])];
    return { name: e.name, present: mentionsBrand(text, names) };
  });
  const entityCoverage = entities.length ? entities.filter((e) => e.present).length / entities.length : 1;
  const missingEntities = entities.filter((e) => !e.present).map((e) => e.name);
  if (missingEntities.length) fixes.push({ priority: 2, fix: `Name the entities the overview keeps citing: ${missingEntities.join(", ")}.` });

  // Format.
  const format = formatMatch(measures, brief, winnersMedian, fixes);

  // Answer first: Claude's judgement combined with how many words come before the answer.
  measures.words_before_answer = wordsBeforeAnswer(markdown, brief.answer_first.text);
  const budget = brief.answer_first.max_words > 0 ? brief.answer_first.max_words : (winnersMedian.words_before_answer ?? 60);
  const claudeAnswer = stateScore(output.answer_first.status);
  const wba = measures.words_before_answer;
  const position = wba === null ? null : wba <= budget ? 1 : Math.max(0, budget / wba);
  const answerFirst = position === null ? claudeAnswer : 0.5 * claudeAnswer + 0.5 * position;
  if (wba !== null && wba > budget) {
    fixes.push({ priority: 2, fix: `Move the direct answer up: ${wba} words come before it; the cited pages answer within ${budget}.` });
  }

  // Evidence: number density against the winners and the kinds of evidence they use.
  const evidence = evidenceScore(markdown, measures, winnersMedian, job.winners, fixes);

  // Technical checklist.
  const checklist = checklistScore(measures, pageContent, job.source, fixes);

  // Topics and new-to-cite ideas from Claude.
  const topicScores = output.topics.map((t) => stateScore(t.status));
  const topicCoverage = topicScores.length ? mean(topicScores) : (brief.must_cover.length ? 0 : 1);

  const subscores = {
    topic_coverage: round3(topicCoverage),
    entity_coverage: round3(entityCoverage),
    format_match: round3(format),
    answer_first: round3(answerFirst),
    evidence: round3(evidence),
    checklist: round3(checklist),
  };
  const score = Math.round(100 * (
    WEIGHTS.topic_coverage * topicCoverage + WEIGHTS.entity_coverage * entityCoverage + WEIGHTS.format_match * format +
    WEIGHTS.answer_first * answerFirst + WEIGHTS.evidence * evidence + WEIGHTS.checklist * checklist
  ));

  const allFixes = [...output.fixes.map((f) => ({ priority: Math.max(1, f.priority), fix: f.fix })), ...fixes]
    .map((f, i) => ({ ...f, i }))
    .sort((a, b) => a.priority - b.priority || a.i - b.i)
    .slice(0, 15)
    .map(({ priority, fix }) => ({ priority, fix }));

  return {
    score: Math.max(0, Math.min(100, score)),
    subscores,
    measures,
    winners_median: winnersMedian,
    topics: output.topics,
    entities,
    new_to_cite: output.new_to_cite,
    fixes: allFixes,
  };
}

function stateScore(s: CellState): number {
  return s === "covered" ? 1 : s === "partial" ? 0.5 : 0;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const NUMERIC_MEASURES = [
  "word_count", "headings", "outline_depth", "tables", "table_rows", "max_table_columns", "lists", "list_items",
  "comparison_blocks", "numbers_per_100_words", "internal_links", "external_links", "words_before_answer",
] as const;

/** Median of each numeric measure over the cited pages (nulls ignored). */
export function medianMeasures(pages: PageMeasures[]): Partial<PageMeasures> {
  const out: Partial<Record<(typeof NUMERIC_MEASURES)[number], number>> = {};
  for (const key of NUMERIC_MEASURES) {
    const values = pages.map((p) => p[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const m = median(values);
    if (m !== null) out[key] = m;
  }
  return out as Partial<PageMeasures>;
}

/** Table when the brief asks for one, list length, section count and word count against the winners. */
function formatMatch(m: PageMeasures, brief: Brief, w: Partial<PageMeasures>, fixes: { priority: number; fix: string }[]): number {
  const parts: number[] = [];
  if (brief.format.table_columns.length) {
    parts.push(m.tables > 0 ? 1 : 0);
    if (!m.tables) fixes.push({ priority: 2, fix: `Add a comparison table with the columns ${brief.format.table_columns.join(", ")}.` });
  }
  if (brief.format.list_items && brief.format.list_items > 0) {
    parts.push(Math.min(1, m.list_items / brief.format.list_items));
    if (m.list_items < brief.format.list_items) {
      fixes.push({ priority: 3, fix: `Make the main list about ${brief.format.list_items} items long (the draft has ${m.list_items} list items).` });
    }
  }
  if (w.headings && w.headings > 0) {
    parts.push(Math.min(1, m.headings / w.headings));
    if (m.headings < w.headings / 2) {
      fixes.push({ priority: 4, fix: `Break the page into more sections: the cited pages use about ${Math.round(w.headings)} headings, the draft ${m.headings}.` });
    }
  }
  if (w.word_count && w.word_count > 0) {
    const lo = 0.6 * w.word_count;
    const hi = 1.6 * w.word_count;
    const wc = m.word_count;
    parts.push(wc >= lo && wc <= hi ? 1 : wc < lo ? wc / lo : hi / wc);
    if (wc < lo) fixes.push({ priority: 3, fix: `Expand the page toward ${Math.round(w.word_count)} words, the cited pages' median (the draft has ${wc}).` });
    if (wc > hi) fixes.push({ priority: 4, fix: `Tighten the page toward ${Math.round(w.word_count)} words, the cited pages' median (the draft has ${wc}).` });
  }
  return parts.length ? mean(parts) : 1;
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "are", "you", "your", "from", "its", "has", "have", "was", "but", "not",
  "can", "will", "all", "any", "most", "more", "into", "than", "they", "their", "which", "what", "when", "how", "who",
]);

function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Body words before the draft's answer: the brief's opening located in the draft, or else the first
 * sentence sharing at least half of the opening's content words. Null when no sentence qualifies.
 */
export function wordsBeforeAnswer(markdown: string, answer: string): number | null {
  if (!answer?.trim() || !markdown.trim()) return null;
  const exact = wordsBefore(markdown, answer);
  if (exact !== null) return exact;
  const target = new Set(contentWords(answer));
  if (!target.size) return null;
  let before = 0;
  let inFence = false;
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || /^\s{0,3}#{1,6}\s/.test(line) || !line.trim()) continue;
    for (const sentence of plainText(line).split(/(?<=[.!?])\s+/)) {
      const words = sentence.match(/[\p{L}\p{N}]+(?:['’.,][\p{L}\p{N}]+)*/gu) ?? [];
      if (!words.length) continue;
      const have = new Set(contentWords(sentence));
      let shared = 0;
      for (const w of target) if (have.has(w)) shared++;
      if (shared / target.size >= 0.5) return before;
      before += words.length;
    }
  }
  return null;
}

const EVIDENCE_PATTERNS: Record<string, RegExp> = {
  pricing: /[$€£]\s?\d|\b\d+(?:[.,]\d+)?\s?(?:usd|eur|gbp)\b|\bper (?:month|year|user|seat)\b|\/(?:mo|month|yr|year)\b|\bpricing\b/i,
  spec: /\b\d+(?:[.,]\d+)?\s?(?:gb|mb|tb|kb|ms|hz|ghz|mhz|px|mp|mm|cm|kg|lbs?|inch(?:es)?|fps|mah|%)(?![\p{L}])/iu,
  quote: /^\s*>\s*\S|[“"][^”"\n]{25,}[”"]/m,
  screenshot: /!\[[^\]]*\]\([^)]+\)/,
  test_result: /\b(?:we|i) (?:tested|benchmarked|measured|tried|timed|ran)\b|\bour (?:tests?|testing|benchmarks?)\b|\bin (?:our|my) tests?\b/i,
  original_data: /\b(?:we|i) (?:surveyed|analy[sz]ed|collected|studied|tracked)\b|\bour (?:survey|data|study|research|analysis)\b/i,
  review: /\b\d(?:\.\d)?\s?(?:\/|out of)\s?(?:5|10)\b|★|\bratings?\b|\breviews?\b/i,
  example: /\bfor (?:example|instance)\b|\be\.g\.|\bexample:/i,
};

/** Evidence kinds the draft shows, detected in code. */
export function evidenceKinds(markdown: string): Set<string> {
  const found = new Set<string>();
  for (const [kind, re] of Object.entries(EVIDENCE_PATTERNS)) if (re.test(markdown)) found.add(kind);
  return found;
}

function evidenceScore(
  markdown: string, m: PageMeasures, w: Partial<PageMeasures>, winners: WinnerPage[], fixes: { priority: number; fix: string }[],
): number {
  const target = w.numbers_per_100_words;
  const density = target && target > 0 ? Math.min(1, m.numbers_per_100_words / target) : 1;
  if (target && m.numbers_per_100_words < target / 2) {
    fixes.push({ priority: 3, fix: `Back claims with specific numbers: the cited pages use about ${target} numbers per 100 words, the draft ${m.numbers_per_100_words}.` });
  }
  // Kinds used by at least two cited pages (or by the only one).
  const counts = new Map<string, number>();
  for (const page of winners) {
    const kinds = new Set((page.tags?.evidence ?? []).map((e) => e.kind));
    for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const needed = [...counts].filter(([, n]) => n >= Math.min(2, winners.length)).map(([k]) => k).sort();
  if (!needed.length) return density;
  const have = evidenceKinds(markdown);
  const missing = needed.filter((k) => !have.has(k));
  if (missing.length) {
    fixes.push({ priority: 3, fix: `Add the kinds of evidence the cited pages use: ${missing.map((k) => k.replace(/_/g, " ")).join(", ")}.` });
  }
  return 0.5 * density + 0.5 * ((needed.length - missing.length) / needed.length);
}

function robotsDirectives(pageContent: any): string | null {
  const candidates = [pageContent?.meta?.robots, pageContent?.robots, pageContent?.meta_robots];
  const found = candidates.find((v) => typeof v === "string");
  return found ? String(found).toLowerCase() : null;
}

function checklistScore(m: PageMeasures, pageContent: any | null, source: "url" | "text", fixes: { priority: number; fix: string }[]): number {
  const checks: boolean[] = [];
  const author = !!m.author;
  checks.push(author);
  if (!author) fixes.push({ priority: 4, fix: "Show the author's name on the page (a byline with a short bio)." });
  const dated = !!(m.published || m.updated);
  checks.push(dated);
  if (!dated) fixes.push({ priority: 4, fix: "Show a visible published or last-updated date." });
  const text = m.word_count >= 150;
  checks.push(text);
  if (!text) fixes.push({ priority: 2, fix: "Put the main content in the page's text; very little readable text was found." });
  if (source === "url") {
    const robots = robotsDirectives(pageContent);
    if (robots !== null) {
      const blocked = /noindex|nosnippet/.test(robots);
      checks.push(!blocked);
      if (blocked) fixes.push({ priority: 1, fix: `Remove "${robots}" from the robots meta tag; it keeps the page out of AI Overviews.` });
    }
  }
  return checks.filter(Boolean).length / checks.length;
}
