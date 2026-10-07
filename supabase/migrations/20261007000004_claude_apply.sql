-- Claude batch work: what is pending for each kind of batch, and how each result is applied.
-- Every apply runs in one transaction so a result is either fully written or not at all, and every
-- apply is idempotent so a result delivered twice changes nothing. All functions are for the
-- service role only (the batch runner in supabase/functions/_shared/batches.ts).
--
-- Refs: prompts carry short refs (C<n> claim groups, E<n> entities, P<n> pages); the map from ref to
-- id is stored in batch_items.refs and passed back here as p_refs.

-- ---------------------------------------------------------------- helpers

-- A JSON number that is an integer, as int; null for anything else.
create or replace function public.claude_int(p jsonb)
returns int
language sql immutable set search_path = ''
as $$
  select case
    when jsonb_typeof(p) is distinct from 'number' then null
    else case
      when (p #>> '{}')::numeric = trunc((p #>> '{}')::numeric)
        and abs((p #>> '{}')::numeric) < 2147483647
      then (p #>> '{}')::numeric::int
    end
  end;
$$;

-- Key used to match claim labels: case-, whitespace- and trailing-period-insensitive.
create or replace function public.claude_label_key(p text)
returns text
language sql immutable set search_path = ''
as $$
  select lower(regexp_replace(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'), '[\s.]+$', ''));
$$;

-- The live claim group a ref's id stands for: follows merged_into, and only within the series.
create or replace function public.claude_group_survivor(p_series_id uuid, p_id text)
returns uuid
language plpgsql stable set search_path = ''
as $$
declare
  v_id uuid;
  v_next uuid;
  v_series uuid;
begin
  if p_id is null or p_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  v_id := p_id::uuid;
  for i in 1..20 loop
    select g.merged_into, g.series_id into v_next, v_series from public.claim_groups g where g.id = v_id;
    if not found or v_series <> p_series_id then return null; end if;
    if v_next is null then return v_id; end if;
    v_id := v_next;
  end loop;
  return null;
end;
$$;

-- The live entity a ref's id stands for: follows merged_into, and only within the series.
create or replace function public.claude_entity_survivor(p_series_id uuid, p_id text)
returns uuid
language plpgsql stable set search_path = ''
as $$
declare
  v_id uuid;
  v_next uuid;
  v_series uuid;
begin
  if p_id is null or p_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  v_id := p_id::uuid;
  for i in 1..20 loop
    select e.merged_into, e.series_id into v_next, v_series from public.entities e where e.id = v_id;
    if not found or v_series <> p_series_id then return null; end if;
    if v_next is null then return v_id; end if;
    v_id := v_next;
  end loop;
  return null;
end;
$$;

-- Sentence index (as text) -> citations array, from snapshots.sentences.
create or replace function public.claude_sentence_citations(p_sentences jsonb)
returns jsonb
language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_object_agg(public.claude_int(e -> 'i')::text, case when jsonb_typeof(e -> 'citations') = 'array' then e -> 'citations' else '[]'::jsonb end), '{}'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_sentences) = 'array' then p_sentences else '[]'::jsonb end) e
  where public.claude_int(e -> 'i') is not null;
$$;

create or replace function public.claude_int_array(p jsonb)
returns int[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(public.claude_int(x) order by o), '{}')
  from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality t(x, o)
  where public.claude_int(x) is not null;
$$;

-- ---------------------------------------------------------------- A. extraction

-- Pending extractions, oldest first, with each series' known claims and entities. A series with more
-- than p_max_known live groups (or entities) contributes the ones with the most claims (mentions).
-- Known items are ordered by created_at so refs are stable.
create or replace function public.extract_pending(p_limit int, p_series_ids uuid[] default null, p_max_known int default 800)
returns jsonb
language sql stable set search_path = ''
as $$
  with snaps as (
    select s.id, s.series_id, s.sentences, s.captured_at
    from public.snapshots s
    where s.extraction = 'pending' and s.extraction_attempts < 3
      and (p_series_ids is null or s.series_id = any(p_series_ids))
      and not exists (
        select 1 from public.batch_items bi
        where bi.kind = 'extract' and bi.target_id = s.id::text and bi.status = 'submitted'
      )
    order by s.captured_at, s.id
    limit p_limit
  )
  select jsonb_build_object(
    'snapshots', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'series_id', series_id, 'sentences', sentences) order by captured_at, id)
      from snaps), '[]'::jsonb),
    'series', coalesce((
      select jsonb_object_agg(se.id, jsonb_build_object(
        'keyword', se.keyword,
        'language', se.language_code,
        'claims', (
          select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'label', k.label) order by k.created_at, k.id), '[]'::jsonb)
          from (
            select g.id, g.label, g.created_at
            from public.claim_groups g
            where g.series_id = se.id and g.merged_into is null
            order by (select count(*) from public.claims c where c.group_id = g.id) desc, g.created_at, g.id
            limit p_max_known
          ) k),
        'entities', (
          select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'aliases', to_jsonb(k.aliases)) order by k.created_at, k.id), '[]'::jsonb)
          from (
            select e.id, e.name, e.aliases, e.created_at
            from public.entities e
            where e.series_id = se.id and e.merged_into is null
            order by (select count(*) from public.entity_mentions m where m.entity_id = e.id) desc, e.created_at, e.id
            limit p_max_known
          ) k)
      ))
      from public.series se
      where se.id in (select series_id from snaps)), '{}'::jsonb)
  );
