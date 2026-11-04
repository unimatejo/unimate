-- App Store 5.1.1(v): deleting the account in the app really deletes it (profile, posts, messages' sender set to null...).
create or replace function delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  perform set_config('unimate.system', 'on', true);
  -- keep a trace for moderation (no link to the deleted profile)
  insert into admin_audit_log(admin_id, action, target_type, target_id, meta)
  values (null, 'account_deleted_by_user', 'user', me::text, jsonb_build_object('email', (select email from auth.users where id = me)));
  delete from auth.users where id = me;   -- cascades to profiles and everything owned by the user
end $$;
revoke execute on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
