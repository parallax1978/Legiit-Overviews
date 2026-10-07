// DataForSEO SERP result (Google Organic advanced: Live, task_get or postback) -> ParsedCapture.
//
// Sentences come from the overview's markdown: blocks (paragraphs, list items, headings, table rows)
// are split with Intl.Segmenter, and citation markers like [[1]](url) are removed from the text and
// attached to the sentence they follow. Every ai_overview item becomes a section; section text the
// markdown lacks (expanded panels, tables, unknown item types) is appended as extra sentences, so
// nothing Google showed is dropped. content_hash uses a synchronous SHA-256 (byte-identical to
// crypto.subtle's) so parseCapture stays synchronous and its output complete.
import { hostOfUrl, normalizeUrl, regDomain, stripTextFragment } from "./normalize.ts";
import type {
  CodeFormats,
  ParsedCapture,
  ParsedCitation,
  ParsedOrganic,
  ParsedSection,
  ParsedSentence,
  SectionKind,
  SentenceKind,
} from "./types.ts";

const SECTION_KINDS: Record<string, SectionKind> = {
  ai_overview_element: "element",
  ai_overview_expanded_element: "expanded",
  ai_overview_table_element: "table",
  ai_overview_video_element: "video",
};

/** Parses one DataForSEO task `result[0]`. Absent overviews still return the organic results. */
export function parseCapture(result: any): ParsedCapture {
  const items: any[] = Array.isArray(result?.items) ? result.items : [];
  const organic = parseOrganic(items);
  const absent: ParsedCapture = {
    status: "absent",
    asynchronous: null,
    markdown: null,
    sentences: [],
    sections: [],
    citations: [],
    organic,
    formats: null,
    content_hash: null,
  };
  const overviews = items.filter((it) => it?.type === "ai_overview");
  if (!overviews.length) return absent;

  const lang = segmenterLanguage(result?.language_code);
  const b = new Builder(lang);
  for (const ov of overviews) b.addReferences(ov);
  for (const ov of overviews) b.addMarkdown(ov);
  for (const ov of overviews) b.addSections(ov);
  if (!b.drafts.length) return absent;

  const sentences: ParsedSentence[] = b.drafts.map((d, i) => ({
    i,
    text: d.text,
    block: d.block,
    kind: d.kind,
    citations: sortedNumbers(d.citations),
  }));
  const flags = overviews.map((ov) => ov.asynchronous_ai_overview).filter((v) => typeof v === "boolean");
  return {
    status: "present",
    asynchronous: flags.length ? flags.some(Boolean) : null,
    markdown: b.markdown(),
    sentences,
    sections: b.sections,
    citations: b.citations,
    organic,
    formats: codeFormats(sentences, b.sections, lang),
    content_hash: contentHash(sentences, b.citations),
  };
}