$$;

-- Copies the original's claims, mentions and Claude format labels into a reused snapshot.
-- Citations are taken from the reused snapshot's own sentences. Returns false when not applicable.
create or replace function public.copy_reused_extraction(p_snapshot_id uuid)
returns boolean
language plpgsql set search_path = ''
as $$
declare
  v_snap record;
  v_orig record;
  v_cits jsonb;
begin
  select id, same_as, sentences, extraction into v_snap from public.snapshots where id = p_snapshot_id for update;
  if not found or v_snap.extraction <> 'reused' or v_snap.same_as is null then return false; end if;
  select id, extraction, formats into v_orig from public.snapshots where id = v_snap.same_as;
  if not found or v_orig.extraction <> 'done' then return false; end if;

  v_cits := public.claude_sentence_citations(v_snap.sentences);
  delete from public.claims where snapshot_id = v_snap.id;
  delete from public.entity_mentions where snapshot_id = v_snap.id;

  insert into public.claims (snapshot_id, group_id, sentence, text, type, citation_idx)
  select v_snap.id, c.group_id, c.sentence, c.text, c.type,
    case when v_cits ? c.sentence::text then public.claude_int_array(v_cits -> c.sentence::text) else c.citation_idx end
  from public.claims c
  where c.snapshot_id = v_orig.id;

  insert into public.entity_mentions (entity_id, snapshot_id, role, label, sentences)
  select m.entity_id, v_snap.id, m.role, m.label, m.sentences
  from public.entity_mentions m
  where m.snapshot_id = v_orig.id;

  update public.snapshots
  set formats = coalesce(formats, '{}'::jsonb) || jsonb_build_object(
        'labels', coalesce(v_orig.formats -> 'labels', '[]'::jsonb),
        'answer_lead_sentence', v_orig.formats -> 'answer_lead_sentence'),
      extraction = 'done'
  where id = v_snap.id;
  return true;
end;
$$;

-- Applies one ExtractOutput to a snapshot. Skips snapshots already done. Claims with an invalid
-- sentence index are dropped; group_ref resolves through p_refs (unknown refs are treated as new);
-- new labels reuse a live group with the same label key or create one; entities resolve by ref,
-- then by name or alias (case-insensitive), else are created; one mention per entity and snapshot.
-- Finally copies the result into every reused snapshot whose same_as is this one.
create or replace function public.apply_extraction(p_snapshot_id uuid, p_output jsonb, p_refs jsonb)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_snap record;
  v_cits jsonb;
  v_item jsonb;
  v_sentence int;
  v_text text;
  v_type text;
  v_label text;
  v_group uuid;
  v_entity uuid;
  v_name text;
  v_role text;
  v_ent_label text;
  v_sents int[];
  v_prev jsonb;
  v_mentions jsonb := '{}'::jsonb;
  v_labels jsonb;
  v_lead int;
  v_reused uuid;
  v_claims int := 0;
  v_dropped int := 0;
  v_new_groups int := 0;
  v_new_entities int := 0;
  v_copied int := 0;
