-- UniMate · 0094 full official titles ("عميد شؤون الطلبة", "نائب الرئيس للشؤون الأكاديمية", "رئيس قسم الهندسة المدنية").
-- The level (dean, president…) still decides the badge colour and the blue check; the full title is what people read.
-- It comes from Microsoft (job title), the official staff list, or the owner — never from the user.
-- A title that came from Microsoft goes away when Microsoft no longer lists the person as staff.

alter table profiles add column if not exists position_title text check (position_title is null or char_length(position_title) <= 80);
alter table profiles add column if not exists title_source text check (title_source is null or title_source in ('microsoft', 'list', 'owner', 'request'));
alter table private.staff_titles add column if not exists position_title text;

-- users can't write either column themselves
do $$
declare src text;
begin
  select pg_get_functiondef('public.profiles_guard_identity'::regproc) into src;
  if position('new.position_title' in src) = 0 then
    execute replace(src, 'new.account_type   := old.account_type;',
      'new.account_type   := old.account_type;' || chr(10) || '    new.position_title := old.position_title;' || chr(10) || '    new.title_source   := old.title_source;');
  end if;
end $$;

create or replace function private.clean_position(p text) returns text language sql immutable set search_path = '' as $$
  select nullif(left(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'), 80), '')
$$;

-- the owner writes (or clears) someone's full title
create or replace function public.admin_set_position(p_user uuid, p_position text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform owner_require();
  perform set_config('unimate.system', 'on', true);
  update profiles set position_title = private.clean_position(p_position), title_source = coalesce(title_source, 'owner') where id = p_user;
  perform admin_log('set_position', 'user', p_user::text, jsonb_build_object('position', p_position));
end $$;
revoke all on function public.admin_set_position(uuid, text) from public, anon;
grant execute on function public.admin_set_position(uuid, text) to authenticated;

-- titles set by the owner remember it (and removing one clears the full title too)
do $$
declare src text;
begin
  select pg_get_functiondef('public.admin_set_title'::regproc) into src;
  if position('title_source' in src) = 0 then
    execute replace(src, 'lapsed_title = false,', 'lapsed_title = false,' || chr(10) ||
      '    title_source = case when p_title is null then null else ''owner'' end,' || chr(10) ||
      '    position_title = case when p_title is null then null else position_title end,');
  end if;
end $$;

-- Microsoft: the level and the full job title; when Microsoft no longer gives a staff title, a title that came
-- from Microsoft is removed (left the university, role ended)
drop function if exists public.ms_apply_title(uuid, text, text);
create or replace function public.ms_apply_title(p_user uuid, p_title text, p_department text, p_position text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare cur profiles;
begin
  select * into cur from profiles where id = p_user;
  if cur.id is null then return false; end if;
  -- the official staff list and the owner win over Microsoft
  if cur.title_verified and cur.title_source in ('list', 'owner') then return false; end if;
  perform set_config('unimate.system', 'on', true);
  if p_title is null then
    if cur.title_source = 'microsoft' then
      update profiles set academic_title = null, title_verified = false, position_title = null, title_source = null,
        is_verified = blue_manual, account_type = 'student' where id = p_user;
    end if;
    return true;
  end if;
  if p_title not in ('prof','assoc_prof','asst_prof','doctor','lecturer','teacher_assistant','dean','vice_dean','head','president','vice_president','staff') then
    return false;
  end if;
  update profiles set academic_title = p_title, title_verified = true, lapsed_title = false, title_source = 'microsoft',
    position_title = coalesce(private.clean_position(p_position), position_title),
    is_verified = is_verified or private.is_vip_title(p_title),
    account_type = case when p_title = 'staff' then 'staff' else 'faculty' end,
    department = coalesce(nullif(trim(p_department), ''), department)
  where id = p_user;
  perform set_config('unimate.system', 'off', true);
  return true;
end $$;
revoke all on function public.ms_apply_title(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.ms_apply_title(uuid, text, text, text) to service_role;

-- the official staff list can carry the full title too ("position" column)
create or replace function private.apply_staff_title(p_user uuid, p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare s private.staff_titles;
begin
  select * into s from private.staff_titles where email = lower(coalesce(p_email, ''));
  if s.email is null then return false; end if;
  perform set_config('unimate.system', 'on', true);
  update profiles set academic_title = s.title, title_verified = true, lapsed_title = false, title_source = 'list',
    position_title = coalesce(s.position_title, position_title),
    is_verified = is_verified or private.is_vip_title(s.title),
    account_type = case when s.title = 'staff' then 'staff' else 'faculty' end,
    department = coalesce(s.department, department),
    university_id = coalesce(university_id, s.university_id)
  where id = p_user;
  perform set_config('unimate.system', 'off', true);
  return true;
end $$;

do $$
declare src text;
begin
  select pg_get_functiondef('public.admin_import_staff_titles'::regproc) into src;
  if position('position_title' in src) = 0 then
    src := replace(src, 'insert into private.staff_titles(email, university_id, title, department, full_name)',
                        'insert into private.staff_titles(email, university_id, title, department, full_name, position_title)');
    src := replace(src, 'nullif(trim(r->>''full_name''), ''''))', 'nullif(trim(r->>''full_name''), ''''), private.clean_position(r->>''position''))');
    src := replace(src, 'university_id = coalesce(excluded.university_id, private.staff_titles.university_id);',
                        'university_id = coalesce(excluded.university_id, private.staff_titles.university_id), position_title = coalesce(excluded.position_title, private.staff_titles.position_title);');
    execute src;
  end if;
end $$;

-- titles already given: where they came from
select set_config('unimate.system', 'on', true);
update profiles p set title_source = case when exists (select 1 from profile_private pp join private.staff_titles s on s.email = lower(pp.email) where pp.user_id = p.id) then 'list' else 'owner' end
where title_verified and title_source is null;
