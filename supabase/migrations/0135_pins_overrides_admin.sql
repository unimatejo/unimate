-- UniMate · 0135 pinned messages, my own exam times, automatic major, admin profile editing, video covers
--
-- 1. Pinned messages: up to 3 per chat, shown at the top. In a direct chat either person pins; in a group only its
--    owner and admins. A pinned message is also kept (like a saved one), so it doesn't vanish in a vanishing chat.
--    Pins change only through pin_message(), which checks all of that.
-- 2. My own times for a section's official exam: the student moves the date, time, place or title for themselves,
--    or hides it, without touching it for the rest of the section. my_events() returns the student's version.
-- 3. Automatic major and entry year: from the university's official student file when the student is in it, from the
--    department Microsoft has for them, and the entry year from the student number where the university numbers
--    students by year (the Hashemite University: 7 digits, the first two are the year). Never over a choice the
--    student made.
-- 4. Admin profile editing in one checked, logged call; and the follower numbers an admin may show on a profile.
--    The lists of followers and following always stay the real people.
-- 5. A video's cover photo is kept as long as its post.

-- 1 ─ pinned messages ─────────────────────────────────────────────────────────────────────────────────────────────
alter table public.messages add column if not exists pinned_at timestamptz;
alter table public.messages add column if not exists pinned_by uuid;
create index if not exists messages_pinned_idx on public.messages (conversation_id, pinned_at desc) where pinned_at is not null;

create or replace function public.guard_message_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or current_setting('unimate.system', true) = 'on' or auth.uid() is null then return new; end if;
  if new.sender_id is null and old.sender_id is not null
     and new.body is not distinct from old.body and new.media_url is not distinct from old.media_url and new.kind = old.kind then
    return new; -- the sender's account was deleted
  end if;
  if new.body is distinct from old.body or new.media_url is distinct from old.media_url
     or new.kind is distinct from old.kind or new.sender_id is distinct from old.sender_id
     or new.vanishes_at is distinct from old.vanishes_at or new.viewed_once_at is distinct from old.viewed_once_at then
    raise exception 'messages cannot be edited';
  end if;
  if new.pinned_at is distinct from old.pinned_at or new.pinned_by is distinct from old.pinned_by then
    raise exception 'pins change through pin_message';
  end if;
  if new.deleted_at is distinct from old.deleted_at and old.sender_id <> auth.uid() then
    raise exception 'only the sender can unsend';
  end if;
  return new;
end $$;

