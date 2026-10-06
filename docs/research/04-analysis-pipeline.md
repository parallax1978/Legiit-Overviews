# Engineering the analysis pipeline (steps 3 to 5)

_Research dimension: Engineering of thread steps 3-5: snapshot storage and diffing, LLM pattern extraction and clustering, cited-page fetching and reverse-engineering, cross-source comparison, brief generation and scoring, and Claude LLM operations/costs_

Gathered 2026-10-06. See [README.md](README.md) for method and caveats.

## Summary

Steps 3-5 are cheap and well-served by a TypeScript stack: Postgres + pgvector (Drizzle has a built-in `vector` column type and `cosineDistance`), the Anthropic TS SDK with `client.messages.parse` + `zodOutputFormat` for schema-guaranteed JSON, and the Message Batches API for every non-interactive job at 50% off. As of 2026-10-06 the verified Claude prices are Opus 5.5 $4/$20 per MTok, Sonnet 5.5 $2/$10, Haiku 4.5 $1/$5 (batch: $2/$10, $1/$5, $0.50/$2.50); structured outputs work in batches but citations do not combine with structured outputs, and prompt caching in batches is only best-effort (30-98% hit rates). The daily snapshot should be stored as the provider's native block/reference structure (SerpApi `text_blocks[]` with `type` paragraph/heading/list, `snippet`, `reference_indexes[]`, and `references[]` with `index,title,link,snippet,source`; DataForSEO `ai_overview_element` items with `markdown`, `references`, plus `ai_overview_table_element`) and additionally flattened into sentence-level "claim units" so that counting, diffing and clustering operate on stable atoms. Text diffs are a solved problem: `diff` (jsdiff 9.0.0, Apr 2026, BSD-3, ships types) has `diffSentences`/`diffWords`/`diffJson`; `diff-match-patch` (1.0.5, 2020) and `fast-diff` (1.3.0, 2023) are older but fine for character-level diffs. For claim atomization, follow Microsoft's Claimify pipeline (split -> select verifiable -> disambiguate -> decompose into decontextualized atomic claims), implement it as one Claude structured-output call per snapshot, then dedupe across days with embeddings (voyage-4-lite $0.02/MTok or OpenAI text-embedding-3-small $0.02/MTok, both verified on vendor pages) stored in pgvector and confirmed by a cheap LLM pass for near-threshold pairs. For cited-page fetching, Firecrawl is the simplest API-first choice (1 credit/page markdown, JSON mode +4 credits, `onlyMainContent`, `proxy: auto`, Node package `firecrawl`), with Jina Reader (r.jina.ai, 10M free tokens per key, 500 RPM with a key) and self-hosted Playwright + Defuddle/Readability as cheaper fallbacks; Trafilatura (Python) still tops open-source extraction benchmarks (F1 0.926 on 990 docs, 2026-10-02) if a Python sidecar is acceptable. Structural features (time-to-answer, heading outline, tables, lists, numeric density, schema.org, author/date, word count, links, FAQ) should be computed in code with cheerio + Defuddle (`schemaOrgData`, `author`, `published`, `wordCount`) and metascraper, reserving the LLM for topic/entity/evidence tagging and the coverage matrix. The brief should encode Google's own stance (no special requirements; pages must be indexed and snippet-eligible; "query fan-out" pulls diverse links) plus Jake's "something NEW" requirement as explicit, scoreable fields. Rough unit cost: about $0.02-0.03 of LLM per query per day for extraction, and about $0.60-0.80 (sync) or $0.35-0.45 (batch) for a full 7-day analysis including 10 cited-page analyses and an Opus-generated brief, i.e. well under $5/query/month before capture costs. Note that all Claude 4.7+ models use a tokenizer that yields ~30% more tokens than older models, so size estimates with `count_tokens` (free) on the actual model.

## Fact-check results

Independent skeptics tried to refute the top plan-critical claims. Where a claim was `partially_wrong`, the corrected claim below is authoritative.

### Verdict: `confirmed`

**Original claim.** As of 2026-10-06 the current Claude lineup and first-party prices are: Claude Opus 5.5 (`claude-opus-5-5`) $4 input / $20 output per MTok, Claude Sonnet 5.5 (`claude-sonnet-5-5`) $2 / $10, Claude Haiku 4.5 (`claude-haiku-4-5-20251001`, alias `claude-haiku-4-5`) $1 / $5, Claude Fable 5.1 (`claude-fable-5-1`) $10 / $50. Opus/Sonnet 5.5 and Fable 5.1 have 1M context and 128K max output; Haiku 4.5 has 200K context / 64K output.

**Corrected claim.** As of 2026-10-06 the current Claude lineup and first-party prices are: Claude Opus 5.5 (`claude-opus-5-5`) $4 input / $20 output per MTok, Claude Sonnet 5.5 (`claude-sonnet-5-5`) $2 / $10, Claude Haiku 4.5 (`claude-haiku-4-5-20251001`, alias `claude-haiku-4-5`) $1 / $5, Claude Fable 5.1 (`claude-fable-5-1`) $10 / $50. Opus/Sonnet 5.5 and Fable 5.1 have 1M context and 128K max output; Haiku 4.5 has 200K context / 64K output. Default effort is `medium` on Opus 5.5 and `high` on Sonnet 5.5 (and Fable 5.1); Haiku 4.5 does not support effort and uses manual extended thinking with budget_tokens. Sonnet 5 ($2/$10, now standard pricing) and Opus 5 ($5/$25) remain available as legacy. Haiku 4.5 retirement: "Not sooner than October 15, 2026" (still Active, not yet deprecated; no Haiku successor is listed in the docs as of today). Cache-read rates differ by model: $0.20/MTok on Opus 5.5 and Sonnet 5.5, $0.25/MTok on Fable 5.1, $0.10/MTok on Haiku 4.5.

**Checker notes.** Checked word-by-word against the two cited pages fetched today plus the model-deprecations page and the Haiku 4.5 model page. Every number, model ID, alias, context window, max output, default-effort value, the "start with Claude Opus 5.5 for most workloads" sentence, the Haiku 4.5 "Not sooner than October 15, 2026" retirement line, and the legacy Sonnet 5 ($2/$10) / Opus 5 ($5/$25) prices match the live docs exactly. The deprecations page (most recent notice 2026-09-30, Sonnet 4.5 -> retire Nov 30 2026, replacement claude-sonnet-5-5) lists no Haiku newer than 4.5 and shows claude-haiku-4-5-20251001 as Active with no deprecation date, so the "Haiku successor may land during the build" line is speculation, not something the docs state; the Oct 15 2026 date is only a floor on retirement, not a scheduled event. One minor nuance: the overview page labels Sonnet 5 / Opus 5 "Legacy models (still available)" while the deprecations table lists them as "Active" with retirement not sooner than June 30 / July 24, 2027. The claim omits cache-read pricing, which matters for a per-page extraction pipeline (added to the corrected claim). Caveat: WebSearch was unavailable this turn (per-turn search budget exhausted), so the "newer announcements" check relied on Anthropic's own deprecations/model pages rather than third-party news; the build-impact recommendation (Haiku 4.5 / Sonnet 5.5 for extraction, Opus 5.5 for synthesis) is consistent with the pricing page's own cost-optimization guidance.

