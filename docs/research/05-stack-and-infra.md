# Application stack and infrastructure

_Research dimension: Application stack for a solo founder building the AI Overview tracking SaaS with Claude Code (late 2026)_

Gathered 2026-10-06. See [README.md](README.md) for method and caveats.

## Summary

Recommended stack (all verified against vendor pages on 2026-10-06): Next.js 16.4 App Router on Vercel Pro, Neon Postgres with Drizzle ORM 0.45.x, Better Auth 1.7 (organization + Stripe plugins) for auth and tenancy, Inngest for the daily per-query fan-out, Stripe Billing for payments, Resend for transactional email, PostHog (analytics, feature flags via @flags-sdk/posthog, error tracking) plus Sentry's free Developer tier, and a small Railway worker only if a headless browser becomes necessary. Next.js is the only candidate that is both stable and agent-ready today: 16.4 shipped on 2026-10-06, 16.2 bundles version-matched docs in node_modules/next/dist/docs with an AGENTS.md directive, while TanStack Start is still labelled RC, React Router 8.4 ships RSC as unstable, and SvelteKit 3.0.1 (TypeScript 6+, Vite 8+) was released the same day and is too fresh to build on. Vercel Hobby is explicitly non-commercial, so Pro ($20/mo including $20 usage credit, 800s function max, per-minute cron) is required at launch. Inngest wins the job-runner comparison on flow control (per-tenant concurrency keys, throttle, rate limit, batching, cron with TZ and jitter, 5,000-event fan-out per call) and runs inside the Next.js deploy, but an execution is billed per run plus per step and the Free tier caps at 50k executions and 5 concurrent steps, so expect to move to Pro ($99/mo, 1M executions, 100 concurrency) at roughly 100 customers; Vercel Workflows (GA 2026-04-16, open source, self-hostable, ~$0.02 per 1k events) is the cheaper native alternative if its flow control proves sufficient, and Trigger.dev is the pick if Playwright-style long runs are needed. Both ORMs are mid-major-version: Drizzle 1.0 is at rc.4 while 0.45.3 is stable, and npm's `prisma@latest` already resolves to 8.0.0-rc.20 while `@prisma/client@latest` is 7.10.0 (Prisma 8 GA "expected in October 2026" with a new query API), so pin Drizzle 0.45.x. Better Auth absorbed Auth.js (Sep 2025) and joined Vercel (Jul 2026) while staying open source; its organization plugin supplies the tenant model (organization, member, invitation, team, activeOrganizationId) and its Stripe plugin supports per-organization subscriptions. Lemon Squeezy is being folded into Stripe Managed Payments (which adds 3.5% on top of 2.9%+30¢), so new MoR projects should choose Polar (5%+50¢ Starter, no monthly fee) or Paddle (5%+50¢); plain Stripe (2.9%+30¢ + 0.7% Billing) is cheapest and has the best TypeScript surface. Estimated infra cost excluding LLM/SERP API spend: about $20/mo at 0 customers, $150-200/mo at 100 customers, $400-550/mo at 1,000 customers. Paid boilerplates (Supastarter $299, Makerkit $349) now ship AGENTS.md/MCP for Claude Code and match this stack, but with Claude Code the scaffolding value is modest; start from Vercel's MIT Next.js SaaS Starter structure plus Better Auth plugins unless the founder wants ready-made team/billing UI on day one. The repo should carry a sub-200-line CLAUDE.md importing @AGENTS.md, path-scoped .claude/rules, one-word scripts for typecheck/lint/test/db/jobs, zod-validated env, and a seed with 7 days of fixture AI Overview snapshots so analysis features are testable without API spend.

## Fact-check results

Independent skeptics tried to refute the top plan-critical claims. Where a claim was `partially_wrong`, the corrected claim below is authoritative.

### Verdict: `partially_wrong`

**Original claim.** Next.js 16.4 (stable) was released on 2026-10-06 and is the only framework candidate that is both stable and explicitly agent-ready; TanStack Start is still RC, React Router 8.4 has RSC as unstable, and SvelteKit 3.0.1 was released the same day with TypeScript 6+/Vite 8+ minimums.

**Corrected claim.** Next.js 16.4 (stable) was released on 2026-10-06 (npm `next` latest = 16.4.0) with Cache Components enabled by default in create-next-app, React 19.3, lazy compilation, and experimental "agent feedback". Its agent tooling (AGENTS.md written by create-next-app pointing at node_modules/next/dist/docs/, CLAUDE.md `@AGENTS.md`, browser-to-terminal log forwarding via logging.browserToTerminal, .next/dev/lock PID file, `npx skills add vercel-labs/next-browser`) shipped in 16.2 (Mar 18 2026), where Adapters also went stable; Turbopack-as-default and React Compiler stable landed earlier in Next.js 16 (Oct 21 2025), not 16.2. 16.3 shipped Aug 3 2026. TanStack Start is still labelled "RC" on tanstack.com. React Router 8.4.0 (Sep 15 2026) is stable, ESM-only, Node 22.22+, React 19.2.7+, Vite 7+, middleware always on, but its RSC APIs remain `unstable_`-prefixed. SvelteKit 3.0.0 (Oct 1 2026) / 3.0.1 (Oct 6 2026) is a stable major that requires Node 22.17+, TypeScript 6+, Vite 8 (^8.0.12) and Svelte 5.57+ — so Next.js is not the "only" stable candidate; it is the one with the most explicit first-party agent tooling, and SvelteKit 3 / RR8 RSC are too new to adopt for a production SaaS this quarter. Recommendation to use Next.js App Router stands.

**Checker notes.** Verified against primary sources on 2026-10-06. Confirmed: Next.js 16.4 post dated Oct 6 2026 (lazy compile, React 19.3, Cache Components default in create-next-app); npm next@latest = 16.4.0; 16.3 Aug 3 2026; 16.2 Mar 18 2026; 16 Oct 21 2025; all 16.2 AI-post details (AGENTS.md wording, CLAUDE.md @AGENTS.md, logging.browserToTerminal, .next/dev/lock PID, npx skills add vercel-labs/next-browser) match verbatim; TanStack Start page says "RC"; React Router changelog: v8.4.0 2026-09-15, ESM-only, Node 22.22+, React 19.2.7+, Vite 7+, middleware flag removed, RSC APIs still unstable_. @sveltejs/kit latest 3.0.1 (Node >=22.17, Vite ^8.0.12, TS ^6.0.0, Svelte ^5.57.1); 3.0.0 notes say Svelte 5.56.4+, TS 6 min, Vite 8. Errors in the claim: (1) attributes "Turbopack stable default" and "React Compiler stable" to 16.2 — the blog lists both as Next.js 16 (Oct 2025) features; 16.2 only made Adapters stable. (2) "only framework candidate that is both stable" is overstated: SvelteKit 3.0.x and React Router 8.4 are stable releases; the defensible point is that Next.js is the most explicitly agent-tooled and the others' new majors/RSC are too fresh. Minor: the kit 3.0.1 package pins Svelte ^5.57.1, not 5.56.4. The GitHub fetch rendered release years as 2024, almost certainly a parsing artifact (Vite 8/TS 6 did not exist then); the npm registry date corroborates Oct 2026. TanStack Start npm version/date not independently verified.

Evidence:
- https://nextjs.org/blog
- https://nextjs.org/blog/next-16-2
- https://nextjs.org/blog/next-16-2-ai
- https://registry.npmjs.org/next/latest
- https://tanstack.com/start/latest
- https://reactrouter.com/changelog
- https://github.com/sveltejs/kit/releases
- https://registry.npmjs.org/@sveltejs/kit/latest

### Verdict: `confirmed`

**Original claim.** Inngest is the simplest fit for daily per-query fan-out with retries, per-tenant concurrency, throttling and observability, but its billing counts one execution per function run plus one per step, and the Free tier allows 50k executions/month and 5 concurrent steps; Pro is $99/mo for 1M executions and 100 concurrency.

