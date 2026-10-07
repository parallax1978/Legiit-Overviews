-- series_metrics and metric_evidence on hand-built fixture series. Every expected value is worked out
-- by hand in the comments next to the fixture. Runs inside one transaction and rolls back.
begin;
set local client_min_messages = warning;
create extension if not exists pgtap with schema extensions;
select plan(113);

-- The service role may read any series.
set local request.jwt.claims to '{"role":"service_role"}';

-- ============================================================== fixture A
-- Window [2026-01-05 00:00, 2026-01-07 00:00) UTC. 12 snapshots inside, one either side outside.
--
--   id   time (UTC)      status   hash  cites (url idx)       organic rank       formats
--   S0   01-04 21:00     present  Z     U2                    -                  (outside)
--   S1   01-05 00:00     present  A     U1, U2, U1 (dup)      U1 3, U2 12        100w ranked_list, table
--   S2   01-05 03:00     present  A     U1, U2                U1 3, U2 12        100w ranked_list, table
--   S3   01-05 06:00     absent   -     -                     -                  0w
--   S4   01-05 09:00     present  B     U1, U2                U1 3, U2 12        120w ranked_list
--   S5   01-05 12:00     error    -     -                     -                  -
--   S6   01-05 15:00     present  B     U1, U2                U1 3, U2 12        130w ranked_list
--   S7   01-06 00:00     present  C     U1, U3                U1 15              80w bullets
--   S8   01-06 03:00     present  C     U1, U3                U1 15              80w bullets
--   S9   01-06 06:00     present  A     U1, U3                U1 15              200w bullets
--   S10  01-06 09:00     present  D     U1                    other url 1        150w ranked_list, best_for_labels
--   S11  01-06 12:00     present  D     U4                    U4 1               150w ranked_list, best_for_labels
--   S12  01-06 15:00     present  D     U4                    U4 1               150w ranked_list, best_for_labels
--   S13  01-07 00:00     present  E     U3                    -                  (outside: the window end is exclusive)
--
-- renders = 11 (10 present + S3 absent), errors = 1 (S5), present = 10, days = 2
-- presence_rate = 10/11 = 0.9091; confidence medium (10..20 renders)
-- change_rate: non-error sequence A A absent B B C C A D D D -> 5 changes / 10 transitions = 0.5
--   (S5 is skipped, so S4 -> S6 is B -> B; S0 outside would have made S1 a change)
--
-- url sets: S1,S2,S4,S6 {U1,U2}; S7,S8,S9 {U1,U3}; S10 {U1}; S11,S12 {U4}
--   pairs 45; Jaccard sum: within groups 6+3+1 = 10, {U1,U2}x{U1,U3} 12 x 1/3 = 4,
--   {U1,U2}x{U1} 4 x 1/2 = 2, {U1,U3}x{U1} 3 x 1/2 = 1.5 -> 17.5/45 = 0.3889
-- domain sets (U1 jotform, U2 zapier, U3 youtube, U4 zapier): {J,Z} x4, {J,Y} x3, {J} x1, {Z} x2
--   sum 10 + 4 + 2 + 1.5 + {J,Z}x{Z} 8 x 1/2 = 4 -> 21.5/45 = 0.4778
-- citations_per_render = (4x2 + 3x2 + 1 + 2x1) / 10 = 17/10 = 1.7 (S1's duplicate U1 counts once)
-- organic overlap over the 17 (render, url) occurrences: top10 = U1 x4 + U4 x2 = 6/17 = 0.3529,
--   top20 adds U1 x3 (rank 15) and U2 x4 (rank 12) = 13/17 = 0.7647
-- median word count of present renders: 80 80 100 100 120 130 150 150 150 200 -> (120+130)/2 = 125
-- formats: ranked_list 7 (0.7), best_for_labels 3 (0.3), bullets 3 (0.3), table 2 (0.2)

insert into public.series (id, keyword, location_code, language_code, device, next_capture_at) values
  ('a0000000-0000-4000-8000-000000000001', 'metrics-test best form builder', 2840, 'en', 'desktop', '2030-01-01'),
  ('b0000000-0000-4000-8000-000000000001', 'metrics-test stability', 2840, 'en', 'desktop', '2030-01-01');

-- lead = answer_lead_sentence Claude marked (null: no direct answer):
--   S1 0, S2 0, S4 1, S6 1, S7 2, S8 3, S9 3, S10 null, S11 0, S12 0
--   -> answer first 4/10 = 0.4, no answer 1/10 = 0.1, median of 0 0 0 0 1 1 2 3 3 = 1
create temp table fx_snap (n int, at timestamptz, status text, hash text, words int, labels text[], lead int) on commit drop;
insert into fx_snap values
  (0,  '2026-01-04 21:00Z', 'present', 'Z', 90,  '{ranked_list}', 0),
  (1,  '2026-01-05 00:00Z', 'present', 'A', 100, '{ranked_list,table}', 0),
  (2,  '2026-01-05 03:00Z', 'present', 'A', 100, '{ranked_list,table}', 0),
  (3,  '2026-01-05 06:00Z', 'absent',  null, 0,  null, null),
  (4,  '2026-01-05 09:00Z', 'present', 'B', 120, '{ranked_list}', 1),
  (5,  '2026-01-05 12:00Z', 'error',   null, null, null, null),
  (6,  '2026-01-05 15:00Z', 'present', 'B', 130, '{ranked_list}', 1),
  (7,  '2026-01-06 00:00Z', 'present', 'C', 80,  '{bullets}', 2),
  (8,  '2026-01-06 03:00Z', 'present', 'C', 80,  '{bullets}', 3),
  (9,  '2026-01-06 06:00Z', 'present', 'A', 200, '{bullets}', 3),
  (10, '2026-01-06 09:00Z', 'present', 'D', 150, '{ranked_list,best_for_labels}', null),
  (11, '2026-01-06 12:00Z', 'present', 'D', 150, '{ranked_list,best_for_labels}', 0),
  (12, '2026-01-06 15:00Z', 'present', 'D', 150, '{ranked_list,best_for_labels}', 0),
  (13, '2026-01-07 00:00Z', 'present', 'E', 90,  '{table}', null);

create function pg_temp.sid(n int) returns uuid language sql immutable
  as $$ select ('a0000000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid $$;

-- Every present snapshot has the same four sentences: 0 cites [0], 1 none, 2 cites [1], 3 none.
insert into public.snapshots (id, series_id, captured_at, status, content_hash, sentences, organic, formats, extraction)
select pg_temp.sid(n), 'a0000000-0000-4000-8000-000000000001', at, status, hash,
  case when status = 'present' then '[
    {"i":0,"text":"Jotform is the best overall form builder.","block":0,"kind":"paragraph","citations":[0]},
    {"i":1,"text":"It has a free plan.","block":0,"kind":"paragraph","citations":[]},
    {"i":2,"text":"Tally is the best free option.","block":1,"kind":"list_item","citations":[1]},
    {"i":3,"text":"Typeform has the best design.","block":2,"kind":"list_item","citations":[]}]'::jsonb
  else '[]'::jsonb end,
  case
    when n in (1, 2, 4, 6) then '[{"rank":3,"url":"https://www.jotform.com/blog/best-form-builders/","url_key":"jotform.com/blog/best-form-builders","reg_domain":"jotform.com","title":null},
                                 {"rank":12,"url":"https://zapier.com/blog/best-online-form-builder-software/","url_key":"zapier.com/blog/best-online-form-builder-software","reg_domain":"zapier.com","title":null}]'::jsonb
    when n in (7, 8, 9) then '[{"rank":15,"url":"https://www.jotform.com/blog/best-form-builders/","url_key":"jotform.com/blog/best-form-builders","reg_domain":"jotform.com","title":null}]'::jsonb
    when n = 10 then '[{"rank":1,"url":"https://example.com/x","url_key":"example.com/x","reg_domain":"example.com","title":null}]'::jsonb
    when n in (11, 12) then '[{"rank":1,"url":"https://zapier.com/blog/tally-review/","url_key":"zapier.com/blog/tally-review","reg_domain":"zapier.com","title":null}]'::jsonb
    when n = 3 then '[{"rank":1,"url":"https://www.jotform.com/blog/best-form-builders/","url_key":"jotform.com/blog/best-form-builders","reg_domain":"jotform.com","title":null}]'::jsonb
    else '[]'::jsonb end,
  case when words is null then '{}'::jsonb
       else jsonb_build_object('word_count', words) || coalesce(jsonb_build_object('labels', to_jsonb(labels)), '{}'::jsonb)
            || case when status = 'present' then jsonb_build_object('answer_lead_sentence', lead) else '{}'::jsonb end end,
  case when status = 'present' then 'done' else 'none' end
