-- Study tools: absence tracker, GPA calculator, exam mode.
-- Everything here is private to the student (only they read or write their rows), except "studying now",
-- which only classmates enrolled in the same section can see. Every write is validated and capped.

-- ---------- university rules (absence limit, semester length, grade scale) ----------
-- Admins set these per university; students only read them.
alter table public.universities add column if not exists study_rules jsonb not null default '{}'::jsonb;

create or replace function public.study_rules_for(uni uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'absence_pct', coalesce((u.study_rules->>'absence_pct')::numeric, 15),
    'weeks', coalesce((u.study_rules->>'weeks')::int, 16),
    'scale', coalesce(u.study_rules->'scale', '[
      {"g":"A","p":4.00},{"g":"A-","p":3.75},{"g":"B+","p":3.50},{"g":"B","p":3.00},{"g":"B-","p":2.75},
      {"g":"C+","p":2.50},{"g":"C","p":2.00},{"g":"C-","p":1.75},{"g":"D+","p":1.50},{"g":"D","p":1.25},
      {"g":"D-","p":1.00},{"g":"F","p":0.00}]'::jsonb),
    'max_gpa', coalesce((u.study_rules->>'max_gpa')::numeric, 4))
  from universities u where u.id = uni;
$$;
revoke all on function public.study_rules_for(uuid) from public, anon;
grant execute on function public.study_rules_for(uuid) to authenticated;

-- ---------- 1) absences ----------
create table if not exists public.attendance_marks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references profiles(id) on delete cascade,
  section_id  uuid not null references sections(id) on delete cascade,
  on_date     date not null,
  slot        text not null default '' check (char_length(slot) <= 5),   -- 'HH:MM' of the lecture that day ('' = whole day)
  status      text not null default 'absent' check (status in ('absent', 'excused')),
  note        text check (char_length(note) <= 120),
  created_at  timestamptz not null default now(),
  unique (user_id, section_id, on_date, slot)
);
create index if not exists attendance_user_idx on public.attendance_marks(user_id, section_id);
alter table public.attendance_marks enable row level security;
drop policy if exists "attendance own read" on public.attendance_marks;
create policy "attendance own read" on public.attendance_marks for select to authenticated using (user_id = auth.uid());
drop policy if exists "attendance own write" on public.attendance_marks;
create policy "attendance own write" on public.attendance_marks for insert to authenticated with check (
  user_id = auth.uid() and is_enrolled(section_id)
  and on_date <= current_date + 1 and on_date >= current_date - 240);
drop policy if exists "attendance own update" on public.attendance_marks;
create policy "attendance own update" on public.attendance_marks for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and is_enrolled(section_id) and on_date <= current_date + 1 and on_date >= current_date - 240);
drop policy if exists "attendance own delete" on public.attendance_marks;
create policy "attendance own delete" on public.attendance_marks for delete to authenticated using (user_id = auth.uid());
revoke all on public.attendance_marks from anon;

-- per course: weekly meetings, absences, the limit, what's left
create or replace function public.my_attendance()
returns table(section_id uuid, course_name text, course_code text, per_week int, total_sessions int,
              absent int, excused int, limit_sessions int, remaining int, absence_pct numeric)
language sql stable security definer set search_path = public as $$
  with r as (select study_rules_for(my_university()) j),
  mine as (select e.section_id from enrollments e where e.user_id = auth.uid()),
  weekly as (
    select m.section_id, count(*)::int n from section_meetings m join mine using (section_id)
    where not exists (select 1 from meeting_reports mr where mr.section_id = m.section_id and mr.user_id = auth.uid())
       or exists (select 1 from meeting_reports mr where mr.section_id = m.section_id and mr.user_id = auth.uid()
                  and mr.weekday = m.weekday and mr.starts_at = m.starts_at)
    group by 1),
  marks as (
    select a.section_id, count(*) filter (where a.status = 'absent')::int ab, count(*) filter (where a.status = 'excused')::int ex
    from attendance_marks a where a.user_id = auth.uid() group by 1)
  select s.id, c.name_ar, c.code,
    greatest(coalesce(w.n, 0), 1),
    greatest(coalesce(w.n, 0), 1) * (select (j->>'weeks')::int from r),
    coalesce(k.ab, 0), coalesce(k.ex, 0),
    floor(greatest(coalesce(w.n, 0), 1) * (select (j->>'weeks')::int from r) * (select (j->>'absence_pct')::numeric from r) / 100)::int,
    floor(greatest(coalesce(w.n, 0), 1) * (select (j->>'weeks')::int from r) * (select (j->>'absence_pct')::numeric from r) / 100)::int - coalesce(k.ab, 0),
    (select (j->>'absence_pct')::numeric from r)
  from mine join sections s on s.id = mine.section_id join courses c on c.id = s.course_id
  left join weekly w on w.section_id = s.id left join marks k on k.section_id = s.id
  where auth.uid() is not null
  order by c.name_ar;
$$;
revoke all on function public.my_attendance() from public, anon;
grant execute on function public.my_attendance() to authenticated;

