-- Deleting your account now waits 30 days: signing in again within that time brings everything back.
-- (A tap on "delete" right after "log out" wiped an account for good; this makes that recoverable.)
alter table public.profiles add column if not exists deletion_requested_at timestamptz;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  perform set_config('unimate.system', 'on', true);
  update profiles set deletion_requested_at = now() where id = me;
  insert into admin_audit_log(admin_id, action, target_type, target_id, meta)
  values (null, 'account_deletion_requested', 'user', me::text, jsonb_build_object('email', (select email from auth.users where id = me), 'purge_after', now() + interval '30 days'));
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- signing back in keeps the account
create or replace function public.cancel_account_deletion()
returns boolean language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); was timestamptz;
begin
  select deletion_requested_at into was from profiles where id = me;
  if was is null then return false; end if;
  perform set_config('unimate.system', 'on', true);
  update profiles set deletion_requested_at = null where id = me;
  insert into admin_audit_log(admin_id, action, target_type, target_id, meta) values (null, 'account_deletion_cancelled', 'user', me::text, '{}'::jsonb);
  return true;
end $$;
revoke execute on function public.cancel_account_deletion() from public, anon;
grant execute on function public.cancel_account_deletion() to authenticated;

-- after 30 days the account really goes (cascades to everything the user owns)
create or replace function public.purge_deleted_accounts()
returns int language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  perform set_config('unimate.system', 'on', true);
  with gone as (
    delete from auth.users u using profiles p
    where p.id = u.id and p.deletion_requested_at < now() - interval '30 days'
    returning u.id, u.email
  ) insert into admin_audit_log(admin_id, action, target_type, target_id, meta)
    select null, 'account_deleted_by_user', 'user', id::text, jsonb_build_object('email', email) from gone;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_deleted_accounts() from public, anon, authenticated;

create extension if not exists pg_cron;
do $$ begin
  perform cron.unschedule('purge-deleted-accounts');
exception when others then null; end $$;
select cron.schedule('purge-deleted-accounts', '17 3 * * *', 'select public.purge_deleted_accounts()');