from fx_snap;

create temp table fx_url (u text, url text, url_key text, host text, reg text, title text, passage text) on commit drop;
insert into fx_url values
  ('U1', 'https://www.jotform.com/blog/best-form-builders/', 'jotform.com/blog/best-form-builders', 'jotform.com', 'jotform.com', 'Best form builders', 'Jotform is the best overall form builder.'),
  ('U2', 'https://zapier.com/blog/best-online-form-builder-software/', 'zapier.com/blog/best-online-form-builder-software', 'zapier.com', 'zapier.com', 'The best online form builders', 'Tally has a generous free plan.'),
  ('U3', 'https://www.youtube.com/watch?v=abc', 'youtube.com/watch?v=abc', 'youtube.com', 'youtube.com', 'Form builders compared', null),
  ('U4', 'https://zapier.com/blog/tally-review/', 'zapier.com/blog/tally-review', 'zapier.com', 'zapier.com', 'Tally review', 'Tally is free.');

insert into public.citations (snapshot_id, idx, url, url_key, host, reg_domain, title, passage)
select pg_temp.sid(c.n), c.idx, u.url, u.url_key, u.host, u.reg, u.title, u.passage
from (values
  (0, 0, 'U2'),
  (1, 0, 'U1'), (1, 1, 'U2'), (1, 2, 'U1'),
  (2, 0, 'U1'), (2, 1, 'U2'),
  (4, 0, 'U1'), (4, 1, 'U2'),
  (6, 0, 'U1'), (6, 1, 'U2'),
  (7, 0, 'U1'), (7, 1, 'U3'),
  (8, 0, 'U1'), (8, 1, 'U3'),
  (9, 0, 'U1'), (9, 1, 'U3'),
  (10, 0, 'U1'),
  (11, 0, 'U4'),
  (12, 0, 'U4'),
  (13, 0, 'U3')
) as c(n, idx, u)
join fx_url u on u.u = c.u;

