-- The blue check now means "an important person": the founder, a university president or vice president,
-- a dean, or anyone the owner gives it to. Signing in with Microsoft no longer gives it; that fact is kept
-- separately in profiles.ms_verified (shown as "verified with Microsoft" on the welcome screen).
-- Who had the check before is saved, so this can be undone.

alter table public.profiles add column if not exists ms_verified boolean not null default false;

create table if not exists private.blue_check_before (
  user_id  uuid primary key,
  saved_at timestamptz not null default now()
);
insert into private.blue_check_before(user_id) select id from profiles where is_verified on conflict do nothing;

create or replace function private.is_vip_title(t text)
returns boolean language sql immutable as $$ select t in ('president', 'vice_president', 'dean') $$;

do $$ begin
  perform set_config('unimate.system', 'on', true);
  update profiles p set ms_verified = true
    where exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'azure');
  update profiles p set is_verified = (
      exists (select 1 from admins a where a.user_id = p.id and a.role = 'owner')
      or (p.title_verified and private.is_vip_title(p.academic_title)))
    where p.is_verified is distinct from (
      exists (select 1 from admins a where a.user_id = p.id and a.role = 'owner')
      or (p.title_verified and private.is_vip_title(p.academic_title)));
  perform set_config('unimate.system', 'off', true);
end $$;

-- Microsoft sign-in: mark it, without the check
create or replace function public.sync_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.provider = 'azure' then
    perform set_config('unimate.system', 'on', true);
    update profiles set ms_verified = true where id = new.user_id and not ms_verified;
    perform set_config('unimate.system', 'off', true);
    update profile_private set ms_object_id = coalesce(ms_object_id, new.provider_id) where user_id = new.user_id;
  end if;
  return new;
end $$;

-- new accounts: Microsoft is remembered, nobody starts with the check
do $$ declare def text; begin
  def := pg_get_functiondef('public.handle_new_user'::regproc);
  if position('insert into profiles (id, university_id, full_name, avatar_url, is_verified, account_type)' in def) = 0 then
    raise exception 'handle_new_user changed, update this migration';
  end if;
  def := replace(def, 'insert into profiles (id, university_id, full_name, avatar_url, is_verified, account_type)',
                      'insert into profiles (id, university_id, full_name, avatar_url, ms_verified, account_type)');
  def := replace(def, 'meta->>''avatar_url'', prov = ''azure'' or staff.email is not null,', 'meta->>''avatar_url'', prov = ''azure'',');
  execute def;
end $$;

-- the official staff list: the title is verified; the check only for presidents, vice presidents and deans
do $$ declare def text; begin
  def := pg_get_functiondef('private.apply_staff_title'::regproc);
  if position('title_verified = true, is_verified = true,' in def) = 0 then raise exception 'apply_staff_title changed'; end if;
  execute replace(def, 'title_verified = true, is_verified = true,', 'title_verified = true, is_verified = is_verified or private.is_vip_title(s.title),');
end $$;

-- the owner gives or removes the check by hand (logged; the person is told when they get it)
create or replace function public.admin_set_blue_check(p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform owner_require();
  if not exists (select 1 from profiles where id = p_user) then raise exception 'not found'; end if;
  perform set_config('unimate.system', 'on', true);
  update profiles set is_verified = p_on where id = p_user;
  if p_on then
    insert into notifications(user_id, kind, title, body)
    values (p_user, 'system', 'حسابك صار موثّق ✓', 'انضافت العلامة الزرقاء على حسابك بيونيميت.');
  end if;
  perform set_config('unimate.system', 'off', true);
  perform admin_log(case when p_on then 'blue_check_on' else 'blue_check_off' end, 'user', p_user::text, '{}'::jsonb);
end $$;
revoke all on function public.admin_set_blue_check(uuid, boolean) from public, anon;
grant execute on function public.admin_set_blue_check(uuid, boolean) to authenticated;
revoke all on function private.is_vip_title(text) from public, anon, authenticated;