Evidence:
- https://platform.claude.com/docs/en/about-claude/pricing
- https://platform.claude.com/docs/en/models/overview
- https://platform.claude.com/docs/en/about-claude/model-deprecations
- https://platform.claude.com/docs/en/models/haiku-4-5/overview

### Verdict: `confirmed`

**Original claim.** The Message Batches API charges 50% of standard prices on both input and output for every active model (Opus 5.5 $2/$10, Sonnet 5.5 $1/$5, Haiku 4.5 $0.50/$2.50 per MTok), supports structured outputs, tools, system prompts and thinking, and most batches finish within 1 hour (hard limit 24 h, results kept 29 days, max 100,000 requests or 256 MB per batch).

**Corrected claim.** The Message Batches API charges 50% of standard prices on both input and output tokens for every model listed in the pricing table (Opus 5.5 $2/$10, Sonnet 5.5 $1/$5, Haiku 4.5 $0.50/$2.50 per MTok; also Fable 5.1 $5/$25, Opus 5/4.x $2.50/$12.50, Sonnet 5 $1/$5). Batches support structured outputs (output_config.format, with the 50% discount), tool use including all server tools, system messages, multi-turn, vision, extended thinking and most beta features; `stream: true`, `speed` (fast mode) and `max_tokens: 0` are rejected. Most batches complete within 1 hour; batches expire if not finished within 24 hours (expired requests are not billed); results are downloadable for 29 days; a batch is limited to 100,000 requests or 256 MB, whichever is hit first. Start-tier batch limits: 1,000 RPM, 200,000 requests in the processing queue, 100,000 per batch. custom_id must match ^[a-zA-Z0-9_-]{1,64}$; poll processing_status until "ended" and key results by custom_id because they arrive in any order.

**Checker notes.** Checked word-for-word against the live docs on 2026-10-06. Batch doc: "All usage is charged at 50% of the standard API prices"; "limited to either 100,000 Message requests or 256 MB in size, whichever is reached first"; "most batches completing within 1 hour ... Batches expire if processing does not complete within 24 hours"; "Batch results are available for 29 days after creation"; unsupported params table lists exactly `stream: true`, `speed`, `max_tokens: 0`; custom_id regex `^[a-zA-Z0-9_-]{1,64}$`; processing_status goes in_progress -> ended. Pricing doc batch table: Opus 5.5 $2/$10, Sonnet 5.5 $1/$5, Haiku 4.5 $0.50/$2.50 (standard $4/$20, $2/$10, $1/$5) - all match. Structured-outputs doc Feature compatibility: "Batch processing: Process structured outputs at scale with 50% discount" - verbatim match. Rate-limits doc Start tier batch row: 1,000 RPM / 200,000 queue / 100,000 per batch - match (Build 2,000/300,000, Scale 4,000/500,000). Caveats worth carrying into the plan: expired requests are not billed; batch processing can slow under demand so more requests may expire; batch discount stacks with prompt caching (use 1-hour cache for shared context); Haiku 4.5 is 200K context while 5.x models are 1M; batch discount does not apply to Managed Agents sessions. Newer-announcement sweep: WebSearch was unavailable this turn (shared per-turn search budget exhausted), but the live doc pages themselves reflect current pricing (e.g. they already record the Sept 2026 Sonnet 5 pricing decision), so no contradicting newer source was found. Tool count: 7 (skill load, 4 WebFetch, 1 WebFetch offset, 2 Bash greps of saved output).

Evidence:
- https://platform.claude.com/docs/en/build-with-claude/batch-processing.md
- https://platform.claude.com/docs/en/about-claude/pricing.md
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md
- https://platform.claude.com/docs/en/api/rate-limits.md

### Verdict: `confirmed`

**Original claim.** Structured outputs are GA via `output_config: { format: { type: 'json_schema', schema } }` (the old `output_format` is deprecated); the TypeScript SDK exposes `client.messages.parse({... output_config: { format: zodOutputFormat(Schema) }})` returning `response.parsed_output`, and `strict: true` on tools guarantees schema-valid tool inputs. Supported on Opus 5.5, Sonnet 5.5, Haiku 4.5 and all other active models.

**Corrected claim.** Structured outputs are GA via `output_config: { format: { type: 'json_schema', schema } }`; the old `output_format` is deprecated (requires the `structured-outputs-2025-11-13` beta header, otherwise 400; Python SDK v1.0+ raises TypeError). The TypeScript SDK exposes `client.messages.parse({... output_config: { format: zodOutputFormat(Schema) }})` returning `response.parsed_output`, and `strict: true` on tools guarantees schema-validated tool names and inputs (except when stop_reason is "refusal" or "max_tokens"). Supported on the models listed in the docs: claude-fable-5-1, claude-mythos-5-1, claude-fable-5, claude-mythos-5, claude-mythos-preview, claude-opus-5-5, claude-opus-5, claude-opus-4-8/4-7/4-6, claude-sonnet-5-5, claude-sonnet-5, claude-sonnet-4-6, claude-sonnet-4-5-20250929, claude-opus-4-5-20251101, claude-haiku-4-5-20251001 (i.e. Opus 5.5, Sonnet 5.5, Haiku 4.5 are all supported; check the explicit list rather than assuming every active model). Limits: no recursive schemas; no `minimum`/`maximum`/`multipleOf`/`minLength`/`maxLength`; `additionalProperties` must be `false`; `minItems` only 0 or 1; enums must be strings/numbers/bools/nulls; no external `$ref`; `allOf` with `$ref` unsupported; max 20 strict tools per request, 24 optional parameters total, 16 union-typed parameters total across all strict schemas; "Schema is too complex for compilation" 400 beyond internal limits; 180 s compile timeout. Required properties are emitted before optional ones. Enum/const capitalization is not guaranteed (compare case-insensitively). Invalid output can still occur with `stop_reason: "refusal"` (200 status, billed) or `"max_tokens"` (retry with higher max_tokens); fields asking for thinking/step-by-step reasoning may trigger a `reasoning_extraction` refusal. Incompatible with Citations (400) and message prefilling. Changing `output_config.format` invalidates the prompt cache; compiled grammars/schemas are cached server-side for 24 h from last use (changing only `name`/`description` does not invalidate).

**Checker notes.** Checked the cited primary source (fetched 2026-10-06) word by word: every field name, SDK method, limit value (20/24/16, 180 s, minItems 0/1, 24 h cache), stop_reason behavior, enum casing caveat, reasoning_extraction note, citations/prefill incompatibility, property ordering, and the deprecation of `output_format` match the page today. Only soft point: the claim's phrase "and all other active models" is looser than the docs, which give an explicit supported-model list (16 models including Opus 5.5, Sonnet 5.5, Haiku 4.5); older models not on that list (e.g. pre-4.5 Haiku/Sonnet) are not claimed as supported. Also "guarantees" should be read with the documented exceptions (refusal / max_tokens). Second-pass web search for newer contradicting announcements could not be run: the per-turn WebSearch budget was already exhausted when this check started, so staleness was assessed only against the live docs page (which is itself the authoritative, currently-published source). The build-impact advice (flat, mostly-required schemas; <24 optional fields; avoid 'reasoning' fields) is consistent with the docs' "Tips for reducing schema complexity" and refusal guidance.

