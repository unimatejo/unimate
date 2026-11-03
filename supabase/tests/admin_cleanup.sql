delete from admin_audit_log where target_id = 'aaaaaaaa-0000-0000-0000-00000000a002' or admin_id = 'aaaaaaaa-0000-0000-0000-00000000a001';
delete from auth.users where id in ('aaaaaaaa-0000-0000-0000-00000000a001', 'aaaaaaaa-0000-0000-0000-00000000a002');
select count(*) as left_over from profiles where id::text like 'aaaaaaaa-%';