**Corrected claim.** Inngest is a strong fit for daily per-query fan-out with retries, per-tenant concurrency, throttling and observability (the "simplest" is an opinion, not a checkable fact). Billing counts one execution per function run plus one per step ("A function with 5 step.run() calls uses 6 executions total"). Free: $0, 50k executions/mo, 5 concurrent steps, 24h trace history. Pro: from $99/mo, 1M executions, 100 concurrent steps included then $25 per 25, tiered overage from $0.000050 down to $0.000015 per execution, 7-day traces. Business: from $499/mo, 10M executions, 500 concurrency, 14-day traces. Usage limits: 5,000 events per inngest.send()/step.sendEvent() call, 1,000 steps per run, 4 MiB step output, event size 256 KiB Free / 3 MiB Pro, max run length 30 days Free / 90 days Pro, queue depth 100,000 Free / 1M Pro. Concurrency config is { limit, key, scope: 'fn'|'env'|'account' } with up to 2 constraints per function. Cron triggers: triggers: [cron('0 9 * * *')], TZ=Europe/Paris prefix, jitter: '5m'; docs recommend fan-out via step.sendEvent(events) with a separate event-triggered function per record. Vercel: set checkpointing maxRuntime 20-40% below Vercel maxDuration; with streaming enabled a function can run well beyond maxDuration. Sizing (run + 3 steps = 4 executions): 100 customers x 5 queries x 30 days = 60k/mo (just over Free); 1,000 customers = 600k/mo plus analysis runs, within Pro's 1M. npm inngest latest = 4.21.1, published 2026-10-01.

**Checker notes.** Primary-source check (6 fetches, all today): every number, config field name and quoted FAQ sentence in the claim matches the live pages word for word — plan prices, execution quotas, concurrency (5/100/500), $25 per 25 concurrency add-on, overage range $0.000050-$0.000015, trace retention 24h/7d/14d, 5,000 events per send, 1,000 steps/run, 4 MiB step output, 256 KiB/3 MiB event size, 30/90-day run length, 100k Free queue depth, concurrency {limit,key,scope} with max 2 constraints, cron/TZ/jitter syntax, the step.sendEvent fan-out pattern, and the Vercel 20-40% maxRuntime guidance and streaming caveat. npm registry shows 4.21.1; its publish timestamp (1790898029858 ms) decodes to 2026-10-01 ~23:40 UTC, matching the claim. Arithmetic (60k and 600k executions/mo) checks out. Minor items not independently re-verified: Free tier "no overage, pauses at quota" wording and Business "500 concurrency" on the pricing page (usage-limits page does list 500 concurrent steps for Business). "Simplest fit" is a judgment, not a verifiable fact. Caveat: the turn's WebSearch budget was exhausted, so I could not run the staleness/recent-announcement search (step 2); pricing could change after today, and the pricing page itself qualifies overage rates as "based on current published rates".

Evidence:
- https://www.inngest.com/pricing
- https://www.inngest.com/docs/usage-limits/inngest
- https://www.inngest.com/docs/guides/concurrency
- https://www.inngest.com/docs/guides/scheduled-functions
- https://www.inngest.com/docs/deploy/vercel
- https://registry.npmjs.org/inngest/latest

### Verdict: `confirmed`

**Original claim.** Vercel Hobby is restricted to non-commercial use, so the SaaS must run on Pro ($20/mo platform fee that includes one deploying seat and $20/mo usage credit); Pro functions default to 300s, can be configured to 800s (GA) or 1800s (beta), and cron jobs are limited to 100 per project with per-minute precision on Pro but once-per-day (plus or minus 59 min) on Hobby.

**Corrected claim.** Vercel Hobby is restricted to non-commercial, personal use (docs/plans/hobby, citing the fair-use guidelines; pricing page: "Our Hobby plan is for personal, non-commercial use"), so a SaaS must run on Pro: $20/month platform fee that includes 1 deploying team seat and $20/month usage credit; extra Owner/Member seats $20/month each, Viewer seats free; spend-management notifications default to $200 per billing cycle. Hobby includes 4 CPU-hrs Active CPU, 360 GB-hrs Provisioned Memory, first 1,000,000 function invocations, first 100 GB Fast Data Transfer, 50,000 Workflow events/month and 1 GB Workflow data written. On-demand rates (vercel.com/pricing): Active CPU from $0.128/hr, Provisioned Memory from $0.0106/GB-hr, invocations from $0.60 per 1M, CDN requests 10M/month included then from $2 per 1M, Fast Data Transfer 1 TB/month included then from $0.15/GB. Function limits (docs/functions/limitations, updated 2026-08-24): max duration Hobby 300s default and maximum; Pro/Enterprise 300s default, 800s maximum (GA), 1800s extended maximum (Beta, requires function-level config and specific Node.js/Bun/Python runtime versions; not supported with Secure Compute/Static IPs); memory Hobby 2 GB/1 vCPU, Pro/Enterprise up to 4 GB/2 vCPU; 4.5 MB request/response body; concurrency auto-scales to 30,000 (Hobby/Pro); fluid compute enabled by default for new projects; "For workloads that require unlimited execution time, use Vercel Workflows." Cron jobs (docs/cron-jobs/usage-and-pricing, updated 2026-07-15): 100 cron jobs per project on all plans; Hobby minimum interval once per day with per-hour (±59 min) precision and more-frequent expressions fail at deployment; Pro/Enterprise once per minute with per-minute precision.

**Checker notes.** Word-by-word check against the live pages on 2026-10-06: every figure in the claim (non-commercial Hobby restriction, Hobby included usage, $20 Pro fee / 1 seat / $20 credit, $20 extra seats, free viewers, $200 spend default, on-demand rates, 300/800/1800s durations with 1800s in beta, 2 GB vs 4 GB memory, 4.5 MB body, 30,000 concurrency, fluid compute default, Workflows note, 100 crons/project, Hobby once-per-day ±59 min, Pro per-minute) matches the source text. Two small caveats worth noting in the build plan: (1) the Pro docs page describes "Flat Rate CDN" as including 1 million CDN requests and 1 TB transfer at the lowest tier, whereas vercel.com/pricing says 10M CDN requests included; the claim quotes the pricing page correctly but the two Vercel pages differ. (2) The 1800s extended max has additional constraints (function-level config, specific runtime versions, not available with Secure Compute/Static IPs). The planned `export const maxDuration = 300..800` on the Inngest serve route is consistent with the GA limit. Limitation: the per-turn WebSearch budget was exhausted, so no independent search for post-January-2026 pricing announcements could be run; however, the fetched docs carry last_updated dates of 2026-07-15 through 2026-09-15 and already incorporate the credit-based Pro model, so staleness risk is low.

Evidence:
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/plans/pro-plan
- https://vercel.com/pricing
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/cron-jobs/usage-and-pricing

## Findings

### 1. Next.js 16.4 (stable) was released on 2026-10-06 and is the only framework candidate that is both stable and explicitly agent-ready; TanStack Start is still RC, React Router 8.4 has RSC as unstable, and SvelteKit 3.0.1 was released the same day with TypeScript 6+/Vite 8+ minimums.

_Confidence: high_ **[plan-critical]**

nextjs.org/blog lists Next.js 16.4 (Oct 6 2026: Cache Components on by default in create-next-app, React 19.3, lazy compile), 16.3 (Aug 3 2026), 16.2 (Mar 18 2026: Turbopack stable default, React Compiler stable, Adapters stable) and 16 (Oct 21 2025). npm registry: next latest=16.4.0 (2026-10-06). 16.2's AI post: create-next-app now writes an AGENTS.md whose managed section says 'Before any Next.js work, find and read the relevant doc in node_modules/next/dist/docs/'; CLAUDE.md should contain '@AGENTS.md'; browser errors are forwarded to the terminal by default (logging.browserToTerminal), a .next/dev/lock file prints the PID of an already-running dev server, and `npx skills add vercel-labs/next-browser` gives agents a CLI to inspect component trees/PPR shells. tanstack.com/start/latest labels Start 'RC' (npm @tanstack/react-start latest=1.168.60, 2026-09-30). reactrouter.com/changelog: v8.4.0 (Sep 15 2026), ESM-only, Node 22.22+, React 19.2.7+, Vite 7+, middleware always on, RSC APIs still `unstable_`. @sveltejs/kit latest=3.0.1 published 2026-10-06; 3.0.0 requires TypeScript 6, Node 22.17, Svelte 5.56.4, Vite 8. Build impact: choose Next.js App Router; do not adopt TanStack Start or SvelteKit 3 for a production SaaS this quarter.

