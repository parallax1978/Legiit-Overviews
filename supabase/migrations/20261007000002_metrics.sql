-- Legiit Overviews: metrics and app RPCs.
-- Every count the app shows comes from these functions, computed from snapshot rows over a window
-- [p_from, p_to). Claude never counts. Callers: the app (authenticated users, for series they track)
-- and Edge Functions (service role). Each function checks access explicitly at the top because it
-- runs as security definer and bypasses row-level security.

-- ---------------------------------------------------------------- indexes

-- Cross-series scans by time (platform metrics, digests).
create index if not exists snapshots_captured_at_idx on public.snapshots (captured_at);
-- Evidence lookups by domain within a series window go through the snapshot; url_key and
-- reg_domain already have indexes in the core schema.
create index if not exists own_matches_snapshot_idx on public.own_matches (snapshot_id);
create index if not exists draft_scores_tq_idx on public.draft_scores (tracked_query_id, created_at desc);
create index if not exists reports_tq_idx on public.reports (tracked_query_id, created_at desc);
create index if not exists notifications_kind_idx on public.notifications (user_id, kind, created_at desc);
create index if not exists notifications_unemailed_idx on public.notifications (created_at) where emailed_at is null;
-- One preliminary and one full report per tracked query; refreshes repeat every 28 days.
create unique index if not exists reports_one_per_kind_idx on public.reports (tracked_query_id, kind)
  where kind in ('preliminary', 'full');

-- ---------------------------------------------------------------- helpers

/** Raises 42501 unless the caller is the service role or tracks the series. */
create or replace function public.assert_series_access(p_series_id uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.user_tracks_series(p_series_id) then
    return;
  end if;
  raise exception 'not allowed' using errcode = '42501';
end;
$$;

/** Raises 42501 unless the caller is the service role or owns the tracked query. */
create or replace function public.assert_tracked_query_access(p_tq_id uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.user_owns_tracked_query(p_tq_id) then
    return;
  end if;
  raise exception 'not allowed' using errcode = '42501';
end;
$$;

/** Survival bucket for a share: core >= 0.8, recurring >= 0.4, rotating below. */
create or replace function public.metric_bucket(p_share numeric)
returns text
language sql immutable set search_path = ''
as $$
  select case when p_share >= 0.8 then 'core' when p_share >= 0.4 then 'recurring' else 'rotating' end
$$;

/** Rank of an own-page match level, 1 = best. Null levels rank last. */
create or replace function public.match_level_rank(p_level text)
returns int
language sql immutable set search_path = ''
as $$
  select case p_level when 'exact_url' then 1 when 'path_prefix' then 2 when 'same_host' then 3
    when 'same_domain' then 4 else 5 end
$$;

/** The {i, text, citations} sentences of a snapshot whose index is in p_idx. */
create or replace function public.snapshot_sentences(p_sentences jsonb, p_idx int[])
returns jsonb
language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'i', (e->>'i')::int,
      'text', e->>'text',
      'citations', coalesce(e->'citations', '[]'::jsonb)
    ) order by (e->>'i')::int), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_sentences) = 'array' then p_sentences else '[]'::jsonb end) e
  where (e->>'i')::int = any(p_idx)
$$;

/** Indexes of the sentences of a snapshot that carry any of the citation indexes in p_citations. */
create or replace function public.sentences_citing(p_sentences jsonb, p_citations int[])
returns int[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg((e->>'i')::int), '{}')
  from jsonb_array_elements(case when jsonb_typeof(p_sentences) = 'array' then p_sentences else '[]'::jsonb end) e
  where exists (
    select 1 from jsonb_array_elements_text(
      case when jsonb_typeof(e->'citations') = 'array' then e->'citations' else '[]'::jsonb end) c
    where c::int = any(p_citations)
  )
$$;

-- ---------------------------------------------------------------- series_metrics

/**
 * SeriesMetrics (supabase/functions/_shared/types.ts) for one series over [p_from, p_to).
 * renders = present + absent snapshots; error snapshots are counted separately and excluded from
 * every rate. Shares are over present renders. Rates with a zero denominator are null.
 */