begin
  select id, series_id, sentences, extraction into v_snap from public.snapshots where id = p_snapshot_id for update;
  if not found then raise exception 'snapshot % not found', p_snapshot_id; end if;
  if v_snap.extraction not in ('submitted', 'pending', 'failed') then
    return jsonb_build_object('skipped', true, 'extraction', v_snap.extraction);
  end if;
  -- One writer of groups and entities per series at a time, so find-or-create never duplicates.
  perform pg_advisory_xact_lock(hashtextextended('legiit:series-claims:' || v_snap.series_id::text, 0));

  delete from public.claims where snapshot_id = v_snap.id;
  delete from public.entity_mentions where snapshot_id = v_snap.id;
  v_cits := public.claude_sentence_citations(v_snap.sentences);

  for v_item in select value from jsonb_array_elements(case when jsonb_typeof(p_output -> 'claims') = 'array' then p_output -> 'claims' else '[]'::jsonb end) loop
    v_sentence := public.claude_int(v_item -> 'sentence');
    v_text := btrim(regexp_replace(coalesce(v_item ->> 'text', ''), '\s+', ' ', 'g'));
    v_type := v_item ->> 'type';
    if v_sentence is null or not (v_cits ? v_sentence::text) or v_text = ''
       or v_type is null or v_type not in ('recommendation', 'fact', 'comparison', 'definition', 'step', 'caveat') then
      v_dropped := v_dropped + 1;
      continue;
    end if;

    v_group := public.claude_group_survivor(v_snap.series_id, p_refs ->> (v_item ->> 'group_ref'));
    if v_group is null then
      v_label := btrim(regexp_replace(coalesce(nullif(btrim(v_item ->> 'new_label'), ''), v_text), '\s+', ' ', 'g'));
      select g.id into v_group
      from public.claim_groups g
      where g.series_id = v_snap.series_id and g.merged_into is null
        and public.claude_label_key(g.label) = public.claude_label_key(v_label)
      order by g.created_at, g.id
      limit 1;
      if v_group is null then
        insert into public.claim_groups (series_id, label) values (v_snap.series_id, v_label) returning id into v_group;
        v_new_groups := v_new_groups + 1;
      end if;
    end if;

    if not exists (
      select 1 from public.claims c
      where c.snapshot_id = v_snap.id and c.group_id = v_group and c.sentence = v_sentence and c.text = v_text
    ) then
      insert into public.claims (snapshot_id, group_id, sentence, text, type, citation_idx)
      values (v_snap.id, v_group, v_sentence, v_text, v_type, public.claude_int_array(v_cits -> v_sentence::text));
      v_claims := v_claims + 1;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(case when jsonb_typeof(p_output -> 'entities') = 'array' then p_output -> 'entities' else '[]'::jsonb end) loop
    v_name := btrim(regexp_replace(coalesce(v_item ->> 'name', ''), '\s+', ' ', 'g'));
    v_entity := public.claude_entity_survivor(v_snap.series_id, p_refs ->> (v_item ->> 'entity_ref'));
    if v_entity is null then
      if v_name = '' then
        v_dropped := v_dropped + 1;
        continue;
      end if;
      select e.id into v_entity
      from public.entities e
      where e.series_id = v_snap.series_id and e.merged_into is null
        and (lower(btrim(e.name)) = lower(v_name)
             or exists (select 1 from unnest(e.aliases) a where lower(btrim(a)) = lower(v_name)))
      order by (lower(btrim(e.name)) = lower(v_name)) desc, e.created_at, e.id
      limit 1;
      if v_entity is null then
        insert into public.entities (series_id, name) values (v_snap.series_id, v_name) returning id into v_entity;
        v_new_entities := v_new_entities + 1;
      end if;
    end if;

    v_role := case when v_item ->> 'role' = 'recommended' then 'recommended' else 'mentioned' end;
    v_ent_label := nullif(btrim(coalesce(v_item ->> 'label', '')), '');
    select coalesce(array_agg(distinct s), '{}') into v_sents
    from unnest(public.claude_int_array(v_item -> 'sentences')) s
    where v_cits ? s::text;

    v_prev := v_mentions -> v_entity::text;
    if v_prev is not null then
      -- The same entity listed twice: recommended wins, sentences are unioned.
      v_ent_label := case
        when v_role = 'recommended' and v_prev ->> 'role' <> 'recommended' then coalesce(v_ent_label, v_prev ->> 'label')
        else coalesce(v_prev ->> 'label', v_ent_label) end;
      v_role := case when v_role = 'recommended' or v_prev ->> 'role' = 'recommended' then 'recommended' else 'mentioned' end;
      select coalesce(array_agg(distinct s), '{}') into v_sents
      from unnest(v_sents || public.claude_int_array(v_prev -> 'sentences')) s;
    end if;
    v_mentions := v_mentions || jsonb_build_object(v_entity::text,
      jsonb_build_object('role', v_role, 'label', v_ent_label, 'sentences', to_jsonb(v_sents)));
  end loop;

  insert into public.entity_mentions (entity_id, snapshot_id, role, label, sentences)
  select m.key::uuid, v_snap.id, m.value ->> 'role', m.value ->> 'label', public.claude_int_array(m.value -> 'sentences')
  from jsonb_each(v_mentions) m;

  select coalesce(jsonb_agg(to_jsonb(l.value) order by l.first), '[]'::jsonb) into v_labels
  from (
    select x.value, min(x.o) as first
    from jsonb_array_elements_text(case when jsonb_typeof(p_output -> 'format_labels') = 'array' then p_output -> 'format_labels' else '[]'::jsonb end)
      with ordinality x(value, o)
    group by x.value
  ) l;
  v_lead := public.claude_int(p_output -> 'answer_lead_sentence');
  if v_lead is not null and not (v_cits ? v_lead::text) then v_lead := null; end if;

  update public.snapshots
  set formats = coalesce(formats, '{}'::jsonb) || jsonb_build_object('labels', v_labels, 'answer_lead_sentence', v_lead),
      extraction = 'done'
  where id = v_snap.id;

  for v_reused in select s.id from public.snapshots s where s.same_as = v_snap.id and s.extraction = 'reused' order by s.captured_at loop
    if public.copy_reused_extraction(v_reused) then v_copied := v_copied + 1; end if;
  end loop;

  return jsonb_build_object(
    'skipped', false, 'claims', v_claims, 'dropped', v_dropped,
    'new_groups', v_new_groups, 'new_entities', v_new_entities, 'reused_copied', v_copied);
end;
$$;

