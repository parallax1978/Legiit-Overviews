# Legiit Overviews: build plan

Automates Jake Ward's process (`docs/source-thread.md`) end to end: pick a query, capture its Google AI Overview around the clock, find exactly what keeps showing up with evidence for every count, reverse-engineer the cited pages, generate a brief for a better page, then track whether and where your page gets cited.

**Stack: DataForSEO + Claude API + Supabase.** Outside those three: Vercel hosts the Next.js app, Stripe takes payments, Resend sends alert emails.

| Piece | Does |
|---|---|
| DataForSEO SERP API | Captures the AI Overview: sections, every citation with the passage Google used, organic top 20 |
| DataForSEO Labs API | Checks whether a query triggers an overview and suggests sibling queries that do |
| DataForSEO On-Page API | Parses each cited page and the user's own page into headings, text and tables |
| Claude API | Extracts atomic claims and entities from each capture, groups matching claims, analyses cited pages, writes the coverage matrix, brief and draft scores |
| Supabase | Postgres, auth, row-level security, Storage, Edge Functions, Cron |

---

## 1. Product, mapped to the thread

| Thread step | Product |
|---|---|
| 1. Pick a buying-intent query that triggers an AI Overview | Add-query flow confirms an overview appears, suggests sibling queries that trigger one, and joins a shared series so popular queries come with history |
| 2. Track it over 7+ days | Captured every 3 hours (8 a day) per device, desktop and/or mobile, indefinitely |
| 3. Find recurring claims, entities, formats, sources, differences, and count them | Claude extracts atomic claims and entities from every capture and maps them to canonical claims; the database counts them exactly; every count opens the captures and sentences behind it |
| 4. Study the most-cited pages | Each cited page is parsed; structure is measured in code; Claude tags topics, entities, evidence and questions answered; Google's cited passage is located in the page; a coverage matrix shows what all winners share, what none covers, and which overview claims no page supports |
| 5. Build something better | Brief with an answer-first lead, must-cover topics and entities with recurrence, required format, outline, and "new to cite" opportunities, each item linked to its evidence; a draft scorer checks a draft against the brief and the winners |
| 6. Publish and track | Own-page tracking at six match levels, which section of your page Google quoted, first-seen / lost / regained alerts, rolling survival, and Google-wide change detection so a platform shift isn't reported as your loss |

---

## 2. Capture

### Cadence

Every series is captured every 3 hours: 8 renders a day per device. AI Overviews change between most observations and vary as much within a day as across days, so this cadence gives 56 renders in the first week instead of 7, which makes the recurrence percentages and survival buckets trustworthy. Each series gets a random start offset so captures spread evenly across the 3-hour window.

### Shared series

A series is one (normalised keyword, location, language, device). Every user tracking the same series shares its captures and analysis, so a second user adding a popular query sees its history immediately and it costs nothing extra to capture. Keyword normalisation: Unicode NFKC, trim, collapse whitespace, lowercase, strip trailing punctuation. Search operators (`site:`, `inurl:`, quotes, minus) are rejected because DataForSEO charges 5x for them.

### DataForSEO calls

Auth is HTTP Basic with the DataForSEO login and password.

| Use | Endpoint | Notes |
|---|---|---|
| Trigger pre-check and siblings | `POST /v3/dataforseo_labs/google/related_keywords/live` | Keep rows whose `serp_info.serp_item_types` contains `ai_overview` |
| Confirm on add | `POST /v3/serp/google/organic/live/advanced` | $0.002 plus $0.002 for the async overview |
| Scheduled capture | `POST /v3/serp/google/organic/task_post` | Standard queue, about 5 minutes, $0.0006 plus $0.0006; up to 100 tasks per request; results posted to `postback_url` |
| Missed postback | `GET /v3/serp/google/organic/task_get/advanced/{id}` | Used by the sweeper |
| Cited and own pages | `POST /v3/on_page/content_parsing/live` | `page_content.main_topic[]` with `h_title`, `level`, `primary_content`, `table_content`, `author` |
| Countries | `GET /v3/serp/google/locations` | Seeds the `locations` table |

Task parameters:

