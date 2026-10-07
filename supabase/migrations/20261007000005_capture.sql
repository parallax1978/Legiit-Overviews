-- Capture pipeline helpers. Each runs in one transaction so retries and duplicate deliveries are safe:
--   claim_due_captures      due series -> one pending capture each (latest passed slot), next_capture_at advanced
--   claim_live_capture      the Live capture for add-query, or none when the series is fresh or a capture is in flight
--   mark_capture_submissions  records task_post outcomes for many captures at once
--   ingest_snapshot         snapshot + sections + citations, same_as, capture received, watching -> tracking
--   record_capture_failure  error snapshot at scheduled_at, capture error
--   record_own_match        own_matches row; events and notifications only when the row is new
--   replace_own_matches     recomputed own_matches for a tracked query's history
--   own_match_events        first_seen / regained / brand_mention events and their notifications
-- All are for the service role only.

-- Every distinct passage Google quoted from the page (one reference per passage); `passage` stays the first.
alter table public.citations add column if not exists passages text[] not null default '{}';
update public.citations set passages = array[passage] where passage is not null and passages = '{}';

create or replace function public.claim_due_captures(p_limit int default 500, p_series_ids uuid[] default null)
returns table (capture_id uuid, series_id uuid, keyword text, location_code int, language_code text, device text)
language plpgsql set search_path = ''
as $$
declare
  r record;
  v_slot timestamptz;
  v_capture uuid;
begin
  for r in
    select s.id, s.keyword, s.location_code, s.language_code, s.device, s.next_capture_at
    from public.series s
    where s.next_capture_at <= now()
      and (p_series_ids is null or s.id = any(p_series_ids))
      and exists (select 1 from public.tracked_queries tq where tq.series_id = s.id and tq.status <> 'paused')
    order by s.next_capture_at
    limit p_limit
    for update of s skip locked
  loop
    -- The latest slot that has passed (normally next_capture_at itself); whole 3-hour steps keep
    -- each series on its own offset within the window, and a series that fell behind captures once.
    v_slot := r.next_capture_at
      + floor(extract(epoch from now() - r.next_capture_at) / 10800)::int * interval '3 hours';
    v_capture := null;
    -- submitted_at is the claim time until task_post accepts the capture, so the sweeper (which
    -- resubmits captures pending for 10 minutes) leaves it alone while this run posts it.
    insert into public.captures (series_id, scheduled_at, source, status, submitted_at)
    values (r.id, v_slot, 'scheduled', 'pending', now())
    on conflict on constraint captures_series_id_scheduled_at_key do nothing
    returning id into v_capture;

    update public.series set next_capture_at = v_slot + interval '3 hours' where id = r.id;

    if v_capture is not null then
      capture_id := v_capture;
      series_id := r.id;
      keyword := r.keyword;
      location_code := r.location_code;
      language_code := r.language_code;
      device := r.device;
      return next;
    end if;
  end loop;
end $$;

-- The Live capture add-query runs for a series, or none: no capture when the series has a non-error
-- render from the last 3 hours (fresh) or a capture in flight (pending or submitted, scheduled in the
-- last 3 hours: another add, or a scheduled capture under way), so concurrent adds never pay for a
-- second render. The series row is locked, so adds of one series run one at a time. A series that
-- fell behind (next_capture_at in the past: every tracker was paused) moves to the first slot of its
-- own offset at least 3 hours ahead, so the Live render is not followed minutes later by a catch-up.
create or replace function public.claim_live_capture(p_series_id uuid)
returns table (capture_id uuid, in_flight boolean)
language plpgsql set search_path = ''
as $$
declare
  v_next timestamptz;
  v_id uuid;
begin
  select s.next_capture_at into v_next from public.series s where s.id = p_series_id for update;
  if not found then
    raise exception 'claim_live_capture: series % not found', p_series_id;
  end if;
  if exists (
    select 1 from public.snapshots s
    where s.series_id = p_series_id and s.status <> 'error' and s.captured_at >= now() - interval '3 hours'
  ) then
    return query select null::uuid, false;
    return;
  end if;
  if exists (
    select 1 from public.captures c
    where c.series_id = p_series_id and c.status in ('pending', 'submitted') and c.scheduled_at >= now() - interval '3 hours'
  ) then
    return query select null::uuid, true;
    return;
  end if;

  insert into public.captures (series_id, scheduled_at, source, status, attempts, submitted_at)
  values (p_series_id, date_trunc('second', now()), 'live', 'submitted', 1, now())
  on conflict on constraint captures_series_id_scheduled_at_key do nothing
  returning id into v_id;
  if v_id is null then
    return query select null::uuid, true; -- a capture this very second: whoever made it is capturing
    return;
  end if;
  if v_next <= now() then
    update public.series
    set next_capture_at = v_next + ceil(extract(epoch from (now() + interval '3 hours') - v_next) / 10800) * interval '3 hours'
    where id = p_series_id;
  end if;
  return query select v_id, false;
