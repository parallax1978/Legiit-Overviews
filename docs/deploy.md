# Deploying

Production runs on a Supabase project (database, auth, Storage, Edge Functions, Cron) and Vercel (the `web/` app).

## Supabase

1. Create a project, then link it: `npx supabase link --project-ref <ref>`.
2. Push the schema: `npx supabase db push`. This creates every table, the RLS policies, the metrics functions and the cron jobs.
3. Seed reference data once in the SQL editor: run the `locations` and `platform_domains` inserts from `supabase/seed.sql` (not the Vault lines at the end; those are local values).
4. Create the two Vault secrets the cron jobs read (SQL editor):

   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'functions_url');
   select vault.create_secret('<a long random string>', 'cron_secret');
   ```

5. Set the Edge Function secrets (the same cron secret as above):

   ```sh
   npx supabase secrets set \
     DATAFORSEO_LOGIN=... DATAFORSEO_PASSWORD=... \
     ANTHROPIC_API_KEY=... \
     POSTBACK_SECRET=<another long random string> \
     CRON_SECRET=<the cron secret> \
     RESEND_API_KEY=... EMAIL_FROM="Legiit Overviews <alerts@yourdomain>" \
     APP_URL=https://<your app domain>
   ```

   `FUNCTIONS_PUBLIC_URL` defaults to `<SUPABASE_URL>/functions/v1`, which is what DataForSEO posts back to. Leave `DATAFORSEO_BASE_URL` and `ANTHROPIC_BASE_URL` unset in production.

6. Deploy the functions: `npx supabase functions deploy`. `supabase/config.toml` sets which functions verify the user's JWT (`add-query`, `set-own-page`, `score-draft`) and which don't (DataForSEO's postback and the cron functions, which check their own secrets).
7. Auth: set the Site URL to the app's URL and add `https://<app>/auth/callback` and `https://<app>/auth/confirm` to the redirect URLs. Enable Google under Auth providers with a Google OAuth client. Point the magic-link email template at `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.

## Vercel

Import the repository with `web/` as the root directory. Environment variables:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the project's anon key |

The app never needs the service role key or any API key.

## Costs to watch

Every tracked series is captured 8 times a day. `batches.usage` records Claude token usage per batch; compare it with the estimates in `PLAN.md` section 12 after the first week.
