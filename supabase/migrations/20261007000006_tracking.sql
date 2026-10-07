-- Tracking fixes: citation events scoped to the own URL, lost alerts that are released after being
-- held, matching while paused, a bounded brand list, and the daily loss check in one place.
--   citation_events.own_url_key   the page an event was about, so a new URL starts with a clean history
--   platform_daily.pairs          the (series, domain) pairs behind domain_turnover, for its noise floor
--   brand_names_ok                at most 10 brand names of 2 to 60 trimmed characters (check constraint)
--   citation_losses               queries whose page is out at p_ref: new losses and held ones to release
--                                 (replaces lost_candidates from 0002)
--   platform_event_notifications  one notification per user with an active query, in SQL (no row cap)
--   own_match_events              events scoped to the own URL; history citations dated, with their loss
--   record_own_match              matches recorded while paused, without events or notifications
--   tracking_summary              the latest citation comes from the 28-day window like the rest
--   compute_platform_daily        records pairs
-- citation_losses and platform_event_notifications are for the service role only.

-- ---------------------------------------------------------------- tables

alter table public.citation_events add column if not exists own_url_key text;
-- Events recorded before the column existed were about the URL tracked at the time.
update public.citation_events e set own_url_key = tq.own_url_key
from public.tracked_queries tq
where tq.id = e.tracked_query_id and e.kind <> 'brand_mention' and e.own_url_key is null;

alter table public.platform_daily add column if not exists pairs int;

-- Matching runs for every tracked query of a series, paused ones included.
create index if not exists tracked_queries_series_all_idx on public.tracked_queries (series_id);

-- Brand names are matched against every overview of the series, so the list is bounded even when
-- written directly through the column grant: at most 10, each 2 to 60 characters with no outer spaces.
create or replace function public.brand_names_ok(p_names text[])
returns boolean
language sql immutable set search_path = ''
as $$
  select coalesce(cardinality(p_names), 0) <= 10
    and not exists (
      select 1 from unnest(p_names) b
      where b is null or b <> btrim(b) or length(b) < 2 or length(b) > 60
    )
$$;

alter table public.tracked_queries drop constraint if exists tracked_queries_brand_names_check;
alter table public.tracked_queries add constraint tracked_queries_brand_names_check
  check (public.brand_names_ok(brand_names));

-- ---------------------------------------------------------------- losses

drop function if exists public.lost_candidates(timestamptz, uuid[]);

/**
 * Tracked queries (optionally limited to p_tracked_query_ids) whose page is out at p_ref: an own URL,
 * the latest first_seen / regained / lost event for that URL is first_seen or regained (a new loss,
 * held_event_id null) or a lost held for a platform event (to release once a quiet day has passed),
 * and at least one present render since p_ref - 48h has been matched and none of them cites the page.
 * Only matched renders count, so a render without an own_matches row never reads as a loss; renders
 * after p_ref count too, so a citation ingested before the check runs stops it.
 */
create or replace function public.citation_losses(p_ref timestamptz, p_tracked_query_ids uuid[] default null)
returns table (
  tracked_query_id uuid, user_id uuid, display_keyword text, own_url_key text,
  latest_snapshot_id uuid, present_renders int, held_event_id uuid
)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.user_id, q.display_keyword, q.own_url_key, w.latest_id, w.present::int,
         case when last_event.kind = 'lost' then last_event.id end
  from public.tracked_queries q
  cross join lateral (
    select e.id, e.kind, e.held_for_platform_event as held from public.citation_events e
    where e.tracked_query_id = q.id and e.kind in ('first_seen', 'regained', 'lost')
      and e.own_url_key is not distinct from q.own_url_key
    order by e.created_at desc, e.id desc limit 1
  ) last_event
  cross join lateral (
    select count(*) as present,
           count(m.level) as cited,
           (array_agg(s.id order by s.captured_at desc))[1] as latest_id
    from public.snapshots s
    join public.own_matches m on m.snapshot_id = s.id and m.tracked_query_id = q.id
    where s.series_id = q.series_id and s.status = 'present'
      and s.captured_at >= p_ref - interval '48 hours'
  ) w
  where q.own_url is not null and q.status <> 'paused'
    and (p_tracked_query_ids is null or q.id = any(p_tracked_query_ids))
    and (last_event.kind in ('first_seen', 'regained') or (last_event.kind = 'lost' and last_event.held))
    and w.present > 0 and w.cited = 0
  order by q.id
$$;

