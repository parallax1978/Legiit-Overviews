// The real clients against the running mock: _shared/dataforseo.ts for every DataForSEO route
// (including gzip postbacks to a local receiver) and @anthropic-ai/sdk for messages and batches.
import { assert, assertEquals, assertExists, assertRejects } from "@std/assert";
import Anthropic from "@anthropic-ai/sdk";
import { parseStructured, structuredParams } from "../supabase/functions/_shared/claude.ts";
import { contentParsing, DFS_OK, DFS_PENDING_CODES, relatedKeywords, serpLive, serpTaskGet, serpTaskPost } from "../supabase/functions/_shared/dataforseo.ts";
import { parseCapture } from "../supabase/functions/_shared/parse-serp.ts";
import { ConsolidateOutput, ExtractOutput, PageTagOutput } from "../supabase/functions/_shared/schemas.ts";
import { startMockServer } from "./server.ts";

function useDataForSeo(url: string) {
  Deno.env.set("DATAFORSEO_BASE_URL", url);
  Deno.env.set("DATAFORSEO_LOGIN", "mock");
  Deno.env.set("DATAFORSEO_PASSWORD", "mock");
}

/** A local postback receiver that records decompressed bodies. */
function receiver() {
  const got: { encoding: string | null; body: any; url: string }[] = [];
  const waiters: (() => void)[] = [];
  const server = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen() {} }, async (req) => {
    const encoding = req.headers.get("content-encoding");
    const raw = new Uint8Array(await req.arrayBuffer());
    const text = encoding === "gzip" ? await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"))).text() : new TextDecoder().decode(raw);
    got.push({ encoding, body: JSON.parse(text), url: req.url });
    waiters.splice(0).forEach((w) => w());
    return Response.json({ ok: true });
  });
  return {
    url: `http://127.0.0.1:${server.addr.port}`,
    got,
    async waitFor(n: number, ms = 5000) {
      const until = Date.now() + ms;
      while (got.length < n && Date.now() < until) await new Promise<void>((r) => (waiters.push(r), setTimeout(r, 50)));
      return got.length >= n;
    },
    close: () => server.shutdown(),
  };
}

Deno.test("DataForSEO client: live, related keywords and content parsing", async () => {
  const mock = startMockServer({ port: 0, quiet: true });
  useDataForSeo(mock.url);
  try {
    const task = await serpLive({ keyword: "best form builder", location_code: 2840, language_code: "en", device: "desktop" });
    assertEquals(task.status_code, DFS_OK);
    assertEquals(task.data.keyword, "best form builder");
    const parsed = parseCapture(task.result![0]);
    assert(parsed.organic.length === 20);

    const none = await serpLive({ keyword: "jotform login", location_code: 2840, language_code: "en", device: "mobile" });
    assertEquals(parseCapture(none.result![0]).status, "absent");

    const rk = await relatedKeywords("no overview test keyword", 2840, "en");
    assertEquals(rk.seed?.has_ai_overview, false);
    assert(rk.related.some((r) => r.has_ai_overview), "siblings with an overview");
    assert(rk.related.every((r) => typeof r.search_volume === "number"));

    const page = await contentParsing("https://zapier.com/blog/best-online-form-builder-software/");
    assertEquals(page.status_code, 200);
    assert(page.markdown?.startsWith("# "));
    assert(page.page_content.main_topic.length > 5);

    const res = await fetch(`${mock.url}/v3/serp/google/organic/live/advanced`, { method: "POST", body: "[]" });
    assertEquals(res.status, 401);
    await res.body?.cancel();
  } finally {
    await mock.close();
  }
});

