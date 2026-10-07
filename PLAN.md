# Legiit Overviews: build plan

Automates Jake Ward's process (`docs/source-thread.md`) end to end: pick a query, capture its Google AI Overview around the clock, find exactly what keeps showing up with evidence for every count, reverse-engineer the cited pages, generate a brief for a better page, then track whether and where your page gets cited.

**Stack: DataForSEO + Claude API + Supabase.** Outside those three: Vercel hosts the Next.js app (`web/`), Resend sends email. Billing (Stripe, plans, query limits) is deferred; a fixed per-user query cap bounds spend until then.

| Piece | Does |
|---|---|
| DataForSEO SERP API | Captures the AI Overview: sections, every citation with the passage Google used, organic top 10 |
| DataForSEO Labs API | Suggests sibling queries and flags which ones showed an overview in DataForSEO's stored SERPs |
| DataForSEO On-Page API | Parses each cited page and the user's own page into headings, text and tables |
| Claude API | Extracts atomic claims and entities from each capture, groups matching claims, analyses cited pages, writes the coverage matrix, brief and draft scores |
| Supabase | Postgres, auth, row-level security, Storage, Edge Functions, Cron |

---

## 0. Where things stand (2026-10-07)

Sections 1 to 10 were built in full against a local mock of DataForSEO and the Anthropic API (`mocks/`): 6 migrations, 11 Edge Functions, the Next.js app, 261 pgTAP tests, 117 function tests, 23 mock tests, and an end-to-end demo. The web app typechecks, lints and builds. Four read-only audits on 2026-10-07 rated every area **keep with fixes**; none needs a rewrite.

What has never happened: a single call to api.dataforseo.com or api.anthropic.com, a hosted Supabase project, a Vercel deployment, a real sign-in email. The founder's requirements that are not yet met:

1. **Real data and real APIs from the beginning.** Every check so far ran on mocks; the DataForSEO fixtures are documentation samples, not real responses. Sessions 1 to 4 fix this before any more app work.
2. **Simple for an everyday user.** The app is complete but speaks like an analyst (`n=56`, "survival buckets", "citation stability", "match levels", UTC days). Sessions 5 and 6 rebuild the surface per `docs/design-spec.md`.
3. **Branding.** Verified against the live legiitkeywords.com stylesheet on 2026-10-07: tokens, font, pills and cards match, with two one-line colour fixes (section 10).

Vendor facts below were re-verified on 2026-10-07 against the official documentation and pricing pages; the corrections from the earlier plan are marked **(corrected)**. Prices drift; `GET /v3/appendix/user_data` returns DataForSEO's live price list and balance.

---

## 1. Product, mapped to the thread

| Thread step | Product |
|---|---|
| 1. Pick a buying-intent query that triggers an AI Overview | Add-query flow confirms an overview appears, suggests sibling queries that show one, and joins a shared series so popular queries come with history |
| 2. Track it over 7+ days | Captured every 3 hours (8 a day) per device, desktop or mobile, indefinitely |
| 3. Find recurring claims, entities, formats, sources, differences, and count them | Claude extracts atomic claims and entities from every capture and maps them to canonical claims; the database counts them exactly; every count opens the captures and sentences behind it |
| 4. Study the most-cited pages | Each cited page is parsed; structure is measured in code; Claude tags topics, entities, evidence and questions answered; Google's cited passage is located in the page; a coverage matrix shows what all winners share, what none covers, and which overview claims no page supports |
| 5. Build something better | Brief with an answer-first lead, must-cover topics and entities with recurrence, required format, outline, and "new to cite" opportunities, each item linked to its evidence; a draft scorer checks a draft against the brief and the winners |
| 6. Publish and track | Own-page tracking at six match levels, which section of your page Google quoted, first-seen / lost / regained alerts, rolling survival, and Google-wide change detection so a platform shift isn't reported as your loss |

---

## 2. Capture

### Cadence

Every series is captured every 3 hours: 8 renders a day per device. AI Overviews change between most observations and vary as much within a day as across days, so this cadence gives 56 renders in the first week instead of 7, which makes the recurrence percentages and survival buckets trustworthy. Each series gets a random start offset so captures spread evenly across the 3-hour window.

### Shared series

A series is one (normalised keyword, location, language, device). Every user tracking the same series shares its captures and analysis, so a second user adding a popular query sees its history immediately and it costs nothing extra to capture. Keyword normalisation: Unicode NFKC, trim, collapse whitespace, lowercase, strip trailing punctuation. Search operators (`site:`, `inurl:`, quotes, minus) are rejected because DataForSEO charges 5x for them. One search is one device: "both devices" is gone from the add form; a mobile version is added as a second search.

### DataForSEO calls

