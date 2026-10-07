// Brief post-processing, pure (no database): replaces the prompt's short refs (C<n>, E<n>, P<n>) with
// typed refs (claim:<uuid>, entity:<uuid>, page:<url_key>), runs the code checks from PLAN.md
// section 5, drops the items that fail them, and renders the brief as a Markdown document.
import type { BriefOutput } from "./schemas.ts";

export const MUST_COVER_MIN_SHARE = 0.4;
export const ENTITY_MIN_RENDERS = 2;
export const DEFAULT_ANSWER_BUDGET = 60;

/** Metrics for one claim group at the report's window end (from SeriesMetrics.claims). */
export interface ClaimFact {
  label: string;
  share: number;
  renders: number;
}

/** Metrics for one entity at the report's window end (from SeriesMetrics.entities). */
export interface EntityFact {
  name: string;
  share: number;
  renders: number;
  /** Other names the entity goes by; an entity_ref is accepted only for a name it covers. */
  aliases?: string[];
}

export interface BriefContext {
  displayKeyword: string;
  reportKind: string; // preliminary | full | refresh
  window: { from: string; to: string };
  renders: number; // non-error renders in the window
  present: number; // renders with an AI Overview
  /** The ref map sent with the prompt: C<n> -> group id, E<n> -> entity id, P<n> -> url_key. */
  refs: Record<string, string>;
  claims: Record<string, ClaimFact>; // by group id
  entities: Record<string, EntityFact>; // by entity id
  pages: Record<string, { url: string }>; // by url_key
  /** Claim groups and entities merged since the prompt was built: old id -> live id. */
  survivors?: Record<string, string>;
  /** Words before the answer, computed in code; overrides Claude's answer_first.max_words. */
  answerBudget: number;
}

export interface BriefCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface BriefChecks {
  passed: boolean;
  checks: BriefCheck[];
  dropped_refs: string[];
}

export interface RenderedBrief {
  analysis: BriefOutput;
  markdown: string;
  checks: BriefChecks;
}

type RefKind = "claim" | "entity" | "page";
const REF_KINDS: Record<string, RefKind> = { C: "claim", E: "entity", P: "page" };

/** Median of the known values, rounded; DEFAULT_ANSWER_BUDGET when there are none. */
export function answerBudget(values: (number | null | undefined)[]): number {
  const v = values.filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  if (!v.length) return DEFAULT_ANSWER_BUDGET;
  const mid = Math.floor(v.length / 2);
  return Math.round(v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2);
}

/** Metrics keyed by typed ref. When merges map several ids to one survivor, the larger figure wins. */
function factMaps(ctx: BriefContext) {
  const live = (id: string) => ctx.survivors?.[id] ?? id;
  const claims = new Map<string, ClaimFact>();
  for (const [id, f] of Object.entries(ctx.claims)) {
    const t = `claim:${live(id)}`;
    const prev = claims.get(t);
    if (!prev || f.share > prev.share) claims.set(t, f);
  }
  const entities = new Map<string, EntityFact>();
  for (const [id, f] of Object.entries(ctx.entities)) {
    const t = `entity:${live(id)}`;
    const prev = entities.get(t);
    if (!prev || f.renders > prev.renders) entities.set(t, f);
  }
  const pages = new Map<string, { url: string }>();
  for (const [key, p] of Object.entries(ctx.pages)) pages.set(`page:${key}`, p);
  return { claims, entities, pages, live };
}

class Resolver {
  readonly dropped = new Set<string>();
  constructor(private readonly ctx: BriefContext, private readonly live: (id: string) => string) {}

  /** Typed ref for a short ref of the wanted kind, or null (recorded as dropped). */
  one(raw: string | null | undefined, want?: RefKind): string | null {
    const text = String(raw ?? "").trim();
    if (!text) return null;
    const ref = text.toUpperCase();
    const m = /^([CEP])(\d+)$/.exec(ref);
    const kind = m ? REF_KINDS[m[1]] : undefined;
    const id = m ? this.ctx.refs[ref] : undefined;
    if (!kind || !id || (want && kind !== want)) {
      this.dropped.add(text);
      return null;
    }
    return kind === "page" ? `page:${id}` : `${kind}:${this.live(id)}`;
  }

