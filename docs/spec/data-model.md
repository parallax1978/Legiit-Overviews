# Data model (Postgres, Drizzle ORM 0.45.x, pgvector)

Three groups of tables. The capture pool and the analysis tables are global: they carry no organisation column and no row-level security, because every customer tracking the same query shares the same renders and clusters. Org-scoped tables carry `organization_id` and a `pgPolicy` reading `current_setting('app.org_id', true)`; every access goes through `db.forOrg(orgId)` or `withOrg(orgId, tx)`. System tables are founder-only.

Conventions: `id` is a UUID primary key; timestamps are `timestamptz`; JSON columns are `jsonb`; vectors are `vector(1024)` (voyage-4-lite). Index every column a policy filters on and `(organization_id, created_at)` on every org table.

## Capture pool (global)

**location** — `code int PK` (DataForSEO location_code), `name`, `country_iso char(2)`, `timezone text` (IANA), `kind enum('country','region','city')`. Seeded from DataForSEO's locations endpoint; v1 exposes countries only.

**capture_series** — `id`, `normalized_query text`, `gl char(2)`, `hl text`, `location_code int FK`, `device enum('desktop','mobile')`, `provider enum('dataforseo','serpapi')`, `timezone text`, `cadence_max smallint` (max renders per day any subscriber pays for), `week_one_until date` (double-render window), `is_canary bool default false`, `status enum('active','paused')`, `aio_language text`, `created_at`, `last_present_at`. `UNIQUE (normalized_query, gl, hl, location_code, device, provider)`.

**capture_attempt** — `id`, `series_id FK`, `capture_day date` (in the series timezone), `slot_index smallint`, `attempt_no smallint`, `provider`, `provider_task_id text`, `idempotency_key text UNIQUE` (= `${series_id}:${capture_day}:${slot_index}`), `status enum('pending','submitted','received','missed','failed_over')`, `cost_usd numeric(10,6)`, `submitted_at`, `received_at`.

**snapshot** — `id`, `series_id FK`, `attempt_id FK`, `captured_at`, `capture_day date`, `provider`, `status enum('present_full','present_collapsed','absent','provider_error','blocked','timeout')`, `aio_kind enum('text','list','table','product_grid','video','mixed') null`, `markdown text`, `content_hash text`, `near_dup_of uuid null` (snapshot whose claims were reused), `markdown_embedding vector(1024) null`, `raw_json_key text` (R2), `raw_html_key text null`, `model_regime_id FK null`, `prompt_version text null`, `schema_valid bool`. Index `(series_id, captured_at desc)`.

**aio_block** — `id`, `snapshot_id FK`, `position smallint`, `parent_id uuid null`, `type enum('paragraph','heading','list','list_item','table','expanded','video','unknown')`, `text text`, `expanded bool default false`, `reference_indexes smallint[]`.

**aio_reference** — `id`, `snapshot_id FK`, `idx smallint`, `url text`, `url_normalized text`, `canonical_url text null`, `registrable_domain text`, `platform_class enum('video','forum','social','encyclopedia','review_platform','editorial','vendor','government','other')`, `title text`, `snippet text`, `source text`. Index `(snapshot_id, idx)` and `(url_normalized)`.

**organic_result** — `snapshot_id FK`, `rank smallint`, `url_normalized text`, `registrable_domain text`. Top 20 per render.

**snapshot_format** — `snapshot_id PK FK`, `word_count int`, `list_type enum('none','unordered','ordered','mixed')`, `list_items smallint`, `has_table bool`, `heading_count smallint`, `best_for_labels text[]`, `answer_lead_text text`, `answer_lead_position smallint`.

## Analysis (global per series)

**claim** — `id`, `snapshot_id FK`, `block_id FK`, `sentence_idx smallint`, `atomic_text text`, `claim_type enum('recommendation','fact','comparison','definition','step','caveat')`, `reference_indexes smallint[]`, `from_expanded bool`, `language text`, `embedding vector(1024)`, `cluster_id FK null`, `prompt_version text`.

**claim_cluster** — `id`, `series_id FK`, `canonical_text text`, `medoid_claim_id FK`, `first_seen`, `last_seen`, `renders_seen int`, `renders_observable int`, `expanded_only bool`, `regime_id FK null`. `renders_observable` excludes `present_collapsed` renders when `expanded_only` is true.

**entity** — `id`, `series_id FK`, `canonical_name text`, `type enum('product','brand','feature','price','metric','person','organisation','place','other')`, `aliases text[]`, `kind enum('recommended','cited_domain')`, `self_promotional bool default false`, `embedding vector(1024)`.

**entity_mention** — `entity_id FK`, `claim_id FK`, `snapshot_id FK`, `role enum('recommended','cited','mentioned')`, `label text null` (for example a "best for" qualifier).

**series_metrics_daily** — `series_id FK`, `capture_day date`, `renders smallint`, `present_renders smallint`, `trigger_rate numeric`, `jaccard_url numeric`, `jaccard_domain numeric`, `sources_per_aio numeric`, `drift_cosine numeric`, `goa_top10 numeric`, `goa_top20 numeric`, `format_fingerprint jsonb`, `confidence enum('low','medium','high')`. `PRIMARY KEY (series_id, capture_day)`.

**series_diff** — `series_id FK`, `from_snapshot_id`, `to_snapshot_id`, `claims_added uuid[]`, `claims_dropped uuid[]`, `claims_reordered uuid[]`, `entities_added uuid[]`, `entities_dropped uuid[]`, `citations_added text[]`, `citations_dropped text[]`, `sentence_diff jsonb`.