Auth is HTTP Basic with the DataForSEO login and the API password from the dashboard (not the account password). Base URL `https://api.dataforseo.com`. Limit: 2,000 API calls per minute, POST and GET together; a `task_post` holds up to 100 tasks (error 40006 above that); a Live call holds one task. Minimum top-up $50; a new account gets $1 of free credit. `https://sandbox.dataforseo.com` is free and returns the same sample response for every call, so it is useful for schema tests only, never for fixtures.

| Use | Endpoint | Notes **(corrected 2026-10-07)** |
|---|---|---|
| Siblings and trigger hint | `POST /v3/dataforseo_labs/google/related_keywords/live` | Must send `include_serp_info: true`, otherwise `serp_info` is null and no row ever shows `ai_overview`. `serp_info.serp_item_types` reflects DataForSEO's stored SERP, dated by `serp_info.last_updated_time`: a hint, not a live check. $0.012 per request plus $0.00012 per returned row (about $0.018 at limit 50) |
| Confirm on add | `POST /v3/serp/google/organic/live/advanced` | $0.002 per 10 results plus $0.002 for `load_async_ai_overview`, refunded when the overview is absent or not asynchronous. Depth 10: $0.004 |
| Scheduled capture | `POST /v3/serp/google/organic/task_post` | Standard queue $0.0006 per 10 results plus $0.0006 for the async overview (same refund rule). Depth 10: $0.0012; depth 20 would be $0.0018. Target turnaround 45 minutes, 5 minutes on average; results posted to `postback_url` gzip-compressed |
| Missed postback | `GET /v3/serp/google/organic/task_get/advanced/{id}` | Results stay for 30 days. `40601` (handed) and `40602` (in queue) mean still pending, never a failed attempt. Tasks posted with a `postback_url` never appear in `tasks_ready` |
| Lost postbacks | `POST /v3/serp/errors`, `POST /v3/appendix/webhook_resend` | Both free: list failed postbacks of the last 7 days, resend up to 100 task ids without being charged again |
| Cited and own pages | `POST /v3/on_page/content_parsing/live` | $0.00015 per page without JavaScript; `enable_javascript: true` is billed extra (expected $0.0015). Default JavaScript off; retry with it on only when `main_topic` and `page_as_markdown` come back empty. `items[].status_code` is the page's HTTP status: 4xx/5xx and empty content mean unparseable (still charged) |
| Health and balance | `GET /v3/appendix/status`, `GET /v3/appendix/user_data` | Free. Status at most 10 requests a minute; `user_data` returns `money.balance` and the live price list. Error 40210 means no funds: every capture stops |
| Countries | `GET /v3/serp/google/locations` | Seeds the `locations` table |

Decision: **depth 10, not 20.** It halves the base price per capture, the organic-overlap metric uses the top 10 (the only comparison an everyday user needs), and nothing else consumed results 11 to 20.

Task parameters:

```json
{
  "keyword": "best form builder",
  "location_code": 2840,
  "language_code": "en",
  "device": "desktop",
  "os": "windows",
  "depth": 10,
  "load_async_ai_overview": true,
  "priority": 1,
  "tag": "<capture id>",
  "postback_url": "https://<project>.supabase.co/functions/v1/dataforseo-postback?secret=<secret>",
  "postback_data": "advanced"
}
```

`expand_ai_overview` only affects HTML results and is not sent.

Parsing the result: the item with `type: "ai_overview"` holds `markdown`, `asynchronous_ai_overview`, `position`, `items[]` and top-level `references[]`. Documented element types: `ai_overview_element` (`title`, `text`, `markdown`, `links[]`, `images[]`, `references[]`), `ai_overview_table_element` (`markdown`, `table.table_header`, `table.table_content`, its own `references[]`), `ai_overview_expanded_element` (`title`, `text`, `components[]` of `ai_overview_expanded_component`, each with its own `text`, `markdown`, `references[]`) and `ai_overview_video_element` (`url`, `source`, `title`, `timestamp`). **(corrected)** An overview can also sit inside the `knowledge_graph` item as `knowledge_graph_ai_overview_item` with the same shape; the parser checks both places. Citations are collected from every nested `references[]` (element, component, table) and from the top level. Each reference has `url`, `domain`, `title`, `source` and `text`, the passage Google used from that page. Items with `type: "organic"` are the organic results. The capture id comes back in `tasks[0].data.tag`. Citation markers `[[n]](url)` in the overview markdown can cite URLs missing from `references[]`; these are citations too. Video elements are cited sources. An item's `markdown` is preferred over its `text`. Unknown section types are kept with their raw text, never dropped. The full raw payload is saved to Supabase Storage; `tasks[0].cost` is saved on the capture.

For later: DataForSEO's Google AI Mode endpoints (`/v3/serp/google/ai_mode/...`) return the same `ai_overview`-shaped item at exactly twice the Organic price; the parser and citations schema can be reused.

### Capture statuses

`present` (overview shown), `absent` (no overview on that render), `error` (DataForSEO failed after 3 task-level attempts; transport failures and a DataForSEO outage reported by `/v3/appendix/status` do not count as attempts). Every metric uses renders as the denominator and excludes `error` renders.