Sources:
- https://nextjs.org/blog
- https://nextjs.org/blog/next-16-2
- https://nextjs.org/blog/next-16-2-ai
- https://tanstack.com/start/latest
- https://reactrouter.com/changelog
- https://github.com/sveltejs/kit/releases
- https://registry.npmjs.org/next

### 2. Inngest is the simplest fit for daily per-query fan-out with retries, per-tenant concurrency, throttling and observability, but its billing counts one execution per function run plus one per step, and the Free tier allows 50k executions/month and 5 concurrent steps; Pro is $99/mo for 1M executions and 100 concurrency.

_Confidence: high_ **[plan-critical]**

inngest.com/pricing: Free $0 (50k executions/mo, 5 concurrency, 24h trace history, no overage, pauses at quota); Pro from $99/mo (1M executions, 100 concurrency then $25 per 25, tiered overage $0.000050 down to $0.000015 per execution, 7-day traces); Business from $499/mo (10M, 500 concurrency, 14-day traces). Pricing FAQ: 'An execution is metered per function run and per step inside that run. A function with 5 step.run() calls uses 6 executions total.' Usage limits doc: max 5,000 events per inngest.send()/step.sendEvent() call, 1,000 steps per run, 4 MiB step output, event size 256 KiB Free / 3 MiB Pro, max run length 30 days Free / 90 days Pro, queue depth 100,000 on Free. Flow control (docs/guides/flow-control, docs/guides/concurrency): `concurrency: { limit, key: 'event.data.orgId', scope: 'fn'|'env'|'account' }` with up to 2 constraints per function, plus throttle, rateLimit, debounce, batching, singleton, priority. Scheduled functions: `triggers: [cron('0 9 * * *')]`, `TZ=Europe/Paris 0 9 * * *`, `jitter: '5m'`, documented fan-out pattern via step.sendEvent(array) with a separate event-triggered function per record. Vercel deploy doc: step code executes inside your Vercel function so `maxDuration` applies; Inngest recommends setting checkpointing maxRuntime 20-40% below Vercel maxDuration; with streaming enabled a function can run beyond maxDuration. Worked sizing for this product (1 capture function = run + 3 steps = 4 executions): 100 customers x 5 queries x 30 days = 60k executions/mo (just over Free); 1,000 customers = 600k/mo plus analysis runs, within Pro's 1M. npm inngest latest=4.21.1 (2026-10-01).

Sources:
- https://www.inngest.com/pricing
- https://www.inngest.com/docs/guides/flow-control
- https://www.inngest.com/docs/guides/concurrency
- https://www.inngest.com/docs/guides/scheduled-functions
- https://www.inngest.com/docs/usage-limits/inngest
- https://www.inngest.com/docs/deploy/vercel
- https://registry.npmjs.org/inngest

### 3. Vercel Hobby is restricted to non-commercial use, so the SaaS must run on Pro ($20/mo platform fee that includes one deploying seat and $20/mo usage credit); Pro functions default to 300s, can be configured to 800s (GA) or 1800s (beta), and cron jobs are limited to 100 per project with per-minute precision on Pro but once-per-day (plus or minus 59 min) on Hobby.

_Confidence: high_ **[plan-critical]**

docs/plans/hobby: 'the Hobby plan restricts users to non-commercial, personal use only'; Hobby includes 4 CPU-hrs active CPU, 360 GB-hrs provisioned memory, 1M invocations, 100 GB fast data transfer, 50,000 Workflow events, 1 GB Workflow data written. docs/plans/pro-plan: '$20/month Pro platform fee - 1 deploying team seat included - $20/month in usage credit'; extra Owner/Member seats $20/mo, Viewer seats free; spend-management notification defaults at $200. vercel.com/pricing on-demand rates: Active CPU from $0.128/hr, Provisioned Memory from $0.0106/GB-hr, Invocations from $0.60 per 1M, CDN requests 10M included then $2/1M, Fast Data Transfer 1 TB included then $0.15/GB. docs/functions/limitations (updated 2026-08-24): max duration Hobby 300s; Pro/Enterprise 300s default, 800s maximum, 1800s extended maximum (Beta); memory Hobby 2 GB/1 vCPU, Pro up to 4 GB/2 vCPU; 4.5 MB request/response body; concurrency auto-scales to 30,000; fluid compute enabled by default for new projects; 'For workloads that require unlimited execution time, use Vercel Workflows'. docs/cron-jobs/usage-and-pricing: 100 cron jobs per project on all plans; Hobby 'once per day' with per-hour precision and deploy fails for more frequent expressions; Pro once per minute, per-minute precision. Build impact: budget $20/mo from day one; set `export const maxDuration = 300..800` on the Inngest serve route; a single daily cron can live in vercel.json or in Inngest's cron trigger.

Sources:
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/plans/pro-plan
- https://vercel.com/pricing
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/cron-jobs/usage-and-pricing

### 4. Vercel Workflows is generally available (since 2026-04-16), open source, self-hostable via a Postgres 'World', and is the lowest-cost durable-execution option for this workload (Hobby: 50,000 events/mo included; Pro on-demand $0.02 per 1K events, $0.50/GB written, $0.50/GB-month retained), with no limit on run or sleep duration but each step bounded by Vercel Function limits.

_Confidence: high_ **[plan-critical]**

vercel.com/blog/a-new-programming-model-for-durable-execution (Apr 16 2026): 'Today, Vercel Workflows is generally available'; 'Workflow SDK is open source'; 'We maintain a Postgres reference implementation that real customers run in production'. docs/workflows: `'use workflow'` / `'use step'` directives, start(workflow, [input], { region }), steps run as Vercel Functions, Vercel Queues underneath, multi-region needs workflow >= 5.0.0-beta.33; npm `workflow` latest=5.1.0 (2026-10-06). docs/workflows/pricing (updated 2026-09-16): a normal step produces 3 events (step_created, step_started, step_completed) plus step_retrying per retry; retention after run completion Hobby 1 day, Pro 7 days, Enterprise 30 days; limits: 1,000 run creations/sec, 25,000 events per run, 10,000 steps per run, 50 MB payload, 2 GB entity storage per run, 240s max replay duration, 'Maximum run duration: No limit', 'Maximum sleep duration: No limit', 'Max runtime of individual step: see Vercel Functions limits', schedules/cron 'No limit', rate limit 50k req/min Hobby, 500k Pro. docs/queues (Beta, all plans): @vercel/queue send()/handleCallback(), `experimentalTriggers: [{ type: 'queue/v2beta', topic }]`, durable topics with consumer groups, retries, idempotency keys; queues pricing: ops metered in 4 KiB chunks, Hobby first 1,000,000 operations, TTL 60s-7 days (default 24h), visibility timeout up to 60 min, 'Max concurrency per consumer group: 1 to Unlimited', forced backoff after 32 attempts. workflow-sdk.dev/docs/configuration/worlds: Local (dev), Postgres ('self-hosted durable backend for long-running server processes'), Vercel (auto-detected), custom. Worked cost at 1,000 customers: ~150k capture runs/mo x ~12 events = 1.8M events = ~$36/mo. Gap vs Inngest: no documented per-key concurrency/throttle primitives inside the Workflow SDK itself (only queue-level max concurrency), and 7-day Pro retention; treat as the fallback if Inngest Pro's $99 is unwanted.

Sources:
- https://vercel.com/blog/a-new-programming-model-for-durable-execution
- https://vercel.com/docs/workflows
- https://vercel.com/docs/workflows/pricing
- https://vercel.com/docs/queues
- https://vercel.com/docs/queues/pricing
- https://workflow-sdk.dev/docs/configuration/worlds
- https://registry.npmjs.org/workflow