create or replace function public.series_metrics(p_series_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = '' set timezone = 'UTC'
as $$
declare
  v_result jsonb;
begin
  perform public.assert_series_access(p_series_id);

  with
  snaps as materialized (
    select s.id, s.captured_at, s.status, s.content_hash, s.organic, s.formats,
           (s.captured_at at time zone 'UTC')::date as day
    from public.snapshots s
    where s.series_id = p_series_id and s.captured_at >= p_from and s.captured_at < p_to
  ),
  counts as (
    select count(*) filter (where status <> 'error') as renders,
           count(*) filter (where status = 'present') as present,
           count(*) filter (where status = 'error') as errors,
           count(distinct day) filter (where status <> 'error') as days
    from snaps
  ),
  pres as materialized (
    select id, captured_at, day, organic, formats from snaps where status = 'present'
  ),
  -- change rate: consecutive non-error renders whose content differs; absent is its own state
  states as (
    select case when status = 'absent' then 'absent' else coalesce(content_hash, 'present:' || id::text) end as state,
           captured_at, id
    from snaps where status <> 'error'
  ),
  changes as (
    select count(*) filter (where prev is not null and prev <> state) as changed
    from (select state, lag(state) over (order by captured_at, id) as prev from states) x
  ),
  -- claims of live groups on present renders
  cl as materialized (
    select c.group_id, g.label, c.snapshot_id, c.type, c.citation_idx, p.captured_at, p.day
    from pres p
    join public.claims c on c.snapshot_id = p.id
    join public.claim_groups g on g.id = c.group_id and g.merged_into is null
  ),
  claim_stats as materialized (
    select group_id, label,
           count(distinct snapshot_id) as renders,
           min(captured_at) as first_seen,
           max(captured_at) as last_seen,
           count(*) filter (where cardinality(citation_idx) > 0)::numeric / count(*) as cited_share,
           array_agg(distinct type order by type) as types
    from cl group by group_id, label
  ),
  -- entity mentions of live entities on present renders
  em as materialized (
    select m.entity_id, e.name, m.snapshot_id, m.role, nullif(btrim(m.label), '') as label, p.day
    from pres p
    join public.entity_mentions m on m.snapshot_id = p.id
    join public.entities e on e.id = m.entity_id and e.merged_into is null
  ),
  entity_stats as (
    select entity_id, name,
           count(distinct snapshot_id) as renders,
           count(distinct snapshot_id) filter (where role = 'recommended') as recommended,
           coalesce((array_agg(distinct label order by label) filter (where label is not null))[1:10], '{}') as labels
    from em group by entity_id, name
  ),
  -- one row per (present render, cited url_key)
  cit as materialized (
    select distinct on (ci.snapshot_id, ci.url_key)
           ci.snapshot_id, ci.url_key, ci.reg_domain, ci.url, ci.title, p.captured_at, p.day
    from pres p
    join public.citations ci on ci.snapshot_id = p.id
    order by ci.snapshot_id, ci.url_key, ci.idx
  ),
  org as materialized (
    select p.id as snapshot_id, o.url_key, min(o.rank) as rank
    from pres p
    cross join lateral jsonb_to_recordset(
      case when jsonb_typeof(p.organic) = 'array' then p.organic else '[]'::jsonb end
    ) as o(rank numeric, url_key text)
    where o.url_key is not null and o.rank is not null
    group by p.id, o.url_key
  ),
  cit_org as materialized (
    select cit.*, org.rank
    from cit left join org on org.snapshot_id = cit.snapshot_id and org.url_key = cit.url_key
  ),
  source_stats as (
    select url_key,
           count(*) as renders,
           (array_agg(url order by captured_at desc))[1] as url,
           (array_agg(reg_domain order by captured_at desc))[1] as reg_domain,
           (array_agg(title order by captured_at desc) filter (where title is not null))[1] as title,
           count(*) filter (where rank <= 10) as top10
    from cit_org group by url_key
  ),
  dom as materialized (
    select distinct snapshot_id, reg_domain, day from cit
  ),
  domain_stats as (
    select reg_domain, count(*) as renders from dom group by reg_domain
  ),
  -- citation stability: mean pairwise Jaccard over present renders (two empty sets count as identical)
  url_sets as materialized (
    select snapshot_id, count(*) as n from cit group by snapshot_id
  ),
  url_pairs as (
    select a.snapshot_id as sa, b.snapshot_id as sb, count(*) as inter
    from cit a join cit b on a.url_key = b.url_key and a.snapshot_id < b.snapshot_id
    group by a.snapshot_id, b.snapshot_id
  ),
  url_jaccard as (
    select coalesce(sum(p.inter::numeric / (na.n + nb.n - p.inter)), 0) as total
    from url_pairs p
    join url_sets na on na.snapshot_id = p.sa
    join url_sets nb on nb.snapshot_id = p.sb
  ),
  dom_sets as materialized (
    select snapshot_id, count(*) as n from dom group by snapshot_id
  ),
  dom_pairs as (
    select a.snapshot_id as sa, b.snapshot_id as sb, count(*) as inter
    from dom a join dom b on a.reg_domain = b.reg_domain and a.snapshot_id < b.snapshot_id
    group by a.snapshot_id, b.snapshot_id
  ),
  dom_jaccard as (
    select coalesce(sum(p.inter::numeric / (na.n + nb.n - p.inter)), 0) as total
    from dom_pairs p
    join dom_sets na on na.snapshot_id = p.sa
    join dom_sets nb on nb.snapshot_id = p.sb
  ),
  overlap as (
    select count(*) as occurrences,
           count(*) filter (where rank <= 10) as top10,
           count(*) filter (where rank <= 20) as top20
    from cit_org
  ),
  word_counts as (
    select percentile_cont(0.5) within group (order by (formats->>'word_count')::numeric) as median
    from pres where jsonb_typeof(formats->'word_count') = 'number'
  ),
  fmt as (
    select l.label, count(distinct p.id) as renders
    from pres p
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(p.formats->'labels') = 'array' then p.formats->'labels' else '[]'::jsonb end
    ) as l(label)
    group by l.label
  ),
  -- day-to-day differences against the previous day in the window that had renders
  day_counts as materialized (
    select day, count(*) filter (where status <> 'error') as renders,
           count(*) filter (where status = 'present') as present
    from snaps group by day
  ),
  day_prev as (
    select d.day, d.renders, d.present,
           (select max(d2.day) from day_counts d2 where d2.day < d.day and d2.renders > 0) as prev
    from day_counts d
  ),
  day_claims as materialized (select distinct day, group_id, label from cl),
  day_entities as materialized (select distinct day, entity_id, name from em),
  day_urls as materialized (select distinct day, url_key, reg_domain from cit),
  daily as (
    select d.day, d.renders, d.present,
      case when d.renders > 0 and d.prev is not null then (
        select coalesce(jsonb_agg(jsonb_build_object('group_id', a.group_id, 'label', a.label) order by a.label, a.group_id), '[]'::jsonb)
        from day_claims a where a.day = d.day
          and not exists (select 1 from day_claims b where b.day = d.prev and b.group_id = a.group_id)
      ) else '[]'::jsonb end as claims_added,
      case when d.renders > 0 and d.prev is not null then (
        select coalesce(jsonb_agg(jsonb_build_object('group_id', a.group_id, 'label', a.label) order by a.label, a.group_id), '[]'::jsonb)
        from day_claims a where a.day = d.prev
          and not exists (select 1 from day_claims b where b.day = d.day and b.group_id = a.group_id)
      ) else '[]'::jsonb end as claims_dropped,
      case when d.renders > 0 and d.prev is not null then (
        select coalesce(jsonb_agg(jsonb_build_object('entity_id', a.entity_id, 'name', a.name) order by a.name, a.entity_id), '[]'::jsonb)
        from day_entities a where a.day = d.day
          and not exists (select 1 from day_entities b where b.day = d.prev and b.entity_id = a.entity_id)
      ) else '[]'::jsonb end as entities_added,
      case when d.renders > 0 and d.prev is not null then (
        select coalesce(jsonb_agg(jsonb_build_object('entity_id', a.entity_id, 'name', a.name) order by a.name, a.entity_id), '[]'::jsonb)
        from day_entities a where a.day = d.prev
          and not exists (select 1 from day_entities b where b.day = d.day and b.entity_id = a.entity_id)
      ) else '[]'::jsonb end as entities_dropped,
      case when d.renders > 0 and d.prev is not null then (
        select coalesce(jsonb_agg(jsonb_build_object('url_key', a.url_key, 'reg_domain', a.reg_domain) order by a.url_key), '[]'::jsonb)
        from day_urls a where a.day = d.day
          and not exists (select 1 from day_urls b where b.day = d.prev and b.url_key = a.url_key)
      ) else '[]'::jsonb end as citations_added,
      case when d.renders > 0 and d.prev is not null then (
        select coalesce(jsonb_agg(jsonb_build_object('url_key', a.url_key, 'reg_domain', a.reg_domain) order by a.url_key), '[]'::jsonb)
        from day_urls a where a.day = d.prev
          and not exists (select 1 from day_urls b where b.day = d.day and b.url_key = a.url_key)
      ) else '[]'::jsonb end as citations_dropped
    from day_prev d
  )
  select jsonb_build_object(
    'window', jsonb_build_object('from', p_from, 'to', p_to),
    'renders', c.renders,
    'present', c.present,
    'errors', c.errors,
    'days', c.days,
    'presence_rate', case when c.renders > 0 then round(c.present::numeric / c.renders, 4) end,
    'change_rate', case when c.renders > 1 then round((select changed from changes)::numeric / (c.renders - 1), 4) end,
    'confidence', case when c.renders < 10 then 'low' when c.renders <= 20 then 'medium' else 'high' end,
    'citation_stability', jsonb_build_object(
      'url', case when c.present > 1 then round(
        ((select total from url_jaccard)
          + ((c.present - (select count(*) from url_sets)) * (c.present - (select count(*) from url_sets) - 1)) / 2.0)
        / (c.present * (c.present - 1) / 2.0), 4) end,
      'domain', case when c.present > 1 then round(
        ((select total from dom_jaccard)
          + ((c.present - (select count(*) from dom_sets)) * (c.present - (select count(*) from dom_sets) - 1)) / 2.0)
        / (c.present * (c.present - 1) / 2.0), 4) end
    ),
    'citations_per_render', case when c.present > 0 then round((select count(*) from cit)::numeric / c.present, 4) end,
    'median_word_count', (select median from word_counts),
    'organic_overlap', (
      select jsonb_build_object(
        'top10', case when o.occurrences > 0 then round(o.top10::numeric / o.occurrences, 4) end,
        'top20', case when o.occurrences > 0 then round(o.top20::numeric / o.occurrences, 4) end)
      from overlap o
    ),
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object(
          'group_id', x.group_id,
          'label', x.label,
          'renders', x.renders,
          'share', round(x.renders::numeric / c.present, 4),
          'bucket', public.metric_bucket(x.renders::numeric / c.present),
          'first_seen', x.first_seen,
          'last_seen', x.last_seen,
          'cited_share', round(x.cited_share, 4),
          'types', to_jsonb(x.types)
        ) order by x.renders desc, x.label, x.group_id)
      from (select * from claim_stats order by renders desc, label, group_id limit 200) x
    ), '[]'::jsonb),
    'entities', coalesce((
      select jsonb_agg(jsonb_build_object(
          'entity_id', x.entity_id,
          'name', x.name,
          'renders', x.renders,
          'share', round(x.renders::numeric / c.present, 4),
          'recommended_renders', x.recommended,
          'recommended_share', round(x.recommended::numeric / c.present, 4),
          'labels', to_jsonb(x.labels),
          'bucket', public.metric_bucket(x.renders::numeric / c.present)
        ) order by x.renders desc, x.name, x.entity_id)
      from (select * from entity_stats order by renders desc, name, entity_id limit 100) x
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
          'url_key', x.url_key,
          'url', x.url,
          'reg_domain', x.reg_domain,
          'title', x.title,
          'renders', x.renders,
          'share', round(x.renders::numeric / c.present, 4),
          'bucket', public.metric_bucket(x.renders::numeric / c.present),
          'platform', exists (select 1 from public.platform_domains pd where pd.reg_domain = x.reg_domain),
          'organic_top10_share', round(x.top10::numeric / x.renders, 4)
        ) order by x.renders desc, x.url_key)
      from (select * from source_stats order by renders desc, url_key limit 100) x
    ), '[]'::jsonb),
    'domains', coalesce((
      select jsonb_agg(jsonb_build_object(
          'reg_domain', x.reg_domain,
          'renders', x.renders,
          'share', round(x.renders::numeric / c.present, 4),
          'bucket', public.metric_bucket(x.renders::numeric / c.present),
          'platform', exists (select 1 from public.platform_domains pd where pd.reg_domain = x.reg_domain)
        ) order by x.renders desc, x.reg_domain)
      from (select * from domain_stats order by renders desc, reg_domain limit 100) x
    ), '[]'::jsonb),
    'formats', coalesce((
      select jsonb_agg(jsonb_build_object(
          'label', f.label,
          'renders', f.renders,
          'share', round(f.renders::numeric / c.present, 4)
        ) order by f.renders desc, f.label)
      from fmt f
    ), '[]'::jsonb),
    'unsupported_claims', coalesce((
      select jsonb_agg(jsonb_build_object(
          'group_id', x.group_id,
          'label', x.label,
          'share', round(x.renders::numeric / c.present, 4)
        ) order by x.renders desc, x.label, x.group_id)
      from claim_stats x
      where x.renders::numeric / c.present >= 0.4 and x.cited_share = 0
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
          'day', to_char(d.day::timestamp, 'YYYY-MM-DD'),
          'renders', d.renders,
          'present', d.present,
          'claims_added', d.claims_added,
          'claims_dropped', d.claims_dropped,
          'entities_added', d.entities_added,
          'entities_dropped', d.entities_dropped,
          'citations_added', d.citations_added,
          'citations_dropped', d.citations_dropped
        ) order by d.day)
      from daily d
    ), '[]'::jsonb)
  )
  into v_result
  from counts c;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------- metric_evidence