Evidence:
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md

## Findings

### 1. As of 2026-10-06 the current Claude lineup and first-party prices are: Claude Opus 5.5 (`claude-opus-5-5`) $4 input / $20 output per MTok, Claude Sonnet 5.5 (`claude-sonnet-5-5`) $2 / $10, Claude Haiku 4.5 (`claude-haiku-4-5-20251001`, alias `claude-haiku-4-5`) $1 / $5, Claude Fable 5.1 (`claude-fable-5-1`) $10 / $50. Opus/Sonnet 5.5 and Fable 5.1 have 1M context and 128K max output; Haiku 4.5 has 200K context / 64K output.

_Confidence: high_ **[plan-critical]**

Pricing page table (quoted): Opus 5.5 '$4 / MTok ... $20 / MTok'; Sonnet 5.5 '$2 / MTok ... $10 / MTok'; Haiku 4.5 '$1 / MTok ... $5 / MTok'; Fable 5.1 '$10 / MTok ... $50 / MTok'. Models overview: 'If you're unsure which model to use, start with Claude Opus 5.5 for most workloads'; default effort is `medium` on Opus 5.5 and `high` on Sonnet 5.5; Haiku 4.5 does not support effort and uses extended thinking with budget_tokens. Sonnet 5 ($2/$10) and Opus 5 ($5/$25) remain available as legacy. Haiku 4.5 retirement 'Not sooner than October 15, 2026' -- a Haiku successor may land during the build. Build impact: pick Haiku 4.5 or Sonnet 5.5 for per-snapshot and per-page extraction, Opus 5.5 for the synthesis/brief step.

Sources:
- https://platform.claude.com/docs/en/about-claude/pricing.md
- https://platform.claude.com/docs/en/about-claude/models/overview.md

### 2. The Message Batches API charges 50% of standard prices on both input and output for every active model (Opus 5.5 $2/$10, Sonnet 5.5 $1/$5, Haiku 4.5 $0.50/$2.50 per MTok), supports structured outputs, tools, system prompts and thinking, and most batches finish within 1 hour (hard limit 24 h, results kept 29 days, max 100,000 requests or 256 MB per batch).

_Confidence: high_ **[plan-critical]**

Batch doc: 'All usage is charged at 50% of the standard API prices'; 'A Message Batch is limited to either 100,000 Message requests or 256 MB in size'; 'most batches completing within 1 hour ... Batches expire if processing does not complete within 24 hours'; 'Batch results are available for 29 days'. Not supported inside a batch: `stream: true`, `speed` (fast mode), `max_tokens: 0`. Structured-outputs doc 'Feature compatibility -> Works with: Batch processing: Process structured outputs at scale with 50% discount'. Rate limits (Start tier): 1,000 RPM, 200,000 batch requests in queue, 100,000 per batch. TS SDK: `client.messages.batches.create({requests:[{custom_id, params}]})`, poll `processing_status` until `ended`, stream `client.messages.batches.results(id)`; results arrive in any order, key by `custom_id` (regex `^[a-zA-Z0-9_-]{1,64}$`). Build impact: run the nightly extraction and the 7-day analysis as batch jobs; reserve sync calls for the user-triggered 'score my draft' action.

Sources:
- https://platform.claude.com/docs/en/build-with-claude/batch-processing.md
- https://platform.claude.com/docs/en/about-claude/pricing.md
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md
- https://platform.claude.com/docs/en/api/rate-limits.md

### 3. Structured outputs are GA via `output_config: { format: { type: 'json_schema', schema } }` (the old `output_format` is deprecated); the TypeScript SDK exposes `client.messages.parse({... output_config: { format: zodOutputFormat(Schema) }})` returning `response.parsed_output`, and `strict: true` on tools guarantees schema-valid tool inputs. Supported on Opus 5.5, Sonnet 5.5, Haiku 4.5 and all other active models.

_Confidence: high_ **[plan-critical]**

Limits that shape the extraction schemas: no recursive schemas; no `minimum`/`maximum`/`minLength`/`maxLength`; `additionalProperties` must be `false`; `minItems` only 0 or 1; `enum` must be primitive; max 20 strict tools per request, 24 optional parameters total, 16 union-typed parameters total; 'Schema is too complex for compilation' 400 beyond internal limits, 180 s compile timeout. Required properties are emitted before optional ones. Enum casing is not guaranteed ('Compare enum values case-insensitively'). Invalid output can still occur with `stop_reason: "refusal"` or `"max_tokens"` -- check stop_reason and retry with higher max_tokens. Incompatible with Citations (400) and with prefill. Changing `output_config.format` invalidates the prompt cache. The JSON schema is cached server-side for up to 24 h. Build impact: design flat, mostly-required schemas (ClaimExtraction, PageAnalysis, CoverageMatrix, Brief, DraftScore); keep each schema's optional fields under 24; avoid asking for 'reasoning' fields (can trigger `reasoning_extraction` refusal).

Sources:
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md

### 4. Prompt caching multipliers: 5-minute cache write 1.25x base input, 1-hour write 2x, cache read 0.1x (0.05x on Opus 5.5 = $0.20/MTok; 0.025x on Fable 5.1). Minimum cacheable prefix is 512 tokens on Opus 5.5 / Sonnet 5.5 / Fable 5.1 but 4,096 tokens on Haiku 4.5; max 4 explicit breakpoints; caching inside batches is best-effort (30-98% hit rates), so use the 1-hour TTL for batched jobs.

_Confidence: high_ **[plan-critical]**

Pricing page: 'Cache read (hit) 0.1x base input price (0.025x on Claude Fable 5.1 and Claude Mythos 5.1; 0.05x on Claude Opus 5.5)'; 'These multipliers stack with other pricing modifiers, including the Batch API discount'. Caching doc: minimum tokens table -- 512 for Opus 5.5/Sonnet 5.5/Fable 5.1/Opus 5, 4,096 for Haiku 4.5, 1,024 for Sonnet 5/4.6. Batch doc: 'cache hits are provided on a best-effort basis. Users typically experience cache hit rates ranging from 30% to 98%'; tip to use the 1-hour cache duration for batches. Note: the first WebFetch summary of the caching page claimed 'Prompt caching does not work with Batch API' -- that is contradicted by the batch doc itself and the pricing page; treat the batch doc as authoritative. Also: cache-read tokens do not count toward ITPM rate limits. Build impact: put the long, stable extraction system prompt + schema instructions first with `cache_control`; on Haiku the prompt must exceed 4,096 tokens to cache at all, which argues for Sonnet 5.5 (512-token minimum) if caching matters more than the 2x base price.

Sources:
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching.md
- https://platform.claude.com/docs/en/about-claude/pricing.md
- https://platform.claude.com/docs/en/build-with-claude/batch-processing.md
- https://platform.claude.com/docs/en/api/rate-limits.md

