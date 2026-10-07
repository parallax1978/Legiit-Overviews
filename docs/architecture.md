# Architecture

How the pieces talk to each other. `PLAN.md` says what the product does; this file fixes the interfaces between modules. The database schema is `supabase/migrations/`; shared types are `supabase/functions/_shared/types.ts`; Claude output schemas are `supabase/functions/_shared/schemas.ts`.

## Layout

```
supabase/
  migrations/            schema, metrics functions, app RPCs, cron jobs
  seed.sql               locations, platform domains, local vault secrets (local only)
  tests/                 pgTAP tests (supabase test db)
  functions/
    _shared/             shared modules (Deno), each with a *_test.ts beside it
      types.ts schemas.ts env.ts db.ts http.ts normalize.ts dataforseo.ts claude.ts passage.ts batch-work.ts
      parse-serp.ts      DataForSEO task result -> ParsedCapture
      ingest.ts          ParsedCapture -> snapshot rows, dedupe, own-page matching
      tracking.ts        own-page matching, events, own page parsing
      pages.ts           page parsing and measurement
      brief-render.ts    brief ref resolution, code checks, Markdown export
      prompts/           one module per Claude task
      work/              one BatchWork module per batch task (extract, consolidate, page-tag, brief)
    <function>/index.ts  Deno.serve(handler(handle)); logic in <function>/handler.ts so tests can import it
mocks/                   local mock of DataForSEO and the Anthropic API (port 8787)
scripts/                 demo data driver and local helpers
web/                     Next.js app
```

## Capture flow

1. `add-query` (user) normalises the keyword, finds or creates the series for each device, runs one Live SERP capture when `claim_live_capture` grants it (no non-error render in the last 3 hours and no capture in flight, i.e. `pending` or `submitted` with `scheduled_at` in the last 3 hours; concurrent adds of one series run one at a time, and a series whose `next_capture_at` had fallen into the past moves to its first own slot at least 3 hours ahead so no catch-up capture follows), ingests it, and creates the tracked query (`tracking` when an overview appeared, `watching` otherwise). When a capture is in flight the result carries `capture_pending: true` and no siblings are suggested.
2. `schedule-captures` (cron, every 10 min) takes series whose `next_capture_at` has passed and that have at least one tracked query that isn't paused, inserts a `captures` row per series (`scheduled_at = next_capture_at`, `submitted_at` = the claim time until `task_post` accepts it), posts them to DataForSEO `task_post` in chunks of 100 with `tag = capture id`, and moves `next_capture_at` forward in 3-hour steps until it is in the future.
3. DataForSEO POSTs the result (gzip) to `dataforseo-postback?secret=...`. The function verifies the secret and calls `ingestTask(captureId, task)` for each task.
4. `sweep-captures` (cron, every 30 min) calls `task_get` for captures `submitted` more than 20 minutes ago and ingests what is ready, and resubmits captures left `pending` for 10 minutes since their claim or last post; after 3 failed attempts the capture is `error` and an `error` snapshot is written so the render is counted as an error.

The DataForSEO client (`_shared/dataforseo.ts`) retries 429 everywhere, and 5xx only on calls that cannot be charged twice by repeating them (`task_get`, and the cheap one-off Labs and content-parsing calls); a `task_post` or Live request that fails is not repeated, so its captures stay `pending` for the sweeper.

`ingestTask` is idempotent (snapshots.capture_id is unique): it stores the raw task in Storage at `raw/<series_id>/<capture_id>.json`, parses it, writes `snapshots`, `sections`, `citations` (one per `url_key`; `passages` holds every distinct passage Google quoted from the page, without the date Google puts before it, and `passage` the first), sets `same_as` to the earliest snapshot of the series with the same `content_hash` whose extraction has not failed (the original, else the earliest copy extracted on its own), sets `extraction` (`pending` for new content, `reused` for duplicates, `none` for absent), flips `watching` tracked queries to `tracking` when an overview appears, and runs own-page matching for every tracked query of the series.

`captured_at` is the SERP's own `datetime` from the result when present, otherwise the time of ingestion.

## Status machines

