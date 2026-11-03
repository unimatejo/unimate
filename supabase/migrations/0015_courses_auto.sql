-- Courses come in automatically: from the student's Microsoft Teams classes at sign-in,
-- or added once by any classmate. Times/rooms: the first student who adds them fills them for the whole section,
-- and they are marked confirmed once 3 classmates agree.
alter table section_meetings add column if not exists room_text text;

create or replace function current_term(uni uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid; d date := (now() at time zone 'Asia/Amman')::date; y int := extract(year from d); m int := extract(month from d);
  nm text; s date; e date;
begin
  select id into t from terms where university_id = uni and is_current and d between starts_on and ends_on;
  if t is not null then return t; end if;
  if m >= 9 then nm := 'الفصل الأول ' || y || '/' || (y + 1); s := make_date(y, 9, 1); e := make_date(y + 1, 1, 31);
  elsif m <= 1 then nm := 'الفصل الأول ' || (y - 1) || '/' || y; s := make_date(y - 1, 9, 1); e := make_date(y, 1, 31);
  elsif m <= 6 then nm := 'الفصل الثاني ' || (y - 1) || '/' || y; s := make_date(y, 2, 1); e := make_date(y, 6, 15);
  else nm := 'الفصل الصيفي ' || (y - 1) || '/' || y; s := make_date(y, 6, 16); e := make_date(y, 8, 31); end if;
  update terms set is_current = false where university_id = uni and is_current;
  select id into t from terms where university_id = uni and name = nm;
  if t is null then insert into terms(university_id, name, starts_on, ends_on, is_current) values (uni, nm, s, e, true) returning id into t;
  else update terms set is_current = true where id = t; end if;
  return t;
end $$;
revoke execute on function current_term(uuid) from public, anon, authenticated;

-- find or create a course + section and enroll the caller
create or replace function enroll_in(course_name text, course_code text, section_no text, instructor text, teams_id text, src enrollment_source)
returns uuid language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare me uuid := auth.uid(); uni uuid; term uuid; c uuid; s uuid; cc text; nm text := left(trim(course_name), 120); sec text := coalesce(nullif(trim(section_no), ''), '1');
begin
  select university_id into uni from profiles where id = me;
  if uni is null or coalesce(char_length(nm), 0) < 2 then return null; end if;
  term := current_term(uni);
  if teams_id is not null then select id into s from sections where sections.teams_id = enroll_in.teams_id; end if;
  if s is null then
    cc := upper(coalesce(nullif(trim(course_code), ''), 'X' || left(md5(lower(regexp_replace(nm, '\s+', ' ', 'g'))), 7)));
    select id into c from courses where university_id = uni and (courses.code = cc or lower(courses.name_ar) = lower(nm)) order by (courses.code = cc) desc limit 1;
    if c is null then insert into courses(university_id, code, name_ar) values (uni, cc, nm) on conflict (university_id, code) do update set name_ar = courses.name_ar returning id into c; end if;
    select id into s from sections where course_id = c and term_id = term and sections.section_no = sec;
    if s is null then
      insert into sections(course_id, term_id, section_no, instructor, teams_id) values (c, term, sec, nullif(trim(enroll_in.instructor), ''), enroll_in.teams_id)
      on conflict (course_id, term_id, section_no) do update set teams_id = coalesce(sections.teams_id, excluded.teams_id) returning id into s;
    end if;
  end if;
  insert into enrollments(user_id, section_id, source) values (me, s, src) on conflict do nothing;
  return s;
end $$;
revoke execute on function enroll_in(text, text, text, text, text, enrollment_source) from public, anon;

-- Teams classes -> courses. Team names look like "Calculus 1 - Sec 3 (2026/2027)" / "101101 تفاضل وتكامل شعبة 2".
create or replace function import_teams(teams jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare t jsonb; nm text; code text; sec text; n int := 0;
begin
  for t in select * from jsonb_array_elements(coalesce(teams, '[]'::jsonb)) loop
    nm := coalesce(t->>'displayName', '');
    if nm ~* '(staff|موظف|عمادة|club|نادي|general|عام للطلبة)' then continue; end if;
    code := substring(nm from '\m([A-Za-z]{2,5}\s?[0-9]{3,4}|[0-9]{6,9})\M');
    if code is not null then nm := replace(nm, code, ' '); end if;
    sec := substring(nm from '(?:شعبة|شعبه|\m[Ss]ec(?:tion)?\.?|\m[Ss])\s*[:#-]?\s*([0-9]{1,3})\M');
    nm := regexp_replace(regexp_replace(nm, '\(.*?\)|\[.*?\]', ' ', 'g'), '(شعبة|شعبه|\m[Ss]ec(tion)?\.?|\m[Ss])\s*[:#-]?\s*[0-9]{1,3}\M', ' ', 'g');
    nm := trim(both ' -_|،,' from regexp_replace(nm, '\s+', ' ', 'g'));
    if char_length(nm) < 2 then nm := coalesce(t->>'displayName', ''); end if;
    if enroll_in(nm, replace(code, ' ', ''), sec, null, t->>'id', 'microsoft') is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;
grant execute on function import_teams(jsonb) to authenticated;

-- add a course by hand (once; classmates in the same section then get it with its times)
create or replace function add_course(course_name text, section_no text, course_code text default null, instructor text default null)
returns uuid language sql security definer set search_path = public as $$
  select enroll_in(course_name, course_code, section_no, instructor, null, 'manual');
$$;
grant execute on function add_course(text, text, text, text) to authenticated;

-- report a lecture time; the first report fills it for the whole section right away
create or replace function report_meeting(sec uuid, wd smallint, st time, en time, k meeting_kind, room text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not exists (select 1 from enrollments where user_id = me and section_id = sec) then raise exception 'not enrolled'; end if;
  if en <= st then raise exception 'bad time'; end if;
  insert into meeting_reports(section_id, user_id, weekday, starts_at, ends_at, room_text, kind)
  values (sec, me, wd, st, en, nullif(trim(room), ''), k) on conflict do nothing;
  if not exists (select 1 from section_meetings where section_id = sec and weekday = wd and starts_at = st) then
    insert into section_meetings(section_id, kind, weekday, starts_at, ends_at, room_text, source, confirmations)
    values (sec, k, wd, st, en, nullif(trim(room), ''), 'crowd', 1);
  end if;
end $$;
grant execute on function report_meeting(uuid, smallint, time, time, meeting_kind, text) to authenticated;

-- remove a wrong time (only if you reported it and nobody else confirmed)
create or replace function remove_meeting(m uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r section_meetings;
begin
  select * into r from section_meetings where id = m;
  if r.id is null or r.source <> 'crowd' or r.confirmations > 1 then raise exception 'cannot remove'; end if;
  if not exists (select 1 from meeting_reports where section_id = r.section_id and weekday = r.weekday and starts_at = r.starts_at and user_id = auth.uid()) then raise exception 'not yours'; end if;
  delete from meeting_reports where section_id = r.section_id and weekday = r.weekday and starts_at = r.starts_at;
  delete from section_meetings where id = m;
end $$;
grant execute on function remove_meeting(uuid) to authenticated;