Deno.test("DataForSEO client: task_post, gzip postback with tag, task_get", async () => {
  const sink = receiver();
  const mock = startMockServer({ port: 0, quiet: true, postbackDelayMs: 200 });
  useDataForSeo(mock.url);
  try {
    const posted = await serpTaskPost([
      { keyword: "best form builder", location_code: 2840, language_code: "en", device: "desktop", tag: "capture-1" },
      { keyword: "best crm", location_code: 2840, language_code: "en", device: "mobile", tag: "capture-2" },
    ], `${sink.url}/functions/v1/dataforseo-postback?secret=s3cret&id=$id`);
    assertEquals(posted.map((t) => t.status_code), [20100, 20100]);
    assertEquals(posted[0].data.tag, "capture-1");

    const early = await serpTaskGet(posted[0].id);
    assert(DFS_PENDING_CODES.has(early.status_code), `pending code, got ${early.status_code}`);

    assert(await sink.waitFor(2), "two postbacks arrive");
    for (const p of sink.got) {
      assertEquals(p.encoding, "gzip");
      assertEquals(p.body.status_code, 20000);
      const t = p.body.tasks[0];
      assertEquals(t.status_code, 20000);
      assert(["capture-1", "capture-2"].includes(t.data.tag));
      assertEquals(t.data.postback_data, "advanced");
      assertExists(t.result[0].items);
      assert(new URL(p.url).searchParams.get("id") === t.id, "$id is substituted");
      assertEquals(new URL(p.url).searchParams.get("secret"), "s3cret");
    }

    const ready = await serpTaskGet(posted[1].id);
    assertEquals(ready.status_code, DFS_OK);
    assertEquals(ready.data.tag, "capture-2");
    const unknown = await serpTaskGet("00000000-1535-0066-0000-000000000000");
    assert(unknown.status_code >= 40000 && !DFS_PENDING_CODES.has(unknown.status_code));
    assertEquals(mock.state().dataforseo.postbacks_sent, 2);
  } finally {
    await mock.close();
    await sink.close();
  }
});

Deno.test("DataForSEO mock logs and counts failed postbacks", async () => {
  const mock = startMockServer({ port: 0, quiet: true, postbackDelayMs: 0 });
  useDataForSeo(mock.url);
  const error = console.error;
  const logged: string[] = [];
  console.error = (...a: unknown[]) => logged.push(a.join(" "));
  try {
    await serpTaskPost([{ keyword: "best form builder", location_code: 2840, language_code: "en", device: "desktop", tag: "x" }], "http://127.0.0.1:9/nowhere");
    const until = Date.now() + 5000;
    while (mock.state().dataforseo.postbacks_failed < 1 && Date.now() < until) await new Promise((r) => setTimeout(r, 25));
    assertEquals(mock.state().dataforseo.postbacks_failed, 1);
    assert(logged.some((l) => l.includes("postback failed")));
    const unknown = await fetch(`${mock.url}/v3/nope`, { headers: { authorization: "Basic eDp5" } });
    assertEquals(unknown.status, 404);
    assertEquals((await unknown.json()).status_code, 40400);
  } finally {
    console.error = error;
    await mock.close();
  }
});

function extractRequest() {
  const data = {
    keyword: "best form builder",
    language: "en",
    sentences: [
      { i: 0, kind: "paragraph", text: "The best form builder for most people is Jotform, while Typeform is the top choice for conversational forms.", cited: true },
      { i: 1, kind: "list_item", text: "Tally Forms: A generous free plan with unlimited forms and submissions.", cited: false },
    ],
    known_claims: [{ ref: "C1", label: "The best form builder for most people is Jotform." }],
    known_entities: [{ ref: "E1", name: "Jotform", aliases: [] }],
  };
  return structuredParams({ task: "extract", system: "Extract claims.", user: `<data>\n${JSON.stringify(data)}\n</data>`, schema: ExtractOutput, maxTokens: 16000 });
}

Deno.test("Anthropic SDK: a structured message, with fallbacks and the beta header", async () => {
  const mock = startMockServer({ port: 0, quiet: true });
  const client = new Anthropic({ baseURL: `${mock.url}/anthropic`, apiKey: "x", maxRetries: 0 });
  try {
    const message = await client.messages.create(
      { ...extractRequest(), fallbacks: "default" } as Anthropic.Messages.MessageCreateParamsNonStreaming,
      { headers: { "anthropic-beta": "server-side-fallback-2026-07-01" } },
    );
    assertEquals(message.stop_reason, "end_turn");
    assert(message.usage.input_tokens > 0 && message.usage.output_tokens > 0);
    assert((message.usage.cache_creation_input_tokens ?? 0) > 0, "first use writes the cache");
    const out = parseStructured(message, ExtractOutput);
    assertEquals(out.claims[0].group_ref, "C1");
    assert(out.entities.some((e) => e.name === "Tally Forms" && e.entity_ref === null));
    const again = await client.messages.create(extractRequest());
    assert((again.usage.cache_read_input_tokens ?? 0) > 0, "second use reads the cache");
    await assertRejects(() => client.messages.create({ model: "m", max_tokens: 10, messages: [] }), Anthropic.BadRequestError);
  } finally {
    await mock.close();
  }
});