-- Claim groups. GM was merged into G1: its rows must not count anywhere.
--   G1 renders S1 S2 S4 S6 S7 S8 S9 S10 = 8 -> 0.8 core; 9 rows (S1 twice), 8 cited -> cited_share 0.8889;
--      types fact + recommendation; first 01-05 00:00, last 01-06 09:00
--   G3 renders S2 S4 S6 S7 S8 S9 S10 = 7 -> 0.7 recurring; all cited -> 1
--   G2 renders S1 S4 S11 S12 = 4 -> 0.4 recurring; never cited -> unsupported
--   G4 renders S7 S8 S9 = 3 -> 0.3 rotating; never cited but under 0.4 -> not unsupported
--   G6 renders S1 = 1 -> 0.1 rotating (dropped on day 2)
--   G5 only outside the window -> absent from the result
insert into public.claim_groups (id, series_id, label, merged_into) values
  ('a0000000-0000-4000-8000-000000000201', 'a0000000-0000-4000-8000-000000000001', 'Jotform is the best overall form builder', null),
  ('a0000000-0000-4000-8000-000000000202', 'a0000000-0000-4000-8000-000000000001', 'Tally has a free plan', null),
  ('a0000000-0000-4000-8000-000000000203', 'a0000000-0000-4000-8000-000000000001', 'Jotform has 10,000 templates', null),
  ('a0000000-0000-4000-8000-000000000204', 'a0000000-0000-4000-8000-000000000001', 'Typeform has the best design', null),
  ('a0000000-0000-4000-8000-000000000205', 'a0000000-0000-4000-8000-000000000001', 'Outside the window', null),
  ('a0000000-0000-4000-8000-000000000206', 'a0000000-0000-4000-8000-000000000001', 'Wufoo is discontinued', null);
insert into public.claim_groups (id, series_id, label, merged_into) values
  ('a0000000-0000-4000-8000-000000000207', 'a0000000-0000-4000-8000-000000000001', 'Jotform is best (duplicate)', 'a0000000-0000-4000-8000-000000000201');

insert into public.claims (snapshot_id, group_id, sentence, text, type, citation_idx)
select pg_temp.sid(c.n), ('a0000000-0000-4000-8000-00000000020' || c.g)::uuid, c.sentence, c.text, c.type, c.cites::int[]
from (values
  (1, 1, 0, 'Jotform is the best overall form builder', 'recommendation', '{0}'),
  (1, 1, 1, 'Jotform has a free plan', 'fact', '{}'),
  (2, 1, 0, 'Jotform is the best overall form builder', 'recommendation', '{0}'),
  (4, 1, 0, 'Jotform is the best overall form builder', 'recommendation', '{0}'),
  (6, 1, 0, 'Jotform is the best overall form builder', 'recommendation', '{0}'),
  (7, 1, 0, 'Jotform is the best overall form builder', 'recommendation', '{0}'),
  (8, 1, 0, 'Jotform is the best overall form builder', 'recommendation', '{0}'),
  (9, 1, 0, 'Jotform is the best overall form builder', 'recommendation', '{0}'),
  (10, 1, 0, 'Jotform is the best overall form builder', 'recommendation', '{0}'),
  (1, 2, 1, 'Tally has a free plan', 'fact', '{}'),
  (4, 2, 1, 'Tally has a free plan', 'fact', '{}'),
  (11, 2, 1, 'Tally has a free plan', 'fact', '{}'),
  (12, 2, 1, 'Tally has a free plan', 'fact', '{}'),
  (2, 3, 0, 'Jotform has 10,000 templates', 'fact', '{0}'),
  (4, 3, 0, 'Jotform has 10,000 templates', 'fact', '{0}'),
  (6, 3, 0, 'Jotform has 10,000 templates', 'fact', '{0}'),
  (7, 3, 0, 'Jotform has 10,000 templates', 'fact', '{0}'),
  (8, 3, 0, 'Jotform has 10,000 templates', 'fact', '{0}'),
  (9, 3, 0, 'Jotform has 10,000 templates', 'fact', '{0}'),
  (10, 3, 0, 'Jotform has 10,000 templates', 'fact', '{0}'),
  (7, 4, 3, 'Typeform has the best design', 'comparison', '{}'),
  (8, 4, 3, 'Typeform has the best design', 'comparison', '{}'),
  (9, 4, 3, 'Typeform has the best design', 'comparison', '{}'),
  (0, 5, 0, 'Outside the window', 'fact', '{0}'),
  (13, 5, 0, 'Outside the window', 'fact', '{0}'),
  (1, 6, 3, 'Wufoo is discontinued', 'caveat', '{}'),
  (12, 7, 0, 'Jotform is best', 'recommendation', '{0}')
) as c(n, g, sentence, text, type, cites);

-- Entities. E3 was merged into E1.
--   E1 Jotform  renders S1 S2 S4 S6 S7 S8 S9 S10 = 8 (0.8 core); recommended S1 S2 S4 S6 = 4 (0.4); labels {best overall}
--   E2 Tally    renders S1 S2 S11 S12 = 4 (0.4 recurring); recommended S11 = 1 (0.1); labels {best free option}
--   E4 Typeform renders S9 = 1 (0.1 rotating), added on day 2
--   E5 Wufoo    renders S2 = 1 (0.1 rotating), dropped on day 2
insert into public.entities (id, series_id, name, merged_into) values
  ('a0000000-0000-4000-8000-000000000301', 'a0000000-0000-4000-8000-000000000001', 'Jotform', null),
  ('a0000000-0000-4000-8000-000000000302', 'a0000000-0000-4000-8000-000000000001', 'Tally', null),
  ('a0000000-0000-4000-8000-000000000304', 'a0000000-0000-4000-8000-000000000001', 'Typeform', null),
  ('a0000000-0000-4000-8000-000000000305', 'a0000000-0000-4000-8000-000000000001', 'Wufoo', null);
insert into public.entities (id, series_id, name, merged_into) values
  ('a0000000-0000-4000-8000-000000000303', 'a0000000-0000-4000-8000-000000000001', 'Jotform Inc', 'a0000000-0000-4000-8000-000000000301');