### 5. The two main AIO data providers already return a block-level, citation-linked structure that the snapshot schema should mirror: SerpApi `ai_overview` = `text_blocks[]` (each `type` of `paragraph` | `heading` | `list`, with `snippet`, `snippet_highlighted_words[]`, `reference_indexes[]`, nested `list[]` items each with `title`, `snippet`, `reference_indexes`) plus `references[]` (`index`, `title`, `link`, `snippet`, `source`) and an optional `page_token` that expires within ~1 minute and must be redeemed via `engine=google_ai_overview`; DataForSEO returns an `ai_overview` item with top-level `markdown`, `references[]` (`source`, `domain`, `url`, `title`, `text`), and `items[]` of `ai_overview_element` (`text`, `markdown`, `links`, `images`, per-section `references`), plus `ai_overview_table_element`, `ai_overview_video_element`, `ai_overview_expanded_element`, an `asynchronous_ai_overview` flag and `load_async_ai_overview` parameter.

_Confidence: high_ **[plan-critical]**

SerpApi blog: 'text blocks are ordered content blocks to be shown in sequence (paragraphs, headings, lists)'; 'Numbers in reference_indexes map directly to references array positions'. SerpApi AI Overview API page: the page_token 'expires within 1 minute of the search and should be used immediately'. DataForSEO help center: 'Set load_async_ai_overview to true to fetch the asynchronous ones; without it, you'll see ai_overview: null'. Build impact for the data model: tables `aio_snapshot(id, query_id, captured_at, locale, device, provider, raw_json jsonb, markdown text, content_hash)`, `aio_block(snapshot_id, position, type enum[paragraph,heading,list,list_item,table,expandable,video], text, depth, parent_block_id)`, `aio_reference(snapshot_id, index, url, domain, title, snippet, source)`, `aio_block_reference(block_id, reference_id)`, `aio_claim(snapshot_id, block_id, position, text, atomic_text, hash, embedding vector(1024))`, `aio_entity(claim_id, name, canonical_name, type)`. Keep `raw_json` so re-parsing is possible when Google adds block types (tables/videos/expanded sections already exist).

Sources:
- https://serpapi.com/blog/understanding-ai-overview-data-from-serpapi.md
- https://serpapi.com/google-ai-overview-api
- https://dataforseo.com/help-center/parse-google-ai-overviews-ai-mode

### 6. Firecrawl (Node package `firecrawl` 4.44.0, published 2026-10-06, MIT) is the simplest API-first page fetcher: `POST /v2/scrape` returns `data.markdown`, cleaned `data.html`, `data.links` and `data.metadata` (title, description, language, sourceURL, statusCode, ogTitle...) for 1 credit per page; JSON/LLM extraction adds 4 credits; plans are Free 1,000 credits/mo, Hobby $16/mo 5,000, Standard $83/mo 100,000, Growth $333/mo 500,000, Scale $599/mo 1,000,000 (yearly billing prices).

_Confidence: high_ **[plan-critical]**

Scrape API reference: `onlyMainContent` default true; `waitFor` ms; `timeout` default 60000 (1000-300000); `maxAge` default 172800000 ms (2 days cache -- set `maxAge: 0` for fresh fetches); `proxy` enum basic/enhanced/auto, default auto ('Firecrawl will automatically retry scraping with enhanced proxies if the basic proxy fails'); `blockAds` default true; `location {country, languages}`; `mobile`; `actions[]`. Formats: markdown, summary, html, rawHtml, screenshot, links, json, images, branding, product. Pricing page: Standard plan 25 concurrent browsers, 'Scrape/Map/Search: 10 / min (Free) to 10,000 / min (Scale)'. The proxies doc does not state an extra credit cost for enhanced proxies (older third-party sources said stealth = 5 credits; unverified on the current docs). Unit cost: 10 cited pages per query-analysis = 10 credits = about $0.008 on Standard. Build impact: use `formats: ['markdown','html','links']`, `onlyMainContent: true`, `maxAge: 0`, and store both markdown and HTML so structural features can be computed from HTML.

Sources:
- https://www.firecrawl.dev/pricing
- https://docs.firecrawl.dev/features/scrape
- https://docs.firecrawl.dev/api-reference/endpoint/scrape
- https://docs.firecrawl.dev/features/proxies

### 7. Microsoft's Claimify (ACL 2025) defines the right algorithm for 'find the patterns': split into sentences with context, select only verifiable sentences, disambiguate or discard ambiguous ones, then decompose into atomic, decontextualized claims; 99% of extracted claims are entailed by their source sentence.

_Confidence: high_

Microsoft Research: pipeline = '1) Sentence splitting and context creation ... 2) Selection ... 3) Disambiguation ... 4) Decomposition'; a claim must be 'understandable on its own, without additional context'; metrics = entailment ('99% of claims extracted by Claimify are entailed by their source sentence'), coverage, context preservation. Build impact: implement this as ONE structured-output call per snapshot (input: the block list with reference indexes; output per claim: `atomic_text`, `source_block_position`, `reference_indexes`, `claim_type` enum [recommendation, fact, comparison, definition, step, caveat], `entities[]` with `type` enum [product, brand, feature, price, metric, person, org, other], `is_verifiable`), plus snapshot-level `format_labels[]` (e.g. ranked_list, comparison_table, pros_cons, step_list, definition_first) and `answer_lead` (the first direct answer). Then count claim-cluster recurrence across days.

Sources:
- https://www.microsoft.com/en-us/research/?p=1134179

### 8. pgvector supports `vector` columns up to 16,000 dimensions with cosine (`<=>`), L2 (`<->`), inner product (`<#>`) and L1 (`<+>`) operators, HNSW (m=16, ef_construction=64 defaults) and IVFFlat indexes on Postgres 13+; the `pgvector` npm package (0.3.0, May 2026, MIT) covers node-postgres, Drizzle, Prisma, Kysely and others, and Drizzle ORM 0.31.0+ has built-in `vector('embedding', {dimensions: N})` and `cosineDistance()`.

_Confidence: high_

pgvector README: 'By default, pgvector performs exact nearest neighbor search, which provides perfect recall'; HNSW 'm - the max number of connections per layer (16 by default)', 'ef_construction ... (64 by default)'. pgvector-node README Drizzle snippet: `embedding: vector('embedding', {dimensions: 3})` and `db.select().from(items).orderBy(cosineDistance(items.embedding, [..])).limit(5)`. Build impact: per query the claim corpus is tiny (hundreds to a few thousand rows), so exact search without an index is fine; add HNSW only if a global cross-query 'claim library' grows beyond ~100K rows. Cluster rule of thumb: cosine similarity >= 0.90 auto-merge, 0.80-0.90 send pair to Haiku/Sonnet for a yes/no 'same claim?' check, < 0.80 distinct (thresholds need calibration on real AIO data).

Sources:
- https://github.com/pgvector/pgvector
- https://github.com/pgvector/pgvector-node

### 9. Voyage AI embeddings (TS package `voyageai` 0.4.0): voyage-4-lite $0.02/MTok, voyage-4 $0.06/MTok, voyage-4-large $0.12/MTok, each with 200M free tokens, 32,000-token context, default 1024 dims with 256/512/1024/2048 options, `input_type` 'query'|'document', and a 33% Batch API discount; rerank-3-lite $0.02/MTok, rerank-3 $0.05/MTok.