```json
{
  "keyword": "best form builder",
  "location_code": 2840,
  "language_code": "en",
  "device": "desktop",
  "os": "windows",
  "depth": 20,
  "load_async_ai_overview": true,
  "priority": 1,
  "tag": "<capture id>",
  "postback_url": "https://<project>.supabase.co/functions/v1/dataforseo-postback?secret=<secret>",
  "postback_data": "advanced"
}
```

Parsing the result: the item with `type: "ai_overview"` holds `markdown`, `asynchronous_ai_overview`, `items[]` (sections: `ai_overview_element` with `title`, `text`, `references[]`; `ai_overview_table_element`; `ai_overview_expanded_element` with `components[]`; `ai_overview_video_element`) and top-level `references[]`. Each reference has `url`, `domain`, `title`, `source` and `text`, the passage Google used from that page. Items with `type: "organic"` are the organic results. The capture id comes back in `tasks[0].data.tag`. The postback body is gzip-compressed. Unknown section types are kept with their raw text, never dropped. The full raw payload is saved to Supabase Storage.

### Capture statuses

`present` (overview shown), `absent` (no overview on that render), `error` (DataForSEO failed after 3 attempts). Every metric uses renders as the denominator and excludes `error` renders.

---

## 3. Finding the patterns (exact counts with evidence)

### Step A: extract and match, per unique capture

Identical captures are detected by a hash of the normalised overview text; a capture identical to an earlier one in the series reuses that capture's claims and costs nothing. Every new version goes to Claude in a batch. The input is:

- the keyword and language;
- the overview sections, each split into numbered sentences with the citation indexes attached to that section;
- the series' current canonical claims (`id: text`) and entities (`id: name`).

Claude returns, with structured output:

```
claims[]    { section, sentence, text (one self-contained atomic claim),
              type: recommendation | fact | comparison | definition | step | caveat,
              citation_idx[], cluster_id (existing canonical claim) or null,
              new_label (when no existing claim matches) }
entities[]  { entity_id or null, name, role: recommended | mentioned, label (e.g. "best free option") }
format      { labels[] (ranked_list, bullets, table, pros_cons, best_for_labels, steps),
              answer_lead_sentence }
```

Claims follow the Claimify method: split into sentences, keep verifiable ones, resolve references like "it", and break compound sentences into atomic claims that stand alone. A new canonical claim is created for every `new_label`. Every claim row keeps its capture, section, sentence and citations, so every count in the app opens the exact captures and sentences behind it.

### Step B: consolidate, nightly per series

Captures in the same batch can't see each other's new claims, so the same claim can be created twice. Each night, for every series that gained canonical claims or entities that day, Claude gets the full list with counts and returns merge groups (for example, "Tally" and "Tally Forms" become one entity). Merges are applied in the database; nothing is deleted, the merged id points to the survivor.

### Step C: count, in SQL

All of these are exact database counts over a window (first 7 days, then rolling 7 and 28 days), each shown with its sample size `n`:

| Metric | Definition |
|---|---|
| Presence rate | renders with an overview / renders |
| Claim recurrence | renders containing the claim / renders with an overview |
| Entity recurrence | renders mentioning the entity / renders with an overview, split into recommended vs mentioned |
| Source survival | renders citing the URL (and the domain) / renders with an overview; CORE at 80% or more, RECURRING 40 to 80%, ROTATING under 40% |
| Citation stability | mean pairwise overlap of the cited-URL sets across renders |
| Format frequency | share of renders with each format label; median word count; answer-lead position |
| Organic overlap | share of cited URLs that also rank in the organic top 10 and top 20 of the same render |
| Change rate | share of renders whose content differs from the previous render |
| Differences | claims, entities and citations added or dropped from one day to the next |
| Unsupported claims | recurring claims whose sentences carry no citation |

Labels: confidence is low under 10 renders, medium 10 to 20, high above 20. A preliminary report unlocks at 3 days; the full report at day 7.

### Matching accuracy

Before launch, build a labelled set of 200 claim pairs from real captures (same claim or not) and measure how often Step A plus Step B agree with the labels. Target 90% or better. Re-run it whenever the prompt or model changes.

---

## 4. Reverse-engineering the cited pages

For the 10 most-cited pages of a series (by source survival) plus any page the user adds:

1. **Parse** with DataForSEO On-Page. Pages are shared across all users and re-parsed after 7 days.
2. **Measure in code:** words before the first direct answer, heading outline, number and size of tables, lists and their item counts, comparison blocks (a table or list naming two or more entities), numbers per 100 words, author, published and updated dates, word count, internal and external link counts, FAQ section present.
3. **Locate Google's passage:** find each reference `text` inside the parsed page and record the heading it sits under and how far down the page it is. This shows exactly which part of each page Google quotes.
4. **Tag with Claude** (one batch request per page): topics covered, entities named, evidence items (original data, test results, screenshots, quotes, pricing, specs), questions answered, the sentence that first answers the query, and a short summary of the page's approach.
5. **Coverage matrix** (one Claude request per report): topics and entities against pages, each cell covered / partial / missing; what all winners have in common; gaps no winner fills; and the overview claims no cited page supports. Platform pages (YouTube, Reddit, Facebook, Quora, Wikipedia) are reported as their own group with a note that the answer there is a platform presence, not a page.

---

## 5. The brief and the draft scorer

### Brief

One Claude request per report (high effort) with the metrics, canonical claims and entities with recurrence, format frequencies, page measurements and tags, Google's passage locations, the coverage matrix and the unsupported claims. Every item carries `evidence` (claim, entity, page or matrix ids) so the app can show why it's there.

```
answer_first      the 1 to 2 sentences to open with, and the word budget (winners' median)
must_cover[]      { topic, recurrence, claim_ids[] }
entities[]        { name, recurrence, role, note }
format            { structure, table_columns[], list_items }
evidence_to_match[]  what the winners back their claims with
new_to_cite[]     { idea, why_google_lacks_it, how_to_produce, evidence[] }
                  (original data, first-hand tests, new stats, better comparisons,
                   useful tables, questions nobody answered, unsupported claims to own)
questions[]       sub-questions the overview keeps answering
outline[]         { heading, level, purpose, target_words, covers[] }
checklist[]       indexable, no nosnippet, text in HTML, author and date visible, schema types
avoid[]           what the overview never includes
```

Checks in code before a brief is saved: every must-cover topic maps to a claim with at least 40% recurrence; every entity appears in at least 2 renders; the outline covers every must-cover topic. Export is Markdown. A new brief is offered automatically at day 28 with a diff against the first.

### Draft scorer

The user pastes a draft or a URL. Code measures it exactly like a cited page and compares it with the winners' medians and the brief: topic coverage, entity coverage, format match, words before the answer, evidence density, technical checklist. Then one Claude request scores the "new to cite" items and clarity and returns a prioritised fix list. Result: a 0 to 100 score with sub-scores.

---

## 6. Tracking after publish

- **Own page:** the user adds their URL and brand names. The page is parsed with DataForSEO On-Page and re-parsed weekly.
- **Match levels**, checked on every capture: exact URL, same page after redirects and canonical tags, same path prefix, same subdomain, same domain, brand mentioned in the answer. URLs are compared after lowercasing the host and removing `www.`, tracking parameters, the fragment and the trailing slash. Platform domains (YouTube, Reddit, Medium, LinkedIn, Facebook, Quora) only count at exact URL or path prefix.
- **Which section was quoted:** the reference `text` for the user's page is located in their parsed page, giving the heading Google pulled from.
- **Events:** first seen (immediately), lost (absent from every capture for 2 consecutive days), regained. Rolling 7- and 28-day survival.
- **Google-wide changes:** each day, across every series in the system, compute presence rate, citations per overview and how many cited domains changed versus the previous week. A jump beyond normal variation records a platform event, shows a banner, and holds back "lost" alerts that day.
- **Alerts:** in-app, plus email through Resend (first seen, lost, regained, report ready, daily digest of what changed).

---

## 7. Claude

All model IDs live in `supabase/functions/_shared/claude.ts`. Default for every task: `claude-opus-5-5`. Scheduled work runs through the Message Batches API (half price, results usually within an hour). Structured outputs use `output_config.format` with a JSON schema; `stop_reason` is checked before parsing.

| Task | Mode | Effort |
|---|---|---|
| A. Extract and match claims | Batch, per unique capture | low |
| B. Consolidate claims and entities | Batch, nightly per series | low |
| C. Tag a cited page | Batch, per page | low |
| D. Coverage matrix and brief | Batch, per report | high |
| E. Score a draft | Live request, run as a background task | medium |