-- ---------- 2) grades / GPA ----------
create table if not exists public.grade_records (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references profiles(id) on delete cascade,
  term_label   text not null check (char_length(term_label) between 1 and 40),
  course_name  text not null check (char_length(course_name) between 1 and 80),
  course_code  text check (char_length(course_code) <= 20),
  credit_hours smallint not null check (credit_hours between 0 and 12),
  grade        text check (grade ~ '^[A-DF][+-]?$|^P$'),        -- null = still studying it (planned / what-if)
  target_grade text check (target_grade ~ '^[A-DF][+-]?$'),     -- the grade the student is aiming for
  section_id   uuid references sections(id) on delete set null,
  position     int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists grade_records_user_idx on public.grade_records(user_id, term_label);
alter table public.grade_records enable row level security;
drop policy if exists "grades own read" on public.grade_records;
create policy "grades own read" on public.grade_records for select to authenticated using (user_id = auth.uid());
drop policy if exists "grades own insert" on public.grade_records;
create policy "grades own insert" on public.grade_records for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "grades own update" on public.grade_records;
create policy "grades own update" on public.grade_records for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "grades own delete" on public.grade_records;
create policy "grades own delete" on public.grade_records for delete to authenticated using (user_id = auth.uid());
revoke all on public.grade_records from anon;

-- what they had before using the app (so nobody has to type every old course)
create table if not exists public.gpa_base (
  user_id    uuid primary key default auth.uid() references profiles(id) on delete cascade,
  hours      smallint not null default 0 check (hours between 0 and 300),
  gpa        numeric(4,2) not null default 0 check (gpa between 0 and 4),
  updated_at timestamptz not null default now()
);
alter table public.gpa_base enable row level security;
drop policy if exists "gpa base own" on public.gpa_base;
create policy "gpa base own" on public.gpa_base for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.gpa_base from anon;

-- caps: nobody can fill the database through these tables
create or replace function private.study_caps()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if TG_TABLE_NAME = 'grade_records' then
    new.updated_at := now();
    if TG_OP = 'INSERT' then
      select count(*) into n from grade_records where user_id = new.user_id;
      if n >= 200 then raise exception 'limit_reached' using errcode = 'P0001'; end if;
    end if;
  elsif TG_TABLE_NAME = 'attendance_marks' then
    select count(*) into n from attendance_marks where user_id = new.user_id and created_at > now() - interval '1 minute';
    if n >= 40 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;
drop trigger if exists grade_caps on public.grade_records;
create trigger grade_caps before insert or update on public.grade_records for each row execute function private.study_caps();
drop trigger if exists attendance_caps on public.attendance_marks;
create trigger attendance_caps before insert on public.attendance_marks for each row execute function private.study_caps();

-- ---------- 3) exam mode: "studying this course now" ----------
-- Visible only to classmates in the same section, never across blocks, and it switches itself off.
create table if not exists public.studying_now (
  user_id    uuid primary key default auth.uid() references profiles(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  place      text check (char_length(place) <= 60),
  until      timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists studying_now_section_idx on public.studying_now(section_id, until);
alter table public.studying_now enable row level security;
drop policy if exists "studying read classmates" on public.studying_now;
create policy "studying read classmates" on public.studying_now for select to authenticated using (
  user_id = auth.uid()
  or (until > now() and is_enrolled(section_id) and not is_blocked_between(auth.uid(), user_id)));
drop policy if exists "studying own insert" on public.studying_now;
create policy "studying own insert" on public.studying_now for insert to authenticated with check (
  user_id = auth.uid() and is_enrolled(section_id) and until > now() and until <= now() + interval '6 hours');
drop policy if exists "studying own update" on public.studying_now;
create policy "studying own update" on public.studying_now for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_enrolled(section_id) and until <= now() + interval '6 hours');
drop policy if exists "studying own delete" on public.studying_now;
create policy "studying own delete" on public.studying_now for delete to authenticated using (user_id = auth.uid());
revoke all on public.studying_now from anon;

-- classmates studying a course right now (names and photos only)
create or replace function public.studying_classmates(p_section uuid)
returns table(user_id uuid, full_name text, username text, avatar_url text, place text, until timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.username, p.avatar_url, s.place, s.until
  from studying_now s join profiles p on p.id = s.user_id
  where s.section_id = p_section and s.until > now() and s.user_id <> auth.uid()
    and is_enrolled(p_section)                      -- the caller must be in that section
    and p.status::text = 'active'
    and not is_blocked_between(auth.uid(), p.id)
  order by s.created_at desc limit 50;
$$;
revoke all on function public.studying_classmates(uuid) from public, anon;
grant execute on function public.studying_classmates(uuid) to authenticated;

-- admins: edit a university's rules
create or replace function public.admin_set_study_rules(p_university uuid, p_rules jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_require();
  if jsonb_typeof(p_rules) <> 'object' then raise exception 'bad rules'; end if;
  update universities set study_rules = p_rules where id = p_university;
  perform admin_log('set_study_rules', 'university', p_university::text, p_rules);
end $$;
revoke all on function public.admin_set_study_rules(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_study_rules(uuid, jsonb) to authenticated;
