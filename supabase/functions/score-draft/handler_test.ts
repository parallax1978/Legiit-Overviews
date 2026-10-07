import { assert, assertEquals } from "@std/assert";
import { createClient } from "@supabase/supabase-js";
import { serviceClient } from "../_shared/db.ts";
import { env } from "../_shared/env.ts";
import { measurePage } from "../_shared/pages.ts";
import type { DraftScoreResult } from "../_shared/types.ts";
import { evidenceKinds, handle, medianMeasures, wordsBeforeAnswer } from "./handler.ts";

const ANSWER = "The best form builder for most teams is Jotform, thanks to its free plan and 10,000 templates.";

function topPage(extra = ""): string {
  return `# Best form builders in 2026

By Jane Doe | Updated on March 3, 2026

${ANSWER}

## Free plans

Jotform, Tally and Google Forms all have free plans. Tally offers unlimited forms and unlimited responses on its free plan, while Jotform limits free accounts to 5 forms and 100 monthly submissions.

## Conditional logic

All three builders support conditional logic, so a form can show or hide questions based on earlier answers. We tested each builder with a 12-question survey and Jotform handled branching in 4 minutes.

## Payment integrations

Jotform connects to Stripe, PayPal and Square. Tally supports Stripe payments on its paid plan.
${extra}
## Pricing

| Tool | Free plan | Price |
|---|---|---|
| Jotform | Yes | $34 per month |
| Tally | Yes | $29 per month |
| Google Forms | Yes | $0 |

## Our picks

- **Jotform** – best overall
- **Tally**: best free option
- **Google Forms** — best for simple surveys
- **Typeform** – best design
- **Wufoo** – best for legacy users
`;
}

Deno.test("wordsBeforeAnswer finds the opening exactly or by shared words", () => {
  assertEquals(wordsBeforeAnswer(topPage(), ANSWER), 8, "the byline is 8 words (By Jane Doe Updated on March 3 2026); the title is a heading");
  const paraphrase = "# Title\n\nSome intro here.\n\nFor most teams Jotform is the best form builder thanks to templates.\n";
  assertEquals(wordsBeforeAnswer(paraphrase, ANSWER), 3);
  assertEquals(wordsBeforeAnswer("Nothing relevant at all.", ANSWER), null);
});

Deno.test("medianMeasures and evidenceKinds", () => {
  const a = measurePage(topPage(), null, "https://a.example.com");
  const b = measurePage(topPage("\nAnother paragraph with 3 more numbers: 1, 2.\n"), null, "https://b.example.com");
  const m = medianMeasures([a, { ...a, word_count: 10 }, b]);
  assertEquals(m.word_count, a.word_count);
  assertEquals(m.tables, 1);
  assertEquals(m.words_before_answer, undefined, "all null, so no median");
  const kinds = evidenceKinds(topPage());
  assert(kinds.has("pricing"));
  assert(kinds.has("test_result"));
  assert(!kinds.has("screenshot"));
});