| Column | Values and transitions |
|---|---|
| `captures.status` | `pending` -> `submitted` -> `received`, or `error` after 3 attempts |
| `snapshots.extraction` | `pending` -> `submitted` -> `done` or `failed`; `reused` -> `done` once the original is done (claims and mentions copied); `none` for absent and error renders |
| `pages.parse_status` | `pending` -> `ok` or `failed`; re-parsed when `parsed_at` is older than 7 days |
| `pages.tag_status` | `none` -> `submitted` -> `done` or `failed`; back to `none` when the page is re-parsed |
| `reports.stage` | `pages` (pages parsing and tagging) -> `brief` (brief batch pending or submitted) -> `ready` or `failed` |
| `batches.status` | `in_progress` -> `ended` -> `collected`, or `failed` |

## Claude work

`submit-batches` (every 15 min) asks each `BatchWork` module (`_shared/batch-work.ts`) for pending requests, creates one batch per kind, records `batches` and one `batch_items` row per request (with the `refs` map used in the prompt), then calls `markSubmitted`. `collect-batches` (every 5 min) retrieves in-progress batches, and for ended ones streams the results into `handleResult`, marks `batch_items` applied or failed, sums usage into `batches.usage`, and sets the batch `collected`. It also copies claims into `reused` snapshots whose original is done.

| Kind | Target | Pending when | Result |
|---|---|---|---|
| extract | snapshot | `extraction = 'pending'` (and attempts < 3) | `claims`, new `claim_groups`, `entities`, `entity_mentions`; Claude's format labels and answer lead merged into `snapshots.formats` |
| consolidate | series | claim groups or entities created since `consolidated_at`, at most once per 20 hours | merges: `merged_into` set on the merged rows, and `claims.group_id` / `entity_mentions.entity_id` re-pointed to the survivor, so metric queries never follow chains |
| page_tag | page | `parse_status = 'ok' and tag_status = 'none'` and the page is in a report at stage `pages` | `pages.tags`, `tag_status = 'done'`, `measures.words_before_answer` from the answer sentence |
| brief | report | `stage = 'brief' and brief_submitted = false` | `analysis`, `brief_markdown`, `brief_checks`, `stage = 'ready'`, a `report_ready` notification |

Prompts carry short refs instead of ids: `C<n>` canonical claims, `E<n>` entities, `P<n>` pages. In stored output (`reports.analysis`) every ref is replaced by a typed ref: `claim:<group uuid>`, `entity:<entity uuid>`, `page:<url_key>`. Refs that don't resolve are dropped and listed in `brief_checks.dropped_refs`.

`reports.brief_checks`: `{ passed: boolean, checks: [{ name, passed, detail }], dropped_refs: string[] }`. Check names: `must_cover_recurrence`, `entity_recurrence`, `outline_covers_must_cover`, `refs_resolve`. Items that fail the recurrence checks are removed from the stored brief.

`collect-batches` also runs `release_stuck_work()`: work whose result failed to apply goes back for another attempt (extractions to `pending` with an attempt counted, page tags to `failed`, briefs retried until two attempts fail). `consolidated_at` is set to the submission time, so groups created while a consolidation ran count as new the next night.

The draft scorer is the only live request (`liveStructured` in `claude.ts`), run as a background task by `score-draft`: one draft per query at a time (a partial unique index on running `draft_scores` rows makes the insert the guard), at most 30 per user per 24 hours, `running` rows older than 10 minutes failed as timed out before each request, and scoring cut off at 140 s so the row is failed before the Edge wall clock kills the worker. The score is 100 x (0.25 topic coverage + 0.10 entity coverage + 0.10 format match + 0.15 answer first + 0.15 evidence + 0.05 checklist + 0.10 new to cite + 0.10 clarity); topic and new-to-cite coverage are over the brief's own lists, and an item Claude returned no judgement for counts as missing.

## Reports

`build-reports` (hourly):

- Creates reports for tracked queries with status `tracking`. History starts at `series_history_start`: the first present snapshot of the current capture stretch (a gap of more than 36 hours between snapshots starts a new stretch), so a series captured again after a pause, or a `watching` query that only just saw an overview, starts from zero; `my_queries.history_days` counts from the same start. Windows always end at creation time: `preliminary` (3 days) once history reaches 3 days and the query has no preliminary or full report yet; `full` (7 days) once history reaches 7 days and the query has no full report; `refresh` (28 days) at day 28 and every 28 days after the latest refresh, never within 7 days of the latest full or refresh. A `full` or `refresh` report needs at least 10 present renders in its window (unless history is past day 28); short of that it is retried the next hour.
- Stores `series_metrics(series, window_start, window_end)` in `reports.metrics` and `renders`.
- Picks the 10 most-cited non-platform URLs by source survival in the window plus the own URL, writes `page_urls`, parses missing or stale pages (`pages.ts`), and writes `page_details` with Google's passages located in each page.
- Moves a report from `pages` to `brief` once every page is parsed (or failed) and every parsed page is tagged (or failed).

