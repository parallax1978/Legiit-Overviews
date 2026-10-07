# Legiit Overviews: execution plan

A SaaS that automates Jake Ward's six-step process for winning a Google AI Overview: pick one buying-intent query, capture the AI Overview every day, find the patterns with AI, reverse-engineer the cited pages, build a better page from a brief, then keep tracking. Source thread: `docs/source-thread.md`. Research behind the choices: `docs/research/`. Cost model: `docs/unit-economics.md`.

Working name: Legiit Overviews.

Written to be executed by Claude Code one task at a time. See "How to execute" at the end.

---

## 1. What we are building

One query at a time, the product:

1. **Confirms** the query triggers an AI Overview in Google Search for the chosen country, language and device, and suggests sibling queries that do if it does not.
2. **Captures** the AI Overview on a schedule (full answer blocks, citations mapped to the blocks they support, the organic top 20, timestamp, status) into a global capture pool shared by every customer tracking the same query.
3. **Counts** what keeps showing up: recurring claims, recommended entities versus cited domains, format fingerprint, source survival (CORE / RECURRING / ROTATING), citation stability, semantic drift, share of citations in the organic top 10, and a day-to-day diff. Every number carries its sample size.
4. **Reverse-engineers** the most-cited pages: words before the first direct answer, heading outline, tables, lists, comparison blocks, numeric density, schema.org types, author, dates, word count, links, FAQ, plus LLM-tagged topics, entities, evidence and questions answered; then a coverage matrix showing what all winners share, what no winner covers, and which AI Overview claims no cited page supports.
5. **Writes a brief**: answer lead, must-cover topics and entities with recurrence, required formats, baseline evidence, new-to-cite opportunities, outline, technical checklist, avoid list, with an evidence reference on every item.
6. **Tracks after publish**: whether the customer's URL is cited or brand mentioned, at which match level, its survival over a rolling window, which page sections the citing blocks map to, and first-seen / lost / regained events, with Google model changes shown as platform events rather than losses.

Positioning: the only tool that turns ONE AI Overview into a page you can rank in it. Price the analysis and the brief, not the scrape.

### Not in v1

Agency tier, white-label, client workspaces (v1.1; schema is ready for them). Public API and MCP server (v1.1). Google AI Mode and non-Google engines. Search Console integration (v1.1). LLM-rubric draft scoring (v1 ships the deterministic version). City-level targeting. PDF exports. Annual billing.

---

## 2. The APIs

### Capture: DataForSEO Google Organic SERP API (Advanced)

Why: a single call returns the AI Overview as structured data with citations attached to the sections they support, the cited passage text, the full markdown, tables and expanded sections, and the organic results in the same payload. Device, location and language parameters. Lazy-loaded overviews handled by a flag. Webhook delivery for batches. About $1.20 per 1,000 captures. The runner-up, SerpApi, has slightly finer block-level citation mapping and an official Node SDK but costs 10x more and needs a second call for lazy-loaded overviews. Serper returns no AI Overview. Bright Data and Oxylabs require browser rendering at a higher price. Google offers no API.

Endpoints and parameters:

| Use | Endpoint | Key parameters | Price |
|---|---|---|---|
| Scheduled daily capture | `POST /v3/serp/google/organic/task_post` (Standard queue, about 5 minutes) then `GET /v3/serp/google/organic/task_get/advanced/{id}` or a `postback_url` | `keyword`, `location_code`, `language_code`, `device` (`desktop`/`mobile`), `os`, `depth: 20`, `load_async_ai_overview: true`, `tag` (our idempotency key), `postback_url`, `postback_data: "advanced"`; up to 100 tasks per POST | $0.0006 + $0.0006 for the async overview (refunded when none exists) |
| On-demand confirm when a query is added | `POST /v3/serp/google/organic/live/advanced` | same, synchronous | $0.002 + $0.002 |
| Trigger pre-check and sibling suggestions | `POST /v3/dataforseo_labs/google/related_keywords/live` | `keyword`, `location_code`, `language_code`; filter client-side for `serp_info.serp_item_types` containing `ai_overview` | about $0.01 |
| Locations and timezones | `GET /v3/serp/google/locations` | seed the `location` table | free |