/** One platform_event notification per user with a non-paused tracked query (optionally limited). */
create or replace function public.platform_event_notifications(p_title text, p_body text, p_tracked_query_ids uuid[] default null)
returns int
language sql set search_path = ''
as $$
  with ins as (
    insert into public.notifications (user_id, kind, title, body, link)
    select distinct tq.user_id, 'platform_event', p_title, p_body, '/queries'
    from public.tracked_queries tq
    where tq.status <> 'paused' and (p_tracked_query_ids is null or tq.id = any(p_tracked_query_ids))
    returning 1
  )
  select count(*)::int from ins
$$;

-- ---------------------------------------------------------------- events

-- Events and notifications for one match. Callers decide the match is new; this decides which events
-- it is: first_seen (none yet for the page), regained (the page's latest citation event is lost, from
-- before this capture), brand_mention (none yet). Citation events carry the own URL key they were
-- about, so a new URL starts with a clean history. Events are timed at the render (the snapshot's
-- captured_at) unless p_at is given: then the citation is history (re-matching after the URL was set),
-- the notification says when the page was cited, and when no matched present render of the last 48
-- hours cites it any more the loss is recorded at once, without a notification of its own, so the
-- nightly check does not report it again.
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
  v_key text;
  v_last_kind text;
  v_last_at timestamptz;
  v_captured timestamptz;
  v_at timestamptz;
  v_kind text;
  v_level text;
  v_when text := '';
  v_body text;
  v_lost_snapshot uuid;
  v_lost_at timestamptz;
  v_events text[] := '{}';
  v_link text := '/queries/' || p_tracked_query_id || '/tracking';
begin
  perform pg_advisory_xact_lock(hashtextextended('own_match:' || p_tracked_query_id::text, 0));
  select tq.user_id, tq.display_keyword, tq.own_url_key into v_user, v_keyword, v_key
  from public.tracked_queries tq where tq.id = p_tracked_query_id;
  if not found then
    return v_events;
  end if;

  select s.captured_at into v_captured from public.snapshots s where s.id = p_snapshot_id;
  v_at := coalesce(p_at, v_captured, now());
  if p_at is not null then
    v_when := ' on ' || to_char(v_at at time zone 'UTC', 'Mon FMDD');
  end if;

  if p_level is not null then
    select e.kind, e.created_at into v_last_kind, v_last_at
    from public.citation_events e
    where e.tracked_query_id = p_tracked_query_id and e.kind in ('first_seen', 'lost', 'regained')
      and e.own_url_key is not distinct from v_key
    order by e.created_at desc, e.id desc
    limit 1;
    if not exists (
      select 1 from public.citation_events e
      where e.tracked_query_id = p_tracked_query_id and e.kind = 'first_seen'
        and e.own_url_key is not distinct from v_key
    ) then
      v_kind := 'first_seen';
    elsif p_allow_regained and v_last_kind = 'lost' and v_captured > v_last_at then
      v_kind := 'regained';
    end if;

    if v_kind is not null then
      v_level := replace(replace(p_level, '_url', ' URL'), '_', ' ');
      insert into public.citation_events (tracked_query_id, snapshot_id, kind, level, quoted_heading, own_url_key, created_at)
      values (p_tracked_query_id, p_snapshot_id, v_kind, p_level, p_quoted_heading, v_key, v_at);
      v_events := v_events || v_kind;
      v_body := 'Google''s AI Overview cited your page'
        || case v_kind when 'regained' then ' again' else '' end
        || v_when
        || ' (' || v_level || ')'
        || coalesce(' under “' || p_quoted_heading || '”', '') || '.';

      if p_at is not null and v_kind = 'first_seen' then
        select c.latest_snapshot_id into v_lost_snapshot
        from public.citation_losses(now(), array[p_tracked_query_id]) c;
        if v_lost_snapshot is not null then
          select s.captured_at into v_lost_at from public.snapshots s where s.id = v_lost_snapshot;
          insert into public.citation_events (tracked_query_id, snapshot_id, kind, own_url_key, created_at)
          values (p_tracked_query_id, v_lost_snapshot, 'lost', v_key, greatest(v_lost_at, v_at));
          v_events := v_events || 'lost'::text;
          v_body := v_body || ' None of the AI Overviews captured in the last 2 days cite it. We''ll tell you if it comes back.';
        end if;
      end if;

      insert into public.notifications (user_id, tracked_query_id, kind, title, body, link)
      values (
        v_user, p_tracked_query_id, v_kind,
        case v_kind when 'first_seen' then 'Cited' else 'Cited again' end || v_when || ': ' || v_keyword,
        v_body,
        v_link
      );
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
        v_user, p_tracked_query_id, 'brand_mention', 'Brand mentioned' || v_when || ': ' || v_keyword,
        'Google''s AI Overview mentioned ' || p_brand_name || v_when || '.', v_link
      );
    exception when check_violation then
      null;
    end;
  end if;

  return v_events;