_Confidence: high_

Voyage pricing page quotes: 'voyage-4-lite: $0.02', 'voyage-4: $0.06', 'voyage-4-large: $0.12' per million tokens, 'Batch API offers a 33% discount', 'Free token credits do not apply to Batch API usage'. Embeddings doc: `POST https://api.voyageai.com/v1/embeddings` with `input` (max 1,000 items), `model`, `input_type`, `output_dimension`, `truncation`, `output_dtype`. Unit cost: ~30 claims x ~30 tokens = ~1K tokens/snapshot = $0.00002 on voyage-4-lite; effectively free for years under the 200M free allowance. Build impact: use `voyage-4-lite` at 1024 dims (or 512 to halve storage) for claim and entity dedup; use `input_type: 'document'` for both sides when comparing claim-to-claim.

Sources:
- https://docs.voyageai.com/docs/pricing
- https://docs.voyageai.com/docs/embeddings

### 10. OpenAI embeddings pricing (official pricing page): text-embedding-3-small $0.02 per 1M tokens, text-embedding-3-large $0.13, text-embedding-ada-002 $0.10; no separate batch embedding price is listed on the page.

_Confidence: high_

The OpenAI developers pricing page lists these three embedding models with the quoted prices and 'no output costs'. Third-party pages claim a 50% batch discount ($0.010 / $0.065) but that was not visible on the official page I opened, so treat batch embedding pricing as unverified. Build impact: price-equivalent to voyage-4-lite; choose by ecosystem (OpenAI SDK `openai` 7.28.0) rather than cost.

Sources:
- https://developers.openai.com/api/docs/pricing

### 11. Cohere Embed v4 is priced at $0.12 per 1M text tokens (1,536 dims, 128K context) and embed-v3 legacy at $0.10/MTok according to a third-party tracker verified Sept 2026; Cohere's own pricing page now shows only Model Vault instance pricing (Embed 5 Fast/Pro $3-$5/hour) and trial keys are 'free ... rate limited and not permitted ... for production'; Embed rate limit is 2,000 inputs/min on both trial and production keys.

_Confidence: medium_

cohere.com/pricing (as fetched) did not display per-token Embed prices; docs.cohere.com/docs/rate-limits quotes Embed 'Trial: 2,000 inputs / min, Production: 2,000 inputs / min' and Rerank 'Trial: 10 req / min, Production: 1,000 req / min'. embeddingcost.com/cohere: 'embed-v4 (text): $0.12 ... Verified September 2026'. Build impact: Cohere is 6x the price of voyage-4-lite/text-embedding-3-small for this low-dimensional dedup task and its first-party pricing page is opaque; not recommended.

Sources:
- https://cohere.com/pricing
- https://docs.cohere.com/docs/rate-limits
- https://embeddingcost.com/cohere

### 12. jsdiff (npm `diff`, v9.0.0 published 2026-04-13, BSD-3-Clause, ships TypeScript types) provides `diffSentences`, `diffWords`, `diffWordsWithSpace`, `diffLines`, `diffJson`, `diffArrays`, `structuredPatch`/`createPatch`/`applyPatch`, returning change objects `{value, added, removed, count}` with `ignoreCase`/`ignoreWhitespace` options; `diff-match-patch` is at 1.0.5 (last published 2020-05-20, Apache-2.0, needs @types) and `fast-diff` at 1.3.0 (2023-05-19, Apache-2.0, types included) returning `[op, text]` tuples.

_Confidence: high_

jsdiff README: 'As of version 8, JsDiff ships with type definitions'. npm registry metadata (fetched directly): diff 9.0.0 / 2026-04-13; diff-match-patch 1.0.5 / 2020-05-20; fast-diff 1.3.0 / 2023-05-19. Build impact: use `diffArrays` over the ordered list of claim-cluster IDs for day-to-day structural diffs (added/removed/reordered claims), `diffSentences`/`diffWords` on block text for a human-readable 'what changed' view, and `diffJson` on the normalized block tree; use `fast-diff` only if character-level diffs of very long strings are needed.

Sources:
- https://github.com/kpdecker/jsdiff
- https://registry.npmjs.org/diff
- https://registry.npmjs.org/diff-match-patch
- https://registry.npmjs.org/fast-diff

### 13. `Intl.Segmenter` with `{granularity: 'sentence'}` is Baseline 2024 (available across modern engines since April 2024) and yields `{segment, index, input}` objects that preserve trailing punctuation and handle abbreviations like 'Dr.' and 'Inc.'; Node's official binaries are built with full ICU by default, so it works server-side without extra packages. Older JS sentence splitters (`sbd` 1.0.19, 2021, no types) are stale; `wink-nlp` 2.4.0 (2025) and `compromise` 14.18.0 (2026-10-05) are maintained alternatives with types.

_Confidence: high_

MDN: 'Baseline 2024 - Newly available since April 2024'; granularity options 'grapheme', 'word', 'sentence'. Node intl doc: full-icu 'is the default behavior if no --with-intl flag is passed. The official binaries are also built in this mode.' npm registry: sbd 1.0.19 (2021-05-11), wink-nlp 2.4.0 (2025-06-30), compromise 14.18.0 (2026-10-05). Build impact: pre-segment each AIO block with Intl.Segmenter('en', {granularity:'sentence'}) before the LLM call so claim positions map back to deterministic sentence offsets; let the LLM do the atomic decomposition, not the sentence split.

Sources:
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter
- https://nodejs.org/api/intl.html
- https://registry.npmjs.org/sbd
- https://registry.npmjs.org/wink-nlp
- https://registry.npmjs.org/compromise

### 14. Defuddle (npm `defuddle` 0.19.4, published 2026-09-17, MIT, types included) runs in Node via JSDOM (`import { Defuddle } from 'defuddle/node'`, `await Defuddle(dom.window.document, url, {markdown: true})`) and returns `author`, `content`, `description`, `domain`, `favicon`, `image`, `language`, `metaTags`, `parseTime`, `published`, `site`, `schemaOrgData`, `title`, `wordCount`; Mozilla Readability (`@mozilla/readability` 0.6.0, 2025-03-03, Apache-2.0) returns `title, content, textContent, length, excerpt, byline, dir, siteName, lang, publishedTime` plus `isProbablyReaderable`.

_Confidence: high_

Defuddle README: 'more forgiving, removes fewer uncertain elements', 'provides a consistent output for footnotes, math, code blocks', 'extracts more metadata from the page, including schema.org data'. Readability options: `charThreshold` (default 500), `keepClasses`, `serializer`. Build impact: use Defuddle as the primary in-process extractor (gives schema.org JSON-LD, author, publish date and word count for free), Readability as a fallback when Defuddle returns < 200 words; run both over Firecrawl's `rawHtml` or Playwright's `page.content()` so you are not dependent on a vendor's markdown cleaning. `web-auto-extractor` (last published 2017) should not be used for schema.org; parse `script[type="application/ld+json"]` with cheerio (1.2.0) if Defuddle's `schemaOrgData` is insufficient.