Response shape to normalise (item `type: "ai_overview"`): `asynchronous_ai_overview`, `markdown`, `items[]` of `ai_overview_element { title, text, markdown, links, images, references }`, `ai_overview_expanded_element { title, text, components[] }`, `ai_overview_table_element { table, references }`, `ai_overview_video_element`, and top-level `references[] { source, domain, url, title, text }`. The `text` on each reference is the passage Google used from that page, which feeds the reverse-engineering step directly. Organic results arrive as `type: "organic"` items in the same `items[]`.

```ts
// packages/core/src/providers/dataforseo.ts (shape of the capture call)
const auth = Buffer.from(`${env.DFS_LOGIN}:${env.DFS_PASSWORD}`).toString("base64");
const res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/task_post", {
  method: "POST",
  headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
  body: JSON.stringify(tasks.map(t => ({
    keyword: t.query, location_code: t.locationCode, language_code: t.hl,
    device: t.device, os: t.device === "mobile" ? "android" : "windows",
    depth: 20, load_async_ai_overview: true, priority: 1,
    tag: t.idempotencyKey, postback_url: env.DFS_POSTBACK_URL, postback_data: "advanced",
  }))),
});
```

### Analysis: Claude via `@anthropic-ai/sdk`

`client.messages.parse` with `zodOutputFormat` for every structured call; the Message Batches API (50 percent off) for everything scheduled. Default model `claude-opus-5-5` for the coverage matrix and the brief; a cheaper tier for per-render claim extraction and per-page tagging, chosen by alias in `packages/core/src/config/models.ts` so it can be swapped without code changes (the cost model in `docs/unit-economics.md` shows the per-tier numbers). Prompt caching on the shared system prompt.

### Cited pages: Firecrawl

`POST /v2/scrape` with `formats: ["markdown", "rawHtml", "links"]`, `onlyMainContent: true`, `maxAge: 0`; 1 credit per page, JS rendering and anti-bot handling included. Structural features are computed in code from `rawHtml` (Defuddle plus cheerio); the LLM only tags topics, entities, evidence and questions.

### Embeddings: Voyage AI `voyage-4-lite`

1,024 dimensions, $0.02 per million tokens, stored in pgvector for claim clustering and section matching.

---

## 3. Decisions that are settled

1. **Capture is a global pool.** `capture_series` is unique on (normalized_query, gl, hl, location_code, device). Snapshots belong to the series, never to a customer. Tenancy and row-level security apply only to tracked queries, analysis runs, briefs, events and budgets. A `SerpProvider` interface wraps DataForSEO so a second provider can be added later without touching the pool.
2. **Cadence is a tier feature and extraction runs only on unique content.** Starter: 1 render/day desktop. Pro: 3 renders/day on desktop and mobile. Every tier gets 2 renders/day for the first 7 days of a query so the full report gate (at least 5 capture-days and 10 renders) is reachable by day 7. Exact content-hash and a guarded near-duplicate check (embedding cosine at or above 0.98 against the previous render, with the cited-domain set and the capitalised entity strings unchanged) skip the LLM, so extra renders cost scrape money only.
3. **Snapshot model.** Status enum `present_full | present_collapsed | absent | provider_error | timeout`; kind enum `text | list | table | product_grid | video | mixed`; blocks with `reference_indexes`; references with normalised URL, registrable domain, platform class and the cited passage; unknown block types preserved as `unknown` with raw text. Capture day is computed in the series' timezone; a slot is missed after 3 attempts.
4. **Retention.** Raw provider payloads in Cloudflare R2 with a 90-day lifecycle; normalised rows forever; cited-page HTML 14 days; derived features plus at most 5 short quotes per page forever; no overview images stored.
5. **Own-page matching is a standalone tested module** with match levels `exact_url > canonical > path_prefix > subdomain > registrable_domain > brand_entity`; platform domains (youtube, reddit, medium, linkedin, facebook, quora) only match at `exact_url` or `path_prefix`.
6. **Add-query flow.** Normalise (NFKC, trim, collapse whitespace, lowercase, strip trailing punctuation), reject search operators, cap at 200 characters, reject person-name queries with a cheap classifier, run the Labs pre-check for sibling suggestions, confirm with one Live call, then join or create the series. "No AI Overview yet, watching" is a first-class state with zero LLM spend.
7. **Guardrails ship with the app.** Per-org capture and LLM budgets checked before enqueue, a global daily spend ceiling with auto-pause, one idempotency key per (series, capture_day, slot), Turnstile plus a disposable-email blocklist, one free series per verified email, no LLM analysis for free accounts before day 3, 3 cited pages on free.
8. **Stack.** pnpm monorepo. `packages/core` (pure TypeScript) shared by `apps/cli` (ops and fixtures) and `apps/web` (Next.js 16 App Router on Vercel Pro). Neon Postgres with pgvector, Drizzle ORM 0.45.x, Better Auth with the organization and Stripe plugins, Inngest for scheduling, Stripe Billing, Resend plus React Email, PostHog and Sentry, Cloudflare R2. Model IDs live only in `config/models.ts`; a test fails on literal `claude-` strings elsewhere.
9. **Pin versions and avoid same-day releases.** Next.js 16.3.x, TypeScript 6.x, Drizzle 0.45.x. Record the exact versions in `CLAUDE.md` at scaffold time.
10. **Metrics have one definition** (`docs/spec/metrics.md`): survival buckets CORE at or above 80 percent, RECURRING 40 to 80, ROTATING under 40 percent of observable renders; confidence labels low under 10 renders, medium 10 to 20, high at 21 or more.
11. **Outward surfaces expose derived data only** (claims, frequencies, matrices, briefs, short excerpts), never raw overview text or full reference lists. Applies to the v1.1 API and share pages.
12. **Product copy** says "tracks AI Overviews in Google Search" and every route carries the footer: "Google and Google Search are trademarks of Google LLC. Legiit Overviews is not affiliated with or endorsed by Google."