### 5. Both ORM candidates are mid-major-version on 2026-10-06: Drizzle's stable line is 0.45.3 (1.0 at rc.4), and npm's `prisma@latest` already resolves to 8.0.0-rc.20 while `@prisma/client@latest` is 7.10.0, with Prisma 8 GA 'expected in October 2026' and a new query API; pin Drizzle 0.45.x.

_Confidence: high_ **[plan-critical]**

npm registry: drizzle-orm latest=0.45.3 (2026-09-21), rc=1.0.0-rc.4 (2026-06-27), beta=1.0.0-beta.22; github.com/drizzle-team/drizzle-orm/releases confirms 0.45.3 and v1.0.0-rc.4 ('JIT mappers'). prisma dist-tags: latest=8.0.0-rc.20 (2026-10-05), next=8.0.0-rc.10; @prisma/client latest=7.10.0 (2026-08-25). prisma.io/docs/orm/release-status: 'Prisma ORM 8 is a release candidate: you can install it and build with it today', 'General availability is expected in October 2026', 'some details of the API may still change, so code you write now may need small edits later'; Prisma 7 'keeps receiving bug fixes and security updates for 18 months from the day Prisma ORM 8 reaches general availability'; Prisma 6 security patches until 19 November 2026. Prisma 8 is described (search results on prisma.io) as a new TypeScript-only foundation with a new query API, streaming results and a low-level SQL builder. Drizzle RLS support (orm.drizzle.team/docs/rls): pgPolicy({ as, to, for, using, withCheck }), pgRole, withRLS(), `drizzle-orm/supabase` (authenticatedRole, anonRole, serviceRole, authUid) and `drizzle-orm/neon` (crudPolicy, authenticatedRole, authUid), drizzle.config.ts `entities: { roles: { provider: 'supabase' } }`. Build impact: use Drizzle 0.45.x with exact-pinned versions and schema-as-TypeScript (no codegen step for Claude Code to forget); if Prisma is chosen instead, pin `prisma@7` and `@prisma/client@7` explicitly because a bare `npm i prisma` installs the 8 RC today.

Sources:
- https://registry.npmjs.org/drizzle-orm
- https://github.com/drizzle-team/drizzle-orm/releases
- https://registry.npmjs.org/prisma
- https://registry.npmjs.org/%40prisma%2Fclient
- https://www.prisma.io/docs/orm/release-status
- https://orm.drizzle.team/docs/rls

### 6. Neon Postgres is the lowest-cost database for this product's shape (Free: 100 CU-hours/project, 1 GB/project; Launch: no base fee, $0.106/CU-hour, $0.35/GB-month, scale-to-zero after 5 min can be disabled), while Supabase Pro is $25/mo flat with $10 compute credit (Micro, 1 GB RAM, 8 GB disk then $0.125/GB) and PlanetScale Postgres starts at $5/mo single-node or $15/mo HA with no free tier.

_Confidence: high_ **[plan-critical]**

neon.com/pricing and neon.com/docs/introduction/plans: Free $0, 100 CU-hours/project, 1 GB storage/project (20 GB account), 100 projects, 10 branches/project, autoscale to 2 CU, scale-to-zero after 5 min cannot be disabled; Launch 'Pay for what you use' with no base fee, $0.106/CU-hour, $0.35/GB-month, autoscale to 16 CU, scale-to-zero can be disabled, extra branches $1.50/branch-month; Scale $0.222/CU-hour, 25 branches, SOC2/HIPAA/SLA. supabase.com/pricing: Free $0 (500 MB DB, 50k MAU, 5 GB egress, 500k edge invocations, 'Free projects are paused after 1 week of inactivity'); Pro from $25/mo (8 GB disk included then $0.125/GB, 100k MAU then $0.00325/MAU, 250 GB egress then $0.09/GB, 2M edge invocations then $2/1M); Team $599. supabase.com/docs/guides/platform/manage-your-usage/compute: 'Paid plans include $10 in Compute Credits, which cover one project running on the Micro/Nano Compute size'; compute-and-disk table: Micro $0.01344/hr (~$10/mo, 1 GB RAM, 60 direct / 200 pooler connections), Small ~$15 (2 GB), Medium ~$60 (4 GB), Large ~$110 (8 GB dedicated 2 vCPU), XL ~$210. planetscale.com/pricing: Postgres EBS single-node PS-5 $5/mo, PS-10 $10-13; HA 3-node PS-5 $15, PS-10 $30-39, PS-160 $286-349; Metal M-10 from $50; no free tier listed. Worked cost: 0 customers Neon $0 vs Supabase $0 (but pausing) ; 1,000 customers with ~5k queries and ~150k snapshots/mo (~30 KB each, ~4.5 GB/mo growth): Neon at ~1-1.5 CU average = $77-116/mo compute + ~$20 storage; Supabase Pro + Medium compute = $25 + $60 - $10 credit + disk ~$80-100. Build impact: Neon via the Vercel Marketplace gives per-preview-branch databases, which pairs well with Claude Code's branch/PR workflow; Supabase is a near-drop-in swap later because both are Postgres under Drizzle.

Sources:
- https://neon.com/pricing
- https://neon.com/docs/introduction/plans
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/compute-and-disk
- https://supabase.com/docs/guides/platform/manage-your-usage/compute
- https://planetscale.com/pricing

### 7. Better Auth 1.7.7 (open source, now owned by Vercel, with Auth.js folded in) should be the auth layer: its organization plugin provides the multi-tenant model (organization, member, invitation, team tables; owner/admin/member roles; activeOrganizationId on session) and its Stripe plugin supports per-organization subscriptions; Clerk is the hosted alternative at free up to 50,000 monthly retained users then $25/mo Pro plus a $100/mo B2B add-on for unlimited org members.

_Confidence: high_ **[plan-critical]**

npm better-auth latest=1.7.7 (2026-09-30). better-auth.com/blog: 1.7 (Aug 17 2026: OAuth/OIDC expansion, MCP authorization, SCIM groups, device authorization), 1.6 (Apr 7 2026: OpenTelemetry), 1.5 (Feb 28 2026: Auth CLI, MCP Auth), 'Better Auth is joining Vercel' (Jul 7 2026) stating Vercel 'shares our commitment to keeping auth open source, framework and platform agnostic'; 'Auth.js joins Better Auth' (Sep 22 2025). authjs.dev now states 'The Auth.js project is now part of Better Auth'; next-auth latest=4.24.15 with v5 still 5.0.0-beta.32 (2026-07-20), so Auth.js is not a forward-looking choice. docs/introduction notes an MCP server and skills for coding assistants. Organization plugin: tables organization(id,name,slug,logo,metadata), member(id,userId,organizationId,role), invitation(id,email,organizationId,inviterId,expiresAt), optional team(id,name,organizationId); session gains activeOrganizationId/activeTeamId; createAccessControl for custom roles; organization.setActive({ organizationId | organizationSlug }); useActiveOrganization() hook; dynamic roles via organizationRole table with maximumRolesPerOrganization. Stripe plugin: auto-creates Stripe customers, subscriptions with custom referenceId for organization billing gated by authorizeReference, handles checkout.session.completed and customer.subscription.created/updated/deleted webhooks, trials ('only one trial per account across all plans'), billing portal endpoints; adds stripeCustomerId to user/organization and a subscription table. clerk.com/pricing: Hobby free, Pro $25/mo ($20 annual), Business $300/mo; 50,000 MRUs included per app then $0.02/MRU; 'A Monthly Retained User is a user who visits your app in a given month at least one day after signing up'; 100 monthly retained orgs free with up to 20 members per org; enhanced B2B add-on $100/mo for unlimited members per organization and verified domains. Supabase Auth: 50k MAU free, 100k on Pro then $0.00325/MAU (supabase.com/pricing). Build impact: Better Auth keeps users/orgs in the same Drizzle schema as app data (simpler joins and RLS), costs $0, and its Stripe plugin removes most billing code.

