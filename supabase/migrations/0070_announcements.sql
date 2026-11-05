-- Official announcements: the university leadership, deans, heads and the dean's office (verified staff)
-- post to their college (or the whole university); every student there gets a notification.
-- Reading: signed-in people of that university (and that college). Writing: only through the RPCs below.

create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id) on delete cascade,
  college_id    uuid references colleges(id) on delete set null,      -- null = the whole university
  author_id     uuid not null default auth.uid() references profiles(id) on delete cascade,
  title         text not null check (char_length(title) between 2 and 120),
  body          text not null check (char_length(body) between 1 and 3000),
  link          text check (link is null or (link ~ '^https://[^\s]+$' and char_length(link) <= 300)),
  pinned        boolean not null default false,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz,
  deleted_at    timestamptz
);
create index if not exists announcements_feed_idx on public.announcements(university_id, college_id, pinned desc, created_at desc) where deleted_at is null;
create index if not exists announcements_author_idx on public.announcements(author_id, created_at desc);
alter table public.announcements enable row level security;

drop policy if exists "announcements read" on public.announcements;
create policy "announcements read" on public.announcements for select to authenticated using (
  deleted_at is null and (
    is_admin() or author_id = auth.uid()
    or (university_id = my_university()
        and (college_id is null or college_id = (select p.college_id from profiles p where p.id = auth.uid())))));
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;

-- can I post to this scope? (p_college null = the whole university)
create or replace function public.can_announce(p_college uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    is_admin()
    or exists (
      select 1 from profiles me
      where me.id = auth.uid() and me.status::text = 'active' and me.title_verified and me.university_id is not null
        and (
          (me.academic_title in ('president', 'vice_president')
            and (p_college is null or exists (select 1 from colleges c where c.id = p_college and c.university_id = me.university_id)))
          or (me.academic_title in ('dean', 'vice_dean', 'head', 'staff')
            and p_college is not null and p_college = me.college_id)
        )));
$$;

-- the scopes I may post to: whole university (bool) + colleges
create or replace function public.my_announce_scopes()
returns table(whole_university boolean, college_id uuid, college_name text)
language sql stable security definer set search_path = public as $$
  with me as (select * from profiles where id = auth.uid())
  select can_announce(null), c.id, c.name_ar
  from me join colleges c on c.university_id = me.university_id
  where can_announce(c.id)
  union all
  -- whole-university only (no college rows allowed, e.g. a president at a university without colleges)
  select true, null::uuid, null::text
  where can_announce(null) and not exists (select 1 from me join colleges c on c.university_id = me.university_id where can_announce(c.id))
  order by 3 nulls first;
$$;

-- how many people a post would reach (only for people who can post there)
create or replace function public.announcement_audience_count(p_college uuid default null)
returns int language plpgsql stable security definer set search_path = public as $$
declare uni uuid := my_university(); n int;
begin
  if not can_announce(p_college) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if p_college is not null then select university_id into uni from colleges where id = p_college; end if;
  select count(*) into n from profiles p
  where p.university_id = uni and p.status::text = 'active' and p.id <> auth.uid()
    and (p_college is null or p.college_id = p_college);
  return least(n, 20000);
end $$;

