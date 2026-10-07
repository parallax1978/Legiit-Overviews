import { assert, assertEquals } from "@std/assert";
import { serviceClient } from "./db.ts";
import {
  ensurePages,
  locatePassages,
  markdownFromPageContent,
  measurePage,
  needsParse,
  pageOutline,
  parseDate,
} from "./pages.ts";

const PAGE = `# The 7 best form builders in 2026

By **Jane Doe** | Updated on March 3, 2026

Published: 2025-11-20

The best form builder for most teams is Jotform, with 10,000+ templates.

## Comparison

| Tool | Free plan | Price |
|---|---|---|
| Jotform | Yes | $34 |
| Tally | Yes | $29 |
| Typeform | No | $25 |

## Our picks

- **Jotform** – best overall
- **Tally**: best free option
- **Typeform** — best design
- and more options

1. Sign up
2. Build a form

See [our pricing guide](/pricing) and [Zapier's review](https://zapier.com/blog/forms/) or [docs](https://docs.example.com/x). ![chart](https://img.example.com/c.png)

## FAQ

### Is Jotform free?

Yes.
`;

Deno.test("measurePage: hand-counted page", () => {
  const m = measurePage(PAGE, null, "https://www.example.com/blog/best-form-builders");
  // Words per line: 7 + 8 + 4 + 12 + 1 + 4 + 3 + 3 + 3 + 2 + 3 + 4 + 3 + 3 + 2 + 3 + 9 + 1 + 3 + 1 = 79
  // ("10,000" and "Zapier's" are one word each; "2025-11-20" is three; list numbers and $ are not words).
  assertEquals(m.word_count, 79);
  // Numbers: 7, 2026, 3, 2026, 2025, 11, 20, 10,000, 34, 29, 25 = 11 -> 11 / 79 * 100
  assertEquals(m.numbers_per_100_words, 13.92);
  // H1, Comparison, Our picks, FAQ, Is Jotform free? on levels 1, 2 and 3
  assertEquals(m.headings, 5);
  assertEquals(m.outline_depth, 3);
  assertEquals(m.tables, 1);
  assertEquals(m.table_rows, 3);
  assertEquals(m.max_table_columns, 3);
  // A bullet list of 4 and a numbered list of 2: the change of marker starts a new list.
  assertEquals(m.lists, 2);
  assertEquals(m.list_items, 6);
  // The 3-column table plus the bullet list whose items start "Name –", "Name:", "Name —".
  assertEquals(m.comparison_blocks, 2);
  assertEquals(m.author, "Jane Doe");
  assertEquals(m.published, "2025-11-20");
  assertEquals(m.updated, "2026-03-03");
  // /pricing and docs.example.com are on example.com; zapier.com is external; the image is not a link.
  assertEquals(m.internal_links, 2);
  assertEquals(m.external_links, 1);
  assertEquals(m.has_faq, true);
  assertEquals(m.words_before_answer, null);
});

Deno.test("measurePage: lists, question runs and unlabelled dates", () => {
  const md = `Posted by Sam Lee
May 4th, 2024

* Alpha - first
* Beta - second
  continued line of Beta
* Gamma - third

Some paragraph.

- one
- two

## How much does it cost?
## Is there a free plan?
## Can I export data?
`;
  const m = measurePage(md, null, "https://blog.example.org/post");
  assertEquals(m.author, "Sam Lee");
  assertEquals(m.published, "2024-05-04");
  assertEquals(m.updated, null);
  assertEquals(m.lists, 2);
  assertEquals(m.list_items, 5);
  assertEquals(m.comparison_blocks, 1);
  assertEquals(m.has_faq, true, "three question headings in a row");
  assertEquals(m.tables, 0);
});

Deno.test("measurePage: empty page", () => {
  const m = measurePage("", null, "https://example.com");
  assertEquals(m.word_count, 0);
  assertEquals(m.numbers_per_100_words, 0);
  assertEquals(m.headings, 0);
  assertEquals(m.outline_depth, 0);
  assertEquals(m.author, null);
  assertEquals(m.has_faq, false);
});