insert into public.entity_mentions (entity_id, snapshot_id, role, label, sentences)
select ('a0000000-0000-4000-8000-00000000030' || m.e)::uuid, pg_temp.sid(m.n), m.role, m.label, m.sentences::int[]
from (values
  (1, 1, 'recommended', 'best overall', '{0}'),
  (1, 2, 'recommended', 'best overall', '{0}'),
  (1, 4, 'recommended', null, '{0}'),
  (1, 6, 'recommended', null, '{0}'),
  (1, 7, 'mentioned', null, '{0}'),
  (1, 8, 'mentioned', null, '{0}'),
  (1, 9, 'mentioned', null, '{0}'),
  (1, 10, 'mentioned', null, '{0,1}'),
  (2, 1, 'mentioned', null, '{2}'),
  (2, 2, 'mentioned', null, '{2}'),
  (2, 11, 'recommended', 'best free option', '{2}'),
  (2, 12, 'mentioned', null, '{2}'),
  (3, 12, 'recommended', 'enterprise pick', '{0}'),
  (4, 9, 'mentioned', null, '{3}'),
  (5, 2, 'mentioned', null, '{3}')
) as m(e, n, role, label, sentences);

create temp table m as
select public.series_metrics('a0000000-0000-4000-8000-000000000001', '2026-01-05 00:00Z', '2026-01-07 00:00Z') as j;

-- ---------------------------------------------------------------- headline numbers
select is((select j->'window'->>'from' from m)::timestamptz, '2026-01-05 00:00Z'::timestamptz, 'window from');
select is((select j->'window'->>'to' from m)::timestamptz, '2026-01-07 00:00Z'::timestamptz, 'window to');
select is((select (j->>'renders')::int from m), 11, 'renders exclude errors and count absent');
select is((select (j->>'present')::int from m), 10, 'present');
select is((select (j->>'errors')::int from m), 1, 'errors');
select is((select (j->>'days')::int from m), 2, 'days with a non-error render');
select is((select (j->>'extracted')::int from m), 10, 'every present render is extracted');
select is((select (j->>'extraction_pending')::int from m), 0, 'none awaiting extraction');
select is((select (j->>'presence_rate')::numeric from m), 0.9091, 'presence rate 10/11');
select is((select (j->>'change_rate')::numeric from m), 0.5, 'change rate 5/10, error skipped, absent is a state');
select is((select j->>'confidence' from m), 'medium', 'confidence medium at 11 renders');
select is((select (j->'citation_stability'->>'url')::numeric from m), 0.3889, 'url stability 17.5/45');
select is((select (j->'citation_stability'->>'domain')::numeric from m), 0.4778, 'domain stability 21.5/45');
select is((select (j->>'citations_per_render')::numeric from m), 1.7, 'distinct cited urls per present render');
select is((select (j->>'median_word_count')::numeric from m), 125::numeric, 'median word count of present renders');
select is((select j->'answer_lead' from m),
  '{"n":10,"answer_first_share":0.4,"no_answer_share":0.1,"median_sentence":1}'::jsonb,
  'answer-lead position over extracted renders');
select is((select (j->'organic_overlap'->>'top10')::numeric from m), 0.3529, 'organic overlap top 10 = 6/17');
select is((select (j->'organic_overlap'->>'top20')::numeric from m), 0.7647, 'organic overlap top 20 = 13/17');

-- ---------------------------------------------------------------- claims
select is((select jsonb_array_length(j->'claims') from m), 5, 'five live claim groups in the window (merged and outside excluded)');
select is((select jsonb_agg(c->>'label') from m, jsonb_array_elements(j->'claims') c),
  '["Jotform is the best overall form builder","Jotform has 10,000 templates","Tally has a free plan","Typeform has the best design","Wufoo is discontinued"]'::jsonb,
  'claims ordered by share');
select is((select j->'claims'->0->>'group_id' from m), 'a0000000-0000-4000-8000-000000000201', 'G1 id');
select is((select (j->'claims'->0->>'renders')::int from m), 8, 'G1 renders (merged duplicate in S12 not counted)');
select is((select (j->'claims'->0->>'share')::numeric from m), 0.8, 'G1 share');
select is((select j->'claims'->0->>'bucket' from m), 'core', 'G1 at 0.8 is core');
select is((select (j->'claims'->0->>'first_seen')::timestamptz from m), '2026-01-05 00:00Z'::timestamptz, 'G1 first seen');
select is((select (j->'claims'->0->>'last_seen')::timestamptz from m), '2026-01-06 09:00Z'::timestamptz, 'G1 last seen');
select is((select (j->'claims'->0->>'cited_share')::numeric from m), 0.8889, 'G1 cited share 8/9 rows');
select is((select j->'claims'->0->'types' from m), '["fact","recommendation"]'::jsonb, 'G1 types');
select is((select (j->'claims'->1->>'share')::numeric from m), 0.7, 'G3 share');
select is((select j->'claims'->1->>'bucket' from m), 'recurring', 'G3 at 0.7 is recurring');
select is((select (j->'claims'->1->>'cited_share')::numeric from m), 1::numeric, 'G3 always cited');
select is((select (j->'claims'->1->>'first_seen')::timestamptz from m), '2026-01-05 03:00Z'::timestamptz, 'G3 first seen');
select is((select (j->'claims'->2->>'renders')::int from m), 4, 'G2 renders');
select is((select j->'claims'->2->>'bucket' from m), 'recurring', 'G2 at 0.4 is recurring');
select is((select (j->'claims'->2->>'cited_share')::numeric from m), 0::numeric, 'G2 never cited');
select is((select (j->'claims'->2->>'last_seen')::timestamptz from m), '2026-01-06 15:00Z'::timestamptz, 'G2 last seen');
select is((select (j->'claims'->3->>'share')::numeric from m), 0.3, 'G4 share');
select is((select j->'claims'->3->>'bucket' from m), 'rotating', 'G4 at 0.3 is rotating');
select is((select j->'claims'->3->'types' from m), '["comparison"]'::jsonb, 'G4 types');
select is((select (j->'claims'->4->>'renders')::int from m), 1, 'G6 renders');
select is((select j->'claims'->4->>'bucket' from m), 'rotating', 'G6 rotating');