-- A failed extraction attempt (errored, expired, canceled, refused or invalid output): back to
-- pending, or failed at the third attempt. Only a snapshot still submitted is counted, so a repeated
-- delivery of the same failure counts once. Reused copies of a failed original are reset to pending.
create or replace function public.fail_extraction(p_snapshot_id uuid)
returns text
language plpgsql set search_path = ''
as $$
declare
  v_status text;
begin
  update public.snapshots
  set extraction_attempts = extraction_attempts + 1,
      extraction = case when extraction_attempts + 1 >= 3 then 'failed' else 'pending' end
  where id = p_snapshot_id and extraction = 'submitted'
  returning extraction into v_status;
  if v_status = 'failed' then
    update public.snapshots set extraction = 'pending' where same_as = p_snapshot_id and extraction = 'reused';
  end if;
  return v_status;
end;
$$;

-- Reused snapshots: copy from originals that are done; reset to pending those whose original failed
-- (same_as is kept) or is gone.
create or replace function public.sync_reused_extractions(p_series_ids uuid[] default null)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_id uuid;
  v_copied int := 0;
  v_reset int := 0;
begin
  for v_id in
    select s.id
    from public.snapshots s
    join public.snapshots o on o.id = s.same_as
    where s.extraction = 'reused' and o.extraction = 'done'
      and (p_series_ids is null or s.series_id = any(p_series_ids))
    order by s.captured_at
  loop
    if public.copy_reused_extraction(v_id) then v_copied := v_copied + 1; end if;
  end loop;

  update public.snapshots s
  set extraction = 'pending'
  where s.extraction = 'reused'
    and (p_series_ids is null or s.series_id = any(p_series_ids))
    and (s.same_as is null or exists (select 1 from public.snapshots o where o.id = s.same_as and o.extraction = 'failed'));
  get diagnostics v_reset = row_count;

  return jsonb_build_object('copied', v_copied, 'reset', v_reset);
end;
$$;

-- ---------------------------------------------------------------- B. consolidation

-- Series due for consolidation: new groups or entities since consolidated_at (or never
-- consolidated), at most once per 20 hours, at least 2 live groups or 2 live entities, and no
-- consolidation in flight. Each comes with its live claims and entities and their render counts
-- (distinct snapshots). Items created since the last run come first, then the most rendered.
create or replace function public.consolidate_pending(
  p_limit int, p_series_ids uuid[] default null, p_max_claims int default 1500, p_max_entities int default 800)
returns jsonb
language sql stable set search_path = ''
as $$
  with cand as (
    select s.id, s.keyword, s.language_code, s.consolidated_at
    from public.series s
    where (p_series_ids is null or s.id = any(p_series_ids))
      and (s.consolidated_at is null or s.consolidated_at < now() - interval '20 hours')
      and (s.consolidated_at is null
           or exists (select 1 from public.claim_groups g where g.series_id = s.id and g.created_at > s.consolidated_at)
           or exists (select 1 from public.entities e where e.series_id = s.id and e.created_at > s.consolidated_at))
      and ((select count(*) from public.claim_groups g where g.series_id = s.id and g.merged_into is null) >= 2
           or (select count(*) from public.entities e where e.series_id = s.id and e.merged_into is null) >= 2)
      and not exists (
        select 1 from public.batch_items bi
        where bi.kind = 'consolidate' and bi.target_id = s.id::text and bi.status = 'submitted'
      )
    order by s.consolidated_at nulls first, s.id
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'series_id', c.id,
    'keyword', c.keyword,
    'language', c.language_code,
    'claims', (
      select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'label', k.label, 'renders', k.renders)
                                order by k.renders desc, k.label, k.id), '[]'::jsonb)
      from (
        select g.id, g.label,
          (select count(distinct cl.snapshot_id) from public.claims cl where cl.group_id = g.id)::int as renders,
          (c.consolidated_at is null or g.created_at > c.consolidated_at) as fresh
        from public.claim_groups g
        where g.series_id = c.id and g.merged_into is null
        order by fresh desc, renders desc, g.created_at, g.id
        limit p_max_claims
      ) k),
    'entities', (
      select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'aliases', to_jsonb(k.aliases), 'renders', k.renders)
                                order by k.renders desc, k.name, k.id), '[]'::jsonb)
      from (
        select e.id, e.name, e.aliases,
          (select count(distinct m.snapshot_id) from public.entity_mentions m where m.entity_id = e.id)::int as renders,
          (c.consolidated_at is null or e.created_at > c.consolidated_at) as fresh
        from public.entities e
        where e.series_id = c.id and e.merged_into is null
        order by fresh desc, renders desc, e.created_at, e.id
        limit p_max_entities
      ) k)
  ) order by c.consolidated_at nulls first, c.id), '[]'::jsonb)
  from cand c;
$$;