Sources:
- https://github.com/kepano/defuddle
- https://github.com/mozilla/readability
- https://registry.npmjs.org/defuddle
- https://registry.npmjs.org/@mozilla/readability
- https://registry.npmjs.org/web-auto-extractor
- https://registry.npmjs.org/cheerio

### 15. Jina Reader (prefix `https://r.jina.ai/<url>`) renders pages in a headless browser by default (`X-Engine: direct` for a plain HTTP fetch), gives every new API key 10M free tokens, allows 20 RPM with no key and 500 RPM with a free or paid key (5,000 RPM premium; TPM 100K free / 2M paid / 50M premium), bills by output tokens, and explicitly 'does not actively circumvent or bypass any website defense mechanisms'. The dollar rate (third-party sources say $0.02 per 1M output tokens) could not be confirmed on jina.ai pages.

_Confidence: medium_

jina.ai/reader quotes: 'Every new API key comes with 10M free tokens!'; 'API pricing is based on the token usage'; rate table 'Without API Key: 20 RPM; With Free API Key: 500 RPM; With Paid API Key: 500 RPM; With Premium API Key: 5000 RPM'; headers `X-Engine`, `X-Timeout`, `X-Target-Selector`, `X-Remove-Selector`, `X-With-Generated-Alt`, `X-Respond-With`, `X-Proxy`, `X-No-Cache`. Build impact: a good zero-cost fallback/second opinion for markdown extraction (a 3,000-token page costs ~$0.00006 if the $0.02/M figure holds), but not for anti-bot sites; do not depend on it for HTML structure (use the html return format or your own fetch for that).

Sources:
- https://jina.ai/reader/
- https://agentscamp.com/guides/advanced/jina-reader-api

### 16. ScrapingBee credit model: 1 credit without JS, 5 credits with `render_js=true` (the default), 10 credits premium proxy without JS, 25 with JS, 75 for stealth proxy (JS only); `mode=auto` escalates and charges only for the configuration that worked (0 if all fail); `return_page_markdown` / `return_page_text` return main content as markdown/text; `ai_query`/`ai_extract_rules` add 5 credits. Plans: Freelance $49/mo 250,000 credits / 50 concurrent, Startup $99/mo 1,000,000 / 100, Business $249/mo 3,000,000 / 200, Business+ $599/mo 8,000,000 / 400.

_Confidence: high_

Documentation quotes: JS rendering 'costs 5 credits per request'; premium proxy '25 API credits with Javascript enabled' or '10 credits'; stealth '75 credits'; auto mode 'costing 1, 5, 10, 25 or 75 credits depending on the configuration that worked'; max timeout '140 000' ms. Effective cost per JS-rendered page on Startup: $99 / 200,000 pages = ~$0.0005. Build impact: viable alternative to Firecrawl when stealth/anti-bot matters; it returns markdown too, but lacks Firecrawl's structured `links`/metadata conveniences and SDK ergonomics.

Sources:
- https://www.scrapingbee.com/documentation/
- https://www.scrapingbee.com/pricing/

### 17. Browserless pricing: Free 1,000 units/mo (2 concurrent, 2-min sessions), Prototyping $25/mo 20,000 units (15 concurrent, 15 min, $0.0020/unit overage), Starter $140/mo 180,000 units (40 concurrent, 30 min, $0.0017/unit), Scale $350/mo 500,000 units (100 concurrent, 60 min, $0.0015/unit); a unit is 'a block of browser time of up to 30 seconds per browser connection'; residential proxy 6 units/MB, datacenter 2 units/MB, captcha solve 10 units; all plans include BrowserQL and automatic captcha solving; prices shown are annual billing.

_Confidence: high_

Quoted from browserless.io/pricing. Build impact: a hosted Chrome you drive with Playwright (connect over CDP) when you want full control of DOM extraction without running browsers yourself; ~1 unit per cited-page fetch if under 30 s, so 10 pages/query-analysis = 10 units (~$0.0125-0.02).

Sources:
- https://www.browserless.io/pricing

### 18. Self-hosted Playwright (npm `playwright` 1.63.0, 2026-09-04, Apache-2.0) is installed with `npm i -D playwright` + `npx playwright install chromium`, launches headless by default, and `page.content()` returns the rendered HTML; cost is only your compute, but you own anti-bot handling, proxies and browser upkeep.

_Confidence: high_

playwright.dev/docs/library: 'const browser = await chromium.launch(); const page = await browser.newPage(); await page.goto(url); const content = await page.content();'; 'Browsers must be installed separately via npx playwright install'. Build impact: best as a fallback path (e.g. when Firecrawl returns < 200 words or non-200) and for computing 'time-to-answer' on the rendered DOM; run it in a separate worker container with its own queue.

Sources:
- https://playwright.dev/docs/library
- https://registry.npmjs.org/playwright

### 19. Crawl4AI is a Python, open-source ('Always open source, forever') LLM-oriented crawler built on Playwright that outputs markdown, `fit_markdown`, cleaned HTML, tables and structured extractions, offers a self-hostable Docker server plus a pay-as-you-go cloud API (`/scrape`, `/search`, `/extract`, `/scrape/batch`), and includes stealth/undetected-browser modes; Trafilatura (Python, Apache-2.0) is the strongest open-source main-text extractor on its own 2026-10-02 benchmark (990 docs): trafilatura 2.3.0 F1 0.926 vs readability-lxml 0.853, news-please 0.836, goose3 0.810, newspaper4k 0.803, boilerpy3 0.807, justext 0.862.

_Confidence: medium_

Crawl4AI docs home quotes; the detailed Docker-deployment page returned 404 at the two paths tried, so the exact self-hosted endpoint list is unverified. Trafilatura evaluation page table (precision/recall/accuracy/F): trafilatura 0.906/0.946/0.924/0.926; readability-lxml 0.892/0.817/0.859/0.853. Trafilatura extracts 'title, author, date, site name, categories and tags' and outputs TXT/Markdown/CSV/JSON/XML; it does no JS rendering. Build impact: for a TypeScript-first founder these are optional Python sidecars; only worth it if Defuddle/Readability quality proves insufficient on real cited pages.

Sources:
- https://docs.crawl4ai.com/
- https://trafilatura.readthedocs.io/en/latest/evaluation.html
- https://trafilatura.readthedocs.io/en/latest/

### 20. Google's official AI-features guidance: 'There are no additional requirements to appear in AI Overviews or AI Mode, nor other special optimizations necessary'; a page must be 'indexed and eligible to be shown in Google Search with a snippet'; `nosnippet`, `data-nosnippet`, `max-snippet` and `noindex` limit what can be shown; and AI Overviews/AI Mode 'may use a query fan-out technique - issuing multiple related searches across subtopics and data sources'.

_Confidence: high_

developers.google.com/search/docs/appearance/ai-features (fetched 2026-10-06). Build impact for the brief generator and the draft scorer: (1) add a technical-eligibility checklist (indexable, no nosnippet/max-snippet restrictions, text available in HTML, accurate structured data); (2) because of query fan-out, the brief should list sub-questions/subtopics the AIO consistently answers (derived from claim clusters) and require the draft to answer each one directly; (3) do not promise ranking -- Google states there is no special optimization.

Sources:
- https://developers.google.com/search/docs/appearance/ai-features