/**
 * The renders behind one number in series_metrics, most recent first:
 * { total, items: [{ snapshot_id, captured_at, sentences: [{ i, text, citations }], note }] }.
 * Kinds: claim | unsupported (key: claim group id), entity (entity id), source (url_key),
 * domain (reg_domain), format (label).
 */
create or replace function public.metric_evidence(
  p_series_id uuid, p_kind text, p_key text, p_from timestamptz, p_to timestamptz, p_limit int default 50
)
returns jsonb
language plpgsql stable security definer set search_path = '' set timezone = 'UTC'
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 500);
  v_id uuid;
  v_next uuid;
  v_result jsonb;
begin
  perform public.assert_series_access(p_series_id);

  if p_kind is null or p_kind not in ('claim', 'unsupported', 'entity', 'source', 'domain', 'format') then
    raise exception 'unknown evidence kind %', p_kind using errcode = '22023';
  end if;
  if p_key is null then
    raise exception 'missing key' using errcode = '22023';
  end if;

  if p_kind in ('claim', 'unsupported', 'entity') then
    begin
      v_id := p_key::uuid;
    exception when invalid_text_representation then
      raise exception 'invalid key %', p_key using errcode = '22023';
    end;
    -- Follow merges to the surviving row; claims and mentions point at survivors.
    for i in 1..10 loop
      if p_kind = 'entity' then
        select e.merged_into into v_next from public.entities e where e.id = v_id;
      else
        select g.merged_into into v_next from public.claim_groups g where g.id = v_id;
      end if;
      exit when v_next is null;
      v_id := v_next;
    end loop;
  end if;

  if p_kind in ('claim', 'unsupported') then
    with hits as (
      select s.id, s.captured_at, s.sentences,
             array_agg(distinct c.sentence) as idx,
             string_agg(distinct c.text, ' / ') as note
      from public.claims c
      join public.snapshots s on s.id = c.snapshot_id
      where c.group_id = v_id
        and s.series_id = p_series_id and s.status = 'present'
        and s.captured_at >= p_from and s.captured_at < p_to
        and (p_kind = 'claim' or cardinality(c.citation_idx) = 0)
      group by s.id, s.captured_at, s.sentences
    )
    select jsonb_build_object(
      'total', (select count(*) from hits),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
            'snapshot_id', h.id, 'captured_at', h.captured_at,
            'sentences', public.snapshot_sentences(h.sentences, h.idx), 'note', h.note
          ) order by h.captured_at desc, h.id)
        from (select * from hits order by captured_at desc, id limit v_limit) h
      ), '[]'::jsonb))
    into v_result;

  elsif p_kind = 'entity' then
    with hits as (
      select s.id, s.captured_at, s.sentences,
             (select coalesce(array_agg(distinct x), '{}') from public.entity_mentions m2
               cross join lateral unnest(m2.sentences) x
               where m2.snapshot_id = s.id and m2.entity_id = v_id) as idx,
             string_agg(distinct m.role || coalesce(': ' || nullif(btrim(m.label), ''), ''), ' / ') as note
      from public.entity_mentions m
      join public.snapshots s on s.id = m.snapshot_id
      where m.entity_id = v_id
        and s.series_id = p_series_id and s.status = 'present'
        and s.captured_at >= p_from and s.captured_at < p_to
      group by s.id, s.captured_at, s.sentences
    )
    select jsonb_build_object(
      'total', (select count(*) from hits),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
            'snapshot_id', h.id, 'captured_at', h.captured_at,
            'sentences', public.snapshot_sentences(h.sentences, h.idx), 'note', h.note
          ) order by h.captured_at desc, h.id)
        from (select * from hits order by captured_at desc, id limit v_limit) h
      ), '[]'::jsonb))
    into v_result;

  elsif p_kind in ('source', 'domain') then
    with hits as (
      select s.id, s.captured_at, s.sentences,
             array_agg(ci.idx order by ci.idx) as cidx,
             case when p_kind = 'source'
               then (array_agg(ci.passage order by ci.idx) filter (where ci.passage is not null))[1]
               else string_agg(distinct ci.url_key, ', ')
             end as note
      from public.citations ci
      join public.snapshots s on s.id = ci.snapshot_id
      where (case when p_kind = 'source' then ci.url_key = p_key else ci.reg_domain = p_key end)
        and s.series_id = p_series_id and s.status = 'present'
        and s.captured_at >= p_from and s.captured_at < p_to
      group by s.id, s.captured_at, s.sentences
    )
    select jsonb_build_object(
      'total', (select count(*) from hits),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
            'snapshot_id', h.id, 'captured_at', h.captured_at,
            'sentences', public.snapshot_sentences(h.sentences, public.sentences_citing(h.sentences, h.cidx)),
            'note', h.note
          ) order by h.captured_at desc, h.id)
        from (select * from hits order by captured_at desc, id limit v_limit) h
      ), '[]'::jsonb))
    into v_result;

  else -- format
    with hits as (
      select s.id, s.captured_at
      from public.snapshots s
      where s.series_id = p_series_id and s.status = 'present'
        and s.captured_at >= p_from and s.captured_at < p_to
        and jsonb_typeof(s.formats->'labels') = 'array'
        and s.formats->'labels' ? p_key
    )
    select jsonb_build_object(
      'total', (select count(*) from hits),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
            'snapshot_id', h.id, 'captured_at', h.captured_at, 'sentences', '[]'::jsonb, 'note', null
          ) order by h.captured_at desc, h.id)
        from (select * from hits order by captured_at desc, id limit v_limit) h
      ), '[]'::jsonb))
    into v_result;
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------- my_queries