select is((select j->'unsupported_claims' from m),
  '[{"group_id":"a0000000-0000-4000-8000-000000000202","label":"Tally has a free plan","share":0.4}]'::jsonb,
  'unsupported: share >= 0.4 and never cited');

-- ---------------------------------------------------------------- entities
select is((select jsonb_agg(e->>'name') from m, jsonb_array_elements(j->'entities') e),
  '["Jotform","Tally","Typeform","Wufoo"]'::jsonb, 'entities ordered by share then name, merged excluded');
select is((select (j->'entities'->0->>'renders')::int from m), 8, 'Jotform renders (merged mention not counted)');
select is((select (j->'entities'->0->>'share')::numeric from m), 0.8, 'Jotform share');
select is((select (j->'entities'->0->>'recommended_renders')::int from m), 4, 'Jotform recommended renders');
select is((select (j->'entities'->0->>'recommended_share')::numeric from m), 0.4, 'Jotform recommended share');
select is((select j->'entities'->0->'labels' from m), '["best overall"]'::jsonb, 'Jotform labels');
select is((select j->'entities'->0->>'bucket' from m), 'core', 'Jotform core');
select is((select (j->'entities'->1->>'share')::numeric from m), 0.4, 'Tally share');
select is((select (j->'entities'->1->>'recommended_share')::numeric from m), 0.1, 'Tally recommended share');
select is((select j->'entities'->1->'labels' from m), '["best free option"]'::jsonb, 'Tally labels');
select is((select j->'entities'->1->>'bucket' from m), 'recurring', 'Tally recurring');
select is((select (j->'entities'->2->>'recommended_renders')::int from m), 0, 'Typeform never recommended');
select is((select j->'entities'->2->'labels' from m), '[]'::jsonb, 'Typeform has no labels');
select is((select j->'entities'->3->>'bucket' from m), 'rotating', 'Wufoo rotating');

-- ---------------------------------------------------------------- sources and domains
select is((select jsonb_agg(s->>'url_key') from m, jsonb_array_elements(j->'sources') s),
  '["jotform.com/blog/best-form-builders","zapier.com/blog/best-online-form-builder-software","youtube.com/watch?v=abc","zapier.com/blog/tally-review"]'::jsonb,
  'sources ordered by share');
select is((select j->'sources'->0 from m),
  '{"url_key":"jotform.com/blog/best-form-builders","url":"https://www.jotform.com/blog/best-form-builders/","reg_domain":"jotform.com","title":"Best form builders","renders":8,"share":0.8,"bucket":"core","platform":false,"organic_top10_share":0.5}'::jsonb,
  'U1: 8 renders, top 10 in 4 of them');
select is((select (j->'sources'->1->>'share')::numeric from m), 0.4, 'U2 share');
select is((select j->'sources'->1->>'bucket' from m), 'recurring', 'U2 recurring');
select is((select (j->'sources'->1->>'organic_top10_share')::numeric from m), 0::numeric, 'U2 ranks 12, never top 10');
select is((select (j->'sources'->2->>'platform')::boolean from m), true, 'YouTube is a platform');
select is((select j->'sources'->2->>'bucket' from m), 'rotating', 'U3 rotating');
select is((select (j->'sources'->3->>'organic_top10_share')::numeric from m), 1::numeric, 'U4 ranks 1 in both citing renders');
select is((select (j->'sources'->3->>'renders')::int from m), 2, 'U4 renders');

select is((select j->'domains' from m),
  '[{"reg_domain":"jotform.com","renders":8,"share":0.8,"bucket":"core","platform":false},
    {"reg_domain":"zapier.com","renders":6,"share":0.6,"bucket":"recurring","platform":false},
    {"reg_domain":"youtube.com","renders":3,"share":0.3,"bucket":"rotating","platform":true}]'::jsonb,
  'domains: zapier counts each render once across two urls');

-- ---------------------------------------------------------------- formats
select is((select j->'formats' from m),
  '[{"label":"ranked_list","renders":7,"share":0.7},{"label":"best_for_labels","renders":3,"share":0.3},
    {"label":"bullets","renders":3,"share":0.3},{"label":"table","renders":2,"share":0.2}]'::jsonb,
  'format labels over present renders');

-- ---------------------------------------------------------------- daily
-- Day 1 (01-05): renders 5, present 4; first day in the window, so no diff.
-- Day 2 (01-06): renders 6, present 6. claims {G1,G2,G3,G6} -> {G1,G2,G3,G4}: added G4, dropped G6.
--   entities {E1,E2,E5} -> {E1,E2,E4}: added Typeform, dropped Wufoo. urls {U1,U2} -> {U1,U3,U4}.
select is((select jsonb_array_length(j->'daily') from m), 2, 'two days');
select is((select j->'daily'->0 from m),
  '{"day":"2026-01-05","renders":5,"present":4,"claims_added":[],"claims_dropped":[],"entities_added":[],
    "entities_dropped":[],"citations_added":[],"citations_dropped":[]}'::jsonb,
  'day 1 has nothing to compare with');