## SQL the app and functions call

All are in `public`, callable by `authenticated` users for series they track and by the service role. Windows are `[p_from, p_to)`.

| Function | Returns |
|---|---|
| `series_metrics(p_series_id uuid, p_from timestamptz, p_to timestamptz) returns jsonb` | `SeriesMetrics` (types.ts) |
| `metric_evidence(p_series_id uuid, p_kind text, p_key text, p_from timestamptz, p_to timestamptz, p_limit int default 50) returns jsonb` | `{ total, items: [{ snapshot_id, captured_at, sentences: [{ i, text, citations }], note }] }`. Kinds: `claim` and `unsupported` (key: group id; note: the claim text), `entity` (entity id; note: role and label), `source` (url_key; sentences citing it; note: Google's passage), `domain` (reg_domain), `format` (label; no sentences), `presence` (`all`, `present` or `absent`: the non-error captures, each item with its `status`; no sentences), `overlap` (`top10` or `top20`: renders citing a page that also ranks in that render's organic top 10 or 20; sentences citing those pages; note: each page with its rank; the result adds `citations` and `occurrences`, the numerator and denominator of `organic_overlap`) |
| `my_queries() returns jsonb` | `[{ tracked_query_id, display_keyword, series_id, keyword, location_code, location_name, language_code, device, status, created_at, history_days, renders_7d, present_7d, presence_rate_7d, last_captured_at, last_status, own_url, own_level_7d, report: { id, kind, stage } or null }]` for the caller |
| `tracking_summary(p_tracked_query_id uuid) returns jsonb` | `{ own_url, brand_names, renders_7d, present_7d, cited_7d, cited_exact_7d, survival_7d, renders_28d, present_28d, cited_28d, cited_exact_28d, survival_28d, brand_7d, latest: { captured_at, level, quoted_heading } or null, daily: [{ day, renders, present, cited, best_level, brand }] }` for the last 28 days (`latest` too); survival = cited / present; `cited_exact_*` count only renders citing the exact own URL (level `exact_url`) |

Survival buckets: `core` >= 0.8, `recurring` >= 0.4, `rotating` < 0.4. Confidence by non-error renders: `low` < 10, `medium` 10 to 20, `high` > 20.

`series_metrics` denominators: claim, entity, format and answer-lead shares are over `extracted` (present renders whose extraction is `done`); presence, source and domain figures are over all present renders. `extraction_pending` counts present renders still awaiting extraction, so the app can say how many captures are still being analysed. `daily` compares whole UTC days: the first day's sets include that day's renders before `p_from`; claim and entity diffs run between days with an extracted render, citation diffs between days with a non-error render; the last day lists nothing as dropped when `p_to` is not midnight (it is still being captured).

`window_passages(p_series_id, p_from, p_to, p_url_keys)` (service role, for `build-reports`) returns `[{ url_key, passages, counts }]`: every distinct passage quoted from each page in the window's present renders (all of `citations.passages`, whitespace collapsed), at most 20 per page, most quoted first, `counts[i]` being the renders that quoted `passages[i]`.

Users may update only `own_url`, `brand_names` and `status` of their tracked queries (`own_url_key` is derived from `own_url` by `set-own-page` and `build-reports`, never trusted as stored) and only `read_at` of their notifications. `pages` is a shared cache, but a user reads a page only when it is in one of their reports, cited by a series they track, or their own page (`user_can_read_page`).

## Edge Functions

User functions take the Supabase session JWT (`Authorization: Bearer`). Cron functions take `x-cron-secret`. All return JSON; errors are `{ error }` with a 4xx or 5xx status.

