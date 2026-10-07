-- Row-level security and RPC access: a user reads only their own per-user rows and only the shared
-- capture pool of series they track; pages only when a report, a tracked series or their own page
-- gives them a reason; tracked queries are created by add-query only and users may edit only the
-- tracking fields (never own_url_key); notifications can only be marked read; metric RPCs refuse
-- series the caller does not track.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(58);

-- ---------------------------------------------------------------- fixture (as postgres)
-- User A tracks series SA; user B tracks series SB. Each series has one snapshot with a section,
-- a citation, a claim group, a claim, an entity and a mention. Each user has a report, a draft
-- score, an own match, a citation event and a notification.
insert into auth.users (id, email, aud, role) values
  ('d0000000-0000-4000-8000-00000000000a', 'rls-test-a@example.com', 'authenticated', 'authenticated'),
  ('d0000000-0000-4000-8000-00000000000b', 'rls-test-b@example.com', 'authenticated', 'authenticated');

insert into public.series (id, keyword, location_code, language_code, device, next_capture_at) values
  ('d0000000-0000-4000-8000-0000000005aa', 'rls-test series a', 2840, 'en', 'desktop', '2030-01-01'),
  ('d0000000-0000-4000-8000-0000000005bb', 'rls-test series b', 2840, 'en', 'desktop', '2030-01-01');

insert into public.tracked_queries (id, user_id, series_id, display_keyword, own_url, own_url_key) values
  ('d0000000-0000-4000-8000-0000000007aa', 'd0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000005aa', 'series a', 'https://a.example.com/page', 'a.example.com/page'),
  ('d0000000-0000-4000-8000-0000000007bb', 'd0000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-0000000005bb', 'series b', 'https://b.example.com/staging', 'b.example.com/staging');

insert into public.snapshots (id, series_id, captured_at, status, content_hash, extraction) values
  ('d0000000-0000-4000-8000-0000000006aa', 'd0000000-0000-4000-8000-0000000005aa', now() - interval '1 hour', 'present', 'ha', 'done'),
  ('d0000000-0000-4000-8000-0000000006bb', 'd0000000-0000-4000-8000-0000000005bb', now() - interval '1 hour', 'present', 'hb', 'done');

insert into public.sections (snapshot_id, position, kind, text) values
  ('d0000000-0000-4000-8000-0000000006aa', 0, 'element', 'section a'),
  ('d0000000-0000-4000-8000-0000000006bb', 0, 'element', 'section b');

insert into public.citations (snapshot_id, idx, url, url_key, host, reg_domain) values
  ('d0000000-0000-4000-8000-0000000006aa', 0, 'https://a.example.com/page', 'a.example.com/page', 'a.example.com', 'example.com'),
  ('d0000000-0000-4000-8000-0000000006bb', 0, 'https://b.example.com/page', 'b.example.com/page', 'b.example.com', 'example.com');

insert into public.claim_groups (id, series_id, label) values
  ('d0000000-0000-4000-8000-0000000008aa', 'd0000000-0000-4000-8000-0000000005aa', 'claim a'),
  ('d0000000-0000-4000-8000-0000000008bb', 'd0000000-0000-4000-8000-0000000005bb', 'claim b');
insert into public.claims (snapshot_id, group_id, sentence, text, type) values
  ('d0000000-0000-4000-8000-0000000006aa', 'd0000000-0000-4000-8000-0000000008aa', 0, 'claim a', 'fact'),
  ('d0000000-0000-4000-8000-0000000006bb', 'd0000000-0000-4000-8000-0000000008bb', 0, 'claim b', 'fact');

insert into public.entities (id, series_id, name) values
  ('d0000000-0000-4000-8000-0000000009aa', 'd0000000-0000-4000-8000-0000000005aa', 'Entity A'),
  ('d0000000-0000-4000-8000-0000000009bb', 'd0000000-0000-4000-8000-0000000005bb', 'Entity B');
insert into public.entity_mentions (entity_id, snapshot_id, role) values
  ('d0000000-0000-4000-8000-0000000009aa', 'd0000000-0000-4000-8000-0000000006aa', 'mentioned'),
  ('d0000000-0000-4000-8000-0000000009bb', 'd0000000-0000-4000-8000-0000000006bb', 'mentioned');

insert into public.reports (tracked_query_id, series_id, kind, window_start, window_end, renders, page_urls) values
  ('d0000000-0000-4000-8000-0000000007aa', 'd0000000-0000-4000-8000-0000000005aa', 'preliminary', now() - interval '3 days', now(), 1, '{rls-r.example.com/report}'),
  ('d0000000-0000-4000-8000-0000000007bb', 'd0000000-0000-4000-8000-0000000005bb', 'preliminary', now() - interval '3 days', now(), 1, '{}');