### 21. Mentions.so (the paid tracker Jake names) sells prompt tracking at Starter $49/mo (25 prompts, 1 site, 3 LLMs), Pro $99/mo (50 prompts, 5 sites, all LLMs), Business $199/mo (100 prompts, 10 sites), Agency $399/mo (300 prompts, unlimited sites), 'Updated daily', tracking ChatGPT, Perplexity, Claude, Grok, Gemini, DeepSeek, AI Overview and Llama; no API is advertised.

_Confidence: high_

Quoted from mentions.so homepage pricing section. Build impact: sets the price anchor (~$1-2 per tracked prompt per month) and shows the gap this product fills -- Mentions tracks presence, it does not do steps 3-5 (claim-level pattern mining, cited-page reverse engineering, brief generation, draft scoring).

Sources:
- https://mentions.so/

### 22. All Claude 4.7-and-later models (including Opus 5.5, Sonnet 5.5, Fable 5.1) use a tokenizer that 'produces approximately 30% more tokens for the same text' than Sonnet 4.6 and earlier; the free `POST /v1/messages/count_tokens` endpoint (TS: `client.messages.countTokens({model, system, messages, tools})`) counts under the tokenizer of the model passed, with 5,000 RPM at Start tier, separate from message rate limits.

_Confidence: high_

Pricing page: 'Claude 4.7 and later models ... This tokenizer produces approximately 30% more tokens for the same text.' Token counting doc: 'Token counting is free to use'; 'Recount prompts against the model you plan to use rather than reusing counts measured against earlier models.' Haiku 4.5 uses the older tokenizer. Build impact: all cost estimates below assume the newer tokenizer; use countTokens in the job planner to decide whether a cited page must be truncated (e.g. cap at 12K tokens of markdown per page).

Sources:
- https://platform.claude.com/docs/en/about-claude/pricing.md
- https://platform.claude.com/docs/en/build-with-claude/token-counting.md

### 23. Estimated LLM unit costs (derived from the verified prices above, sync vs batch): per query per day, one claim/entity/format extraction call over an AIO (~3K input incl. cached prompt, ~2.5K JSON output) costs ~$0.016 on Haiku 4.5 or ~$0.031 on Sonnet 5.5 (half that in batch); a full 7-day analysis costs roughly $0.60-0.80 sync or $0.35-0.45 batch: cross-snapshot synthesis (~20K in / 4K out, Sonnet 5.5 ~$0.08), 10 cited-page analyses (~7.5K in / 2K out each, Haiku ~$0.18 or Sonnet ~$0.35), coverage-matrix/gap analysis (~26K in / 5K out, Sonnet ~$0.10), and brief generation on Opus 5.5 (~30K in / 8K out, ~$0.28); embeddings and page fetches add well under $0.02.

_Confidence: medium_

Arithmetic: Haiku extraction = 3,000 x $1/M + 2,500 x $5/M = $0.003 + $0.0125; Sonnet = 3,000 x $2/M + 2,500 x $10/M = $0.006 + $0.025; Opus brief = 30,000 x $4/M + 8,000 x $20/M = $0.12 + $0.16; Sonnet page analysis = 7,500 x $2/M + 2,000 x $10/M = $0.015 + $0.02 per page; coverage matrix on Sonnet = 26,000 x $2/M + 5,000 x $10/M. A draft-scoring call (~15K in / 3K out on Sonnet) is ~$0.06. Monthly per tracked query with daily extraction + weekly re-analysis: ~$0.9 + 4 x ~$0.7 = ~$3.7 sync, ~$2 in batch, before AIO capture/SERP API costs (other dimension). Token sizes are assumptions (AIO ~600-1,500 tokens; cited page markdown truncated to ~6-12K tokens) and should be re-measured with count_tokens on real data.

Sources:
- https://platform.claude.com/docs/en/about-claude/pricing.md
- https://docs.voyageai.com/docs/pricing
- https://www.firecrawl.dev/pricing

### 24. Metadata extraction helpers are current: `metascraper` 5.58.1 (2026-09-17, MIT, types) with `metascraper-author`, `metascraper-date` (ISO 8601 published date) and `metascraper-publisher` plugins that read JSON-LD, meta tags and microdata; `@extractus/article-extractor` 9.0.1 (2026-08-20); `turndown` 7.2.4 (2026-04-03) and `node-html-markdown` 2.0.0 (2025-11-14) for HTML->Markdown; `jsdom` 30.1.2 (2026-10-04) or `linkedom` 0.18.13 for DOM in Node.

_Confidence: high_

npm registry metadata fetched directly on 2026-10-06; metascraper feature description from microlink skill page and tessl registry page. Build impact: Defuddle covers most of this; add metascraper-date/author only as a fallback when Defuddle's `published`/`author` are null, since publish/update dates are an explicit feature Jake asks you to compare across cited pages.

Sources:
- https://registry.npmjs.org/metascraper
- https://microlink.io/skills/metascraper
- https://registry.npmjs.org/@extractus/article-extractor
- https://registry.npmjs.org/turndown
- https://registry.npmjs.org/jsdom

## Recommendations from this dimension

