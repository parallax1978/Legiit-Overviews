import { assertEquals, assertStringIncludes } from "@std/assert";
import { customId } from "../batch-work.ts";
import { collectAll, submitAll } from "../batches.ts";
import type { BriefChecks } from "../brief-render.ts";
import { must, serviceClient } from "../db.ts";
import type { BriefPromptInput } from "../prompts/brief.ts";
import type { BriefOutput } from "../schemas.ts";
import type { SeriesMetrics } from "../types.ts";
import { BRIEF_MAX_TOKENS, BRIEF_MAX_TOKENS_RETRY, briefWork } from "./brief.ts";
import { cleanup, seedSeries, seedUser, stubAnthropic, TEST_PREFIX } from "./test-helpers.ts";

const db = () => serviceClient();
const opts = { sanitizeOps: false, sanitizeResources: false };

async function insert<T>(table: string, row: Record<string, unknown>): Promise<T> {
  return must(await db().from(table).insert(row).select("*").single(), `insert ${table}`) as T;
}

function respond(input: BriefPromptInput): BriefOutput {
  const c = (label: string) => input.claims.find((x) => x.label === label)!.ref;
  const e = (name: string) => input.entities.find((x) => x.name === name)!.ref;
  const [p1, p2] = input.pages.map((p) => p.ref);
  return {
    summary: "Lead with Jotform; name Tally as the free pick.",
    matrix: {
      topics: [{ topic: "Best overall", claim_refs: [c("Jotform is the best form builder.")], cells: [{ page_ref: p1, state: "covered" }, { page_ref: "P9", state: "missing" }] }],
      entities: [{ entity: "Jotform", entity_ref: e("Jotform"), cells: [{ page_ref: p2, state: "partial" }] }],
    },
    common_to_all: ["Ranked list"],
    gaps: [{ gap: "Hands-on tests", why: "None shown.", claim_refs: [] }],
    page_notes: [{ page_ref: p1, does_differently: "Vendor list." }],
    brief: {
      answer_first: { text: "Jotform is the best form builder for most teams.", max_words: 500 },
      must_cover: [
        { topic: "Best overall pick", why: "Most overviews.", claim_refs: [c("Jotform is the best form builder.")] },
        { topic: "Survey tools", why: "Some overviews.", claim_refs: [c("Typeform suits surveys.")] },
        { topic: "Invented", why: "No such claim.", claim_refs: ["C99"] },
      ],
      entities: [
        { name: "Jotform", entity_ref: e("Jotform"), role: "recommended", note: "Top pick." },
        { name: "Formstack", entity_ref: e("Formstack"), role: "mentioned", note: "Rare." },
      ],
      format: { structure: "Ranked list", table_columns: ["Tool", "Price"], list_items: 5 },
      evidence_to_match: [{ what: "Pricing tables", page_refs: [p1, p2] }],
      new_to_cite: [{ idea: "Timed build test", why_google_lacks_it: "No page measures it.", how_to_produce: "first_hand_test", evidence_refs: [p1] }],
      questions: ["Which form builder is best?"],
      outline: [{ heading: "Best form builders", level: 1, purpose: "Answer.", target_words: 150, covers: ["Best overall pick"] }],
      checklist: ["Indexable"],
      avoid: ["History of forms"],
    },
  };
}