-- Pages: A's cited page (also A's own page), B's cited page, B's own (unpublished) page, one only in
-- A's report, one nobody has a reason to see.
insert into public.pages (url_key, url, reg_domain, markdown) values
  ('a.example.com/page', 'https://a.example.com/page', 'example.com', 'page a'),
  ('b.example.com/page', 'https://b.example.com/page', 'example.com', 'page b'),
  ('b.example.com/staging', 'https://b.example.com/staging', 'example.com', 'page b staging'),
  ('rls-r.example.com/report', 'https://rls-r.example.com/report', 'example.com', 'page r'),
  ('rls-x.example.com/other', 'https://rls-x.example.com/other', 'example.com', 'page x');

insert into public.draft_scores (tracked_query_id, source, input) values
  ('d0000000-0000-4000-8000-0000000007aa', 'text', 'draft a'),
  ('d0000000-0000-4000-8000-0000000007bb', 'text', 'draft b');
-- One draft being scored per query; finished rows do not block.
select throws_ok($$ insert into public.draft_scores (tracked_query_id, source, input) values ('d0000000-0000-4000-8000-0000000007aa', 'text', 'draft a2') $$,
  '23505', null, 'a second running draft score for the same query is refused');
select lives_ok($$ insert into public.draft_scores (tracked_query_id, source, input, status) values ('d0000000-0000-4000-8000-0000000007aa', 'text', 'draft a3', 'done') $$,
  'a finished draft score sits beside the running one');

insert into public.own_matches (tracked_query_id, snapshot_id, level, quoted_heading) values
  ('d0000000-0000-4000-8000-0000000007aa', 'd0000000-0000-4000-8000-0000000006aa', 'exact_url', 'Heading A'),
  ('d0000000-0000-4000-8000-0000000007bb', 'd0000000-0000-4000-8000-0000000006bb', 'exact_url', 'Heading B');

insert into public.citation_events (tracked_query_id, snapshot_id, kind, level) values
  ('d0000000-0000-4000-8000-0000000007aa', 'd0000000-0000-4000-8000-0000000006aa', 'first_seen', 'exact_url'),
  ('d0000000-0000-4000-8000-0000000007bb', 'd0000000-0000-4000-8000-0000000006bb', 'first_seen', 'exact_url');

insert into public.notifications (id, user_id, tracked_query_id, kind, title, body) values
  ('d0000000-0000-4000-8000-000000000aaa', 'd0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000007aa', 'first_seen', 'a', 'a'),
  ('d0000000-0000-4000-8000-000000000bbb', 'd0000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-0000000007bb', 'first_seen', 'b', 'b');

-- ---------------------------------------------------------------- as user A
set local role authenticated;
set local request.jwt.claims to '{"sub":"d0000000-0000-4000-8000-00000000000a","role":"authenticated"}';

select is((select array_agg(id) from public.tracked_queries), array['d0000000-0000-4000-8000-0000000007aa'::uuid], 'A reads only their tracked query');
select is((select array_agg(tracked_query_id) from public.reports), array['d0000000-0000-4000-8000-0000000007aa'::uuid], 'A reads only their reports');
select is((select array_agg(id) from public.notifications), array['d0000000-0000-4000-8000-000000000aaa'::uuid], 'A reads only their notifications');
select is((select array_agg(distinct tracked_query_id) from public.draft_scores), array['d0000000-0000-4000-8000-0000000007aa'::uuid], 'A reads only their draft scores');
select is((select array_agg(tracked_query_id) from public.own_matches), array['d0000000-0000-4000-8000-0000000007aa'::uuid], 'A reads only their own matches');
select is((select array_agg(tracked_query_id) from public.citation_events), array['d0000000-0000-4000-8000-0000000007aa'::uuid], 'A reads only their citation events');

select is((select array_agg(id) from public.series where keyword like 'rls-test%'), array['d0000000-0000-4000-8000-0000000005aa'::uuid], 'A reads only the series they track');
select is((select array_agg(id) from public.snapshots where series_id in ('d0000000-0000-4000-8000-0000000005aa', 'd0000000-0000-4000-8000-0000000005bb')),
  array['d0000000-0000-4000-8000-0000000006aa'::uuid], 'A reads only snapshots of tracked series');
select is((select array_agg(text) from public.sections where snapshot_id in ('d0000000-0000-4000-8000-0000000006aa', 'd0000000-0000-4000-8000-0000000006bb')),
  array['section a'], 'A reads only sections of tracked series');
select is((select array_agg(url_key) from public.citations where snapshot_id in ('d0000000-0000-4000-8000-0000000006aa', 'd0000000-0000-4000-8000-0000000006bb')),
  array['a.example.com/page'], 'A reads only citations of tracked series');