| Function | Request | Response |
|---|---|---|
| `add-query` | `{ keyword, location_code, language_code, devices: ("desktop"\|"mobile")[] }` | `{ results: [{ device, tracked_query_id, series_id, status, is_new_series, overview_present, capture_pending?, capture_error? }], siblings: [{ keyword, search_volume }] }` (siblings that trigger an overview, filled when any device had none and no capture is pending) |
| `set-own-page` | `{ tracked_query_id, own_url: string \| null, brand_names: string[] }` (at most 10 brand names of 2 to 60 characters, trimmed, deduplicated ignoring case; the `tracked_queries_brand_names_check` constraint enforces the same on direct writes) | `{ ok: true, parsed: boolean, matches: number }` after re-matching the series' last 28 days; a changed (or cleared) own URL first drops all of the query's `own_matches` |
| `score-draft` | `{ tracked_query_id, source: "url" \| "text", input }` | `{ draft_score_id }` at once; the row moves from `running` to `done` or `failed` |
| `dataforseo-postback` | DataForSEO postback (gzip JSON), `?secret=` | `{ ok: true }` |
| `schedule-captures`, `sweep-captures`, `submit-batches`, `collect-batches`, `build-reports`, `notify` | empty body | a JSON summary of what was done |
| `detect-platform-events` | optional `{ day: "YYYY-MM-DD" }` (default yesterday, UTC) | the day's platform metrics and whether an event was recorded |

## Tracking

Matching runs on every ingested snapshot for every tracked query of the series with an own URL or brand names, paused ones included (their `own_matches` rows are written without events, so the history has no gaps when tracking resumes): the best `matchLevel` over the snapshot's citations, `brand_mentioned` over the overview text (whole words, case-insensitive, one regular expression over the query's first 10 names), and the heading Google quoted (the first of the matched citation's `passages` located under a heading in `own_pages.markdown`). Results go to `own_matches`.

Events in `citation_events` carry the `own_url_key` they were about, and every lookup of earlier events is limited to the query's current key, so a new or cleared URL starts with no history. `first_seen` the first time the page is cited; `regained` when a render captured after a `lost` cites it; `lost` (from `detect-platform-events`, daily) when the page's latest event is `first_seen` or `regained`, at least one present render with an `own_matches` row from 48 hours before the end of the day judged onwards exists, and none of them cites the page (renders captured after that day count, so a citation ingested before the check stops it); the event is dated at the end of the day judged. `brand_mention` the first time the brand is named. Each event creates a `notifications` row except: a `lost` on a day with a platform event (that day or the day before) is held, then released with its notification on the first quiet day the page is still out; a `regained` while its `lost` is still held is held too; a `lost` that `set-own-page`'s re-match finds (the page was last cited over 2 days ago) is told in the dated `first_seen` notification ("Cited on <date>: ..."). Paused queries get no events.

A platform event needs a pool that stands for Google: at least 20 series and 20 renders that day and 7 baseline days; a metric shifts when it moves more than 3 times the larger of the baseline's standard deviation and the day's own sampling noise (binomial over the day's renders or `(series, domain)` pairs, `platform_daily.pairs`), and by at least the metric's minimum change.

## Notifications

Rows in `notifications` are created where the event happens (a platform event's, one per user with an active query, in one SQL statement so no response cap skips users). `notify` (every 15 min) emails rows with `emailed_at is null` through Resend when `RESEND_API_KEY` is set, and once a day (after 13:00 UTC) writes and emails one `digest` per user summarising the day's changes across their queries (events not held, including losses released that day; tracked queries are read in pages of 500). Links are app paths: `/queries/<tracked_query_id>` plus `/patterns`, `/pages`, `/brief`, `/draft` or `/tracking`.

## Cron

`pg_cron` jobs call the functions through `pg_net` with the `x-cron-secret` header. The functions URL and cron secret are read from Supabase Vault secrets `functions_url` and `cron_secret` (local values are in `seed.sql`; production values are created once with `vault.create_secret`).

## Local development

`npx supabase start` runs Postgres, Auth, Storage and the edge runtime. `mocks/server.ts` stands in for DataForSEO and the Anthropic API on port 8787 (`DATAFORSEO_BASE_URL`, `ANTHROPIC_BASE_URL`). Function secrets for local runs are in `supabase/functions/.env` (gitignored); module tests run on the host with `supabase/functions/.env.test` (gitignored, host URLs).