create or replace function public.post_announcement(p_college uuid, p_title text, p_body text, p_link text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uni uuid; aid uuid; n int; t text := trim(coalesce(p_title, '')); b text := trim(coalesce(p_body, '')); l text := nullif(trim(coalesce(p_link, '')), '');
begin
  if not can_announce(p_college) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if char_length(t) < 2 or char_length(t) > 120 then raise exception 'bad_title' using errcode = 'P0001'; end if;
  if char_length(b) < 1 or char_length(b) > 3000 then raise exception 'bad_body' using errcode = 'P0001'; end if;
  if l is not null and (l !~ '^https://[^\s]+$' or char_length(l) > 300) then raise exception 'bad_link' using errcode = 'P0001'; end if;
  if not is_admin() then
    select count(*) into n from announcements where author_id = auth.uid() and created_at > now() - interval '1 day';
    if n >= 10 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  end if;
  if p_college is not null then select university_id into uni from colleges where id = p_college; else uni := my_university(); end if;
  if uni is null then raise exception 'no_university' using errcode = 'P0001'; end if;

  insert into announcements(university_id, college_id, author_id, title, body, link)
  values (uni, p_college, auth.uid(), t, b, l) returning id into aid;

  perform set_config('unimate.system', 'on', true);
  insert into notifications(user_id, kind, actor_id, title, body, data)
  select p.id, 'announcement', auth.uid(), t, left(b, 140), jsonb_build_object('announcement_id', aid)
  from profiles p
  where p.university_id = uni and p.status::text = 'active' and p.id <> auth.uid()
    and (p_college is null or p.college_id = p_college)
  limit 20000;
  perform set_config('unimate.system', 'off', true);

  if is_admin() then perform admin_log('post_announcement', 'announcement', aid::text, jsonb_build_object('college', p_college, 'title', t)); end if;
  return aid;
end $$;

-- author (still allowed there) or admin
create or replace function public.edit_announcement(p_id uuid, p_title text, p_body text, p_link text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a announcements; t text := trim(coalesce(p_title, '')); b text := trim(coalesce(p_body, '')); l text := nullif(trim(coalesce(p_link, '')), '');
begin
  select * into a from announcements where id = p_id and deleted_at is null;
  if a.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not (is_admin() or (a.author_id = auth.uid() and can_announce(a.college_id))) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  if char_length(t) < 2 or char_length(t) > 120 then raise exception 'bad_title' using errcode = 'P0001'; end if;
  if char_length(b) < 1 or char_length(b) > 3000 then raise exception 'bad_body' using errcode = 'P0001'; end if;
  if l is not null and (l !~ '^https://[^\s]+$' or char_length(l) > 300) then raise exception 'bad_link' using errcode = 'P0001'; end if;
  update announcements set title = t, body = b, link = l, edited_at = now() where id = p_id;
  if is_admin() and a.author_id <> auth.uid() then perform admin_log('edit_announcement', 'announcement', p_id::text, jsonb_build_object('title', t)); end if;
end $$;

-- soft delete: the row stays (never lose data), it just stops showing
create or replace function public.delete_announcement(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a announcements;
begin
  select * into a from announcements where id = p_id and deleted_at is null;
  if a.id is null then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not (is_admin() or a.author_id = auth.uid()) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  update announcements set deleted_at = now() where id = p_id;
  if is_admin() and a.author_id <> auth.uid() then perform admin_log('delete_announcement', 'announcement', p_id::text, jsonb_build_object('title', a.title)); end if;
end $$;

-- pin: admins, the leadership of that university, or the dean / vice dean of that college
create or replace function public.can_pin_announcement(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from announcements a where a.id = p_id and a.deleted_at is null and (
      is_admin()
      or exists (select 1 from profiles me where me.id = auth.uid() and me.status::text = 'active' and me.title_verified
                   and me.university_id = a.university_id
                   and (me.academic_title in ('president', 'vice_president')
                        or (me.academic_title in ('dean', 'vice_dean') and a.college_id is not null and a.college_id = me.college_id)))));
$$;

create or replace function public.pin_announcement(p_id uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_pin_announcement(p_id) then raise exception 'not_allowed' using errcode = 'P0001'; end if;
  update announcements set pinned = coalesce(p_pinned, false) where id = p_id;
  if is_admin() then perform admin_log('pin_announcement', 'announcement', p_id::text, jsonb_build_object('pinned', p_pinned)); end if;
end $$;

-- the feed, with author + college for display (same visibility as the table policy)
create or replace function public.announcements_feed(lim int default 50, before timestamptz default null)
returns table(id uuid, college_id uuid, college_name text, title text, body text, link text, pinned boolean,
              created_at timestamptz, edited_at timestamptz, author_id uuid, author_name text, author_avatar text,
              author_title text, author_verified boolean, mine boolean, can_pin boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.college_id, c.name_ar, a.title, a.body, a.link, a.pinned, a.created_at, a.edited_at,
         p.id, p.full_name, p.avatar_url, case when p.title_verified then p.academic_title end, p.title_verified,
         a.author_id = auth.uid(), can_pin_announcement(a.id)
  from announcements a
  join profiles p on p.id = a.author_id
  left join colleges c on c.id = a.college_id
  where auth.uid() is not null and a.deleted_at is null
    and (is_admin() or a.author_id = auth.uid()
         or (a.university_id = my_university()
             and (a.college_id is null or a.college_id = (select me.college_id from profiles me where me.id = auth.uid()))))
    and (is_admin() or a.university_id = my_university() or a.author_id = auth.uid())
    and (before is null or a.created_at < before)
  order by a.pinned desc, a.created_at desc
  limit greatest(1, least(coalesce(lim, 50), 100));
$$;

revoke all on function public.can_announce(uuid), public.my_announce_scopes(), public.announcement_audience_count(uuid),
  public.post_announcement(uuid, text, text, text), public.edit_announcement(uuid, text, text, text), public.delete_announcement(uuid),
  public.can_pin_announcement(uuid), public.pin_announcement(uuid, boolean), public.announcements_feed(int, timestamptz) from public, anon;
grant execute on function public.can_announce(uuid), public.my_announce_scopes(), public.announcement_audience_count(uuid),
  public.post_announcement(uuid, text, text, text), public.edit_announcement(uuid, text, text, text), public.delete_announcement(uuid),
  public.can_pin_announcement(uuid), public.pin_announcement(uuid, boolean), public.announcements_feed(int, timestamptz) to authenticated;
