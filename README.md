# Legiit Overviews

Research and execution plan for a SaaS that automates Jake Ward's six-step process for winning a Google AI Overview: pick one buying-intent query, capture the AI Overview every day, find the patterns with AI, reverse-engineer the cited pages, build a better page from a brief, then keep tracking.

Nothing in this repo is product code yet. It is the plan a Claude Code session executes, plus the evidence behind it.

## Start here

| File | What it is |
|---|---|
| `PLAN.md` | The execution plan: product definition, settled decisions, pricing, architecture, milestones with Claude Code-sized tasks and acceptance tests, risks, open decisions |
| `CLAUDE.md` | Instructions Claude Code reads at the start of every session |
| `docs/source-thread.md` | The verbatim X thread the product is modelled on, with the six steps restated as requirements |
| `docs/spec/` | Data model, pipeline, metrics, brief schema, own-page matcher |
| `docs/decisions/` | Architecture decision records; add one when a milestone exits |
| `docs/research/` | Fact-checked research across seven dimensions, plus a completeness critique |
| `docs/unit-economics.md` and `scripts/unit_economics.py` | Cost-to-serve model; re-run after measuring real token counts |
| `docs/progress.md` | Task checklist, updated as tasks complete |

## How the plan was made

On 2026-10-06, seven research agents worked from primary sources (vendor docs, pricing pages, Google documentation, published studies). The top plan-critical claims were handed to independent fact-checkers told to refute them. A completeness critic listed gaps and contradictions. Three product architects then wrote independent proposals (MVP-first, analysis-engine-first, distribution-first) that three judges scored; the MVP-first proposal won unanimously and the best ideas from the others were grafted in. On the founder's direction the pilot-and-sell gate was removed and DataForSEO became the unconditional capture API (ADR 0002). `PLAN.md` is the result.

## Trademark note

Legiit Overviews tracks AI Overviews in Google Search. Google and Google Search are trademarks of Google LLC. This project is not affiliated with or endorsed by Google.