---

## 3. Finding the patterns (exact counts with evidence)

### Step A: extract and match, per unique capture

Identical captures are detected by a hash of the normalised overview text; a capture identical to an earlier one in the series reuses that capture's claims and costs nothing. Every new version goes to Claude in a batch. The input is:

- the keyword and language;
- the series' current canonical claims (`id: text`) and entities (`id: name`), in a cached block (section 7);
- the overview sections, each split into numbered sentences with the citation indexes attached to that section.

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

**Equivalence rules (added after the 2026-10-07 audit).** The same claim phrased with a different qualifier is the same claim: rounded numbers and approximations ("over 10,000", "10,000+", "more than 10,000"), currency and period notation ("$25/mo", "$25 per month"), unit spellings, and synonyms of "free plan". A heading only gives context; a heading-only stance yields one claim phrased from the item, not from the heading. Enum values returned by Claude are compared case-insensitively before validation.

### Step B: consolidate, nightly per series

Captures in the same batch can't see each other's new claims, so the same claim can be created twice. Each night, for every series that gained canonical claims or entities that day, Claude gets the full list with counts and returns merge groups (for example, "Tally" and "Tally Forms" become one entity). Merges are applied in the database; nothing is deleted, the merged id points to the survivor. The same equivalence rules apply.

### Step C: count, in SQL

All of these are exact database counts over a window (first 7 days, then rolling 7 and 28 days), each shown with its sample size:

| Metric | Definition |
|---|---|
| Presence rate | renders with an overview / renders |
| Claim recurrence | renders containing the claim / renders with an overview |
| Entity recurrence | renders mentioning the entity / renders with an overview, split into recommended vs mentioned |
| Source survival | renders citing the URL (and the domain) / renders with an overview; CORE at 80% or more, RECURRING 40 to 80%, ROTATING under 40% (shown to users as "In nearly every answer", "In most answers", "Comes and goes") |
| Citation stability | mean pairwise overlap of the cited-URL sets across renders |
| Format frequency | share of renders with each format label; median word count; answer-lead position |
| Organic overlap | share of cited URLs that also rank in the organic top 10 of the same render |
| Change rate | share of renders whose content differs from the previous render |
| Differences | claims, entities and citations added or dropped from one day to the next |
| Unsupported claims | recurring claims whose sentences carry no citation |

Labels: confidence is low under 10 renders, medium 10 to 20, high above 20 (shown as "Early", "Getting there", "Solid"). A preliminary report unlocks at 3 days; the full report at day 7.

### Matching accuracy

After the first real week, build a labelled set of 200 claim pairs from real captures (same claim or not) and measure how often Step A plus Step B agree with the labels. Target 90% or better. Re-run it whenever the prompt or model changes (`scripts/match-accuracy.ts`, session 7).

---

## 4. Reverse-engineering the cited pages

For the 10 most-cited pages of a series (by source survival) plus any page the user adds:

1. **Parse** with DataForSEO On-Page content parsing (section 2 rules for JavaScript and `status_code`). Pages are shared across all users and re-parsed after 7 days.
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

Checks in code before a brief is saved: every must-cover topic maps to a claim with at least 40% recurrence; every entity appears in at least 2 renders; the outline covers every must-cover topic. Export is Markdown. A new brief is offered automatically at day 28 with a diff against the first. Generated briefs are marked as AI-generated in the export (EU AI Act Article 50).

### Draft scorer

The user pastes a draft or a URL. Code measures it exactly like a cited page and compares it with the winners' medians and the brief: topic coverage, entity coverage, format match, words before the answer, evidence density, technical checklist. Then one Claude request scores the "new to cite" items and clarity and returns a prioritised fix list. Result: a 0 to 100 score with sub-scores.

---

## 6. Tracking after publish

- **Own page:** the user adds their URL and brand names, on the add form or later. The page is parsed with DataForSEO On-Page and re-parsed weekly.
- **Match levels**, checked on every capture: exact URL, same page after redirects and canonical tags, same path prefix, same subdomain, same domain, brand mentioned in the answer. URLs are compared after lowercasing the host and removing `www.`, tracking parameters, the fragment and the trailing slash. Platform domains (YouTube, Reddit, Medium, LinkedIn, Facebook, Quora) only count at exact URL or path prefix. Users see three words: your page itself, another page in that section, another page on your site.
- **Which section was quoted:** the reference `text` for the user's page is located in their parsed page, giving the heading Google pulled from.
- **Events:** first seen (immediately), lost (absent from every capture for 2 consecutive days), regained. Rolling 7- and 28-day survival.
- **Google-wide changes:** each day, across every series in the system, compute presence rate, citations per overview and how many cited domains changed versus the previous week. A jump beyond normal variation records a platform event, shows a banner, and holds back "lost" alerts that day. A DataForSEO outage day (from `/v3/appendix/status`) is excluded.
- **Alerts:** in-app, plus email through Resend (first seen, lost, regained, report ready, daily digest of what changed). Resend limits: 10 requests a second per team, 50 recipients per message, 100 messages per batch call; the free plan sends 100 a day and 3,000 a month, Pro ($20/month) 50,000 a month with no daily cap.