/** The caller's tracked queries with 7-day capture stats, own-page level and latest report. */
create or replace function public.my_queries()
returns jsonb
language plpgsql stable security definer set search_path = '' set timezone = 'UTC'
as $$
declare
  v_uid uuid := auth.uid();
  v_since timestamptz := now() - interval '7 days';
  v_result jsonb;
begin
  if v_uid is null then
    if coalesce(auth.role(), '') = 'service_role' then
      return '[]'::jsonb;
    end if;
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'tracked_query_id', tq.id,
      'display_keyword', tq.display_keyword,
      'series_id', tq.series_id,
      'keyword', se.keyword,
      'location_code', se.location_code,
      'location_name', l.name,
      'language_code', se.language_code,
      'device', se.device,
      'status', tq.status,
      'created_at', tq.created_at,
      'history_days', coalesce(floor(extract(epoch from (now() - h.first_at)) / 86400)::int, 0),
      'renders_7d', w.renders,
      'present_7d', w.present,
      'presence_rate_7d', case when w.renders > 0 then round(w.present::numeric / w.renders, 4) end,
      'last_captured_at', lst.captured_at,
      'last_status', lst.status,
      'own_url', tq.own_url,
      'own_level_7d', om.level,
      'report', case when r.id is null then null
                else jsonb_build_object('id', r.id, 'kind', r.kind, 'stage', r.stage) end
    ) order by tq.created_at desc, tq.id), '[]'::jsonb)
  into v_result
  from public.tracked_queries tq
  join public.series se on se.id = tq.series_id
  left join public.locations l on l.code = se.location_code
  left join lateral (
    select min(s.captured_at) as first_at from public.snapshots s
    where s.series_id = tq.series_id and s.status <> 'error'
  ) h on true
  left join lateral (
    select count(*) filter (where s.status <> 'error') as renders,
           count(*) filter (where s.status = 'present') as present
    from public.snapshots s
    where s.series_id = tq.series_id and s.captured_at >= v_since
  ) w on true
  left join lateral (
    select s.captured_at, s.status from public.snapshots s
    where s.series_id = tq.series_id order by s.captured_at desc limit 1
  ) lst on true
  left join lateral (
    select m.level from public.own_matches m
    join public.snapshots s on s.id = m.snapshot_id
    where m.tracked_query_id = tq.id and m.level is not null and s.captured_at >= v_since
    order by public.match_level_rank(m.level) limit 1
  ) om on true
  left join lateral (
    select rp.id, rp.kind, rp.stage from public.reports rp
    where rp.tracked_query_id = tq.id order by rp.created_at desc limit 1
  ) r on true
  where tq.user_id = v_uid;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------- tracking_summary