select is((select array_agg(text) from public.claims where snapshot_id in ('d0000000-0000-4000-8000-0000000006aa', 'd0000000-0000-4000-8000-0000000006bb')),
  array['claim a'], 'A reads only claims of tracked series');
select is((select array_agg(label) from public.claim_groups where series_id in ('d0000000-0000-4000-8000-0000000005aa', 'd0000000-0000-4000-8000-0000000005bb')),
  array['claim a'], 'A reads only claim groups of tracked series');
select is((select array_agg(name) from public.entities where series_id in ('d0000000-0000-4000-8000-0000000005aa', 'd0000000-0000-4000-8000-0000000005bb')),
  array['Entity A'], 'A reads only entities of tracked series');
select is((select count(*)::int from public.entity_mentions where snapshot_id in ('d0000000-0000-4000-8000-0000000006aa', 'd0000000-0000-4000-8000-0000000006bb')),
  1, 'A reads only mentions of tracked series');
select is((select array_agg(url_key order by url_key) from public.pages where url_key in ('a.example.com/page', 'b.example.com/page', 'b.example.com/staging', 'rls-r.example.com/report', 'rls-x.example.com/other')),
  array['a.example.com/page', 'rls-r.example.com/report'], 'A reads the pages of their report and of series they track, not B''s own page or the rest');
select is((select count(*)::int from public.batches), 0, 'batches are not readable');
select is((select count(*)::int from public.batch_items), 0, 'batch items are not readable');

-- Tracked queries are created by add-query only.
select throws_ok($$
  insert into public.tracked_queries (user_id, series_id, display_keyword)
  values ('d0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-0000000005bb', 'sneaky')
$$, '42501', null, 'A cannot insert a tracked query');

-- Only the tracking fields are editable; own_url_key is derived by set-own-page, never written by users.
select lives_ok($$
  update public.tracked_queries
  set own_url = 'https://a.example.com/new', brand_names = '{Acme}', status = 'paused'
  where id = 'd0000000-0000-4000-8000-0000000007aa'
$$, 'A updates their own tracking fields');
select is((select own_url || ' ' || status || ' ' || brand_names[1] from public.tracked_queries where id = 'd0000000-0000-4000-8000-0000000007aa'),
  'https://a.example.com/new paused Acme', 'the update applied');
select throws_ok($$ update public.tracked_queries set own_url_key = 'victim.example.org/page' where id = 'd0000000-0000-4000-8000-0000000007aa' $$,
  '42501', null, 'own_url_key is not editable');
select throws_ok($$ update public.tracked_queries set display_keyword = 'x' where id = 'd0000000-0000-4000-8000-0000000007aa' $$,
  '42501', null, 'display_keyword is not editable');
select throws_ok($$ update public.tracked_queries set series_id = 'd0000000-0000-4000-8000-0000000005bb' where id = 'd0000000-0000-4000-8000-0000000007aa' $$,
  '42501', null, 'series_id is not editable');
select throws_ok($$ update public.tracked_queries set user_id = 'd0000000-0000-4000-8000-00000000000b' where id = 'd0000000-0000-4000-8000-0000000007aa' $$,
  '42501', null, 'user_id is not editable');
update public.tracked_queries set own_url = 'https://evil.example.com' where id = 'd0000000-0000-4000-8000-0000000007bb';
select throws_ok($$ insert into public.reports (tracked_query_id, series_id, kind, window_start, window_end, renders)
  values ('d0000000-0000-4000-8000-0000000007aa', 'd0000000-0000-4000-8000-0000000005aa', 'full', now(), now(), 0) $$,
  '42501', null, 'A cannot write reports');
select throws_ok($$ insert into public.notifications (user_id, kind, title, body)
  values ('d0000000-0000-4000-8000-00000000000a', 'digest', 'x', 'y') $$,
  '42501', null, 'A cannot create notifications');
select lives_ok($$ update public.notifications set read_at = now() where id = 'd0000000-0000-4000-8000-000000000aaa' $$,
  'A marks their notification read');
select throws_ok($$ update public.notifications set emailed_at = null where id = 'd0000000-0000-4000-8000-000000000aaa' $$,
  '42501', null, 'A cannot re-arm an email');
select throws_ok($$ update public.notifications set title = 'x', body = 'y', link = '@evil.example/login' where id = 'd0000000-0000-4000-8000-000000000aaa' $$,
  '42501', null, 'A cannot rewrite a notification');
select throws_ok($$ update public.notifications set kind = 'report_ready', created_at = now() - interval '2 days' where id = 'd0000000-0000-4000-8000-000000000aaa' $$,
  '42501', null, 'A cannot change a notification''s kind or date');