---

## 4. Pricing and tiers (v1)

| Tier | Price | Queries | Cadence | Includes |
|---|---|---|---|---|
| Free | $0 | 1, for 7 days | 1 render/day desktop (2/day in week 1) | Daily diff email, preliminary patterns at day 3, 7-day report, 3 cited pages, blurred brief |
| Playbook | $99 one-off | 1 query, 30 days | Pro cadence | 7-day report, brief, 3 draft scores |
| Starter | $39/month | 10 | 1 render/day desktop (2/day in week 1) | Everything, 10 cited pages, 3 brief regenerations/month, 1 seat |
| Pro | $99/month | 25 | 3 renders/day desktop + mobile | Everything, 25 regenerations/month, day-28 re-brief with a diff, 3 seats, section-level tracking |

Agency ($249/month, slot-based cadence, client workspaces, white-label, 10 seats) is v1.1.

Cost to serve (`docs/unit-economics.md`, re-measured in T2.5): Starter about $0.60 per query-month, Pro about $1.60 at 6 renders/day, a completed free trial under $0.20. Fixed cost at launch about $50 per month (Vercel Pro, DataForSEO prepaid); Inngest Pro ($99) once past 50,000 executions a month.

---

## 5. Architecture

```
apps/cli  (fixtures, evals, ops commands)                apps/web (Next.js 16 App Router on Vercel Pro)
        \                                                 /   UI, Inngest handler, DataForSEO postback webhook,
         \                                               /    Better Auth routes, Stripe webhook
          +-------------- packages/core -----------------+
            providers/   SerpProvider interface, DataForSEO adapter
            intake/      normalise, validate, PII classifier, pre-check
            normalize/   provider payload -> CanonicalSnapshot
            schedule/    slot plans in series timezone, idempotency keys
            analysis/    claim extraction, embeddings, clustering, recurrence
            metrics/     trigger, stability, survival, format, GOA, drift, diff
            fetch/       Firecrawl client, SSRF guard, robots
            pages/       structural features, platform class, page analysis
            brief/       coverage matrix, brief schema, export, draft score
            match/       own-page matcher, section matcher
            llm/         Anthropic client, batch helper, schemas, model aliases
            db/          Drizzle schema, forOrg/withOrg helpers, RLS
            storage/     R2 put/get, lifecycle keys

Managed services: Neon Postgres + pgvector | Inngest | Stripe | Resend | PostHog | Sentry | Cloudflare R2 + Turnstile
Vendors:          DataForSEO | Anthropic | Voyage AI | Firecrawl
```