const fixture = JSON.parse(await Deno.readTextFile(new URL("./fixtures/dfs-doc-content-parsing.json", import.meta.url)));
const fxItem = fixture.tasks[0].result[0].items[0];
const fxUrl: string = fixture.tasks[0].data.url;

Deno.test("measurePage: DataForSEO content_parsing fixture", () => {
  // The documentation sample lost its newlines ("\n" reads "n"), so markdown structure is unusable;
  // page_content supplies the author and the one table (header API | Pricing, four body rows, the
  // last two with three cells). All 23 markdown links point at dataforseo.com or its subdomains.
  const m = measurePage(fxItem.page_as_markdown, fxItem.page_content, fxUrl);
  assertEquals(m.author, "Anatolii");
  assertEquals(m.tables, 1);
  assertEquals(m.table_rows, 4);
  assertEquals(m.max_table_columns, 3);
  assertEquals(m.comparison_blocks, 1);
  assertEquals(m.internal_links, 23);
  assertEquals(m.external_links, 0);
  assertEquals(m.published, null);
  assertEquals(m.has_faq, false);

  // Rebuilt from page_content: seven main_topic headings on levels 1, 3 and 4.
  const rebuilt = markdownFromPageContent(fxItem.page_content);
  const outline = pageOutline(rebuilt, fxItem.page_content);
  assertEquals(outline.map((h) => h.level), [1, 3, 3, 4, 4, 3, 1]);
  assertEquals(outline[3].text, "1 Access historical keyword trends data at affordable pricing");
  const r = measurePage(rebuilt, fxItem.page_content, fxUrl);
  assertEquals(r.headings, 7);
  assertEquals(r.outline_depth, 3);
  assertEquals(r.tables, 1);
  assertEquals(r.table_rows, 4);
  assert(r.word_count > 2500);
});

Deno.test("pageOutline falls back to page_content headings", () => {
  const outline = pageOutline("Just text, no headings.", fxItem.page_content);
  assertEquals(outline.length, 7);
  assertEquals(outline[1], { level: 3, text: "What is DataForSEO Trends API and how does it work?" });
});

Deno.test("parseDate", () => {
  assertEquals(parseDate("2024-05-01T10:00:00Z"), "2024-05-01");
  assertEquals(parseDate("May 1st, 2024"), "2024-05-01");
  assertEquals(parseDate("1 Sept 2023"), "2023-09-01");
  assertEquals(parseDate("September 12 2023"), "2023-09-12");
  assertEquals(parseDate("Feb 30, 2024"), null);
  assertEquals(parseDate("1990-01-01"), null);
  assertEquals(parseDate(42), null);
});

Deno.test("locatePassages finds Google's passage under its heading", () => {
  const locs = locatePassages(PAGE, ["The best form builder for most teams is Jotform", "Nothing like this is on the page at all"], "example.com/blog/best-form-builders");
  assertEquals(locs.length, 2);
  assertEquals(locs[0].url_key, "example.com/blog/best-form-builders");
  assertEquals(locs[0].found, true);
  assertEquals(locs[0].heading, "The 7 best form builders in 2026");
  assertEquals(locs[0].match_score, 1);
  assertEquals(locs[1].found, false);
  assertEquals(locs[1].heading, null);
});

Deno.test("needsParse", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();
  assertEquals(needsParse(null, 7, now), true);
  assertEquals(needsParse({ url_key: "a", parse_status: "pending", parsed_at: null }, 7, now), true);
  assertEquals(needsParse({ url_key: "a", parse_status: "ok", parsed_at: ago(6.9) }, 7, now), false);
  assertEquals(needsParse({ url_key: "a", parse_status: "ok", parsed_at: ago(7) }, 7, now), true);
  assertEquals(needsParse({ url_key: "a", parse_status: "failed", parsed_at: ago(0.5) }, 7, now), false);
  assertEquals(needsParse({ url_key: "a", parse_status: "failed", parsed_at: ago(1.1) }, 7, now), true);
});

// ------------------------------------------------------------------ ensurePages against a stub DataForSEO

