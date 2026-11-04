-- 1) Clean course names from Teams ("علوم هندسية الفصل الأول 2027/2026" -> "علوم هندسية"), Arabic digits too.
create or replace function clean_course_name(nm text) returns text language sql immutable as $$
  select trim(both ' -_|،,/' from regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    translate(coalesce(nm, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'),
    '(الفصل|الفصل الدراسي)\s*(الأول|الاول|الثاني|الثانى|الصيفي|الصيفى)?', ' ', 'g'),
    '\m(19|20)[0-9]{2}\s*[/\-]\s*(19|20)[0-9]{2}\M|\m(Fall|Spring|Summer|First|Second)\s*(Semester|Term)?\s*((19|20)[0-9]{2})?', ' ', 'gi'),
    '\(.*?\)|\[.*?\]', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

create or replace function import_teams(teams jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare t jsonb; nm text; code text; sec text; n int := 0;
begin
  for t in select * from jsonb_array_elements(coalesce(teams, '[]'::jsonb)) loop
    nm := translate(coalesce(t->>'displayName', ''), '٠١٢٣٤٥٦٧٨٩', '0123456789');
    if nm ~* '(staff|موظف|عمادة|club|نادي|general|عام للطلبة)' then continue; end if;
    code := substring(nm from '\m([A-Za-z]{2,5}\s?[0-9]{3,4}|[0-9]{6,9})\M');
    if code is not null then nm := replace(nm, code, ' '); end if;
    sec := substring(nm from '(?:شعبة|شعبه|\m[Ss]ec(?:tion)?\.?|\m[Ss])\s*[:#-]?\s*([0-9]{1,3})\M');
    nm := regexp_replace(nm, '(شعبة|شعبه|\m[Ss]ec(tion)?\.?|\m[Ss])\s*[:#-]?\s*[0-9]{1,3}\M', ' ', 'g');
    nm := clean_course_name(nm);
    if char_length(nm) < 2 then nm := coalesce(t->>'displayName', ''); end if;
    if enroll_in(nm, replace(code, ' ', ''), sec, null, t->>'id', 'microsoft') is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;
grant execute on function import_teams(jsonb) to authenticated;

update courses set name_ar = clean_course_name(name_ar) where char_length(clean_course_name(name_ar)) >= 2 and clean_course_name(name_ar) <> name_ar;

-- 2) Change a lecture time for the whole section (the class really moved) — any enrolled student, logged.
create or replace function edit_meeting(m uuid, wd smallint, st time, en time, k meeting_kind, room text)
returns void language plpgsql security definer set search_path = public as $$
declare r section_meetings; me uuid := auth.uid();
begin
  select * into r from section_meetings where id = m;
  if r.id is null then raise exception 'not found'; end if;
  if not exists (select 1 from enrollments where user_id = me and section_id = r.section_id) then raise exception 'not enrolled'; end if;
  if en <= st then raise exception 'bad time'; end if;
  update section_meetings set weekday = wd, starts_at = st, ends_at = en, kind = k, room_text = nullif(trim(room), ''), source = 'crowd', confirmations = 1 where id = m;
  delete from meeting_reports where section_id = r.section_id and weekday = r.weekday and starts_at = r.starts_at;
  insert into meeting_reports(section_id, user_id, weekday, starts_at, ends_at, room_text, kind) values (r.section_id, me, wd, st, en, nullif(trim(room), ''), k) on conflict do nothing;
end $$;
grant execute on function edit_meeting(uuid, smallint, time, time, meeting_kind, text) to authenticated;

-- 3) Only for me: hide a section time, or move it, or add my own (e.g. after an internal transfer for one lecture).
create table if not exists personal_meetings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade default auth.uid(),
  section_id  uuid not null references sections(id) on delete cascade,
  replaces    uuid references section_meetings(id) on delete cascade,  -- set: hides/moves that section time for me
  hidden      boolean not null default false,
  kind        meeting_kind not null default 'lecture',
  weekday     smallint check (weekday between 0 and 6),
  starts_at   time,
  ends_at     time,
  room_text   text check (char_length(room_text) <= 80),
  created_at  timestamptz not null default now(),
  check (hidden or (weekday is not null and starts_at is not null and ends_at is not null and ends_at > starts_at))
);
create unique index if not exists personal_meetings_one_replace on personal_meetings(user_id, replaces) where replaces is not null;
alter table personal_meetings enable row level security;
drop policy if exists "personal meetings own" on personal_meetings;
create policy "personal meetings own" on personal_meetings for all using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (select 1 from enrollments e where e.user_id = auth.uid() and e.section_id = personal_meetings.section_id));

-- 4) Internal transfer: move me to another section of the same course (its times and group come with it).
create or replace function change_section(sec uuid, new_no text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); old sections; ns uuid; no text := trim(translate(coalesce(new_no, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'));
begin
  if no !~ '^[0-9A-Za-z]{1,6}$' then raise exception 'bad section'; end if;
  select * into old from sections where id = sec;
  if old.id is null or not exists (select 1 from enrollments where user_id = me and section_id = sec) then raise exception 'not enrolled'; end if;
  if old.section_no = no then return sec; end if;
  select id into ns from sections where course_id = old.course_id and term_id = old.term_id and section_no = no;
  if ns is null then insert into sections(course_id, term_id, section_no) values (old.course_id, old.term_id, no) returning id into ns; end if;
  delete from personal_meetings where user_id = me and section_id = sec;
  update enrollments set section_id = ns where user_id = me and section_id = sec;
  return ns;
end $$;
grant execute on function change_section(uuid, text) to authenticated;
