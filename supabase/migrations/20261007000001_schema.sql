-- Legiit Overviews: core schema.
-- Shared capture pool (series and everything captured for them) is readable by any user tracking the series.
-- Per-user rows (tracked queries, reports, scores, tracking, notifications) are readable by their owner.
-- Edge Functions write with the service role and bypass RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- reference

create table public.locations (
  code int primary key,                 -- DataForSEO location_code
  name text not null,
  country_iso text not null,
  default_language text not null,
  timezone text not null
);

create table public.platform_domains (
  reg_domain text primary key            -- registrable domain, e.g. youtube.com
);

-- ---------------------------------------------------------------- shared capture pool

create table public.series (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,                 -- normalised keyword
  location_code int not null references public.locations,
  language_code text not null,
  device text not null check (device in ('desktop','mobile')),
  next_capture_at timestamptz not null,
  consolidated_at timestamptz,           -- last nightly claim/entity consolidation
  created_at timestamptz not null default now(),
  unique (keyword, location_code, language_code, device)
);
create index series_next_capture_idx on public.series (next_capture_at);

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series on delete cascade,
  scheduled_at timestamptz not null,
  source text not null default 'scheduled' check (source in ('scheduled','live')),
  task_id text,
  attempts int not null default 0,
  status text not null default 'pending' check (status in ('pending','submitted','received','error')),
  submitted_at timestamptz,
  received_at timestamptz,
  last_error text,
  unique (series_id, scheduled_at)
);
create index captures_status_idx on public.captures (status, submitted_at);
create index captures_task_idx on public.captures (task_id);

create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series on delete cascade,
  capture_id uuid unique references public.captures on delete set null,
  captured_at timestamptz not null,
  status text not null check (status in ('present','absent','error')),
  overview_markdown text,                -- images stripped, citation markers kept
  sentences jsonb not null default '[]', -- ParsedSentence[]
  content_hash text,
  same_as uuid references public.snapshots, -- identical earlier capture whose claims are reused
  raw_path text,                         -- Storage path of the raw DataForSEO task result
  organic jsonb not null default '[]',   -- ParsedOrganic[]
  formats jsonb not null default '{}',   -- CodeFormats + Claude labels
  extraction text not null default 'pending'
    check (extraction in ('pending','submitted','done','reused','none','failed')),
  extraction_attempts int not null default 0,
  created_at timestamptz not null default now()
);
create index snapshots_series_time_idx on public.snapshots (series_id, captured_at desc);
create index snapshots_extraction_idx on public.snapshots (extraction) where extraction in ('pending','submitted','reused');
create index snapshots_hash_idx on public.snapshots (series_id, content_hash);

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.snapshots on delete cascade,
  position int not null,
  kind text not null check (kind in ('element','expanded','table','video','unknown')),
  title text,
  text text not null,
  citation_idx int[] not null default '{}'
);
create index sections_snapshot_idx on public.sections (snapshot_id);

create table public.citations (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.snapshots on delete cascade,
  idx int not null,
  url text not null,
  url_key text not null,                 -- normalised URL used for matching and counting
  host text not null,
  reg_domain text not null,
  title text,
  source text,
  passage text,                          -- the text Google used from that page
  unique (snapshot_id, idx)
);
create index citations_url_key_idx on public.citations (url_key);
create index citations_reg_domain_idx on public.citations (reg_domain);

create table public.claim_groups (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series on delete cascade,
  label text not null,
  merged_into uuid references public.claim_groups,
  created_at timestamptz not null default now()
);
create index claim_groups_series_idx on public.claim_groups (series_id) where merged_into is null;

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.snapshots on delete cascade,
  group_id uuid not null references public.claim_groups,
  sentence int not null,                 -- index into snapshots.sentences
  text text not null,
  type text not null check (type in ('recommendation','fact','comparison','definition','step','caveat')),
  citation_idx int[] not null default '{}'
);
create index claims_snapshot_idx on public.claims (snapshot_id);
create index claims_group_idx on public.claims (group_id);

create table public.entities (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series on delete cascade,
  name text not null,
  aliases text[] not null default '{}',
  merged_into uuid references public.entities,
  created_at timestamptz not null default now()
);
create index entities_series_idx on public.entities (series_id) where merged_into is null;

create table public.entity_mentions (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references public.entities,
  snapshot_id uuid not null references public.snapshots on delete cascade,
  role text not null check (role in ('recommended','mentioned')),
  label text,
  sentences int[] not null default '{}'
);
create index entity_mentions_entity_idx on public.entity_mentions (entity_id);
create index entity_mentions_snapshot_idx on public.entity_mentions (snapshot_id);