select is((select j->'daily'->1->>'day' from m), '2026-01-06', 'day 2');
select is((select (j->'daily'->1->>'renders')::int from m), 6, 'day 2 renders');
select is((select (j->'daily'->1->>'present')::int from m), 6, 'day 2 present');
select is((select j->'daily'->1->'claims_added' from m),
  '[{"group_id":"a0000000-0000-4000-8000-000000000204","label":"Typeform has the best design"}]'::jsonb, 'claims added');
select is((select j->'daily'->1->'claims_dropped' from m),
  '[{"group_id":"a0000000-0000-4000-8000-000000000206","label":"Wufoo is discontinued"}]'::jsonb, 'claims dropped');
select is((select j->'daily'->1->'entities_added' from m),
  '[{"entity_id":"a0000000-0000-4000-8000-000000000304","name":"Typeform"}]'::jsonb, 'entities added');
select is((select j->'daily'->1->'entities_dropped' from m),
  '[{"entity_id":"a0000000-0000-4000-8000-000000000305","name":"Wufoo"}]'::jsonb, 'entities dropped');
select is((select j->'daily'->1->'citations_added' from m),
  '[{"url_key":"youtube.com/watch?v=abc","reg_domain":"youtube.com"},{"url_key":"zapier.com/blog/tally-review","reg_domain":"zapier.com"}]'::jsonb,
  'citations added');
select is((select j->'daily'->1->'citations_dropped' from m),
  '[{"url_key":"zapier.com/blog/best-online-form-builder-software","reg_domain":"zapier.com"}]'::jsonb, 'citations dropped');

-- ============================================================== fixture B: stability on three known sets
-- T1 {x.com/a, x.com/b, y.com/c}  T2 {x.com/a, x.com/b}  T3 {y.com/c, y.com/d}  T4 error
-- url Jaccard: T1-T2 2/3, T1-T3 1/4, T2-T3 0 -> (0.6667 + 0.25 + 0) / 3 = 0.3056
-- domain sets {x,y} {x} {y}: 1/2, 1/2, 0 -> 1/3 = 0.3333
insert into public.snapshots (id, series_id, captured_at, status, content_hash, extraction) values
  ('b0000000-0000-4000-8000-000000000101', 'b0000000-0000-4000-8000-000000000001', '2026-02-01 00:00Z', 'present', 'h1', 'done'),
  ('b0000000-0000-4000-8000-000000000102', 'b0000000-0000-4000-8000-000000000001', '2026-02-01 03:00Z', 'present', 'h2', 'done'),
  ('b0000000-0000-4000-8000-000000000103', 'b0000000-0000-4000-8000-000000000001', '2026-02-01 06:00Z', 'present', 'h2', 'done'),
  ('b0000000-0000-4000-8000-000000000104', 'b0000000-0000-4000-8000-000000000001', '2026-02-01 09:00Z', 'error', null, 'none');
insert into public.citations (snapshot_id, idx, url, url_key, host, reg_domain) values
  ('b0000000-0000-4000-8000-000000000101', 0, 'https://x.com/a', 'x.com/a', 'x.com', 'x.com'),
  ('b0000000-0000-4000-8000-000000000101', 1, 'https://x.com/b', 'x.com/b', 'x.com', 'x.com'),
  ('b0000000-0000-4000-8000-000000000101', 2, 'https://y.com/c', 'y.com/c', 'y.com', 'y.com'),
  ('b0000000-0000-4000-8000-000000000102', 0, 'https://x.com/a', 'x.com/a', 'x.com', 'x.com'),
  ('b0000000-0000-4000-8000-000000000102', 1, 'https://x.com/b', 'x.com/b', 'x.com', 'x.com'),
  ('b0000000-0000-4000-8000-000000000103', 0, 'https://y.com/c', 'y.com/c', 'y.com', 'y.com'),
  ('b0000000-0000-4000-8000-000000000103', 1, 'https://y.com/d', 'y.com/d', 'y.com', 'y.com');

create temp table mb as
select public.series_metrics('b0000000-0000-4000-8000-000000000001', '2026-02-01 00:00Z', '2026-02-01 08:00Z') as j;
select is((select (j->'citation_stability'->>'url')::numeric from mb), 0.3056, 'url stability on three known sets');
select is((select (j->'citation_stability'->>'domain')::numeric from mb), 0.3333, 'domain stability on three known sets');
select is((select (j->>'change_rate')::numeric from mb), 0.5, 'h1 -> h2 -> h2: one change in two transitions');
select is((select j->>'confidence' from mb), 'low', 'three renders is low confidence');
select is((select (j->>'citations_per_render')::numeric from mb), 2.3333, '7 citations over 3 renders');
select is((select (j->'organic_overlap'->>'top10')::numeric from mb), 0::numeric, 'no organic results means no overlap');
select is((select j->'median_word_count' from mb), 'null'::jsonb, 'no word counts recorded');

-- A window holding only an error render: every rate is null, not zero.
create temp table me as
select public.series_metrics('b0000000-0000-4000-8000-000000000001', '2026-02-01 08:00Z', '2026-02-01 12:00Z') as j;
select is((select (j->>'renders')::int from me), 0, 'no renders');
select is((select (j->>'errors')::int from me), 1, 'one error');
select is((select (j->>'days')::int from me), 0, 'no day with a render');
select is((select j->'presence_rate' from me), 'null'::jsonb, 'presence rate null');
select is((select j->'change_rate' from me), 'null'::jsonb, 'change rate null');
select is((select j->'citation_stability' from me), '{"url":null,"domain":null}'::jsonb, 'stability null');
select is((select j->'citations_per_render' from me), 'null'::jsonb, 'citations per render null');
select is((select j->'organic_overlap' from me), '{"top10":null,"top20":null}'::jsonb, 'overlap null');
select is((select j->>'confidence' from me), 'low', 'low confidence');
select is((select j->'claims' from me), '[]'::jsonb, 'no claims');
select is((select j->'daily'->0->>'renders' from me), '0', 'the error day is listed with zero renders');