create or replace function public.pin_message(p_message uuid, p_pin boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  m messages;
  k conversation_kind;
  who text;
begin
  select * into m from messages where id = p_message and deleted_at is null;
  if m.id is null or not is_member(m.conversation_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if m.kind = 'system' then raise exception 'not_pinnable' using errcode = 'P0001'; end if;
  select kind into k from conversations where id = m.conversation_id;
  if k <> 'direct' and not can_manage_conv(m.conversation_id, auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_pin = (m.pinned_at is not null) then return; end if;
  if p_pin and (select count(*) from messages
                where conversation_id = m.conversation_id and pinned_at is not null and deleted_at is null) >= 3 then
    raise exception 'pin_limit' using errcode = 'P0001';
  end if;

  perform set_config('unimate.system', 'on', true);
  update messages
     set pinned_at = case when p_pin then now() end,
         pinned_by = case when p_pin then auth.uid() end,
         is_saved  = is_saved or p_pin
   where id = m.id;
  select split_part(full_name, ' ', 1) into who from profiles where id = auth.uid();
  insert into messages (conversation_id, sender_id, kind, body)
  values (m.conversation_id, auth.uid(), 'system',
          coalesce(who, '') || case when p_pin then ' ثبّت رسالة' else ' شال تثبيت رسالة' end);
  perform set_config('unimate.system', 'off', true);
end $$;

revoke all on function public.pin_message(uuid, boolean) from public, anon;
grant execute on function public.pin_message(uuid, boolean) to authenticated;

-- 2 ─ my own times for a section's official event ─────────────────────────────────────────────────────────────────
create table if not exists public.event_overrides (
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  event_id   uuid not null references public.academic_events (id) on delete cascade,
  starts_at  timestamptz,
  location   text check (char_length(location) <= 120),
  title      text check (char_length(title) between 1 and 80),
  hidden     boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index if not exists event_overrides_event_id_fk_idx on public.event_overrides (event_id);
alter table public.event_overrides enable row level security;

drop policy if exists "own event overrides" on public.event_overrides;
create policy "own event overrides" on public.event_overrides for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from academic_events a join enrollments e on e.section_id = a.section_id
                where a.id = event_id and a.owner_id is null and e.user_id = (select auth.uid())));
grant select, insert, update, delete on public.event_overrides to authenticated;

drop function if exists public.my_events(timestamptz, timestamptz);
create function public.my_events(p_from timestamptz, p_to timestamptz)
returns table (id uuid, section_id uuid, owner_id uuid, kind event_kind, title text, starts_at timestamptz, location text,
               course_name text, course_name_en text, confirmations integer, shared_ask boolean, source text,
               disputed boolean, edited boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.section_id, a.owner_id, a.kind, coalesce(o.title, a.title), coalesce(o.starts_at, a.starts_at),
         case when o.event_id is null then a.location else o.location end, c.name_ar, c.name_en,
         a.confirmations, a.shared_ask, a.source,
         exists (select 1 from event_disputes d where d.event_id = a.id and d.user_id = auth.uid()),
         o.event_id is not null
  from academic_events a
  left join event_overrides o on o.event_id = a.id and o.user_id = auth.uid()
  left join sections s on s.id = a.section_id
  left join courses c on c.id = s.course_id
  where coalesce(o.starts_at, a.starts_at) between p_from and p_to
    and not coalesce(o.hidden, false)
    and ((a.owner_id = auth.uid() and a.merged_into is null)
      or (a.owner_id is null and exists (select 1 from enrollments e where e.section_id = a.section_id and e.user_id = auth.uid())))
  order by 6
  limit 300;
$$;
revoke all on function public.my_events(timestamptz, timestamptz) from public, anon;
grant execute on function public.my_events(timestamptz, timestamptz) to authenticated, service_role;

-- 3 ─ automatic major and entry year ─────────────────────────────────────────────────────────────────────────────
-- universities that number students by entry year: a student number of `digits` digits starts with the year's last two
create table if not exists private.student_number_rules (
  university_id uuid primary key references public.universities (id) on delete cascade,
  digits        smallint not null check (digits between 5 and 12)
);
insert into private.student_number_rules (university_id, digits)
select id, 7 from public.universities where 'hu.edu.jo' = any (email_domains)
on conflict (university_id) do nothing;

/**
 * Fills what the student hasn't chosen yet: entry year from the student number, then major and college from the
 * university's official file, else from the department Microsoft has. Returns what it filled.
 */
create or replace function private.auto_academic(p_user uuid, p_department text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p profiles;
  num text;
  yr int;
  file_major text;
  mj majors;
  out jsonb := '{}';
begin
  select * into p from profiles where id = p_user;
  if p.id is null or p.university_id is null or p.account_type <> 'student' then return out; end if;
  select student_number into num from profile_private where user_id = p_user;

  if p.entry_year is null and num is not null then
    select 2000 + left(num, 2)::int into yr from private.student_number_rules r
     where r.university_id = p.university_id and char_length(num) = r.digits and num ~ '^[0-9]+$';
    if yr between 2000 and extract(year from now())::int then
      out := out || jsonb_build_object('entry_year', yr);
    end if;
  end if;

  if p.major_id is null then
    if num is not null then
      select g.major into file_major from private.official_grades g
       where g.university_id = p.university_id and g.student_number = num and g.major is not null
       order by g.imported_at desc limit 1;
    end if;
    file_major := coalesce(nullif(trim(file_major), ''), nullif(trim(p_department), ''));
    if file_major is not null then
      select * into mj from majors m
       where m.university_id = p.university_id
         and (m.name_ar = file_major or lower(m.name_en) = lower(file_major))
       order by m.verified desc limit 1;
      if mj.id is not null then
        out := out || jsonb_build_object('major_id', mj.id, 'college_id', mj.college_id);
      end if;
    end if;
  end if;

  if out <> '{}' then
    perform set_config('unimate.system', 'on', true);
    update profiles set
      entry_year = coalesce((out->>'entry_year')::smallint, entry_year),
      study_year = case when out ? 'entry_year' and study_year is null
                        then least(8, greatest(1, extract(year from now())::int - (out->>'entry_year')::int
                                                   + case when extract(month from now()) >= 9 then 1 else 0 end))::smallint
                        else study_year end,
      major_id   = coalesce((out->>'major_id')::uuid, major_id),
      college_id = coalesce((out->>'college_id')::uuid, college_id)
    where id = p_user;
    perform set_config('unimate.system', 'off', true);
  end if;
  return out;
end $$;
revoke all on function private.auto_academic(uuid, text) from public, anon, authenticated;

/** the signed-in student asks for it once, right after their account is made (the welcome screen) */
create or replace function public.auto_academic()
returns jsonb language sql security definer set search_path = public as $$
  select private.auto_academic(auth.uid(), null);
$$;
revoke all on function public.auto_academic() from public, anon;
grant execute on function public.auto_academic() to authenticated;

/** Microsoft's department for a student (called by the ms-role function with the service key) */
create or replace function public.ms_apply_student(p_user uuid, p_department text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if nullif(trim(p_department), '') is not null then
    perform set_config('unimate.system', 'on', true);
    update profiles set department = left(trim(p_department), 120) where id = p_user and department is null;
    perform set_config('unimate.system', 'off', true);
  end if;
  return private.auto_academic(p_user, p_department);
end $$;
revoke all on function public.ms_apply_student(uuid, text) from public, anon, authenticated;
grant execute on function public.ms_apply_student(uuid, text) to service_role;

-- 4 ─ admin profile editing and shown follower numbers ──────────────────────────────────────────────────────────
alter table public.profiles add column if not exists shown_followers integer check (shown_followers between 0 and 100000000);
alter table public.profiles add column if not exists shown_following integer check (shown_following between 0 and 100000000);

create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or current_setting('unimate.system', true) = 'on' or auth.uid() is null then return new; end if;
  new.university_id   := old.university_id;
  new.status          := old.status;
  new.follower_count  := old.follower_count;
  new.following_count := old.following_count;
  new.post_count      := old.post_count;
  new.account_type    := old.account_type;
  new.academic_title  := old.academic_title;
  new.title_verified  := old.title_verified;
  new.shown_followers := old.shown_followers;
  new.shown_following := old.shown_following;
  return new;
end $$;

/**
 * One admin edit of someone's profile. Only the keys sent are changed; null clears a value. Logged with the old
 * and new values.
 */
create or replace function public.admin_update_profile(p_user uuid, p_changes jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  before jsonb;
  allowed text[] := array['full_name', 'bio', 'college_id', 'major_id', 'entry_year', 'study_year',
                          'student_number', 'shown_followers', 'shown_following'];
  k text;
  mj majors;
begin
  perform admin_require();
  if jsonb_typeof(p_changes) <> 'object' then raise exception 'bad_changes' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_changes) loop
    if not (k = any (allowed)) then raise exception 'not_editable: %', k using errcode = '22023'; end if;
  end loop;
  if p_changes ? 'full_name' and char_length(trim(coalesce(p_changes->>'full_name', ''))) not between 2 and 60 then
    raise exception 'bad_name' using errcode = '22023';
  end if;
  if p_changes ? 'student_number' and coalesce(p_changes->>'student_number', '') !~ '^([0-9A-Za-z]{4,20})?$' then
    raise exception 'bad_student_number' using errcode = '22023';
  end if;
  if p_changes->>'major_id' is not null then
    select * into mj from majors where id = (p_changes->>'major_id')::uuid
       and university_id = (select university_id from profiles where id = p_user);
    if mj.id is null then raise exception 'bad_major' using errcode = '22023'; end if;
  end if;

  select to_jsonb(x) into before from (
    select p.full_name, p.bio, p.college_id, p.major_id, p.entry_year, p.study_year, pp.student_number,
           p.shown_followers, p.shown_following
    from profiles p left join profile_private pp on pp.user_id = p.id where p.id = p_user) x;
  if before is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  update profiles set
    full_name       = case when p_changes ? 'full_name' then trim(p_changes->>'full_name') else full_name end,
    bio             = case when p_changes ? 'bio' then left(coalesce(p_changes->>'bio', ''), 300) else bio end,
    major_id        = case when p_changes ? 'major_id' then mj.id else major_id end,
    college_id      = case when p_changes ? 'major_id' and mj.id is not null then mj.college_id
                           when p_changes ? 'college_id' then (p_changes->>'college_id')::uuid else college_id end,
    entry_year      = case when p_changes ? 'entry_year' then (p_changes->>'entry_year')::smallint else entry_year end,
    study_year      = case when p_changes ? 'study_year' then (p_changes->>'study_year')::smallint else study_year end,
    shown_followers = case when p_changes ? 'shown_followers' then (p_changes->>'shown_followers')::int else shown_followers end,
    shown_following = case when p_changes ? 'shown_following' then (p_changes->>'shown_following')::int else shown_following end
  where id = p_user;
  if p_changes ? 'student_number' then
    update profile_private set student_number = nullif(p_changes->>'student_number', '') where user_id = p_user;
  end if;

  perform admin_log('edit_profile', 'user', p_user::text, jsonb_build_object('before', before, 'changes', p_changes));
end $$;
revoke all on function public.admin_update_profile(uuid, jsonb) from public, anon;
grant execute on function public.admin_update_profile(uuid, jsonb) to authenticated;

-- 5 ─ a video's cover photo lives as long as its post ───────────────────────────────────────────────────────────
create or replace function public.storage_orphans(min_age interval default '30 days'::interval)
returns table (bucket_id text, name text, size bigint)
language sql stable security definer set search_path = public, storage as $$
  select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.bucket_id in ('stories', 'posts', 'chat')
    and o.created_at < now() - min_age
    and case
      when o.name ~ '\.t\.jpg$' then
        -- a small copy: an orphan only when its photo is no longer stored
        not exists (select 1 from storage.objects x where x.bucket_id = o.bucket_id and x.name <> o.name
                      and x.name like regexp_replace(o.name, '\.t\.jpg$', '') || '.%' and x.name !~ '\.t\.jpg$')
      else
        not exists (select 1 from stories s where (s.media_url = o.name or s.media_url like '%/' || o.name)
                      and (s.expires_at > now() - interval '30 days' or exists (select 1 from highlight_items h where h.story_id = s.id)))
        and not exists (select 1 from post_media pm where pm.url = o.name or pm.url like '%/' || o.name or pm.meta->>'cover' = o.name)
        and not exists (select 1 from messages m where m.media_url = o.name or m.media_url like '%/' || o.name)
        and not exists (select 1 from highlights h where h.cover_url = o.name or h.cover_url like '%/' || o.name)
        and not exists (select 1 from title_requests t where t.proof_url like '%' || o.name)
        and not exists (select 1 from moderation_queue q where q.media_url like '%' || o.name)
    end;
$$;