Data flow: add query, pre-check and confirm, join or create series, hourly scheduler enqueues due local slots with an idempotency key, DataForSEO task batch (100 per POST) with postback, postback stores raw JSON in R2 and emits one event, normalise into snapshot rows, content-hash and near-duplicate gate, hourly batch assembler sends unique snapshots to Claude in one Message Batch, clusters and metrics recomputed in SQL, daily diff email, readiness gate (preliminary at 3 capture-days, full at 5 capture-days and 10 renders), cited-page fetch and features, coverage matrix, brief, publish flow, matcher and section matcher on every new render, win and loss events.

Specs: `docs/spec/data-model.md`, `docs/spec/pipeline.md`, `docs/spec/metrics.md`, `docs/spec/brief-schema.md`, `docs/spec/own-page-matcher.md`.

---

## 6. Milestones and tasks

Each task is sized for one Claude Code session and names the files to create, the behaviour, and the acceptance test. Milestones end with technical exit criteria, not sales targets. Calendar estimate: 7 to 8 weeks.

### Milestone 1: capture engine (weeks 1 to 2)

Goal: `packages/core` captures AI Overviews from DataForSEO into the pool schema on a schedule, normalised and tested against real fixtures.

Exit: 50 queries capture on schedule for 3 consecutive days with at most 5 percent missed slots; golden tests cover every status and kind variant seen; the metrics report runs on the pool.

- **T1.1 Monorepo scaffold.** Files: `pnpm-workspace.yaml`, `packages/core`, `apps/cli`, `CLAUDE.md` (exact installed versions, one-word scripts), `.claude/rules/{core,db,jobs,ui}.md` with `paths:` frontmatter, `packages/core/src/env.ts` (zod), `packages/core/src/config/models.ts` (aliases from env), Vitest, Biome, `.github/workflows/ci.yml`. Accept: `pnpm typecheck && pnpm lint && pnpm test` green on an empty commit; `pnpm cli --help` lists `capture`, `fixtures`, `report`, `patterns`, `playbook`, `eval`; a test fails on any literal `claude-` model ID outside `config/models.ts`.
- **T1.2 DataForSEO adapter.** Files: `packages/core/src/providers/{types,dataforseo,http}.ts`. Behaviour: `SerpProvider { submit(series, slot) -> { taskId, costUsd }; fetch(taskId) -> RawResult; live(series) -> RawResult; precheck(query, locale) -> Siblings; name }`; `task_post` with the parameters in section 2, up to 100 tasks per POST; `task_get` advanced; Live Advanced; Labs `related_keywords`; the HTTP client refuses any google.com host. Accept: recorded-request tests assert every parameter and the `tag`; a test fails if a request host matches google.com; `RUN_LIVE=1` smoke test stores one Live result under `tests/fixtures/aio/live/`; cost accounting yields $0.0012 per Standard capture and $0.004 per Live call.
- **T1.3 Normaliser and fixture corpus.** Files: `packages/core/src/normalize/{canonical,dataforseo,hash,platform-class}.ts`, `apps/cli/src/commands/fixtures.ts`, `tests/fixtures/aio/<variant>/*.json`, `docs/fixtures.md`. Behaviour: payload to `CanonicalSnapshot { status, aio_kind, markdown, blocks[{position, type, text, reference_indexes, expanded}], references[{idx, url, url_normalized, registrable_domain, platform_class, title, passage, source}], organic_top20, content_hash }`; images dropped; unknown block types preserved; 30 buying-intent queries captured via Live Advanced into fixture folders by variant. Accept: golden tests for every variant folder (text, list, table, expanded, video, absent, async-null, provider_error); a status-mapping matrix test; `docs/fixtures.md` records which variants were observed and whether the JSON contains post-"Show more" text.
- **T1.4 Query intake.** Files: `packages/core/src/intake/{normalize,validate,pii-classifier,precheck}.ts`. Behaviour per decision 6; the classifier uses the extraction alias with `zodOutputFormat({ is_person_query, reason })` behind an interface with a cache. Accept: a 40-case table test (unicode forms, `Best CRM?` to `best crm`, operators rejected with codes, 201 characters rejected); classifier test against a recorded SDK mock; pre-check test filters siblings by `serp_item_types`.
- **T1.5 Pool schema and storage.** Files: `packages/core/src/db/schema.ts` (pool tables from `docs/spec/data-model.md`: `location`, `capture_series`, `capture_attempt`, `snapshot`, `aio_block`, `aio_reference`, `organic_result`, `snapshot_format`), `db/client.ts` (Neon serverless driver), `storage/r2.ts`, `drizzle/` migrations, `apps/cli/src/commands/seed-locations.ts`. Accept: `drizzle-kit check` passes in CI; inserting a duplicate series violates the unique index; an attempt to store an image body throws; locations seed with timezones.
- **T1.6 Scheduler, postback, sweeper.** Files: `packages/core/src/schedule/slots.ts`, `apps/cli/src/commands/capture.ts` (local runner for development), `apps/web/src/inngest/functions/{schedule-slots,normalize-snapshot,sweep-attempts}.ts`, `apps/web/app/api/webhooks/dataforseo/route.ts`. Behaviour: hourly cron with 15-minute jitter plans due slots from `cadence_max`, the week-one double render and the series timezone; inserts `capture_attempt` with the idempotency key; submits 100 tasks per POST with `postback_url` and a secret; the postback stores raw JSON in R2 and emits one event; normalise writes the rows with content hash and near-duplicate mark; the sweeper polls `task_get` for attempts without a postback after 20 minutes and marks a slot missed after 3 attempts. Accept: planner tests across the 2026-11-01 DST changes in America/New_York, Europe/London and Australia/Sydney; re-running the same hour submits zero tasks; replaying every fixture through the postback route matches the golden snapshots; 3 simulated failures mark `missed`; Inngest executions per successful capture measured on the dev-server trace and recorded.
- **T1.7 Metrics module and report.** Files: `packages/core/src/metrics/{trigger,stability,survival,format,goa,drift,diff}.ts`, `apps/cli/src/commands/report.ts`. Behaviour per `docs/spec/metrics.md`. Accept: synthetic tests with hand-computed Jaccard and survival answers; property tests (identical renders give Jaccard 1 and drift 1, disjoint give 0); the report prints a per-query table over the pool in under 5 seconds.

