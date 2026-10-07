# Legiit Overviews: build plan

Automates Jake Ward's process (`docs/source-thread.md`): pick a query, capture its Google AI Overview every day for 7 days, find the patterns with AI, reverse-engineer the cited pages, get a brief for a better page, then track whether your page gets cited.

**Stack: DataForSEO + Claude API + Supabase.** The only other pieces are a frontend host (Next.js on Vercel) and Stripe when you start charging.

| Piece | Does |
|---|---|
| DataForSEO SERP API | Captures the AI Overview: answer text, every citation with the passage Google used, organic top 20 |
| DataForSEO On-Page API | Parses each cited page into headings, text, tables and author |
| Claude API | Reads 7 days of overviews plus the cited pages and returns patterns, page breakdowns and the brief |
| Supabase | Postgres, auth, row-level security, Edge Functions, scheduled jobs (Cron) |

---

## 1. How it works

1. **Add a query.** User enters keyword, country, language, device. The `add-query` function calls DataForSEO Live to confirm an AI Overview appears and saves that as day 1.
2. **Capture daily.** Supabase Cron runs `capture-daily` each morning. It submits every tracked query to DataForSEO's task queue. DataForSEO posts each result to the `dataforseo-postback` function, which saves a snapshot.
3. **Count.** A SQL view counts how many days each domain and URL was cited.
4. **Analyse at day 7.** `process-reports` runs hourly. For each query with 7 or more snapshots and no report, it parses the 10 most-cited pages with DataForSEO On-Page, then sends one Claude request with all snapshots, the citation counts and the parsed pages. Claude returns recurring claims, entities, formats, differences, a breakdown of each cited page, the gaps between them, and the brief. The request goes through the Batch API; the next hourly run collects the result.
5. **Brief.** The report page shows the patterns, the page breakdowns and the brief, with a Markdown export.
6. **Track.** User adds their own URL. Every new snapshot records whether that URL or domain is cited. The query page shows a day-by-day timeline.

---

## 2. APIs

### DataForSEO

Auth is HTTP Basic with your DataForSEO login and password.

| Use | Endpoint | Notes |
|---|---|---|
| Confirm on add | `POST /v3/serp/google/organic/live/advanced` | $0.002 plus $0.002 for the async overview |
| Daily capture | `POST /v3/serp/google/organic/task_post` | Standard queue, about 5 minutes, $0.0006 plus $0.0006; up to 100 tasks per request; results arrive at `postback_url` |
| Cited pages | `POST /v3/on_page/content_parsing/live` | Returns `page_content.main_topic[]` with `h_title`, `level`, `primary_content`, `table_content`, `author`; check the per-page price on the pricing page |
| Locations | `GET /v3/serp/google/locations` | For the country picker |

Task parameters for both SERP calls:

```json
{
  "keyword": "best form builder",
  "location_code": 2840,
  "language_code": "en",
  "device": "desktop",
  "depth": 20,
  "load_async_ai_overview": true,
  "tag": "<query id>",
  "postback_url": "https://<project>.supabase.co/functions/v1/dataforseo-postback",
  "postback_data": "advanced"
}
```

What to keep from the result: the item with `type: "ai_overview"` holds `markdown`, `items[]` (sections, each with `references[]`) and `references[]`; each reference has `url`, `domain`, `title`, `source` and `text` (the passage Google used). Items with `type: "organic"` are the organic results. Read the query id back from `tasks[0].data.tag`. The postback body is gzip-compressed; decompress it with `DecompressionStream("gzip")`. Store the raw `ai_overview` item as JSON so nothing is lost.

### Claude

One structured-output request per report, sent through the Message Batches API from an Edge Function with `npm:@anthropic-ai/sdk`. The model ID lives in one constant in `supabase/functions/_shared/claude.ts`.

```ts
const batch = await anthropic.messages.batches.create({
  requests: due.map((r) => ({
    custom_id: `report:${r.id}`,
    params: {
      model: MODEL, // "claude-opus-5-5"
      max_tokens: 32000,
      system: REPORT_PROMPT,
      messages: [{ role: "user", content: buildReportInput(r) }],
      output_config: { format: { type: "json_schema", schema: REPORT_SCHEMA } },
    },
  })),
});
// Later run: when batches.retrieve(id).processing_status === "ended",
// iterate batches.results(id), match on custom_id, skip anything whose
// stop_reason is "refusal" or "max_tokens", JSON.parse the text block.
```

Report schema (what Claude returns):

```
patterns:
  recurring_claims[]   { claim, days_seen }
  entities[]           { name, days_seen, role: recommended | cited_source }
  formats[]            { format, days_seen }   e.g. ranked list with "best for" labels
  differences[]        { what_changed, days }
cited_pages[]          { url, days_cited, words_before_answer, structure, topics[],
                         evidence[], what_it_does_differently }
gaps[]                 things the overview asks for that no cited page answers well
brief:
  answer_first         the 1 to 2 sentences to open with
  must_cover[]         topics, with why
  entities[]           names to include
  format               table / list structure to use
  outline[]            { heading, level, notes }
  new_to_cite[]        original data, tests, stats, comparisons, unanswered questions
  checklist[]          indexable, no nosnippet, author and date visible, schema
```