**cited_page** (shared cache) — `id`, `url_normalized text UNIQUE`, `canonical_url text`, `registrable_domain text`, `platform_class`, `page_type enum('ranked_listicle','comparison','guide','product','forum','video','review_platform','other')`, `fetch_status enum('ok','blocked_robots','blocked_signal','blocked_http','timeout','too_large','error')`, `blocked_reason text null`, `html_key text null` (R2, 14-day lifecycle), `fetched_at`, `features jsonb`, `analysis jsonb`, `quotes jsonb` (at most 5 entries of at most 200 characters, enforced in code and by a check constraint on `jsonb_array_length`), `prompt_version text`.

## Org-scoped (organization_id + RLS)

**user, session, account, verification, organization, member, invitation, subscription** — created by Better Auth and its organization and Stripe plugins. Add `organization.kind enum('brand','agency','seller','internal') default 'brand'` and `organization.timezone text` now; `kind` is unused in v1 but reserved so the Agency tier and marketplace sellers never need a tenancy migration.

**external_identity** — `id`, `organization_id`, `user_id`, `provider enum('legiit','google')`, `external_id text`, `linked_at`. Reserved; empty in v1.

**tracked_query** — `id`, `organization_id`, `series_id FK`, `label text`, `own_domain text null`, `own_url text null`, `brand_terms text[]`, `competitor_domains text[]`, `status enum('watching','confirmed','active','paused')`, `cadence_tier enum('starter','pro','playbook')`, `published_at timestamptz null`, `created_at`. `UNIQUE (organization_id, series_id)`.

**analysis_run** — `id`, `organization_id`, `tracked_query_id FK`, `kind enum('preliminary','seven_day','weekly','post_publish')`, `window_start`, `window_end`, `n_days smallint`, `n_renders smallint`, `metrics jsonb`, `coverage_matrix jsonb null`, `model_versions jsonb`, `cost_usd numeric(10,6)`, `status enum('queued','running','done','failed')`, `created_at`.

**brief** — `id`, `organization_id`, `analysis_run_id FK`, `version smallint`, `content jsonb` (per `brief-schema.md`), `markdown text`, `ai_generated bool default true`, `cost_usd`, `created_at`.

**draft_score** — `id`, `organization_id`, `tracked_query_id FK`, `brief_id FK null`, `source enum('url','text')`, `input_hash text`, `features jsonb`, `scores jsonb`, `composite smallint`, `fixes jsonb`, `created_at`. v1 scores are deterministic only.

**page_section** — `id`, `organization_id`, `tracked_query_id FK`, `heading_path text`, `passage_hash text`, `embedding vector(1024)`, `fetched_at`. No text column.

**citation_event** — `id`, `organization_id`, `tracked_query_id FK`, `snapshot_id FK`, `match_level enum('exact_url','canonical','path_prefix','subdomain','registrable_domain','brand_entity')`, `kind enum('first_seen','lost','regained','brand_mention')`, `section_id FK null`, `n_renders smallint`, `confidence enum('low','medium','high')`, `suppressed_by_regime bool default false`, `created_at`.

**work_order** — `id`, `organization_id`, `tracked_query_id FK`, `brief_id FK`, `status enum('draft','ordered','in_progress','delivered','published','tracking','cancelled')`, `fulfilment_channel enum('self','agency_team','legiit_seller','other')`, `external_ref text null`, `deliverable_url text null`, `created_at`. Reserved; v1 creates one row per published query with `fulfilment_channel = 'self'` so v1.1 is additive.

**org_budget** — `organization_id PK`, `captures_per_day int`, `llm_usd_per_day numeric`, `fetches_per_day int`, `paused_at timestamptz null`.

**usage_ledger** — `organization_id`, `day date`, `captures int`, `llm_usd numeric`, `embed_usd numeric`, `fetches int`. `PRIMARY KEY (organization_id, day)`.

**plan_entitlement** — `organization_id PK`, `plan enum('free','starter','pro','playbook')`, `query_slots smallint`, `renders_per_day_max smallint`, `devices text[]`, `briefs_per_month smallint`, `cited_pages_max smallint`, `seats smallint`, `valid_until timestamptz null` (Playbook).

## System (founder only)

**provider_health** — `provider`, `window_start`, `success_rate numeric`, `latency_p50_ms int`, `schema_failures int`, `presence_vs_canary numeric`, `score numeric`, `is_primary bool`.

**provider_ceiling** — `provider PK`, `usd_per_day numeric`, `paused_at timestamptz null`.

**canary_daily** — `day date PK`, `presence_rate numeric`, `sources_per_aio numeric`, `global_jaccard numeric`, `sigma_flag bool`.

**model_regime** — `id`, `detected_at`, `metrics jsonb`, `ended_at null`. Loss alerts are suppressed while a regime window is open.

**cost_rollup** — `day date PK`, `provider_usd`, `llm_usd`, `embeddings_usd`, `fetch_usd`.

**abuse_signal** — `id`, `email_hash`, `ip_hash`, `fingerprint`, `kind`, `created_at`.

## Object storage (Cloudflare R2)

- `raw/<provider>/<series_id>/<captured_at>.json` and `.html`: lifecycle 90 days.
- `pages/<url_hash>/<fetched_at>.html`: lifecycle 14 days.
- Image bodies are refused at the storage layer.

## Retention summary

| Data | Kept |
|---|---|
| Raw provider payloads | 90 days |
| Normalised snapshot rows, blocks, references, claims, clusters, metrics | Forever |
| Cited-page HTML | 14 days |
| Cited-page features, analysis and at most 5 short quotes | Forever |
| AI Overview images, Knowledge Panel media | Never stored |
| Customer data after account closure | Deleted within 30 days |