-- ---------------------------------------------------------------- pages (shared cache)

create table public.pages (
  url_key text primary key,
  id uuid not null default gen_random_uuid() unique, -- short id for batch custom_ids
  url text not null,
  reg_domain text not null,
  parse_status text not null default 'pending' check (parse_status in ('pending','ok','failed')),
  parsed_at timestamptz,
  parse_error text,
  markdown text,                         -- page_as_markdown
  outline jsonb,                         -- [{level, text}]
  measures jsonb,                        -- PageMeasures
  tags jsonb,                            -- PageTagOutput
  tag_status text not null default 'none' check (tag_status in ('none','submitted','done','failed')),
  tagged_at timestamptz
);

-- ---------------------------------------------------------------- per user

create table public.tracked_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  series_id uuid not null references public.series,
  display_keyword text not null,
  own_url text,
  own_url_key text,
  brand_names text[] not null default '{}',
  status text not null default 'tracking' check (status in ('watching','tracking','paused')),
  created_at timestamptz not null default now(),
  unique (user_id, series_id)
);
create index tracked_queries_series_idx on public.tracked_queries (series_id) where status <> 'paused';

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  tracked_query_id uuid not null references public.tracked_queries on delete cascade,
  series_id uuid not null references public.series,
  kind text not null check (kind in ('preliminary','full','refresh')),
  window_start timestamptz not null,
  window_end timestamptz not null,
  renders int not null,
  metrics jsonb,                         -- SeriesMetrics at window_end
  page_urls text[] not null default '{}',-- url_keys analysed
  page_details jsonb,                    -- [{url_key, ref, share, passages: PassageLocation[]}] written at stage 'pages'
  analysis jsonb,                        -- BriefOutput (matrix, gaps, brief) with refs resolved
  brief_markdown text,
  brief_checks jsonb,                    -- results of code checks
  stage text not null default 'pages' check (stage in ('pages','brief','ready','failed')),
  brief_submitted boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tracked_query_id, kind, window_end)
);
create index reports_stage_idx on public.reports (stage);

create table public.draft_scores (
  id uuid primary key default gen_random_uuid(),
  tracked_query_id uuid not null references public.tracked_queries on delete cascade,
  report_id uuid references public.reports,
  source text not null check (source in ('url','text')),
  input text not null,
  status text not null default 'running' check (status in ('running','done','failed')),
  result jsonb,                          -- DraftScoreResult
  error text,
  created_at timestamptz not null default now()
);

create table public.own_pages (
  tracked_query_id uuid primary key references public.tracked_queries on delete cascade,
  url text not null,
  resolved_url text,
  parsed_at timestamptz,
  markdown text,
  outline jsonb
);

create table public.own_matches (
  tracked_query_id uuid not null references public.tracked_queries on delete cascade,
  snapshot_id uuid not null references public.snapshots on delete cascade,
  level text check (level in ('exact_url','path_prefix','same_host','same_domain')),  -- null when not cited
  brand_mentioned boolean not null default false,
  citation_idx int,
  quoted_heading text,
  primary key (tracked_query_id, snapshot_id)
);

