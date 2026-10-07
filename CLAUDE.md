# CLAUDE.md

Legiit Overviews tracks a Google AI Overview daily, finds the patterns with Claude, and writes a brief for a page that can get cited. Read `PLAN.md`; it is short and it is the spec.

Stack: DataForSEO (data), Claude API (analysis), Supabase (database, auth, Edge Functions, Cron), Next.js on Vercel (frontend).

## How to work

- Do the build steps in `PLAN.md` section 6 in order, one per session. Tick them in `docs/progress.md` when the "done when" check passes.
- Edge Functions live in `supabase/functions/`, shared code in `supabase/functions/_shared/`, migrations in `supabase/migrations/`, the app in `app/`.
- If DataForSEO's real response differs from the plan, follow the real response and update `PLAN.md`.

## Rules

- The Claude model ID is defined once in `supabase/functions/_shared/claude.ts`.
- Use structured outputs (`output_config.format` with a JSON schema) and check `stop_reason` before parsing.
- Every table users can see has row-level security. Edge Functions use the service role key; the browser never sees it or any API key.
- Keep secrets in Supabase secrets and Vercel env vars, never in the repo.