/** The SERP's own capture time (`datetime`, e.g. "2026-10-07 12:00:00 +00:00") as ISO UTC, or null. */
export function parsedCapturedAt(result: any): string | null {
  const raw = typeof result?.datetime === "string" ? result.datetime.trim() : "";
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if (!m) return null;
  let tz = (m[3] ?? "Z").toUpperCase();
  if (/^[+-]\d{4}$/.test(tz)) tz = `${tz.slice(0, 3)}:${tz.slice(3)}`;
  const d = new Date(`${m[1]}T${m[2]}${tz}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Removes images (data-URI, even truncated, and ordinary) from markdown; text and links are kept. */
export function stripImages(md: string): string {
  return md
    .replace(/!\[[^\]\n]*\]\(\s*data:[^,\s)]*,[A-Za-z0-9+/=%._-]*\)?/g, "")
    .replace(/!\[[^\]\n]*\]\([^)\s]*(?:\s+"[^"\n]*")?\)/g, "")
    .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/\[\s*\]\([^)\n]*\)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
const DATE_PREFIX = new RegExp(`^(?:${MONTH}\\s+\\d{1,2},\\s*\\d{4}|\\d{1,2}\\s+${MONTH}\\s+\\d{4})(?:\\s*[\u2014\u2013]|\\s+-)(?:\\s+|$)`);

/**
 * Removes the publication date Google puts before a reference's text ("Sep 18, 2026 — " or
 * "18 Sep 2026 – "): the page itself does not carry it, so it would only blur passage matching.
 */
export function stripDatePrefix(text: string): string {
  return text.replace(DATE_PREFIX, "");
}

// ------------------------------------------------------------------ builder

interface Draft {
  text: string;
  kind: SentenceKind;
  block: number;
  citations: Set<number>;
}

interface RawBlock {
  kind: SentenceKind;
  raw: string;
  split: boolean; // paragraphs and list items are split into sentences; headings and rows are not
  plain: boolean; // plain text (no markdown to clean, no markers)
}

/** Maps a citation marker (its number and link target) to a citation idx. */
type Resolver = (n: number | null, url: string | null) => number | null;

/**
 * One citation per url_key. Google cites a page once per passage it used (each reference with its
 * own text fragment), so every distinct passage is kept in `passages`; `passage` is the first.
 */
interface Citation extends ParsedCitation {
  passages: string[];
}

class Builder {
  citations: Citation[] = [];
  drafts: Draft[] = [];
  sections: ParsedSection[] = [];
  private byKey = new Map<string, number>();
  private topKeys = new Map<any, string[]>();
  private coverage = new Coverage();
  private blocks = 0;
  private markdownParts: string[] = [];
  private itemTexts: string[] = [];
  private ranges = new Map<any, [number, number]>(); // drafts each overview's markdown produced

  constructor(private lang: string) {}

  /** Top-level references first, then any nested in items and components, in order of appearance. */
  addReferences(ov: any): void {
    const keys: string[] = [];
    for (const ref of arr(ov.references)) {
      const idx = this.addCitation(ref?.url, ref);
      keys.push(idx === null ? "" : this.citations[idx].url_key);
    }
    this.topKeys.set(ov, keys);
    walkReferences(ov.items, (ref) => this.addCitation(ref?.url, ref));
  }

  /** The overview's own markdown is the main source of sentences. */
  addMarkdown(ov: any): void {
    const md = typeof ov.markdown === "string" ? stripImages(ov.markdown) : "";
    if (!md) return;
    this.markdownParts.push(md);
    const resolve = this.resolver(this.topKeys.get(ov) ?? []);
    const first = this.drafts.length;
    for (const block of markdownBlocks(md)) {
      let blockNo: number | null = null;
      for (const d of this.blockDrafts(block, resolve)) {
        if (!d.text) {
          this.attachToLast(d.citations);
          continue;
        }
        blockNo ??= this.blocks++;
        this.push({ ...d, block: blockNo });
      }
    }
    this.ranges.set(ov, [first, this.drafts.length]);
  }

  /** One section per item; text the markdown did not cover is appended as sentences. */
  addSections(ov: any): void {
    const resolve = this.resolver(this.topKeys.get(ov) ?? []);
    const items = arr(ov.items);
    if (!items.length) {
      // No items: the markdown is the only content, kept as one element section.
      const [from, to] = this.ranges.get(ov) ?? [0, 0];
      const mine = this.drafts.slice(from, to);
      if (mine.length) {
        this.sections.push({
          position: this.sections.length,
          kind: "element",
          title: null,
          text: mine.map((d) => d.text).join("\n"),
          citation_idx: sortedNumbers(new Set(mine.flatMap((d) => [...d.citations]))),
        });
      }
      return;
    }
    for (const item of items) this.addSection(item, resolve);
  }

  private addSection(item: any, resolve: Resolver): void {
    const kind: SectionKind = SECTION_KINDS[item?.type] ?? "unknown";
    const own = new Set<number>();
    walkReferences([item], (ref) => {
      const idx = this.addCitation(ref?.url, ref);
      if (idx !== null) own.add(idx);
    });
    if (kind === "video" && typeof item?.url === "string") {
      const idx = this.addCitation(item.url, { title: item.title, source: item.source ?? item.domain, text: null });
      if (idx !== null) own.add(idx);
    }

    const units = sectionUnits(item, kind);
    const bodyText = units
      .flatMap((u) => u.blocks)
      .filter((c) => !c.title)
      .map((c) => this.plainText(c.block))
      .filter(Boolean)
      .join("\n");
    const text = kind === "video" ? str(item?.snippet) ?? str(item?.text) ?? "" : bodyText;
    if (text) this.itemTexts.push(text);

    const mine = new Set<number>(); // sentence indexes that carry this section's text
    const orphans = new Set(own); // references no unit with sentences claimed
    for (const unit of units) {
      const refs = new Set<number>();
      for (const ref of unit.refs) {
        const idx = this.addCitation(ref?.url, ref);
        if (idx !== null) refs.add(idx);
      }
      const sentences = this.placeUnit(unit, resolve, refs);
      for (const i of sentences) mine.add(i);
      if (sentences.size) {
        this.attachMissing(sentences, refs);
        for (const c of refs) orphans.delete(c);
      }
      for (const c of refs) own.add(c);
    }
    if (mine.size) this.attachMissing(mine, orphans);
    for (const i of mine) for (const c of this.drafts[i].citations) own.add(c);

    this.sections.push({
      position: this.sections.length,
      kind,
      title: str(item?.title),
      text,
      citation_idx: sortedNumbers(own),
    });
  }

  /**
   * Finds each sentence of the unit among the sentences emitted so far, or appends it. Returns the
   * sentence indexes carrying the unit's text; marker citations found in the unit are added to `refs`.
   */
  private placeUnit(unit: Unit, resolve: Resolver, refs: Set<number>): Set<number> {
    const mine = new Set<number>();
    let last: number | null = null;
    for (const { block } of unit.blocks) {
      let blockNo: number | null = null;
      for (const d of this.blockDrafts(block, resolve)) {
        for (const c of d.citations) refs.add(c);
        if (!d.text) {
          if (last !== null) for (const c of d.citations) this.drafts[last].citations.add(c);
          continue;
        }
        const covering = this.coverage.locate(d.text);
        if (covering) {
          if (!covering.length) continue;
          for (const i of covering) mine.add(i);
          last = covering[covering.length - 1];
          for (const c of d.citations) this.drafts[last].citations.add(c);
        } else {
          blockNo ??= this.blocks++;
          last = this.push({ ...d, block: blockNo });
          mine.add(last);
        }
      }
    }
    return mine;
  }

  /** References that none of the sentences carries yet belong to the last of them. */
  private attachMissing(sentences: Set<number>, refs: Set<number>): void {
    const carried = new Set([...sentences].flatMap((i) => [...this.drafts[i].citations]));
    const last = this.drafts[Math.max(...sentences)];
    for (const c of refs) if (!carried.has(c)) last.citations.add(c);
  }

  markdown(): string | null {
    const md = (this.markdownParts.length ? this.markdownParts : this.itemTexts).join("\n\n").trim();
    return md || null;
  }

  private push(d: Draft): number {
    this.drafts.push(d);
    const i = this.drafts.length - 1;
    this.coverage.add(i, d.text);
    return i;
  }

  private attachToLast(citations: Set<number>): void {
    const last = this.drafts[this.drafts.length - 1];
    if (last) for (const c of citations) last.citations.add(c);
  }

  private addCitation(rawUrl: unknown, ref: any): number | null {
    if (typeof rawUrl !== "string" || !/^https?:\/\//i.test(rawUrl.trim())) return null;
    const url = stripTextFragment(rawUrl.trim());
    const key = normalizeUrl(url);
    const known = this.byKey.get(key);
    const text = str(ref?.text);
    const passage = text && str(stripDatePrefix(text));
    if (known !== undefined) {
      const c = this.citations[known];
      c.title ??= str(ref?.title);
      c.source ??= str(ref?.source);
      if (passage && !c.passages.includes(passage)) c.passages.push(passage);
      c.passage = c.passages[0] ?? null;
      return known;
    }
    const host = hostOfUrl(url);
    const idx = this.citations.length;
    this.citations.push({
      idx,
      url,
      url_key: key,
      host,
      reg_domain: regDomain(host || url),
      title: str(ref?.title),
      source: str(ref?.source),
      passage,
      passages: passage ? [passage] : [],
    });
    this.byKey.set(key, idx);
    return idx;
  }

  /** Markers resolve by URL (adding the URL when no reference lists it), else by their number. */
  private resolver(topKeys: string[]): Resolver {
    return (n, url) => {
      if (url && /^https?:\/\//i.test(url)) return this.addCitation(url, null);
      if (n !== null && n >= 1 && n <= topKeys.length) return this.byKey.get(topKeys[n - 1]) ?? null;
      return null;
    };
  }

  private blockDrafts(block: RawBlock, resolve: Resolver): Omit<Draft, "block">[] {
    const { text, markers } = block.plain ? { text: collapse(block.raw), markers: [] } : inlineText(block.raw, resolve);
    if (!/[\p{L}\p{N}]/u.test(text)) {
      return markers.length ? [{ text: "", kind: block.kind, citations: new Set(markers.map((m) => m.idx)) }] : [];
    }
    const spans = block.split ? sentenceSpans(text, this.lang) : [[0, text.length] as [number, number]];
    const out = spans.map(([s, e]) => ({ text: collapse(text.slice(s, e)), start: s, end: e, citations: new Set<number>() }));
    for (const m of markers) {
      const at = Math.max(0, m.pos - 1);
      const hit = out.find((o) => at >= o.start && at < o.end) ?? out[out.length - 1];
      hit.citations.add(m.idx);
    }
    // Fragments without words (stray punctuation) give their citations to the sentence before.
    const kept: Omit<Draft, "block">[] = [];
    for (const o of out) {
      if (/[\p{L}\p{N}]/u.test(o.text) || !kept.length) {
        kept.push({ text: o.text, kind: block.kind, citations: o.citations });
      } else {
        for (const c of o.citations) kept[kept.length - 1].citations.add(c);
      }
    }
    return kept;
  }

  private plainText(block: RawBlock): string {
    return block.plain ? collapse(block.raw) : collapse(inlineText(block.raw, () => null).text);
  }
}

/** Calls `fn` for every reference found under `references` keys anywhere in the value. */
function walkReferences(value: unknown, fn: (ref: any) => void, depth = 0): void {
  if (depth > 8 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value) walkReferences(v, fn, depth + 1);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const ref of arr(obj.references)) if (ref && typeof ref === "object") fn(ref);
  for (const [k, v] of Object.entries(obj)) {
    if (k !== "references" && v && typeof v === "object") walkReferences(v, fn, depth + 1);
  }
}

// ------------------------------------------------------------------ sections

interface Candidate {
  block: RawBlock;
  title: boolean;
}

/** A run of blocks that shares one `references` list: an item, or one component of it. */
interface Unit {
  blocks: Candidate[];
  refs: any[];
}

function plainBlocks(text: unknown, kind: SentenceKind, split = true): RawBlock[] {
  const s = str(text);
  if (!s) return [];
  return s.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((raw) => ({ kind, raw, split, plain: true }));
}

/** Markdown blocks when the markdown has text, otherwise the plain text. */
function contentBlocks(markdown: unknown, text: unknown, kind?: SentenceKind): RawBlock[] {
  const md = typeof markdown === "string" ? stripImages(markdown) : "";
  const blocks = md && hasText(md) ? markdownBlocks(md) : plainBlocks(text, "paragraph");
  return kind ? blocks.map((b) => ({ ...b, kind, split: b.kind !== "table_row" && b.kind !== "heading" })) : blocks;
}

/** Title block plus body. Only the item's own title is kept out of the section text (it is the section title). */
function titled(title: unknown, kind: SentenceKind, body: RawBlock[], sectionTitle = true): Candidate[] {
  return [
    ...plainBlocks(title, kind, false).map((block) => ({ block, title: sectionTitle })),
    ...body.map((block) => ({ block, title: false })),
  ];
}

/** The text of one ai_overview item in reading order, grouped by the references that go with it. */
function sectionUnits(item: any, kind: SectionKind): Unit[] {
  switch (kind) {
    case "element":
      return [{ blocks: titled(item.title, "heading", contentBlocks(item.markdown, item.text)), refs: arr(item.references) }];
    case "expanded":
      return [
        { blocks: titled(item.title, "expanded", plainBlocks(item.text, "expanded")), refs: arr(item.references) },
        ...arr(item.components).map((c) => ({
          blocks: titled(c?.title, "expanded", contentBlocks(c?.markdown, c?.text, "expanded"), false),
          refs: arr(c?.references),
        })),
      ];
    case "table":
      return [{ blocks: titled(item.title, "heading", tableBlocks(item)), refs: arr(item.references) }];
    case "video":
      return [];
    default:
      return unknownUnits(item, 0);
  }
}

function tableBlocks(item: any): RawBlock[] {
  const rows = [
    ...(Array.isArray(item.table?.table_header) ? [item.table.table_header] : []),
    ...arr(item.table?.table_content),
  ].filter(Array.isArray);
  if (rows.length) {
    return rows
      .map((cells: unknown[]) => cells.map((c) => collapse(String(c ?? ""))).join(" | "))
      .filter((raw) => hasText(raw))
      .map((raw) => ({ kind: "table_row" as const, raw, split: false, plain: true }));
  }
  return contentBlocks(item.markdown, item.text).map((b) => ({ ...b, kind: "table_row" as const, split: false }));
}

/** Every piece of text an unknown item carries, including nested items and components. */
function unknownUnits(item: any, depth: number): Unit[] {
  if (!item || typeof item !== "object" || depth > 4) return [];
  const body = contentBlocks(item.markdown, item.text);
  for (const key of ["snippet", "description"]) body.push(...plainBlocks(item[key], "paragraph"));
  const out: Unit[] = [{ blocks: titled(item.title, "heading", body, depth === 0), refs: arr(item.references) }];
  for (const [key, v] of Object.entries(item)) {
    if (!Array.isArray(v) || ["references", "images", "links"].includes(key)) continue;
    for (const child of v) out.push(...unknownUnits(child, depth + 1));
  }
  return out;
}

// ------------------------------------------------------------------ markdown

/** Splits markdown into blocks: headings, table rows, list items and paragraphs. */
function markdownBlocks(md: string): RawBlock[] {
  const out: RawBlock[] = [];
  let cur: RawBlock | null = null;
  const flush = () => {
    if (cur && cur.raw.trim()) out.push(cur);
    cur = null;
  };
  for (const line of md.split(/\r?\n/)) {
    if (!line.trim() || /^\s*(```|~~~)/.test(line) || /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      continue;
    }
    let m = line.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
    if (m) {
      flush();
      out.push({ kind: "heading", raw: m[1], split: false, plain: false });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      if (!/^\s*\|?(\s*:?-{2,}:?\s*\|)*\s*:?-{2,}:?\s*\|?\s*$/.test(line)) {
        out.push({ kind: "table_row", raw: tableCells(line).join(" | "), split: false, plain: false });
      }
      continue;
    }
    m = line.match(/^\s*(?:[-*+•]|\d{1,3}[.)])\s+(.*)$/);
    if (m) {
      flush();
      cur = { kind: "list_item", raw: m[1].trim(), split: true, plain: false };
      continue;
    }
    m = line.match(/^\s*(?:\*\*([^*]+)\*\*|__([^_]+)__)\s*(:?)\s*$/);
    if (m && isHeadingLike(m[1] ?? m[2])) {
      flush();
      out.push({ kind: "heading", raw: (m[1] ?? m[2]).trim() + m[3], split: false, plain: false });
      continue;
    }
    const text = line.replace(/^\s*>\s?/, "").trim();
    if (cur) cur.raw += " " + text;
    else cur = { kind: "paragraph", raw: text, split: true, plain: false };
  }
  flush();
  return out;
}