### Milestone 2: analysis engine (week 3)

Goal: steps 3 and 4 run end to end on the pool: claims, clusters, recurrence, cited-page profiles and the coverage matrix.

Exit: a 7-day report and a coverage matrix generate for every captured query from the pool; clustering eval F1 at or above 0.85; per-render cost measured.

- **T2.1 Claim extraction and clustering.** Files: `packages/core/src/llm/{client,batch,schemas}.ts`, `prompts/claim-extraction.ts`, `analysis/{segment,embed,cluster,entities,recurrence}.ts`, `analysis/thresholds.ts` (generated), `apps/cli/src/commands/{patterns,eval}.ts`, `tests/evals/claim-pairs.jsonl` (200 labelled pairs from fixture data). Behaviour per `docs/spec/pipeline.md` step 3. Accept: every zod schema passes a structured-output constraints test (no recursion, `additionalProperties: false`, `minItems` at most 1, at most 24 optional fields); batch round-trip with mocked results keyed by `custom_id`; F1 at or above 0.85 with thresholds committed with the eval run id; an identical render makes zero LLM calls; a swapped-entity near-duplicate forces extraction; `Tally` and `Tally Forms` resolve to one entity.
- **T2.2 Extraction and metrics jobs.** Files: `apps/web/src/inngest/functions/{extract-claims,cluster-and-metrics,analysis-gate}.ts`. Behaviour: hourly batch assembler, one Message Batch per hour with `custom_id = claim:<snapshot_id>:<schema_version>`, idempotent write-back; metrics and diffs recomputed per capture day; gate creates `preliminary` at 3 capture-days and `seven_day` at 5 capture-days and 10 renders. Accept: mocked batch populates claims for 7 fixture days; partial failures, expired requests and out-of-order results handled; re-running a night creates no duplicate claims; the gate transitions at the right counts.
- **T2.3 Cited-page pipeline.** Files: `packages/core/src/fetch/{firecrawl,ssrf,robots}.ts`, `pages/{features,analysis}.ts`, `prompts/page-analysis.ts`, `apps/web/src/inngest/functions/analyze-sources.ts`. Behaviour: rank cited URLs by renders cited, exclude platform classes (reported separately), take the top 10 (3 on free); Firecrawl scrape cached 7 days across orgs in `cited_page`; SSRF guard on every URL; features in code (Defuddle plus cheerio); one batch call per page for topics, entities, evidence items (excerpts at most 200 characters, at most 5 per page), questions answered, answer sentence index; HTML to R2 for 14 days. Accept: SSRF tests reject metadata, private and loopback targets including via redirect; feature golden tests on 10 saved pages; a second org requesting the same URL within 7 days causes no fetch; a 201-character or sixth quote is rejected.
- **T2.4 Coverage matrix.** Files: `packages/core/src/brief/matrix.ts`, `prompts/coverage-matrix.ts`. Behaviour: one batch call on `MODEL_MATRIX` with the per-page analyses and the series aggregates; output topics by pages and entities by pages (`covered | partial | missing` with excerpts), `common_to_all_winners`, `gaps_no_winner_fills`, `aio_claims_unsupported`. Accept: matrix dimensions equal topics by pages; every cluster id referenced exists; mocked end-to-end on fixtures produces `analysis_run.coverage_matrix`.
- **T2.5 Cost measurement.** Files: `docs/unit-economics.md` regenerated from `scripts/unit_economics.py` with token counts measured by `count_tokens` on 20 real payloads and the measured unique-render rate. Accept: the doc holds measured numbers and the Pro query count is confirmed or adjusted.