function dfsPage(markdown: string, statusCode = 200) {
  return {
    status_code: 20000, status_message: "Ok.", tasks: [{
      id: "t", status_code: 20000, status_message: "Ok.", data: {},
      result: [{ items: [{ type: "content_parsing_element", status_code: statusCode, page_content: null, page_as_markdown: markdown }] }],
    }],
  };
}

Deno.test("ensurePages parses missing and stale pages, keeps fresh ones, records failures", async () => {
  const calls: string[] = [];
  const server = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
    const body = await req.json();
    const url: string = body[0].url;
    calls.push(url);
    if (url.includes("broken")) {
      return Response.json({
        status_code: 20000, status_message: "Ok.",
        tasks: [{ id: "t", status_code: 40400, status_message: "Not Found.", data: {}, result: null }],
      });
    }
    if (url.includes("gone")) return Response.json(dfsPage("", 404));
    return Response.json(dfsPage(`# Page for ${url}\n\nTally is the best free form builder.\n`));
  });
  Deno.env.set("DATAFORSEO_BASE_URL", `http://127.0.0.1:${server.addr.port}`);
  const db = serviceClient();
  const tag = `pages-test-${crypto.randomUUID().slice(0, 8)}`;
  const keys = ["fresh", "stale", "new", "broken", "gone"].map((k) => `${tag}.example.com/${k}`);
  try {
    const old = new Date(Date.now() - 8 * 86_400_000).toISOString();
    await db.from("pages").insert([
      { url_key: keys[0], url: `https://${keys[0]}`, reg_domain: "example.com", parse_status: "ok", parsed_at: new Date().toISOString(), markdown: "# Fresh", tag_status: "done", tags: { topics: [] } },
      { url_key: keys[1], url: `https://${keys[1]}`, reg_domain: "example.com", parse_status: "ok", parsed_at: old, markdown: "# Old", tag_status: "done", tags: { topics: [] } },
    ]).throwOnError();

    const r = await ensurePages(keys.map((k) => ({ url_key: k, url: `https://${k}#:~:text=frag` })), 7, 2);
    assertEquals(r.fresh, [keys[0]]);
    assertEquals(r.parsed.sort(), [keys[1], keys[2]].sort());
    assertEquals(r.failed.sort(), [keys[3], keys[4]].sort());
    assertEquals(calls.length, 4, "the fresh page is not parsed again");
    assert(calls.every((u) => !u.includes("#")), "text fragments are stripped before parsing");

    const { data } = await db.from("pages").select("*").in("url_key", keys).throwOnError();
    const row = (k: string) => data!.find((p: any) => p.url_key === k);
    assertEquals(row(keys[0]).markdown, "# Fresh");
    assertEquals(row(keys[0]).tag_status, "done");
    assertEquals(row(keys[1]).parse_status, "ok");
    assertEquals(row(keys[1]).tag_status, "none", "a re-parsed page is tagged again");
    assertEquals(row(keys[1]).tags, null);
    assert(row(keys[1]).markdown.includes("Tally is the best free form builder"));
    assertEquals(row(keys[2]).parse_status, "ok");
    assertEquals(row(keys[2]).reg_domain, "example.com");
    assertEquals(row(keys[2]).outline, [{ level: 1, text: `Page for https://${keys[2]}` }]);
    assertEquals(row(keys[2]).measures.word_count, 9);
    assertEquals(row(keys[3]).parse_status, "failed");
    assert(row(keys[3]).parse_error.includes("40400"));
    assertEquals(row(keys[4]).parse_status, "failed");
    assertEquals(row(keys[4]).parse_error, "HTTP 404");

    // A second run within the retry window parses nothing.
    calls.length = 0;
    const again = await ensurePages(keys.map((k) => ({ url_key: k, url: `https://${k}` })));
    assertEquals(calls.length, 0);
    assertEquals(again.fresh.length, 5);
    assertEquals((await ensurePages([])).parsed, []);
  } finally {
    await db.from("pages").delete().in("url_key", keys);
    await server.shutdown();
  }
});
