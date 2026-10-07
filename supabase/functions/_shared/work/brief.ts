// Task D batch work: the coverage matrix and brief for each report whose pages are ready.
// Pending: reports.stage = 'brief' and brief_submitted = false. The result goes through brief-render
// (typed refs, code checks, Markdown), then apply_brief moves the report to 'ready' and notifies.
// A request that errored, expired, was truncated, refused or came back invalid is reported by
// throwing and nothing else: release_stuck_work then resubmits the report, and fails it once two
// attempts have failed. Only an invalid request fails the report at once.
import { type BatchItemResult, type BatchRequest, customId, parseCustomId } from "../batch-work.ts";
import { answerBudget, type BriefContext, renderBrief } from "../brief-render.ts";
import { parseStructured, structuredParams } from "../claude.ts";
import { must, serviceClient } from "../db.ts";
import { hostOfUrl, regDomain } from "../normalize.ts";
import { BRIEF_SYSTEM, type BriefPromptInput, briefUser } from "../prompts/brief.ts";
import { BriefOutput } from "../schemas.ts";
import type { PassageLocation, SeriesMetrics } from "../types.ts";
import { chunks, failureMessage, isPermanentError, round3, type ScopedWork, type WorkScope } from "./common.ts";

/** Covers high-effort thinking plus a 10-15k-token output; batch requests have no HTTP timeout. */
export const BRIEF_MAX_TOKENS = 64000;
/** Used for the retry after a result stopped on max_tokens. */
export const BRIEF_MAX_TOKENS_RETRY = 128000;
const MAX_CLAIMS = 60;
const MAX_ENTITIES = 40;
const MAX_PASSAGES = 5;

export interface PageDetail {
  url_key: string;
  ref?: string;
  share?: number;
  passages?: PassageLocation[];
}

/** One report as returned by brief_context (SQL). metrics excludes the daily diffs. */
export interface BriefRow {
  id: string;
  kind: string;
  stage: string;
  tracked_query_id: string;
  series_id: string;
  window_start: string;
  window_end: string;
  renders: number;
  metrics: Omit<SeriesMetrics, "daily"> | null;
  page_urls: string[];
  page_details: PageDetail[];
  keyword: string;
  language: string;
  display_keyword: string;
  own_url_key: string | null;
  /** Aliases of the series' live entities that have any, by entity id. */
  entity_aliases?: Record<string, string[]> | null;
  pages: { url_key: string; url: string; measures: Record<string, unknown> | null; tags: unknown }[];
}

function ownDomain(ownUrlKey: string | null): string | null {
  if (!ownUrlKey) return null;
  const host = ownUrlKey.split("/")[0].split(":")[0];
  return host ? regDomain(host) : null;
}

/** Parsed pages in report order (page_details first, then any other page_urls), with their share. */
function orderedPages(row: BriefRow) {
  const parsed = new Map(row.pages.map((p) => [p.url_key, p]));
  const sourceShare = new Map((row.metrics?.sources ?? []).map((s) => [s.url_key, s.share]));
  const details = new Map<string, PageDetail>();
  for (const d of row.page_details ?? []) if (d?.url_key && !details.has(d.url_key)) details.set(d.url_key, d);
  for (const key of row.page_urls ?? []) if (!details.has(key)) details.set(key, { url_key: key });
  return [...details.values()].flatMap((d) => {
    const page = parsed.get(d.url_key);
    return page ? [{ page, detail: d, share: d.share ?? sourceShare.get(d.url_key) ?? 0 }] : [];
  });
}

/** Winners' median words before the answer; the user's own page doesn't count. */
export function briefAnswerBudget(row: BriefRow): number {
  const own = ownDomain(row.own_url_key);
  return answerBudget(
    orderedPages(row)
      .filter(({ page }) => !own || regDomain(hostOfUrl(page.url)) !== own)
      .map(({ page }) => page.measures?.words_before_answer as number | null | undefined),
  );
}