-- ============================================================== metric_evidence
create function pg_temp.ev(kind text, key text, lim int default 50) returns jsonb language sql as $$
  select public.metric_evidence('a0000000-0000-4000-8000-000000000001', kind, key, '2026-01-05 00:00Z', '2026-01-07 00:00Z', lim)
$$;

select is((select (pg_temp.ev('claim', 'a0000000-0000-4000-8000-000000000201')->>'total')::int), 8, 'claim evidence: 8 renders');
select is((select pg_temp.ev('claim', 'a0000000-0000-4000-8000-000000000201')->'items'->0->>'snapshot_id'),
  'a0000000-0000-4000-8000-000000000110', 'most recent first');
select is((select pg_temp.ev('claim', 'a0000000-0000-4000-8000-000000000201')->'items'->0->'sentences'),
  '[{"i":0,"text":"Jotform is the best overall form builder.","citations":[0]}]'::jsonb, 'the claim sentence with its citations');
select is((select pg_temp.ev('claim', 'a0000000-0000-4000-8000-000000000201')->'items'->7->>'note'),
  'Jotform has a free plan / Jotform is the best overall form builder', 'S1 holds two claim rows of the group');
select is((select jsonb_array_length(pg_temp.ev('claim', 'a0000000-0000-4000-8000-000000000201')->'items'->7->'sentences')), 2, 'both sentences of S1');
select is((select (pg_temp.ev('claim', 'a0000000-0000-4000-8000-000000000207')->>'total')::int), 8, 'a merged group resolves to its survivor');
select is((select jsonb_array_length(pg_temp.ev('claim', 'a0000000-0000-4000-8000-000000000201', 3)->'items')), 3, 'limit');
select is((select (pg_temp.ev('unsupported', 'a0000000-0000-4000-8000-000000000202')->>'total')::int), 4, 'unsupported evidence');
select is((select (pg_temp.ev('entity', 'a0000000-0000-4000-8000-000000000302')->>'total')::int), 4, 'entity evidence');
select is((select pg_temp.ev('entity', 'a0000000-0000-4000-8000-000000000302')->'items'->1->>'note'),
  'recommended: best free option', 'entity note is role and label');
select is((select (pg_temp.ev('source', 'jotform.com/blog/best-form-builders')->>'total')::int), 8, 'source evidence');
select is((select pg_temp.ev('source', 'jotform.com/blog/best-form-builders')->'items'->7->'sentences'),
  '[{"i":0,"text":"Jotform is the best overall form builder.","citations":[0]}]'::jsonb, 'sentences citing the url');
select is((select pg_temp.ev('source', 'jotform.com/blog/best-form-builders')->'items'->0->>'note'),
  'Jotform is the best overall form builder.', 'source note is the passage');
select is((select (pg_temp.ev('domain', 'zapier.com')->>'total')::int), 6, 'domain evidence');
select is((select pg_temp.ev('domain', 'zapier.com')->'items'->0->'sentences'->0->>'i'), '0', 'S12 cites zapier at idx 0');
select is((select (pg_temp.ev('format', 'table')->>'total')::int), 2, 'format evidence');
select is((select pg_temp.ev('format', 'table')->'items'->0->'sentences'), '[]'::jsonb, 'formats carry no sentences');
select throws_ok($$ select pg_temp.ev('nonsense', 'x') $$, '22023', null, 'unknown kind is rejected');
select throws_ok($$ select pg_temp.ev('claim', 'not-a-uuid') $$, '22023', null, 'claim keys must be uuids');

-- ============================================================== extraction pending, whole-day diffs
-- S14 01-06 18:00 present, extraction pending, cites U1, no claims yet. S15 01-08 03:00 the same with U3.
insert into public.snapshots (id, series_id, captured_at, status, content_hash, sentences, formats, extraction) values
  (pg_temp.sid(14), 'a0000000-0000-4000-8000-000000000001', '2026-01-06 18:00Z', 'present', 'P', '[]', '{"word_count": 500}', 'pending'),
  (pg_temp.sid(15), 'a0000000-0000-4000-8000-000000000001', '2026-01-08 03:00Z', 'present', 'P', '[]', '{"word_count": 500}', 'submitted');
insert into public.citations (snapshot_id, idx, url, url_key, host, reg_domain, title)
select pg_temp.sid(c.n), 0, u.url, u.url_key, u.host, u.reg, u.title
from (values (14, 'U1'), (15, 'U3')) as c(n, u) join fx_url u on u.u = c.u;

