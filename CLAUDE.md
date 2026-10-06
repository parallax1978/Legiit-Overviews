# CLAUDE.md

This repository holds the plan for Legiit Overviews, a SaaS that automates a six-step process for winning Google AI Overviews. Read `PLAN.md` first. Product code lives under `packages/` and `apps/` once Milestone 0 starts; until then this file governs how the plan is executed.

## What to read before working

- `PLAN.md` sections 1, 2 and 5: product, settled decisions, the task you are on.
- The spec files a task references under `docs/spec/`.
- `docs/research/00-summary.md` for the evidence; the numbered research files only when a task touches that vendor or topic.
- `docs/progress.md` to see which task is next.

## How to execute a task

1. Work on exactly one task (T0.1, T0.2, ...) per session, in order. Do not skip ahead into a later milestone; milestones have exit criteria recorded in `docs/decisions/`.
2. Create the files the task names. Keep `packages/core` free of framework imports; `apps/cli` and `apps/web` import it.
3. Write the acceptance test the task describes before or alongside the code. A task is done when `pnpm typecheck && pnpm lint && pnpm test` pass.
4. Commit with the task id first in the subject line, then tick the task in `docs/progress.md`.
5. If the research or the plan turns out to be wrong about a vendor, an API shape or a price, fix the code to reality, note the correction in `docs/decisions/` with the date, and keep going. Do not silently diverge from the plan.

## Hard rules

- Never request any google.com host from code. Capture goes through `packages/core/src/providers/` only. A test enforces this.
- Never hard-code a Claude model ID. Use the aliases in `packages/core/src/config/models.ts` (`MODEL_EXTRACT`, `MODEL_MATRIX`, `MODEL_BRIEF`). A test greps for literal `claude-` strings.
- Never store AI Overview images, Knowledge Panel media or full third-party page text beyond the 14-day raw cache. At most 5 quotes of 200 characters per cited page are kept.
- Never train, fine-tune or distil anything on AI Overview text.
- Every tenant query goes through `db.forOrg(orgId)` or `withOrg(orgId, tx)`. Capture-pool tables have no organisation column.
- Every Inngest function declares `concurrency` and a throttle where it calls a vendor.
- Never run `drizzle-kit push` or `vercel --prod` by hand. CI does migrations and production deploys.
- Use Claude structured outputs via `client.messages.parse` with `zodOutputFormat`; check `stop_reason` before trusting `parsed_output`. Scheduled LLM work goes through the Message Batches API.
- Pin versions: Next.js 16.3.x, TypeScript 6.x, Drizzle ORM 0.45.x. Record the exact installed versions below when scaffolding. Avoid any package released the same day you install it.

## Commands (once scaffolded)

- `pnpm typecheck` (tsc --noEmit), `pnpm lint` (Biome), `pnpm test` (Vitest), `pnpm test:e2e` (Playwright)
- `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:studio`
- `pnpm jobs:dev` (Inngest dev server), `pnpm pilot <command>` (Milestone 0 CLI)

## Pinned versions

To be filled in by T0.1 with the exact versions installed.

## Conventions

- TypeScript strict; zod-validated `env.ts`; no `any` without a comment.
- Tests live next to code as `*.test.ts`; fixtures under `tests/fixtures/`; evals under `tests/evals/`.
- Prompts and their zod schemas are versioned together under `packages/core/src/prompts/` and the version is stamped on every derived row.
- Prose for users says "AI Overviews in Google Search". The footer on every route carries the trademark line in `PLAN.md` section 2, decision 14.