---

## 7. Claude

All model IDs live in `supabase/functions/_shared/claude.ts`. Default for every task: `claude-opus-5-5` ($4 input / $20 output per million tokens; half that through the Batches API; cache reads $0.20). Scheduled work runs through the Message Batches API. Structured outputs use `output_config.format` with a JSON schema; `stop_reason` is checked before parsing. Documentation lives at platform.claude.com (docs.claude.com redirects there).

| Task | Mode | Effort |
|---|---|---|
| A. Extract and match claims | Batch, per unique capture | low |
| B. Consolidate claims and entities | Batch, nightly per series | low |
| C. Tag a cited page | Batch, per page | low |
| D. Coverage matrix and brief | Batch, per report | high |
| E. Score a draft | Live request, run as a background task | medium |

Facts the code relies on, verified 2026-10-07:

- **Opus 5.5:** adaptive thinking is always on and cannot be disabled; thinking tokens are billed as output and count toward `max_tokens`, so `max_tokens` is 16,000 for page tags and draft scores and higher for briefs. Default effort is `medium`; the code always sets it explicitly. Forced `tool_choice` and assistant prefill return 400 (neither is used).
- **Structured outputs:** GA, accepted inside batch requests together with `output_config.effort`. Enum and const capitalisation is not guaranteed, so enum-valued fields are lower-cased before Zod validation. Schemas must stay byte-stable: a changed schema invalidates the prompt cache. No recursive schemas, no `minLength`/`maxLength`/`minimum`/`maximum`, `additionalProperties: false`.
- **Batches:** at most 100,000 requests or 256 MB per batch; most finish within an hour; items unfinished after 24 hours come back `expired`, are not billed and are resubmitted; results stay 29 days. `fallbacks` is not allowed in a batch item (it comes back `errored`); a refusal in a batch is `succeeded` with `stop_reason: "refusal"` and is failed permanently, not retried. Batch creation failures are reported to the operator after two consecutive failures of the same kind instead of looping silently every 15 minutes.
- **Caching:** cache reads in batches are best-effort (30 to 98% hit rates). Every shared prefix (the system prompt and the known-claims block of the extraction request) carries `cache_control: { type: "ephemeral", ttl: "1h" }`; a cached prefix must be at least 512 tokens on Opus 5.5 or it silently does not cache. The known-claims block comes before the varying sentences so it caches across every capture of a series in a run.
- **Live draft scorer:** `anthropic().beta.messages.create({ ..., fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] })` so a declined request is retried on the model Anthropic recommends for the refusal category; `stop_details.category` is recorded on failure. `maxRetries: 1` and a 120-second timeout keep the call inside the Edge Function's 150-second response limit.
- **Usage:** every batch result's `usage` (input, output, cache read, cache write, `output_tokens_details`) is summed into `batches.usage`; live draft-score usage is stored on `draft_scores`; a SQL view prices both at the batch and live rates per task kind so section 13 can be replaced with real numbers.
- **Rate and spend limits:** organisations start on the Evaluation or Start tier (Start: $500 a month spend cap, 1,000 requests a minute to the batch endpoints, 200,000 queued batch requests, Opus 5.5 1,000 RPM live). The cap bounds the product at roughly 50 to 100 tracked queries on Opus 5.5; request a raise before launch and handle `429 enforced_spend_limit_reached` by pausing submissions and alerting the operator.
- **Haiku 4.5** (`claude-haiku-4-5-20251001`, $1 / $5, batch $0.50 / $2.50): Active, tentative retirement "not sooner than 2026-10-15" with at least 60 days' notice promised, so it cannot retire before December 2026 at the earliest. If extraction moves to it: drop `output_config.effort` (not supported), use `thinking: { type: "enabled", budget_tokens }` only if wanted, mind the 200K context and the 4,096-token cache minimum.
- `client.messages.countTokens` is free (5,000 RPM) and is used by the smoke script to size every request type with the model that will run it.

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
      system: [{ type: "text", text: EXTRACT_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
      messages: [{ role: "user", content: [
        { type: "text", text: knownClaimsBlock(s.series), cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: sentencesBlock(s) },
      ] }],
      output_config: { effort: "low", format: { type: "json_schema", schema: EXTRACT_SCHEMA } },
    },
  })),
});
```

---

## 8. Database (Supabase)

The schema lives in `supabase/migrations/`; `docs/architecture.md` describes the status flows and the SQL functions the app calls.

- **Reference:** `locations`, `platform_domains`. **(corrected)** Their rows move from `seed.sql` into a migration (`20261007000007_reference_data.sql`, idempotent inserts) because `supabase db push` never runs the seed; `seed.sql` keeps only the local Vault values.
- **Shared capture pool:** `series` (one per normalised keyword, location, language, device), `captures` (plus `cost` and `task_time` from DataForSEO), `snapshots` (status, sentences, content hash, `same_as`, organic, formats, extraction status), `sections`, `citations` (url, `url_key`, host, registrable domain, passages), `claim_groups`, `claims` (snapshot, sentence, text, type, citations), `entities`, `entity_mentions`.
- **Pages (shared cache):** `pages` (markdown, outline, measures, tags).
- **Per user:** `tracked_queries`, `reports` (metrics, page details, analysis, brief Markdown, checks, stage), `draft_scores` (plus `usage`), `own_pages`, `own_matches`, `citation_events`, `notifications`.
- **System:** `batches`, `batch_items` (ref maps per request), `platform_daily`, `platform_events`, `function_runs` (every cron handler writes one row at the end: name, started, finished, ok, summary, error; an hourly check also copies non-2xx rows for `invoke_function` requests out of `net._http_response`, which pg_cron itself never sees).
- **Health check** (daily, inside `notify`): an operator notification and email to `ALERT_EMAIL` when no capture arrived in 6 hours while series were due, error renders exceed 10% in 24 hours, a batch has been in progress for over 24 hours, extraction or page-tag failures pile up, any cron invocation returned non-2xx in the last hour, or Resend reported failures. `schedule-captures` pings an external heartbeat URL on success when one is configured.
- **Operations:** the cron migration creates `supabase_vault` explicitly; the `alter role service_role set statement_timeout` statement is guarded so a privilege difference on the hosted project cannot abort the migration; a nightly `purge-retention` job deletes raw Storage objects older than 90 days, snapshots older than 180 days on series nobody tracks (365 days otherwise, reports untouched), pages unreferenced for 90 days, and `cron.job_run_details` older than 7 days. `detect-platform-events` needs 20 series and 7 baseline days before it records anything, so the Google-wide banner cannot appear in the first week.
- **Spend guard until billing exists:** `add-query` enforces `MAX_QUERIES_PER_USER` (3) and a global `MAX_ACTIVE_SERIES`, returning a 403 the app already renders; `submit-batches` stops creating batches once the day's `batch_items` exceed a daily budget; sign-up can be switched to invite-only in the Supabase dashboard until billing exists.

Row-level security: users read their own tracked queries, reports, draft scores, own pages, matches, events and notifications. They read the shared pool only for series they track (`user_tracks_series`). Tracked queries are created by `add-query`; users may update only the tracking fields. Edge Functions use the service role. Metrics are SQL functions taking a series id and a window.

---

## 9. Edge Functions and schedules

| Function | Trigger | Job |
|---|---|---|
| `add-query` | App | Normalise, cap check, Labs siblings (with `include_serp_info`), Live confirm at depth 10, join or create the series, create the tracked query (`watching` when no overview appears), save the own page when given |
| `schedule-captures` | Cron, every 10 min | Submit every series whose `next_capture_at` has passed, 100 per request; advance `next_capture_at` by 3 hours; store each task's cost |
| `dataforseo-postback` | DataForSEO | Verify secret, decompress, save raw to Storage, write snapshot, sections, citations and organic; set `same_as` when the content hash matches; run own-page matching for every subscriber |
| `sweep-captures` | Cron, every 30 min | `task_get` captures with no postback after 20 minutes; `40601`/`40602` stay pending; mark `error` after 3 task-level failures; skip the run while `/v3/appendix/status` reports an outage; alert on low balance |
| `submit-batches` | Cron, every 15 min | One Claude batch per task type from pending work: extractions, nightly consolidations, page tags, briefs |
| `collect-batches` | Cron, every 5 min | Write finished batch results into claims, groups, entities, pages and reports; resubmit expired items; queue the next stage |
| `build-reports` | Cron, every 15 min | Create preliminary (day 3), full (day 7) and day-28 refresh reports; compute metrics; parse and measure the top cited pages; queue page tags, then the matrix and brief |
| `score-draft` | App | Measure the draft, run Claude task E as a background task, write the result and its usage |
| `detect-platform-events` | Cron, daily | Cross-series change detection |
| `notify` | Cron, every 15 min | In-app notifications and Resend emails, including the daily digest |
| `set-own-page` | App | Save the own URL and brand names, parse the page, re-match the last 28 days of captures |
| `purge-retention` | Cron, nightly | Retention rules from section 8 |

Hosted limits the design respects: a function must send its response within 150 seconds on every plan; background work after the response may run to 400 seconds on Pro; 2 seconds of CPU per request; 256 MB memory. Functions deploy with `supabase functions deploy --use-api` (no Docker; 5 MB bundle cap). Secret names cannot start with `SUPABASE_`.

Supabase secrets: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, `ANTHROPIC_API_KEY`, `POSTBACK_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `ALERT_EMAIL` (operator alerts), optional `FUNCTIONS_PUBLIC_URL` and `HEARTBEAT_URL`. `APP_URL` and `EMAIL_FROM` have no production defaults: a function refuses to send mail with a localhost link or an unverified sender. Vault secrets read by cron: `functions_url`, `cron_secret`. Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Supabase Auth sends mail through Resend SMTP (`smtp.resend.com`, port 465, user `resend`, password = the API key) because the built-in sender allows 2 emails an hour and only to project team members.