Deno.test({
  name: "brief: a report at stage 'brief' gets typed refs, checks, Markdown, stage 'ready' and a notification",
  ...opts,
  async fn() {
    const stub = stubAnthropic();
    stub.reset();
    const inputs: BriefPromptInput[] = [];
    stub.responder = (_cid, data: BriefPromptInput) => {
      inputs.push(data);
      return { type: "succeeded", output: respond(data) };
    };
    const seriesId = await seedSeries("brief");
    const userId = await seedUser();
    const tag = crypto.randomUUID().slice(0, 8);
    const host = `${TEST_PREFIX}-${tag}.example`;
    const keys = [`${host}/a`, `${host}/b`, `${host}/unparsed`, `own-${host}/mine`];
    const batchIds: string[] = [];
    try {
      const g1 = await insert<{ id: string }>("claim_groups", { series_id: seriesId, label: "Jotform is the best form builder." });
      const g2 = await insert<{ id: string }>("claim_groups", { series_id: seriesId, label: "Typeform suits surveys." });
      const e1 = await insert<{ id: string }>("entities", { series_id: seriesId, name: "Jotform" });
      const e2 = await insert<{ id: string }>("entities", { series_id: seriesId, name: "Formstack" });
      const page = (key: string, words: number | null, status = "ok") => ({
        url_key: key,
        url: `https://${key}`,
        reg_domain: key.split("/")[0],
        parse_status: status,
        parsed_at: new Date().toISOString(),
        markdown: "# Page",
        measures: { word_count: 1500, words_before_answer: words },
        tags: { topics: ["Best overall"], entities: ["Jotform"], evidence: [], questions_answered: [], answer_sentence: null, approach: "List." },
        tag_status: "done",
      });
      must(await db().from("pages").insert([page(keys[0], 40), page(keys[1], 60), page(keys[2], null, "pending"), page(keys[3], 500)]), "pages");
      const tq = await insert<{ id: string }>("tracked_queries", {
        user_id: userId,
        series_id: seriesId,
        display_keyword: "Best Form Builder",
        own_url: `https://${keys[3]}`,
        own_url_key: keys[3],
      });
      const metrics: Partial<SeriesMetrics> = {
        window: { from: "2026-09-30T00:00:00Z", to: "2026-10-07T00:00:00Z" },
        renders: 56,
        present: 48,
        errors: 0,
        median_word_count: 180,
        claims: [
          { group_id: g1.id, label: "Jotform is the best form builder.", renders: 36, share: 0.75, bucket: "recurring", first_seen: "", last_seen: "", cited_share: 0.9, types: ["recommendation"] },
          { group_id: g2.id, label: "Typeform suits surveys.", renders: 10, share: 0.208, bucket: "rotating", first_seen: "", last_seen: "", cited_share: 0, types: ["fact"] },
        ],
        entities: [
          { entity_id: e1.id, name: "Jotform", renders: 39, share: 0.81, recommended_renders: 30, recommended_share: 0.62, labels: ["best overall"], bucket: "core" },
          { entity_id: e2.id, name: "Formstack", renders: 1, share: 0.02, recommended_renders: 0, recommended_share: 0, labels: [], bucket: "rotating" },
        ],
        sources: [
          { url_key: keys[0], url: `https://${keys[0]}`, reg_domain: host, title: null, renders: 40, share: 0.83, bucket: "core", platform: false, organic_top10_share: 1 },
          { url_key: "youtube.com/watch?v=1", url: "https://youtube.com/watch?v=1", reg_domain: "youtube.com", title: null, renders: 10, share: 0.2, bucket: "rotating", platform: true, organic_top10_share: 0 },
          { url_key: "youtube.com/watch?v=2", url: "https://youtube.com/watch?v=2", reg_domain: "youtube.com", title: null, renders: 5, share: 0.1, bucket: "rotating", platform: true, organic_top10_share: 0 },
        ],
        domains: [{ reg_domain: "youtube.com", renders: 14, share: 0.29, bucket: "rotating", platform: true }],
        formats: [{ label: "ranked_list", renders: 40, share: 0.83 }],
        unsupported_claims: [{ group_id: g2.id, label: "Typeform suits surveys.", share: 0.208 }],
        daily: [],
      };
      const report = await insert<{ id: string }>("reports", {
        tracked_query_id: tq.id,
        series_id: seriesId,
        kind: "full",
        window_start: "2026-09-30T00:00:00Z",
        window_end: "2026-10-07T00:00:00Z",
        renders: 56,
        metrics,
        page_urls: keys,
        page_details: [
          { url_key: keys[0], ref: "P1", share: 0.83, passages: [{ url_key: keys[0], passage: "Jotform is the best.", found: true, heading: "Top pick", position: 0.1, match_score: 1 }] },
          { url_key: keys[2], ref: "P2", share: 0.5, passages: [] },
          { url_key: keys[1], ref: "P3", share: 0.4, passages: [] },
        ],
        stage: "brief",
      });

      const sub = await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["brief"] });
      assertEquals(sub.errors, []);
      assertEquals(sub.counts.brief, 1);
      batchIds.push(...sub.batches.map((b) => b.id));
      const submitted = must(await db().from("reports").select("brief_submitted, stage").eq("id", report.id).single(), "r") as { brief_submitted: boolean };
      assertEquals(submitted.brief_submitted, true);
      assertEquals((await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["brief"] })).counts.brief, 0);
      // The refs are kept while the item is in flight; they are cleared once it is applied.
      const refs = (must(await db().from("batch_items").select("refs").eq("batch_id", batchIds[0]).single(), "refs") as { refs: Record<string, string> }).refs;

      const col = await collectAll({ batchIds });
      assertEquals(col.batches[0].applied, 1, JSON.stringify(col));

      const input = inputs[0];
      assertEquals(input.pages.map((p) => p.url), [`https://${keys[0]}`, `https://${keys[1]}`, `https://${keys[3]}`]);
      assertEquals(input.pages[0].passages, [{ passage: "Jotform is the best.", heading: "Top pick", position: 0.1 }]);
      assertEquals(input.answer_word_budget, 50); // median of 40 and 60; the own page doesn't count
      assertEquals(input.own_domain, `own-${host}`);
      assertEquals(input.platform_sources, [{ reg_domain: "youtube.com", share: 0.29 }]);
      assertEquals(input.unsupported_claims.map((u) => u.ref), [input.claims[1].ref]);

      const r = must(
        await db().from("reports").select("stage, analysis, brief_markdown, brief_checks, error").eq("id", report.id).single(),
        "report",
      ) as { stage: string; analysis: BriefOutput; brief_markdown: string; brief_checks: BriefChecks };
      assertEquals(r.stage, "ready");
      assertEquals(r.analysis.brief.must_cover.map((m) => [m.topic, m.claim_refs]), [["Best overall pick", [`claim:${g1.id}`]]]);
      assertEquals(r.analysis.brief.entities.map((x) => x.entity_ref), [`entity:${e1.id}`]);
      assertEquals(r.analysis.brief.answer_first.max_words, 50);
      assertEquals(r.analysis.matrix.topics[0].cells, [{ page_ref: `page:${keys[0]}`, state: "covered" }]);
      assertEquals(r.brief_checks.dropped_refs, ["C99", "P9"]);
      assertEquals(r.brief_checks.passed, false);
      assertEquals(r.brief_checks.checks.find((c) => c.name === "outline_covers_must_cover")?.passed, true);
      assertStringIncludes(r.brief_markdown, "# Brief: Best Form Builder");
      assertStringIncludes(r.brief_markdown, "in 75% of AI Overviews (36 of 48)");

      const notes = must(await db().from("notifications").select("kind, title, link, body").eq("tracked_query_id", tq.id), "notes") as {
        kind: string;
        title: string;
        link: string;
        body: string;
      }[];
      assertEquals(notes.length, 1);
      assertEquals([notes[0].kind, notes[0].title, notes[0].link], ["report_ready", "Brief ready: Best Form Builder", `/queries/${tq.id}/brief`]);
      assertStringIncludes(notes[0].body, "1 must-cover topics");

      // A repeated delivery changes nothing and sends no second notification.
      const req = stub.batches.get(batchIds[0])!.requests[0];
      assertEquals((must(await db().from("batch_items").select("refs").eq("batch_id", batchIds[0]).single(), "refs") as { refs: unknown }).refs, {});
      const message = {
        id: "msg_dup",
        type: "message",
        role: "assistant",
        model: "stub",
        content: [{ type: "text", text: JSON.stringify(respond(input)), citations: null }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      } as any;
      await briefWork.handleResult(req.custom_id, { type: "succeeded", message }, refs);
      await briefWork.handleResult(req.custom_id, { type: "errored", error: { type: "error", error: { type: "api_error", message: "late" } } }, refs)
        .catch(() => {});
      const after = must(await db().from("reports").select("stage").eq("id", report.id).single(), "r") as { stage: string };
      assertEquals(after.stage, "ready");
      assertEquals((must(await db().from("notifications").select("id").eq("tracked_query_id", tq.id), "n") as unknown[]).length, 1);
    } finally {
      await cleanup({ seriesIds: [seriesId], batchIds, pageKeys: keys, userIds: [userId] });
    }
  },
});