### Milestone 3: the app and the seven-day loop (weeks 4 to 5)

Goal: a user signs up, adds a query, watches it fill, reads the daily digest and opens the pattern report.

Exit: the seeded org and 10 real queries render end to end in production; funnel events fire in PostHog; no Sentry error class repeats more than twice.

- **T3.1 apps/web scaffold and full schema.** Files: `apps/web` via `create-next-app` on Next.js 16.3.x, Tailwind, shadcn/ui, `app/api/inngest/route.ts` (`maxDuration = 300`), `app/api/health/route.ts`, Sentry and PostHog wiring; `packages/core/src/db/schema.ts` extended with every org-scoped and system table in `docs/spec/data-model.md`, `db/{forOrg,withOrg}.ts`, `pgPolicy` on every org table, `scripts/seed.ts` (one org, two users, three tracked queries, 7 days of fixture snapshots). Accept: preview deployment green; `/api/health` returns git sha and database status; an RLS test proves cross-org selects return zero rows under `withOrg` while pool tables read without it; `pnpm db:seed` renders the dashboard with no vendor spend; a PreToolUse hook blocks `drizzle-kit push` and `vercel --prod` outside CI.
- **T3.2 Auth, organisations, abuse controls.** Files: `apps/web/src/lib/auth.ts` (Better Auth magic link via Resend, organization plugin creating a personal org on signup, 3 members on Pro), `app/(auth)/*`, `lib/turnstile.ts`, `packages/core/src/intake/disposable-domains.ts`, rate limits. Accept: Playwright signup and login; disposable domain rejected; request without a Turnstile token returns 400; a member of org A gets 404 on org B's queries.
- **T3.3 Add-query flow.** Files: `app/(app)/queries/new/{page,actions}.tsx`, `components/{locale-picker,watching-state}.tsx`. Behaviour: intake, pre-check with siblings, one Live confirm, pool lookup or create, `tracked_query` and `series_subscription` rows; 10 launch countries, `hl`, device per plan; plan limits server-side. Accept: two orgs adding `best crm` en-US desktop share one series and the second sees history; an absent overview yields `watching` with siblings; operators and PII queries show inline errors; the cost ledger receives one Labs and one Live entry per add.
- **T3.4 Query dashboard and patterns report.** Files: `app/(app)/queries/[id]/{page,patterns/page}.tsx`, `components/{progress-meter,aio-render,render-timeline,citations-table,day-diff,confidence-badge,evidence-drawer}.tsx`, `lib/report-gating.ts`. Behaviour: "n of 7 capture-days" meter; latest render as blocks with citation chips; timeline with status badges; citations table with survival bucket and platform class; day-to-day diff; patterns sections (recurring claims, entities recommended versus cited with the self-promotional flag, formats, sources, important differences, stability and drift sparkline, share in organic top 10); every count opens an evidence drawer; gating per decision 10. Accept: seeded org renders in under 1 second of server time; diff matches the metrics module; every percentage shows n; gating tests (2 days locked, 3 preliminary, 5 days and 10 renders full).
- **T3.5 Emails and guardrails.** Files: `packages/email/{daily-digest,report-ready,brief-ready,citation-win,platform-event}.tsx`, `apps/web/src/inngest/functions/{send-daily-digest,cost-rollup}.ts`, `lib/resend.ts`, `packages/core/src/budget/*`. Behaviour: one digest per org per day at 07:00 org-local only when a diff exists; Resend free-tier guard; per-org budgets checked before enqueue; global daily spend ceiling with auto-pause and one founder alert; `usage_ledger` and `cost_rollup` written daily. Accept: snapshot tests of every template; digest skipped when nothing changed; a ceiling test refuses enqueue while paused and sends one alert; ledger totals for a fixture day match to the cent.