Secret rotation: `CRON_SECRET` lives in Vault and in the function secrets, so both change within the same minute; `POSTBACK_SECRET` is embedded in every queued DataForSEO task, so rotate it at a quiet time and expect the sweeper to collect the in-flight captures by `task_get` for up to 3 hours; the Anthropic key rotates freely (batches belong to the organisation); the service role key rotates from the dashboard and functions pick it up.

---

## 10. App (Next.js on Vercel)

- **Hosting:** Vercel Pro ($20 a month platform fee with one deploying seat and $20 of usage credit; Hobby forbids commercial use). Project Root Directory is `web`. Node 24 default. Next.js stays pinned at 16.3.8 (16.4.0 shipped on 2026-10-06; upgrade after its first patch release); `web/proxy.ts` is the Next.js 16 middleware convention and `@supabase/ssr` 0.12.7 targets it.
- **Auth:** Supabase magic link and password, Google sign-in once the OAuth client exists. Forgot-password flow added. Redirect allow list includes the production domain, `http://localhost:3000/**` and the Vercel preview wildcard. Security headers (frame denial, referrer policy, nosniff, HSTS) set in `next.config.ts`; the sign-out route checks the request origin.
- **Design:** the Legiit Keywords design system (`docs/brand.md`): Inter Variable, purple brand `#8a12dc`, plum hero `#12081f`, pill buttons, 12px white cards. Verified against the live stylesheet on 2026-10-07. Two fixes: `--color-ink-muted` back to the live `#64748b`, input focus ring `ring-brand-soft`. `docs/brand.md` corrected to the live values (28px logo mark, 15px wordmark, dot grid `#ffffff0f` at 22px, section labels in `ink-muted` on white for contrast).
- **Everyday-user surface** (`docs/design-spec.md`, built in sessions 5 and 6): one plain sentence first on every screen, then the thread's six steps as numbered rows with a status chip and one next action each; every number sits behind "Show the evidence" and still opens the captures it was counted from. Vocabulary: "search" not "query", "check" not "render", "x of y answers" never "n=", "In nearly every answer / In most answers / Comes and goes" instead of survival buckets, "Points Google keeps making", "Brands and products", "Pages Google cites", "Is your page in?". Local dates, UTC only in tooltips. Developer QA (brief checks, ref codes) folded away. The draft check lives at the end of the brief; the own-page form appears on the add form and wherever the page is missing.
- **Queries:** list of searches, each with its current step and next action.
- **Add a search:** keyword, country, language, one device; optional own URL and brand names; sibling suggestions when no overview appears.
- **Search page:** the six steps (Pick, Track, Patterns, Winners, Build, Publish and track) on the index; detail pages for Google's answer, what keeps showing up, the pages Google cites, your brief with the draft check, and is your page in.
- **Marketing page:** the same six words as the app, samples rendered from a real tracked search once one exists, static rendering (no cookie read in the marketing layout), robots, sitemap and Open Graph image.
- **Billing:** deferred. When added: plan picker with Stripe Checkout, a `stripe-webhook` function, and the query limit enforced by `add-query`.