end $$;

-- Writes one own_matches row. Returns the events created: none when the row already existed, so a
-- re-delivered capture never duplicates events or notifications, and none while the query is paused
-- (the match is still recorded, so the history is complete when tracking resumes).
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
declare
  v_status text;
begin
  perform pg_advisory_xact_lock(hashtextextended('own_match:' || p_tracked_query_id::text, 0));
  select tq.status into v_status from public.tracked_queries tq where tq.id = p_tracked_query_id;
  if not found then
    return '{}';
  end if;
  insert into public.own_matches (tracked_query_id, snapshot_id, level, brand_mentioned, citation_idx, quoted_heading)
  values (p_tracked_query_id, p_snapshot_id, p_level, p_brand_mentioned, p_citation_idx, p_quoted_heading)
  on conflict (tracked_query_id, snapshot_id) do nothing;
  if not found then
    update public.own_matches m
    set level = p_level, brand_mentioned = p_brand_mentioned, citation_idx = p_citation_idx, quoted_heading = p_quoted_heading
    where m.tracked_query_id = p_tracked_query_id and m.snapshot_id = p_snapshot_id;
    return '{}';
  end if;
  if v_status = 'paused' or (p_level is null and not p_brand_mentioned) then
    return '{}';
  end if;
  return public.own_match_events(
    p_tracked_query_id, p_snapshot_id, p_level, p_quoted_heading,
    case when p_brand_mentioned then coalesce(p_brand_name, 'your brand') end
  );
end $$;

-- ---------------------------------------------------------------- tracking_summary

/**
 * Own-page tracking for one tracked query: 7- and 28-day survival (renders citing the page over
 * renders with an overview), brand mentions, the latest citation of the last 28 days and a daily
 * strip for the last 28 UTC days (from the first day with a capture).
 */
create or replace function public.tracking_summary(p_tracked_query_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' set timezone = 'UTC'
as $$
declare
  v_tq public.tracked_queries;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'UTC')::date;
  v_result jsonb;
begin
  perform public.assert_tracked_query_access(p_tracked_query_id);

  select * into v_tq from public.tracked_queries where id = p_tracked_query_id;
  if not found then
    return null;
  end if;

  with
  s28 as materialized (
    select s.id, s.captured_at, s.status, (s.captured_at at time zone 'UTC')::date as day,
           m.level, coalesce(m.brand_mentioned, false) as brand, m.quoted_heading
    from public.snapshots s
    left join public.own_matches m on m.snapshot_id = s.id and m.tracked_query_id = p_tracked_query_id
    where s.series_id = v_tq.series_id and s.captured_at >= v_now - interval '28 days'
  ),
  w as (
    select
      count(*) filter (where status <> 'error' and captured_at >= v_now - interval '7 days') as renders_7d,
      count(*) filter (where status = 'present' and captured_at >= v_now - interval '7 days') as present_7d,
      count(*) filter (where status = 'present' and level is not null and captured_at >= v_now - interval '7 days') as cited_7d,
      count(*) filter (where status = 'present' and brand and captured_at >= v_now - interval '7 days') as brand_7d,
      count(*) filter (where status <> 'error') as renders_28d,
      count(*) filter (where status = 'present') as present_28d,
      count(*) filter (where status = 'present' and level is not null) as cited_28d
    from s28
  ),
  days as (
    select g::date as day
    from generate_series(
      greatest(v_today - 27, coalesce((select min(day) from s28), v_today)),
      v_today, interval '1 day') g
  ),
  daily as (
    select d.day,
           count(s.id) filter (where s.status <> 'error') as renders,
           count(s.id) filter (where s.status = 'present') as present,
           count(s.id) filter (where s.status = 'present' and s.level is not null) as cited,
           (array_agg(s.level order by public.match_level_rank(s.level)) filter (where s.level is not null))[1] as best_level,
           count(s.id) filter (where s.status = 'present' and s.brand) as brand
    from days d left join s28 s on s.day = d.day
    group by d.day
  )
  select jsonb_build_object(
    'own_url', v_tq.own_url,
    'brand_names', to_jsonb(v_tq.brand_names),
    'renders_7d', w.renders_7d,
    'present_7d', w.present_7d,
    'cited_7d', w.cited_7d,
    'survival_7d', case when w.present_7d > 0 then round(w.cited_7d::numeric / w.present_7d, 4) end,
    'renders_28d', w.renders_28d,
    'present_28d', w.present_28d,
    'cited_28d', w.cited_28d,
    'survival_28d', case when w.present_28d > 0 then round(w.cited_28d::numeric / w.present_28d, 4) end,
    'brand_7d', w.brand_7d,
    'latest', (
      select jsonb_build_object('captured_at', s.captured_at, 'level', s.level, 'quoted_heading', s.quoted_heading)
      from s28 s
      where s.level is not null
      order by s.captured_at desc limit 1
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
          'day', to_char(d.day::timestamp, 'YYYY-MM-DD'), 'renders', d.renders, 'present', d.present,
          'cited', d.cited, 'best_level', d.best_level, 'brand', d.brand
        ) order by d.day)
      from daily d
    ), '[]'::jsonb)
  )
  into v_result
  from w;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------- compute_platform_daily