  list(raws: string[], want?: RefKind): string[] {
    const out: string[] = [];
    for (const raw of raws ?? []) {
      const t = this.one(raw, want);
      if (t && !out.includes(t)) out.push(t);
    }
    return out;
  }
}

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Resolves refs, runs the code checks, drops failing items and renders Markdown. */
export function renderBrief(output: BriefOutput, ctx: BriefContext): RenderedBrief {
  const facts = factMaps(ctx);
  const r = new Resolver(ctx, facts.live);
  const o: BriefOutput = structuredClone(output);

  const cells = <C extends { page_ref: string }>(list: C[]): C[] =>
    list.flatMap((c) => {
      const p = r.one(c.page_ref, "page");
      return p ? [{ ...c, page_ref: p }] : [];
    });

  // Entities by name, and by ref only when the ref stands for the entity the model named: with
  // dozens of opaque refs a mix-up would otherwise print one entity's figures under another's name.
  const byName = new Map<string, string>();
  for (const [t, f] of facts.entities) {
    for (const n of [f.name, ...(f.aliases ?? [])]) if (!byName.has(norm(n))) byName.set(norm(n), t);
  }
  const entityRef = (raw: string | null, name: string): string | null => {
    const typed = raw ? r.one(raw, "entity") : null;
    if (!typed) return null;
    const fact = facts.entities.get(typed);
    if (!fact) return typed;
    const n = norm(name);
    if (norm(fact.name) === n || (fact.aliases ?? []).some((a) => norm(a) === n)) return typed;
    r.dropped.add(String(raw).trim());
    return null;
  };
  const entityFor = (raw: string | null, name: string): string | null => entityRef(raw, name) ?? byName.get(norm(name)) ?? null;

  o.matrix.topics = o.matrix.topics.map((t) => ({ ...t, claim_refs: r.list(t.claim_refs, "claim"), cells: cells(t.cells) }));
  o.matrix.entities = o.matrix.entities.map((e) => ({ ...e, entity_ref: entityFor(e.entity_ref, e.entity), cells: cells(e.cells) }));
  o.gaps = o.gaps.map((g) => ({ ...g, claim_refs: r.list(g.claim_refs, "claim") }));
  o.page_notes = o.page_notes.flatMap((n) => {
    const p = r.one(n.page_ref, "page");
    return p ? [{ ...n, page_ref: p }] : [];
  });

  const b = o.brief;
  b.answer_first = { ...b.answer_first, max_words: ctx.answerBudget };
  b.evidence_to_match = b.evidence_to_match.map((e) => ({ ...e, page_refs: r.list(e.page_refs, "page") }));
  b.new_to_cite = b.new_to_cite.map((n) => ({ ...n, evidence_refs: r.list(n.evidence_refs) }));

  // Check 1: every must-cover topic maps to a claim in at least 40% of overviews.
  const mustKept: BriefOutput["brief"]["must_cover"] = [];
  const mustDropped: string[] = [];
  for (const item of b.must_cover) {
    const refs = r.list(item.claim_refs, "claim");
    const shares = refs.map((t) => facts.claims.get(t)?.share).filter((s): s is number => typeof s === "number");
    const best = shares.length ? Math.max(...shares) : null;
    if (best !== null && best >= MUST_COVER_MIN_SHARE) mustKept.push({ ...item, claim_refs: refs });
    else mustDropped.push(`${item.topic} (${best === null ? "no known claim" : `best claim in ${pct(best)}`})`);
  }
  b.must_cover = mustKept;

  // Check 2: every entity appears in at least 2 renders. An entity without a usable ref is matched by name.
  const entKept: BriefOutput["brief"]["entities"] = [];
  const entDropped: string[] = [];
  for (const e of b.entities) {
    const typed = entityFor(e.entity_ref, e.name);
    const fact = typed ? facts.entities.get(typed) : undefined;
    if (typed && fact && fact.renders >= ENTITY_MIN_RENDERS) entKept.push({ ...e, entity_ref: typed });
    else entDropped.push(`${e.name} (${fact ? `${fact.renders} render${fact.renders === 1 ? "" : "s"}` : "not in the data"})`);
  }
  b.entities = entKept;

  // Check 3: the outline covers every must-cover topic that survived check 1.
  const covered = new Set(b.outline.flatMap((s) => s.covers.map(norm)));
  const uncovered = b.must_cover.filter((m) => !covered.has(norm(m.topic))).map((m) => m.topic);

  const dropped = [...r.dropped].sort();
  const checks: BriefCheck[] = [
    {
      name: "must_cover_recurrence",
      passed: mustDropped.length === 0,
      detail: mustDropped.length
        ? `Dropped ${mustDropped.length} of ${mustDropped.length + mustKept.length} must-cover topics without a claim in at least ${pct(MUST_COVER_MIN_SHARE)} of AI Overviews: ${mustDropped.join("; ")}.`
        : `All ${mustKept.length} must-cover topics rest on a claim in at least ${pct(MUST_COVER_MIN_SHARE)} of AI Overviews.`,
    },
    {
      name: "entity_recurrence",
      passed: entDropped.length === 0,
      detail: entDropped.length
        ? `Dropped ${entDropped.length} of ${entDropped.length + entKept.length} entities seen in fewer than ${ENTITY_MIN_RENDERS} renders: ${entDropped.join("; ")}.`
        : `All ${entKept.length} entities appear in at least ${ENTITY_MIN_RENDERS} renders.`,
    },
    {
      name: "outline_covers_must_cover",
      passed: uncovered.length === 0,
      detail: uncovered.length
        ? `No outline section covers: ${uncovered.join("; ")}.`
        : `The outline covers all ${b.must_cover.length} must-cover topics.`,
    },
    {
      name: "refs_resolve",
      passed: dropped.length === 0,
      detail: dropped.length ? `Dropped refs that match nothing in the data: ${dropped.join(", ")}.` : "Every ref resolves to a claim, entity or page.",
    },
  ];

  return {
    analysis: o,
    markdown: briefMarkdown(o, ctx),
    checks: { passed: checks.every((c) => c.passed), checks, dropped_refs: dropped },
  };
}