Sources:
- https://registry.npmjs.org/better-auth
- https://www.better-auth.com/blog
- https://www.better-auth.com/blog/better-auth-joins-vercel
- https://www.better-auth.com/docs/introduction
- https://www.better-auth.com/docs/plugins/organization
- https://www.better-auth.com/docs/plugins/stripe
- https://authjs.dev/
- https://registry.npmjs.org/next-auth
- https://clerk.com/pricing
- https://supabase.com/pricing

### 8. Trigger.dev 4.7.3 is the right job runner only if long-running or headless-browser work is needed: it runs code on its own machines (no serverless time limit; maxDuration counts CPU/active time and waits are excluded) and bills per run ($0.25 per 10k) plus per-second machine time (small-1x 0.5 vCPU/0.5 GB at $0.0000338/s ≈ $0.122/hr), with Free $5 credits/20 concurrent/10 schedules (hourly minimum), Hobby $10/50 concurrent/100 schedules, Pro $50/200 concurrent/1,000 schedules.

_Confidence: high_ **[plan-critical]**

trigger.dev/pricing: Free $0 ($5/mo credits, 20 concurrent runs, 10 schedules, 1-day logs), Hobby $10 ($10 credits, 50 concurrent, 100 schedules, 7-day logs), Pro $50 ($50 credits, 200+ concurrent then $10/mo per 50, 1,000+ schedules then $10/mo per 1,000, 30-day logs); run invocation $0.000025; machines micro $0.0000169/s, small-1x $0.0000338/s, small-2x $0.0000675/s, medium-1x $0.0000850/s, large-1x $0.0003400/s. docs/tasks/scheduled: schedules.task({ id, cron, run }), imperative schedules.create({ task, cron, timezone, externalId, deduplicationKey }) for per-tenant schedules, payload has timestamp/lastTimestamp/timezone/scheduleId/externalId/upcoming, 'windows' spread runs; Free plan minimum 60-minute window. docs/queue-concurrency: concurrencyLimit({ name, total }), per-task `concurrency: { total: 1 }`, `concurrencyKey: data.userId` for per-tenant pools, perKey vs total, slots released at waitpoints. docs/triggering: batchTrigger up to 1,000 runs per call on SDK 4.3.1+ (500 earlier), 10 MB payload hard limit (over 512 KB offloaded to object storage), 100 MB output, idempotency keys expire after 30 days, delay option ('1h', Date). docs/runs/max-duration: minimum 5s, no stated hard upper limit, waits (wait.for, triggerAndWait, batchTriggerAndWait) do not count, timeout.None to disable. npm @trigger.dev/sdk latest=4.7.3 (2026-10-06). Worked cost at 1,000 customers: ~150k runs x ~30s on small-1x = ~$152 machine + ~$4 runs + $50 Pro ≈ $156-206/mo, i.e. more than Inngest Pro for I/O-bound capture because machine time includes waiting on HTTP.

Sources:
- https://trigger.dev/pricing
- https://trigger.dev/docs/tasks/scheduled
- https://trigger.dev/docs/queue-concurrency
- https://trigger.dev/docs/triggering
- https://trigger.dev/docs/runs/max-duration
- https://registry.npmjs.org/%40trigger.dev%2Fsdk

### 9. Stripe is the cheapest and best-documented billing path (2.9% + 30¢ domestic cards, +0.7% of volume for Billing pay-as-you-go, Stripe Tax 0.5%/txn or Managed Payments MoR at +3.5%); Lemon Squeezy is being migrated into Stripe Managed Payments so it should not be adopted for a new product; Polar (5% + 50¢ on the free Starter plan, 3.8% + 40¢ on $20/mo Pro, MoR in 100+ markets) and Paddle (5% + 50¢, MoR) are the merchant-of-record options.

_Confidence: high_

stripe.com/pricing: '2.9% + 30¢ per successful transaction for domestic cards', +1.5% international, +1% currency conversion; Managed Payments is 'Stripe's merchant of record solution' at '3.5% per successful Managed Payments transaction in addition to Payments fees' (i.e. ~6.4% + 30¢), 80+ countries, no setup fees or minimums (stripe.com/managed-payments). stripe.com/billing/pricing: 0.7% of billing volume pay-as-you-go, or $620/mo tiers; includes customer portal, smart retries, subscription schedules; custom portal domain $10/mo. lemonsqueezy.com/pricing: '5% + 50¢', MoR, payouts twice a month, header '2026 Update: Lemon Squeezy + Stripe Managed Payments'; the blog's most recent post is that Jan 28 2026 update (older posts Aug 2025) and third-party coverage describes a migration path onto Stripe Managed Payments, so treat Lemon Squeezy as sunsetting. polar.sh and polar.sh/docs/merchant-of-record/fees: Starter 5% + 50¢ (free), Pro 3.8% + 40¢ ($20/mo), Growth 3.6% + 35¢ ($100/mo), Scale 3.4% + 30¢ ($400/mo); tiers chosen by plan, breakeven Pro at ~$1,379/mo sales; +1.5% international cards; $15 per dispute; Stripe payout fees passed through ($2/mo active payout, 0.25% + $0.25 per payout); npm @polar-sh/sdk 1.0.2 (2026-10-02). paddle.com/pricing: '5% + 50¢ per Checkout transaction', MoR, no monthly fees, bespoke pricing for products under $10. npm stripe latest=23.0.0 (2026-10-01). Build impact: use Stripe Checkout + Billing through Better Auth's Stripe plugin; enable Stripe Tax when crossing registration thresholds; switch to Polar only if the founder wants tax liability handled from day one at roughly double the fee.

Sources:
- https://stripe.com/pricing
- https://stripe.com/billing/pricing
- https://stripe.com/managed-payments
- https://www.lemonsqueezy.com/pricing
- https://www.lemonsqueezy.com/blog
- https://polar.sh/
- https://polar.sh/docs/merchant-of-record/fees
- https://www.paddle.com/pricing
- https://registry.npmjs.org/%40polar-sh%2Fsdk

### 10. Multi-tenant isolation should be organization_id on every tenant table enforced in a Drizzle query helper, optionally hardened with Postgres RLS policies that Drizzle can define and migrate; Supabase's RLS guide supplies the proven patterns (wrap auth functions in SELECT, index every policy column, security-definer helper for membership lookups, pgTAP tests).

_Confidence: medium_

supabase.com/docs/guides/database/postgres/row-level-security: enable with `alter table ... enable row level security`, write separate policies per operation (select/insert/update/delete with using/with check), always add a `to authenticated` clause, 'Add an index on every column your policies filter on', wrap calls as `(select auth.uid())` so the planner caches per statement, store authorization data in app_metadata ('raw_app_meta_data cannot be updated by the user'), and avoid recursive policies with a `security definer set search_path = ''` function such as private.user_team_ids(); test with pgTAP under supabase/tests and `supabase test db`. Drizzle (orm.drizzle.team/docs/rls) supports pgPolicy/pgRole/withRLS and provider helpers for Supabase and Neon, and drizzle-kit can manage roles via `entities.roles`. Because Better Auth (not Supabase JWT) issues sessions, the RLS predicate should read a per-transaction setting, e.g. `using (organization_id = current_setting('app.org_id', true)::uuid)` with `set local app.org_id` inside a withOrg(tx) wrapper; the primary guard remains the typed query helper. Suggested tables: organization/member/invitation (Better Auth), tracked_query(organization_id, query, gl, hl, device, status), snapshot(tracked_query_id, captured_at, has_aio, answer_text, raw_json), snapshot_claim(snapshot_id, position, text), snapshot_citation(snapshot_id, claim_id, url, domain, title, position), source_page(url, fetched_at, html_ref, extracted_json), analysis_run(tracked_query_id, window_start, window_end, model, result_json), brief(analysis_run_id, content_md, version), user_page(organization_id, tracked_query_id, url), appearance(snapshot_id, user_page_id, cited, section).

Sources:
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://orm.drizzle.team/docs/rls
- https://www.better-auth.com/docs/plugins/organization

### 11. Vercel Cron + QStash, Temporal Cloud, BullMQ and Supabase pg_cron/Edge Functions are all workable but each adds either a second runtime or hard limits that make them worse than Inngest/Workflows for this product; Supabase Edge Functions in particular cap CPU at 2s and memory at 256 MB.