/** The task D input and its ref map for one report. */
export function briefInput(row: BriefRow): { input: BriefPromptInput; refs: Record<string, string> } {
  const m = row.metrics;
  const refs: Record<string, string> = {};
  const claimRefs = new Map<string, string>();
  const claimRef = (id: string) => {
    let ref = claimRefs.get(id);
    if (!ref) {
      ref = `C${claimRefs.size + 1}`;
      claimRefs.set(id, ref);
      refs[ref] = id;
    }
    return ref;
  };

  const claims = [...(m?.claims ?? [])]
    .sort((a, b) => b.share - a.share || b.renders - a.renders || a.label.localeCompare(b.label))
    .slice(0, MAX_CLAIMS)
    .map((c) => ({ ref: claimRef(c.group_id), label: c.label, share: round3(c.share), bucket: c.bucket, cited_share: round3(c.cited_share) }));
  const unsupported_claims = (m?.unsupported_claims ?? [])
    .map((u) => ({ ref: claimRef(u.group_id), label: u.label, share: round3(u.share) }));

  const entities = [...(m?.entities ?? [])]
    .sort((a, b) => b.share - a.share || b.renders - a.renders || a.name.localeCompare(b.name))
    .slice(0, MAX_ENTITIES)
    .map((e, i) => {
      refs[`E${i + 1}`] = e.entity_id;
      return { ref: `E${i + 1}`, name: e.name, share: round3(e.share), recommended_share: round3(e.recommended_share), labels: e.labels ?? [] };
    });

  const domainShare = new Map((m?.domains ?? []).map((d) => [d.reg_domain, d.share]));
  const platform = new Map<string, number>();
  for (const s of m?.sources ?? []) {
    if (!s.platform) continue;
    platform.set(s.reg_domain, Math.max(platform.get(s.reg_domain) ?? 0, domainShare.get(s.reg_domain) ?? s.share));
  }
  const platform_sources = [...platform].sort((a, b) => b[1] - a[1]).map(([reg_domain, share]) => ({ reg_domain, share: round3(share) }));

  const pages = orderedPages(row).map(({ page, detail, share }, i) => {
    refs[`P${i + 1}`] = page.url_key;
    return {
      ref: `P${i + 1}`,
      url: page.url,
      share: round3(share),
      measures: page.measures,
      tags: page.tags,
      passages: (detail.passages ?? [])
        .filter((p) => p?.passage)
        .slice(0, MAX_PASSAGES)
        .map((p) => ({ passage: p.passage.slice(0, 600), heading: p.heading ?? null, position: p.position ?? null })),
    };
  });

  return {
    refs,
    input: {
      keyword: row.keyword,
      language: row.language,
      own_domain: ownDomain(row.own_url_key),
      window: { from: row.window_start, to: row.window_end, renders: m?.renders ?? row.renders, present: m?.present ?? 0 },
      claims,
      entities,
      formats: (m?.formats ?? []).map((f) => ({ label: f.label, share: round3(f.share) })),
      median_word_count: m?.median_word_count ?? null,
      unsupported_claims,
      platform_sources,
      pages,
      answer_word_budget: briefAnswerBudget(row),
    },
  };
}

/** Facts the code checks and the Markdown need, from the report's stored metrics. */
export function briefContext(row: BriefRow, refs: Record<string, string>, survivors: Record<string, string>): BriefContext {
  const m = row.metrics;
  return {
    displayKeyword: row.display_keyword,
    reportKind: row.kind,
    window: { from: row.window_start, to: row.window_end },
    renders: m?.renders ?? row.renders,
    present: m?.present ?? 0,
    refs,
    claims: Object.fromEntries((m?.claims ?? []).map((c) => [c.group_id, { label: c.label, share: c.share, renders: c.renders }])),
    entities: Object.fromEntries((m?.entities ?? []).map((e) => [
      e.entity_id,
      { name: e.name, share: e.share, renders: e.renders, aliases: row.entity_aliases?.[e.entity_id] ?? [] },
    ])),
    pages: Object.fromEntries(row.pages.map((p) => [p.url_key, { url: p.url }])),
    survivors,
    answerBudget: briefAnswerBudget(row),
  };
}

