> Appendix: the design panel's synthesised specification, kept verbatim for traceability. `PLAN.md` and `docs/spec/` are authoritative where they differ (they incorporate this document's refinements and later edits).

# Legiit Overviews — v1 design specification

Working name "Legiit Overviews" (pending counsel). Date: 2026-10-06. This is the build spec a founder hands to Claude Code. It starts from the MVP-first proposal (the judges' winner) and grafts in the ideas from the other two that do not conflict with it: honest denominators and confidence labels, evidence references on every brief line, loss-alert suppression during model-regime events, the $99 Playbook SKU, a minimal work-order record, reserved tenancy columns for a later Agency tier, Pro seats, and the day-0 framework pins. It also fixes the three defects every judge found: the day-7 report could not exist at one render per day, Next.js was pinned to a same-day release, and the cited-page fetcher had no measured blocked-page rate.

Everything the research settled (capture pool, cadence tiers, provider abstraction, status enum, retention, guardrails, derived-only outward surfaces, stack) is treated as given and is not re-argued here.

---

## 1. Product definition

Legiit Overviews tracks AI Overviews in Google Search for one buying-intent query at a time and turns seven days of renders into a page you can get cited in. The user adds a query with a country, language and device; the product confirms an AI Overview exists, captures it every day from a shared global pool, counts what keeps showing up (claims, entities, formats, sources), reverse-engineers the pages Google keeps citing, writes a brief that separates the baseline to match from something new to cite, and then watches the same query after publication to report the day the user's page is cited and which sections did the work. It sells the analysis and the brief, not the scrape, to SEO freelancers and small agencies, with Legiit's GEO marketplace as the fulfilment path.

| Thread step | Jake's instruction | v1 feature |
|---|---|---|
| 1 | Pick one buying-intent query that already triggers an AI Overview | Add-query flow: normalization and PII check, one-cent DataForSEO Labs pre-check with sibling suggestions, one Live Advanced confirmation, states `confirmed` or `watching` |
| 2 | Collect the full answer, citations and date over 7+ days | Global capture pool at tier cadence (bootstrap: 2 renders/day for the first 7 capture-days on every tier), every render stored as normalized blocks, references and organic top 20; progress meter "n of 7 capture-days" |
| 3 | Find recurring claims, entities, formats, sources, differences; count them | Per-render atomic-claim extraction, embedding clustering, SQL metrics with sample sizes and confidence labels; day-to-day diff and a daily per-org digest email; preliminary patterns at 3 days, full report at 5 days and 10 renders |
| 4 | Study the most-cited pages: speed, coverage, structure, evidence, gaps | Cited-page profiles for the top 10 displaceable pages (3 on free): in-code structural features, LLM topic/entity/evidence tags, cross-source coverage heatmap with "common to all", "gaps no winner fills" and "AIO claims no cited page supports" |
| 5 | Build something better and give Google something new to cite | Opus-generated brief with recurrence percentages, format specs, new-to-cite ideas, outline, technical checklist and an evidence reference on every item; Markdown export carrying the AI-generated marker; deterministic draft check against the winners' medians |
| 6 | Publish and keep tracking | Mark as published with URL and brand terms; own-page matcher at six levels, section-level mapping of citing blocks, first-seen/lost/regained events with sample-size-aware alerts, weekly recompute of sources that keep winning and what changed |

---

## 2. v1 scope and explicit non-goals

### In scope

- Query intake: NFKC, trim, collapse whitespace, lowercase, strip trailing punctuation; reject `site:`, `inurl:`, `intitle:`, `filetype:`, quotes, minus, `OR`; max 200 chars; hl-vs-script sanity check; Haiku-class person-name/PII classifier. Locale = `{gl, hl, location_code, device}`; one variant = one tracked query; 10 launch countries at country level, one timezone per country.
- Capture pool: `capture_series` unique on `(normalized_query, gl, hl, location_code, device, provider)`; snapshots belong to the series. Cadence: Starter 1 render/day desktop at 06:00 series-local; Pro 3 renders/day (06:00/12:00/18:00) on desktop and mobile; every new series runs a **bootstrap cadence** of 2 renders/day (06:00 and 18:00) for its first 7 capture-days so that the 7-day gate (≥ 5 capture-days and ≥ 10 renders) is reachable on day 7 at Starter and Free. The extra render costs SERP money only ($0.0012 × 7).
- Snapshot model, status enum, aio_kind enum, normalized blocks with `reference_indexes`, references with registrable domain and platform class, organic top 20, content hash, near-duplicate reuse.
- Pattern report, cited-page profiles, coverage heatmap, brief, Markdown export, deterministic draft check (URL or pasted text; no LLM rubric).
- Publish and track: own-page matcher, section mapping, events, alerts, weekly recompute; a minimal `work_order` record (fulfilment channel self / team / Legiit seller / other, pasted external order URL, deliverable URL) and a "Get it built on Legiit" deep link to the GEO category with no API dependency.
- Plans: Free (one series, 7 days, no card), Starter $39, Pro $99, Playbook $99 one-off; Pro includes 3 seats via Better Auth invitations.
- Guardrails in the first SaaS sprint: per-org capture and LLM budgets, global per-provider daily ceilings with auto-pause, idempotency key per (series, capture_day, slot), provider health score and failover, 100-series sentinel canary, Anthropic and Vercel spend limits, Turnstile, disposable-email blocking, one free series per verified email, no LLM for free accounts before day 3, 3 cited pages on free, API keys on paid plans only (no API in v1 anyway).
- Legal surface: ToS (rights warranty, no redistribution, AI-draft disclosure, acceptable use), privacy policy, trademark footer, `/bot` page, named crawler UA, robots.txt and Content-Signal compliance, ≤ 1 req/s per host, SSRF protections, retention policy.

### Explicit non-goals for v1

- Agency tier, client workspaces, white-label reports, pitch mode, slot accounting (schema reserves `organization.kind`, `client`, `external_identity`, `work_order.external_ref` so these are additive; shipped in v1.1 if trial-to-paid ≥ 10%).
- Public API, MCP server, public share pages (v1.1, derived data only, with contract tests that assert no `aio_block.text` and no full reference lists).
- Google AI Mode, ChatGPT, Perplexity, Gemini; Search Console (v1.1 at the earliest: the Generative AI performance report exists, impressions only, API exposure unverified, OAuth verification caps unverified apps at 100 users).
- LLM draft scoring rubric, cross-snapshot LLM narrative synthesis, claim-to-passage matching of cited pages (v1.1; the own-page section matcher is the same module and ships in v1).
- City and lat/long targeting; non-English clustering calibration (accepted, labelled beta); vertical benchmarks (needs k ≥ 20 series per vertical).
- Jina Reader, Playwright, Bright Data, Railway worker; Firecrawl is the only fallback fetcher and is promoted to primary only if the pilot's blocked-page rate exceeds 20%.
- Annual billing, Stripe Tax, EU residency, DPA generator, paid boilerplates, PDF/CSV export (Markdown only, so the AI marker travels with the artefact).
- Any content generation, "rewrite competitor page", model training on AIO text, storage of AIO images, requests to google.com, courting or tagging Jake Ward.

---

## 3. Architecture

Two deployables, one shared core, everything else managed.

```
                 +---------------------------+        +------------------------+
   user ───────▶ |  apps/web  (Next.js 16.3) |        |  apps/cli (Milestone 0 |
                 |  UI · server actions ·    |        |  pilot, fixtures, ops) |
                 |  /api/inngest · webhooks  |        +-----------+------------+
                 +------------+--------------+                    |
                              |            both import           |
                              v                                   v
                 +------------------------------------------------------------+
                 |  packages/core (pure TS, no framework imports)             |
                 |  intake · providers(SerpProvider: dataforseo, serpapi)     |
                 |  normalize · schedule · metrics · llm(batch, schemas)      |
                 |  embed · cluster · fetch(ssrf, robots) · pages · match     |
                 |  db(schema, withOrg) · storage(r2) · plans · budgets       |
                 +------+-----------+------------+-----------+----------------+
                        |           |            |           |
          +-------------+   +-------+-----+  +---+-----+  +--+---------------+
          | Neon Postgres |   | Cloudflare  |  | Inngest |  | Anthropic (Batch)|
          | + pgvector    |   | R2 (raw,    |  | (hourly |  | Voyage embeddings|
          | Drizzle 0.45  |   | 90d / 14d)  |  |  crons) |  +------------------+
          +---------------+   +-------------+  +---------+
                 ▲                                   |
   DataForSEO ───┘ postback ──▶ /api/webhooks/dataforseo ─▶ event capture/result.received
   SerpApi  ◀── fallback (health < 0.8), page_token redeemed inside the same step
   Stripe · Resend · PostHog · Sentry · Turnstile  (managed, no servers)
```

**packages/core** holds everything that must be testable without a browser or a vendor: the `SerpProvider` interface and both adapters, the normalizer to `CanonicalSnapshot`, intake, slot planning, metrics, the LLM layer (`@anthropic-ai/sdk` with `zodOutputFormat`, a Message Batches helper, model aliases read from env), embeddings, the etiquette fetcher, page features, the own-page matcher, budgets and plans. **apps/cli** is the Milestone 0 pilot and later the ops CLI; **apps/web** is the SaaS. Nothing in the pilot is thrown away.

**Vendors and why** (prices verified 2026-10-06 in the research; versions are what npm served that day, with Next.js deliberately one minor behind):

| Component | Choice | Reason |
|---|---|---|
| Framework | Next.js **16.3.x** App Router, TypeScript **6.x**, Tailwind, shadcn/ui, Vercel Pro ($20) | 16.4.0 shipped today; the research says avoid same-day releases. Hobby is non-commercial. |
| Database | Neon Postgres (Free, then Launch at $0.106/CU-hr) + pgvector, Drizzle ORM pinned **0.45.3** | Drizzle 1.0 is still rc; pgvector `vector(1024)` and `cosineDistance` are built in. RLS via `pgPolicy` reading `current_setting('app.org_id')` inside `withOrg(tx)` on org tables only. |
| Auth and tenancy | Better Auth **1.7.7**, organization + Stripe plugins | Supplies organization, member, invitation and per-org subscriptions with `referenceId = organizationId`. |
| Jobs | Inngest **4.21.1** served from `app/api/inngest/route.ts` (`maxDuration = 300`) | Cron with TZ and jitter, per-key concurrency and throttle, `waitForEvent`. Postback-first topology targets ≤ 3 executions per capture; Vercel Workflows is the designated port if Free (50k executions, 5 concurrent steps) is exhausted. |
| SERP primary | DataForSEO Standard queue, `load_async_ai_overview=true`, postback, 100 tasks per POST, $0.0012/capture | Cheapest structured capture; stays primary only after written confirmation on ToS §7.1. Live Advanced ($0.004) only for the add-query confirm; Labs `related_keywords` ($0.0103) for the pre-check. |
| SERP fallback | SerpApi Production ($150/mo, 15,000 searches, Legal Shield), `engine=google` then `google_ai_overview` with `page_token` redeemed within 60 s in the same step | Legal cover and a second opinion on 5% of captures; the page_token path is budgeted as two searches. |
| LLM | Claude via `@anthropic-ai/sdk` 0.131.x; aliases `MODEL_EXTRACT` (Haiku-class), `MODEL_MATRIX` (`claude-sonnet-5-5`), `MODEL_BRIEF` (`claude-opus-5-5`); all scheduled work through Message Batches | Batch is 50% off and supports structured outputs. Haiku 4.5 retires "not sooner than 2026-10-15", so IDs live only in `config/models.ts`. |
| Embeddings | voyage-4-lite, 1024-d, `input_type: document` (`voyageai` 0.4.0) | $0.02/MTok with 200M free tokens. |
| Raw storage | Cloudflare R2, lifecycle 90 days (raw payloads) and 14 days (cited-page HTML), pointers only in Postgres | Zero egress; current per-GB price unverified, expected single-digit dollars. |
| Page fetching | undici + Defuddle **0.19.4** + cheerio; Firecrawl (Free 1,000 credits/mo; Hobby $16) behind `FIRECRAWL_API_KEY` | No headless browser, no worker host. |
| Diff, URLs, dates | `diff` 9.0.0, `tldts`, `Intl.Segmenter` (Node full-ICU), `date-fns-tz` | Deterministic, typed, no services. |
| Billing, email, telemetry | Stripe **23.0.0** Checkout + Billing; Resend **6.32.1** + React Email (Free 100/day, then Pro $20); PostHog; Sentry Developer; Cloudflare Turnstile | All free tiers at launch except Stripe fees. |

---

## 4. Data model

Postgres via Drizzle. Every table has `id uuid primary key default gen_random_uuid()` and `created_at timestamptz not null default now()` unless noted; `*_id` columns are foreign keys. Enums are Postgres enums.

### Global capture pool (no `organization_id`, no RLS)

- `location(code int pk, name text, country_iso char(2), timezone text, kind enum('country','city'))` — seeded from DataForSEO `serp/google/locations`; v1 ships the 10 country rows.
- `capture_series(normalized_query text, gl char(2), hl text, location_code int → location, device enum('desktop','mobile'), provider enum('dataforseo','serpapi'), timezone text, aio_language text, cadence_max smallint, bootstrap_until date, is_canary bool default false, status enum('active','watching','inactive'), last_present_at timestamptz, subscriber_count int default 0; UNIQUE(normalized_query, gl, hl, location_code, device, provider))`
- `capture_attempt(series_id, capture_day date, slot_index smallint, attempt_no smallint, provider enum, provider_task_id text, idempotency_key text UNIQUE, status enum('pending','submitted','received','missed','failed_over'), cost_usd numeric(8,5), submitted_at, received_at; UNIQUE(series_id, capture_day, slot_index, attempt_no))` — the idempotency key is `${series_id}:${capture_day}:${slot_index}`.
- `snapshot(series_id, attempt_id, captured_at timestamptz, capture_day date, provider enum, status enum('present_full','present_collapsed','absent','provider_error','blocked','timeout'), aio_kind enum('text','list','table','product_grid','video','mixed') null, markdown text, content_hash text, near_dup_of uuid null → snapshot, extraction_reused_from uuid null, raw_uri text, raw_html_uri text null, organic_top20 jsonb, model_regime_id uuid null, prompt_version text, embedding vector(1024) null; INDEX(series_id, captured_at))`
- `aio_block(snapshot_id, position smallint, type enum('paragraph','heading','list_item','table','expanded','video','unknown'), text text, expanded bool default false, reference_indexes int[])`
- `aio_reference(snapshot_id, idx smallint, url text, url_normalized text, registrable_domain text, platform_class enum('editorial','vendor','video','forum','social','encyclopedia','review','government','other'), title text, snippet text, source text)`
- `claim(snapshot_id, block_position smallint, sentence_ref text, atomic_text text, claim_type enum('recommendation','fact','comparison','definition','step','caveat'), reference_indexes int[], from_expanded bool, language text, embedding vector(1024), cluster_id uuid null)`
- `claim_cluster(series_id, canonical_text text, medoid_claim_id uuid, first_seen date, last_seen date, renders_seen int, renders_observable int, expanded_only bool, model_regime_id uuid null)` and `claim_cluster_member(cluster_id, claim_id; pk(cluster_id, claim_id))`
- `entity(series_id, canonical_name text, type enum('product','brand','feature','price','metric','person','place','other'), aliases text[], embedding vector(1024))` and `entity_mention(entity_id, claim_id, snapshot_id, role enum('recommended','cited','mentioned'), self_promotional bool default false)`
- `snapshot_format(snapshot_id pk, labels text[], answer_lead text, answer_lead_block smallint, word_count int, list_count int, list_type text, has_table bool, heading_count int)`
- `series_metrics_daily(series_id, capture_day date, renders int, present_renders int, trigger_rate numeric, jaccard_url numeric, jaccard_domain numeric, sources_per_aio numeric, drift_cosine numeric, goa_top10 numeric, goa_top20 numeric, format_fingerprint jsonb, diff jsonb; pk(series_id, capture_day))`
- `cited_page(url_normalized text UNIQUE, canonical_url text, registrable_domain text, platform_class enum, fetched_at timestamptz, fetch_status enum('ok','blocked_robots','blocked_signal','blocked_bot','error','too_large'), html_uri text null (14-day lifecycle), features jsonb, analysis jsonb, quotes jsonb (≤ 5 × ≤ 200 chars, enforced in code), prompt_version text)` — shared cache, one fetch per URL per 7 days across all orgs.
- `model_regime(detected_at timestamptz, kind enum('presence','sources','citation_churn'), metrics jsonb, window_end timestamptz null)`
- `provider_health(provider enum, window_start timestamptz, attempts int, success_rate numeric, latency_p50_ms int, schema_failures int, presence_vs_canary numeric, score numeric, is_primary bool)`
- `canary_daily(day date pk, presence_rate numeric, sources_per_aio numeric, global_jaccard numeric, sigma_flag bool)`
- `cost_rollup(day date, organization_id uuid null, kind enum('serp','llm','embed','fetch','inngest'), usd numeric(10,5); pk(day, organization_id, kind))`

### Org-scoped (`organization_id uuid not null`, RLS policy `organization_id = current_setting('app.org_id', true)::uuid`)

- Better Auth tables: `user`, `session`, `account`, `verification`, `organization(+ kind enum('brand','agency','seller','internal') default 'brand', timezone text default 'America/New_York')`, `member`, `invitation`, `subscription`. `external_identity(organization_id, user_id, provider enum('legiit','google'), external_id text, linked_at)` is created empty for v1.1.
- `tracked_query(organization_id, series_ids uuid[] (desktop and mobile series), label text, own_domain text, own_url text null, brand_terms text[], status enum('watching','confirmed','active','paused'), published_at timestamptz null, source enum('free','starter','pro','playbook'), playbook_expires_at timestamptz null)`
- `analysis_run(organization_id, tracked_query_id, kind enum('preliminary','seven_day','weekly'), window_start date, window_end date, n_days int, n_renders int, metrics jsonb, coverage_matrix jsonb null, model_versions jsonb, prompt_version text, cost_usd numeric(8,4), status enum('queued','running','ready','failed'))`
- `brief(organization_id, analysis_run_id, version int, content jsonb, markdown text, ai_generated bool default true, model_versions jsonb, cost_usd numeric(8,4))`
- `draft_check(organization_id, tracked_query_id, source enum('url','text'), input_hash text, features jsonb, comparison jsonb)` — deterministic only.
- `work_order(organization_id, tracked_query_id, brief_id, status enum('draft','ordered','in_progress','delivered','published','tracking','cancelled'), fulfilment_channel enum('self','team','legiit_seller','other'), external_ref text null, deliverable_url text null, published_at timestamptz null)`
- `page_section(organization_id, tracked_query_id, heading_path text, position_ratio numeric, text_hash text, embedding vector(1024), fetched_at)` — no text column.
- `citation_event(organization_id, tracked_query_id, snapshot_id, match_level enum('exact_url','canonical','path_prefix','subdomain','registrable_domain','brand_entity'), kind enum('first_seen','lost','regained','brand_mention'), section_id uuid null, n_renders int, confidence enum('low','medium','high'), suppressed_by_regime bool default false)`
- `org_budget(organization_id pk, captures_per_day int, llm_usd_per_day numeric, fetches_per_day int)` and `usage_ledger(organization_id, day date, captures int, llm_usd numeric, fetches int; pk(organization_id, day))`
- `abuse_signal(email_hash text, ip_hash text, kind text, at timestamptz)` (system-owned, no RLS).

### Pool-to-org subscription

`series_subscription(series_id, tracked_query_id, organization_id, cadence smallint; pk(series_id, tracked_query_id))` keeps `capture_series.cadence_max = max(cadence)` and `subscriber_count` via triggers; a series with zero subscribers and no canary flag becomes `inactive`.

---

## 5. The daily pipeline

All LLM calls use `client.messages.parse` or a batch request with `output_config.format = zodOutputFormat(schema)`; every schema is flat, `additionalProperties: false`, `minItems ≤ 1`, no recursion, ≤ 24 optional fields; `stop_reason` is checked before `parsed_output` is trusted; `custom_id = ${jobType}:${entityId}:${schemaVersion}`; `prompt_version` and the resolved model ID are stamped on every derived row; every usage object is written to `cost_rollup`. The AIO language (`capture_series.aio_language`, defaulting to `hl`) is passed into every prompt.

1. **Add query (interactive).** Intake normalizes and validates. **LLM call A, `MODEL_EXTRACT`, sync**: input `{query, hl}`, output `{is_person_query: boolean, reason: string}`; rejected queries show the reason. DataForSEO Labs `related_keywords` lists up to 5 siblings whose `serp_item_types` include `ai_overview` (filtered client-side). One Live Advanced call confirms; its payload becomes snapshot #1. The series is looked up or created (`bootstrap_until = today + 7`); an existing series gives the org its history on day 0. Absent AIO → `watching` with siblings offered; the series captures at Starter cadence with no LLM spend until `status = present_*`.

2. **Schedule (Inngest cron, `TZ=UTC 0 * * * *`, 15-minute jitter).** For each active series, compute the local slot plan from `cadence_max`, `bootstrap_until` and `timezone` (DST-safe; `capture_day` is the local date). For slots due this hour: check `org_budget` for every subscriber and the global provider ceiling; insert `capture_attempt` with the idempotency key (unique violation = already planned, no-op); submit up to 100 tasks per POST to DataForSEO Standard with `load_async_ai_overview=true`, `device`, `os`, `location_code`, `language_code`, `tag = idempotency_key`, `postback_url` with a secret, `postback_data=advanced`. Concurrency and throttle match DataForSEO's 2,000 calls/min.

3. **Receive and normalize.** The postback route verifies the secret, stores raw JSON in R2 (`raw/<provider>/<series_id>/<captured_at>.json`), and emits `capture/result.received`. `normalize-snapshot` maps the payload to `CanonicalSnapshot`: status, `aio_kind`, blocks with `reference_indexes` (unknown element types preserved as `type = 'unknown'` with raw text, never dropped), references with `url_normalized`, `registrable_domain` (tldts) and `platform_class`, organic top 20, `content_hash` over normalized block text; images are discarded; JSON-schema validation failures increment `provider_health.schema_failures`. An hourly sweeper polls `task_get` for attempts with no postback after 20 minutes; after 3 attempts the slot is `missed`; when the primary's health score is below 0.8, the attempt fails over to SerpApi (`no_cache=true`, `page_token` redeemed within 60 s in the same step) unless the primary already succeeded (guarded by the idempotency key, so no second snapshot and no second cost row).

4. **Dedupe gate.** Exact `content_hash` match with any prior render of the series → `extraction_reused_from`, claims and formats reused, citations diffed. Otherwise embed the markdown (voyage-4-lite) and compare with the previous render: reuse only if cosine ≥ 0.98 **and** the set of reference domains is identical **and** the set of capitalized entity strings in the text is identical (cheap guard against a swapped recommendation hiding behind a near-duplicate). Otherwise queue extraction. Free orgs' series are extracted only from capture-day 3.

5. **Extract (hourly batch assembler, `MODEL_EXTRACT`).** Every unique snapshot lacking claims goes into one Message Batch (1-hour cache TTL on the shared system prompt). **LLM call B**: input `{query, aio_language, blocks[] pre-split into sentences with Intl.Segmenter, each sentence carrying sentence_ref and inherited reference_indexes}`; prompt follows Claimify (select verifiable sentences, disambiguate, decompose into self-contained atomic claims). Output (all required): `claims[] {sentence_ref, atomic_text, claim_type, reference_indexes[], entities[] {name, type, role}}`, `format_labels[]`, `answer_lead_sentence_ref`. Validation rejects unknown `sentence_ref`s and reference indexes; refusal or `max_tokens` retries once with a higher limit. Claims and entity names are embedded; a claim joins the nearest cluster in its series at cosine ≥ 0.90, pairs in 0.80–0.90 go to **LLM call C** (`MODEL_EXTRACT`, batched, `{same_claim: boolean}`), otherwise a new cluster is opened. Thresholds live in `thresholds.ts`, generated by the eval runner. Entities resolve by alias table then embedding; a `recommended` entity whose supporting reference is its own registrable domain is flagged `self_promotional`.

6. **Count and diff (SQL, no LLM).** `series_metrics_daily` is recomputed for the window (Section 6); `jsdiff.diffArrays` over ordered cluster IDs plus set diffs over citations and entities produce the day-to-day diff stored in `diff`. At 07:00 in each org's timezone, `send-daily-digest` renders one email per org covering every tracked query with a change (skipped when nothing changed; never includes the whole AIO, only changed sentences with `n`). The analysis gate creates a `preliminary` run at ≥ 3 capture-days and a `seven_day` run at ≥ 5 capture-days and ≥ 10 renders, which sends the report-ready email once.

7. **Reverse-engineer (on `seven_day`).** Rank cited URLs by times cited; exclude platform classes (reported separately as "not displaceable by a page"); take the top 10 (3 on free). Each URL is fetched at most once per 7 days across all orgs through the etiquette fetcher (named UA `LegiitOverviewsBot/1.0 (+https://<domain>/bot)`, RFC 9309 robots with 5xx = disallow and 24 h cache, `Content-Signal: ai-input=no` → structure-only analysis with `blocked_signal`, ≤ 1 req/s per host, SSRF guard, 5 MB cap, text/html only). Defuddle + cheerio compute the structural features in code. **LLM call D** (`MODEL_EXTRACT`, batch, one per page): input `{query, aio_language, page markdown truncated to 12K tokens by countTokens, computed features}`; output `{topics[], entities[], evidence_items[] {type: original_data|test_result|screenshot|quote|pricing|spec, excerpt ≤ 200 chars}, questions_answered[], answer_sentence_index, approach_summary, quotes[] ≤ 5}`. Code computes words and characters before the first direct answer from `answer_sentence_index`. HTML goes to R2 for 14 days; features and quotes stay.

8. **Coverage matrix and brief.** **LLM call E** (`MODEL_MATRIX`, batch; sync when triggered by an upgrade): input is the per-page analysis JSON plus the series aggregates (~26K tokens, never raw renders); output `{topic_matrix[] {topic, cells[] {page_id, state: covered|partial|missing, excerpt ≤ 200}}, entity_matrix[], format_matrix[], common_to_all[], gaps_no_winner_fills[], aio_claims_unsupported[] {cluster_id, text}}`. **LLM call F** (`MODEL_BRIEF`, batch; sync on upgrade or Playbook purchase): input is the matrix, cluster and entity aggregates with recurrence, format fingerprint, unsupported claims and PAA questions; output is the brief schema in Section 7. Free accounts get the matrix and a gated brief and never trigger `MODEL_BRIEF`.

9. **Publish and track.** On "mark as published" the own URL is fetched with the same fetcher, split by headings, embedded into `page_section` (refreshed weekly). On every new snapshot of a series with published subscribers, `detect-wins` runs the matcher over references and brand terms over text, maps citing blocks to the best section at cosine ≥ 0.8, writes `citation_event` rows and sends alerts under the rules in Section 7. The weekly run recomputes metrics in SQL only. `canary-daily` computes presence rate, sources per AIO and global citation Jaccard across the 100 sentinel series and opens a `model_regime` row on a > 2σ move against the trailing 14 days.

---

## 6. Pattern analysis and citation reverse-engineering methodology

Every metric is defined once, computed in SQL over extracted rows, and shown with its denominator. Denominators are renders, never days. Confidence labels by `n` renders: `low` < 10, `medium` 10–20, `high` ≥ 21. Every count on screen drills down to the renders and sentences behind it.

| Metric | Definition | Notes |
|---|---|---|
| Trigger rate | present renders ÷ all non-error renders (`status in present_full, present_collapsed, absent`) | `provider_error`, `blocked`, `timeout`, `missed` are excluded from the denominator and shown separately |
| Citation stability | mean pairwise Jaccard of cited-URL sets across present renders; same for registrable-domain sets | computed over the window; also per consecutive pair for the sparkline |
| Survival rate per URL and per domain | renders citing it ÷ present renders; buckets CORE ≥ 80%, RECURRING 40–80%, ROTATING < 40% | reported at both URL and domain level; platform class shown beside each |
| Claim recurrence | `renders_seen ÷ renders_observable` per cluster, where `renders_observable` excludes `present_collapsed` renders for `expanded_only` clusters | a cluster seen only behind "Show more" is not penalised by collapsed renders |
| Entity recurrence | renders mentioning the entity ÷ present renders, split by role `recommended` vs `cited` domain, with `self_promotional` flagged | "cited is not recommended" is visible in the UI and the brief |
| Semantic drift | cosine between consecutive renders' markdown embeddings | expected ≈ 0.95; < 0.85 flagged as a real answer change |
| Format fingerprint | share of present renders with each label (ranked list, bullets, table, pros/cons, "best for" labels), median word count, answer-lead position | drives the brief's required formats |
| GOA share | share of cited URLs appearing in the organic top 10 and top 20 of the same render | organic results are captured with every render |
| Sources per AIO | mean reference count per present render | one of the three canary signals |
| Day-to-day diff | `diffArrays` over ordered cluster IDs (added, dropped, reordered), set diffs of citations and entities, `diffSentences` on text for display | feeds the digest email and the timeline |
| Important differences | clusters and citations present in < 40% of renders, grouped by capture_day | the thread's fifth item |

Cross-provider agreement (presence and citation Jaccard between DataForSEO and SerpApi on the 5% dual-capture sample) is a system metric, not a customer one.

**Cited-page reverse engineering** computes in code, for each of the top displaceable pages: words and characters before the first direct answer, heading outline (h1–h4 tree), tables (count, rows × cols, header cells), lists (ordered/unordered, item counts), comparison blocks (tables or lists naming ≥ 2 entities), numeric density (numbers per 100 words), schema.org types from JSON-LD, author, `datePublished`/`dateModified`, word count, internal and external link counts, FAQ presence, page type. One LLM call per page adds topics, entities, evidence items, questions answered and an approach summary. One LLM call per run builds the coverage matrix. Domain authority and freshness are never weighted; dates are context only. Pages the publisher blocks are shown as "publisher blocks automated analysis" and kept in the matrix as unknown cells.

---

## 7. Brief generation and post-publish attribution

**Brief schema** (`MODEL_BRIEF`, all fields required; every item carries `evidence_refs[]` of the form `cluster:<id>`, `entity:<id>`, `page:<id>`, `matrix:<row>`, `question:<id>`):

`answer_lead {text_to_say_first, max_words}`, `must_cover_topics[] {topic, recurrence_pct, satisfies_clusters[]}`, `must_mention_entities[] {name, recurrence_pct, role}`, `required_formats[] {kind: table|ranked_list|bullets|comparison, spec (suggested columns or items)}`, `evidence_to_include[] {what, which_winners_have_it}`, `new_to_cite[] {idea, why_google_lacks_it, how_to_produce: original_data|first_hand_test|new_statistic|better_comparison|useful_table|unanswered_question, tied_to: unsupported_claim|matrix_gap|unanswered_question}`, `questions_to_answer[]`, `outline[] {heading, level, purpose, target_words}`, `technical_checklist[]` (indexable, snippet-eligible, no `nosnippet`, JSON-LD types, visible author and date), `avoid[]`.

Deterministic guards before a brief is stored: every `must_cover` topic maps to a cluster with recurrence ≥ 40%; every `must_mention` entity recurs in ≥ 2 renders; no 12-word span of the brief matches any stored competitor quote; the Markdown export carries `ai_generated: true` front-matter, an HTML comment marker and the line "AI-generated draft — human review required". Regeneration counts against the plan cap; Pro gets an automatic re-brief with a diff against v1 at day 28. The **draft check** (URL or pasted text) runs the same feature extractor and shows the user's numbers beside the CORE pages' medians (words before answer, tables, lists, comparison blocks, numeric density, schema types, author/date, topic and entity coverage by string and alias match); no LLM.

**Own-page matcher** (`packages/core/src/match`, standalone and table-tested): URL normalization (lowercase host, strip scheme, default port, fragment, trailing slash, `index.html`, `utm_*`, `gclid`, `fbclid`, `ref`; percent-decode; punycode), unwrapping of `google.com/url?q=` and AMP cache hosts, resolution of up to 5 redirect hops and `rel=canonical` on both sides with a 7-day cache, registrable domain via tldts, match levels `exact_url > canonical > path_prefix > subdomain > registrable_domain > brand_entity`; platform domains (youtube, reddit, medium, linkedin, facebook) match only at `exact_url` or `path_prefix`. Brand terms are matched in block text as `brand_mention`, counted separately from citations; "cited and recommended" co-occurrence is reported.

**Section mapping**: each block whose `reference_indexes` include the own URL is embedded and assigned to the `page_section` with the highest cosine (≥ 0.8), else to an `unmatched` bucket; the track page shows per-H2 citation counts over the rolling window.

**Event and alert rules** (every email states `n` and the confidence label):
- `first_seen`: own URL matched in any render → event and email immediately (match level shown).
- `lost`: own URL absent from every render on 2 consecutive capture-days after a `first_seen`, with ≥ 4 renders in that span; never from a single absent render.
- `regained`: a match after a `lost`.
- During an open `model_regime` window, `lost` events are written with `suppressed_by_regime = true`, no email is sent, and the dashboard shows the platform-event banner; one platform-event email per org, not per query.
- Weekly recompute (SQL only) refreshes survival buckets, "what sources keep winning" and "what changed" for the tracked window; the 14-day and 28-day rolling survival rates are shown beside the 7-day figures.

---

## 8. Build phases

Eight calendar weeks for one person with Claude Code. Phase 0 is gated by seven real capture-days; Phase 2's exit needs beta users to reach five capture-days, so Phase 3 starts during that wait. Each task is sized for one Claude Code session and names its files and acceptance tests.

### Phase 0 — Pilot kernel (weeks 1–2)

**Goal.** Build `packages/core` and the CLI, capture ~50 buying-intent queries 3×/day for 7 days on both providers, produce the fixture corpus, compute the gate metrics, generate ~10 playbooks sold manually through Legiit. Every module is imported unchanged by the SaaS.

1. **Monorepo scaffold.** `pnpm-workspace.yaml`, `packages/core`, `apps/cli`, `CLAUDE.md` (< 200 lines, `@AGENTS.md`, pins: next 16.3.x, typescript 6.x, drizzle-orm 0.45.3, better-auth 1.7.7, inngest 4.21.1, @anthropic-ai/sdk 0.131.x, diff 9.0.0, defuddle 0.19.4, voyageai 0.4.0, stripe 23.0.0, resend 6.32.1, tldts), `packages/core/src/env.ts` (zod), `config/models.ts` (aliases from env), Vitest, Biome, `.github/workflows/ci.yml`. *Accept:* typecheck, lint, test green; `pnpm pilot --help` lists `capture report patterns playbook eval`; a grep test fails on any literal `claude-` outside `config/models.ts`.
2. **Query intake.** `intake/normalize.ts`, `validate.ts`, `pii-classifier.ts` (LLM call A behind an interface with a recorded mock). *Accept:* 40-case table test (`'Best CRM?' → 'best crm'`, `site:` rejected with code `OPERATOR`, 201 chars rejected, unicode width); live smoke behind `RUN_LIVE=1`.
3. **SerpProvider and DataForSEO adapter.** `providers/types.ts` (`submit`, `fetch`, `live`, `name`, `cost`), `providers/dataforseo.ts`, `providers/http.ts` (undici, retries, hard assertion that no request host matches `google.com`). *Accept:* msw-recorded tests assert every required param and the `tag`; cost is $0.0012 Standard and $0.004 Live; a refunded no-AIO task yields `absent`.
4. **SerpApi adapter and health scoring.** `providers/serpapi.ts` (page_token redeemed inside the same call under a 60 s deadline with fake timers; `searches_used` 1 or 2), `providers/health.ts`. *Accept:* embedded-AIO, page_token, expired-token and degradation paths; 50 results with 10 failures → score 0.8.
5. **Normalizer and fixture corpus.** `normalize/{canonical,dataforseo,serpapi,hash}.ts`, `scripts/fixtures-capture.ts` (30 queries, JSON and HTML with `expand_ai_overview=true`, both providers) into `tests/fixtures/aio/<provider>/<variant>/`, `docs/fixtures.md`. *Accept:* golden tests for text, list, table, product_grid, video, mixed, expanded, collapsed, absent, async-null, provider_error, page_token; status mapping matrix; unknown block types preserved; the doc states empirically whether DataForSEO JSON contains post-"Show more" text.
6. **Pilot storage and scheduled capture.** `db/schema.ts` (pool subset), `db/client.ts` (Neon), `storage/r2.ts`, `apps/cli/src/commands/{capture,seed-queries}.ts`, `.github/workflows/pilot.yml` (06:00/12:00/18:00 America/New_York). *Accept:* `--dry-run` prints 100 submissions; a real run writes rows and R2 objects; the same slot twice inserts nothing; ≤ 5% missed slots over 7 days.
7. **Metrics module and gate report.** `metrics/{trigger,stability,survival,recurrence,format,goa,drift,diff,agreement}.ts`, `commands/report.ts`. *Accept:* hand-computed Jaccard and survival fixtures; property tests (identical renders → Jaccard 1, drift 1; disjoint → 0); `renders_observable` excludes collapsed renders for expanded-only clusters; the report prints a `GATE PASS/FAIL` line for "AIO on ≥ 5 of 7 days for ≥ 60% of queries".
8. **Claim extraction, embeddings, clustering, eval.** `llm/{client,batch,schemas}.ts`, `prompts/claim-extraction.ts`, `analysis/{segment,embed,cluster,entities}.ts`, `evals/claims/pairs.jsonl` (200 labelled pairs from pilot data), `evals/run-cluster.ts` writing `analysis/thresholds.ts` with the run id. *Accept:* every schema passes the structured-output constraint test; batch round-trip with mocked results including partial failures and expired requests; F1 ≥ 0.85 at the committed thresholds; identical render → zero LLM calls; `'Tally'` and `'Tally Forms'` resolve to one entity.
9. **Cited-page pipeline and playbook.** `fetch/{ssrf,robots,fetcher}.ts` (Firecrawl behind an env flag), `pages/{features,platform-class}.ts`, `prompts/{page-analysis,coverage-matrix,brief}.ts`, `commands/playbook.ts`, `docs/fetch-report.md`. *Accept:* SSRF tests (metadata IP, 10.x, localhost, redirect-to-private rejected); robots and Content-Signal produce `blocked_*`; feature golden tests on 10 saved pages; playbook end-to-end on fixtures with a mocked LLM contains both markers and `evidence_refs` on every item; the fetch report records the blocked-page rate across all pilot citations and the decision rule (> 20% → Firecrawl primary).
10. **Economics and legal register.** `docs/unit-economics.md` regenerated with `count_tokens` on 20 real payloads, `docs/legal-risk.md` (dockets, ToS versions, DataForSEO §7.1 request logged), `docs/pilot-results.md` (gate metrics, cross-provider agreement, playbook sales log). *Accept:* all three exist with real numbers; the §7.1 email is sent and logged.

**Exit criteria.** AIO present on ≥ 5 of 7 days for ≥ 60% of the 50 queries; ≥ 5 paid playbooks at $99–149 through Legiit; fixture corpus covers every status and `aio_kind`; clustering F1 ≥ 0.85; measured extraction tokens in the economics doc; DataForSEO reply received or SerpApi promoted to primary in config. Phase 1 does not start until this passes.

### Phase 1 — Cloud capture pool and safety rails (weeks 3–4)

**Goal.** Run the kernel as a scheduled, tenant-safe service with failover, canary and cost guardrails before any customer screen exists.

1. **apps/web scaffold.** `create-next-app@16.3`, Tailwind, shadcn/ui, `app/api/inngest/route.ts` (`maxDuration = 300`), `app/api/health`, Sentry and PostHog wiring, `next.config.ts` with `logging.browserToTerminal: 'error'`, Vercel Pro with the Neon integration, a PreToolUse hook blocking `drizzle-kit push` and `vercel --prod` outside CI. *Accept:* preview deploy green; `/api/health` returns sha and db ok; Sentry receives a test event.
2. **Full schema, migrations, RLS, seed.** All tables in Section 4, `db/withOrg.ts` (`SET LOCAL app.org_id` in a transaction), `db/forOrg.ts`, `pgPolicy` on every org table, `scripts/seed.ts` (one org, fixture series with 7 days of snapshots, 100 canary series). *Accept:* two orgs cannot read each other's `tracked_query` under `withOrg`; pool tables readable without it; `drizzle-kit check` in CI; the dashboard renders from seed with no vendor spend.
3. **Slot scheduler.** `inngest/functions/schedule-slots.ts`, `core/schedule/slots.ts` (bootstrap cadence, tier cadence, series timezone). *Accept:* the plan across the 2026-11-01 America/New_York DST change yields exactly the expected slots; a new series gets 2 slots/day for 7 days then its tier cadence; an over-budget org is skipped and logged; re-running the hour submits zero tasks; function declares concurrency and throttle.
4. **Postback, normalize, sweeper, failover.** `app/api/webhooks/dataforseo/route.ts`, `normalize-snapshot.ts`, `sweep-attempts.ts`. *Accept:* replaying every fixture through the route matches the golden snapshots; 3 simulated failures → `missed`; primary success after fallback enqueue produces one snapshot and one cost row; Inngest executions per successful capture measured on the dev-server trace and recorded in `docs/unit-economics.md` (target ≤ 3, budget 5).
5. **Provider health, canary, cost ledger, ceilings.** `provider-health.ts` (switches `is_primary` below 0.8, one founder email per switch), `canary-daily.ts`, `cost-rollup.ts`, `docs/runbooks/budget-pause.md`. *Accept:* ceiling test refuses enqueue while paused with exactly one alert; a 42% domain-replacement step in seeded data opens a `model_regime` row; Anthropic Console and Vercel Spend Management limits recorded with screenshots.
6. **Extraction, clustering, metrics and gate jobs.** `extract-claims.ts` (hourly batch assembler, `step.sleep` polling), `cluster-and-metrics.ts`, `analysis-gate.ts`. *Accept:* mocked batch populates 7 fixture days; a near-duplicate render makes zero LLM requests and a swapped-entity render forces extraction; the series language is in the submitted prompt; preliminary → seven_day transitions at the right counts; re-running a night creates no duplicate claims.

**Exit criteria.** Fixture and 100 canary series capture unattended for 3 consecutive production days with ≤ 5% missed slots; failover passes in staging; `cost_rollup` matches vendor dashboards within 5%; no literal model IDs in code.

### Phase 2 — The seven-day loop UI (week 5)

**Goal.** A trial user signs up, adds one query, watches it fill, reads the daily digest and opens the pattern report.

1. **Auth and abuse controls.** Better Auth magic link via Resend, organization plugin auto-creating a personal org, Turnstile verified server-side, disposable-domain blocklist, one free series per verified email, one signup per IP per day. *Accept:* Playwright signup and login; disposable domain rejected; request without a Turnstile token returns 400; second free query shows the upgrade CTA.
2. **Add-query flow.** `app/(app)/queries/new`, `locale-picker.tsx` (10 countries, hl, device by plan), `watching-state.tsx`. *Accept:* two orgs adding `best crm` en-US desktop share one series and the second sees history; absent AIO → `watching` with siblings; operator and PII errors inline; plan limits enforced server-side; exactly one Labs and one Live cost row per add.
3. **Query dashboard.** Progress meter, AIO render with citation chips, render timeline with status badges, citations table with survival buckets and platform class, day-diff view, evidence drawer behind every count. *Accept:* seeded org renders in < 1 s server time; diff equals the metrics module output; every percentage carries `n` and a confidence label.
4. **Patterns and 7-day report.** Recurring claims, entities (recommended vs cited, self-promotional flag), formats, sources, important differences, stability and drift sparkline, GOA share; `lib/report-gating.ts`; `confidence-badge.tsx`. *Accept:* 2 days → locked, 3 → preliminary with badge, 5 days and 10 renders → full; numbers equal `series_metrics_daily`; report-ready email once per run.
5. **Emails.** `packages/email/{daily-digest,report-ready,brief-ready,citation-win,platform-event}.tsx`, `send-daily-digest.ts` (per org, 07:00 org-local, only when a diff exists), Resend 100/day guard. *Accept:* snapshot tests; digest skipped when nothing changed; guard queues beyond the cap and logs a "move to Resend Pro" warning.

**Exit criteria.** 10 beta users reach `query confirmed → 5 of 7 capture-days → report opened` without founder intervention; PostHog shows the funnel; no Sentry error class repeats more than twice.

### Phase 3 — Reverse engineering, brief and billing (weeks 6–7)

**Goal.** Steps 4 and 5 ship behind Stripe; free users get a gated preview.

1. **Cited-page jobs.** `analyze-sources.ts` (shared cache, 7-day freshness, host throttle, features, LLM call D in batch, quote cap enforced in code, HTML to R2 with 14-day lifecycle). *Accept:* a second org requesting the same URL within 7 days causes no fetch; a Content-Signal opt-out page is stored with `blocked_signal` and shown as "publisher blocks automated analysis"; a sixth or 201-char quote is rejected.
2. **Coverage matrix and brief jobs.** `generate-brief.ts` (LLM calls E and F in batch; sync on upgrade or Playbook), brief schema and guards, versioning and regeneration caps, day-28 re-brief for Pro. *Accept:* mocked end-to-end produces `coverage_matrix` and brief v1; every `evidence_ref` resolves; the 12-word-span guard rejects a seeded copy; export has both markers; regeneration beyond the cap returns a plan error; free accounts never call `MODEL_BRIEF`.
3. **Sources, heatmap, brief and draft-check UI.** `sources/page.tsx` (per-page profiles), `coverage-heatmap.tsx` (cells open the excerpt), `brief/page.tsx` (baseline vs new-to-cite, outline, checklist, export, "Get it built on Legiit" link), `draft-check/page.tsx` (user numbers beside CORE medians), `gated-section.tsx`. *Accept:* heatmap click opens the excerpt; export downloads `.md` with the marker; free user sees blurred brief sections; the draft check of a copied CORE page shows parity and makes zero LLM calls.
4. **Billing, plans, seats.** Better Auth Stripe plugin (`referenceId = organizationId`, owner/admin authorize), `core/plans.ts` (Starter, Pro, Playbook one-off), `billing/page.tsx`, `on-plan-change.ts` (recompute `cadence_max`, pause excess queries on downgrade, `playbook_expires_at`), invitations page (Pro: 3 seats), `docs/runbooks/stripe-radar.md`. *Accept:* Stripe test clock flips limits within one webhook; downgrade lowers cadence and pauses excess queries; Playbook unlocks one query at Pro cadence for 30 days and triggers the brief synchronously; a fourth Pro invitation is refused; webhook replay is idempotent.

**Exit criteria.** First 3 paying subscriptions or Playbooks from the beta cohort or the Milestone 0 buyers; a paid user receives the brief within 2 hours of the `seven_day` run; measured cost per paid query-month ≤ $0.70 Starter / ≤ $1.40 Pro in `cost_rollup`.

### Phase 4 — Publish, track and launch (week 8)

**Goal.** Close step 6 and launch to the Legiit audience with the legal surface in place.

1. **Own-page matcher module.** `match/{url-normalize,unwrap,resolve,levels}.ts`. *Accept:* 60-case table test including www vs apex, trailing slash, utm, AMP cache, `google.com/url`, http→https redirect, `m.` subdomain, and a medium.com different-path case that must not match.
2. **Publish, work order and tracking.** `publish/page.tsx` (own URL, brand terms, fulfilment channel, external order URL, deterministic draft check of the live page), `index-own-page.ts`, `detect-wins.ts` (events, alert rules, regime suppression), `track/page.tsx` (own-URL survival over 7/14/28 days, sections cited, sources still winning, what changed). *Accept:* a fixture snapshot with the own URL creates `first_seen` and one email; one absent render creates no `lost`; two absent capture-days with ≥ 4 renders do; a `lost` inside a regime window is suppressed and the banner shows; section mapping assigns the citing block to the correct H2; brand mention without a URL is counted separately.
3. **Legal and launch surface.** `app/(marketing)/{terms,privacy,acceptable-use,bot}`, trademark footer on every route, platform-event banner, funnel events `query_confirmed, five_of_seven, report_opened, brief_generated, published_marked, citation_won`. *Accept:* footer present on every route (crawl test); Lighthouse accessibility ≥ 90; a `sigma_flag` row shows the banner.
4. **Launch ops.** `docs/runbooks/{vendor-shutdown,provider-failover,budget-pause}.md` rehearsed in staging, `docs/launch/{legiit-email,build-in-public,seller-onboarding}.md` (one named query replayed daily from our own data; 10–20 GEO sellers with a fixed-price build-from-brief gig). *Accept:* runbooks rehearsed once; launch email sent; seller gigs live.

**Exit criteria.** 5 paying subscriptions within 14 days of launch; activation (query confirmed → 5 of 7 → report opened → brief generated) ≥ 40% of signups; at least one customer's published URL detected as cited; month-2 decision: v1.1 (Agency tier, API/MCP on derived data, Search Console, cited-page passage matcher) only if trial-to-paid ≥ 10%.

---

## 9. Unit economics and pricing

Cost to serve one tracked query per month, batch rates for all scheduled LLM work, Haiku-class extraction at $0.0077 per unique render (~3K in / 2.5K out; re-measured in Phase 0 task 10), DataForSEO $0.0012 per capture, 5% SerpApi dual-capture, Inngest budgeted at 5 executions per capture.

| Line | Starter (1/day desktop, 30 renders) | Pro (3/day × 2 devices, 180 renders) | Free trial (7 days) |
|---|---|---|---|
| SERP capture incl. bootstrap and fallback sample | $0.06 | $0.26 | $0.02 |
| Extraction on unique renders (70% unique at 1/day; 45% at Pro cadence) | $0.17 | $0.65 | $0.03 (from day 3) |
| Embeddings and adjudication | < $0.01 | $0.01 | ~$0 |
| Seven-day analysis: 10 page analyses ($0.09, shared via cache), matrix ($0.05), brief ($0.14) | $0.28 | $0.28 (one brief per tracked query) | $0.07 (3 pages, no brief) |
| Weekly recompute (SQL), day-28 re-brief (Pro) | $0 | $0.14 | $0 |
| **Total** | **~$0.52** (budget $0.70) | **~$1.35** (budget $1.40) | **~$0.12** completed, ~$0.01 abandoned |

Fixed monthly at launch: Vercel Pro $20, SerpApi Production $150, DataForSEO prepaid $50 minimum, canary 100 series × 30 × $0.0012 ≈ $4, Inngest Pro $99 budgeted from month 2 (Free's 50k executions cover roughly 10,000 captures at 5 per capture, i.e. the first two or three Pro customers), Neon Free, Resend Free (Pro $20 at ~80 digest-receiving orgs), PostHog, Sentry, Firecrawl Free, R2 and Turnstile expected under $10. About $225 before Inngest Pro, about $325 after.

**Pricing.** Free: one query, 7 days, desktop, bootstrap cadence, pattern report at day 7, matrix on 3 pages, brief gated. **Starter $39**: 10 queries, 1 render/day desktop, 3 brief regenerations, 1 seat ($3.90 per query, ~87% gross margin). **Pro $99**: 25 queries, 3 renders/day desktop and mobile, 25 regenerations, day-28 re-brief, unlimited draft checks, 3 seats ($3.96 per query, ~66%). **Playbook $99 one-off**: one query at Pro cadence for 30 days with report, brief and 3 draft checks (cost ≈ $2, also sold as a Legiit gig at $99–149). This sits above the $1.2–2.0 per-prompt norm (Mentions.so, Otterly) and level with Semrush's $3.96 because the unit is a 7-day pattern report, a brief and attribution, not a prompt check. Break-even on fixed costs: 6 Starter or 3 Pro subscriptions before Inngest Pro, 9 or 4 after. If DataForSEO declines §7.1 and SerpApi becomes primary, Starter COGS rises to ~$0.80 and Pro to ~$3.00 per query-month, and the SerpApi plan must move to Big Data ($275 / 30,000 searches) at roughly the second Pro customer; the pricing response is Pro at 15 queries or $129.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Supply-chain legal exposure: Google v. SerpApi (amended complaint 2026-08-10, second motion to dismiss pending); Reddit v. SerpApi kept Perplexity in as a direct circumventor because it set the parameters and ran the queries, which is how every provider customer operates; vendor Legal Shields do not cover our use | Never request google.com; derived-only outward surfaces, no raw export, no API in v1; SerpApi Production kept for cover; written §7.1 confirmation or SerpApi primary; `docs/legal-risk.md` reviewed monthly; vendor-shutdown runbook rehearsed |
| COGS inversion: extraction, not SERP, drives cost; the 45% unique-render rate at Pro cadence is unmeasured | Hash and guarded near-duplicate reuse; measure in Phase 0 and again on production in Phase 3's exit gate; Pro drops to 20 queries if Pro COGS exceeds $1.40 |
| Haiku 4.5 retirement ("not sooner than 2026-10-15") changes extraction cost and clustering thresholds | Aliases in config; `thresholds.ts` regenerated by the eval runner on the successor model before switching the alias |
| AIO volatility (70% change probability, 45.5% citation churn) makes single-render signals noisy and could churn Starter users | Bootstrap cadence for the first 7 days, `n` and confidence on every number, survival buckets, `lost` only after two absent capture-days, regime suppression |
| Signed-out capture under-represents e-commerce AIOs (up to 90% fewer), and buying-intent phrasing triggers less often | Labs pre-check with sibling suggestions steering toward "best X", "X vs Y" and question forms; `watching` as a normal state; conservative onboarding copy |
| Cited-page blocking (Cloudflare defaults since 2026-09-15, Content-Signal opt-outs) punches holes in the matrix | Blocked-page rate measured in the pilot; Firecrawl promoted to primary above 20%; platform-class citations get "platform presence" advice in the brief instead of structural mimicry |
| Google layout changes (four in 2025–26) break the normalizer | Fixture corpus, `unknown` block type, schema-validation failures in `provider_health`, canary set; re-fixturing is a one-session task |
| Inngest Free exhausted by the first Pro customers | Postback-first topology measured on the trace; Inngest Pro budgeted from month 2; Vercel Workflows port scoped |
| Resend 100/day cap hits before complaints | Per-org digest (one email per org per day) and a send guard that logs the upgrade trigger |
| Model-regime shift (Gemini 3 replaced 42.4% of cited domains on 2026-01-27) invalidates baselines mid-window | Canary sigma flag, `model_regime` rows, banner, `model_regime_id` stamped on snapshots and clusters so reports can be filtered by era |
| The brief lands on day 7; opt-in trial benchmarks assume earlier value | Day-0 render from the confirm call, daily digest, preliminary patterns at day 3, Playbook SKU as a mid-trial conversion |
| One-person calendar: Phase 1 and the postback/sweeper logic are the likeliest slip points | Phase 1 given two weeks; Phase 3 overlaps the Phase 2 beta wait; nothing in Phase 0 is throwaway |
| Legiit audience is seller-skewed; buyer reach may be smaller than assumed | Playbook SKU and the manual gig keep revenue flowing during the pilot; SEOFOMO placement and build-in-public posts as the external channel; no reliance on Jake Ward, who distributes Mentions.so |
| "Legiit Overviews" is pending counsel; a late rename costs domain, Stripe product names and copy | Decide before Phase 2; "Overviews" alone is not on Google's trademark list |

---

## 11. Open decisions for the founder

1. **Provider primary.** Send the DataForSEO §7.1 confirmation request on day 1. If no written reply arrives by the end of Phase 0, start Phase 1 with SerpApi as primary in config and the Big Data plan budgeted.
2. **Name.** Confirm "Legiit Overviews" (or an alternative without Google, AIO, AI Overview, Gemini or SGE) with counsel before Phase 2 so Stripe products and the domain are set once.
3. **Launch countries and timezones.** Confirm the 10 country rows (US, UK, CA, AU, DE, FR, ES, IT, NL, IN proposed) and that one timezone per country is acceptable for v1.
4. **Pro query count.** Hold 25 queries at $99 only if Phase 0 measures Pro-cadence unique renders at or below 45%; otherwise ship Pro at 20 queries.
5. **Seats.** Pro ships with 3 seats here; decide whether Starter stays at 1 or gets 2 to reduce the agency objection.
6. **Playbook fulfilment.** Decide whether the $99 Playbook in-app also includes the "built by a Legiit seller" upsell at a fixed price in v1, or whether the deep link alone is enough until the attach rate is measured.
7. **Firecrawl threshold.** Confirm the 20% blocked-page rule for promoting Firecrawl to primary, and whether the Hobby plan ($16) is pre-approved.
8. **Inngest vs Vercel Workflows.** Accept Inngest Pro at $99 from month 2, or schedule the Workflows port as a Phase 1 task if fixed cost before revenue matters more than a week of build time.
9. **Bootstrap cadence on Free.** The second daily render for 7 days costs under a cent per trial; confirm it applies to Free as well as Starter (recommended, since it makes the day-7 report real).
10. **Search Console in v1.1.** Decide whether to start Google OAuth consent-screen verification (privacy policy, homepage, demo video) in week 1 so the 100-user cap is lifted by the time v1.1 ships, or defer entirely.
11. **Counsel budget and timing.** Terms, privacy policy, acceptable-use rules, the share-page and API posture for v1.1, and the Reddit v. SerpApi "direct circumventor" reading all need one counsel review before launch; decide whether that happens in Phase 1 or Phase 4.
12. **Milestone 0 sales channel.** Confirm the manual Playbook gig lives in GEO subcategory 158 at $99–149 and who fulfils the first ten (founder-run, to measure time-to-produce).