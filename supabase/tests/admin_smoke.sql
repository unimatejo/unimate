-- simulated admin vs normal user; everything is rolled back by cleanup at the end
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
 ('aaaaaaaa-0000-0000-0000-00000000a001', 'admin.test@ju.edu.jo', '{"full_name":"أدمن تجريبي"}', 'authenticated', 'authenticated'),
 ('aaaaaaaa-0000-0000-0000-00000000a002', '20201234@ju.edu.jo', '{"full_name":"طالب تجريبي"}', 'authenticated', 'authenticated');
insert into admins (user_id, role) values ('aaaaaaaa-0000-0000-0000-00000000a001', 'owner');
create temp table r (name text, ok boolean, info text);
grant all on r to authenticated;

set role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000a002","role":"authenticated"}', false);
do $$ begin perform admin_stats(); insert into r values ('student blocked from admin_stats', false, 'ran'); exception when others then insert into r values ('student blocked from admin_stats', true, sqlerrm); end $$;
insert into r select 'student sees no private emails', count(*) = 0, count(*)::text from profile_private where user_id <> auth.uid();

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000a001","role":"authenticated"}', false);
insert into r select 'admin stats', (admin_stats()->>'users')::int >= 2, admin_stats()->>'users';
insert into r select 'admin finds by student number', count(*) = 1, max(full_name) from admin_find_users('20201234', 5);
insert into r select 'student mapped to JU', max(university) = 'الجامعة الأردنية', max(university) from admin_find_users('20201234', 5);
do $$ begin perform admin_set_status('aaaaaaaa-0000-0000-0000-00000000a002', 'suspended', 'test'); insert into r values ('admin suspends', true, ''); exception when others then insert into r values ('admin suspends', false, sqlerrm); end $$;
insert into r select 'audit logged', count(*) >= 1, count(*)::text from admin_audit_log where target_id = 'aaaaaaaa-0000-0000-0000-00000000a002';
reset role;
select name, ok, info from r;