- Data model (Postgres + Drizzle + pgvector): `query(id, text, locale, device, country)`; `aio_snapshot(id, query_id, captured_at, provider, raw_json jsonb, markdown, content_hash, has_aio bool)`; `aio_block(id, snapshot_id, position, type, text, depth, parent_id)`; `aio_reference(id, snapshot_id, idx, url, domain, title, snippet, source)`; `aio_block_reference(block_id, reference_id)`; `claim(id, snapshot_id, block_id, sentence_idx, atomic_text, claim_type, hash, embedding vector(1024))`; `claim_cluster(id, query_id, canonical_text, first_seen, last_seen, days_seen int, total_days int)`; `claim_cluster_member(cluster_id, claim_id)`; `entity(id, query_id, canonical_name, type, embedding)`; `entity_mention(entity_id, claim_id, snapshot_id)`; `snapshot_format(snapshot_id, labels text[], answer_lead text, answer_lead_position int)`; `cited_page(id, url, domain, first_cited, times_cited, html, markdown, fetched_at, extractor, features jsonb, analysis jsonb)`; `analysis_run(id, query_id, window_start, window_end, patterns jsonb, coverage_matrix jsonb, brief jsonb, model_versions jsonb, cost_usd)`; `draft_score(id, analysis_run_id, draft_url_or_text, scores jsonb)`. Keep `raw_json` forever; everything else is re-derivable.
- Daily per-snapshot job (batch, Haiku 4.5 or Sonnet 5.5, structured outputs): 1) normalize provider JSON into blocks/references; 2) `Intl.Segmenter` sentence split per block; 3) one `messages.parse` call with a Zod schema {claims[]: {sentence_ref, atomic_text, claim_type, reference_indexes[], entities[]}, format_labels[], answer_lead, answer_lead_block_position} following the Claimify split->select->disambiguate->decompose recipe; 4) embed `atomic_text` and entity names with voyage-4-lite (1024-d); 5) assign each claim to an existing cluster if cosine >= 0.90, send 0.80-0.90 pairs to a cheap Claude yes/no `same_claim` check, else create a cluster; 6) compute the day-over-day diff with jsdiff `diffArrays` over ordered cluster IDs (added/removed/reordered) and `diffSentences` on block text for the UI; 7) store `content_hash` so identical AIOs short-circuit the LLM call (common: Google caches overviews).
- Pattern metrics to compute in SQL, not with the LLM: cluster recurrence = days_seen/total_days; stability tiers (>=85% 'core', 40-85% 'rotating', <40% 'volatile'); entity frequency and co-occurrence; source frequency by domain and URL (count of snapshots citing it, and which clusters it supports); format frequency (share of days with a table / ranked list / pros-cons); position stability of the answer lead. Feed only these aggregates (not all 7 raw snapshots) into the synthesis call to keep input tokens around 20K.
- Cited-page pipeline: rank URLs by times_cited across the window, take the top 8-10 (plus any URL the user flags), fetch with Firecrawl `scrape` (`formats:['markdown','rawHtml','links']`, `onlyMainContent:true`, `maxAge:0`, `proxy:'auto'`), fall back to Jina Reader then self-hosted Playwright on failure; run Defuddle (then Readability) over rawHtml. Compute structural features in code: time-to-answer = character offset and word index of the first sentence that semantically answers the query (ask the LLM to return the sentence index; compute the offset yourself), heading outline (h1-h4 tree), tables (count, rows x cols, header cells), lists (ordered/unordered, item counts), comparison blocks (tables or lists with >=2 entities), numeric density (numbers per 100 words), schema.org @types from JSON-LD, author, datePublished/dateModified, word count, internal vs external link counts, image count and alt-text ratio, FAQ (FAQPage schema or question-style headings). Then one Sonnet/Haiku structured call per page for topics[], entities[], evidence_items[] (type enum: original_data, test_result, screenshot, quote, pricing, spec), questions_answered[], and a 2-3 sentence approach summary. Truncate page markdown at ~12K tokens via countTokens.
- Cross-source comparison (one Sonnet 5.5 structured call, ~26K in): input = per-page analysis JSON + the AIO cluster/entity/format aggregates; output = a topic coverage matrix (topics x pages, each cell covered/partial/missing with evidence snippet), entity coverage matrix, format matrix, 'common to all winners', 'gaps no winner fills', and 'AIO asks for X but no cited page answers it directly' (the highest-value NEW-content opportunities). Store as jsonb for a heatmap UI.
- Brief schema (Opus 5.5, ~30K in / 8K out, batch when not user-initiated): {target_query, locale, answer_lead: {text_to_say_first, max_words}, must_cover_topics[] (with recurrence %, which clusters/entities they satisfy), must_mention_entities[] (with frequency), required_formats[] (table spec with suggested columns, list spec), evidence_to_include[] (baseline evidence the winners have), new_to_cite[] (each: idea, why Google lacks it, how to produce it: original data / first-hand test / updated stats / comparison nobody has / unanswered question), questions_to_answer[] (from query fan-out sub-questions), outline[] (H2/H3 with purpose and target word counts), technical_checklist[] (indexable, snippet-eligible, no nosnippet, JSON-LD types to add, author/date visible), avoid[] (claims the AIO never includes, bloat). Keep every schema field required where possible to stay under the 24-optional-parameter limit.
- Draft scoring (sync Sonnet 5.5, triggered by the user pasting a URL or text): re-fetch and feature-extract the draft exactly like a cited page, then compute deterministic scores (topic coverage %, entity coverage %, format compliance, time-to-answer vs winners' median, numeric density vs winners, schema/author/date presence) and one LLM rubric call for 'new-to-cite' fulfilment and clarity; output a 0-100 composite plus a prioritized fix list. Because Citations are incompatible with structured outputs, have the model return quoted evidence spans as plain string fields instead.
- Model tiering: Haiku 4.5 (or Sonnet 5.5 if caching matters: Haiku's 4,096-token cache minimum vs 512) for per-snapshot claim extraction and per-page tagging; Sonnet 5.5 for synthesis, coverage matrix and draft scoring; Opus 5.5 at effort 'medium' or 'high' for the brief; everything scheduled goes through the Batch API with the 1-hour cache TTL on the shared system prompt. Budget roughly $0.02-0.03/query/day plus $0.4-0.8 per analysis run; add a `cost_usd` column per run from `usage` to show users real cost.
- Use the Anthropic TS SDK 0.131.0 (`@anthropic-ai/sdk`), `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`, `client.messages.parse` for sync calls, `client.messages.batches.create/retrieve/results` for batch; always check `stop_reason` ('refusal', 'max_tokens') before trusting `parsed_output`, compare enum values case-insensitively, and never put PHI/PII in schema enums. Do not use `output_format` (deprecated) or assistant prefill.
- Queue/orchestration: BullMQ or pg-boss jobs keyed by (query_id, date); idempotent on `content_hash`; a nightly 'batch assembler' collects all snapshots and pages needing LLM work into one Message Batch (<=100,000 requests, <=256 MB), polls, and writes results back by `custom_id` = `${jobType}:${entityId}:${schemaVersion}`. Version every prompt+schema (store `model_versions` on the run) so re-analysis after a prompt change is reproducible.
- Open-source extraction quality check before launch: run Defuddle, Readability and (via a throwaway Python script) Trafilatura over ~50 real cited pages for 10 buying-intent queries and compare word counts and heading retention; adopt a Python sidecar only if Defuddle loses structure on a meaningful share.

## Open questions

- Jina Reader's exact dollar rate per 1M output tokens could not be confirmed on jina.ai (third parties say $0.02/M, 10M free tokens is confirmed); verify in the Jina API dashboard after creating a key.
- Firecrawl's current docs do not state whether `proxy: 'enhanced'` (formerly 'stealth') costs extra credits; older third-party posts said 5 credits per stealth request. Confirm in the Firecrawl dashboard before relying on `auto` mode at volume.
- Which AIO capture provider the other research dimension picks determines the normalizer: SerpApi (text_blocks/references with 1-minute page_token) vs DataForSEO (ai_overview_element items with per-section references, `load_async_ai_overview`); both are block-level, but table and 'expanded' block parsing differs and should be covered by fixture tests.
- Embedding similarity thresholds (0.80/0.90) for claim clustering are assumptions; they need calibration on a few hundred labelled claim pairs from real AI Overviews, and may differ for entity names vs full claims.
- Haiku 4.5's retirement is 'not sooner than October 15, 2026' and a successor may appear; abstract the model ID per job type so the cheap tier can be swapped without code changes.
- Whether cached-prompt savings are worth Sonnet 5.5 over Haiku 4.5 for extraction depends on the final system-prompt length (Haiku needs >= 4,096 tokens to cache at all) and on batch cache hit rates (30-98% best-effort); measure `cache_read_input_tokens` on the first week of real batches.
- Crawl4AI's self-hosted Docker REST endpoints could not be fetched (404 on the docs paths tried); if a Python crawler sidecar is wanted, confirm the current endpoint list from the GitHub repo.
- Legal/ToS posture for storing full HTML of third-party cited pages (vs storing only derived features and short quotes) should be decided before launch; the pipeline above works either way if `html` storage is made optional.