_Confidence: high_

upstash.com/pricing/qstash: Free 1,000 messages/day, 10 active schedules, parallelism 10, 1 MB messages; Pay-as-you-go $1 per 100K messages, 1,000 schedules, parallelism 100, 10 MB, 1-year max delay; Fixed 1M $180/mo; retries are billed as separate messages; bandwidth free to 50 GB then $0.05/GB. temporal.io/pricing: $50 per million actions sliding to $25, active storage $0.042/GB-hr, retained $0.00105/GB-hr, no base fee, $150 credits for 90 days, Business support from $500/mo; still requires you to host a worker (e.g. Railway) and learn the Temporal programming model. docs.bullmq.io: Redis-backed, rate limiting, per-worker concurrency, cron-style repeatable job schedulers, retries with backoff, flows; requires an always-on worker plus Redis (npm bullmq 6.3.11). supabase.com/docs/guides/cron: pg_cron, every second to once a year, 'no more than 8 Jobs run concurrently. Each Job should run no more than 10 minutes', runs recorded in cron.job_run_details; docs/guides/queues: pgmq-based with exactly-once delivery inside visibility windows and RLS; docs/guides/functions/limits: 'Maximum Memory: 256MB', wall clock 150s Free / 400s paid, 'Maximum CPU Time: 2s', 150s idle timeout. docs.railway.com/reference/cron-jobs: minimum 5 minutes apart, a run is skipped if the previous one is still executing, timing may drift by minutes, UTC only. Build impact: do not put LLM analysis or page fetching in Supabase Edge Functions; if a Postgres-native scheduler is wanted later, pg_cron can enqueue into pgmq or call an HTTP endpoint that starts an Inngest/Workflow run.

Sources:
- https://upstash.com/pricing/qstash
- https://temporal.io/pricing
- https://docs.bullmq.io/
- https://supabase.com/docs/guides/cron
- https://supabase.com/docs/guides/queues
- https://supabase.com/docs/guides/functions/limits
- https://docs.railway.com/reference/cron-jobs
- https://registry.npmjs.org/bullmq

### 12. If a headless-browser or always-on worker is needed, Railway (Hobby $5/mo including $5 usage; ~$20 per vCPU-month, ~$10 per GB-month; Pro $20/mo) or Fly.io (shared-cpu-1x: 256 MB $2.19, 512 MB $3.69, 1 GB $6.70, 2 GB $13.39 per month; no platform fee) are the cheapest hosts; Render charges a Starter instance $7/mo (0.5 CPU/512 MB) or Standard $25/mo (1 CPU/2 GB); Vercel Services (Beta) can run containers but inherit the 800s function limits so they are not an always-on worker.

_Confidence: medium_

railway.com/pricing: Free $0 with $1 monthly credit, Hobby '$5/month, including $5 of monthly usage credits', Pro '$20/month per workspace, including $20 of monthly usage credits'; memory $0.00000386 per GB/s (≈$10/GB-mo), CPU $0.00000772 per vCPU/s (≈$20/vCPU-mo), egress $0.05/GB; new users get a one-time $5 trial credit. docs.fly.io/about/pricing: shared-cpu-1x 256 MB $2.19/mo, 512 MB $3.69, 1 GB $6.70, 2 GB $13.39; performance-1x 2 GB $33; volumes $0.15/GB-mo; egress $0.02/GB NA/EU; 'No monthly platform fee'; support plans optional ($29+). render.com/pricing (raw HTML tables): compute Free $0 (0.1 CPU/512 MB), Starter $7/mo (0.5 CPU/512 MB), Standard $25/mo (1 CPU/2 GB), Pro Plus $175/mo (4 CPU/8 GB), Pro Max $225/mo (4 CPU/16 GB), Pro Ultra $450/mo (8 CPU/32 GB); cron jobs billed per-minute ($0.00016/min Starter, $0.00058/min Standard); Postgres Basic-1gb $19/mo, Basic-4gb $75, Pro-4gb $55; Key Value Starter $10/mo; third-party coverage reports workspace plans Hobby $0, Pro $25/mo, Scale $499/mo after an April 2026 change (not confirmed on a Render-owned page). vercel.com/docs/services (Beta, all plans): multiple services per project, `runtime: 'container'` for Docker images, 'The same function limits apply to each service, such as memory and maximum duration', billed as Active CPU/provisioned memory/invocations. Build impact: a Playwright worker on Railway Hobby (~$5-20/mo) can serve a second Inngest app (same account) so browser-heavy functions run off Vercel; defer until a SERP API proves insufficient.

Sources:
- https://railway.com/pricing
- https://docs.fly.io/about/pricing
- https://render.com/pricing
- https://render.com/docs/compute-plans
- https://vercel.com/docs/services
- https://vercel.com/docs/services/pricing

### 13. PostHog's free tier (1M events, 5k replays, 1M feature-flag requests, 100k error-tracking exceptions, 1.5k survey responses per month) plus the free open-source Flags SDK with the @flags-sdk/posthog adapter covers analytics, flags and error tracking at $0 for the first hundreds of customers; Sentry's Developer plan is free for one user with 5k errors, Team is $26/mo.

_Confidence: high_

posthog.com/pricing.md: Product analytics 'First 1,000,000' events then $0.00005/event; Session replay first 5,000 then $0.005; Feature flags & experiments first 1,000,000 requests then $0.0001; Error tracking first 100,000 exceptions then $0.00037; Surveys first 1,500 responses then $0.10; Data warehouse first 1,000,000 rows then $0.000015; platform packages Boost $250/mo, Scale $750/mo, Enterprise $2,000/mo. sentry.io/pricing: Developer $0 (5k errors, 5M spans, 50 replays, one user, 30-day lookback), Team $26/mo (50k errors), Business $80/mo (90-day lookback). flags-sdk.dev: 'Flags SDK is a free, open-source library for using feature flags in Next.js and SvelteKit', 'a library, not a hosted service'; npm `flags` 4.3.1 (2026-09-09); npm search of the @flags-sdk scope lists adapters: vercel 1.5.0, posthog 1.1.0 (2026-09-25), launchdarkly 1.1.1, statsig 0.3.1, growthbook 0.3.1, flagsmith 2.0.0, openfeature 0.1.3, global-config 0.3.1, reflag 1.0.2, bucket 0.1.1, optimizely 0.1.1. Vercel's own Flags Explorer is a $250/mo Pro add-on (docs/plans/pro-plan) and is unnecessary. npm posthog-node 5.55.0, @sentry/nextjs 11.4.0. Worked cost at 1,000 customers: ~2M analytics events ≈ $50/mo; flags well under 1M requests if evaluated server-side per request with caching.

Sources:
- https://posthog.com/pricing.md
- https://sentry.io/pricing/
- https://flags-sdk.dev/
- https://github.com/vercel/flags
- https://registry.npmjs.org/-/v1/search?text=%40flags-sdk&size=60
- https://vercel.com/docs/plans/pro-plan

### 14. Resend is the best-fit transactional email provider (Free 3,000 emails/mo capped at 100/day, 3 domains, 30-day retention; Pro $20/mo for 50,000 or $35/mo for 100,000, overage $0.90 per 1,000); Postmark starts at $15/mo for 10,000 (overage $1.80/1k) with a 100-email free developer tier; Loops prices by subscribed contacts with a free tier of 4,000 sends per rolling 30 days.

_Confidence: high_

resend.com/pricing: Free $0/mo, 3,000 emails, 'limited to 100 emails per day', 3 domains, 30-day retention; Pro $20/mo (50,000) or $35/mo (100,000), overage $0.90 per 1,000; Scale $90-$1,150/mo; marketing broadcasts billed separately by contacts (free 1,000 contacts). npm resend 6.32.1 (2026-10-06). postmarkapp.com/pricing: Free developer 100 emails/mo; Basic $15/mo from 10,000 emails, $1.80/1,000 overage; Pro $16.50/mo, $1.30/1,000; Platform $18/mo, $1.20/1,000; 45-day retention default. loops.so/pricing: free plan 'up to 4,000 total emails to your 1,000 newest contacts in any rolling 30-day window', paid plans 'based on the number of subscribed contacts' with transactional sends included, no public dollar tiers on the page. Build impact: daily 'AI Overview changed' digests are the main send volume (1,000 customers x 1 digest/day = 30k/mo), so Resend Pro $20 at scale; use React Email templates checked into the repo so Claude Code can edit them.

