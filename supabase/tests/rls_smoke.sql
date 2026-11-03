-- Smoke test for UniMate RLS and triggers. Runs in one transaction and rolls back everything.
drop table if exists t_results, t_a1, t_a2, t_c, t_conv;
create temp table t_results (n serial, check_name text, ok boolean, detail text);

-- seed a university with a college and major
insert into universities (id, slug, name_ar, name_en, email_domains)
values ('00000000-0000-0000-0000-00000000aaaa', 'test-u', 'جامعة الاختبار', 'Test U', array['test.edu.jo']);
insert into universities (id, slug, name_ar, name_en, email_domains)
values ('00000000-0000-0000-0000-00000000bbbb', 'other-u', 'جامعة ثانية', 'Other U', array['other.edu.jo']);
insert into colleges (id, university_id, name_ar) values ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-00000000aaaa', 'الهندسة');
insert into majors (id, university_id, college_id, name_ar) values ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-00000000aaaa', '00000000-0000-0000-0000-0000000c0001', 'مدنية');
insert into communities (university_id, kind, name) values ('00000000-0000-0000-0000-00000000aaaa', 'university', 'مجتمع الاختبار');

-- three students: A and B at test-u, C at other-u
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ('11111111-1111-1111-1111-111111111111', '2021001@test.edu.jo', '{"full_name":"أحمد"}', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', '2021002@test.edu.jo', '{"full_name":"لين"}', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'x@other.edu.jo', '{"full_name":"غريب"}', 'authenticated', 'authenticated');

insert into t_results(check_name, ok, detail)
select 'profile mapped to university from email', university_id = '00000000-0000-0000-0000-00000000aaaa', full_name
from profiles where id = '11111111-1111-1111-1111-111111111111';
insert into t_results(check_name, ok, detail)
select 'student number captured privately', student_number = '2021001', student_number
from profile_private where user_id = '11111111-1111-1111-1111-111111111111';
insert into t_results(check_name, ok, detail)
select 'joined university community automatically', count(*) = 1, count(*)::text
from community_members where user_id = '11111111-1111-1111-1111-111111111111';

-- make B a private account in the same major as A
update profiles set major_id = '00000000-0000-0000-0000-0000000d0001', college_id = '00000000-0000-0000-0000-0000000c0001', is_private = true, who_can_message = 'major'
where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

-- ===== act as B =====
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', false);
insert into posts (id, author_id, university_id, category, audience, body)
values ('99999999-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000aaaa', 'square', 'university', 'منشور شخصي');
insert into posts (id, author_id, university_id, category, audience, body, lost_found)
values ('99999999-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-00000000aaaa', 'lost_found', 'university', 'لقيت آلة حاسبة', 'found');
-- try to cheat: pin own post and inflate points
update posts set is_pinned = true, like_count = 999 where id = '99999999-0000-0000-0000-000000000001';
update profiles set points = 100000 where id = '22222222-2222-2222-2222-222222222222';
reset role;
insert into t_results(check_name, ok, detail) select 'student cannot pin or fake likes', not is_pinned and like_count = 0, is_pinned::text || '/' || like_count from posts where id = '99999999-0000-0000-0000-000000000001';
insert into t_results(check_name, ok, detail) select 'student cannot fake points (5 for found item only)', points = 5, points::text from profiles where id = '22222222-2222-2222-2222-222222222222';

-- ===== act as A (not following B yet) =====
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
create temp table t_a1 as select (select count(*) from posts where id = '99999999-0000-0000-0000-000000000001') as personal,
                                  (select count(*) from posts where id = '99999999-0000-0000-0000-000000000002') as section,
                                  (select count(*) from profile_private where user_id = '22222222-2222-2222-2222-222222222222') as priv;
insert into follows (follower_id, followee_id) values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
create temp table t_a2 as select status::text as st from follows where follower_id = '11111111-1111-1111-1111-111111111111';
create temp table t_conv as select start_direct('22222222-2222-2222-2222-222222222222', 'من جروب: مدنية') as conv;
reset role;
insert into t_results(check_name, ok, detail) select 'private personal post hidden from non-follower', personal = 0, personal::text from t_a1;
insert into t_results(check_name, ok, detail) select 'lost & found post visible to university', section = 1, section::text from t_a1;
insert into t_results(check_name, ok, detail) select 'other student private data hidden', priv = 0, priv::text from t_a1;
insert into t_results(check_name, ok, detail) select 'follow to private account is pending', st = 'pending', st from t_a2;
insert into t_results(check_name, ok, detail)
select 'DM from stranger lands in requests', state = 'request', state::text from conversation_members
where user_id = '22222222-2222-2222-2222-222222222222' and conversation_id in (select conversation_id from conversation_members where user_id = '11111111-1111-1111-1111-111111111111');

-- ===== act as C (other university) =====
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', false);
create temp table t_c as select (select count(*) from posts) as p, (select count(*) from profiles where university_id = '00000000-0000-0000-0000-00000000aaaa') as pr;
reset role;
insert into t_results(check_name, ok, detail) select 'other university sees no posts', p = 0, p::text from t_c;
insert into t_results(check_name, ok, detail) select 'other university sees no profiles', pr = 0, pr::text from t_c;

select n, check_name, ok, detail from t_results order by n;