-- Same window as m with S14 added: present 11 but shares of claims, entities and formats stay over
-- the 10 extracted renders; sources, citations per render and word count see all 11.
create temp table mp as
select public.series_metrics('a0000000-0000-4000-8000-000000000001', '2026-01-05 00:00Z', '2026-01-07 00:00Z') as j;
select is((select (j->>'present')::int from mp), 11, 'pending render counts as present');
select is((select (j->>'extracted')::int from mp), 10, 'but not as extracted');
select is((select (j->>'extraction_pending')::int from mp), 1, 'one render awaiting extraction');
select is((select (j->'claims'->0->>'share')::numeric from mp), 0.8, 'G1 share unchanged by the pending render');
select is((select j->'claims'->0->>'bucket' from mp), 'core', 'G1 still core');
select is((select (j->'entities'->0->>'share')::numeric from mp), 0.8, 'Jotform share unchanged');
select is((select j->'formats'->0 from mp), '{"label":"ranked_list","renders":7,"share":0.7}'::jsonb, 'format share unchanged');
select is((select (j->'unsupported_claims'->0->>'share')::numeric from mp), 0.4, 'unsupported share unchanged');
select is((select (j->'answer_lead'->>'n')::int from mp), 10, 'answer lead n is the extracted count');
select is((select (j->'sources'->0->>'renders')::int from mp), 9, 'U1 cited by the pending render too');
select is((select (j->'sources'->0->>'share')::numeric from mp), 0.8182, 'source survival stays over present renders: 9/11');
select is((select (j->>'citations_per_render')::numeric from mp), 1.6364, '18 citations over 11 present renders');
select is((select (j->>'median_word_count')::numeric from mp), 130::numeric, 'word count is code-measured, so the pending render counts');
select is((select (j->'daily'->1->>'present')::int from mp), 7, 'day 2 present includes the pending render');
select is((select j->'daily'->1->'claims_dropped' from mp),
  '[{"group_id":"a0000000-0000-4000-8000-000000000206","label":"Wufoo is discontinued"}]'::jsonb, 'day 2 claim diffs unchanged');

-- A window starting at 02:00 on 01-05: S1 (00:00) is outside it but completes day 1 for the diffs,
-- so G6 (only in S1) is still dropped on day 2; counts and shares are in-window only.
create temp table ml as
select public.series_metrics('a0000000-0000-4000-8000-000000000001', '2026-01-05 02:00Z', '2026-01-07 00:00Z') as j;
select is((select (j->>'renders')::int from ml), 11, 'S1 is outside the window');
select is((select (j->>'present')::int from ml), 10, 'present without S1');
select is((select (j->'daily'->0->>'renders')::int from ml), 4, 'day 1 counts only in-window renders');
select is((select (j->'daily'->0->>'present')::int from ml), 3, 'day 1 present in-window');
select is((select (j->'claims'->0->>'share')::numeric from ml), 0.7, 'G1 7/10 without S1');
select is((select j->'daily'->1->'claims_dropped' from ml),
  '[{"group_id":"a0000000-0000-4000-8000-000000000206","label":"Wufoo is discontinued"}]'::jsonb,
  'G6 seen at 00:00 before the window still counts as dropped on day 2');
select is((select j->'daily'->1->'citations_added' from ml),
  '[{"url_key":"youtube.com/watch?v=abc","reg_domain":"youtube.com"},{"url_key":"zapier.com/blog/tally-review","reg_domain":"zapier.com"}]'::jsonb,
  'citations added on day 2 unchanged');

-- A window ending at 12:00 on 01-06: the last day is still being captured, so it lists what was
-- added but nothing as dropped.
create temp table mh as
select public.series_metrics('a0000000-0000-4000-8000-000000000001', '2026-01-05 00:00Z', '2026-01-06 12:00Z') as j;
select is((select jsonb_array_length(j->'daily') from mh), 2, 'two days');
select is((select (j->'daily'->1->>'renders')::int from mh), 4, 'day 2 has the four morning renders');
select is((select j->'daily'->1->'claims_added' from mh),
  '[{"group_id":"a0000000-0000-4000-8000-000000000204","label":"Typeform has the best design"}]'::jsonb, 'partial day: claims added');
select is((select j->'daily'->1->'claims_dropped' from mh), '[]'::jsonb, 'partial day: nothing dropped yet');
select is((select j->'daily'->1->'entities_dropped' from mh), '[]'::jsonb, 'partial day: no entities dropped');
select is((select j->'daily'->1->'citations_added' from mh),
  '[{"url_key":"youtube.com/watch?v=abc","reg_domain":"youtube.com"}]'::jsonb, 'partial day: U3 added, U4 not seen yet');
select is((select j->'daily'->1->'citations_dropped' from mh), '[]'::jsonb, 'partial day: no citations dropped');

-- 01-08 has only S15 (awaiting extraction): claim and entity diffs wait for it, citation diffs run.
create temp table mw as
select public.series_metrics('a0000000-0000-4000-8000-000000000001', '2026-01-05 00:00Z', '2026-01-09 00:00Z') as j;
select is((select jsonb_array_length(j->'daily') from mw), 4, 'four days');
select is((select j->'daily'->3->>'day' from mw), '2026-01-08', 'day 4');
select is((select (j->'daily'->3->>'present')::int from mw), 1, 'day 4 has one present render');
select is((select j->'daily'->3->'claims_dropped' from mw), '[]'::jsonb, 'no claims dropped on a day with nothing extracted');
select is((select j->'daily'->3->'claims_added' from mw), '[]'::jsonb, 'no claims added either');
select is((select j->'daily'->3->'entities_dropped' from mw), '[]'::jsonb, 'no entities dropped');
select is((select j->'daily'->3->'citations_added' from mw), '[]'::jsonb, 'U3 was cited on 01-07 too');
select is((select jsonb_array_length(j->'daily'->2->'claims_dropped') from mw), 4, '01-07 (S13 extracted) drops the four day-2 claims');
select is((select (j->>'extraction_pending')::int from mw), 2, 'two renders awaiting extraction');

-- Without the service role and without tracking the series, every metric RPC refuses.
set local request.jwt.claims to '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000dead"}';
select throws_ok($$ select public.series_metrics('a0000000-0000-4000-8000-000000000001', '2026-01-05', '2026-01-07') $$,
  '42501', 'not allowed', 'series_metrics refuses a non-subscriber');

select * from finish();
rollback;