/**
 * Own-page tracking for one tracked query: 7- and 28-day survival (renders citing the page over
 * renders with an overview), brand mentions, the latest citation and a daily strip for the last
 * 28 UTC days (from the first day with a capture).
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
           m.level, coalesce(m.brand_mentioned, false) as brand
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
      select jsonb_build_object('captured_at', s.captured_at, 'level', m.level, 'quoted_heading', m.quoted_heading)
      from public.own_matches m
      join public.snapshots s on s.id = m.snapshot_id
      where m.tracked_query_id = p_tracked_query_id and m.level is not null
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

-- ---------------------------------------------------------------- service helpers (Edge Functions)

/**
 * Creates the reports that are due for tracking queries (optionally limited to p_tracked_query_ids)
 * at p_now. History starts at the series' first non-error snapshot. preliminary: 3-day window once
 * history reaches 3 days and the query has no preliminary or full report; full: 7-day window once
 * history reaches 7 days and the query has no full report (a query that is already past day 7 gets
 * only the full report); refresh: 28-day window 28 days after the latest full or refresh window.
 * Returns the created rows as [{ id, tracked_query_id, series_id, kind, window_start, window_end }].
 */
create or replace function public.create_due_reports(p_now timestamptz default now(), p_tracked_query_ids uuid[] default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' set timezone = 'UTC'
as $$
declare
  v_created jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('public.create_due_reports'));

  with tq as (
    select q.id, q.series_id,
      (select min(s.captured_at) from public.snapshots s where s.series_id = q.series_id and s.status <> 'error') as start,
      exists (select 1 from public.reports r where r.tracked_query_id = q.id and r.kind = 'preliminary') as has_pre,
      exists (select 1 from public.reports r where r.tracked_query_id = q.id and r.kind = 'full') as has_full,
      (select max(r.window_end) from public.reports r where r.tracked_query_id = q.id and r.kind in ('full', 'refresh')) as last_full_end
    from public.tracked_queries q
    where q.status = 'tracking' and (p_tracked_query_ids is null or q.id = any(p_tracked_query_ids))
  ),
  due as (
    select id, series_id,
      case
        when not has_full and start <= p_now - interval '7 days' then 'full'
        when not has_full and not has_pre and start <= p_now - interval '3 days' then 'preliminary'
        when has_full and last_full_end <= p_now - interval '28 days' then 'refresh'
      end as kind
    from tq where start is not null
  ),
  win as (
    select d.id, d.series_id, d.kind,
      p_now - case d.kind when 'preliminary' then interval '3 days' when 'full' then interval '7 days'
                          else interval '28 days' end as window_start
    from due d where d.kind is not null
  ),
  ins as (
    insert into public.reports (tracked_query_id, series_id, kind, window_start, window_end, renders)
    select w.id, w.series_id, w.kind, w.window_start, p_now,
      (select count(*) from public.snapshots s
        where s.series_id = w.series_id and s.status <> 'error'
          and s.captured_at >= w.window_start and s.captured_at < p_now)
    from win w
    on conflict do nothing
    returning id, tracked_query_id, series_id, kind, window_start, window_end
  )
  select coalesce(jsonb_agg(to_jsonb(ins)), '[]'::jsonb) into v_created from ins;

  return v_created;
