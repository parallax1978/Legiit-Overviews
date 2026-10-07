-- series_history_start and create_due_reports: history starts at the first overview of the current
-- capture stretch, reports need enough overviews, and the refresh comes at day 28. Fixture times
-- are relative to now(); every expected outcome is worked out by hand in the comments.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(36);

insert into auth.users (id, email, aud, role) values
  ('e0000000-0000-4000-8000-000000000001', 'reports-test@example.com', 'authenticated', 'authenticated');

-- R1 rejoined idle: 10 days of overviews ending 70 days ago, then one capture now.
-- R2 watching flip: 10 days of absent renders, then overviews for 2 days.
-- R3 steady: 8 overviews a day from now - 8d + 1h on, captures continuing into the future so later
--    runs have data (only snapshots before the run time count).
-- R4 rare overview: 29 days of captures, one overview a day (every 8th render).
-- R5 old active series: 27 days of overviews; the user joins today.
-- R6 gaps: overviews with a 30-hour gap, then a 40-hour gap, then two more days.
insert into public.series (id, keyword, location_code, language_code, device, next_capture_at)
select ('e0000000-0000-4000-8000-00000000000' || n)::uuid, 'reports-test r' || n, 2840, 'en', 'desktop', '2030-01-01'
from generate_series(1, 6) n;

create function pg_temp.series(n int) returns uuid language sql immutable
  as $$ select ('e0000000-0000-4000-8000-00000000000' || n)::uuid $$;

-- R1
insert into public.snapshots (series_id, captured_at, status, content_hash, extraction)
select pg_temp.series(1), now() - interval '80 days' + n * interval '3 hours', 'present', 'h', 'done' from generate_series(0, 79) n;
insert into public.snapshots (series_id, captured_at, status, content_hash, extraction)
values (pg_temp.series(1), now() - interval '1 minute', 'present', 'h', 'pending');
-- R2
insert into public.snapshots (series_id, captured_at, status, extraction)
select pg_temp.series(2), now() - interval '12 days' + n * interval '3 hours', 'absent', 'none' from generate_series(0, 79) n;
insert into public.snapshots (series_id, captured_at, status, content_hash, extraction)
select pg_temp.series(2), now() - interval '2 days' + n * interval '3 hours', 'present', 'h', 'done' from generate_series(0, 15) n;
-- R3
insert into public.snapshots (series_id, captured_at, status, content_hash, extraction)
select pg_temp.series(3), now() - interval '8 days' + interval '1 hour' + n * interval '3 hours', 'present', 'h', 'done' from generate_series(0, 463) n;
-- R4
insert into public.snapshots (series_id, captured_at, status, content_hash, extraction)
select pg_temp.series(4), now() - interval '29 days' + n * interval '3 hours',
  case when n % 8 = 0 then 'present' else 'absent' end, case when n % 8 = 0 then 'h' end, case when n % 8 = 0 then 'done' else 'none' end
from generate_series(0, 231) n;
-- R5
insert into public.snapshots (series_id, captured_at, status, content_hash, extraction)
select pg_temp.series(5), now() - interval '27 days' + n * interval '3 hours', 'present', 'h', 'done' from generate_series(0, 215) n;
-- R6: an error render, overviews from -10d to -8d, a 30h gap, -6d18h to -5d, a 40h gap, -3d8h to -1d
insert into public.snapshots (series_id, captured_at, status, extraction) values (pg_temp.series(6), now() - interval '10 days' - interval '3 hours', 'error', 'none');
insert into public.snapshots (series_id, captured_at, status, content_hash, extraction)
select pg_temp.series(6), now() - interval '10 days' + n * interval '3 hours', 'present', 'h', 'done' from generate_series(0, 16) n;
insert into public.snapshots (series_id, captured_at, status, content_hash, extraction)
select pg_temp.series(6), now() - interval '6 days' - interval '18 hours' + n * interval '3 hours', 'present', 'h', 'done' from generate_series(0, 14) n;
insert into public.snapshots (series_id, captured_at, status, content_hash, extraction)
select pg_temp.series(6), now() - interval '3 days' - interval '8 hours' + n * interval '3 hours', 'present', 'h', 'done' from generate_series(0, 18) n;

insert into public.tracked_queries (id, user_id, series_id, display_keyword, status)
select ('e0000000-0000-4000-8000-0000000000a' || n)::uuid, 'e0000000-0000-4000-8000-000000000001', pg_temp.series(n), 'r' || n, 'tracking'
from generate_series(1, 6) n;

create function pg_temp.tq(n int) returns uuid language sql immutable
  as $$ select ('e0000000-0000-4000-8000-0000000000a' || n)::uuid $$;
create function pg_temp.due(at timestamptz, n int) returns text language sql as $$
  select coalesce(string_agg(r->>'kind', ',' order by r->>'kind'), '')
  from jsonb_array_elements(public.create_due_reports(at, array[pg_temp.tq(n)])) r
$$;

-- ---------------------------------------------------------------- series_history_start
select ok(public.series_history_start(pg_temp.series(1)) > now() - interval '2 minutes', 'R1: history restarts at the capture after the 70-day gap');
select ok(public.series_history_start(pg_temp.series(1), now() - interval '1 day') < now() - interval '70 days', 'R1: before that capture the old stretch is the history');
select ok(public.series_history_start(pg_temp.series(2)) between now() - interval '2 days' - interval '1 minute' and now() - interval '2 days' + interval '1 minute',
  'R2: history starts at the first overview, not the first absent render');