The input is the snapshots' overview markdown with their dates, the citation counts from SQL, and the parsed cited pages trimmed to their headings, main text and tables.

---

## 3. Database (Supabase)

One migration, `supabase/migrations/0001_init.sql`.

```sql
create table queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  keyword text not null,
  location_code int not null,
  language_code text not null,
  device text not null check (device in ('desktop','mobile')),
  own_url text,
  status text not null default 'tracking' check (status in ('tracking','no_overview','paused')),
  created_at timestamptz not null default now()
);

create table snapshots (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references queries on delete cascade,
  captured_at timestamptz not null default now(),
  has_overview boolean not null,
  overview_markdown text,
  overview jsonb,          -- raw ai_overview item from DataForSEO
  citations jsonb,         -- [{url, domain, title, passage}]
  organic jsonb,           -- [{rank, url, domain}]
  own_url_cited boolean,
  own_domain_cited boolean
);
create index on snapshots (query_id, captured_at desc);

create table cited_pages (
  url text primary key,
  fetched_at timestamptz not null default now(),
  content jsonb            -- DataForSEO page_content
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  query_id uuid not null references queries on delete cascade,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','ready','failed')),
  batch_id text,
  result jsonb,            -- the report schema above
  brief_markdown text
);

create view citation_counts as
select s.query_id,
       c->>'domain' as domain,
       c->>'url'    as url,
       count(distinct date(s.captured_at)) as days_cited
from snapshots s, jsonb_array_elements(s.citations) c
group by 1, 2, 3;
```

Row-level security: users see only their own `queries`, and `snapshots` and `reports` whose query they own. Edge Functions use the service role. `cited_pages` is a shared cache read only by functions. Set `security_invoker = true` on the view.

---

## 4. Edge Functions and schedules

| Function | Trigger | Job |
|---|---|---|
| `add-query` | Called from the app | Validate input, DataForSEO Live call, insert query and first snapshot; set `no_overview` if none |
| `capture-daily` | Supabase Cron, daily 06:00 UTC | Submit all `tracking` queries to `task_post`, 100 per request |
| `dataforseo-postback` | DataForSEO | Decompress, extract overview, citations and organic, compute own-URL match, insert snapshot |
| `process-reports` | Supabase Cron, hourly | Collect finished batches into `reports`; for queries with 7+ snapshot days and no report, parse the top 10 cited pages (cached 7 days in `cited_pages`) and submit one batch |

Secrets: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `ANTHROPIC_API_KEY`.

Own-URL match: lowercase the host, drop `www.`, the query string, the fragment and the trailing slash, then compare. `own_url_cited` is an exact match; `own_domain_cited` is a host match.

---

## 5. Frontend

Next.js with `@supabase/ssr`, deployed on Vercel.

- Login (Supabase Auth magic link).
- Queries list with status and days captured.
- Add query: keyword, country, language, device.
- Query page: today's overview with its citations; day-by-day timeline; citation counts table; after day 7 the report (patterns, cited-page breakdowns, gaps) and the brief with a Markdown download; own-URL field and a "cited on these days" strip.

---

## 6. Build steps for Claude Code

Do these in order, one per session. Each ends with a "done when" check.

1. **Supabase project and schema.** `supabase init`, the migration above with RLS policies, `supabase db reset` locally. Done when the tables exist and a test user can only read their own rows.
2. **DataForSEO client and `add-query`.** `supabase/functions/_shared/dataforseo.ts` (Live, task_post, content_parsing, response parsing into overview, citations and organic) and the `add-query` function. Save 3 real Live responses under `supabase/functions/_shared/fixtures/` and test the parser against them. Done when adding "best form builder" stores a snapshot with citations.
3. **Daily capture.** `capture-daily`, `dataforseo-postback`, and the Cron schedule in a migration. Done when a manual run of `capture-daily` produces new snapshots via the postback within 10 minutes.
4. **Reports.** `_shared/claude.ts` (model constant, prompt, schema, input builder) and `process-reports`. Done when a query with 7 seeded snapshots gets a `ready` report with patterns, cited pages and a brief.
5. **App shell.** Next.js app, Supabase Auth, queries list, add-query form. Done when you can sign up, add a query and see it listed.
6. **Query page.** Overview and citations, timeline, citation counts, report, brief download. Done when every section renders for a seeded query.
7. **Own-page tracking.** Own-URL field, match logic in the postback, the cited-days strip. Done when a seeded snapshot citing the user's URL shows on the strip.
8. **Billing (when ready to charge).** Stripe Checkout and a webhook Edge Function that sets a plan on the user; limit tracked queries per plan. Done when a test-mode purchase raises the query limit.

---

## 7. Rough costs

| Item | Cost |
|---|---|
| Daily capture | $0.0012 per query per day, about $0.04 per query per month |
| Confirm on add | $0.004 per query |
| One report (Opus 5.5, batch) | roughly $0.20 to $0.40, depending on page lengths |
| Cited-page parsing | 10 pages per report; check DataForSEO's price |
| Supabase | Free to build; Pro $25/month in production for the 400-second function limit |

The report figure is an estimate; log `usage` from each batch result to see the real number.

Pricing to start with: Free (1 query, 7 days, brief locked), $39/month for 10 queries, $99/month for 25.