function isHeadingLike(s: string): boolean {
  const t = s.trim().replace(/:$/, "");
  return t.split(/\s+/).length <= 12 && !/[.!?]$/.test(t);
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim());
}

const MARK = "";
const MARK_BASE = 0xE100;

/**
 * Inline markdown -> plain text. Citation markers are removed and returned with their offsets in
 * the plain text; ordinary links keep their label.
 */
function inlineText(raw: string, resolve: Resolver): { text: string; markers: { pos: number; idx: number }[] } {
  const found: (number | null)[] = [];
  const place = (idx: number | null) => {
    found.push(idx);
    return MARK + String.fromCharCode(MARK_BASE + found.length - 1);
  };
  let s = mapLinks(raw, (label, target) => {
    const m = label.trim().match(/^\[?\^?(\d{1,3})\]?$/);
    return m ? place(resolve(Number(m[1]), linkUrl(target))) : label;
  });
  s = s.replace(/\[\[(\d{1,3})\]\]|\[\^(\d{1,3})\]/g, (_, a, b) => place(resolve(Number(a ?? b), null)));
  s = cleanInline(s);

  let text = "";
  const markers: { pos: number; idx: number }[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== MARK) {
      text += s[i];
      continue;
    }
    const idx = found[s.charCodeAt(i + 1) - MARK_BASE];
    i++;
    if (idx !== null && idx !== undefined) markers.push({ pos: text.length, idx });
    // "engine.[[1]](u)Key" renders as two sentences; keep them apart once the marker is gone.
    const next = s[i + 1];
    if (next !== undefined && next !== MARK && !/\s/.test(next) && /[.!?;:]$/.test(text)) text += " ";
  }
  return { text, markers };
}