// ------------------------------------------------------------------ Markdown

const KIND_TITLES: Record<string, string> = {
  preliminary: "Preliminary report",
  full: "Full report",
  refresh: "28-day refresh",
};

const HOW_TO: Record<string, string> = {
  original_data: "Original data",
  first_hand_test: "First-hand test",
  new_statistics: "New statistics",
  better_comparison: "Better comparison",
  useful_table: "Useful table",
  unanswered_question: "Answer a question no page answers",
  better_examples: "Better examples",
};

/** One line of plain text, safe inside Markdown emphasis and free of raw HTML. */
function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/\s+/g, " ").trim().replace(/([\\*`])/g, "\\$1").replace(/</g, "&lt;");
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** A URL usable as a Markdown link target: no spaces or parentheses. */
function linkTarget(url: string): string {
  return url.replace(/\s/g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

const num = (n: number) => n.toLocaleString("en-US");

/** The brief as a document a writer can work from. Expects an analysis with typed refs. */
export function briefMarkdown(a: BriefOutput, ctx: BriefContext): string {
  const facts = factMaps(ctx);
  const b = a.brief;
  const out: string[] = [];
  const line = (s = "") => out.push(s);
  const share = (f: { share: number; renders: number } | undefined) =>
    f ? `in ${pct(f.share)} of AI Overviews (${num(f.renders)} of ${num(ctx.present)})` : "";

  const from = Date.parse(ctx.window.from);
  const to = Date.parse(ctx.window.to);
  const days = Number.isFinite(from) && Number.isFinite(to) ? Math.max(1, Math.round((to - from) / 86_400_000)) : null;
  line(`# Brief: ${esc(ctx.displayKeyword)}`);
  line();
  line(
    `${KIND_TITLES[ctx.reportKind] ?? "Report"} · ${days ? `${days} day${days === 1 ? "" : "s"} to ` : ""}${ctx.window.to.slice(0, 10)} · ` +
      `${num(ctx.renders)} renders, ${num(ctx.present)} with an AI Overview`,
  );
  line();
  if (a.summary.trim()) {
    line(esc(a.summary));
    line();
  }

  line("## Answer first");
  line();
  if (b.answer_first.text.trim()) line(`> ${esc(b.answer_first.text)}`);
  line();
  line(`Give the direct answer within the first ${num(b.answer_first.max_words)} words of the page.`);
  line();

  if (b.must_cover.length) {
    line("## Must cover");
    line();
    for (const m of b.must_cover) {
      const best = m.claim_refs.map((t) => facts.claims.get(t)).filter((f): f is ClaimFact => !!f)
        .sort((x, y) => y.share - x.share)[0];
      line(`- **${esc(m.topic)}**${best ? ` ${share(best)}` : ""}.${m.why.trim() ? ` ${esc(m.why)}` : ""}`);
    }
    line();
  }

  if (b.entities.length) {
    line("## Entities to name");
    line();
    for (const e of b.entities) {
      const f = e.entity_ref ? facts.entities.get(e.entity_ref) : undefined;
      line(`- **${esc(e.name)}** (${e.role})${f ? ` ${share(f)}` : ""}.${e.note.trim() ? ` ${esc(e.note)}` : ""}`);
    }
    line();
  }

  line("## Format");
  line();
  if (b.format.structure.trim()) line(`- Structure: ${esc(b.format.structure)}`);
  if (b.format.table_columns.length) line(`- Table columns: ${b.format.table_columns.map(esc).join(" · ")}`);
  if (b.format.list_items !== null) line(`- Main list: ${num(b.format.list_items)} items`);
  line();

  if (b.outline.length) {
    line("## Outline");
    line();
    const base = Math.min(...b.outline.map((s) => s.level));
    for (const s of b.outline) {
      const indent = "  ".repeat(Math.max(0, Math.min(5, s.level - base)));
      const covers = s.covers.length ? ` Covers: ${s.covers.map(esc).join("; ")}.` : "";
      line(`${indent}- **${esc(s.heading)}** (H${s.level}, about ${num(s.target_words)} words): ${esc(s.purpose)}${covers}`);
    }
    line();
  }

  if (b.evidence_to_match.length) {
    line("## Evidence to match");
    line();
    for (const e of b.evidence_to_match) {
      const seen = e.page_refs.map((t) => facts.pages.get(t)).filter((p): p is { url: string } => !!p)
        .map((p) => `[${esc(hostLabel(p.url))}](${linkTarget(p.url)})`);
      line(`- ${esc(e.what)}${seen.length ? ` Seen on: ${seen.join(", ")}.` : ""}`);
    }
    line();
  }

  if (b.new_to_cite.length) {
    line("## New to cite");
    line();
    b.new_to_cite.forEach((n, i) => {
      line(`${i + 1}. **${esc(n.idea)}**`);
      line(`   - Why Google lacks it: ${esc(n.why_google_lacks_it)}`);
      line(`   - How to produce: ${HOW_TO[n.how_to_produce] ?? esc(n.how_to_produce)}`);
    });
    line();
  }

  const bullets = (title: string, items: string[], prefix = "- ") => {
    const list = items.map((x) => x.trim()).filter(Boolean);
    if (!list.length) return;
    line(`## ${title}`);
    line();
    for (const x of list) line(`${prefix}${esc(x)}`);
    line();
  };
  bullets("Questions to answer", b.questions);
  bullets("Publishing checklist", b.checklist, "- [ ] ");
  bullets("Avoid", b.avoid);

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
