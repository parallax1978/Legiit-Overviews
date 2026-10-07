# ADR 0002: Drop the pilot gate; DataForSEO is the capture API

Date: 2026-10-07. Status: accepted (founder direction).

## Context

The first version of the plan put a two-week concierge pilot in front of the build (capture 50 queries, sell 10 playbooks by hand through Legiit, gate the SaaS on the results) and made DataForSEO's primary status conditional on a written reply about its terms, with SerpApi's $150/month plan held as a fallback. The founder rejected both: the task is to build the product with the best API, not to run a sales experiment or hedge on litigation.

## Decision

- No pilot gate. Milestone 1 builds the capture engine directly against DataForSEO and captures its fixture corpus from the live API on day one.
- DataForSEO Google Organic SERP API (Advanced) with `load_async_ai_overview: true` is the capture API, unconditionally. Reasons: one call returns the overview as structured sections with their references (including the cited passage text), markdown, tables and expanded content, plus the organic results; device, location and language parameters; webhook delivery; about $1.20 per 1,000 captures. SerpApi is kept only as a v1.1 option behind the existing `SerpProvider` interface.
- Claude (Anthropic SDK, structured outputs, Batch API), Firecrawl and Voyage AI are the analysis, page-fetch and embedding APIs.
- Legal and vendor considerations stay in `docs/legal-risk.md` as a register, not as build blockers.

## Consequences

- Milestones renumber to M1 to M5; `docs/progress.md` is the checklist.
- Fixed cost at launch drops to roughly $50 per month.
- ADR 0001 remains the record of the design-panel decision; where it mentions Milestone 0 or the provider condition, this ADR supersedes it.