### Milestone 4: brief and billing (week 6)

Goal: step 5 ships behind Stripe; free users get a gated preview.

Exit: a paid user receives the brief within 2 hours of the seven-day run; Stripe test-clock flows pass; measured cost per paid query-month within the budget in `docs/unit-economics.md`.

- **T4.1 Brief generation.** Files: `packages/core/src/brief/{schema,generate,export,regenerate}.ts`, `prompts/brief.ts`, `apps/web/src/inngest/functions/generate-brief.ts`. Behaviour: `MODEL_BRIEF` in batch (synchronous on upgrade or Playbook purchase) per `docs/spec/brief-schema.md` with `evidence_refs` on every item; versioning and per-plan regeneration cap; deterministic post-checks (every must-cover topic maps to a cluster at or above 40 percent recurrence, every must-mention entity recurs in at least 2 renders, no 12-word span matches a stored competitor quote); Markdown export with the AI-generated marker. Accept: mocked end-to-end produces brief v1; every `evidence_ref` resolves; regeneration beyond the cap returns a plan error; free accounts never trigger `MODEL_BRIEF`.
- **T4.2 Sources, heatmap, brief and draft-score UI.** Files: `app/(app)/queries/[id]/{sources,brief,draft-score}/page.tsx`, `components/{coverage-heatmap,gated-section}.tsx`, `packages/core/src/brief/draft-score.ts`. Behaviour: per-page profiles; heatmap cells open the evidence excerpt; brief page separating baseline from new-to-cite with outline, checklist and export; deterministic draft score for any URL or pasted text against the CORE pages' medians (`docs/spec/brief-schema.md`); blurred sections on free. Accept: heatmap click opens the excerpt; export downloads a `.md` with the marker; scoring a copy of the top cited page yields a high baseline score and repeated runs are identical; free user sees blurred brief sections.
- **T4.3 Billing and plans.** Files: `lib/auth.ts` Stripe plugin config (`referenceId = organizationId`), `packages/core/src/plans.ts`, `app/(app)/billing/page.tsx`, `apps/web/src/inngest/functions/on-plan-change.ts`. Behaviour: Starter, Pro and the one-off Playbook as Stripe products; limits enforced server-side; plan changes recompute `cadence_max` on every subscribed series; downgrade pauses excess queries; login before checkout. Accept: a Stripe test-clock subscription flips limits within one webhook; a Playbook purchase unlocks one query at Pro cadence for 30 days and triggers the brief synchronously; a fourth Pro invitation is refused; webhook replay is idempotent.

### Milestone 5: publish, track and launch (weeks 7 to 8)

Goal: close step 6 and launch.

Exit: a published URL is detected as cited in a fixture and in production; the marketing site, pricing and legal pages are live; launch email sent.