Sources:
- https://resend.com/pricing
- https://postmarkapp.com/pricing
- https://loops.so/pricing
- https://registry.npmjs.org/resend

### 15. Paid SaaS boilerplates now market Claude Code support and match the recommended stack (Supastarter $299: Next.js/Nuxt/TanStack Start, Better Auth, Prisma or Drizzle, Stripe/Lemon Squeezy/Polar/Creem/Dodo, Hono, AGENTS.md + Agent Skills; Makerkit $349: Next.js 16 kits with Supabase, Drizzle + Better Auth or Prisma 7 + Better Auth, MCP server + AGENTS.md), while ShipFast ($199, NextAuth, MongoDB/Supabase, JS or TS) is dated; Vercel's MIT Next.js SaaS Starter (Drizzle + Stripe + shadcn/ui, teams, RBAC, activity log, hand-rolled JWT cookie auth) and create-t3-app are the free options.

_Confidence: high_

supastarter.dev: Solo $299 / Startup $799 / Agency $1,499 one-time; frameworks Next.js, Nuxt, TanStack Start; Prisma and Drizzle; better-auth (password, passkeys, magic links, OAuth, 2FA, roles); payments Stripe, Lemonsqueezy, Polar, Creem, Dodo; Hono API, TanStack Query, Tailwind, shadcn-compatible, Sentry, Playwright; 'the SaaS starter kit your coding agent deserves', AGENTS.md and Agent Skills specs, lists Claude Code/Cursor/Codex. makerkit.dev/pricing: Pro $349 (one developer), Teams $649; Supabase kit 'Ships for Next.js 16, React Router 8 and TanStack Start', Drizzle kit (Drizzle + Better Auth), Prisma kit (Prisma 7 + Better Auth); commercial license 'does not allow publishing the codebase'; 'Built for Claude Code, Cursor, Codex & Gemini — MCP server included', AGENTS.md rules; free MIT MakerKit Lite exists. shipfa.st: Starter $199, All-in $249; Next.js app or pages router, JS or TS, MongoDB or Supabase, NextAuth, Stripe or Lemon Squeezy, Mailgun or Resend; mentions Claude/Cursor compatibility. create.t3.gg: Next.js + tRPC + Tailwind + optional Prisma/Drizzle + NextAuth; 'NOT an all-inclusive template'. github.com/nextjs/saas-starter: MIT, Next.js + Postgres + Drizzle + Stripe + shadcn/ui, 'Email/password authentication with JWTs stored to cookies', teams with Owner/Member RBAC, activity logging, Stripe Customer Portal, 16.2k stars, 'intentionally minimal'. Build impact: a boilerplate saves roughly 1-2 weeks of settings/billing/team UI but adds abstractions (Hono layer, multi-provider payment code, per-kit conventions) that Claude Code must learn and that cannot be published; with Claude Code generating the scaffolding, the free MIT starter plus Better Auth plugins is sufficient. Buying Supastarter (Next.js + Drizzle + Better Auth variant) is defensible only if the founder wants a polished team/billing UI on day one and accepts the license.

Sources:
- https://supastarter.dev/
- https://makerkit.dev/pricing
- https://shipfa.st/
- https://create.t3.gg/
- https://github.com/nextjs/saas-starter

### 16. Claude Code reads CLAUDE.md (project root or .claude/CLAUDE.md, under 200 lines recommended), supports @path imports (max depth four hops), loads .claude/rules/*.md at launch unless they carry a `paths:` frontmatter glob (then only when touching matching files), and can read AGENTS.md on its own or via `@AGENTS.md`; Next.js 16.2+ ships its docs inside node_modules so the AGENTS.md directive gives version-correct context.

_Confidence: high_

code.claude.com/docs/en/memory: 'target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence'; 'Keep it to facts Claude should hold in every session: build commands, conventions, project layout, always do X rules'; locations ~/.claude/CLAUDE.md (user), ./CLAUDE.md or ./.claude/CLAUDE.md (project), ./CLAUDE.local.md (gitignored personal); subdirectory CLAUDE.md files load on demand when Claude reads/edits files there; imports via `@path/to/import`, relative to the containing file, recursive to four hops, skipped inside code spans; `.claude/rules/` files discovered recursively, 'Rules without paths frontmatter are loaded at launch with the same priority as .claude/CLAUDE.md', `paths:` is the only frontmatter key read; AGENTS.md is read when no CLAUDE.md exists (v2.1.277+) or when imported; to enforce a hard block use a PreToolUse hook rather than prose; `/doctor prompt-audit` finds conflicting instructions. nextjs.org/blog/next-16-2-ai: AGENTS.md managed block between `<!-- BEGIN:nextjs-agent-rules -->` markers, CLAUDE.md containing `@AGENTS.md`, `npx @next/codemod@latest agents-md` for existing projects, `logging.browserToTerminal` config, `.next/dev/lock` with PID, `npx skills add vercel-labs/next-browser`. Better Auth docs advertise an MCP server and skills for coding assistants; Makerkit ships an MCP server. npm typescript latest=7.0.2 (2026-07-08) so `typescript` must be pinned deliberately (6.x or 7.x) and the choice recorded in CLAUDE.md.

Sources:
- https://code.claude.com/docs/en/memory
- https://nextjs.org/blog/next-16-2-ai
- https://www.better-auth.com/docs/introduction
- https://registry.npmjs.org/typescript

### 17. Current package versions to pin (npm registry, 2026-10-06): next 16.4.0, drizzle-orm 0.45.3, better-auth 1.7.7, inngest 4.21.1, @trigger.dev/sdk 4.7.3, workflow 5.1.0, @supabase/supabase-js 2.117.2, @clerk/nextjs 7.9.11, flags 4.3.1, posthog-node 5.55.0, @sentry/nextjs 11.4.0, stripe 23.0.0, resend 6.32.1, @upstash/qstash 2.12.0, @temporalio/client 1.24.0, bullmq 6.3.11, react-router 8.4.0, @sveltejs/kit 3.0.1, @tanstack/react-start 1.168.60, typescript 7.0.2, prisma 8.0.0-rc.20 (latest tag) with @prisma/client 7.10.0.

_Confidence: high_

All dist-tags and publish dates were read directly from registry.npmjs.org metadata on 2026-10-06. Notable: `prisma@latest` is an RC while `@prisma/client@latest` is 7.10.0; `typescript@latest` is the 7.x native compiler; `@supabase/supabase-js` has a 3.0.0-next line; `next-auth` v5 remains beta (5.0.0-beta.32) and v4.24.15 is latest. Pin exact versions in package.json and record them in CLAUDE.md so Claude Code does not drift to pre-release APIs.

Sources:
- https://registry.npmjs.org/next
- https://registry.npmjs.org/drizzle-orm
- https://registry.npmjs.org/better-auth
- https://registry.npmjs.org/inngest
- https://registry.npmjs.org/%40trigger.dev%2Fsdk
- https://registry.npmjs.org/workflow
- https://registry.npmjs.org/prisma
- https://registry.npmjs.org/%40prisma%2Fclient
- https://registry.npmjs.org/typescript
- https://registry.npmjs.org/stripe
- https://registry.npmjs.org/resend
- https://registry.npmjs.org/flags

## Recommendations from this dimension

