-- University community directory: everyone signed up at a university, ordered by academic rank.
-- Nobody picks their own rank: it comes from the official staff list (private.staff_titles, imported by an admin)
-- matched on the university email, or from an admin verifying a title request.

create table if not exists private.staff_titles (
  email         text primary key check (email = lower(email)),
  university_id uuid references universities(id) on delete cascade,
  title         text not null check (title in ('prof','assoc_prof','asst_prof','doctor','lecturer','teacher_assistant','dean','vice_dean','head','president','vice_president','staff')),
  department    text check (char_length(department) <= 80),
  full_name     text,
  created_at    timestamptz not null default now()
);

-- give one profile the rank its email has on the official list
create or replace function private.apply_staff_title(p_user uuid, p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare s private.staff_titles;
begin
  select * into s from private.staff_titles where email = lower(coalesce(p_email, ''));
  if s.email is null then return false; end if;
  perform set_config('unimate.system', 'on', true);
  update profiles set academic_title = s.title, title_verified = true, is_verified = true,
    account_type = case when s.title = 'staff' then 'staff' else 'faculty' end,
    department = coalesce(s.department, department),
    university_id = coalesce(university_id, s.university_id)
  where id = p_user and (academic_title is distinct from s.title or not title_verified or department is distinct from coalesce(s.department, department));
  perform set_config('unimate.system', 'off', true);
  return true;
end $$;

-- new sign-ups (and email changes) pick their rank up automatically
create or replace function private.profile_private_rank()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform private.apply_staff_title(new.user_id, new.email);
  exception when others then
    perform set_config('unimate.system', 'off', true); -- never block a sign-up
  end;
  return new;
end $$;
drop trigger if exists profile_private_rank on profile_private;
create trigger profile_private_rank after insert or update of email on profile_private
  for each row execute function private.profile_private_rank();

-- admin: paste the official list. rows: [{email, title, department?, full_name?}]
create or replace function public.admin_import_staff_titles(p_rows jsonb, p_university uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; bad int := 0; hit int := 0; pp record;
begin
  perform admin_require();
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    begin
      insert into private.staff_titles(email, university_id, title, department, full_name)
      values (lower(trim(r->>'email')), p_university, r->>'title', nullif(trim(r->>'department'), ''), nullif(trim(r->>'full_name'), ''))
      on conflict (email) do update set title = excluded.title, department = coalesce(excluded.department, private.staff_titles.department),
        full_name = coalesce(excluded.full_name, private.staff_titles.full_name), university_id = coalesce(excluded.university_id, private.staff_titles.university_id);
      n := n + 1;
    exception when others then bad := bad + 1;
    end;
  end loop;
  for pp in select user_id, email from profile_private where lower(email) in (select email from private.staff_titles) loop
    if private.apply_staff_title(pp.user_id, pp.email) then hit := hit + 1; end if;
  end loop;
  perform admin_log('import_staff_titles', 'university', coalesce(p_university::text, ''), jsonb_build_object('saved', n, 'bad', bad, 'matched', hit));
  return jsonb_build_object('saved', n, 'bad', bad, 'matched', hit);
end $$;

create or replace function public.admin_staff_titles_count()
returns int language sql security definer set search_path = public as $$
  select case when is_admin() then (select count(*)::int from private.staff_titles) else 0 end;
$$;

-- everyone at a university, highest rank first. Public profile fields only.
create or replace function public.university_directory(p_university uuid default null)
returns table (id uuid, full_name text, username text, avatar_url text, account_type text, academic_title text, title_verified boolean,
               department text, major text, college text, is_verified boolean, rank int)
language sql stable security definer set search_path = public as $$
  with me as (select coalesce(p_university, (select university_id from profiles where id = auth.uid())) as uni)
  select p.id, p.full_name, p.username, p.avatar_url, p.account_type,
         case when p.title_verified then p.academic_title end, p.title_verified,
         p.department, m.name_ar, c.name_ar, p.is_verified,
         case
           when p.title_verified and p.academic_title is not null then array_position(array['president','vice_president','dean','vice_dean','head','prof','assoc_prof','asst_prof','doctor','lecturer','teacher_assistant','staff'], p.academic_title)
           when p.account_type = 'faculty' then 50
           when p.account_type = 'staff' then 60
           else 100 end as rank
  from profiles p
  left join majors m on m.id = p.major_id
  left join colleges c on c.id = coalesce(p.college_id, m.college_id)
  where auth.uid() is not null
    and p.university_id = (select uni from me)
    and p.status::text = 'active'
    and p.deletion_requested_at is null
    and not exists (select 1 from blocks b where (b.blocker_id = p.id and b.blocked_id = auth.uid()) or (b.blocker_id = auth.uid() and b.blocked_id = p.id))
  order by rank, p.full_name;
$$;

revoke all on function public.admin_import_staff_titles(jsonb, uuid), public.admin_staff_titles_count(), public.university_directory(uuid) from public, anon;
grant execute on function public.admin_import_staff_titles(jsonb, uuid), public.admin_staff_titles_count(), public.university_directory(uuid) to authenticated;