end;
$$;

/**
 * Distinct passages Google quoted from each url_key in a series window:
 * [{ url_key, passages: text[] }] (at most 20 per url_key, most frequent first).
 */
create or replace function public.window_passages(p_series_id uuid, p_from timestamptz, p_to timestamptz, p_url_keys text[])
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with p as (
    select ci.url_key, btrim(ci.passage) as passage, count(*) as n
    from public.citations ci
    join public.snapshots s on s.id = ci.snapshot_id
    where ci.url_key = any(p_url_keys)
      and s.series_id = p_series_id and s.status = 'present'
      and s.captured_at >= p_from and s.captured_at < p_to
      and ci.passage is not null and btrim(ci.passage) <> ''
    group by ci.url_key, btrim(ci.passage)
  ),
  ranked as (
    select url_key, passage, row_number() over (partition by url_key order by n desc, passage) as rn from p
  )
  select coalesce(jsonb_agg(jsonb_build_object('url_key', k.url_key, 'passages', k.passages)), '[]'::jsonb)
  from (
    select url_key, jsonb_agg(passage order by rn) as passages from ranked where rn <= 20 group by url_key
  ) k
$$;

/**
 * Platform-wide metrics for one UTC day across every series, upserted into platform_daily.
 * domain_turnover is over (series, cited domain) pairs of series that had an overview in the prior
 * 7 days: the share of the day's pairs not cited by that series in the prior 7 days, so new series
 * do not read as turnover.
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
  insert into public.platform_daily (day, series_count, renders, presence_rate, citations_per_render, domain_turnover)
  select p_day, a.series_count, a.renders,
    case when a.renders > 0 then round(a.present::numeric / a.renders, 4) end,
    case when a.present > 0 then round(a.cited::numeric / a.present, 4) end,
    case when a.pairs > 0 then round(a.new_pairs::numeric / a.pairs, 4) end
  from agg a
  on conflict (day) do update set
    series_count = excluded.series_count,
    renders = excluded.renders,
    presence_rate = excluded.presence_rate,
    citations_per_render = excluded.citations_per_render,
    domain_turnover = excluded.domain_turnover
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

/**
 * Tracked queries (optionally limited to p_tracked_query_ids) whose page was cited and has now
 * dropped out: an own URL, latest first_seen / regained / lost event is first_seen or regained,
 * at least one present render in [p_ref - 48h, p_ref) and none of them cite the page.
 */