```ts
// supabase/functions/_shared/claude.ts (shape)
export const MODELS = {
  extract: "claude-opus-5-5",
  consolidate: "claude-opus-5-5",
  pageTag: "claude-opus-5-5",
  brief: "claude-opus-5-5",
  draftScore: "claude-opus-5-5",
};

const batch = await anthropic.messages.batches.create({
  requests: pending.map((s) => ({
    custom_id: `extract:${s.id}`,
    params: {
      model: MODELS.extract,
      max_tokens: 16000,
      system: [{ type: "text", text: EXTRACT_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: buildExtractInput(s) }],
      output_config: { effort: "low", format: { type: "json_schema", schema: EXTRACT_SCHEMA } },
    },
  })),
});
```

The draft scorer is a live request; it also sends `fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta header so a declined request is retried on another model automatically. If any task is moved to Haiku 4.5, drop its `effort` setting; Haiku 4.5 does not accept it.

---

## 8. Database (Supabase)

```sql
-- reference
create table locations (
  code int primary key, name text not null, country_iso text not null, timezone text not null
);

-- shared capture pool
create table series (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,                 -- normalised
  location_code int not null references locations,
  language_code text not null,
  device text not null check (device in ('desktop','mobile')),
  next_capture_at timestamptz not null,  -- random offset, then +3 hours each capture
  subscribers int not null default 0,
  created_at timestamptz not null default now(),
  unique (keyword, location_code, language_code, device)
);

create table captures (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series on delete cascade,
  scheduled_at timestamptz not null,
  task_id text,
  attempts int not null default 0,
  status text not null default 'submitted' check (status in ('submitted','received','error')),
  unique (series_id, scheduled_at)
);

create table snapshots (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series on delete cascade,
  capture_id uuid references captures,
  captured_at timestamptz not null,
  status text not null check (status in ('present','absent','error')),
  overview_markdown text,
  content_hash text,
  same_as uuid references snapshots,     -- identical earlier capture whose claims are reused
  raw_path text,                         -- Supabase Storage
  organic jsonb,                         -- [{rank, url, domain}]
  formats jsonb,                         -- labels, word_count, answer_lead
  extraction text not null default 'pending'
    check (extraction in ('pending','submitted','done','reused','none'))
);
create index on snapshots (series_id, captured_at desc);

create table sections (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references snapshots on delete cascade,
  position int not null, kind text not null, title text, text text not null,
  citation_idx int[] not null default '{}'
);

create table citations (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references snapshots on delete cascade,
  idx int not null, url text not null, url_key text not null,  -- normalised
  domain text not null, title text, source text, passage text
);
create index on citations (url_key);

create table claim_groups (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series on delete cascade,
  label text not null,
  merged_into uuid references claim_groups,
  created_at timestamptz not null default now()
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references snapshots on delete cascade,
  group_id uuid not null references claim_groups,
  section int not null, sentence int not null,
  text text not null, type text not null,
  citation_idx int[] not null default '{}'
);

create table entities (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references series on delete cascade,
  name text not null, aliases text[] not null default '{}',
  merged_into uuid references entities
);

create table entity_mentions (
  entity_id uuid not null references entities,
  snapshot_id uuid not null references snapshots on delete cascade,
  claim_id uuid references claims,
  role text not null check (role in ('recommended','mentioned')),
  label text
);

-- pages (shared)
create table pages (
  url_key text primary key, url text not null,
  parsed_at timestamptz, parsed jsonb,      -- DataForSEO page_content
  measures jsonb,                           -- code measurements
  tags jsonb, tagged_at timestamptz         -- Claude page tags
);

-- per user
create table tracked_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  series_id uuid not null references series,
  display_keyword text not null,
  own_url text, brand_names text[] not null default '{}',
  status text not null default 'tracking' check (status in ('watching','tracking','paused')),
  created_at timestamptz not null default now(),
  unique (user_id, series_id)
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  tracked_query_id uuid not null references tracked_queries on delete cascade,
  kind text not null check (kind in ('preliminary','full','refresh')),
  window_start timestamptz not null, window_end timestamptz not null,
  renders int not null,
  metrics jsonb, matrix jsonb, brief jsonb, brief_markdown text,
  stage text not null default 'pages' check (stage in ('pages','brief','ready','failed')),
  created_at timestamptz not null default now()
);