Deno.test("Anthropic SDK: create, retrieve and stream batch results", async () => {
  const mock = startMockServer({ port: 0, quiet: true, batchDelayMs: 300 });
  const client = new Anthropic({ baseURL: `${mock.url}/anthropic`, apiKey: "x", maxRetries: 0 });
  try {
    const consolidate = structuredParams({
      task: "consolidate",
      system: "Merge duplicates.",
      user: `<data>${JSON.stringify({ keyword: "k", language: "en", claims: [], entities: [{ ref: "E1", name: "Tally", aliases: [], renders: 9 }, { ref: "E2", name: "Tally Forms", aliases: [], renders: 4 }] })}</data>`,
      schema: ConsolidateOutput,
      maxTokens: 16000,
    });
    const pageTag = structuredParams({
      task: "pageTag",
      system: "Tag the page.",
      user: `<data>${JSON.stringify({ keyword: "best form builder", language: "en", url: "https://x.test/", outline: [{ level: 2, text: "Pricing" }], markdown: "# Forms\n\n## Pricing\n\nJotform costs $34 per month.", google_passages: [] })}</data>`,
      schema: PageTagOutput,
      maxTokens: 8000,
    });
    const batch = await client.messages.batches.create({
      requests: [
        { custom_id: "extract-a1", params: extractRequest() },
        { custom_id: "consolidate-s1", params: consolidate },
        { custom_id: "page_tag-p1", params: pageTag },
      ],
    });
    assertEquals(batch.processing_status, "in_progress");
    assertEquals(batch.results_url, null);
    assertEquals(batch.request_counts.processing, 3);
    await assertRejects(() => client.messages.batches.results(batch.id));

    await new Promise((r) => setTimeout(r, 350));
    const done = await client.messages.batches.retrieve(batch.id);
    assertEquals(done.processing_status, "ended");
    assertEquals(done.request_counts.succeeded, 3);
    assert(done.results_url?.startsWith(`${mock.url}/anthropic/v1/messages/batches/`), done.results_url ?? "");

    const results: Record<string, Anthropic.Messages.Batches.MessageBatchIndividualResponse> = {};
    for await (const r of await client.messages.batches.results(batch.id)) results[r.custom_id] = r;
    assertEquals(Object.keys(results).sort(), ["consolidate-s1", "extract-a1", "page_tag-p1"]);
    const msg = (id: string) => {
      const r = results[id].result;
      assert(r.type === "succeeded");
      assertEquals(r.message.usage.service_tier, "batch");
      return r.message;
    };
    assertEquals(parseStructured(msg("consolidate-s1"), ConsolidateOutput).entity_merges[0].aliases, ["Tally Forms"]);
    assert(parseStructured(msg("page_tag-p1"), PageTagOutput).evidence.some((e) => e.kind === "pricing"));
    parseStructured(msg("extract-a1"), ExtractOutput);

    // results_url follows the Host header, so the edge runtime container gets a URL it can reach.
    const conn = await Deno.connect({ hostname: "127.0.0.1", port: mock.port });
    await conn.write(new TextEncoder().encode(
      `GET /anthropic/v1/messages/batches/${batch.id} HTTP/1.1\r\nHost: host.docker.internal:8787\r\nx-api-key: x\r\nConnection: close\r\n\r\n`,
    ));
    const raw = await new Response(conn.readable).text();
    const viaDocker = JSON.parse(raw.slice(raw.indexOf("\r\n\r\n") + 4));
    assertEquals(viaDocker.results_url, `http://host.docker.internal:8787/anthropic/v1/messages/batches/${batch.id}/results`);
    assertEquals(mock.state().anthropic.batches_created, 1);
  } finally {
    await mock.close();
  }
});

Deno.test("Anthropic mock: MOCK_FAIL_RATE errors results", async () => {
  const mock = startMockServer({ port: 0, quiet: true, failRate: 1 });
  const client = new Anthropic({ baseURL: `${mock.url}/anthropic`, apiKey: "x", maxRetries: 0 });
  try {
    const batch = await client.messages.batches.create({ requests: [{ custom_id: "extract-a", params: extractRequest() }, { custom_id: "extract-b", params: extractRequest() }] });
    const done = await client.messages.batches.retrieve(batch.id);
    assertEquals(done.request_counts.errored, 2);
    const types: string[] = [];
    for await (const r of await client.messages.batches.results(batch.id)) types.push(r.result.type);
    assertEquals(types, ["errored", "errored"]);
    await assertRejects(() => client.messages.batches.create({ requests: [{ custom_id: "bad id!", params: extractRequest() }] }), Anthropic.BadRequestError);
  } finally {
    await mock.close();
  }
});