-- Records a consolidation attempt: consolidated_at becomes the time the in-flight request was
-- submitted (so groups created while it ran still count as new next time), or now().
create or replace function public.mark_consolidated(p_series_id uuid)
returns timestamptz
language plpgsql set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  select min(b.created_at) into v_at
  from public.batch_items bi
  join public.batches b on b.id = bi.batch_id
  where bi.kind = 'consolidate' and bi.target_id = p_series_id::text and bi.status = 'submitted';
  v_at := coalesce(v_at, now());
  update public.series set consolidated_at = v_at where id = p_series_id;
  return v_at;
end;
$$;

-- Resolves merge groups from Claude's output to live ids of one kind. Drops refs that don't
-- resolve, self-merges, and every id that appears in more than one group (a group whose keep is
-- such an id is dropped whole). Returns [{keep, merge[], aliases[]}] and the number of ignored refs.
create or replace function public.claude_resolve_merges(p_series_id uuid, p_kind text, p_merges jsonb, p_refs jsonb)
returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  v_item jsonb;
  v_keep uuid;
  v_members uuid[];
  v_raw int;
  v_resolved jsonb := '[]'::jsonb;
  v_conflicted text[];
  v_out jsonb := '[]'::jsonb;
  v_ignored int := 0;
  v_i int := 0;
begin
  for v_item in select value from jsonb_array_elements(case when jsonb_typeof(p_merges) = 'array' then p_merges else '[]'::jsonb end) loop
    v_i := v_i + 1;
    v_raw := case when jsonb_typeof(v_item -> 'merge') = 'array' then jsonb_array_length(v_item -> 'merge') else 0 end;
    v_keep := case p_kind
      when 'claim' then public.claude_group_survivor(p_series_id, p_refs ->> (v_item ->> 'keep'))
      else public.claude_entity_survivor(p_series_id, p_refs ->> (v_item ->> 'keep')) end;
    if v_keep is null then
      v_ignored := v_ignored + 1 + v_raw;
      continue;
    end if;
    select coalesce(array_agg(distinct x), '{}') into v_members
    from (
      select case p_kind
        when 'claim' then public.claude_group_survivor(p_series_id, p_refs ->> r)
        else public.claude_entity_survivor(p_series_id, p_refs ->> r) end as x
      from jsonb_array_elements_text(case when jsonb_typeof(v_item -> 'merge') = 'array' then v_item -> 'merge' else '[]'::jsonb end) r
    ) t
    where x is not null and x <> v_keep;
    v_ignored := v_ignored + v_raw - coalesce(array_length(v_members, 1), 0);
    v_resolved := v_resolved || jsonb_build_array(jsonb_build_object(
      'i', v_i, 'keep', v_keep, 'merge', to_jsonb(v_members),
      'aliases', case when jsonb_typeof(v_item -> 'aliases') = 'array' then v_item -> 'aliases' else '[]'::jsonb end));
  end loop;

  select coalesce(array_agg(id), '{}') into v_conflicted
  from (
    select id from (
      select g ->> 'keep' as id, (g ->> 'i')::int as gi from jsonb_array_elements(v_resolved) g
      union
      select m, (g ->> 'i')::int from jsonb_array_elements(v_resolved) g, jsonb_array_elements_text(g -> 'merge') m
    ) t
    group by id
    having count(distinct gi) > 1
  ) c;

  for v_item in select value from jsonb_array_elements(v_resolved) loop
    if (v_item ->> 'keep') = any(v_conflicted) then
      v_ignored := v_ignored + 1 + jsonb_array_length(v_item -> 'merge');
      continue;
    end if;
    select coalesce(array_agg(m::uuid), '{}') into v_members
    from jsonb_array_elements_text(v_item -> 'merge') m
    where m <> all(v_conflicted);
    v_ignored := v_ignored + jsonb_array_length(v_item -> 'merge') - coalesce(array_length(v_members, 1), 0);
    if coalesce(array_length(v_members, 1), 0) = 0 then continue; end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('keep', v_item -> 'keep', 'merge', to_jsonb(v_members), 'aliases', v_item -> 'aliases'));
  end loop;

  return jsonb_build_object('groups', v_out, 'ignored', v_ignored);
end;
$$;

-- Applies one ConsolidateOutput to a series. Merged rows get merged_into = survivor (rows already
-- merged into them too, so there are no chains); claims and mentions are re-pointed to the
-- survivor; mentions collapse to one per (entity, snapshot); merged names and Claude's aliases are
-- added to the kept entity; consolidated_at is set. Applying the same output twice changes nothing.
create or replace function public.apply_consolidation(p_series_id uuid, p_output jsonb, p_refs jsonb)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_resolved jsonb;
  v_group jsonb;
  v_keep uuid;
  v_members uuid[];
  v_ids uuid[];
  v_name text;
  v_aliases text[];
  v_claim_merged int := 0;
  v_entity_merged int := 0;
  v_ignored int := 0;
  v_n int;
