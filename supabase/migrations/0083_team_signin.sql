-- Team (admin) accounts sign in separately from university accounts: a personal email, a password and a
-- 6-digit code from an authenticator app. The database enforces it: a team account has no admin powers until
-- that code is entered (session level aal2), and nobody else can see team accounts in the app.
-- University admin accounts that sign in with their university email keep working as before.

create table if not exists private.team_accounts (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- the team's listed emails that already have an account
insert into private.team_accounts(user_id)
select p.user_id from profile_private p join private.staff_emails s on s.email = lower(p.email)
on conflict do nothing;

create or replace function public.is_team_account(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from private.team_accounts where user_id = uid);
$$;

-- this session may use admin powers: team accounts only after the authenticator code; others not on a password-only session
create or replace function public.admin_session_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null
      or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
      or (not exists (select 1 from private.team_accounts where user_id = auth.uid())
          and not exists (select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) x
                          where x->>'method' in ('password', 'recovery')));
$$;

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = uid)
     and (auth.uid() is null or uid = auth.uid() or exists (select 1 from admins where user_id = auth.uid()))
     and admin_session_ok();
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and role = 'owner') and admin_session_ok();
$$;

-- what the app needs to know about the signed-in account
create or replace function public.my_team_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('team', is_team_account(auth.uid()), 'admin', exists (select 1 from admins where user_id = auth.uid()),
                            'aal', coalesce(auth.jwt()->>'aal', 'aal1'));
$$;

-- team accounts are invisible to everyone but themselves and admins
drop policy if exists "profiles same university" on public.profiles;
create policy "profiles same university" on public.profiles for select using (
  id = auth.uid() or is_admin() or (university_id = my_university() and not is_team_account(id)));

-- new team accounts (the owner lists their email) are marked as team accounts and skip student setup
do $$ declare def text; begin
  def := pg_get_functiondef('public.handle_new_user'::regproc);
  if position('insert into admins(user_id, role) values (new.id, staff.role::admin_role) on conflict (user_id) do nothing;' in def) = 0 then
    raise exception 'handle_new_user changed, update this migration';
  end if;
  execute replace(def, 'insert into admins(user_id, role) values (new.id, staff.role::admin_role) on conflict (user_id) do nothing;',
    'insert into admins(user_id, role) values (new.id, staff.role::admin_role) on conflict (user_id) do nothing;
    insert into private.team_accounts(user_id) values (new.id) on conflict do nothing;
    perform set_config(''unimate.system'', ''on'', true);
    update profiles set onboarded = true, is_private = true where id = new.id;
    perform set_config(''unimate.system'', ''off'', true);');
end $$;

do $$ begin
  perform set_config('unimate.system', 'on', true);
  update profiles set onboarded = true, is_private = true where id in (select user_id from private.team_accounts);
  perform set_config('unimate.system', 'off', true);
end $$;

-- the sign-in screen no longer asks whether an email belongs to the team (nobody can probe for team emails)
drop function if exists public.is_staff_email(text);

revoke all on function public.admin_session_ok(), public.my_team_status() from public, anon;
grant execute on function public.admin_session_ok(), public.my_team_status() to authenticated;
revoke all on function public.is_team_account(uuid) from public, anon;
grant execute on function public.is_team_account(uuid) to authenticated;