update public.notifications set read_at = now() where id = 'd0000000-0000-4000-8000-000000000bbb';

-- RPCs: allowed on the tracked series, refused on the other.
select lives_ok($$ select public.series_metrics('d0000000-0000-4000-8000-0000000005aa', now() - interval '7 days', now()) $$,
  'series_metrics on a tracked series');
select is((select (public.series_metrics('d0000000-0000-4000-8000-0000000005aa', now() - interval '7 days', now())->>'present')::int), 1,
  'series_metrics counts the tracked series');
select throws_ok($$ select public.series_metrics('d0000000-0000-4000-8000-0000000005bb', now() - interval '7 days', now()) $$,
  '42501', 'not allowed', 'series_metrics refuses an untracked series');
select lives_ok($$ select public.metric_evidence('d0000000-0000-4000-8000-0000000005aa', 'source', 'a.example.com/page', now() - interval '7 days', now()) $$,
  'metric_evidence on a tracked series');
select throws_ok($$ select public.metric_evidence('d0000000-0000-4000-8000-0000000005bb', 'source', 'b.example.com/page', now() - interval '7 days', now()) $$,
  '42501', 'not allowed', 'metric_evidence refuses an untracked series');
select lives_ok($$ select public.tracking_summary('d0000000-0000-4000-8000-0000000007aa') $$, 'tracking_summary on an own query');
select is((select public.tracking_summary('d0000000-0000-4000-8000-0000000007aa')->'latest'->>'quoted_heading'), 'Heading A', 'tracking_summary reads own matches');
select throws_ok($$ select public.tracking_summary('d0000000-0000-4000-8000-0000000007bb') $$,
  '42501', 'not allowed', 'tracking_summary refuses another user''s query');
select is((select jsonb_array_length(public.my_queries())), 1, 'my_queries returns only the caller''s queries');
select is((select public.my_queries()->0->>'tracked_query_id'), 'd0000000-0000-4000-8000-0000000007aa', 'my_queries returns A''s query');
select is((select public.my_queries()->0->>'own_level_7d'), 'exact_url', 'my_queries reports the best level of the last 7 days');
select is((select public.my_queries()->0->>'last_status'), 'present', 'my_queries reports the latest status');
select is((select public.my_queries()->0->'report'->>'kind'), 'preliminary', 'my_queries reports the latest report');
select is((select (public.my_queries()->0->>'renders_7d')::int), 1, 'my_queries counts renders of the last 7 days');
select throws_ok($$ select public.create_due_reports() $$, '42501', null, 'service helpers are not callable by users');
select throws_ok($$ select public.compute_platform_daily(current_date) $$, '42501', null, 'platform metrics are not callable by users');

-- ---------------------------------------------------------------- as user B
set local request.jwt.claims to '{"sub":"d0000000-0000-4000-8000-00000000000b","role":"authenticated"}';
select is((select own_url from public.tracked_queries where id = 'd0000000-0000-4000-8000-0000000007bb'), 'https://b.example.com/staging',
  'A''s update of B''s query changed nothing');
select is((select read_at from public.notifications where id = 'd0000000-0000-4000-8000-000000000bbb'), null,
  'A could not mark B''s notification read');
select is((select array_agg(url_key order by url_key) from public.pages where url_key in ('a.example.com/page', 'b.example.com/page', 'b.example.com/staging', 'rls-r.example.com/report', 'rls-x.example.com/other')),
  array['b.example.com/page', 'b.example.com/staging'], 'B reads the page their series cites and their own page, nothing else');
select lives_ok($$ select public.series_metrics('d0000000-0000-4000-8000-0000000005bb', now() - interval '7 days', now()) $$,
  'B reads metrics of their own series');
select throws_ok($$ select public.series_metrics('d0000000-0000-4000-8000-0000000005aa', now() - interval '7 days', now()) $$,
  '42501', 'not allowed', 'B cannot read A''s series metrics');

-- ---------------------------------------------------------------- anonymous
reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*)::int from public.tracked_queries), 0, 'anon reads no tracked queries');
select is((select count(*)::int from public.snapshots where series_id = 'd0000000-0000-4000-8000-0000000005aa'), 0, 'anon reads no snapshots');
select is((select count(*)::int from public.pages where url_key like '%example.com/%'), 0, 'anon reads no pages');
select throws_ok($$ select public.series_metrics('d0000000-0000-4000-8000-0000000005aa', now() - interval '7 days', now()) $$,
  '42501', null, 'anon cannot call series_metrics');
select throws_ok($$ select public.my_queries() $$, '42501', null, 'anon cannot call my_queries');

reset role;
select * from finish();
rollback;