create table draft_scores (
  id uuid primary key default gen_random_uuid(),
  tracked_query_id uuid not null references tracked_queries on delete cascade,
  source text not null, input text not null,
  result jsonb, status text not null default 'running',
  created_at timestamptz not null default now()
);

create table citation_events (
  id uuid primary key default gen_random_uuid(),
  tracked_query_id uuid not null references tracked_queries on delete cascade,
  snapshot_id uuid references snapshots,
  level text not null, kind text not null check (kind in ('first_seen','lost','regained','brand_mention')),
  quoted_heading text, held_for_platform_event boolean not null default false,
  created_at timestamptz not null default now()
);

-- system
create table batches (
  id text primary key, kind text not null, status text not null default 'in_progress',
  created_at timestamptz not null default now(), ended_at timestamptz
);
create table platform_events (
  id uuid primary key default gen_random_uuid(), day date not null unique, metrics jsonb not null
);
create table accounts (
  user_id uuid primary key references auth.users on delete cascade,
  plan text not null default 'free', query_limit int not null default 1,
  stripe_customer_id text
);
```

Row-level security: users read and write their own `tracked_queries`, `reports`, `draft_scores`, `citation_events` and `accounts` row. They read `series`, `snapshots`, `sections`, `citations`, `claims`, `claim_groups`, `entities`, `entity_mentions` and `pages` only for series they track (a policy joining `tracked_queries`). Edge Functions use the service role. Metrics are SQL functions taking a series id and a window.

---

## 9. Edge Functions and schedules

| Function | Trigger | Job |
|---|---|---|
| `add-query` | App | Normalise, Labs pre-check with siblings, Live confirm, join or create the series, create the tracked query (`watching` when no overview appears) |
| `schedule-captures` | Cron, every 10 min | Submit every series whose `next_capture_at` has passed, 100 per request; advance `next_capture_at` by 3 hours |
| `dataforseo-postback` | DataForSEO | Verify secret, decompress, save raw to Storage, write snapshot, sections, citations and organic; set `same_as` when the content hash matches; run own-page matching for every subscriber |
| `sweep-captures` | Cron, every 30 min | `task_get` captures with no postback after 20 minutes; mark `error` after 3 attempts |
| `submit-batches` | Cron, every 15 min | One Claude batch per task type from pending work: extractions, nightly consolidations, page tags, briefs |
| `collect-batches` | Cron, every 5 min | Write finished batch results into claims, groups, entities, pages and reports; queue the next stage |
| `build-reports` | Cron, hourly | Create preliminary (day 3), full (day 7) and day-28 refresh reports; compute metrics; parse and measure the top cited pages; queue page tags, then the matrix and brief |
| `score-draft` | App | Measure the draft, run Claude task E as a background task, write the result |
| `detect-platform-events` | Cron, daily | Cross-series change detection |
| `notify` | Cron, every 15 min | In-app notifications and Resend emails, including the daily digest |
| `stripe-webhook` | Stripe | Set plan and query limit |

Secrets: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `ANTHROPIC_API_KEY`, `POSTBACK_SECRET`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

---

## 10. App (Next.js on Vercel)

- **Auth:** Supabase magic link and Google sign-in.
- **Queries:** list with status, renders captured, presence rate, own-page status.
- **Add query:** keyword, country, language, device (desktop, mobile or both); sibling suggestions when no overview appears.
- **Query page tabs:**
  - *Live:* latest overview with citation chips, capture timeline with statuses, today's changes.
  - *Patterns:* recurring claims, entities (recommended vs mentioned), formats, sources with survival buckets, citation stability, organic overlap, day-to-day differences, unsupported claims; every number shows `n` and opens the captures and sentences behind it.
  - *Pages:* each cited page's measurements, tags and where Google's passage sits; the coverage matrix as a heatmap.
  - *Brief:* the brief with evidence links, Markdown export, day-28 diff.
  - *Draft score:* paste text or a URL, get the score and fix list.
  - *Tracking:* own URL, match level per day, quoted section, survival, events, platform-event banner.
- **Billing:** plan picker with Stripe Checkout; query limit enforced by `add-query`.

---

## 11. Build steps for Claude Code

One step per session, in order. Each ends with a check.

1. **Schema.** `supabase init`, migration with every table above, RLS policies, locations seed. Check: a test user reads only their own rows and only series they track.
2. **DataForSEO client and parser.** `_shared/dataforseo.ts`: Labs, Live, task_post, task_get, content_parsing, and a parser from the raw response to snapshot, sections, citations, organic and formats. Capture 30 real Live responses across query types into `_shared/fixtures/` and test the parser on all of them. Check: every fixture parses, every section type is handled, nothing is dropped.
3. **Add query.** `add-query` with normalisation, pre-check, confirm, series join or create. Check: two users adding "best form builder" share one series and the second sees existing captures.
4. **Scheduled capture.** `schedule-captures`, `dataforseo-postback`, `sweep-captures`, cron jobs, Storage bucket. Check: a series captures 8 times in 24 hours; duplicate postbacks don't create duplicate snapshots; identical content sets `same_as`.
5. **Extraction and matching.** `_shared/claude.ts`, task A prompt and schema, `submit-batches`, `collect-batches`. Check: a seeded series with 56 captures ends with claims on every unique capture, reused claims on identical ones, and canonical groups created.
6. **Consolidation and accuracy.** Task B, merge application, the 200-pair labelled set and a script that scores matching. Check: matching agrees with the labels at least 90% of the time; "Tally" and "Tally Forms" end as one entity.
7. **Metrics.** SQL functions for every metric in section 3 with `n` and confidence. Check: values on a hand-built fixture series equal hand-computed answers.
8. **Cited pages.** Page selection, parsing, code measurements, passage location, task C. Check: 10 saved pages measure to hand-checked values and each reference passage is located under the right heading.
9. **Matrix and brief.** `build-reports`, task D, code checks on the brief, Markdown export. Check: a seeded series produces a full report whose every brief item links to existing evidence.
10. **App.** Auth, queries list, add query, query page tabs (Live, Patterns, Pages, Brief). Check: every tab renders for a seeded series and every count opens its evidence.
11. **Tracking and draft scorer.** Own-page parsing, match levels, quoted section, events, `score-draft`, Tracking and Draft score tabs. Check: a seeded capture citing the user's URL creates a first-seen event naming the quoted heading; a copy of the top cited page scores high on coverage.
12. **Platform events, alerts, billing.** `detect-platform-events`, `notify` with Resend, `stripe-webhook`, plan limits. Check: a seeded Google-wide shift records a platform event and holds back lost alerts; a test-mode purchase raises the query limit.

---

## 12. Costs and pricing

Per tracked query per month, one device, 8 captures a day (240 renders):

| Item | Opus 5.5 everywhere | Extraction on Haiku 4.5 instead |
|---|---|---|
| Capture (DataForSEO) | $0.29 | $0.29 |
| Extraction and matching (about 60% of renders are new content) | about $3.00 | about $0.70 |
| Consolidation | about $0.30 | about $0.30 |
| Reports, page tags and briefs | about $0.60 | about $0.60 |
| **Total** | **about $4.20** | **about $1.90** |

Extraction runs on every new version of the overview, so it is most of the cost. Its model is one line in `claude.ts`. The plan defaults to Opus 5.5 for the best extraction; moving extraction alone to Haiku 4.5 roughly halves the cost per query. Haiku 4.5's retirement date is "not sooner than 2026-10-15", so check its status before choosing it. These are estimates from assumed token counts; log the `usage` of every batch result and replace them with real numbers after step 5.

Pricing that keeps roughly 50 to 60% gross margin at the Opus figure:

| Plan | Price | Queries (one device each) |
|---|---|---|
| Free | $0 | 1 query for 7 days, full patterns, brief locked |
| Starter | $49/month | 5 |
| Pro | $149/month | 15 |
| Agency | $399/month | 50 |

With extraction on Haiku 4.5, the same prices can carry roughly twice the queries. A free trial costs about $1.50 to serve at the Opus figure.

Supabase: Free while building, Pro ($25/month) in production.