end $$;

-- p_rows: [{ id, task_id, error }]; a row without error was accepted by DataForSEO.
create or replace function public.mark_capture_submissions(p_rows jsonb)
returns int
language sql set search_path = ''
as $$
  with r as (
    select * from jsonb_to_recordset(p_rows) as x(id uuid, task_id text, error text)
  ), u as (
    update public.captures c set
      attempts = c.attempts + 1,
      task_id = case when r.error is null then r.task_id else c.task_id end,
      status = case when r.error is null then 'submitted' else 'pending' end,
      submitted_at = case when r.error is null then now() else c.submitted_at end,
      last_error = r.error
    from r
    where c.id = r.id and c.status in ('pending', 'submitted')
    returning 1
  )
  select count(*)::int from u;
$$;

create or replace function public.ingest_snapshot(
  p_capture_id uuid,
  p_captured_at timestamptz,
  p_parsed jsonb,
  p_raw_path text
)
returns table (snapshot_id uuid, duplicate boolean)
language plpgsql set search_path = ''
as $$
declare
  v_series uuid;
  v_existing_id uuid;
  v_existing_status text;
  v_id uuid;
  v_same uuid;
  v_status text := p_parsed->>'status';
  v_hash text := nullif(p_parsed->>'content_hash', '');
begin
  if v_status not in ('present', 'absent') then
    raise exception 'ingest_snapshot: bad status %', v_status;
  end if;
  select c.series_id into v_series from public.captures c where c.id = p_capture_id for update;
  if not found then
    raise exception 'ingest_snapshot: capture % not found', p_capture_id;
  end if;

  select s.id, s.status into v_existing_id, v_existing_status from public.snapshots s where s.capture_id = p_capture_id;
  if v_existing_id is not null then
    if v_existing_status <> 'error' then
      return query select v_existing_id, true;
      return;
    end if;
    -- A late result replaces the error snapshot written after the last failed attempt.
    delete from public.snapshots s where s.id = v_existing_id;
  end if;

  -- One writer per series at a time, so two identical captures never both become originals.
  perform pg_advisory_xact_lock(hashtextextended('series:' || v_series::text, 0));
  if v_status = 'present' and v_hash is not null then
    -- The original (same_as null) unless its extraction failed for good; then the earliest copy
    -- that is extracted on its own (reset to pending by fail_extraction), or failing that the
    -- earliest copy still waiting to be reset, so one failed extraction never makes every later
    -- identical render pay for its own and identical renders keep identical claims.
    select s.id into v_same
    from public.snapshots s
    where s.series_id = v_series and s.content_hash = v_hash and s.status = 'present'
      and s.extraction <> 'failed'
    order by (s.same_as is null) desc, (s.extraction <> 'reused') desc, s.captured_at, s.created_at
    limit 1;
  end if;

  insert into public.snapshots (
    series_id, capture_id, captured_at, status, overview_markdown, sentences, content_hash,
    same_as, raw_path, organic, formats, extraction
  ) values (
    v_series, p_capture_id, p_captured_at, v_status, p_parsed->>'markdown',
    coalesce(p_parsed->'sentences', '[]'), v_hash, v_same, p_raw_path,
    coalesce(p_parsed->'organic', '[]'), coalesce(nullif(p_parsed->'formats', 'null'::jsonb), '{}'),
    case when v_status <> 'present' then 'none' when v_same is not null then 'reused' else 'pending' end
  )
  returning id into v_id;

  insert into public.sections (snapshot_id, position, kind, title, text, citation_idx)
  select v_id, (e->>'position')::int, e->>'kind', e->>'title', coalesce(e->>'text', ''),
         coalesce((select array_agg(x::int) from jsonb_array_elements_text(e->'citation_idx') x), '{}')
  from jsonb_array_elements(coalesce(p_parsed->'sections', '[]')) e;

  insert into public.citations (snapshot_id, idx, url, url_key, host, reg_domain, title, source, passage, passages)
  select v_id, (e->>'idx')::int, e->>'url', e->>'url_key', e->>'host', e->>'reg_domain',
         e->>'title', e->>'source', e->>'passage',
         coalesce(
           (select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(e->'passages') = 'array' then e->'passages' else '[]'::jsonb end) x),
           case when e->>'passage' is null then '{}'::text[] else array[e->>'passage'] end)
  from jsonb_array_elements(coalesce(p_parsed->'citations', '[]')) e;

  update public.captures c
  set status = 'received', received_at = now(), last_error = null
  where c.id = p_capture_id;

  if v_status = 'present' then
    update public.tracked_queries tq set status = 'tracking'
    where tq.series_id = v_series and tq.status = 'watching';
  end if;

  return query select v_id, false;
