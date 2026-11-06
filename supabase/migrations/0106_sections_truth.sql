-- UniMate · 0106 a student only gets what belongs to THEIR section (for review — not applied yet).
--
-- Root cause (found 2026-11-06): enroll_in() gives every course whose name has no section number the section "1".
-- University-wide courses on Microsoft Teams ("مهارات الحياة والعمل", "الريادة والابتكار", …) have one Team per real
-- section, usually without a number in its name — so every Team of the course was folded into ONE row, "section 1":
-- 26 students from different real sections sharing one timetable, one group chat and one set of exams. A single
-- student's "for my section" exam (made before 0102, when one tap reached the whole section) then reached all 18 of
-- "الممارسة المهنية في الاقتصاد الأخضر". The timetable photo and "add a course" had the same "1" default.
--
-- Fix:
--  1) No number = an UNKNOWN section, never "1": section_no '?xxxxxx', one per Team (or per student for a photo /
--     typed course). Unknown sections get no section-wide events, crowd confirmations or section chat name; the app
--     asks the student "which section are you in?" (change_section moves them to the real one).
--  2) The 5 rows that were merged this way become unknown now (their students are asked once to pick their section).
--  3) change_section really moves the student: leaves the old section's group, joins the new one (it used to keep
--     them in the old chat).
--  4) Crowd events are stricter: 30 % of the section's app users (at least 3, at most 8), the same kind, the same day
--     and within an hour of the time most of them gave; still taken down when as many say it's wrong.
--  5) Admins post official events to exactly one scope: a section, every section of a course, or every section of a
--     college's courses this term — and only students enrolled there get them.
--  6) The one section-wide event made the old way (by one student, no longer known who) is removed — listed below.

-- ---------- 1) unknown sections ----------
create or replace function private.section_known(p_no text) returns boolean
language sql immutable set search_path = '' as $$ select p_no is not null and left(p_no, 1) <> '?' $$;

