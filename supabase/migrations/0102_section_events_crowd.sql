-- UniMate · 0102 exams and assignments the whole section agrees on.
-- Before: any one student could push an exam to everyone in the section (easy to troll, easy to get wrong).
-- Now: a student adds it for themself and ticks "for my section". Once enough DIFFERENT classmates add the same
-- thing (same kind, same day) it becomes one official event for the whole section, at the time most of them gave.
-- Enough = 20% of the section's app users, at least 2 and at most 5. Classmates see "3 from your section added…"
-- and can confirm with one tap (or say it's wrong). The same number saying "wrong" takes an official event down.
-- Admins can still post directly. Moodle imports (0103) count as one classmate each, like a typed one.

alter table academic_events add column if not exists shared_ask boolean not null default false;
alter table academic_events add column if not exists merged_into uuid references academic_events(id) on delete set null;
alter table academic_events add column if not exists source text not null default 'manual';
alter table academic_events drop constraint if exists academic_events_source_check;
alter table academic_events add constraint academic_events_source_check check (source in ('manual', 'moodle', 'crowd', 'admin'));
alter table academic_events add column if not exists ext_uid text;
create index if not exists academic_events_asks_idx on academic_events(section_id, kind, starts_at) where shared_ask and merged_into is null;
create unique index if not exists academic_events_ext_uid on academic_events(owner_id, ext_uid) where ext_uid is not null;

create table if not exists public.event_disputes (
  event_id   uuid not null references academic_events(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_disputes enable row level security;
revoke all on public.event_disputes from anon, authenticated;

-- ---------- rules ----------
-- students no longer write section-wide rows; their own rows are theirs; official rows belong to the system / admins
drop policy if exists "events add" on academic_events;
create policy "events add" on academic_events for insert to authenticated with check (
  created_by = auth.uid() and (owner_id = auth.uid() or (owner_id is null and is_admin())));
drop policy if exists "events edit" on academic_events;
create policy "events edit" on academic_events for update to authenticated
  using (owner_id = auth.uid() or is_admin()) with check (owner_id = auth.uid() or is_admin());
drop policy if exists "events delete" on academic_events;
create policy "events delete" on academic_events for delete to authenticated using (owner_id = auth.uid() or is_admin());

-- the counted fields are the server's: a student can't fake confirmations or point their row at an official one
create or replace function private.events_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if current_setting('unimate.system', true) = 'on' then return new; end if;
  if is_admin() then
    if tg_op = 'INSERT' and new.owner_id is null and new.source = 'manual' then new.source := 'admin'; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.confirmations := 1; new.merged_into := null; new.source := case when new.source = 'moodle' then 'moodle' else 'manual' end;
  else
    new.confirmations := old.confirmations; new.merged_into := old.merged_into; new.source := old.source; new.ext_uid := old.ext_uid;
  end if;
  -- only a real section of mine can be asked about, and never a personal "custom" reminder
  if new.shared_ask and (new.section_id is null or new.kind = 'custom' or not is_enrolled(new.section_id)) then new.shared_ask := false; end if;
  return new;
end $$;
drop trigger if exists academic_events_guard on academic_events;
create trigger academic_events_guard before insert or update on academic_events for each row execute function private.events_guard();

create or replace function private.section_quorum(p_section uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(2, least(5, ceil(count(*) * 0.2)::int)) from enrollments where section_id = p_section;
$$;

-- ---------- promoting ----------
create or replace function private.promote_section_event(p_section uuid, p_kind event_kind, p_day date)
returns uuid language plpgsql security definer set search_path = public as $$
declare off uuid; n int; q int := private.section_quorum(p_section); at timestamptz; ttl text; loc text; fresh boolean := false;
begin
  -- one official event per section, kind and day
  select id into off from academic_events
  where section_id = p_section and owner_id is null and kind = p_kind and (starts_at at time zone 'Asia/Amman')::date = p_day
  order by created_at limit 1;

  select count(distinct a.owner_id) into n from academic_events a join enrollments e on e.section_id = a.section_id and e.user_id = a.owner_id
  where a.section_id = p_section and a.kind = p_kind and a.shared_ask and a.merged_into is null
    and (a.starts_at at time zone 'Asia/Amman')::date = p_day;
  if off is null and n < q then return null; end if;

  perform set_config('unimate.system', 'on', true);
  if off is null then
    -- the time, title and place most classmates gave
    select starts_at into at from academic_events where section_id = p_section and kind = p_kind and shared_ask and merged_into is null
      and (starts_at at time zone 'Asia/Amman')::date = p_day group by starts_at order by count(*) desc, starts_at limit 1;
    select title into ttl from academic_events where section_id = p_section and kind = p_kind and shared_ask and merged_into is null
      and (starts_at at time zone 'Asia/Amman')::date = p_day group by title order by count(*) desc, min(created_at) limit 1;
    select location into loc from academic_events where section_id = p_section and kind = p_kind and shared_ask and merged_into is null
      and (starts_at at time zone 'Asia/Amman')::date = p_day and location is not null group by location order by count(*) desc limit 1;
    insert into academic_events(section_id, owner_id, kind, title, starts_at, location, created_by, confirmations, source)
    values (p_section, null, p_kind, ttl, at, loc, null, 0, 'crowd') returning id into off;
    fresh := true;
  end if;

  -- fold every classmate's copy into the official one; their reminders move with it
  update reminders r set event_id = off
  from academic_events a
  where r.event_id = a.id and a.section_id = p_section and a.kind = p_kind and a.shared_ask and a.merged_into is null
    and (a.starts_at at time zone 'Asia/Amman')::date = p_day
    and not exists (select 1 from reminders x where x.user_id = r.user_id and x.event_id = off);
  update academic_events set merged_into = off
  where section_id = p_section and kind = p_kind and shared_ask and merged_into is null and id <> off
    and (starts_at at time zone 'Asia/Amman')::date = p_day;
  update academic_events set confirmations = (select count(distinct owner_id) from academic_events where merged_into = off) where id = off;

  if fresh then
    -- everyone else in the section hears about it once
    insert into notifications(user_id, kind, title, body, data)
    select e.user_id, 'section_event', 'انضاف موعد لشعبتك 📌',
           ttl || ' · ' || to_char(at at time zone 'Asia/Amman', 'DD/MM HH24:MI'), jsonb_build_object('event_id', off)
    from enrollments e
    where e.section_id = p_section
      and not exists (select 1 from academic_events a where a.merged_into = off and a.owner_id = e.user_id);
  end if;
  perform set_config('unimate.system', 'off', true);
  return off;
end $$;

create or replace function private.events_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null and new.shared_ask and new.merged_into is null and new.section_id is not null then
    perform private.promote_section_event(new.section_id, new.kind, (new.starts_at at time zone 'Asia/Amman')::date);
  end if;
  return null;
end $$;
drop trigger if exists academic_events_promote on academic_events;
create trigger academic_events_promote after insert or update of shared_ask, kind, starts_at, section_id on academic_events
for each row execute function private.events_after();

-- ---------- what the app reads ----------
-- my events: my own (not folded) + the official ones of my sections, with how sure the section is
create or replace function public.my_events(p_from timestamptz, p_to timestamptz)
returns table(id uuid, section_id uuid, owner_id uuid, kind event_kind, title text, starts_at timestamptz, location text,
              course_name text, course_name_en text, confirmations int, shared_ask boolean, source text, disputed boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.section_id, a.owner_id, a.kind, a.title, a.starts_at, a.location, c.name_ar, c.name_en,
         a.confirmations, a.shared_ask, a.source,
         exists (select 1 from event_disputes d where d.event_id = a.id and d.user_id = auth.uid())
  from academic_events a left join sections s on s.id = a.section_id left join courses c on c.id = s.course_id
  where a.starts_at between p_from and p_to
    and ((a.owner_id = auth.uid() and a.merged_into is null)
      or (a.owner_id is null and exists (select 1 from enrollments e where e.section_id = a.section_id and e.user_id = auth.uid())))
  order by a.starts_at
  limit 300;
$$;

-- what classmates added that I haven't (and isn't official yet): "3 من شعبتك ضافوا فيرست الأحد"
create or replace function public.section_event_asks()
returns table(section_id uuid, course_name text, course_name_en text, kind event_kind, day date, starts_at timestamptz, title text, count int, needed int)
language sql stable security definer set search_path = public as $$
  with mine as (select section_id from enrollments where user_id = auth.uid()),
  asks as (
    select a.section_id, a.kind, (a.starts_at at time zone 'Asia/Amman')::date d, a.starts_at, a.title, a.owner_id
    from academic_events a join mine m on m.section_id = a.section_id
    join enrollments e on e.section_id = a.section_id and e.user_id = a.owner_id
    where a.shared_ask and a.merged_into is null and a.starts_at > now())
  select g.section_id, c.name_ar, c.name_en, g.kind, g.d,
         (select starts_at from asks x where x.section_id = g.section_id and x.kind = g.kind and x.d = g.d group by starts_at order by count(*) desc limit 1),
         (select title from asks x where x.section_id = g.section_id and x.kind = g.kind and x.d = g.d group by title order by count(*) desc limit 1),
         g.n, private.section_quorum(g.section_id)
  from (select section_id, kind, d, count(distinct owner_id)::int n from asks group by 1, 2, 3) g
  join sections s on s.id = g.section_id join courses c on c.id = s.course_id
  where not exists (select 1 from asks x where x.section_id = g.section_id and x.kind = g.kind and x.d = g.d and x.owner_id = auth.uid())
  order by g.d
  limit 20;
$$;

-- "صح، عندي كمان": add my own copy (counts toward the quorum) with a reminder
create or replace function public.confirm_section_event(p_section uuid, p_kind event_kind, p_day date)
returns uuid language plpgsql security definer set search_path = public as $$
declare src academic_events; mine uuid; n int;
begin
  if auth.uid() is null or not is_enrolled(p_section) then raise exception 'not allowed'; end if;
  select count(*) into n from academic_events where owner_id = auth.uid() and created_at > now() - interval '1 day';
  if n >= 40 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  if exists (select 1 from academic_events where owner_id = auth.uid() and section_id = p_section and kind = p_kind
             and (starts_at at time zone 'Asia/Amman')::date = p_day and (shared_ask or merged_into is not null)) then return null; end if;
  -- copy the version most classmates gave
  select a.* into src from academic_events a
  where a.section_id = p_section and a.kind = p_kind and a.shared_ask and a.merged_into is null and a.starts_at > now()
    and (a.starts_at at time zone 'Asia/Amman')::date = p_day
  order by (select count(*) from academic_events b where b.section_id = a.section_id and b.kind = a.kind and b.shared_ask
            and b.merged_into is null and b.starts_at = a.starts_at) desc, a.created_at
  limit 1;
  if src.id is null then raise exception 'not found'; end if;
  insert into academic_events(section_id, owner_id, kind, title, starts_at, location, created_by, shared_ask)
  values (p_section, auth.uid(), p_kind, src.title, src.starts_at, src.location, auth.uid(), true) returning id into mine;
  insert into reminders(user_id, event_id, minutes, enabled)
  values (auth.uid(), coalesce((select merged_into from academic_events where id = mine), mine), case when p_kind::text like 'exam%' then 1440 else 120 end, true)
  on conflict (user_id, event_id) do nothing;
  return mine;
end $$;

-- "مش صح": when as many classmates as the quorum say an official event is wrong (and they outnumber the ones who
-- added it), it comes down; everyone's own copy goes back to being just theirs
create or replace function public.dispute_section_event(p_event uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare e academic_events; n int;
begin
  select * into e from academic_events where id = p_event and owner_id is null;
  if e.id is null or auth.uid() is null or not is_enrolled(e.section_id) then raise exception 'not allowed'; end if;
  if e.source = 'admin' then raise exception 'official'; end if;
  insert into event_disputes(event_id, user_id) values (p_event, auth.uid()) on conflict do nothing;
  select count(*) into n from event_disputes d join enrollments x on x.section_id = e.section_id and x.user_id = d.user_id where d.event_id = p_event;
  if n >= private.section_quorum(e.section_id) and n > e.confirmations then
    perform set_config('unimate.system', 'on', true);
    update academic_events set merged_into = null, shared_ask = false where merged_into = p_event;
    -- reminders go back to each person's own copy
    update reminders r set event_id = a.id from academic_events a
    where r.event_id = p_event and a.owner_id = r.user_id and a.section_id = e.section_id and a.kind = e.kind
      and (a.starts_at at time zone 'Asia/Amman')::date = (e.starts_at at time zone 'Asia/Amman')::date;
    delete from academic_events where id = p_event;
    perform set_config('unimate.system', 'off', true);
    return true;
  end if;
  return false;
end $$;

-- the one section-wide event made the old way becomes a normal official one
select set_config('unimate.system', 'on', true);
update academic_events set source = 'admin' where owner_id is null and source = 'manual';
select set_config('unimate.system', 'off', true);

revoke all on function private.events_guard(), private.section_quorum(uuid), private.promote_section_event(uuid, event_kind, date), private.events_after()
  from public, anon, authenticated;
revoke all on function public.my_events(timestamptz, timestamptz), public.section_event_asks(), public.confirm_section_event(uuid, event_kind, date),
  public.dispute_section_event(uuid) from public, anon;
grant execute on function public.my_events(timestamptz, timestamptz), public.section_event_asks(), public.confirm_section_event(uuid, event_kind, date),
  public.dispute_section_event(uuid) to authenticated;