end $$;

create or replace function public.record_capture_failure(p_capture_id uuid, p_message text)
returns uuid
language plpgsql set search_path = ''
as $$
declare
  v_series uuid;
  v_scheduled timestamptz;
  v_id uuid;
begin
  select c.series_id, c.scheduled_at into v_series, v_scheduled from public.captures c where c.id = p_capture_id for update;
  if not found then
    raise exception 'record_capture_failure: capture % not found', p_capture_id;
  end if;
  select s.id into v_id from public.snapshots s where s.capture_id = p_capture_id;
  if v_id is not null then
    return v_id; -- already received (or already failed): keep what is there
  end if;
  insert into public.snapshots (series_id, capture_id, captured_at, status, extraction)
  values (v_series, p_capture_id, v_scheduled, 'error', 'none')
  returning id into v_id;
  update public.captures c set status = 'error', last_error = p_message where c.id = p_capture_id;
  return v_id;
end $$;

-- Events and notifications for one match. Callers decide the match is new; this decides which events
-- it is: first_seen (none yet), regained (latest citation event is lost, from before this capture),
-- brand_mention (none yet). Events are timed at the render (the snapshot's captured_at) unless p_at is given.
create or replace function public.own_match_events(
  p_tracked_query_id uuid,
  p_snapshot_id uuid,
  p_level text,
  p_quoted_heading text,
  p_brand_name text,
  p_allow_regained boolean default true,
  p_at timestamptz default null
)
returns text[]
language plpgsql set search_path = ''
as $$
declare
  v_user uuid;
  v_keyword text;
  v_last_kind text;
  v_last_at timestamptz;
  v_captured timestamptz;
  v_at timestamptz;
  v_kind text;
  v_level text;
  v_events text[] := '{}';
  v_link text := '/queries/' || p_tracked_query_id || '/tracking';
begin
  perform pg_advisory_xact_lock(hashtextextended('own_match:' || p_tracked_query_id::text, 0));
  select tq.user_id, tq.display_keyword into v_user, v_keyword from public.tracked_queries tq where tq.id = p_tracked_query_id;
  if not found then
    return v_events;
  end if;

  select s.captured_at into v_captured from public.snapshots s where s.id = p_snapshot_id;
  v_at := coalesce(p_at, v_captured, now());

  if p_level is not null then
    select e.kind, e.created_at into v_last_kind, v_last_at
    from public.citation_events e
    where e.tracked_query_id = p_tracked_query_id and e.kind in ('first_seen', 'lost', 'regained')
    order by e.created_at desc, e.id desc
    limit 1;
    if not exists (
      select 1 from public.citation_events e where e.tracked_query_id = p_tracked_query_id and e.kind = 'first_seen'
    ) then
      v_kind := 'first_seen';
    elsif p_allow_regained and v_last_kind = 'lost' and v_captured > v_last_at then
      v_kind := 'regained';
    end if;

    if v_kind is not null then
      v_level := replace(replace(p_level, '_url', ' URL'), '_', ' ');
      insert into public.citation_events (tracked_query_id, snapshot_id, kind, level, quoted_heading, created_at)
      values (p_tracked_query_id, p_snapshot_id, v_kind, p_level, p_quoted_heading, v_at);
      insert into public.notifications (user_id, tracked_query_id, kind, title, body, link)
      values (
        v_user, p_tracked_query_id, v_kind,
        case v_kind when 'first_seen' then 'Cited: ' else 'Cited again: ' end || v_keyword,
        'Google''s AI Overview cited your page'
          || case v_kind when 'regained' then ' again' else '' end
          || ' (' || v_level || ')'
          || coalesce(' under “' || p_quoted_heading || '”', '') || '.',
        v_link
      );
      v_events := v_events || v_kind;
    end if;
  end if;

  if p_brand_name is not null and not exists (
    select 1 from public.citation_events e where e.tracked_query_id = p_tracked_query_id and e.kind = 'brand_mention'
  ) then
    insert into public.citation_events (tracked_query_id, snapshot_id, kind, created_at)
    values (p_tracked_query_id, p_snapshot_id, 'brand_mention', v_at);
    v_events := v_events || 'brand_mention'::text;
    -- notifications.kind does not list 'brand_mention' yet; the notification is skipped until it does.
    begin
      insert into public.notifications (user_id, tracked_query_id, kind, title, body, link)
      values (
        v_user, p_tracked_query_id, 'brand_mention', 'Brand mentioned: ' || v_keyword,
        'Google''s AI Overview mentioned ' || p_brand_name || '.', v_link
      );
    exception when check_violation then
      null;
    end;
  end if;

  return v_events;
end $$;

-- Writes one own_matches row. Returns the events created: none when the row already existed, so a
-- re-delivered capture never duplicates events or notifications.
create or replace function public.record_own_match(
  p_tracked_query_id uuid,
  p_snapshot_id uuid,
  p_level text,
  p_brand_mentioned boolean,
  p_citation_idx int,
  p_quoted_heading text,
  p_brand_name text default null
)
returns text[]
language plpgsql set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('own_match:' || p_tracked_query_id::text, 0));
  insert into public.own_matches (tracked_query_id, snapshot_id, level, brand_mentioned, citation_idx, quoted_heading)
  values (p_tracked_query_id, p_snapshot_id, p_level, p_brand_mentioned, p_citation_idx, p_quoted_heading)
  on conflict (tracked_query_id, snapshot_id) do nothing;
  if not found then
    update public.own_matches m
    set level = p_level, brand_mentioned = p_brand_mentioned, citation_idx = p_citation_idx, quoted_heading = p_quoted_heading
    where m.tracked_query_id = p_tracked_query_id and m.snapshot_id = p_snapshot_id;
    return '{}';
  end if;
  if p_level is null and not p_brand_mentioned then
    return '{}';
  end if;
  return public.own_match_events(
    p_tracked_query_id, p_snapshot_id, p_level, p_quoted_heading,
    case when p_brand_mentioned then coalesce(p_brand_name, 'your brand') end
  );