create or replace function public.lost_candidates(p_ref timestamptz, p_tracked_query_ids uuid[] default null)
returns table (tracked_query_id uuid, user_id uuid, display_keyword text, latest_snapshot_id uuid, present_renders int)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.user_id, q.display_keyword, w.latest_id, w.present::int
  from public.tracked_queries q
  cross join lateral (
    select e.kind from public.citation_events e
    where e.tracked_query_id = q.id and e.kind in ('first_seen', 'regained', 'lost')
    order by e.created_at desc limit 1
  ) last_event
  cross join lateral (
    select count(*) as present,
           count(m.level) as cited,
           (array_agg(s.id order by s.captured_at desc))[1] as latest_id
    from public.snapshots s
    left join public.own_matches m on m.snapshot_id = s.id and m.tracked_query_id = q.id
    where s.series_id = q.series_id and s.status = 'present'
      and s.captured_at >= p_ref - interval '48 hours' and s.captured_at < p_ref
  ) w
  where q.own_url is not null and q.status <> 'paused'
    and (p_tracked_query_ids is null or q.id = any(p_tracked_query_ids))
    and last_event.kind in ('first_seen', 'regained')
    and w.present > 0 and w.cited = 0
$$;

-- ---------------------------------------------------------------- grants

revoke all on function public.assert_series_access(uuid) from public, anon, authenticated;
revoke all on function public.assert_tracked_query_access(uuid) from public, anon, authenticated;
revoke all on function public.metric_bucket(numeric) from anon;
revoke all on function public.match_level_rank(text) from anon;
revoke all on function public.snapshot_sentences(jsonb, int[]) from anon;
revoke all on function public.sentences_citing(jsonb, int[]) from anon;

revoke all on function public.series_metrics(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.metric_evidence(uuid, text, text, timestamptz, timestamptz, int) from public, anon;
revoke all on function public.my_queries() from public, anon;
revoke all on function public.tracking_summary(uuid) from public, anon;
grant execute on function public.series_metrics(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.metric_evidence(uuid, text, text, timestamptz, timestamptz, int) to authenticated, service_role;
grant execute on function public.my_queries() to authenticated, service_role;
grant execute on function public.tracking_summary(uuid) to authenticated, service_role;

revoke all on function public.create_due_reports(timestamptz, uuid[]) from public, anon, authenticated;
revoke all on function public.window_passages(uuid, timestamptz, timestamptz, text[]) from public, anon, authenticated;
revoke all on function public.compute_platform_daily(date) from public, anon, authenticated;
revoke all on function public.lost_candidates(timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.create_due_reports(timestamptz, uuid[]) to service_role;
grant execute on function public.window_passages(uuid, timestamptz, timestamptz, text[]) to service_role;
grant execute on function public.compute_platform_daily(date) to service_role;
grant execute on function public.lost_candidates(timestamptz, uuid[]) to service_role;