/**
 * Platform-wide metrics for one UTC day across every series, upserted into platform_daily.
 * domain_turnover is over (series, cited domain) pairs of series that had an overview in the prior
 * 7 days: the share of the day's pairs not cited by that series in the prior 7 days, so new series
 * do not read as turnover. pairs is how many pairs that share is over.
 */
create or replace function public.compute_platform_daily(p_day date)
returns jsonb
language plpgsql volatile security definer set search_path = '' set timezone = 'UTC'
as $$
declare
  v_from timestamptz := (p_day::timestamp at time zone 'UTC');
  v_to timestamptz := (p_day::timestamp at time zone 'UTC') + interval '1 day';
  v_row public.platform_daily;
begin
  with
  day_snaps as materialized (
    select s.id, s.series_id, s.status from public.snapshots s
    where s.captured_at >= v_from and s.captured_at < v_to and s.status <> 'error'
  ),
  day_cit as materialized (
    select distinct d.id as snapshot_id, d.series_id, ci.url_key, ci.reg_domain
    from day_snaps d join public.citations ci on ci.snapshot_id = d.id
    where d.status = 'present'
  ),
  prior_pairs as materialized (
    select distinct s.series_id, ci.reg_domain
    from public.snapshots s join public.citations ci on ci.snapshot_id = s.id
    where s.captured_at >= v_from - interval '7 days' and s.captured_at < v_from and s.status = 'present'
  ),
  prior_series as (
    select distinct s.series_id from public.snapshots s
    where s.captured_at >= v_from - interval '7 days' and s.captured_at < v_from and s.status = 'present'
  ),
  day_pairs as (
    select distinct dc.series_id, dc.reg_domain from day_cit dc
    where dc.series_id in (select series_id from prior_series)
  ),
  agg as (
    select
      (select count(distinct series_id) from day_snaps) as series_count,
      (select count(*) from day_snaps) as renders,
      (select count(*) from day_snaps where status = 'present') as present,
      (select count(*) from (select distinct snapshot_id, url_key from day_cit) x) as cited,
      (select count(*) from day_pairs) as pairs,
      (select count(*) from day_pairs dp
        where not exists (select 1 from prior_pairs pp where pp.series_id = dp.series_id and pp.reg_domain = dp.reg_domain)) as new_pairs
  )
  insert into public.platform_daily (day, series_count, renders, presence_rate, citations_per_render, domain_turnover, pairs)
  select p_day, a.series_count, a.renders,
    case when a.renders > 0 then round(a.present::numeric / a.renders, 4) end,
    case when a.present > 0 then round(a.cited::numeric / a.present, 4) end,
    case when a.pairs > 0 then round(a.new_pairs::numeric / a.pairs, 4) end,
    a.pairs
  from agg a
  on conflict (day) do update set
    series_count = excluded.series_count,
    renders = excluded.renders,
    presence_rate = excluded.presence_rate,
    citations_per_render = excluded.citations_per_render,
    domain_turnover = excluded.domain_turnover,
    pairs = excluded.pairs
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

-- ---------------------------------------------------------------- grants

revoke all on function public.citation_losses(timestamptz, uuid[]) from public, anon, authenticated;
revoke all on function public.platform_event_notifications(text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.citation_losses(timestamptz, uuid[]) to service_role;
grant execute on function public.platform_event_notifications(text, text, uuid[]) to service_role;