- **T5.1 Own-page matcher module.** Files: `packages/core/src/match/{url-normalize,unwrap,resolve,levels}.ts`. Behaviour per `docs/spec/own-page-matcher.md`. Accept: the 60-case table test in the spec, resolver mocked.
- **T5.2 Publish and track flow.** Files: `app/(app)/queries/[id]/{publish,track}/page.tsx`, `apps/web/src/inngest/functions/{index-own-page,detect-wins,canary-daily}.ts`, `packages/core/src/match/section-match.ts`. Behaviour: publish form takes own URL, brand terms and published date and runs the deterministic draft score on the live page; the page is fetched, split by headings and embedded into `page_section` with a weekly refresh; every new snapshot runs the matcher over references and brand terms over text, maps citing blocks to the best section at cosine at or above 0.8, writes `citation_event` rows; `lost` needs the URL absent on 2 consecutive capture-days with at least 4 renders in the span; a 100-query canary set owned by the product computes daily presence rate, sources per render and global citation Jaccard, opens a `model_regime` row on a move over 2 sigma, suppresses loss emails during it and shows a platform-event banner. Accept: a fixture snapshot with the own URL creates `first_seen` and one email; one absent render creates no `lost`, two absent capture-days with 4 renders do; no loss email during a regime window; section mapping assigns the citing block to the correct H2; a synthetic 42 percent domain-replacement step opens a regime row.
- **T5.3 Marketing, legal pages and launch.** Files: `app/(marketing)/{page,pricing,terms,privacy,acceptable-use,bot}/page.tsx`, `components/{footer,platform-event-banner}.tsx`, `lib/analytics.ts`, `docs/launch/{email,build-in-public}.md`. Behaviour: landing page and pricing; terms (rights warranty, no redistribution of raw data, AI-draft disclosure, acceptable use), privacy policy, the `/bot` page; trademark footer on every route; funnel events `query_confirmed`, `five_of_seven`, `report_opened`, `brief_generated`, `published_marked`, `citation_won`; a build-in-public series replaying one named query from our own data. Accept: a crawl test finds the footer on every route; the funnel is visible in PostHog; Lighthouse accessibility at or above 90; launch email sent to the Legiit list.

### v1.1 backlog

Agency tier with slot accounting, client workspaces, pitch mode, white-label report pages. Work orders with pasted Legiit order references and deep links into the GEO category with a derived-only brief pack. API keys and an MCP server on paid plans (derived data only, with contract tests). Claim-to-passage matching to make "unsupported claims" first-class. LLM-rubric draft scoring. Search Console Generative AI report ingestion (impressions only; report exists since 2026-08-31 worldwide, API exposure to verify). SerpApi as a second provider behind `SerpProvider` if a fallback is ever wanted. Google AI Mode as a separate series kind. City-level locales on Pro.

---

## 7. Risks and what the plan does about them

- **AI Overviews are stochastic.** A 70 percent chance of change between observations and 45 percent citation churn make single renders noisy. Mitigation: week-one double renders, Pro's 3 renders per day, survival buckets, sample sizes on everything, the two-capture-day loss rule, and the canary set to separate Google model changes from customer losses.
- **Extraction, not scraping, is the cost driver.** Mitigation: hash and near-duplicate short-circuits, a cheap tier for extraction by alias, batch pricing, per-org budgets, costs re-measured in T2.5 before the Pro query count is locked.
- **Signed-out capture under-counts e-commerce overviews.** Mitigation: the pre-check with sibling suggestions, the "watching" state, conservative onboarding copy.
- **Google changes the overview layout** (four times in 2025 and 2026). Mitigation: fixture corpus, unknown block types preserved, schema failures surfaced, canary alerts; re-fixturing is a one-session task.
- **Model lifecycle.** Haiku 4.5's retirement is not sooner than 2026-10-15; aliases only, thresholds regenerated by the eval runner.
- **Vendor and legal exposure.** Google is litigating SERP scrapers; see `docs/legal-risk.md`. The product never requests google.com, keeps the provider behind an interface, and exposes derived data only. Not a build blocker.

---

## 8. Open decisions for the founder

1. Confirm the name and domain.
2. Confirm the 10 launch countries (proposed: US, UK, CA, AU, DE, FR, ES, IT, NL, IN) with one timezone per country.
3. Approve the pricing table once T2.5 re-measures token counts and unique-render rates; hold Pro at 25 queries only if Pro-cadence unique renders measure at or below 45 percent.

---

## 9. How to execute this plan with Claude Code

1. Start a session in this repo. `CLAUDE.md` points Claude Code at this plan, the specs and the rules.
2. Work one task at a time in order (T1.1, T1.2, ...). Before starting a task, read its spec references. After finishing, run `pnpm typecheck && pnpm lint && pnpm test`, commit with the task id in the message, and tick the task in `docs/progress.md`.
3. Record each milestone's exit numbers in `docs/decisions/`.
4. If the research turns out to be wrong about an API shape or a price, fix the code to reality and note the correction in `docs/decisions/`.
5. Never run `drizzle-kit push` or `vercel --prod` by hand; a hook blocks it. Never hard-code a model ID; a test blocks it. Never request google.com; a test blocks it.