create or replace function public.enroll_in(course_name text, course_code text, section_no text, instructor text, teams_id text, src enrollment_source)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := auth.uid(); uni uuid; term uuid; c uuid; s uuid; cc text;
  nm text := left(trim(course_name), 120);
  sec text := nullif(trim(translate(coalesce(section_no, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789')), '');
begin
  select university_id into uni from profiles where id = me;
  if uni is null or coalesce(char_length(nm), 0) < 2 then return null; end if;
  term := current_term(uni);
  if teams_id is not null then select id into s from sections where sections.teams_id = enroll_in.teams_id; end if;
  if s is null then
    cc := upper(coalesce(nullif(trim(course_code), ''), 'X' || left(md5(lower(regexp_replace(nm, '\s+', ' ', 'g'))), 7)));
    select id into c from courses where university_id = uni and (courses.code = cc or lower(courses.name_ar) = lower(nm))
      order by (courses.code = cc) desc limit 1;
    if c is null then
      insert into courses(university_id, code, name_ar) values (uni, cc, nm)
      on conflict (university_id, code) do update set name_ar = courses.name_ar returning id into c;
    end if;
    -- no number: a section of its own (this Team, or this student), never somebody else's "1"
    if sec is null or sec !~ '^[0-9A-Za-z]{1,6}$' then sec := '?' || left(md5(coalesce(enroll_in.teams_id, me::text || ':' || c::text)), 6); end if;
    select id into s from sections where course_id = c and term_id = term and sections.section_no = sec;
    if s is null then
      insert into sections(course_id, term_id, section_no, instructor, teams_id)
      values (c, term, sec, nullif(trim(enroll_in.instructor), ''), enroll_in.teams_id)
      on conflict (course_id, term_id, section_no) do update set teams_id = coalesce(sections.teams_id, excluded.teams_id)
      returning id into s;
    end if;
  end if;
  insert into enrollments(user_id, section_id, source) values (me, s, src) on conflict do nothing;
  return s;
end $$;
revoke execute on function public.enroll_in(text, text, text, text, text, enrollment_source) from public, anon, authenticated;

create or replace function public.add_course(course_name text, section_no text default null, course_code text default null, instructor text default null)
returns uuid language sql security definer set search_path = public as $$
  select enroll_in(course_name, course_code, section_no, instructor, null, 'manual');
$$;

-- the section's group chat: "تفاضل وتكامل 1 · شعبة 3", or just the course name while the section isn't known
create or replace function public.ensure_section_community() returns trigger
language plpgsql security definer set search_path = public as $$
declare comm uuid; conv uuid; uni uuid; label text;
begin
  select c.university_id, c.name_ar || case when private.section_known(s.section_no) then ' · شعبة ' || s.section_no else '' end
    into uni, label from sections s join courses c on c.id = s.course_id where s.id = new.section_id;
  select id into comm from communities where section_id = new.section_id and kind = 'course_section';
  if comm is null then insert into communities(university_id, kind, section_id, name) values (uni, 'course_section', new.section_id, label) returning id into comm; end if;
  insert into community_members(community_id, user_id) values (comm, new.user_id) on conflict do nothing;
  select id into conv from conversations where community_id = comm and kind = 'community';
  if conv is null then
    insert into conversations(kind, university_id, community_id, title, vanish, block_screenshots) values ('community', uni, comm, label, 'never', false) returning id into conv;
  end if;
  insert into conversation_members(conversation_id, user_id) values (conv, new.user_id) on conflict (conversation_id, user_id) do update set state = 'active';
  return new;
end $$;

-- ---------- 3) moving to the right section really moves you ----------
create or replace function public.change_section(sec uuid, new_no text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); old sections; ns uuid; src enrollment_source;
  no text := trim(translate(coalesce(new_no, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'));
begin
  if no !~ '^[0-9A-Za-z]{1,6}$' then raise exception 'bad section'; end if;
  select * into old from sections where id = sec;
  select e.source into src from enrollments e where e.user_id = me and e.section_id = sec;
  if old.id is null or src is null then raise exception 'not enrolled'; end if;
  if old.section_no = no then return sec; end if;
  select id into ns from sections where course_id = old.course_id and term_id = old.term_id and section_no = no;
  if ns is null then insert into sections(course_id, term_id, section_no) values (old.course_id, old.term_id, no) returning id into ns; end if;
  delete from personal_meetings where user_id = me and section_id = sec;
  delete from meeting_reports where user_id = me and section_id = sec;
  -- leave + join (not an update): the group chats follow, through the enrollment triggers
  delete from enrollments where user_id = me and section_id = sec;
  insert into enrollments(user_id, section_id, source) values (me, ns, 'manual') on conflict do nothing;
  -- my own exams / reminders for that course go with me
  update academic_events set section_id = ns where owner_id = me and section_id = sec;
  return ns;
end $$;

-- ---------- 2) the rows merged by the old default ----------
-- (a Teams-made "section 1" with two or more students: 5 rows today, listed in the review)
select set_config('unimate.system', 'on', true);
update sections s set section_no = '?' || left(md5(s.teams_id), 6)
where s.teams_id is not null and s.section_no = '1'
  and (select count(*) from enrollments e where e.section_id = s.id) >= 2;
update communities m set name = c.name_ar
from sections s join courses c on c.id = s.course_id
where m.section_id = s.id and m.kind = 'course_section' and not private.section_known(s.section_no);
update conversations v set title = m.name
from communities m join sections s on s.id = m.section_id
where v.community_id = m.id and v.kind = 'community' and not private.section_known(s.section_no);

-- ---------- 4) stricter crowd ----------
create or replace function private.section_quorum(p_section uuid) returns int
language sql stable security definer set search_path = public as $$
  select greatest(3, least(8, ceil(count(*) * 0.3)::int)) from enrollments where section_id = p_section;
$$;

-- classmates' copies that agree: same section / kind / day, and within an hour of `p_at` (the official event's time
-- once there is one) or else of the time most of them gave
create or replace function private.agreeing_asks(p_section uuid, p_kind event_kind, p_day date, p_at timestamptz default null)
returns setof academic_events language sql stable security definer set search_path = public as $$
  with asks as (
    select a.* from academic_events a join enrollments e on e.section_id = a.section_id and e.user_id = a.owner_id
    where a.section_id = p_section and a.kind = p_kind and a.shared_ask and a.merged_into is null
      and (a.starts_at at time zone 'Asia/Amman')::date = p_day),
  ref as (select coalesce(p_at, (select starts_at from asks group by starts_at order by count(*) desc, starts_at limit 1)) at)
  select asks.* from asks, ref where abs(extract(epoch from asks.starts_at - ref.at)) <= 3600;
$$;

create or replace function private.promote_section_event(p_section uuid, p_kind event_kind, p_day date)
returns uuid language plpgsql security definer set search_path = public as $$
declare off uuid; n int; q int := private.section_quorum(p_section); at timestamptz; ttl text; loc text; fresh boolean := false;
begin
  if not private.section_known((select section_no from sections where id = p_section)) then return null; end if;
  select id, starts_at into off, at from academic_events
  where section_id = p_section and owner_id is null and kind = p_kind and (starts_at at time zone 'Asia/Amman')::date = p_day
  order by created_at limit 1;
  select count(distinct owner_id) into n from private.agreeing_asks(p_section, p_kind, p_day, at);
  if off is not null and n = 0 then return off; end if;
  if off is null and n < q then return null; end if;

  perform set_config('unimate.system', 'on', true);
  if off is null then
    select starts_at into at from private.agreeing_asks(p_section, p_kind, p_day) group by starts_at order by count(*) desc, starts_at limit 1;
    select title into ttl from private.agreeing_asks(p_section, p_kind, p_day) group by title order by count(*) desc, min(created_at) limit 1;
    select location into loc from private.agreeing_asks(p_section, p_kind, p_day) where location is not null group by location order by count(*) desc limit 1;
    insert into academic_events(section_id, owner_id, kind, title, starts_at, location, created_by, confirmations, source)
    values (p_section, null, p_kind, ttl, at, loc, null, 0, 'crowd') returning id into off;
    fresh := true;
  end if;
  -- only the copies that agree are folded in; a copy at another time stays its owner's own
  update reminders r set event_id = off
  from private.agreeing_asks(p_section, p_kind, p_day, at) a
  where r.event_id = a.id and not exists (select 1 from reminders x where x.user_id = r.user_id and x.event_id = off);
  update academic_events set merged_into = off
  where id in (select id from private.agreeing_asks(p_section, p_kind, p_day, at)) and id <> off;
  update academic_events set confirmations = (select count(distinct owner_id) from academic_events where merged_into = off) where id = off;
  if fresh then
    insert into notifications(user_id, kind, title, body, data)
    select e.user_id, 'section_event', 'زملاءك ضافوا موعد لشعبتك 📌',
           ttl || ' · ' || to_char(at at time zone 'Asia/Amman', 'DD/MM HH24:MI') || ' · لسا مش رسمي', jsonb_build_object('event_id', off)
    from enrollments e
    where e.section_id = p_section and not exists (select 1 from academic_events a where a.merged_into = off and a.owner_id = e.user_id);
  end if;
  perform set_config('unimate.system', 'off', true);
  return off;
end $$;

-- asking about an unknown section does nothing (the guard drops the flag)
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
  if new.shared_ask and (new.section_id is null or new.kind = 'custom' or not is_enrolled(new.section_id)
      or not private.section_known((select section_no from sections where id = new.section_id))) then
    new.shared_ask := false;
  end if;
  return new;
end $$;

-- ---------- 5) official events, to exactly one scope ----------
create or replace function public.admin_post_event(p_scope text, p_target uuid, p_kind event_kind, p_title text, p_starts timestamptz, p_location text default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int; ttl text := left(trim(coalesce(p_title, '')), 80);
begin
  perform admin_require();
  if p_scope not in ('section', 'course', 'college') or p_target is null then raise exception 'bad scope'; end if;
  if char_length(ttl) < 2 or p_starts is null or p_kind = 'custom' then raise exception 'bad event'; end if;
  perform set_config('unimate.system', 'on', true);
  with target as (
    select s.id from sections s join courses c on c.id = s.course_id
    where (p_scope = 'section' and s.id = p_target)
       or (p_scope = 'course' and s.course_id = p_target and s.term_id = current_term(c.university_id))
       or (p_scope = 'college' and s.term_id = current_term(c.university_id)
           and c.major_id in (select id from majors where college_id = p_target))),
  made as (
    insert into academic_events(section_id, owner_id, kind, title, starts_at, location, created_by, confirmations, source)
    select t.id, null, p_kind, ttl, p_starts, nullif(trim(p_location), ''), auth.uid(), 0, 'admin' from target t
    returning id, section_id)
  insert into notifications(user_id, kind, title, body, data)
  select e.user_id, 'section_event', 'موعد رسمي 📌', ttl || ' · ' || to_char(p_starts at time zone 'Asia/Amman', 'DD/MM HH24:MI'), jsonb_build_object('event_id', m.id)
  from made m join enrollments e on e.section_id = m.section_id;
  get diagnostics n = row_count;
  perform set_config('unimate.system', 'off', true);
  perform admin_log('post_event', p_scope, p_target::text, jsonb_build_object('kind', p_kind, 'title', ttl, 'starts', p_starts, 'students', n));
  return n;
end $$;
revoke all on function public.admin_post_event(text, uuid, event_kind, text, timestamptz, text) from public, anon;
grant execute on function public.admin_post_event(text, uuid, event_kind, text, timestamptz, text) to authenticated;

-- ---------- 6) clean-up (see the review list) ----------
-- the old one-student "for the whole section" exam: 912f1a32 · فيرست · الممارسة المهنية في الاقتصاد الأخضر · 11/11
delete from academic_events where id = '912f1a32-3dfd-4b2f-92d6-f98f1ec5fe90' and owner_id is null and created_by is null;
select set_config('unimate.system', 'off', true);

revoke all on function private.section_known(text), private.agreeing_asks(uuid, event_kind, date, timestamptz) from public, anon, authenticated;