begin
  perform 1 from public.series where id = p_series_id for update;
  if not found then raise exception 'series % not found', p_series_id; end if;
  perform pg_advisory_xact_lock(hashtextextended('legiit:series-claims:' || p_series_id::text, 0));

  -- Claims
  v_resolved := public.claude_resolve_merges(p_series_id, 'claim', p_output -> 'claim_merges', p_refs);
  v_ignored := v_ignored + (v_resolved ->> 'ignored')::int;
  for v_group in select value from jsonb_array_elements(v_resolved -> 'groups') loop
    v_keep := (v_group ->> 'keep')::uuid;
    select array_agg(m::uuid) into v_members from jsonb_array_elements_text(v_group -> 'merge') m;
    update public.claim_groups set merged_into = v_keep where merged_into = any(v_members);
    update public.claim_groups set merged_into = v_keep where id = any(v_members) and merged_into is null;
    get diagnostics v_n = row_count;
    v_claim_merged := v_claim_merged + v_n;
    update public.claims set group_id = v_keep
    where group_id = any(v_members)
       or group_id in (select g.id from public.claim_groups g where g.merged_into = v_keep);
  end loop;

  -- Entities
  v_resolved := public.claude_resolve_merges(p_series_id, 'entity', p_output -> 'entity_merges', p_refs);
  v_ignored := v_ignored + (v_resolved ->> 'ignored')::int;
  for v_group in select value from jsonb_array_elements(v_resolved -> 'groups') loop
    v_keep := (v_group ->> 'keep')::uuid;
    select array_agg(m::uuid) into v_members from jsonb_array_elements_text(v_group -> 'merge') m;

    select name into v_name from public.entities where id = v_keep;
    select coalesce(array_agg(a order by o), '{}') into v_aliases
    from (
      select distinct on (lower(a)) a, o
      from (
        select btrim(x) as a, o
        from unnest(
          (select aliases from public.entities where id = v_keep)
          || coalesce((select array_agg(e.name order by e.created_at, e.id) from public.entities e
                       where e.id = any(v_members) or e.merged_into = any(v_members)), '{}')
          || coalesce((select array_agg(al order by e.created_at, e.id) from public.entities e, unnest(e.aliases) al
                       where e.id = any(v_members) or e.merged_into = any(v_members)), '{}')
          || coalesce((select array_agg(al) from jsonb_array_elements_text(v_group -> 'aliases') al), '{}')
        ) with ordinality u(x, o)
      ) t
      where a <> '' and lower(a) <> lower(btrim(v_name))
      order by lower(a), o
    ) d;
    update public.entities set aliases = v_aliases where id = v_keep;

    update public.entities set merged_into = v_keep where merged_into = any(v_members);
    update public.entities set merged_into = v_keep where id = any(v_members) and merged_into is null;
    get diagnostics v_n = row_count;
    v_entity_merged := v_entity_merged + v_n;

    -- Re-point and collapse: one mention per snapshot, recommended wins, sentences unioned, the
    -- kept entity's own label preferred.
    select array_agg(e.id) into v_ids from public.entities e where e.id = v_keep or e.merged_into = v_keep;
    with src as (
      delete from public.entity_mentions where entity_id = any(v_ids) returning *
    )
    insert into public.entity_mentions (entity_id, snapshot_id, role, label, sentences)
    select v_keep, s.snapshot_id,
      case when bool_or(s.role = 'recommended') then 'recommended' else 'mentioned' end,
      (array_agg(s.label order by (s.entity_id = v_keep) desc, (s.role = 'recommended') desc) filter (where s.label is not null))[1],
      coalesce((select array_agg(distinct x order by x) from src s2, unnest(s2.sentences) x where s2.snapshot_id = s.snapshot_id), '{}')
    from src s
    group by s.snapshot_id;
  end loop;

  perform public.mark_consolidated(p_series_id);
  return jsonb_build_object('claim_groups_merged', v_claim_merged, 'entities_merged', v_entity_merged, 'ignored_refs', v_ignored);
end;
$$;

-- ---------------------------------------------------------------- C. page tags

-- Parsed pages awaiting tags that belong to a report at stage 'pages' (keyword and language from the
-- oldest such report's series), with Google's passages for the URL (most frequent first, max 10).
create or replace function public.page_tag_pending(p_limit int, p_series_ids uuid[] default null, p_max_chars int default 70000)
returns jsonb
language sql stable set search_path = ''
as $$
  with wanted as (
    select distinct on (u.url_key) u.url_key, r.series_id
    from public.reports r, unnest(r.page_urls) u(url_key)
    where r.stage = 'pages' and (p_series_ids is null or r.series_id = any(p_series_ids))
    order by u.url_key, r.created_at, r.id
  ),
  due as (
    select p.id, p.url_key, p.url, left(p.markdown, p_max_chars) as markdown, p.outline, p.parsed_at, w.series_id
    from public.pages p
    join wanted w on w.url_key = p.url_key
    where p.parse_status = 'ok'
      and (p.tag_status = 'none' or (p.tag_status in ('done', 'failed') and p.tagged_at < p.parsed_at))
      and not exists (
        select 1 from public.batch_items bi
        where bi.kind = 'page_tag' and bi.target_id = p.id::text and bi.status = 'submitted'
      )
    order by p.parsed_at, p.url_key
    limit p_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'url_key', d.url_key, 'url', d.url, 'markdown', d.markdown, 'outline', d.outline,
    'keyword', se.keyword, 'language', se.language_code,
    'passages', (
      select coalesce(jsonb_agg(x.passage order by x.n desc, x.passage), '[]'::jsonb)
      from (
        select c.passage, count(*) as n
        from public.citations c
        where c.url_key = d.url_key and btrim(coalesce(c.passage, '')) <> ''
        group by c.passage
        order by n desc, c.passage
        limit 10
      ) x)
  ) order by d.parsed_at, d.url_key), '[]'::jsonb)
  from due d
  join public.series se on se.id = d.series_id;
