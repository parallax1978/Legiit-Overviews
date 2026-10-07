import { assert, assertEquals } from "@std/assert";
import { customId } from "../batch-work.ts";
import { collectAll, submitAll } from "../batches.ts";
import { must, serviceClient } from "../db.ts";
import { wordsBefore } from "../passage.ts";
import { trimMarkdown } from "../prompts/page-tag.ts";
import type { PageTagInput, PageTagOutput } from "../schemas.ts";
import { clampTags } from "./page-tag.ts";
import { cleanup, seedSeries, seedSnapshot, seedUser, sentences, stubAnthropic, TEST_PREFIX } from "./test-helpers.ts";

const db = () => serviceClient();
const opts = { sanitizeOps: false, sanitizeResources: false };

const PAGE = `# The 7 best form builders in 2026

Picking a form builder comes down to price and logic.

## Our top pick

**Jotform** is the best form builder for most teams because it has 10,000+ templates and a generous free plan.

## Best free option

Tally lets you create unlimited forms and collect unlimited responses for free.
`;

const ANSWER = "Jotform is the best form builder for most teams because it has 10,000+ templates and a generous free plan.";

Deno.test("trimMarkdown cuts at a paragraph boundary", () => {
  const md = "a".repeat(50) + "\n\n" + "b".repeat(30) + "\n\n" + "c".repeat(40);
  assertEquals(trimMarkdown(md, 100), "a".repeat(50) + "\n\n" + "b".repeat(30));
  assertEquals(trimMarkdown("short", 100), "short");
  assertEquals(trimMarkdown("word ".repeat(40), 50).length <= 50, true);
});

Deno.test("clampTags keeps excerpts short", () => {
  const tags: PageTagOutput = {
    topics: [],
    entities: [],
    evidence: [{ kind: "quote", description: "d", excerpt: "word ".repeat(100) }],
    questions_answered: [],
    answer_sentence: null,
    approach: "",
  };
  assert(clampTags(tags).evidence[0].excerpt.length <= 300);
});

Deno.test({
  name: "page_tag: pages of reports at stage 'pages' are tagged and words before the answer measured",
  ...opts,
  async fn() {
    const stub = stubAnthropic();
    stub.reset();
    const seen: PageTagInput[] = [];
    const seriesId = await seedSeries("page-tag");
    const userId = await seedUser();
    const tag = crypto.randomUUID().slice(0, 8);
    const good = `${TEST_PREFIX}-${tag}.example/best-form-builder`;
    const bad = `${TEST_PREFIX}-${tag}.example/broken`;
    const unrelated = `${TEST_PREFIX}-${tag}.example/not-in-a-report`;
    const batchIds: string[] = [];
    try {
      const snap = await seedSnapshot(seriesId, { sentences: sentences(["Tally is free.", [0]]), extraction: "done" });
      must(
        await db().from("citations").insert([
          { snapshot_id: snap, idx: 0, url: `https://${good}`, url_key: good, host: `${TEST_PREFIX}-${tag}.example`, reg_domain: `${TEST_PREFIX}-${tag}.example`, passage: "Tally lets you create unlimited forms" },
        ]),
        "citations",
      );
      const now = new Date().toISOString();
      const pages = must(
        await db().from("pages").insert([
          { url_key: good, url: `https://${good}`, reg_domain: "example", parse_status: "ok", parsed_at: now, markdown: PAGE, outline: null, measures: { word_count: 60 } },
          { url_key: bad, url: `https://${bad}`, reg_domain: "example", parse_status: "ok", parsed_at: now, markdown: "Oops", outline: [] },
          { url_key: unrelated, url: `https://${unrelated}`, reg_domain: "example", parse_status: "ok", parsed_at: now, markdown: "x" },
        ]).select("id, url_key"),
        "pages",
      ) as { id: string; url_key: string }[];
      const id = Object.fromEntries(pages.map((p) => [p.url_key, p.id]));
      const tq = must(
        await db().from("tracked_queries").insert({ user_id: userId, series_id: seriesId, display_keyword: "best form builder" }).select("id").single(),
        "tq",
      ) as { id: string };
      must(
        await db().from("reports").insert({
          tracked_query_id: tq.id,
          series_id: seriesId,
          kind: "full",
          window_start: "2026-09-30T00:00:00Z",
          window_end: "2026-10-07T00:00:00Z",
          renders: 10,
          page_urls: [good, bad],
          stage: "pages",
        }),
        "report",
      );

      stub.responder = (cid, data: PageTagInput) => {
        seen.push(data);
        if (cid === customId("page_tag", id[bad])) return { type: "errored", error_type: "api_error", message: "boom" };
        return {
          type: "succeeded",
          output: {
            topics: ["Best overall form builder", "Free form builders"],
            entities: ["Jotform", "Tally"],
            evidence: [{ kind: "spec", description: "Template count", excerpt: "10,000+ templates" }],
            questions_answered: ["What is the best form builder?"],
            answer_sentence: ANSWER,
            approach: "Short ranked list with a top pick and a free pick.",
          } satisfies PageTagOutput,
        };
      };

      const sub = await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["page_tag"] });
      assertEquals(sub.errors, []);
      assertEquals(sub.counts.page_tag, 2);
      batchIds.push(...sub.batches.map((b) => b.id));
      const status = async (key: string) =>
        (must(await db().from("pages").select("tag_status, tags, measures, tagged_at").eq("url_key", key).single(), "page") as {
          tag_status: string;
          tags: PageTagOutput | null;
          measures: Record<string, unknown> | null;
          tagged_at: string | null;
        });
      assertEquals((await status(good)).tag_status, "submitted");
      assertEquals((await status(unrelated)).tag_status, "none");

      await collectAll({ batchIds });
      const input = seen.find((s) => s.url.endsWith("best-form-builder"))!;
      assertEquals(input.keyword, (must(await db().from("series").select("keyword").eq("id", seriesId).single(), "s") as { keyword: string }).keyword);
      assertEquals(input.google_passages, ["Tally lets you create unlimited forms"]);
      assertEquals(input.outline.map((o) => o.text), ["The 7 best form builders in 2026", "Our top pick", "Best free option"]);
      assertEquals(input.markdown, PAGE);

      const g = await status(good);
      assertEquals(g.tag_status, "done");
      assertEquals(g.tags?.entities, ["Jotform", "Tally"]);
      assertEquals(g.measures?.word_count, 60);
      const expected = wordsBefore(PAGE, ANSWER);
      assert(expected !== null && expected > 0);
      assertEquals(g.measures?.words_before_answer, expected);
      const b = await status(bad);
      assertEquals(b.tag_status, "failed");
      assert(b.tagged_at);

      // Tagged pages are not submitted again; neither is a page that failed.
      assertEquals((await submitAll({ scope: { seriesIds: [seriesId] }, kinds: ["page_tag"] })).counts.page_tag, 0);
    } finally {
      await cleanup({ seriesIds: [seriesId], batchIds, pageKeys: [good, bad, unrelated], userIds: [userId] });
    }
  },
});
