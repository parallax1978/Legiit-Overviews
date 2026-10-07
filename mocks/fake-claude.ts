// Fake Claude for the mock Anthropic API: detects the Legiit Overviews task from the request's
// output_config.format schema, reads the JSON between <data> and </data> in the user message, and
// returns deterministic output that validates against the zod schemas in _shared/schemas.ts.
// Rules are simple text heuristics: good enough to exercise matching, consolidation, the metrics,
// the brief checks and the draft scorer end to end, never a model of Claude's quality.

import type {
  BriefInput,
  BriefOutput,
  ConsolidateInput,
  ConsolidateOutput,
  DraftScoreInput,
  DraftScoreOutput,
  ExtractInput,
  ExtractOutput,
  PageTagInput,
  PageTagOutput,
} from "../supabase/functions/_shared/schemas.ts";
import { CLAIM_TYPES, type ClaimType, FORMAT_LABELS, type FormatLabel } from "../supabase/functions/_shared/types.ts";
import { KNOWN_TOOLS } from "./scenario.ts";

export type FakeTask = "extract" | "consolidate" | "page_tag" | "brief" | "draft_score";

/** Which task a request is for, from the property names of its output schema. */
export function detectTask(schema: unknown): FakeTask | null {
  const props = Object.keys((schema as { properties?: Record<string, unknown> } | null)?.properties ?? {});
  const has = (...keys: string[]) => keys.every((k) => props.includes(k));
  if (has("claim_merges")) return "consolidate";
  if (has("matrix")) return "brief";
  if (has("clarity")) return "draft_score";
  if (has("topics", "evidence")) return "page_tag";
  if (has("claims", "entities")) return "extract";
  return null;
}

/** The JSON document between <data> and </data> in the last user message. */
export function dataFrom(messages: unknown): unknown {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i] as { role?: string; content?: unknown };
    if (m?.role !== "user") continue;
    const text = typeof m.content === "string"
      ? m.content
      : Array.isArray(m.content)
      ? m.content.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n")
      : "";
    const match = text.match(/<data>\s*([\s\S]*?)\s*<\/data>/);
    if (match) return JSON.parse(match[1]);
  }
  throw new Error("no <data>...</data> block in the user message");
}

/** Runs the fake for a Messages API request body. Returns null when the task is not recognised. */
export function fakeOutput(params: { messages?: unknown; output_config?: { format?: { schema?: unknown } } }): { task: FakeTask; output: unknown } | null {
  const task = detectTask(params.output_config?.format?.schema);
  if (!task) return null;
  const data = dataFrom(params.messages);
  switch (task) {
    case "extract":
      return { task, output: fakeExtract(data as ExtractInput) };
    case "consolidate":
      return { task, output: fakeConsolidate(data as ConsolidateInput) };
    case "page_tag":
      return { task, output: fakePageTag(data as PageTagInput) };
    case "brief":
      return { task, output: fakeBrief(data as BriefInput) };
    case "draft_score":
      return { task, output: fakeDraftScore(data as DraftScoreInput) };
  }
}

/**
 * A minimal instance of a JSON schema (empty arrays, empty strings, first enum value, null when
 * nullable). Used for schemas the fake doesn't know, so the pipeline still gets parseable output.
 */
export function exampleFromSchema(schema: any): unknown {
  if (!schema || typeof schema !== "object") return null;
  const variants = schema.anyOf ?? schema.oneOf;
  if (Array.isArray(variants)) {
    return variants.some((v: any) => v?.type === "null") ? null : exampleFromSchema(variants[0]);
  }
  if (Array.isArray(schema.enum)) return schema.enum[0];
  const enumInDescription = typeof schema.description === "string" ? schema.description.match(/enum: (\[.*\])/) : null;
  if (enumInDescription) return JSON.parse(enumInDescription[1])[0];
  const type = Array.isArray(schema.type) ? schema.type.find((t: string) => t !== "null") : schema.type;
  if (Array.isArray(schema.type) && schema.type.includes("null")) return null;
  switch (type) {
    case "object":
      return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([k, v]) => [k, exampleFromSchema(v)]));
    case "array":
      return [];
    case "string":
      return "";
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    default:
      return null;
  }
}

// ------------------------------------------------------------------ text helpers

const STOP = new Set([
  "the", "a", "an", "is", "are", "be", "for", "of", "to", "with", "and", "or", "on", "in", "it", "its", "that", "this",
  "as", "by", "at", "from", "most", "more", "than", "you", "your", "their", "they", "them", "can", "has", "have", "which",
  "who", "what", "when", "how", "if", "so", "but", "also", "each", "all", "any", "some", "many", "much", "our", "we", "do",
  "does", "into", "out", "up", "about", "per", "like", "such", "while", "whether", "need", "one", "just", "only",
]);

function wordList(s: string): string[] {
  return (s.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}][\p{L}\p{N}'’$-]*/gu) ?? []).map((w) => w.replace(/[’']s$/, ""));
}