$$;

-- Writes a page's tags and words before the answer. Only a page still submitted is written.
create or replace function public.apply_page_tag(p_page_id uuid, p_tags jsonb, p_words_before_answer int)
returns boolean
language plpgsql set search_path = ''
as $$
begin
  update public.pages
  set tags = p_tags,
      tag_status = 'done',
      tagged_at = now(),
      measures = coalesce(measures, '{}'::jsonb) || jsonb_build_object('words_before_answer', p_words_before_answer)
  where id = p_page_id and tag_status = 'submitted';
  return found;
end;
$$;

-- ---------------------------------------------------------------- D. brief

-- Everything the brief prompt and its code checks need for one report.
create or replace function public.brief_context(p_report_id uuid)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'stage', r.stage, 'tracked_query_id', r.tracked_query_id, 'series_id', r.series_id,
    'window_start', r.window_start, 'window_end', r.window_end, 'renders', r.renders,
    'metrics', case when r.metrics is null then null else r.metrics - 'daily' end,
    'page_urls', to_jsonb(r.page_urls),
    'page_details', coalesce(r.page_details, '[]'::jsonb),
    'keyword', se.keyword, 'language', se.language_code,
    'display_keyword', tq.display_keyword, 'own_url_key', tq.own_url_key,
    'pages', (
      select coalesce(jsonb_agg(jsonb_build_object('url_key', p.url_key, 'url', p.url, 'measures', p.measures, 'tags', p.tags)), '[]'::jsonb)
      from public.pages p
      where p.parse_status = 'ok'
        and (p.url_key = any(r.page_urls)
             or p.url_key in (select d ->> 'url_key' from jsonb_array_elements(case when jsonb_typeof(r.page_details) = 'array' then r.page_details else '[]'::jsonb end) d)))
  )
  from public.reports r
  join public.series se on se.id = r.series_id
  join public.tracked_queries tq on tq.id = r.tracked_query_id
  where r.id = p_report_id;
$$;

-- Reports waiting for their brief request, oldest first.
create or replace function public.brief_pending(p_limit int, p_series_ids uuid[] default null)
returns jsonb
language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(public.brief_context(r.id) order by r.created_at, r.id), '[]'::jsonb)
  from (
    select r.id, r.created_at
    from public.reports r
    where r.stage = 'brief' and not r.brief_submitted
      and (p_series_ids is null or r.series_id = any(p_series_ids))
      and not exists (
        select 1 from public.batch_items bi
        where bi.kind = 'brief' and bi.target_id = r.id::text and bi.status = 'submitted'
      )
    order by r.created_at, r.id
    limit p_limit
  ) r;
$$;

-- Saves a rendered brief, moves the report to ready and notifies the query's owner. Only a report
-- still at stage 'brief' is written, so a repeated delivery sends no second notification.
create or replace function public.apply_brief(p_report_id uuid, p_analysis jsonb, p_markdown text, p_checks jsonb, p_body text)
returns boolean
language plpgsql set search_path = ''
as $$
declare
  v_tq uuid;
  v_user uuid;
  v_keyword text;
begin
  update public.reports
  set analysis = p_analysis, brief_markdown = p_markdown, brief_checks = p_checks,
      stage = 'ready', error = null, updated_at = now()
  where id = p_report_id and stage = 'brief'
  returning tracked_query_id into v_tq;
  if not found then return false; end if;

  select user_id, display_keyword into v_user, v_keyword from public.tracked_queries where id = v_tq;
  insert into public.notifications (user_id, tracked_query_id, kind, title, body, link)
  values (v_user, v_tq, 'report_ready', 'Brief ready: ' || v_keyword, p_body, '/queries/' || v_tq::text || '/brief');
  return true;
end;
$$;

-- ---------------------------------------------------------------- recovery

-- Work marked submitted whose batch item is no longer submitted had its result fail to apply (for
-- example a database error mid-apply). Captures go back to pending with one more attempt; page tags
-- fail; briefs are retried until two attempts have failed, then the report fails.
create or replace function public.release_stuck_work(p_series_ids uuid[] default null)
returns jsonb
language plpgsql set search_path = ''
as $$
declare
  v_snapshots int;
  v_pages int;
  v_briefs int;