/** Claim groups and entities among the refs that were merged since submission: id -> survivor. */
async function loadSurvivors(refs: Record<string, string>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const ids = (prefix: string) => Object.entries(refs).filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
  for (const [table, list] of [["claim_groups", ids("C")], ["entities", ids("E")]] as const) {
    for (const part of chunks(list, 100)) {
      const rows = must(
        await serviceClient().from(table).select("id, merged_into").in("id", part).not("merged_into", "is", null),
        `load ${table} survivors`,
      ) as { id: string; merged_into: string }[];
      for (const r of rows) out[r.id] = r.merged_into;
    }
  }
  return out;
}

async function failBrief(reportId: string, error: string): Promise<void> {
  must(
    await serviceClient().from("reports").update({ stage: "failed", error, updated_at: new Date().toISOString() })
      .eq("id", reportId).eq("stage", "brief"),
    "mark brief failed",
  );
}

async function loadRow(reportId: string): Promise<BriefRow | null> {
  return must(await serviceClient().rpc("brief_context", { p_report_id: reportId }), "brief_context") as BriefRow | null;
}

/** Reports among `ids` whose earlier brief request stopped on max_tokens; they get the higher ceiling. */
async function truncatedBefore(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const part of chunks(ids, 100)) {
    const rows = must(
      await serviceClient().from("batch_items").select("target_id, error").eq("kind", "brief").eq("status", "failed").in("target_id", part),
      "load failed brief items",
    ) as { target_id: string; error: string | null }[];
    for (const r of rows) if (r.error?.includes("max_tokens")) out.add(r.target_id);
  }
  return out;
}

export const briefWork: ScopedWork = {
  kind: "brief",

  async collect(limit: number, scope?: WorkScope): Promise<BatchRequest[]> {
    const rows = must(
      await serviceClient().rpc("brief_pending", { p_limit: limit, p_series_ids: scope?.seriesIds ?? null }),
      "brief_pending",
    ) as BriefRow[];
    const truncated = rows.length ? await truncatedBefore(rows.map((r) => r.id)) : new Set<string>();
    return rows.map((row) => {
      const { input, refs } = briefInput(row);
      return {
        custom_id: customId("brief", row.id),
        target_id: row.id,
        refs,
        params: structuredParams({
          task: "brief",
          system: BRIEF_SYSTEM,
          user: briefUser(input),
          schema: BriefOutput,
          maxTokens: truncated.has(row.id) ? BRIEF_MAX_TOKENS_RETRY : BRIEF_MAX_TOKENS,
        }),
      };
    });
  },

  async markSubmitted(customIds: string[]): Promise<void> {
    const ids = customIds.map((c) => parseCustomId(c).id);
    for (const part of chunks(ids, 150)) {
      must(
        await serviceClient().from("reports").update({ brief_submitted: true, updated_at: new Date().toISOString() })
          .in("id", part).eq("stage", "brief"),
        "mark brief submitted",
      );
    }
  },

  async handleResult(cid: string, result: BatchItemResult, refs: Record<string, string>): Promise<void> {
    const { id } = parseCustomId(cid);
    if (result.type !== "succeeded") {
      const message = failureMessage(result);
      if (isPermanentError(result)) await failBrief(id, message);
      throw new Error(message);
    }
    // A refusal, a max_tokens stop or invalid output is retried like an errored request.
    const output = parseStructured(result.message, BriefOutput);
    const row = await loadRow(id);
    if (!row) throw new Error(`report ${id} not found`);
    if (row.stage !== "brief") return; // already applied
    const rendered = renderBrief(output, briefContext(row, refs ?? {}, await loadSurvivors(refs ?? {})));
    const b = rendered.analysis.brief;
    const body = `${b.must_cover.length} must-cover topics, ${b.entities.length} entities to name and an outline of ` +
      `${b.outline.length} sections${rendered.checks.passed ? "" : "; some items were removed by the checks"}.`;
    must(
      await serviceClient().rpc("apply_brief", {
        p_report_id: id,
        p_analysis: rendered.analysis,
        p_markdown: rendered.markdown,
        p_checks: rendered.checks,
        p_body: body,
      }),
      "apply_brief",
    );
  },
};
