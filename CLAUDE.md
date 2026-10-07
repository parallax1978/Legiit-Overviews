# CLAUDE.md

Legiit Overviews captures a Google AI Overview every 3 hours, extracts and counts what keeps showing up with evidence, reverse-engineers the cited pages, writes a brief, and tracks whether the user's page gets cited. Read `PLAN.md`; it is the spec. Section 0 says where the build stands, section 11 what the founder provides, section 12 the sessions to run next.

Stack: DataForSEO (data), Claude API (analysis), Supabase (database, auth, Storage, Edge Functions, Cron), Next.js on Vercel (app in `web/`), Resend (email). Billing is not built yet; payments will be added later.

## How to work

- Do the sessions in `PLAN.md` section 12 in order, one per session. Start by re-running the previous session's check. Tick a session in `docs/progress.md` when its check passes on real data.
- Real APIs are the default. Checks run against api.dataforseo.com, api.anthropic.com and the hosted Supabase project, never against `mocks/`. The mock server exists only for offline unit tests. In the cloud environment, run smoke scripts and tests with `ANTHROPIC_BASE_URL` unset (it points at a proxy for Claude Code itself).
- Keys come from the environment (`PLAN.md` section 11 lists the names). If one is missing, do everything that does not need it and say which variable the founder must add; never ask for a key in the chat.
- Edge Functions live in `supabase/functions/`, shared code in `supabase/functions/_shared/`, migrations in `supabase/migrations/`, the app in `web/`, scripts in `scripts/`.
- `docs/architecture.md` fixes the interfaces between modules (status flows, refs, RPCs, function requests). `docs/design-spec.md` is the user-facing surface for an everyday user. `docs/brand.md` is the design system; the app matches legiitkeywords.com.
- If DataForSEO's or Claude's real response differs from the plan, follow the real response and update `PLAN.md`.

## Rules

- Counts come from the database, never from Claude. Claude extracts and matches; SQL counts.
- Every claim row keeps its capture, section, sentence and citations, so every number in the app can show its evidence. The everyday-user surface hides numbers behind "Show the evidence"; it never removes the path to them.
- Claude model IDs live only in `supabase/functions/_shared/claude.ts`. Use structured outputs (`output_config.format` with a JSON schema) and check `stop_reason` before parsing. Scheduled work goes through the Message Batches API. Compare enum values case-insensitively.
- Every table users can see has row-level security. Edge Functions use the service role key; the browser never sees it or any API key.
- Secrets live in Supabase secrets and Vercel env vars, never in the repo. `supabase/seed.sql` holds local Vault values only and is never applied to production.
- Plain words in the app: "search" not "query", "check" not "render", "x of y answers" never "n=", local dates with UTC only in tooltips. `docs/design-spec.md` has the full vocabulary table.