create table public.citation_events (
  id uuid primary key default gen_random_uuid(),
  tracked_query_id uuid not null references public.tracked_queries on delete cascade,
  snapshot_id uuid references public.snapshots on delete set null,
  kind text not null check (kind in ('first_seen','lost','regained','brand_mention')),
  level text,
  quoted_heading text,
  held_for_platform_event boolean not null default false,
  created_at timestamptz not null default now()
);
create index citation_events_tq_idx on public.citation_events (tracked_query_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  tracked_query_id uuid references public.tracked_queries on delete cascade,
  kind text not null check (kind in ('first_seen','lost','regained','report_ready','platform_event','digest')),
  title text not null,
  body text not null,
  link text,
  emailed_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------- system

create table public.batches (
  id text primary key,                   -- Anthropic batch id
  kind text not null check (kind in ('extract','consolidate','page_tag','brief')),
  item_count int not null,
  status text not null default 'in_progress' check (status in ('in_progress','ended','collected','failed')),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  collected_at timestamptz,
  usage jsonb                            -- summed input/output tokens
);

-- One row per request in a Claude batch. refs maps the short refs used in the prompt (C1, E1, P1)
-- to the ids they stood for, so results are applied against the rows the prompt actually showed.
create table public.batch_items (
  batch_id text not null references public.batches on delete cascade,
  custom_id text not null,
  kind text not null check (kind in ('extract','consolidate','page_tag','brief')),
  target_id text not null,               -- snapshot id, series id, pages.id or report id
  refs jsonb not null default '{}',
  status text not null default 'submitted' check (status in ('submitted','applied','failed')),
  error text,
  primary key (batch_id, custom_id)
);
create index batch_items_target_idx on public.batch_items (kind, target_id);

create table public.platform_daily (
  day date primary key,
  series_count int not null,
  renders int not null,
  presence_rate numeric,
  citations_per_render numeric,
  domain_turnover numeric                -- share of cited domains not seen in the prior 7 days
);

create table public.platform_events (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  metrics jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers

create or replace function public.user_tracks_series(p_series_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tracked_queries tq
    where tq.series_id = p_series_id and tq.user_id = (select auth.uid())
  );
$$;

create or replace function public.user_owns_tracked_query(p_tq_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tracked_queries tq
    where tq.id = p_tq_id and tq.user_id = (select auth.uid())
  );
$$;

create or replace function public.snapshot_series(p_snapshot_id uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select series_id from public.snapshots where id = p_snapshot_id $$;

-- ---------------------------------------------------------------- row-level security

alter table public.locations enable row level security;
alter table public.platform_domains enable row level security;
alter table public.series enable row level security;
alter table public.captures enable row level security;
alter table public.snapshots enable row level security;
alter table public.sections enable row level security;
alter table public.citations enable row level security;
alter table public.claim_groups enable row level security;
alter table public.claims enable row level security;
alter table public.entities enable row level security;
alter table public.entity_mentions enable row level security;
alter table public.pages enable row level security;
alter table public.tracked_queries enable row level security;
alter table public.reports enable row level security;
alter table public.draft_scores enable row level security;
alter table public.own_pages enable row level security;
alter table public.own_matches enable row level security;
alter table public.citation_events enable row level security;
alter table public.notifications enable row level security;
alter table public.batches enable row level security;
alter table public.batch_items enable row level security;
alter table public.platform_daily enable row level security;
alter table public.platform_events enable row level security;

create policy "read locations" on public.locations for select to authenticated using (true);
create policy "read platform domains" on public.platform_domains for select to authenticated using (true);
create policy "read platform events" on public.platform_events for select to authenticated using (true);
create policy "read pages" on public.pages for select to authenticated using (true);

create policy "read tracked series" on public.series for select to authenticated
  using (public.user_tracks_series(id));
create policy "read captures of tracked series" on public.captures for select to authenticated
  using (public.user_tracks_series(series_id));
create policy "read snapshots of tracked series" on public.snapshots for select to authenticated
  using (public.user_tracks_series(series_id));
create policy "read sections of tracked series" on public.sections for select to authenticated
  using (public.user_tracks_series(public.snapshot_series(snapshot_id)));
create policy "read citations of tracked series" on public.citations for select to authenticated
  using (public.user_tracks_series(public.snapshot_series(snapshot_id)));
create policy "read claims of tracked series" on public.claims for select to authenticated
  using (public.user_tracks_series(public.snapshot_series(snapshot_id)));
create policy "read entity mentions of tracked series" on public.entity_mentions for select to authenticated
  using (public.user_tracks_series(public.snapshot_series(snapshot_id)));
create policy "read claim groups of tracked series" on public.claim_groups for select to authenticated
  using (public.user_tracks_series(series_id));
create policy "read entities of tracked series" on public.entities for select to authenticated
  using (public.user_tracks_series(series_id));

create policy "own tracked queries: read" on public.tracked_queries for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own tracked queries: update" on public.tracked_queries for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own tracked queries: delete" on public.tracked_queries for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "own reports" on public.reports for select to authenticated
  using (public.user_owns_tracked_query(tracked_query_id));
create policy "own draft scores" on public.draft_scores for select to authenticated
  using (public.user_owns_tracked_query(tracked_query_id));
create policy "own pages of own queries" on public.own_pages for select to authenticated
  using (public.user_owns_tracked_query(tracked_query_id));
create policy "own matches" on public.own_matches for select to authenticated
  using (public.user_owns_tracked_query(tracked_query_id));
create policy "own citation events" on public.citation_events for select to authenticated
  using (public.user_owns_tracked_query(tracked_query_id));

create policy "own notifications: read" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own notifications: mark read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Tracked queries are created by the add-query function; users may only edit tracking fields.
revoke insert on public.tracked_queries from anon, authenticated;
revoke update on public.tracked_queries from anon, authenticated;
grant update (own_url, own_url_key, brand_names, status) on public.tracked_queries to authenticated;

-- Storage bucket for raw DataForSEO payloads (service role only).
insert into storage.buckets (id, name, public) values ('raw', 'raw', false)
  on conflict (id) do nothing;