function tokens(s: string): Set<string> {
  return new Set(wordList(s).filter((w) => !STOP.has(w)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Share of a's tokens that appear in b. */
function coverage(a: Set<string>, b: Set<string>): number {
  if (!a.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / a.size;
}

function clean(s: string): string {
  return s
    .replace(/\[\[\d+\]\]\([^)]*\)/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function lowerFirst(s: string): string {
  return s && !/^[A-Z]{2}/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

function withPeriod(s: string): string {
  const t = s.trim().replace(/[,;:]+$/, "");
  return /[.!?]$/.test(t) ? t : t + ".";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pct(x: number): number {
  return Math.round(x * 100);
}

function topicOf(keyword: string): string {
  return keyword.replace(/^(best|top|the best)\s+/i, "").trim() || keyword;
}

const RECOMMEND = /\b(best|top|ideal|great for|recommend(?:ed|s)?|leads?|pick|choice|stands? out)\b/i;
const COMPARE = /\b(than|whereas|compared|versus|vs\.?|unlike|better|cheaper)\b/i;
const CAVEAT = /^(however|but|keep in mind|note|although)\b|\b(depends on|limits?|limited|caps?|check the|before you commit)\b/i;
const STEP = /^(consider|check|compare|look for|choose|start|try|make sure|sign up|create|add|set up|pick)\b/i;
const DEFINITION = /^(?:an?\s+)?[\w\s-]{2,40}?\s(?:is a|is an|are|refers to|means)\s/i;
const CAMEL = /\b[A-Z][a-z]+[A-Z][A-Za-z0-9]+\b/g;
const LIST_HEAD = /^([A-Z][\w.'&+ -]{1,40}?):\s+(.+)$/;

// ------------------------------------------------------------------ A. extract

interface Found {
  name: string;
  start: number;
  end: number;
}

/** Non-overlapping entity mentions in `text`, longest names first ("Tally Forms" before "Tally"). */
function findEntities(text: string, names: string[]): Found[] {
  const sorted = [...new Set(names)].filter((n) => n.length > 1).sort((a, b) => b.length - a.length);
  const taken: Found[] = [];
  for (const name of sorted) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRe(name)})(?=$|[^\\p{L}\\p{N}])`, "giu");
    for (const m of text.matchAll(re)) {
      const start = m.index! + m[1].length;
      const end = start + m[2].length;
      if (taken.some((t) => start < t.end && end > t.start)) continue;
      taken.push({ name: text.slice(start, end), start, end });
    }
  }
  return taken.sort((a, b) => a.start - b.start);
}

function claimType(text: string, kind: string): ClaimType {
  let t: ClaimType = "fact";
  if (kind === "expanded" || STEP.test(text)) t = "step";
  else if (CAVEAT.test(text)) t = "caveat";
  else if (RECOMMEND.test(text)) t = "recommendation";
  else if (COMPARE.test(text)) t = "comparison";
  else if (DEFINITION.test(text)) t = "definition";
  return CLAIM_TYPES.includes(t) ? t : "fact";
}

/** "Jotform: Best overall, ..." -> "Jotform is best overall, ...". */
function fromListHead(text: string): { head: string | null; text: string } {
  const m = text.match(LIST_HEAD);
  if (!m) return { head: null, text };
  const [, head, rest] = m;
  let verb = "";
  if (/^(an?)\s+(solid|good|great|strong|popular)\b/i.test(rest)) verb = "is";
  else if (/^(an?)\s/i.test(rest)) verb = "offers";
  else if (/^(best|ideal|great|known|built|designed|the|completely|perfect|suited)\b/i.test(rest)) verb = "is";
  return { head, text: verb ? `${head} ${verb} ${lowerFirst(rest)}` : `${head}: ${rest}` };
}

/** Splits compound sentences into atomic claims when every part names an entity (or reads as a clause). */
function splitCompound(text: string, names: string[]): string[] {
  const first = text.replace(/[.!?]$/, "").split(/,\s*(?:while|whereas|but)\s+|;\s+/);
  const out: string[] = [];
  for (const part of first) {
    const pieces = part.split(/,?\s+and\s+/);
    const allNamed = pieces.length > 1 && pieces.every((p) => findEntities(p, names).length > 0 && /\b(is|are|leads?|offers?|wins?|suits?)\b/.test(p));
    for (const p of allNamed ? pieces : [part]) out.push(withPeriod(cap(p.trim())));
  }
  return out.filter((p) => wordList(p).length >= 4);
}

function entityLabel(segment: string): string | null {
  const m = segment.match(/\b((?:the\s+)?(?:best|ideal|great|top choice|top pick|solid (?:free )?choice)\b[^,.;:]*)/i);
  if (!m) return null;
  const label = m[1].replace(/^the\s+/i, "").split(/\s(?:that|which|with|thanks|because|since|and|so)\s/i)[0];
  const words = label.trim().split(/\s+/).slice(0, 6).join(" ").toLowerCase();
  return words.length >= 4 ? words : null;
}

export function fakeExtract(input: ExtractInput): ExtractOutput {
  const sentences = (input.sentences ?? []).map((s) => ({ ...s, text: clean(s.text) }));
  const knownNames = input.known_entities.flatMap((e) => [e.name, ...e.aliases]);
  const heads = sentences.filter((s) => s.kind === "list_item").map((s) => s.text.match(LIST_HEAD)?.[1]).filter((h): h is string => !!h && h.split(" ").length <= 4);
  const camel = sentences.flatMap((s) => s.text.match(CAMEL) ?? []);
  const names = [...KNOWN_TOOLS, ...knownNames, ...heads, ...camel];

  // Claims.
  const known = input.known_claims.map((c) => ({ ref: c.ref, tokens: tokens(c.label) }));
  const created: { label: string; tokens: Set<string> }[] = [];
  const claims: ExtractOutput["claims"] = [];
  for (const s of sentences) {
    if (s.kind === "heading" || s.text.endsWith("?") || wordList(s.text).length < 4) continue;
    const { text } = s.kind === "list_item" || s.kind === "expanded" ? fromListHead(s.text) : { text: s.text };
    for (const part of splitCompound(text, names)) {
      const tk = tokens(part);
      let best: { ref: string; score: number } | null = null;
      for (const k of known) {
        const score = jaccard(tk, k.tokens);
        if (score >= 0.6 && (!best || score > best.score)) best = { ref: k.ref, score };
      }
      let newLabel: string | null = null;
      if (!best) {
        const same = created.find((c) => jaccard(tk, c.tokens) >= 0.6);
        newLabel = same ? same.label : part;
        if (!same) created.push({ label: part, tokens: tk });
      }
      claims.push({ sentence: s.i, text: part, type: claimType(part, s.kind), group_ref: best?.ref ?? null, new_label: newLabel });
    }
  }

  // Entities, aggregated over sentences; list heads count as recommendations.
  const byKey = new Map<string, { name: string; recommended: boolean; label: string | null; sentences: Set<number> }>();
  for (const s of sentences) {
    if (s.kind === "heading") continue;
    const found = findEntities(s.text, names);
    const head = s.text.match(LIST_HEAD)?.[1] ?? null;
    found.forEach((f, idx) => {
      const key = f.name.toLowerCase();
      const entry = byKey.get(key) ?? { name: f.name, recommended: false, label: null, sentences: new Set<number>() };
      entry.sentences.add(s.i);
      const isHead = head !== null && head.toLowerCase() === key && f.start === 0;
      const segment = s.text.slice(f.end, found[idx + 1]?.start ?? s.text.length);
      if (isHead || RECOMMEND.test(segment) || (found.length > 1 && RECOMMEND.test(s.text.slice(0, f.start)) && idx === 0)) entry.recommended = true;
      if (isHead && /\b(best|top|ideal|great)\b/i.test(segment)) entry.recommended = true;
      const label = entityLabel(segment);
      if (label && (!entry.label || isHead)) entry.label = label;
      byKey.set(key, entry);
    });
  }
  const refByName = new Map<string, string>();
  for (const e of input.known_entities) for (const n of [e.name, ...e.aliases]) refByName.set(n.toLowerCase(), e.ref);
  const entities: ExtractOutput["entities"] = [...byKey.entries()].map(([key, e]) => ({
    entity_ref: refByName.get(key) ?? null,
    name: e.name,
    role: e.recommended ? "recommended" : "mentioned",
    label: e.label,
    sentences: [...e.sentences].sort((a, b) => a - b),
  }));

  // Format labels from sentence kinds and wording.
  const labels = new Set<FormatLabel>();
  const items = sentences.filter((s) => s.kind === "list_item");
  const headed = items.filter((s) => LIST_HEAD.test(s.text));
  const listHeading = sentences.find((s) => s.kind === "heading" && /\b(top|best)\b/i.test(s.text));
  if (items.length) {
    if (items.some((s) => /^\d+[.)]\s/.test(s.text)) || (headed.length >= 3 && listHeading)) labels.add("ranked_list");
    else labels.add("bullets");
  }
  if (items.filter((s) => /\b(best|ideal|great) for\b|^\S[^:]*:\s*best\b/i.test(s.text)).length >= 2) labels.add("best_for_labels");
  if (sentences.some((s) => s.kind === "table_row")) labels.add("table");
  if (sentences.some((s) => s.kind === "expanded") || claims.filter((c) => c.type === "step").length >= 2) labels.add("steps");
  if (sentences.some((s) => findEntities(s.text, names).length >= 2 && COMPARE.test(s.text))) labels.add("comparison");
  const lead = sentences.find((s) => s.kind === "paragraph") ?? sentences.find((s) => s.kind !== "heading") ?? null;
  if (lead && DEFINITION.test(lead.text) && !RECOMMEND.test(lead.text)) labels.add("definition_first");
  if (sentences.some((s) => s.kind === "heading" && s.text.endsWith("?"))) labels.add("faq");
  if (sentences.some((s) => /\bpros\b.*\bcons\b/i.test(s.text))) labels.add("pros_cons");

  return {
    claims,
    entities,
    format_labels: FORMAT_LABELS.filter((l) => labels.has(l)),
    answer_lead_sentence: lead ? lead.i : null,
  };
}

// ------------------------------------------------------------------ B. consolidate

export function fakeConsolidate(input: ConsolidateInput): ConsolidateOutput {
  const ents = [...input.entities].sort((a, b) => a.name.length - b.name.length || b.renders - a.renders || a.ref.localeCompare(b.ref));
  const base = (n: string) => n.trim().toLowerCase();
  const taken = new Set<string>();
  const entity_merges: ConsolidateOutput["entity_merges"] = [];
  // The shortest name survives and absorbs names it is a word prefix of ("Tally" keeps "Tally Forms").
  for (const root of ents) {
    if (taken.has(root.ref)) continue;
    const rootName = base(root.name);
    const group = ents.filter((e) => !taken.has(e.ref) && (e === root || [e.name, ...e.aliases].some((n) => base(n).startsWith(rootName + " ") || base(n) === rootName)));
    if (group.length < 2) continue;
    const keep = root;
    const merged = group.filter((e) => e !== keep);
    for (const e of group) taken.add(e.ref);
    const aliases = [...new Set(merged.flatMap((e) => [e.name, ...e.aliases]).filter((n) => base(n) !== base(keep.name) && !keep.aliases.some((a) => base(a) === base(n))))];
    entity_merges.push({ keep: keep.ref, merge: merged.map((e) => e.ref), aliases });
  }

  const claims = [...input.claims].sort((a, b) => b.renders - a.renders || a.ref.localeCompare(b.ref));
  const used = new Set<string>();
  const claim_merges: ConsolidateOutput["claim_merges"] = [];
  for (const c of claims) {
    if (used.has(c.ref)) continue;
    const tk = tokens(c.label);
    const same = claims.filter((o) => o !== c && !used.has(o.ref) && jaccard(tk, tokens(o.label)) >= 0.8);
    if (!same.length) continue;
    used.add(c.ref);
    for (const o of same) used.add(o.ref);
    claim_merges.push({ keep: c.ref, merge: same.map((o) => o.ref) });
  }
  return { claim_merges, entity_merges };
}

// ------------------------------------------------------------------ C. page tag

const EVIDENCE_LABEL: Record<string, string> = {
  original_data: "Original data",
  test_result: "Hands-on test results",
  screenshot: "Screenshots",
  quote: "Quotes",
  pricing: "Pricing details",
  spec: "Specifications and limits",
  review: "User ratings and reviews",
  example: "Worked examples",
};

function excerptOf(s: string): string {
  if (s.length <= 200) return s;
  const cut = s.slice(0, 200);
  return cut.slice(0, cut.lastIndexOf(" "));
}

function bodySentences(markdown: string): string[] {
  const out: string[] = [];
  let fence = false;
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) fence = !fence;
    if (fence || !line || line.startsWith("#") || line.startsWith("|") || /^\[[^\]]*\]\([^)]*\)$/.test(line)) continue;
    if (/^by\s/i.test(line) || /^posted by\s/i.test(line)) continue;
    const text = line.replace(/^[-*+]\s+|^\d+[.)]\s+/, "");
    for (const s of text.split(/(?<=[.!?])\s+(?=[A-Z“"])/)) if (s.trim()) out.push(s.trim());
  }
  return out;
}

export function fakePageTag(input: PageTagInput): PageTagOutput {
  const md = input.markdown ?? "";
  const outline = input.outline?.length ? input.outline : [...md.matchAll(/^(#{1,6})\s+(.+)$/gm)].map((m) => ({ level: m[1].length, text: clean(m[2]) }));
  const skip = /^(frequently asked questions|faq|pricing faq|chapters|top comments|transcript highlights|compare plans|features)$/i;
  const topics = [...new Set(
    outline
      .filter((h) => h.level >= 2 && !h.text.trim().endsWith("?") && !skip.test(h.text.trim()) && !/^u\//.test(h.text))
      .map((h) => h.text.replace(/^\d+[.)]\s*/, "").trim()),
  )].slice(0, 12);
  if (!topics.length) {
    const title = outline.find((h) => h.level === 1)?.text;
    if (title) topics.push(title.replace(/\s*[:|].*$/, "").trim());
  }

  const heads = [...md.matchAll(/^[-*]\s+([A-Z][\w.'&+ -]{1,40}?):\s/gm)].map((m) => m[1]).filter((h) => h.split(" ").length <= 3 && !/^(pro|con|pricing|free plan)$/i.test(h));
  const camel = md.match(CAMEL) ?? [];
  const entities = findEntities(md, [...KNOWN_TOOLS, ...heads, ...camel])
    .map((f) => f.name)
    .filter((n, i, all) => all.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i)
    .slice(0, 15);

  const sentences = bodySentences(md);
  const evidence: PageTagOutput["evidence"] = [];
  const add = (kind: PageTagOutput["evidence"][number]["kind"], description: string, s: string) => {
    if (evidence.length >= 8 || evidence.some((e) => e.excerpt === excerptOf(s))) return;
    evidence.push({ kind, description, excerpt: excerptOf(s) });
  };
  for (const s of sentences) {
    if (/\bwe (tested|built|set up|timed|compared)\b|\bin our testing\b/i.test(s)) add("test_result", "Describes a hands-on test the authors ran", s);
    else if (/\$\d/.test(s)) add("pricing", "States prices or plan limits", s);
    else if (/\b\d(\.\d)? out of 5\b|\breviews?\b|\brated?\b/i.test(s)) add("review", "Cites user ratings or reviews", s);
    else if (/[“"][^”"]{8,}[”"]/.test(s)) add("quote", "Quotes a user or expert", s);
    else if (/\b\d[\d,.]*\+?\s?(%|percent|templates|integrations|apps|users|responses|submissions|entries|forms)\b/i.test(s)) add("spec", "Gives concrete numbers or limits", s);
  }
  if (/!\[[^\]]*\]\([^)]+\)/.test(md)) add("screenshot", "Includes screenshots", md.match(/!\[[^\]]*\]\([^)]+\)/)![0]);

  const questions = [...new Set(outline.filter((h) => h.text.trim().endsWith("?")).map((h) => h.text.trim()))].slice(0, 8);
  const kw = [...tokens(input.keyword)].filter((w) => w !== "best" && w !== "top");
  const answer = sentences.find((s) => {
    const st = tokens(s);
    return kw.some((w) => st.has(w) || st.has(w + "s")) && wordList(s).length >= 6;
  }) ?? null;

  const hasTable = /^\|.+\|$/m.test(md);
  const toolSections = outline.filter((h) => h.level >= 2 && entities.some((e) => h.text.includes(e))).length;
  let approach: string;
  if (outline.some((h) => /^u\//.test(h.text))) approach = "Community thread where users share first-hand recommendations and warnings.";
  else if (outline.some((h) => /^chapters$/i.test(h.text))) approach = "Video review that walks through each tool in its own chapter.";
  else if (toolSections >= 3) approach = `Ranked roundup with a section per tool (${toolSections} tools)${hasTable ? " and a comparison table" : ""}${questions.length ? ", closing with an FAQ" : ""}.`;
  else if (/pricing/i.test(outline.map((h) => h.text).join(" "))) approach = "Vendor page that answers with its own product, features and pricing.";
  else approach = `Article that answers the query directly${hasTable ? " with a table" : ""}${questions.length ? " and an FAQ" : ""}.`;

  return { topics, entities, evidence, questions_answered: questions, answer_sentence: answer, approach };
}

// ------------------------------------------------------------------ D. matrix and brief

const FORMAT_PHRASE: Record<string, string> = {
  ranked_list: "a ranked list of options",
  bullets: "short bullet points",
  table: "a comparison table",
  pros_cons: "pros and cons",
  best_for_labels: "a one-line best-for label per option",
  steps: "short how-to-choose steps",
  comparison: "side-by-side comparisons",
  definition_first: "a one-line definition first",
  faq: "an FAQ",
};

type Tags = Partial<PageTagOutput> | null | undefined;

function pageTokens(page: BriefInput["pages"][number]): Set<string> {
  const t = (page.tags ?? null) as Tags;
  const parts = [
    ...(t?.topics ?? []),
    ...(t?.entities ?? []),
    ...(t?.evidence ?? []).flatMap((e) => [e.description, e.excerpt]),
    ...(t?.questions_answered ?? []),
    t?.answer_sentence ?? "",
    t?.approach ?? "",
    ...(page.passages ?? []).map((p) => `${p.passage} ${p.heading ?? ""}`),
  ];
  return tokens(parts.join(" "));
}

function cellState(score: number): "covered" | "partial" | "missing" {
  return score >= 0.6 ? "covered" : score >= 0.3 ? "partial" : "missing";
}

function labelPhrase(label: string | undefined): string {
  if (!label) return "a strong alternative";
  return /^(best|top|ideal)\b/i.test(label) ? `the ${label}` : label;
}

export function fakeBrief(input: BriefInput): BriefOutput {
  const topic = topicOf(input.keyword);
  const pages = input.pages ?? [];
  const pageTk = new Map(pages.map((p) => [p.ref, pageTokens(p)]));
  const claimsByShare = [...input.claims].sort((a, b) => b.share - a.share || a.ref.localeCompare(b.ref));
  const mustClaims = claimsByShare.filter((c) => c.share >= 0.4).slice(0, 8);
  const matrixClaims = mustClaims.length ? mustClaims : claimsByShare.slice(0, 5);
  const ents = [...input.entities].sort((a, b) => b.share - a.share || a.ref.localeCompare(b.ref));
  const keyEnts = ents.filter((e) => e.share >= 0.3).slice(0, 12);

  const topicRows = matrixClaims.map((c) => ({
    topic: c.label,
    claim_refs: [c.ref],
    cells: pages.map((p) => ({ page_ref: p.ref, state: cellState(coverage(tokens(c.label), pageTk.get(p.ref)!)) })),
  }));
  const entityRows = keyEnts.slice(0, 10).map((e) => ({
    entity: e.name,
    entity_ref: e.ref,
    cells: pages.map((p) => {
      const tagged = ((p.tags as Tags)?.entities ?? []).map((n) => n.toLowerCase());
      const n = e.name.toLowerCase();
      const covered = tagged.some((t) => t === n || t.startsWith(n + " ") || n.startsWith(t + " "));
      return { page_ref: p.ref, state: covered ? "covered" as const : coverage(tokens(e.name), pageTk.get(p.ref)!) >= 0.5 ? "partial" as const : "missing" as const };
    }),
  }));

  const common = [
    ...topicRows.filter((r) => r.cells.length && r.cells.every((c) => c.state === "covered")).map((r) => r.topic),
    ...entityRows.filter((r) => r.cells.length && r.cells.every((c) => c.state === "covered")).map((r) => `Names ${r.entity}`),
  ];
  const gaps: BriefOutput["gaps"] = [
    ...input.unsupported_claims.slice(0, 3).map((u) => ({ gap: u.label, why: `Appears in ${pct(u.share)}% of overviews, but no sentence carrying it is cited.`, claim_refs: [u.ref] })),
    ...topicRows.filter((r) => r.cells.length && r.cells.every((c) => c.state === "missing")).map((r) => ({ gap: r.topic, why: "None of the cited pages covers it.", claim_refs: r.claim_refs })),
  ];

  const recommended = [...ents].filter((e) => e.recommended_share > 0).sort((a, b) => b.recommended_share - a.recommended_share || a.ref.localeCompare(b.ref));
  const [e0, e1, e2] = recommended.length ? recommended : ents;
  const answerText = e0
    ? `${e0.name} is the best ${topic} for most people${e1 ? `${e2 ? "," : " and"} ${e1.name} is ${labelPhrase(e1.labels[0])}` : ""}${e2 ? ` and ${e2.name} is ${labelPhrase(e2.labels[0])}` : ""}.`
    : `The best ${topic} depends on your budget, the features you need and the tools you already use.`;
  const wba = pages.map((p) => (p.measures as { words_before_answer?: number | null } | null)?.words_before_answer).filter((x): x is number => typeof x === "number");
  const maxWords = Math.max(20, Math.min(120, Math.round(median(wba) ?? 50)));

  const must_cover = mustClaims.map((c) => ({ topic: c.label, why: `In ${pct(c.share)}% of overviews (${c.bucket}); ${pct(c.cited_share)}% of mentions are cited.`, claim_refs: [c.ref] }));
  const briefEntities = keyEnts.map((e) => ({
    name: e.name,
    entity_ref: e.ref,
    role: e.recommended_share >= e.share / 2 ? "recommended" as const : "mentioned" as const,
    note: `Named in ${pct(e.share)}% of overviews${e.labels[0] ? `, usually as "${e.labels[0]}"` : ""}.`,
  }));

  const formats = [...input.formats].sort((a, b) => b.share - a.share);
  const used = formats.filter((f) => f.share >= 0.3 && FORMAT_PHRASE[f.label]).map((f) => FORMAT_PHRASE[f.label]);
  const tableShare = formats.find((f) => f.label === "table")?.share ?? 0;
  const listy = formats.some((f) => ["ranked_list", "bullets", "best_for_labels"].includes(f.label) && f.share >= 0.3);
  const format = {
    structure: `Answer first in one or two sentences${used.length ? `, then ${used.join(", ")}` : ""}.`,
    table_columns: tableShare > 0 ? ["Option", "Best for", "Free plan", "Starting price"] : [],
    list_items: listy ? Math.max(3, Math.min(7, ents.filter((e) => e.share >= 0.4).length || 5)) : null,
  };

  const evidenceKinds = new Map<string, { description: string; refs: string[] }>();
  for (const p of pages) {
    for (const ev of ((p.tags as Tags)?.evidence ?? [])) {
      const entry = evidenceKinds.get(ev.kind) ?? { description: ev.description, refs: [] };
      if (!entry.refs.includes(p.ref)) entry.refs.push(p.ref);
      evidenceKinds.set(ev.kind, entry);
    }
  }
  const evidence_to_match = [...evidenceKinds.entries()]
    .sort((a, b) => b[1].refs.length - a[1].refs.length)
    .slice(0, 6)
    .map(([kind, v]) => ({ what: `${EVIDENCE_LABEL[kind] ?? kind}: ${lowerFirst(v.description)}`, page_refs: v.refs }));

  const tested = pages.filter((p) => ((p.tags as Tags)?.evidence ?? []).some((e) => e.kind === "test_result"));
  const untested = pages.filter((p) => !tested.includes(p)).map((p) => p.ref);
  const topNames = (recommended.length ? recommended : ents).slice(0, 3);
  const pageQuestions = new Map<string, string[]>();
  for (const p of pages) for (const q of ((p.tags as Tags)?.questions_answered ?? [])) pageQuestions.set(q, [...(pageQuestions.get(q) ?? []), p.ref]);
  const rareQuestion = [...pageQuestions.entries()].sort((a, b) => a[1].length - b[1].length)[0];
  const new_to_cite: BriefOutput["brief"]["new_to_cite"] = [
    ...input.unsupported_claims.slice(0, 2).map((u) => ({
      idea: `Original data that backs up "${u.label}"`,
      why_google_lacks_it: "The overview repeats this claim but cites no page for it.",
      how_to_produce: "original_data" as const,
      evidence_refs: [u.ref],
    })),
  ];
  if (topNames.length) {
    new_to_cite.push({
      idea: `A hands-on test of ${topNames.map((e) => e.name).join(", ")} on the same real task, with timings and screenshots`,
      why_google_lacks_it: `Only ${tested.length} of ${pages.length} cited pages show first-hand test results.`,
      how_to_produce: "first_hand_test",
      evidence_refs: [...topNames.map((e) => e.ref), ...untested.slice(0, 2)],
    });
  }
  if (keyEnts.length >= 2) {
    new_to_cite.push({
      idea: `One table comparing free-plan limits and starting prices for ${Math.min(keyEnts.length, 7)} options`,
      why_google_lacks_it: "Cited pages spread limits and prices across separate sections, so no single source states them side by side.",
      how_to_produce: "useful_table",
      evidence_refs: [...keyEnts.slice(0, 4).map((e) => e.ref), ...pages.slice(0, 1).map((p) => p.ref)],
    });
  }
  if (rareQuestion) {
    new_to_cite.push({
      idea: `A direct, sourced answer to "${rareQuestion[0]}"`,
      why_google_lacks_it: `Only ${rareQuestion[1].length} cited page${rareQuestion[1].length === 1 ? "" : "s"} answer it.`,
      how_to_produce: "unanswered_question",
      evidence_refs: rareQuestion[1].slice(0, 2),
    });
  }

  const questions = [...pageQuestions.keys()].slice(0, 8);
  if (!questions.length) questions.push(`What is the best free ${topic}?`, `How much does a ${topic} cost?`);

  const outline: BriefOutput["brief"]["outline"] = [{ heading: `The best ${topic} at a glance`, level: 2, purpose: "Answer the query in the first two sentences, then summarise the picks.", target_words: maxWords, covers: [] }];
  const coveredTopics = new Set<string>();
  for (const e of topNames.concat(keyEnts.filter((x) => !topNames.includes(x))).slice(0, 6)) {
    const covers = must_cover.filter((m) => !coveredTopics.has(m.topic) && m.topic.toLowerCase().includes(e.name.toLowerCase())).map((m) => m.topic);
    covers.forEach((c) => coveredTopics.add(c));
    outline.push({ heading: `${e.name}${e.labels[0] ? `: ${e.labels[0]}` : ""}`, level: 2, purpose: "Who it suits, what it costs and the evidence behind the recommendation.", target_words: 180, covers });
  }
  if (format.table_columns.length) outline.push({ heading: `${cap(topic)} options compared`, level: 2, purpose: "One table with the columns the overview uses.", target_words: 120, covers: [] });
  const rest = must_cover.map((m) => m.topic).filter((t) => !coveredTopics.has(t));
  outline.push({ heading: `How to choose a ${topic}`, level: 2, purpose: "Decision criteria and caveats the overview repeats.", target_words: 220, covers: rest });
  outline.push({ heading: "Frequently asked questions", level: 2, purpose: "Short answers to the sub-questions the overview keeps answering.", target_words: 200, covers: [] });

  const avoid = [`Background before the answer; cited pages answer within about ${maxWords} words.`];
  for (const label of ["pros_cons", "faq", "definition_first"]) {
    const share = formats.find((f) => f.label === label)?.share ?? 0;
    if (share < 0.1) avoid.push(`${cap(FORMAT_PHRASE[label])}: the overview ${share === 0 ? "never uses" : "rarely uses"} it.`);
  }
  if (input.platform_sources.length) avoid.push(`Treating ${input.platform_sources.map((p) => p.reg_domain).join(", ")} citations as page gaps: those are platform presence, not articles.`);

  const present = input.window.present;
  const summary = `For "${input.keyword}" the overview appeared in ${present} of ${input.window.renders} renders. ` +
    (e0 ? `It keeps recommending ${topNames.map((e) => e.name).join(", ")}` : "It rewards direct answers") +
    (used.length ? ` and favours ${used.slice(0, 2).join(" and ")}.` : ".") +
    (input.unsupported_claims.length ? ` ${input.unsupported_claims.length} recurring claim${input.unsupported_claims.length === 1 ? " has" : "s have"} no cited support.` : "");

  return {
    summary,
    matrix: { topics: topicRows, entities: entityRows },
    common_to_all: common,
    gaps,
    page_notes: pages.map((p) => ({ page_ref: p.ref, does_differently: (p.tags as Tags)?.approach ?? `Cited in ${pct(p.share)}% of overviews.` })),
    brief: {
      answer_first: { text: answerText, max_words: maxWords },
      must_cover,
      entities: briefEntities,
      format,
      evidence_to_match,
      new_to_cite,
      questions,
      outline,
      checklist: [
        "Page is indexable: no noindex, allowed in robots.txt, returns 200",
        "No nosnippet or data-nosnippet around the answer",
        "Main text is in the HTML, not injected by script",
        "Author name and last-updated date are visible",
        "Article schema, plus FAQPage schema for the FAQ",
        "Answer appears in the first paragraph under the H1",
      ],
      avoid,
    },
  };
}

// ------------------------------------------------------------------ E. draft score

function firstParagraph(markdown: string): string {
  for (const block of markdown.split(/\n\s*\n/)) {
    const t = block.trim();
    if (t && !t.startsWith("#")) return clean(t);
  }
  return "";
}

export function fakeDraftScore(input: DraftScoreInput): DraftScoreOutput {
  const brief = (input.brief ?? {}) as Partial<BriefOutput["brief"]>;
  const draft = input.draft_markdown ?? "";
  const dt = tokens(clean(draft));
  const status = (text: string) => {
    const c = coverage(tokens(text), dt);
    return { state: c >= 0.7 ? "covered" as const : c >= 0.35 ? "partial" as const : "missing" as const, c };
  };
  const topics = (brief.must_cover ?? []).map((m) => {
    const s = status(m.topic);
    return { topic: m.topic, status: s.state, note: s.state === "covered" ? "Covered in the draft." : s.state === "partial" ? `Only ${pct(s.c)}% of the point's key terms appear.` : "Not covered." };
  });
  const ideas = (brief.new_to_cite ?? []).map((n) => {
    const s = status(n.idea);
    return { idea: n.idea, status: s.state, note: s.state === "covered" ? "The draft includes this." : s.state === "partial" ? "Touched on, but without the evidence the idea calls for." : "Not in the draft yet." };
  });
  const lead = firstParagraph(draft);
  const leadWords = wordList(lead).length;
  const af = brief.answer_first;
  const leadCov = af ? coverage(tokens(af.text), tokens(lead)) : 0;
  const answerState = af && leadCov >= 0.5 && leadWords <= af.max_words * 1.5 ? "covered" as const : leadCov >= 0.25 ? "partial" as const : "missing" as const;

  const sentences = clean(draft).split(/(?<=[.!?])\s+/).filter((s) => wordList(s).length > 0);
  const avg = sentences.length ? sentences.reduce((a, s) => a + wordList(s).length, 0) / sentences.length : 0;
  const clarity = sentences.length ? Math.max(0, Math.min(10, Math.round(10 - Math.max(0, avg - 18) / 3))) : 0;

  const fixes: string[] = [];
  if (answerState !== "covered" && af) fixes.push(`Open with the answer in under ${af.max_words} words, for example: "${af.text}"`);
  for (const t of topics.filter((x) => x.status === "missing")) fixes.push(`Add a section that covers: ${t.topic}`);
  for (const e of (brief.entities ?? []).filter((e) => !mentionsName(draft, e.name)).slice(0, 4)) fixes.push(`Mention ${e.name} (${e.note.replace(/\.$/, "")}).`);
  for (const t of topics.filter((x) => x.status === "partial")) fixes.push(`Expand the point on: ${t.topic}`);
  for (const n of ideas.filter((x) => x.status === "missing").slice(0, 2)) fixes.push(`Add something new to cite: ${n.idea}`);
  if (clarity < 7) fixes.push(`Shorten sentences; they average ${Math.round(avg)} words.`);

  return {
    topics,
    new_to_cite: ideas,
    answer_first: {
      status: answerState,
      note: answerState === "covered" ? "The draft opens with the answer." : `The first paragraph has ${leadWords} words and ${pct(leadCov)}% of the answer's key terms.`,
    },
    clarity: { score: clarity, note: sentences.length ? `${sentences.length} sentences, ${Math.round(avg)} words on average.` : "The draft is empty." },
    fixes: fixes.slice(0, 10).map((fix, i) => ({ priority: i + 1, fix })),
  };
}

function mentionsName(text: string, name: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name)}($|[^\\p{L}\\p{N}])`, "iu").test(text);
}