function cleanInline(s: string): string {
  return s
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>/gi, "")
    .replace(/(?<!\\)(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    .replace(/(?<![\\\p{L}\p{N}*_])([*_])(?=[^\s*_])(.+?)(?<=[^\s*_])\1(?![\p{L}\p{N}*_])/gu, "$2")
    .replace(/(?<!\\)(\*\*|~~|`+)/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1")
    // DataForSEO joins text nodes without a space ("engine.Key specs"); split them back apart.
    .replace(/([\p{Ll}\p{N}%)\]"”’])([.!?])(?=\p{Lu}\p{Ll})/gu, "$1$2 ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Replaces every [label](target) left to right; targets may contain balanced parentheses. */
function mapLinks(s: string, fn: (label: string, target: string) => string): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("[", i);
    if (open < 0) break;
    const close = matching(s, open, "[", "]");
    const end = close >= 0 && s[close + 1] === "(" ? matching(s, close + 1, "(", ")") : -1;
    if (end < 0) {
      out += s.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    out += s.slice(i, open) + fn(s.slice(open + 1, close), s.slice(close + 2, end));
    i = end + 1;
  }
  return out + s.slice(i);
}

function matching(s: string, from: number, open: string, close: string): number {
  let depth = 0;
  for (let i = from; i < s.length && i - from < 4096; i++) {
    if (s[i] === "\\") {
      i++;
      continue;
    }
    if (s[i] === open) depth++;
    else if (s[i] === close && --depth === 0) return i;
    else if (s[i] === "\n" && open === "(") return -1;
  }
  return -1;
}

function linkUrl(target: string): string | null {
  const t = target.trim().replace(/^<|>$/g, "").split(/\s+/)[0];
  return t || null;
}

// ------------------------------------------------------------------ sentences

const segmenters = new Map<string, Intl.Segmenter>();

function segmenter(lang: string, granularity: "sentence" | "word"): Intl.Segmenter {
  const key = `${lang}:${granularity}`;
  let s = segmenters.get(key);
  if (!s) {
    s = new Intl.Segmenter(lang, { granularity });
    segmenters.set(key, s);
  }
  return s;
}

function segmenterLanguage(code: unknown): string {
  if (typeof code !== "string" || !code.trim()) return "en";
  try {
    return Intl.Segmenter.supportedLocalesOf([code.trim().replace(/_/g, "-")])[0] ?? "en";
  } catch {
    return "en";
  }
}

/** Splits text into sentences: [start, end) offsets that cover the whole text. */
export function sentenceSpans(text: string, lang = "en"): [number, number][] {
  const out: [number, number][] = [];
  for (const s of segmenter(lang, "sentence").segment(text)) {
    const span: [number, number] = [s.index, s.index + s.segment.length];
    const prev = out[out.length - 1];
    if (prev && keepTogether(text.slice(prev[0], prev[1]), s.segment, lang)) prev[1] = span[1];
    else out.push(span);
  }
  return out;
}

/** Abbreviations that never end a sentence, by language (lowercase, without the final period). */
const ABBREVIATIONS: Record<string, string[]> = {
  "*": ["e.g", "i.e", "vs", "cf", "ca", "approx", "dr", "prof", "mr", "mrs", "ms"],
  en: ["mx", "sr", "jr", "st", "mt", "eg", "ie", "appx", "incl", "esp", "viz", "resp", "gen", "sen", "rep", "rev", "lt", "col", "capt", "sgt", "dept", "univ", "fig", "figs"],
  de: ["z.b", "zb", "d.h", "u.a", "bzw", "vgl", "ggf", "evtl", "inkl", "zzgl", "bspw", "sog", "insb", "gem", "hr", "fr", "mio", "mrd", "tsd", "u.u", "o.ä", "i.d.r", "z.t", "bzgl"],
  fr: ["mme", "mlle", "pr", "p.ex", "env", "av", "bd"],
  es: ["sr", "sra", "srta", "dra", "ud", "uds", "p.ej", "aprox"],
  it: ["sig", "dott", "ing", "avv", "p.es"],
  nl: ["dhr", "mevr", "bijv", "d.w.z", "o.a", "m.b.t", "zgn"],
  pt: ["sr", "sra", "dra", "p.ex", "aprox"],
};
const ABBREVIATION_SETS = Object.fromEntries(Object.entries(ABBREVIATIONS).map(([k, v]) => [k, new Set(v)]));
/** Abbreviations followed by a number: "No. 1", "approx. 3.5x". */
const BEFORE_NUMBER = new Set(["no", "nos", "nr", "vol", "p", "pp", "ch", "sec", "art", "ver", "est", "abs", "kap", "s", "núm", "pag", "pág", "nº", "n°"]);
/** Languages that write ordinals as "1. Januar". */
const ORDINAL_LANGS = new Set(["de", "da", "nb", "nn", "no", "fi", "cs", "sk", "sl", "hr", "sr", "hu", "is", "lv", "et", "tr", "pl"]);

function keepTogether(prev: string, next: string, lang: string): boolean {
  const p = prev.trimEnd();
  const n = next.trimStart();
  if (!n) return true;
  if (!p.endsWith(".")) return false;
  const m = p.match(/(?:^|[\s(["“‘'])([\p{L}\p{N}][\p{L}\p{N}.'’°º-]*?)\.$/u);
  if (!m) return false;
  const tok = m[1].toLowerCase();
  const base = lang.split("-")[0].toLowerCase();
  if (ABBREVIATION_SETS["*"].has(tok) || ABBREVIATION_SETS[base]?.has(tok)) return true;
  if (/^\p{N}/u.test(n) && BEFORE_NUMBER.has(tok)) return true;
  if (/^\p{Ll}$/u.test(tok)) return true; // "z. B.", "d. h."
  if (/^\p{Lu}$/u.test(tok) && /^\p{Lu}\./u.test(n)) return true; // initials "J. K."
  if (/^\d{1,4}$/.test(tok) && ORDINAL_LANGS.has(base) && /^\p{L}/u.test(n)) return true; // "1. Januar"
  return /^\p{Ll}/u.test(n);
}

/** Word-level coverage index over the sentences emitted so far. */
class Coverage {
  private tokens: string[] = [];
  private owner: number[] = [];
  private trigrams = new Map<string, number[]>();

  add(owner: number, text: string): void {
    const start = this.tokens.length;
    for (const t of words(text)) {
      this.tokens.push(t);
      this.owner.push(owner);
    }
    for (let i = Math.max(0, start - 2); i + 3 <= this.tokens.length; i++) {
      const k = this.tokens.slice(i, i + 3).join(" ");
      const list = this.trigrams.get(k);
      if (list) list.push(i);
      else this.trigrams.set(k, [i]);
    }
  }

  /** Sentence indexes that already carry `text` (empty when it has no words), or null if not covered. */
  locate(text: string): number[] | null {
    const p = words(text);
    if (!p.length) return [];
    let start = -1;
    if (p.length < 3) {
      for (let i = 0; i + p.length <= this.tokens.length && start < 0; i++) {
        if (p.every((w, j) => this.tokens[i + j] === w)) start = i;
      }
      if (start < 0) return null;
    } else {
      const votes = new Map<number, number>();
      for (let j = 0; j + 3 <= p.length; j++) {
        for (const i of this.trigrams.get(p.slice(j, j + 3).join(" ")) ?? []) votes.set(i - j, (votes.get(i - j) ?? 0) + 1);
      }
      let best = 0;
      for (const [s, v] of votes) if (v > best || (v === best && s < start)) [start, best] = [s, v];
      if (best / (p.length - 2) < 0.6) return null;
    }
    const owners = new Set<number>();
    for (let i = Math.max(0, start); i < Math.min(this.tokens.length, start + p.length); i++) owners.add(this.owner[i]);
    return sortedNumbers(owners);
  }
}

function words(text: string): string[] {
  return text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

// ------------------------------------------------------------------ organic, formats, hash

function parseOrganic(items: any[]): ParsedOrganic[] {
  return items
    .filter((it) => it?.type === "organic" && typeof it.url === "string" && it.url)
    .map((it) => {
      const host = hostOfUrl(it.url);
      return {
        rank: Number(it.rank_group ?? it.rank_absolute ?? 0),
        url: it.url,
        url_key: normalizeUrl(it.url),
        reg_domain: regDomain(host || it.url),
        title: str(it.title),
      };
    })
    .sort((a, b) => a.rank - b.rank);
}

function codeFormats(sentences: ParsedSentence[], sections: ParsedSection[], lang: string): CodeFormats {
  const blocksOf = (kind: SentenceKind) => new Set(sentences.filter((s) => s.kind === kind).map((s) => s.block)).size;
  const wordSeg = segmenter(lang, "word");
  let wordCount = 0;
  for (const s of sentences) for (const w of wordSeg.segment(s.text)) if (w.isWordLike) wordCount++;
  return {
    word_count: wordCount,
    has_table: sections.some((s) => s.kind === "table") || sentences.some((s) => s.kind === "table_row"),
    list_items: blocksOf("list_item"),
    headings: blocksOf("heading"),
    sentences: sentences.length,
  };
}

/**
 * SHA-256 over each sentence's normalised text and the url_keys it cites, so the same content with
 * reordered references or different image data hashes the same.
 */
function contentHash(sentences: ParsedSentence[], citations: ParsedCitation[]): string {
  const canonical = sentences.map((s) => [
    s.text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim(),
    [...new Set(s.citations.map((i) => citations[i].url_key))].sort(),
  ]);
  return sha256Hex(JSON.stringify(canonical));
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** Synchronous SHA-256 of a string's UTF-8 bytes, as lowercase hex. */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = bytes.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(padded.length - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  return [...h].map((x) => x.toString(16).padStart(8, "0")).join("");
}

// ------------------------------------------------------------------ small helpers

function arr(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function hasText(s: string): boolean {
  return /[\p{L}\p{N}]/u.test(s.replace(/\[\[\d+\]\]\([^)]*\)/g, ""));
}

function sortedNumbers(s: Iterable<number>): number[] {
  return [...new Set(s)].sort((a, b) => a - b);
}