begin
  update public.snapshots s
  set extraction_attempts = s.extraction_attempts + 1,
      extraction = case when s.extraction_attempts + 1 >= 3 then 'failed' else 'pending' end
  where s.extraction = 'submitted'
    and (p_series_ids is null or s.series_id = any(p_series_ids))
    and not exists (
      select 1 from public.batch_items bi
      where bi.kind = 'extract' and bi.target_id = s.id::text and bi.status = 'submitted'
    );
  get diagnostics v_snapshots = row_count;

  update public.pages p
  set tag_status = 'failed', tagged_at = now()
  where p.tag_status = 'submitted'
    and (p_series_ids is null or exists (
      select 1 from public.reports r where r.series_id = any(p_series_ids) and p.url_key = any(r.page_urls)))
    and not exists (
      select 1 from public.batch_items bi
      where bi.kind = 'page_tag' and bi.target_id = p.id::text and bi.status = 'submitted'
    );
  get diagnostics v_pages = row_count;

  with stuck as (
    select r.id,
      (select count(*) from public.batch_items bi
       where bi.kind = 'brief' and bi.target_id = r.id::text and bi.status = 'failed') as failures
    from public.reports r
    where r.stage = 'brief' and r.brief_submitted
      and (p_series_ids is null or r.series_id = any(p_series_ids))
      and not exists (
        select 1 from public.batch_items bi
        where bi.kind = 'brief' and bi.target_id = r.id::text and bi.status = 'submitted'
      )
  )
  update public.reports r
  set brief_submitted = s.failures >= 2,
      stage = case when s.failures >= 2 then 'failed' else r.stage end,
      error = case when s.failures >= 2 then 'the brief result could not be applied' else r.error end,
      updated_at = now()
  from stuck s
  where s.id = r.id;
  get diagnostics v_briefs = row_count;

  return jsonb_build_object('snapshots', v_snapshots, 'pages', v_pages, 'briefs', v_briefs);
end;
$$;

-- ---------------------------------------------------------------- privileges

revoke execute on function public.claude_int(jsonb) from public, anon, authenticated;
revoke execute on function public.claude_label_key(text) from public, anon, authenticated;
revoke execute on function public.claude_group_survivor(uuid, text) from public, anon, authenticated;
revoke execute on function public.claude_entity_survivor(uuid, text) from public, anon, authenticated;
revoke execute on function public.claude_sentence_citations(jsonb) from public, anon, authenticated;
revoke execute on function public.claude_int_array(jsonb) from public, anon, authenticated;
revoke execute on function public.extract_pending(int, uuid[], int) from public, anon, authenticated;
revoke execute on function public.copy_reused_extraction(uuid) from public, anon, authenticated;
revoke execute on function public.apply_extraction(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.fail_extraction(uuid) from public, anon, authenticated;
revoke execute on function public.sync_reused_extractions(uuid[]) from public, anon, authenticated;
revoke execute on function public.consolidate_pending(int, uuid[], int, int) from public, anon, authenticated;
revoke execute on function public.mark_consolidated(uuid) from public, anon, authenticated;
revoke execute on function public.claude_resolve_merges(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.apply_consolidation(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.page_tag_pending(int, uuid[], int) from public, anon, authenticated;
revoke execute on function public.apply_page_tag(uuid, jsonb, int) from public, anon, authenticated;
revoke execute on function public.brief_context(uuid) from public, anon, authenticated;
revoke execute on function public.brief_pending(int, uuid[]) from public, anon, authenticated;
revoke execute on function public.apply_brief(uuid, jsonb, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.release_stuck_work(uuid[]) from public, anon, authenticated;

grant execute on function public.claude_int(jsonb) to service_role;
grant execute on function public.claude_label_key(text) to service_role;
grant execute on function public.claude_group_survivor(uuid, text) to service_role;
grant execute on function public.claude_entity_survivor(uuid, text) to service_role;
grant execute on function public.claude_sentence_citations(jsonb) to service_role;
grant execute on function public.claude_int_array(jsonb) to service_role;
grant execute on function public.extract_pending(int, uuid[], int) to service_role;
grant execute on function public.copy_reused_extraction(uuid) to service_role;
grant execute on function public.apply_extraction(uuid, jsonb, jsonb) to service_role;
grant execute on function public.fail_extraction(uuid) to service_role;
grant execute on function public.sync_reused_extractions(uuid[]) to service_role;
grant execute on function public.consolidate_pending(int, uuid[], int, int) to service_role;
grant execute on function public.mark_consolidated(uuid) to service_role;
grant execute on function public.claude_resolve_merges(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.apply_consolidation(uuid, jsonb, jsonb) to service_role;
grant execute on function public.page_tag_pending(int, uuid[], int) to service_role;
grant execute on function public.apply_page_tag(uuid, jsonb, int) to service_role;
grant execute on function public.brief_context(uuid) to service_role;
grant execute on function public.brief_pending(int, uuid[]) to service_role;
grant execute on function public.apply_brief(uuid, jsonb, text, jsonb, text) to service_role;
grant execute on function public.release_stuck_work(uuid[]) to service_role;

notify pgrst, 'reload schema';
