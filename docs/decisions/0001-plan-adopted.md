# ADR 0001: Adopt the MVP-first design with grafts

Date: 2026-10-06. Status: accepted.

## Context

Three independent proposals were written against the same verified research and constraints: MVP-first (smallest product that ships all six steps and takes money in about eight weeks), analysis-engine-first (deepest engine, evals and compounding cross-customer learning, UI last), and distribution-first via Legiit (agencies and marketplace sellers as primary users, work orders and white-label from day one). Three judges (a skeptical CTO, an agency owner, a growth PM) scored them on feasibility for a solo founder with Claude Code, fidelity to the thread, cost to serve, differentiation and risk.

Totals: MVP-first 38 / 37 / 38; analysis-engine-first 32 / 31 / 32; distribution-first 32 / 31 / 30. MVP-first won unanimously because it is the only plan that puts a paid, self-serve product in front of customers inside the budget with all six steps intact, has the cheapest cost to serve, and has the narrowest legal surface.

## Decision

Build MVP-first as written in `PLAN.md`, with these changes the judges required or recommended:

1. Pin Next.js 16.3.x, TypeScript 6.x and Drizzle 0.45.x; do not pin to a same-day release and do not invent patch versions.
2. Give every tier a second daily render for the first 7 days of a series so the full-report gate (5 capture-days and 10 renders) is reachable by day 7 at scrape cost only.
3. Add the $99 one-off Playbook SKU (from distribution-first) in Milestone 3 billing; it productises the Milestone 0 deliverable and monetises free users who will not subscribe.
4. Reserve `organization.kind`, `external_identity` and a minimal `work_order` with `external_ref` in the schema now so the Agency tier and marketplace fulfilment are additive later.
5. Put `renders_observable` denominators and confidence labels by sample size (from analysis-engine-first) on every number and email; require at least 3 renders of evidence before win or loss emails; suppress loss emails inside a model-regime window and show a platform-event banner instead.
6. Send one daily digest per org, not one email per query.
7. Give Pro 3 seats through the Better Auth organization plugin.
8. Ship the deterministic draft score (feature comparison against the CORE pages' medians) in v1 for both the publish flow and pasted drafts; defer the LLM rubric.
9. Put `evidence_refs` on every brief item and enforce the deterministic post-checks in `docs/spec/brief-schema.md`.
10. Preserve unknown block types in the normaliser and feed schema-validation failures into provider health.
11. Make Firecrawl an enabled fallback for blocked or thin cited pages (not env-flagged) and measure the blocked-page rate in Milestone 0.
12. Measure Inngest executions per capture on the dev-server trace instead of asserting 3; budget 6; keep the Vercel Workflows port as the documented fallback.
13. Correct the research critique on Search Console: the Generative AI performance report exists (UK subset 2026-06-03, worldwide 2026-08-31, impressions only, data from 2026-05-18); integration stays v1.1 because API exposure is unverified and OAuth app verification caps unverified apps at 100 users.

## Consequences

- Calendar estimate is 8 to 10 weeks, not 6; Milestone 0 and the Milestone 2 beta are gated by real capture days.
- Agency features and outward surfaces (API, MCP, share pages) wait for paying customers and counsel.
- The analysis-engine-first proposal's eval harness, claim-to-passage matching and vertical priors are the v1.1 engine roadmap; the distribution-first proposal's work orders, brief packs, pitch mode and slot accounting are the v1.1 commercial roadmap.

## Template for later ADRs

```
# ADR NNNN: <title>
Date: YYYY-MM-DD. Status: proposed | accepted | superseded by NNNN.
## Context
## Decision
## Consequences
```

Milestone exits are recorded as ADRs: `0002-m0-gate.md`, `0003-m1-exit.md`, and so on, each stating the measured numbers against the exit criteria in `PLAN.md`.