end $$;

-- Replaces the tracked query's own_matches for the given snapshots with p_rows
-- ([{ snapshot_id, level, brand_mentioned, citation_idx, quoted_heading }]). No events.
create or replace function public.replace_own_matches(p_tracked_query_id uuid, p_snapshot_ids uuid[], p_rows jsonb)
returns int
language plpgsql set search_path = ''
as $$
declare
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtextextended('own_match:' || p_tracked_query_id::text, 0));
  delete from public.own_matches m
  where m.tracked_query_id = p_tracked_query_id and m.snapshot_id = any(p_snapshot_ids);
  insert into public.own_matches (tracked_query_id, snapshot_id, level, brand_mentioned, citation_idx, quoted_heading)
  select p_tracked_query_id, r.snapshot_id, r.level, coalesce(r.brand_mentioned, false), r.citation_idx, r.quoted_heading
  from jsonb_to_recordset(p_rows) as r(snapshot_id uuid, level text, brand_mentioned boolean, citation_idx int, quoted_heading text)
  join public.snapshots s on s.id = r.snapshot_id
  on conflict (tracked_query_id, snapshot_id) do update
    set level = excluded.level, brand_mentioned = excluded.brand_mentioned,
        citation_idx = excluded.citation_idx, quoted_heading = excluded.quoted_heading;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.claim_due_captures(int, uuid[]) from public, anon, authenticated;
revoke all on function public.claim_live_capture(uuid) from public, anon, authenticated;
revoke all on function public.mark_capture_submissions(jsonb) from public, anon, authenticated;
revoke all on function public.ingest_snapshot(uuid, timestamptz, jsonb, text) from public, anon, authenticated;
revoke all on function public.record_capture_failure(uuid, text) from public, anon, authenticated;
revoke all on function public.own_match_events(uuid, uuid, text, text, text, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.record_own_match(uuid, uuid, text, boolean, int, text, text) from public, anon, authenticated;
revoke all on function public.replace_own_matches(uuid, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.claim_due_captures(int, uuid[]) to service_role;
grant execute on function public.claim_live_capture(uuid) to service_role;
grant execute on function public.mark_capture_submissions(jsonb) to service_role;
grant execute on function public.ingest_snapshot(uuid, timestamptz, jsonb, text) to service_role;
grant execute on function public.record_capture_failure(uuid, text) to service_role;
grant execute on function public.own_match_events(uuid, uuid, text, text, text, boolean, timestamptz) to service_role;
grant execute on function public.record_own_match(uuid, uuid, text, boolean, int, text, text) to service_role;
grant execute on function public.replace_own_matches(uuid, uuid[], jsonb) to service_role;