Deno.test("score-draft: ownership, readiness, background scoring", async (t) => {
  const db = serviceClient();
  const tag = `sd${crypto.randomUUID().slice(0, 8)}`;
  const host = `${tag}.example.com`;

  // Stub DataForSEO: /ok serves the top page, /missing is a 404.
  const dfs = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    const url: string = (await req.json())[0].url;
    const missing = url.endsWith("/missing");
    return Response.json({
      status_code: 20000, status_message: "Ok.", tasks: [{
        id: "t", status_code: 20000, status_message: "Ok.", data: {},
        result: [{ items: [{ status_code: missing ? 404 : 200, page_content: null, page_as_markdown: missing ? "" : topPage() }] }],
      }],
    });
  });
  // Stub Anthropic: a topic is covered when all its words of 4+ letters are in the draft.
  const claudeCalls: { beta: string | null; fallbacks: unknown }[] = [];
  const claude = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    const body = await req.json();
    claudeCalls.push({ beta: req.headers.get("anthropic-beta"), fallbacks: body.fallbacks });
    const data = JSON.parse(String(body.messages[0].content).match(/<data>\n([\s\S]*)\n<\/data>/)![1]);
    const draft = String(data.draft_markdown).toLowerCase();
    const has = (s: string) => s.toLowerCase().split(/\W+/).filter((w) => w.length >= 4).every((w) => draft.includes(w));
    const topics = data.brief.must_cover.map((m: { topic: string }) => ({
      topic: m.topic, status: has(m.topic) ? "covered" : "missing", note: "stub",
    }));
    const output = {
      topics,
      new_to_cite: data.brief.new_to_cite.map((n: { idea: string }) => ({ idea: n.idea, status: draft.includes("response rate") ? "covered" : "missing", note: "stub" })),
      answer_first: { status: draft.slice(0, 400).includes("jotform") ? "covered" : "missing", note: "stub" },
      clarity: { score: 8, note: "stub" },
      fixes: [
        { priority: 5, fix: "Polish the conclusion." },
        ...topics.filter((x: { status: string }) => x.status === "missing").map((x: { topic: string }) => ({ priority: 1, fix: `Cover ${x.topic}.` })),
      ],
    };
    return Response.json({
      id: "msg_stub", type: "message", role: "assistant", model: "claude-opus-5-5",
      content: [{ type: "text", text: JSON.stringify(output) }],
      stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 100, output_tokens: 100 },
    });
  });
  Deno.env.set("DATAFORSEO_BASE_URL", `http://127.0.0.1:${dfs.addr.port}`);
  Deno.env.set("ANTHROPIC_BASE_URL", `http://127.0.0.1:${claude.addr.port}`);

  const password = `pw-${tag}-Aa1!`;
  const users: string[] = [];
  let seriesId: string | null = null;
  const pageKeys = [0, 1, 2].map((i) => `${host}/winner-${i}`);
  try {
    for (const who of ["owner", "other"]) {
      const { data, error } = await db.auth.admin.createUser({ email: `${who}-${tag}@example.com`, password, email_confirm: true });
      if (error) throw error;
      users.push(data.user!.id);
    }
    const token = async (who: string) => {
      const anon = createClient(env.supabaseUrl(), env.anonKey(), { auth: { persistSession: false } });
      const { data, error } = await anon.auth.signInWithPassword({ email: `${who}-${tag}@example.com`, password });
      if (error) throw error;
      return data.session!.access_token;
    };
    const ownerToken = await token("owner");
    const otherToken = await token("other");
    const call = (tok: string | null, body: unknown) =>
      handle(new Request("http://x/score-draft", {
        method: "POST",
        headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify(body),
      }));

    seriesId = (await db.from("series").insert({ keyword: `${tag} best form builder`, location_code: 2840, language_code: "en", device: "desktop", next_capture_at: "2030-01-01" })
      .select("id").single().throwOnError()).data!.id;
    const tqId = (await db.from("tracked_queries").insert({ user_id: users[0], series_id: seriesId, display_keyword: "best form builder", own_url: `https://${host}/own`, own_url_key: `${host}/own` })
      .select("id").single().throwOnError()).data!.id;
    const entityIds = (await db.from("entities").insert([
      { series_id: seriesId, name: "Jotform", aliases: [] },
      { series_id: seriesId, name: "Google Forms", aliases: ["GForms"] },
    ]).select("id, name").throwOnError()).data!;
    const idOf = (name: string) => entityIds.find((e: { name: string }) => e.name === name)!.id;

    const winners = [topPage(), topPage("\nJotform also offers HIPAA compliance for $99 per month.\n"), topPage("\nTally added a new AI form generator in 2025.\n")];
    await db.from("pages").insert(winners.map((md, i) => ({
      url_key: pageKeys[i], url: `https://${pageKeys[i]}`, reg_domain: "example.com", parse_status: "ok", parsed_at: new Date().toISOString(),
      markdown: md, measures: { ...measurePage(md, null, `https://${pageKeys[i]}`), words_before_answer: 12 }, tag_status: "done",
      tags: { evidence: [{ kind: "pricing" }, ...(i < 2 ? [{ kind: "test_result" }] : []), ...(i === 0 ? [{ kind: "original_data" }] : [])] },
    }))).throwOnError();

    const brief = {
      answer_first: { text: ANSWER, max_words: 40 },
      must_cover: ["Free plans", "Conditional logic", "Payment integrations"].map((topic) => ({ topic, why: "core", claim_refs: [] })),
      entities: [
        { name: "Jotform", entity_ref: `entity:${idOf("Jotform")}`, role: "recommended", note: "" },
        { name: "Tally", entity_ref: null, role: "recommended", note: "" },
        { name: "Google Forms", entity_ref: `entity:${idOf("Google Forms")}`, role: "mentioned", note: "" },
      ],
      format: { structure: "Ranked list then a table", table_columns: ["Tool", "Free plan", "Price"], list_items: 5 },
      evidence_to_match: [],
      new_to_cite: [{ idea: "A response rate test", why_google_lacks_it: "none", how_to_produce: "first_hand_test", evidence_refs: [] }],
      questions: [], outline: [], checklist: [], avoid: [],
    };
    const analysis = { summary: "", matrix: { topics: [], entities: [] }, common_to_all: [], gaps: [], page_notes: [], brief };
    const reportId = (await db.from("reports").insert({
      tracked_query_id: tqId, series_id: seriesId, kind: "full", window_start: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      window_end: new Date().toISOString(), renders: 56, page_urls: [...pageKeys, `${host}/own`], stage: "brief", analysis,
    }).select("id").single().throwOnError()).data!.id;

    const scoreRow = async (id: string) =>
      (await db.from("draft_scores").select("*").eq("id", id).single().throwOnError()).data as {
        status: string; result: DraftScoreResult | null; error: string | null; report_id: string;
      };

    await t.step("requests are checked", async () => {
      assertEquals((await call(null, { tracked_query_id: tqId, source: "text", input: "x" })).status, 401);
      assertEquals((await call(ownerToken, { tracked_query_id: tqId, source: "pdf", input: "x" })).status, 400);
      assertEquals((await call(ownerToken, { tracked_query_id: tqId, source: "url", input: "not a url" })).status, 400);
      assertEquals((await call(ownerToken, { tracked_query_id: "nope", source: "text", input: "x" })).status, 400);
      const other = await call(otherToken, { tracked_query_id: tqId, source: "text", input: "x" });
      assertEquals(other.status, 404, "another user's query is not found");
    });

    await t.step("409 until the brief is ready", async () => {
      const res = await call(ownerToken, { tracked_query_id: tqId, source: "text", input: topPage() });
      assertEquals(res.status, 409);
      assertEquals(await res.json(), { error: "The brief isn't ready yet." });
      await db.from("reports").update({ stage: "ready" }).eq("id", reportId).throwOnError();
    });

    await t.step("a copy of the top page scores high", async () => {
      const res = await call(ownerToken, { tracked_query_id: tqId, source: "text", input: topPage() });
      assertEquals(res.status, 200);
      const { draft_score_id } = await res.json();
      const row = await scoreRow(draft_score_id);
      assertEquals(row.status, "done", row.error ?? "");
      assertEquals(row.report_id, reportId);
      const r = row.result!;
      assertEquals(r.subscores.topic_coverage, 1);
      assertEquals(r.subscores.entity_coverage, 1);
      assertEquals(r.subscores.format_match, 1);
      assertEquals(r.subscores.answer_first, 1);
      assertEquals(r.subscores.checklist, 1);
      assertEquals(r.measures.words_before_answer, 8);
      assert(r.score >= 90, `score ${r.score}`);
      assertEquals(r.entities.map((e) => e.present), [true, true, true]);
      assertEquals(r.new_to_cite[0].status, "missing");
      assertEquals(r.winners_median.tables, 1);
      assertEquals(r.winners_median.words_before_answer, 12);
      const priorities = r.fixes.map((f) => f.priority);
      assertEquals(priorities, [...priorities].sort((a, b) => a - b), "fixes are sorted by priority");
      assertEquals(claudeCalls.at(-1)!.beta, "server-side-fallback-2026-07-01");
      assertEquals(claudeCalls.at(-1)!.fallbacks, "default");
    });

    await t.step("an unrelated draft scores low and gets fixes", async () => {
      const draft = "Cooking pasta takes about ten minutes in salted water. Taste it before draining. GForms is not mentioned here.";
      const { draft_score_id } = await (await call(ownerToken, { tracked_query_id: tqId, source: "text", input: draft })).json();
      const r = (await scoreRow(draft_score_id)).result!;
      assertEquals(r.subscores.topic_coverage, 0);
      assert(r.score < 30, `score ${r.score}`);
      assertEquals(r.entities, [
        { name: "Jotform", present: false },
        { name: "Tally", present: false },
        { name: "Google Forms", present: true },
      ], "an alias counts as a mention");
      assertEquals(r.fixes[0].priority, 1);
      assert(r.fixes.some((f) => f.fix.includes("Tool, Free plan, Price")), "code adds the missing table");
      assert(r.fixes.some((f) => f.fix.includes("author")), "code adds the missing byline");
    });

    await t.step("a URL is parsed and scored; an unreachable URL fails the row", async () => {
      const ok = await (await call(ownerToken, { tracked_query_id: tqId, source: "url", input: `https://${host}/ok` })).json();
      const row = await scoreRow(ok.draft_score_id);
      assertEquals(row.status, "done");
      assert(row.result!.score >= 90);
      const bad = await (await call(ownerToken, { tracked_query_id: tqId, source: "url", input: `https://${host}/missing` })).json();
      const failed = await scoreRow(bad.draft_score_id);
      assertEquals(failed.status, "failed");
      assertEquals(failed.error, "The page returned HTTP 404.");
    });
  } finally {
    for (const id of users) await db.auth.admin.deleteUser(id);
    if (seriesId) {
      await db.from("entities").delete().eq("series_id", seriesId);
      await db.from("series").delete().eq("id", seriesId);
    }
    await db.from("pages").delete().in("url_key", pageKeys);
    await dfs.shutdown();
    await claude.shutdown();
  }
});
