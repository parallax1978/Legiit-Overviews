# CLAUDE.md

Legiit Overviews captures a Google AI Overview every 3 hours, extracts and counts what keeps showing up with evidence, reverse-engineers the cited pages, writes a brief, and tracks whether the user's page gets cited. Read `PLAN.md`; it is the spec.

Stack: DataForSEO (data), Claude API (analysis), Supabase (database, auth, Storage, Edge Functions, Cron), Next.js on Vercel (app), Stripe (billing), Resend (email).

## How to work

- Do the build steps in `PLAN.md` section 11 in order, one per session. Tick them in `docs/progress.md` when the step's check passes.
- Edge Functions live in `supabase/functions/`, shared code in `supabase/functions/_shared/`, migrations in `supabase/migrations/`, the app in `app/`.
- If DataForSEO's real response differs from the plan, follow the real response and update `PLAN.md`.

## Rules

- Counts come from the database, never from Claude. Claude extracts and matches; SQL counts.
- Every claim row keeps its capture, section, sentence and citations, so every number in the app can show its evidence.
- Claude model IDs live only in `supabase/functions/_shared/claude.ts`. Use structured outputs (`output_config.format` with a JSON schema) and check `stop_reason` before parsing. Scheduled work goes through the Message Batches API.
- Every table users can see has row-level security. Edge Functions use the service role key; the browser never sees it or any API key.
- Secrets live in Supabase secrets and Vercel env vars, never in the repo.