select ok(public.series_history_start(pg_temp.series(3)) between now() - interval '8 days' and now() - interval '7 days' - interval '22 hours',
  'R3: history starts at the first render');
select ok(public.series_history_start(pg_temp.series(6)) between now() - interval '3 days' - interval '9 hours' and now() - interval '3 days' - interval '7 hours',
  'R6: a 40-hour gap starts a new stretch, a 30-hour gap does not');
select is(public.series_history_start(pg_temp.series(6), now() - interval '4 days'), now() - interval '10 days',
  'R6: the earlier stretch spans the 30-hour gap; the error render before it does not count');
select is(public.series_history_start('e0000000-0000-4000-8000-0000000000ff'), null, 'no snapshots, no history');

-- ---------------------------------------------------------------- create_due_reports
select is(pg_temp.due(now(), 1), '', 'R1: one fresh capture after a long gap gets no report');
select is(pg_temp.due(now() + interval '7 days', 1), '', 'R1: nor a week later with no new captures');
select is(pg_temp.due(now(), 2), '', 'R2: two days of overviews after ten absent days is not enough');
select is(pg_temp.due(now() + interval '1 day', 2), 'preliminary', 'R2: the preliminary comes three days after the first overview');

select is(pg_temp.due(now(), 3), 'full', 'R3: eight days of overviews gets the full report');
select is((select count(*)::int from public.reports where tracked_query_id = pg_temp.tq(3)), 1, 'R3: one report');
select is((select renders from public.reports where tracked_query_id = pg_temp.tq(3)), 56, 'R3: the 7-day window holds 56 renders');
-- R3's history starts at now - 8d + 1h, so day 28 is now + 20d + 1h.
select is(pg_temp.due(now() + interval '20 days', 3), '', 'R3: no refresh an hour before day 28');
select is(pg_temp.due(now() + interval '21 days', 3), 'refresh', 'R3: the first refresh at day 28');
select is((select (window_end - window_start) from public.reports where tracked_query_id = pg_temp.tq(3) and kind = 'refresh'),
  interval '28 days', 'R3: the refresh window is 28 days');
select is(pg_temp.due(now() + interval '48 days', 3), '', 'R3: no second refresh 27 days after the first');
select is(pg_temp.due(now() + interval '49 days', 3), 'refresh', 'R3: the second refresh 28 days after the first');
select is((select count(*)::int from public.reports where tracked_query_id = pg_temp.tq(3) and kind = 'refresh'), 2, 'R3: two refreshes');

select is(pg_temp.due(now() - interval '2 days', 4), '', 'R4: seven overviews in a week is below the floor at day 27');
select is((select count(*)::int from public.reports where tracked_query_id = pg_temp.tq(4)), 0, 'R4: nothing created');
select is(pg_temp.due(now(), 4), 'full', 'R4: past day 28 the full report takes what there is');
select is((select kind from public.reports where tracked_query_id = pg_temp.tq(4)), 'full', 'R4: a full report, not a preliminary');

select is(pg_temp.due(now(), 5), 'full', 'R5: joining an active 27-day series gets the full report at once');
select is(pg_temp.due(now() + interval '1 day', 5), '', 'R5: day 28 is not a refresh one day after the full report');
select is(pg_temp.due(now() + interval '6 days', 5), '', 'R5: still not after six days');
select is(pg_temp.due(now() + interval '7 days', 5), 'refresh', 'R5: the refresh comes a week after the full report');

select is(pg_temp.due(now(), 6), 'preliminary', 'R6: the stretch after the 40-hour gap is 3d8h old: a preliminary, not the full report');
select is((select count(*)::int from public.reports where tracked_query_id = pg_temp.tq(6) and kind = 'full'), 0, 'R6: the ten days before the gap do not make a full report');

-- A paused query is skipped; a second run creates nothing new.
update public.tracked_queries set status = 'paused' where id = pg_temp.tq(2);
select is(pg_temp.due(now() + interval '1 day', 2), '', 'a paused query gets nothing');
select is(pg_temp.due(now() + interval '21 days', 3), '', 'a second run at the same time creates nothing');

-- my_queries.history_days uses the same start.
set local request.jwt.claims to '{"sub":"e0000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select (q->>'history_days')::int from jsonb_array_elements(public.my_queries()) q where q->>'display_keyword' = 'r1'), 0,
  'R1 history_days restarts with the stretch');
select is((select (q->>'history_days')::int from jsonb_array_elements(public.my_queries()) q where q->>'display_keyword' = 'r2'), 2,
  'R2 history_days counts from the first overview');
select is((select (q->>'history_days')::int from jsonb_array_elements(public.my_queries()) q where q->>'display_keyword' = 'r3'), 7,
  'R3 history_days is 7 (8 days less an hour)');
select is((select (q->>'history_days')::int from jsonb_array_elements(public.my_queries()) q where q->>'display_keyword' = 'r6'), 3,
  'R6 history_days counts from the current stretch');

select * from finish();
rollback;