- Adopt this single stack: Next.js 16.4 App Router (TypeScript, Tailwind, shadcn/ui) deployed on Vercel Pro; Neon Postgres (Vercel Marketplace) with Drizzle ORM 0.45.x pinned; Better Auth 1.7 with the organization and Stripe plugins; Inngest 4.x served from app/api/inngest/route.ts with `export const maxDuration = 300` (raise toward 800 if LLM steps need it); Stripe Checkout + Billing; Resend + React Email; PostHog (analytics, error tracking, flags through `flags` + `@flags-sdk/posthog`) plus Sentry Developer (free) for stack traces; no separate worker host until a headless browser is proven necessary.
- Job topology for the daily capture: one Inngest cron function (`cron('TZ=UTC 0 3 * * *')`, jitter 5m) that pages through active tracked_query rows and calls step.sendEvent in chunks of up to 5,000 `aio/capture.requested` events; a per-query capture function with `concurrency: [{ scope: 'account', key: '"serp-api"', limit: N }, { key: 'event.data.organizationId', limit: 2 }]` and a `throttle` matched to the SERP provider's rate limit; separate event-triggered functions for `aio/snapshot.stored` (diff vs previous day, notify), `aio/analysis.requested` (LLM pattern mining over N days), `aio/source.fetch` (cited page extraction, idempotent per URL/day) and `aio/brief.generate`. Keep each function to 3-5 steps so Inngest executions stay near 4-6 per capture.
- Treat Vercel Workflows as the designated fallback for cost: if Inngest Pro ($99) is unwanted at ~100 customers, port the same functions to `'use workflow'`/`'use step'` (events ~$0.02 per 1k on Pro, 50k free on Hobby) and implement per-tenant concurrency with a Postgres advisory-lock or token-bucket table, since the Workflow SDK does not document per-key concurrency/throttle primitives. Use Trigger.dev only for a Playwright-based capture path; if that path is needed sooner, run it as a second Inngest app on Railway Hobby instead of adding a second orchestrator.
- Multi-tenancy: put organization_id (FK to Better Auth's organization table) on every tenant table, expose one `db.forOrg(orgId)` helper in src/db that every server action and job must use, and add Drizzle pgPolicy RLS reading `current_setting('app.org_id', true)` inside a `withOrg(orgId, tx)` wrapper as defense in depth; index (organization_id, created_at) on snapshot-type tables and store raw AI Overview JSON/HTML in object storage (Vercel Blob or R2) with only pointers in Postgres.
- Billing: Stripe products Starter/Pro/Agency priced per tracked query bucket; use Better Auth's Stripe plugin with `referenceId = organizationId` and `authorizeReference` checking member role owner/admin; verify `customer.subscription.*` webhooks via the plugin; switch on Stripe Tax when crossing nexus thresholds. Do not integrate Lemon Squeezy. If the founder insists on merchant-of-record from day one, use Polar (free Starter plan, 5% + 50¢) via @polar-sh/sdk 1.0.
- Monthly infra budget excluding LLM and SERP API spend: 0 customers ≈ $20 (Vercel Pro $20; Neon Free, Inngest Free, Better Auth, Resend Free, PostHog Free, Sentry Developer all $0; stay on Vercel Hobby only while pre-launch and non-commercial). 100 customers (~500 queries, ~15k snapshots/mo) ≈ $150-200: Vercel Pro $20-30, Neon Launch $25-45, Inngest Pro $99 (just over Free's 50k executions), Resend $0, PostHog $0, Sentry $0-26. 1,000 customers (~5,000 queries, ~150k snapshots/mo, ~600-900k Inngest executions) ≈ $400-550: Vercel Pro ~$50-60 (compute ~$30 on top of credit), Neon ~$120-140 (1-1.5 CU average + ~60 GB), Inngest Pro $99-130, Resend Pro $20, PostHog ~$50, Sentry Team $26, optional Railway Playwright worker $20-40. Substituting Vercel Workflows for Inngest lowers the 100-customer figure to ≈ $50-100 and the 1,000-customer figure by ≈ $60-90.
- Skip paid boilerplates by default: scaffold with `npx create-next-app@latest` (which writes AGENTS.md), copy the structure and Stripe/teams patterns from Vercel's MIT nextjs/saas-starter, and let Claude Code generate settings/billing/team UI with shadcn/ui. Only buy Supastarter (Next.js + Drizzle + Better Auth variant, $299) if a polished multi-tenant admin UI is needed in week one; avoid ShipFast (NextAuth/MongoDB-era design) and avoid Makerkit's Supabase-Auth kit since the stack uses Better Auth.
- Repo setup for Claude Code: (1) CLAUDE.md under 200 lines containing `@AGENTS.md`, the exact pinned versions, the one-line commands `pnpm typecheck` (tsc --noEmit), `pnpm lint` (Biome or ESLint flat config), `pnpm test` (Vitest, unit + Drizzle queries against a Neon branch or PGlite), `pnpm test:e2e` (Playwright), `pnpm db:generate | db:migrate | db:seed | db:studio`, `pnpm jobs:dev` (npx inngest-cli@latest dev), and the rules 'never run db:push/migrate against production', 'every tenant query goes through db.forOrg', 'new Inngest functions must declare concurrency and a concurrencyKey'; (2) `.claude/rules/db.md` with `paths: ["src/db/**"]`, `.claude/rules/jobs.md` with `paths: ["src/inngest/**"]`, `.claude/rules/ui.md` for shadcn conventions; (3) a PreToolUse hook that blocks `drizzle-kit push` and `vercel --prod` unless CI; (4) `.env.example` plus `src/env.ts` zod validation (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY, RESEND_API_KEY, POSTHOG_KEY, SENTRY_DSN, SERP/LLM keys) and `vercel env pull .env.local`; (5) `next.config.ts` with `logging.browserToTerminal: 'error'` and `npx skills add vercel-labs/next-browser`; (6) `pnpm db:seed` creating one org, two users, three tracked queries and 7 days of fixture AI Overview snapshots with citations (JSON fixtures under tests/fixtures/aio/) so diffing, pattern-mining and brief generation are testable without SERP or LLM spend; (7) GitHub Actions running typecheck, lint, unit tests and `drizzle-kit check` on every PR with a Neon preview branch created by the Vercel integration.
- Pin and record decisions that are time-sensitive: typescript (choose 6.x or 7.x explicitly, verify Next 16.4 support in CI), drizzle-orm 0.45.x (re-evaluate 1.0 after GA), prisma avoided (or pinned to 7 if ever used), Inngest SDK 4.x checkpointing settings, and re-check Lemon Squeezy/Stripe Managed Payments and Vercel Workflows flow-control docs before launch since both changed in 2026.

## Open questions

- Does the Workflow SDK 5.x expose per-key concurrency, throttle or rate-limit primitives comparable to Inngest's flow control? The Vercel docs read on 2026-10-06 document only queue-level max concurrency; this decides whether Workflows can replace Inngest at the ~100-customer cost threshold.
- Will the AI Overview capture be done through a SERP API (short HTTP steps that fit inside Vercel's 800s functions) or require a headless browser? The answer decides whether Trigger.dev or a Railway Playwright worker enters the stack and adds ~$20-150/mo; Trigger.dev's Playwright/Chromium build-extension support was not verified in this pass.
- Object storage for raw AI Overview HTML/JSON and cited-page HTML was not researched (Vercel Blob vs Cloudflare R2 vs Supabase Storage); at 1,000 customers this is ~5 GB/month of growth and the choice affects egress cost.
- Is Next.js 16.4 fully compatible with the TypeScript 7.0.x native compiler that npm now serves as `typescript@latest`, or should the repo pin TypeScript 6.x? Not verified against Next.js docs.
- Render's workspace-plan prices (reported Hobby $0 / Pro $25 / Scale $499 after an April 2026 change) could only be confirmed from third-party coverage, not a Render-owned page; irrelevant unless Render is chosen for a worker.
- Neon Launch has no stated base fee on its plans page; confirm in the Vercel Marketplace billing flow whether a minimum applies and whether Neon's Vercel integration auto-creates preview branches on the Free plan (10 branches per project).
- Whether Inngest's Free tier concurrency of 5 steps is acceptable during beta (≈1,000 daily captures at 5 concurrent × ~10s ≈ 35 minutes) or whether Pro is needed earlier for latency reasons rather than execution volume.
- Stripe Tax Basic (0.5% per transaction) versus Managed Payments (+3.5%) versus Polar: the founder's jurisdiction and expected international share determine when a merchant-of-record becomes worth roughly double the fees.
