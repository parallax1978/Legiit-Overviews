-- Legiit Overviews: scheduled Edge Functions.
-- pg_cron runs each job inside the database; invoke_function posts to the function through pg_net
-- with the x-cron-secret header. The functions URL and the secret come from Supabase Vault secrets
-- `functions_url` and `cron_secret` (local values in seed.sql; production values are created once
-- with vault.create_secret).

create extension if not exists pg_cron;
create extension if not exists pg_net;

/**
 * Posts an empty JSON body to the named Edge Function and returns the pg_net request id.
 * Raises when the Vault secrets are missing so a misconfigured job shows up as failed in
 * cron.job_run_details instead of silently doing nothing.
 */
create or replace function public.invoke_function(name text)
returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request bigint;
begin
  if $1 is null or $1 !~ '^[a-z0-9][a-z0-9-]*$' then
    raise exception 'invalid function name %', $1 using errcode = '22023';
  end if;

  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'functions_url';
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise exception 'vault secrets functions_url and cron_secret are required to invoke %', $1;
  end if;

  select net.http_post(
    url := rtrim(v_url, '/') || '/' || $1,
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  ) into v_request;
  return v_request;
end;
$$;

revoke all on function public.invoke_function(text) from public, anon, authenticated;
grant execute on function public.invoke_function(text) to service_role;

-- cron.schedule with a job name replaces an existing job of that name, so re-running is safe.
select cron.schedule('schedule-captures', '*/10 * * * *', $$select public.invoke_function('schedule-captures')$$);
select cron.schedule('sweep-captures', '*/30 * * * *', $$select public.invoke_function('sweep-captures')$$);
select cron.schedule('submit-batches', '*/15 * * * *', $$select public.invoke_function('submit-batches')$$);
select cron.schedule('collect-batches', '*/5 * * * *', $$select public.invoke_function('collect-batches')$$);
select cron.schedule('build-reports', '*/15 * * * *', $$select public.invoke_function('build-reports')$$);
select cron.schedule('detect-platform-events', '20 0 * * *', $$select public.invoke_function('detect-platform-events')$$);
select cron.schedule('notify', '*/15 * * * *', $$select public.invoke_function('notify')$$);