---

## 11. What the founder provides before session 1

Add each value in the cloud environment's settings (the environment menu in the session's title bar, then Edit: Network secrets or environment variables); a new session picks them up. Never paste a key into the chat.

| Needed for | Account step | Environment variable |
|---|---|---|
| Session 1 onward | DataForSEO account, top up $50 (minimum; the balance never expires), copy the API password from the dashboard's API Access tab | `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` |
| Session 2 onward | Anthropic Console API key; set a monthly spend limit there (the Start tier caps at $500 a month; request a raise before launch) | `ANTHROPIC_API_KEY` |
| Session 3 onward | Supabase Pro organisation ($25 a month); create a project in the region closest to users and keep its database password; create a personal access token | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` |
| Session 3 onward | Resend account and API key; choose the sending subdomain (for example `alerts.<domain>`) and add the DNS records Resend shows (MX and two TXT); verification takes minutes to a day | `RESEND_API_KEY`, `EMAIL_FROM`, `ALERT_EMAIL` |
| Session 4 onward | Vercel Pro team and a token; the app's hostname and access to its DNS to add the record Vercel gives | `VERCEL_TOKEN`, `APP_HOSTNAME` |
| Later | Google Cloud OAuth client for Google sign-in (optional; magic link and password work without it) | set in the Supabase dashboard |
| Before launch | DataForSEO's terms (section 7.1) bar use that competes with search engines; ask DataForSEO for their signed contract covering a commercial product built on SERP data | none |

In this cloud environment `ANTHROPIC_BASE_URL` points at a proxy for Claude Code itself; the smoke scripts and tests run with it unset so the real API is called.

---

## 12. Sessions for Claude Code

One session each, in order. Each ends with a check on real data; the next session starts by re-running the previous check. No session uses the mock for a check.

1. **Real DataForSEO.** Write `scripts/smoke-dataforseo.ts` (Deno, reads the environment variables) and run it: `user_data` (balance, live prices; a wrong password must raise exactly one 401), `locations`, Labs `related_keywords` with `include_serp_info` on 5 keywords, Live advanced on 30 real buying-intent keywords (desktop and mobile, three countries, some "best X", "X vs Y", "how to", "X pricing", and three that should show no overview), `task_post` plus `task_get` on 5 keywords to observe the queue codes and timing, `content_parsing` on 10 cited pages with and without JavaScript to compare content and cost. Save every response as a real fixture under `_shared/fixtures/real/` and run the parser over all of them; fix the parser (knowledge-graph nesting, component references, real markdown markers) and the client (`include_serp_info`, depth 10 with the organic-overlap metric and its evidence kind reduced to the top 10, JavaScript off by default, fetch timeouts, cost recorded, pending codes, transport failures not counted as attempts). Check: all 30 fixtures parse with nothing dropped; every passage is located; every Labs row carries `serp_info`; recorded costs match the invoice lines in the dashboard. Spend: about $2.
2. **Real Claude.** Write `scripts/smoke-claude.ts`: for each task type build one request from the real fixtures, `countTokens` it, run one live request at the configured effort, print `stop_reason`, usage (with thinking tokens) and the parsed output; then run a real 5-item extraction batch end to end through the batch runner code. Apply section 7: beta client for fallbacks, 1-hour cache TTL, cached known-claims block, enum lower-casing, `max_tokens`, refusal handling, creation-failure alerting, usage on `draft_scores`, the pricing view, the equivalence rules in the extraction and consolidation prompts. Hand-check the claims extracted from 5 real overviews. Check: every task returns `end_turn` with schema-valid JSON on real inputs; the batch completes and its usage is recorded; measured tokens per request type are written into section 13. Spend: about $10.
3. **Supabase project live.** Migrations from section 8 (reference data, Vault extension, guarded alter role, `function_runs`, retention, caps, cost and usage columns); `APP_URL` and `EMAIL_FROM` made required outside local runs. Rename `scripts/demo.ts` to `scripts/demo-mock.ts` and make it exit unless the DataForSEO base URL is a local address, so synthetic captures can never reach a shared production series. Write `scripts/deploy.ts`: link, `db push`, create the two Vault secrets idempotently through the Management API query endpoint, set function secrets from the environment (fail on any missing name), `functions deploy --use-api`, PATCH the auth config (site URL, redirect list, magic-link and recovery templates, Resend SMTP). Run `supabase test db --linked` once while the database is empty. Call the deployed `add-query` with a service token for 10 real searches. Check: `function_runs` shows every job succeeding and no non-2xx invocation; the first Live capture of each search is in `snapshots`; within an hour a scheduled `task_post` capture arrives through the real postback; extraction batches are submitted and collected on the real API. Spend: Supabase Pro plus about $1.
4. **App live.** Vercel project with root `web`, env vars, custom domain, production deploy. Resend domain verified, `EMAIL_FROM` on it. Sign in with a magic link on the real domain from a non-team address, add a search, see the real overview; password and forgot-password flows; notification emails arrive. Add the security headers, origin check on sign-out, the two brand colour fixes and the `docs/brand.md` corrections. Check: a brand-new account completes sign-up and adds a search on the production URL; a `first_seen` notification email arrives for a page cited in a real capture. From here the founder uses the product daily while the next sessions run.
5. **Everyday-user surface, part 1** (`docs/design-spec.md`): vocabulary maps and the evidence disclosure primitive, the searches list, the add-search form (one device, optional own page), and the search index page with the six steps and the headline sentence. Check: build and lint pass; every number on the new pages still opens the evidence drawer; the copy on a real search reads correctly on day 0, day 1 and day 3 states (use the real searches from session 3).
6. **Everyday-user surface, part 2:** Google's answer, what keeps showing up, the pages Google cites, the brief with the draft check folded in, is your page in, notifications, the marketing page and login copy, static marketing rendering, robots, sitemap and Open Graph. Remove the old tabs and the `n=` formatting. Check: build and lint pass; a reviewer who has never seen the product reads every screen of a real search and can say what to do next without help; the six thread steps are each reachable.
7. **First real week.** After 7 days of real captures on at least 10 searches: verify 8 captures a day per series, the `same_as` reuse rate, consolidation merges, preliminary and full reports with every brief check passing, a `lost` alert held on a platform-event day if one occurred. Export claim pairs, label 200 by hand, write `scripts/match-accuracy.ts`, measure (target 90%) and tune the prompts if needed. Replace section 13 with the week's real DataForSEO and Claude spend per search and decide the extraction model. Check: accuracy at or above 90%; the cost table carries measured numbers.
8. **Launch hardening.** The daily health check and operator alerts (cron failures, DataForSEO balance and status, Anthropic spend-limit responses, batch creation failures, Resend failures) delivered to `ALERT_EMAIL`, plus the heartbeat ping; the daily batch budget; retention job verified on real data; query caps verified; the mock server and `scripts/demo-mock.ts` documented as offline test tooling only, with `docs/local-development.md` rewritten so the default local run uses the real APIs (the sweeper's `task_get` path covers postbacks that cannot reach a laptop); `docs/deploy.md` rewritten as the scripted path with the secret-rotation order; a launch checklist run on the production URL. Check: every alert path fires once on purpose and arrives; a fresh clone deploys to a fresh Supabase project with `scripts/deploy.ts` alone.
9. **Billing (later).** `stripe-webhook`, plans and query limits. Check: a test-mode purchase raises the query limit.

---

## 13. Costs and pricing

Per tracked search per month, one device, 8 captures a day (240 renders), depth 10. Claude figures are estimates from the 2026-10-07 audit of the real prompt sizes (the known-claims list grows through the week; briefs run about 45k input and 20 to 40k output tokens) and are replaced by measured numbers in sessions 2 and 7.

| Item | Opus 5.5 everywhere | Extraction on Haiku 4.5 instead |
|---|---|---|
| Capture (DataForSEO, surcharge refunded when absent) | $0.29 | $0.29 |
| Add-query (Labs plus Live confirm, once) | $0.02 | $0.02 |
| Cited and own pages (10 to 11 parses per report) | under $0.02 | under $0.02 |
| Extraction and matching (about 60% of renders are new content, known-claims block cached) | about $3.50 to $5.00 | about $0.90 |
| Consolidation | about $0.30 | about $0.30 |
| Page tags, matrix and brief | about $1.50 to $2.00 | about $1.50 to $2.00 |
| **Total** | **about $6 to $8** | **about $3** |

Fixed: Supabase Pro $25 a month (the compute credit covers one Micro instance; Storage over 100 GB at $0.0213 per GB, which the retention job keeps away), Vercel Pro $20 a month plus usage beyond the $20 credit, Resend free until 100 emails a day then $20 a month, DataForSEO $50 minimum top-up (a balance, not a fee).

| Tracked searches | Monthly cost, Opus 5.5 | Monthly cost, Haiku extraction | Note |
|---|---|---|---|
| 5 | about $85 | about $60 | Fixed costs dominate |
| 50 | about $395 | about $195 | Near the Anthropic Start-tier $500 cap on Opus |
| 500 | about $3,500 | about $1,550 | Needs the Build tier and Resend Pro |

Pricing that keeps roughly 50 to 60% gross margin on the Opus figure:

| Plan | Price | Searches (one device each) |
|---|---|---|
| Free | $0 | 1 search for 7 days, full patterns, brief locked |
| Starter | $49/month | 3 |
| Pro | $149/month | 10 |
| Agency | $399/month | 30 |

With extraction on Haiku 4.5 the same prices carry about twice the searches (5, 15, 50), which matches the competitor norm of $1.20 to $2.00 per tracked prompt. Extraction runs on every new version of the overview, so it is most of the cost; its model is one line in `claude.ts`. The plan defaults to Opus 5.5 for the best extraction; session 7 decides with measured numbers.

---

## 14. Risks and what covers them

| Risk | Cover |
|---|---|
| First contact with a real API breaks a shape assumption | Sessions 1 and 2 happen before anything is deployed; real fixtures become the parser tests |
| Recurrence counts fragment across days (the core metric under-reports) | Equivalence rules in the prompts, the 200-pair accuracy set, the 90% gate in session 7 |
| Spend runs away (open sign-up, no billing) | Per-user and global caps, Anthropic spend limit, DataForSEO balance alert, usage views |
| Cron jobs fail silently | `cron_runs` from `net._http_response`, operator alerts |
| Supabase email never reaches users | Resend SMTP configured in session 3, tested from a non-team address in session 4 |
| DataForSEO terms or Google's posture toward SERP providers change | Signed DataForSEO contract; the client sits behind one module so a second provider can be added |
| Google changes AI Overviews (model upgrades move 40% of cited domains) | Platform-event detection holds "lost" alerts; baselines carry dates |
| Claude model retirements | Model IDs in one file; Haiku 4.5 retirement notice watched |
