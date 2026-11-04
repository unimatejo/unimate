-- UniMate · 0042
-- 1) Staff emails: an admin can have a personal (non-university) email so the admin account never
--    depends on a university mailbox that ends after graduation. Sign-in is by emailed code, no password.
-- 2) Accounts nobody has used for 12 months (e.g. the university closed the email) are scheduled for
--    deletion with the usual 30-day grace (signing in cancels it); their username becomes free again.
create table if not exists private.staff_emails (
  email         text primary key check (email = lower(email)),
  role          text not null default 'owner' check (role in ('owner', 'moderator')),
  university_id uuid references universities(id) on delete set null,
  created_at    timestamptz not null default now()
);
insert into private.staff_emails(email, role, university_id)
select 'mohammadshaneek0@gmail.com', 'owner', id from universities where slug = 'hu'
on conflict (email) do nothing;

-- the login screen asks this before sending a code to a non-university email
create or replace function public.is_staff_email(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from private.staff_emails where email = lower(trim(p_email)));
$$;
grant execute on function public.is_staff_email(text) to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  dom   text := lower(split_part(coalesce(new.email, ''), '@', 2));
  uni   uuid;
  meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  local text := split_part(coalesce(new.email, ''), '@', 1);
  prov  text := coalesce(new.raw_app_meta_data->>'provider', '');
  staff private.staff_emails;
begin
  select id into uni from universities
  where exists (select 1 from unnest(email_domains) d where dom = d or dom like '%.' || d)
  limit 1;
  select * into staff from private.staff_emails where email = lower(coalesce(new.email, ''));
  if uni is null and staff.email is not null then uni := staff.university_id; end if;

  insert into profiles (id, university_id, full_name, avatar_url, is_verified)
  values (new.id, uni, coalesce(meta->>'full_name', meta->>'name', local), meta->>'avatar_url', prov = 'azure' or staff.email is not null);

  insert into profile_private (user_id, email, student_number, ms_object_id)
  values (new.id, new.email, case when local ~ '^[0-9]{5,12}$' then local end, case when prov = 'azure' then meta->>'sub' end);

  if staff.email is not null then
    insert into admins(user_id, role) values (new.id, staff.role) on conflict (user_id) do nothing;
  end if;
  return new;
end $$;

-- 12 months without signing in or refreshing a session → 30-day notice → deleted (copies stay in archive)
create or replace function public.schedule_inactive_accounts()
returns int language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  with idle as (
    select u.id from auth.users u join profiles p on p.id = u.id
    where p.deletion_requested_at is null
      and not exists (select 1 from admins a where a.user_id = u.id)
      and greatest(coalesce(u.last_sign_in_at, u.created_at),
                   coalesce((select max(coalesce(s.refreshed_at, s.updated_at)) from auth.sessions s where s.user_id = u.id), u.created_at))
          < now() - interval '12 months'
  ), marked as (
    update profiles set deletion_requested_at = now() where id in (select id from idle) returning id
  ) select count(*) into n from marked;
  insert into admin_audit_log(admin_id, action, target_type, target_id, meta)
  select null, 'inactive_scheduled', 'system', null, jsonb_build_object('count', n) where n > 0;
  return n;
end $$;
revoke execute on function public.schedule_inactive_accounts() from public, anon, authenticated;
do $$ begin perform cron.unschedule('schedule-inactive-accounts'); exception when others then null; end $$;
select cron.schedule('schedule-inactive-accounts', '41 2 1 * *', 'select public.schedule_inactive_accounts()');
