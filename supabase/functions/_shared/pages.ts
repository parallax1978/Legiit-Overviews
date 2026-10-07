// Cited and own pages: parse with DataForSEO On-Page into the shared `pages` cache, measure their
// structure in code (PageMeasures), and locate the passages Google quoted from them.
import { contentParsing } from "./dataforseo.ts";
import { serviceClient } from "./db.ts";
import { hostOfUrl, normalizeUrl, regDomain, stripTextFragment } from "./normalize.ts";
import { cleanInline, locatePassage, outlineFromMarkdown } from "./passage.ts";
import type { OutlineItem, PageMeasures, PassageLocation } from "./types.ts";

const DAY_MS = 86_400_000;
/** Failed parses (and failed re-parses) are retried after this long (or maxAgeDays, if shorter). */
const FAILED_RETRY_MS = DAY_MS;
/** Stored markdown is capped so one pathological page cannot bloat the cache. */
const MAX_MARKDOWN = 500_000;

// ------------------------------------------------------------------ text helpers

const WORD = /[\p{L}\p{N}]+(?:['’.,][\p{L}\p{N}]+)*/gu;
const FENCE = /^\s*(```|~~~)/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const LIST_ITEM = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*\S)\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const HEADING = /^\s{0,3}#{1,6}\s/;
/** A proper name: one to five capitalised words (joiners allowed), as a product or brand is written. */
const NAME = "\\p{Lu}[\\p{L}\\p{N}.&'’+]*(?:\\s+(?:[\\p{Lu}\\p{N}][\\p{L}\\p{N}.&'’+]*|of|and|for|by|&)){0,4}";
const NAMED_ITEM = new RegExp(`^${NAME}\\s*(?:[:–—]|\\s-)\\s*\\S`, "u");
const NAME_CELL = new RegExp(`^${NAME}$`, "u");

/** Visible text of a markdown page: link text kept, link targets, images, tags and markup removed. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<https?:\/\/[^>]+>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s*```.*$/gm, " ")
    .replace(/^\s*\d{1,3}[.)]\s+/gm, " ")
    .replace(/[|*_`~#>]+/g, " ");
}

function wordsOf(text: string): string[] {
  return text.match(WORD) ?? [];
}

interface Line {
  text: string;
  fenced: boolean;
}

function linesOf(markdown: string): Line[] {
  let inFence = false;
  return markdown.replace(/\r\n?/g, "\n").split("\n").map((text) => {
    if (FENCE.test(text)) {
      inFence = !inFence;
      return { text, fenced: true };
    }
    return { text, fenced: inFence };
  });
}

function round(x: number, places = 2): number {
  const f = 10 ** places;
  return Math.round(x * f) / f;
}

// ------------------------------------------------------------------ tables

interface TableStats {
  tables: number;
  rows: number;
  maxColumns: number;
  comparisonTables: number; // 2+ columns and 2+ rows that each start with a distinct name
}

function cellsOf(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
}

/** A table compares entities when at least two of its rows lead with distinct proper names. */
function comparesEntities(columns: number, firstCells: string[]): boolean {
  if (columns < 2) return false;
  const names = new Set(firstCells.map((c) => cleanInline(c).trim()).filter((c) => NAME_CELL.test(c)).map((c) => c.toLowerCase()));
  return names.size >= 2;
}

/** Pipe tables: runs of lines starting with "|", or GFM tables found by their separator line. */
function markdownTables(lines: Line[]): { stats: TableStats; tableLines: Set<number> } {
  const stats: TableStats = { tables: 0, rows: 0, maxColumns: 0, comparisonTables: 0 };
  const tableLines = new Set<number>();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const startsPipe = !line.fenced && /^\s*\|/.test(line.text);
    const gfmStart = !line.fenced && line.text.includes("|") && i + 1 < lines.length &&
      !lines[i + 1].fenced && TABLE_SEPARATOR.test(lines[i + 1].text) && lines[i + 1].text.includes("-");
    if (!startsPipe && !gfmStart) {
      i++;
      continue;
    }
    const block: string[] = [];
    let j = i;
    while (j < lines.length && !lines[j].fenced && lines[j].text.includes("|") && lines[j].text.trim() !== "") {
      if (startsPipe && !/^\s*\|/.test(lines[j].text)) break;
      block.push(lines[j].text);
      tableLines.add(j);
      j++;
    }
    if (block.length >= 2 || gfmStart) {
      const hasHeader = block.length > 1 && TABLE_SEPARATOR.test(block[1]);
      const rows = block.filter((r) => !TABLE_SEPARATOR.test(r));
      const dataRows = hasHeader ? rows.slice(1) : rows;
      const columns = Math.max(0, ...rows.map((r) => cellsOf(r).length));
      stats.tables++;
      stats.rows += dataRows.length;
      stats.maxColumns = Math.max(stats.maxColumns, columns);
      if (comparesEntities(columns, dataRows.map((r) => cellsOf(r)[0] ?? ""))) stats.comparisonTables++;
    } else {
      for (let k = i; k < j; k++) tableLines.delete(k);
    }
    i = Math.max(j, i + 1);
  }
  return { stats, tableLines };
}

function topics(pageContent: any): any[] {
  return Array.isArray(pageContent?.main_topic) ? pageContent.main_topic : [];
}

/** Tables in DataForSEO page_content (main_topic[].table_content[]). */
function contentTables(pageContent: any): TableStats {
  const stats: TableStats = { tables: 0, rows: 0, maxColumns: 0, comparisonTables: 0 };
  for (const topic of topics(pageContent)) {
    for (const table of Array.isArray(topic?.table_content) ? topic.table_content : []) {
      const header = Array.isArray(table?.header) ? table.header : [];
      const body = Array.isArray(table?.body) ? table.body : [];
      const widths = [...header, ...body].map((r: any) => (Array.isArray(r?.row_cells) ? r.row_cells.length : 0));
      const columns = Math.max(0, ...widths);
      stats.tables++;
      stats.rows += body.length;
      stats.maxColumns = Math.max(stats.maxColumns, columns);
      if (comparesEntities(columns, body.map((r: any) => String(r?.row_cells?.[0]?.text ?? "")))) stats.comparisonTables++;
    }
  }
  return stats;
}

// ------------------------------------------------------------------ lists

interface ListStats {
  lists: number;
  items: number;
  namedLists: number; // lists with 2+ top-level items that start with a capitalised name and a dash or colon
}

function markdownLists(lines: Line[], skip: Set<number>): ListStats {
  const stats: ListStats = { lists: 0, items: 0, namedLists: 0 };
  let inList = false;
  let ordered = false;
  let blanks = 0;
  let named = 0;
  const close = () => {
    if (inList && named >= 2) stats.namedLists++;
    inList = false;
    named = 0;
  };
  lines.forEach((line, i) => {
    if (line.fenced || skip.has(i)) {
      close();
      return;
    }
    const text = line.text;
    if (text.trim() === "") {
      blanks++;
      if (blanks > 1) close();
      return;
    }
    const m = RULE.test(text) || HEADING.test(text) ? null : text.match(LIST_ITEM);
    if (m) {
      const topLevel = m[1].length < 2;
      const isOrdered = /\d/.test(m[2]);
      // A top-level item of the other kind (bullets vs numbers) starts a new list.
      if (inList && topLevel && isOrdered !== ordered) close();
      if (!inList) {
        stats.lists++;
        inList = true;
        ordered = isOrdered;
      }
      stats.items++;
      if (topLevel && NAMED_ITEM.test(cleanInline(m[3]))) named++;
      blanks = 0;
      return;
    }
    // Indented lines continue the current item; anything else ends the list.
    if (!(inList && /^\s{2,}\S/.test(text) && blanks === 0)) close();
    blanks = 0;
  });
  close();
  return stats;
}

// ------------------------------------------------------------------ author and dates

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DATE_SOURCES = [
  `(\\d{4})-(\\d{2})-(\\d{2})`,
  `${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`,
  `(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\.?,?\\s+(\\d{4})`,
];
const DATE_ANY = new RegExp(`(?:${DATE_SOURCES.join("|")})`, "i");
const UPDATED_LABEL = new RegExp(
  `\\b(?:last\\s+updated|updated|last\\s+modified|modified|last\\s+reviewed|reviewed|refreshed)(?:\\s+on)?\\s*:?\\s*(?:${DATE_SOURCES.join("|")})`,
  "i",
);
const PUBLISHED_LABEL = new RegExp(
  `\\b(?:published|posted|written|created|first\\s+published)(?:\\s+on)?\\s*:?\\s*(?:${DATE_SOURCES.join("|")})`,
  "i",
);
const AUTHOR_LINE = /^(?:[Ww]ritten\s+[Bb]y|[Pp]osted\s+[Bb]y|[Rr]eviewed\s+[Bb]y|[Aa]uthor:?|[Bb]y|BY)\s+(\p{Lu}[\p{L}'’.-]*(?:\s+\p{Lu}[\p{L}'’.-]*){0,3})/u;
const NOT_NAMES = new Set(["The", "This", "Using", "Clicking", "Default", "Continuing", "Signing", "Submitting", "Subscribing"]);

function isoDate(y: number, m: number, d: number): string | null {
  const maxYear = new Date().getUTCFullYear() + 1;
  if (y < 1995 || y > maxYear || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}

/** First date in a regex match whose groups follow DATE_SOURCES (ISO, month-first, day-first). */
function dateFromGroups(g: (string | undefined)[]): string | null {
  // ISO: groups 1-3; month-first: 4-6; day-first: 7-9
  if (g[1]) return isoDate(+g[1], +g[2]!, +g[3]!);
  if (g[4]) return isoDate(+g[6]!, MONTHS[g[4].slice(0, g[4].toLowerCase().startsWith("sept") ? 4 : 3).toLowerCase()], +g[5]!);
  if (g[7]) return isoDate(+g[9]!, MONTHS[g[8]!.slice(0, g[8]!.toLowerCase().startsWith("sept") ? 4 : 3).toLowerCase()], +g[7]);
  return null;
}

/** Parses a date string from structured data (ISO or long form) into YYYY-MM-DD. */
export function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const m = value.match(DATE_ANY);
  return m ? dateFromGroups(m) : null;
}

const PUBLISHED_KEYS = /^(date_?published|published_?(date|time|at)?|datepublished|date_?created)$/i;
const UPDATED_KEYS = /^(date_?modified|modified_?(date|time|at)?|datemodified|updated_?(date|time|at)?|last_?modified)$/i;

function structuredDate(pageContent: any, keys: RegExp): string | null {
  const objects = [pageContent, pageContent?.meta, ...topics(pageContent)];
  for (const obj of objects) {
    if (!obj || typeof obj !== "object") continue;
    for (const [k, v] of Object.entries(obj)) {
      if (keys.test(k)) {
        const d = parseDate(v);
        if (d) return d;
      }
    }
  }
  return null;
}

function structuredAuthor(pageContent: any): string | null {
  for (const topic of topics(pageContent)) {
    const a = typeof topic?.author === "string" ? topic.author.trim() : "";
    if (a) return a;
  }
  const a = pageContent?.author;
  return typeof a === "string" && a.trim() ? a.trim() : null;
}

function textAuthor(lines: Line[]): string | null {
  const candidates = [...lines.slice(0, 80), ...lines.slice(-40)];
  for (const line of candidates) {
    if (line.fenced) continue;
    const text = cleanInline(line.text.replace(/^\s*[#>*\-]+\s*/, ""));
    const m = text.match(AUTHOR_LINE);
    if (m) {
      const name = m[1].replace(/[.,;:|]+$/, "").trim();
      if (name && !NOT_NAMES.has(name.split(/\s+/)[0])) return name;
    }
  }
  return null;
}

// ------------------------------------------------------------------ links and FAQ

function linkCounts(markdown: string, url: string): { internal: number; external: number } {
  let base: URL | null = null;
  try {
    base = new URL(url);
  } catch {
    base = null;
  }
  const ownDomain = base ? regDomain(base.hostname) : "";
  let internal = 0;
  let external = 0;
  const hrefs: string[] = [];
  for (const m of markdown.matchAll(/(!?)\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g)) {
    if (m[1] !== "!") hrefs.push(m[2]);
  }
  for (const m of markdown.matchAll(/<(https?:\/\/[^>\s]+)>/g)) hrefs.push(m[1]);
  for (const href of hrefs) {
    if (href.startsWith("#")) continue;
    let target: URL;
    try {
      target = base ? new URL(href, base) : new URL(href);
    } catch {
      continue;
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") continue;
    if (ownDomain && regDomain(target.hostname) === ownDomain) internal++;
    else external++;
  }
  return { internal, external };
}

function hasFaq(outline: OutlineItem[]): boolean {
  if (outline.some((h) => /\bfaqs?\b|frequently asked/i.test(h.text))) return true;
  let run = 0;
  for (const h of outline) {
    run = /\?\s*$/.test(h.text) ? run + 1 : 0;
    if (run >= 3) return true;
  }
  return false;
}

// ------------------------------------------------------------------ page_content fallback

/** Markdown rebuilt from DataForSEO page_content when the page came back without markdown. */
export function markdownFromPageContent(pageContent: any): string {
  const out: string[] = [];
  for (const topic of topics(pageContent)) {
    const title = typeof topic?.h_title === "string" ? topic.h_title.trim() : "";
    if (title) out.push(`${"#".repeat(Math.min(6, Math.max(1, Number(topic.level) || 2)))} ${title}`);
    for (const p of Array.isArray(topic?.primary_content) ? topic.primary_content : []) {
      if (typeof p?.text === "string" && p.text.trim()) out.push(p.text.trim());
    }
    for (const table of Array.isArray(topic?.table_content) ? topic.table_content : []) {
      const row = (r: any) => "| " + (r?.row_cells ?? []).map((c: any) => String(c?.text ?? "").replace(/\|/g, "/")).join(" | ") + " |";
      const header = Array.isArray(table?.header) ? table.header : [];
      const body = Array.isArray(table?.body) ? table.body : [];
      const lines = header.map(row);
      if (header.length) lines.push("|" + " --- |".repeat(Math.max(1, header[0]?.row_cells?.length ?? 1)));
      lines.push(...body.map(row));
      if (lines.length) out.push(lines.join("\n"));
    }
  }
  return out.join("\n\n");
}

/** Heading outline from the markdown, or from page_content when the markdown has no headings. */
export function pageOutline(markdown: string, pageContent: any | null): OutlineItem[] {
  const outline = outlineFromMarkdown(markdown);
  if (outline.length || !pageContent) return outline;
  return topics(pageContent)
    .filter((t) => typeof t?.h_title === "string" && t.h_title.trim())
    .map((t) => ({ level: Math.min(6, Math.max(1, Number(t.level) || 2)), text: cleanInline(t.h_title) }));
}

// ------------------------------------------------------------------ measurement

/**
 * Measures a parsed page in code. `pageContent` (DataForSEO page_content) supplies the author,
 * structured dates and tables when present; everything else comes from the markdown.
 * words_before_answer is null here; it is filled once the answer sentence is known.
 */
export function measurePage(markdown: string, pageContent: any | null, url: string): PageMeasures {
  const md = markdown ?? "";
  const lines = linesOf(md);
  const text = plainText(md);
  const words = wordsOf(text);
  const numbers = words.filter((w) => /\d/.test(w)).length;

  const outline = pageOutline(md, pageContent);
  const levels = new Set(outline.map((h) => h.level));

  const { stats: mdTables, tableLines } = markdownTables(lines);
  const pcTables = contentTables(pageContent);
  const tables = pcTables.tables > mdTables.tables ? pcTables : mdTables;

  const lists = markdownLists(lines, tableLines);
  const links = linkCounts(md, url);
  const updatedMatch = text.match(UPDATED_LABEL);
  const publishedMatch = text.match(PUBLISHED_LABEL);
  const updated = structuredDate(pageContent, UPDATED_KEYS) ?? (updatedMatch ? dateFromGroups(updatedMatch) : null);
  let published = structuredDate(pageContent, PUBLISHED_KEYS) ?? (publishedMatch ? dateFromGroups(publishedMatch) : null);
  if (!published) {
    // An unlabelled date near the top of the page is almost always the byline date.
    const top = text.slice(0, 2000);
    const m = top.match(DATE_ANY);
    const d = m ? dateFromGroups(m) : null;
    if (d && d !== updated) published = d;
  }

  return {
    word_count: words.length,
    headings: outline.length,
    outline_depth: levels.size,
    tables: tables.tables,
    table_rows: tables.rows,
    max_table_columns: tables.maxColumns,
    lists: lists.lists,
    list_items: lists.items,
    comparison_blocks: tables.comparisonTables + lists.namedLists,
    numbers_per_100_words: words.length ? round((numbers / words.length) * 100) : 0,
    author: structuredAuthor(pageContent) ?? textAuthor(lines),
    published,
    updated,
    internal_links: links.internal,
    external_links: links.external,
    has_faq: hasFaq(outline),
    words_before_answer: null,
  };
}

/** Locates each of Google's passages in the page markdown. */
export function locatePassages(markdown: string | null | undefined, passages: string[], urlKey = ""): PassageLocation[] {
  return passages.map((passage) => {
    const loc = locatePassage(markdown, passage);
    return {
      url_key: urlKey,
      passage,
      found: loc.found,
      heading: loc.heading,
      position: loc.position,
      match_score: loc.match_score,
    };
  });
}

// ------------------------------------------------------------------ the pages cache

export interface PageRef {
  url_key: string;
  url: string;
}

export interface PageState {
  url_key: string;
  parse_status: "pending" | "ok" | "failed";
  parsed_at: string | null;
  /** The last parse attempt; later than parsed_at when a re-parse failed and the old content was kept. */
  parse_attempted_at?: string | null;
  tag_status?: "none" | "submitted" | "done" | "failed";
}

/**
 * True when a page is missing, never parsed, stale (older than maxAgeDays) or failed long enough
 * ago to retry. A stale page whose re-parse failed recently waits for the retry interval too.
 */
export function needsParse(row: PageState | null | undefined, maxAgeDays = 7, now = Date.now()): boolean {
  if (!row || row.parse_status === "pending" || !row.parsed_at) return true;
  const parsed = Date.parse(row.parsed_at);
  const attempted = row.parse_attempted_at ? Math.max(parsed, Date.parse(row.parse_attempted_at)) : parsed;
  const retryAfter = Math.min(FAILED_RETRY_MS, maxAgeDays * DAY_MS);
  if (row.parse_status === "failed") return now - attempted >= retryAfter;
  if (now - parsed < maxAgeDays * DAY_MS) return false;
  return now - attempted >= retryAfter;
}

export interface EnsureResult {
  parsed: string[]; // url_keys parsed now
  failed: string[]; // url_keys whose parse failed now
  fresh: string[]; // url_keys already parsed recently enough
  rejected: string[]; // url_keys whose URL does not normalise to them
}

/**
 * Makes sure each page has a row in `pages` and a parse no older than maxAgeDays. Missing and stale
 * pages are parsed with DataForSEO (at most `concurrency` at once, and none started after
 * `deadline`); a re-parse resets the page's tags so they are redone. A failed re-parse of a page
 * that parsed before keeps the old content and records the attempt. The cache is shared, so a page
 * is only ever written under the key its own URL normalises to. Never throws for one page's failure.
 */
export async function ensurePages(urlKeysWithUrls: PageRef[], maxAgeDays = 7, concurrency = 4, deadline = Infinity): Promise<EnsureResult> {
  const db = serviceClient();
  const byKey = new Map<string, PageRef>();
  const result: EnsureResult = { parsed: [], failed: [], fresh: [], rejected: [] };
  for (const p of urlKeysWithUrls) {
    if (!p.url_key || !p.url || byKey.has(p.url_key)) continue;
    if (normalizeUrl(p.url) !== p.url_key) {
      console.error(`page ${p.url_key}: ${p.url} does not normalise to it; not parsed`);
      result.rejected.push(p.url_key);
      continue;
    }
    byKey.set(p.url_key, p);
  }
  if (!byKey.size) return result;

  const keys = [...byKey.keys()];
  const { data: rows, error } = await db.from("pages").select("url_key, parse_status, parsed_at, parse_attempted_at").in("url_key", keys);
  if (error) throw new Error(`pages: ${error.message}`);
  const existing = new Map<string, PageState>((rows ?? []).map((r: PageState) => [r.url_key, r]));

  const missing = keys.filter((k) => !existing.has(k)).map((k) => {
    const url = stripTextFragment(byKey.get(k)!.url);
    return { url_key: k, url, reg_domain: regDomain(hostOfUrl(url) || k.split("/")[0]), parse_status: "pending" };
  });
  if (missing.length) {
    const ins = await db.from("pages").upsert(missing, { onConflict: "url_key", ignoreDuplicates: true });
    if (ins.error) throw new Error(`pages insert: ${ins.error.message}`);
  }

  const todo = keys.filter((k) => needsParse(existing.get(k), maxAgeDays));
  result.fresh = keys.filter((k) => !todo.includes(k));

  let next = 0;
  const worker = async () => {
    while (next < todo.length && Date.now() < deadline) {
      const key = todo[next++];
      const ok = await parseOne(byKey.get(key)!, existing.get(key));
      (ok ? result.parsed : result.failed).push(key);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, todo.length)) }, worker));
  return result;
}

async function parseOne(ref: PageRef, previous: PageState | undefined): Promise<boolean> {
  const db = serviceClient();
  const url = stripTextFragment(ref.url);
  const now = new Date().toISOString();
  try {
    const page = await contentParsing(url);
    if (page.status_code !== null && page.status_code >= 400) throw new Error(`HTTP ${page.status_code}`);
    let markdown = page.markdown && page.markdown.trim() ? page.markdown : markdownFromPageContent(page.page_content);
    if (!markdown.trim()) throw new Error("the page has no readable content");
    if (markdown.length > MAX_MARKDOWN) markdown = markdown.slice(0, MAX_MARKDOWN);
    const { error } = await db.from("pages").update({
      url,
      parse_status: "ok",
      parsed_at: now,
      parse_attempted_at: now,
      parse_error: null,
      markdown,
      outline: pageOutline(markdown, page.page_content),
      measures: measurePage(markdown, page.page_content, url),
      tags: null,
      tag_status: "none",
      tagged_at: null,
      tag_attempts: 0,
    }).eq("url_key", ref.url_key);
    if (error) throw new Error(`saving the page: ${error.message}`);
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`parse ${url}: ${message}`);
    // A page that parsed before keeps its content, tags and parsed_at; only the attempt is recorded.
    const update = previous?.parse_status === "ok"
      ? { parse_attempted_at: now, parse_error: message }
      : { parse_status: "failed", parsed_at: now, parse_attempted_at: now, parse_error: message };
    const { error } = await db.from("pages").update(update).eq("url_key", ref.url_key);
    if (error) console.error(`pages ${ref.url_key}: ${error.message}`);
    return false;
  }
}