/** A valid brief for a report without metrics: every list empty, so every check passes. */
const EMPTY_BRIEF: BriefOutput = {
  summary: "Nothing recurs yet.",
  matrix: { topics: [], entities: [] },
  common_to_all: [],
  gaps: [],
  page_notes: [],
  brief: {
    answer_first: { text: "Pick Jotform.", max_words: 60 },
    must_cover: [],
    entities: [],
    format: { structure: "List", table_columns: [], list_items: null },
    evidence_to_match: [],
    new_to_cite: [],
    questions: [],
    outline: [],
    checklist: [],
    avoid: [],
  },
};

Deno.test({
  name: "brief: a truncated, refused or errored brief is resubmitted (with a higher ceiling after max_tokens); two failures fail the report; an invalid request fails it at once",
  ...opts,
  async fn() {
    const stub = stubAnthropic();
    stub.reset();
    const seriesId = await seedSeries("brief-retry");
    const userId = await seedUser();
    const batchIds: string[] = [];
    try {
      const tq = await insert<{ id: string }>("tracked_queries", { user_id: userId, series_id: seriesId, display_keyword: "x" });
      const report = async (kind: string) =>
        await insert<{ id: string }>("reports", {
          tracked_query_id: tq.id,
          series_id: seriesId,
          kind,
          window_start: "2026-10-04T00:00:00Z",
          window_end: "2026-10-07T00:00:00Z",
          renders: 0,
          metrics: null,
          stage: "brief",
        });
      const truncated = await report("preliminary");
      const refused = await report("full");
      const rejected = await report("refresh");
      const state = async (id: string) =>
        must(await db().from("reports").select("stage, brief_submitted, error").eq("id", id).single(), "r") as {
          stage: string;
          brief_submitted: boolean;
          error: string | null;
        };
      const maxTokensOf = (batchId: string, reportId: string) =>
        stub.batches.get(batchId)!.requests.find((r) => r.custom_id === customId("brief", reportId))!.params.max_tokens;

      // Round 1: one result stops on max_tokens, one is refused, one request is rejected.
      stub.responder = (cid) => {
        if (cid === customId("brief", truncated.id)) return { type: "succeeded", output: EMPTY_BRIEF, stop_reason: "max_tokens" };
        if (cid === customId("brief", refused.id)) return { type: "refusal" };
        return { type: "errored", error_type: "invalid_request_error", message: "prompt is too long" };
      };
      const s1 = await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["brief"] });
      batchIds.push(...s1.batches.map((b) => b.id));
      assertEquals(s1.counts.brief, 3);
      assertEquals(maxTokensOf(s1.batches[0].id, truncated.id), BRIEF_MAX_TOKENS);
      const c1 = await collectAll({ batchIds: s1.batches.map((b) => b.id), seriesIds: [seriesId] });
      assertEquals(c1.batches[0].failed, 3);
      assertEquals(c1.released?.briefs, 2, "the truncated and refused briefs are released for another attempt");
      assertEquals(await state(truncated.id), { stage: "brief", brief_submitted: false, error: null });
      assertEquals(await state(refused.id), { stage: "brief", brief_submitted: false, error: null });
      const r3 = await state(rejected.id);
      assertEquals(r3.stage, "failed");
      assertStringIncludes(r3.error ?? "", "invalid_request_error");

      // Round 2: the truncated brief gets the higher ceiling and succeeds; the refusal repeats.
      stub.responder = (cid) => cid === customId("brief", truncated.id) ? { type: "succeeded", output: EMPTY_BRIEF } : { type: "refusal" };
      const s2 = await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["brief"] });
      batchIds.push(...s2.batches.map((b) => b.id));
      assertEquals(s2.counts.brief, 2);
      assertEquals(maxTokensOf(s2.batches[0].id, truncated.id), BRIEF_MAX_TOKENS_RETRY);
      assertEquals(maxTokensOf(s2.batches[0].id, refused.id), BRIEF_MAX_TOKENS);
      const c2 = await collectAll({ batchIds: s2.batches.map((b) => b.id), seriesIds: [seriesId] });
      assertEquals([c2.batches[0].applied, c2.batches[0].failed], [1, 1]);
      assertEquals((await state(truncated.id)).stage, "ready");
      const r2 = await state(refused.id);
      assertEquals([r2.stage, r2.brief_submitted], ["failed", true]);
      assertStringIncludes(r2.error ?? "", "refusal");
      assertEquals((await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["brief"] })).counts.brief, 0);

      const notes = must(await db().from("notifications").select("kind").eq("tracked_query_id", tq.id), "n") as { kind: string }[];
      assertEquals(notes.map((n) => n.kind), ["report_ready"]);
    } finally {
      await cleanup({ seriesIds: [seriesId], batchIds, userIds: [userId] });
    }
  },
});
