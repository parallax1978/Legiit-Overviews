// Finds text inside a parsed page's markdown: where Google's quoted passage sits (heading and depth),
// how many words come before the answer sentence, and the page's heading outline.
import type { OutlineItem } from "./types.ts";

interface Token {
  t: string; // normalised token
  at: number; // offset in the original markdown
}

const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu;

/** Blanks out link targets, image targets, HTML tags and code fences without moving offsets. */
function maskMarkup(md: string): string {
  const blank = (s: string) => " ".repeat(s.length);
  return md
    .replace(/```[\s\S]*?```/g, blank)
    .replace(/\]\([^)]*\)/g, (s) => "]" + blank(s.slice(1)))
    .replace(/<[^>]+>/g, blank)
    .replace(/https?:\/\/\S+/g, blank);
}

function tokenize(md: string): Token[] {
  const masked = maskMarkup(md);
  const out: Token[] = [];
  for (const m of masked.matchAll(WORD)) {
    out.push({ t: m[0].normalize("NFKC").toLowerCase().replace(/[’']/g, ""), at: m.index! });
  }
  return out;
}

function words(text: string): string[] {
  return tokenize(text).map((x) => x.t);
}

export interface Located {
  found: boolean;
  heading: string | null; // nearest heading above the match
  position: number | null; // 0..1 offset of the match within the page
  match_score: number; // share of the passage's word triples found at the matched place
  token_index: number | null; // index of the first matched word in the page
}

const NOT_FOUND: Located = { found: false, heading: null, position: null, match_score: 0, token_index: null };

/**
 * Locates `passage` in `markdown`. Exact word-sequence matches score 1; otherwise word triples vote
 * for an alignment and the best one is accepted when at least `minScore` of the triples agree.
 */
export function locatePassage(markdown: string | null | undefined, passage: string | null | undefined, minScore = 0.5): Located {
  if (!markdown || !passage) return NOT_FOUND;
  const page = tokenize(markdown);
  const p = words(passage);
  if (!page.length || !p.length) return NOT_FOUND;

  const n = p.length < 3 ? p.length : 3;
  const key = (arr: string[], i: number) => arr.slice(i, i + n).join(" ");
  const pageWords = page.map((x) => x.t);

  const index = new Map<string, number[]>();
  for (let i = 0; i + n <= pageWords.length; i++) {
    const k = key(pageWords, i);
    const list = index.get(k);
    if (list) list.push(i);
    else index.set(k, [i]);
  }

  const shingles = Math.max(1, p.length - n + 1);
  const votes = new Map<number, number>();
  const firstHit = new Map<number, number>(); // per alignment, the first passage word found at it
  for (let j = 0; j + n <= p.length; j++) {
    const hits = index.get(key(p, j));
    if (!hits) continue;
    for (const i of hits) {
      const start = i - j;
      votes.set(start, (votes.get(start) ?? 0) + 1);
      if (!firstHit.has(start)) firstHit.set(start, j);
    }
  }
  let best = -1;
  let bestVotes = 0;
  for (const [start, v] of votes) {
    if (v > bestVotes || (v === bestVotes && start < best)) {
      best = start;
      bestVotes = v;
    }
  }
  const score = bestVotes / shingles;
  if (!bestVotes || score < minScore) return { ...NOT_FOUND, match_score: round(score) };

  // The passage may open with words the page lacks (a date Google prefixes, a cut-off word), so the
  // match starts at the first passage word found at the alignment, not at the alignment itself.
  const ti = best + firstHit.get(best)!;
  const offset = page[ti].at;
  return {
    found: true,
    heading: headingAbove(markdown, offset),
    position: round(offset / Math.max(1, markdown.length)),
    match_score: round(Math.min(1, score)),
    token_index: ti,
  };
}

/** Words in the page before `sentence` begins, or null when the sentence is not found. */
export function wordsBefore(markdown: string | null | undefined, sentence: string | null | undefined): number | null {
  if (!markdown || !sentence) return null;
  const loc = locatePassage(markdown, sentence, 0.6);
  if (!loc.found || loc.token_index === null) return null;
  // Heading words are not body text the reader has to get through, so they are not counted.
  const headingTokens = new Set<number>();
  const page = tokenize(markdown);
  for (const h of headingLines(markdown)) {
    for (let i = 0; i < page.length; i++) if (page[i].at >= h.start && page[i].at < h.end) headingTokens.add(i);
  }
  let count = 0;
  for (let i = 0; i < loc.token_index; i++) if (!headingTokens.has(i)) count++;
  return count;
}

interface HeadingLine {
  level: number;
  text: string;
  start: number;
  end: number;
}

function headingLines(markdown: string): HeadingLine[] {
  const out: HeadingLine[] = [];
  let inFence = false;
  let offset = 0;
  for (const line of markdown.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const m = !inFence ? line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/) : null;
    if (m) out.push({ level: m[1].length, text: cleanInline(m[2]), start: offset, end: offset + line.length });
    offset += line.length + 1;
  }
  return out;
}

function headingAbove(markdown: string, offset: number): string | null {
  let found: string | null = null;
  for (const h of headingLines(markdown)) {
    if (h.start <= offset) found = h.text;
    else break;
  }
  return found;
}

/** Strips inline markdown (links, emphasis, code) from a line of text. */
export function cleanInline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Heading outline of a markdown page. */
export function outlineFromMarkdown(markdown: string | null | undefined): OutlineItem[] {
  if (!markdown) return [];
  return headingLines(markdown).filter((h) => h.text).map((h) => ({ level: h.level, text: h.text }));
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}
