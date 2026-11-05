-- Honor board (المتفوقين): students ranked by their OFFICIAL GPA from the university.
-- Grades never come from the student: only an admin import (or, later, the university's own feed) fills them.
-- They live in the private schema; the app only ever gets rank, name and GPA of the top of each list,
-- plus the student's own place. Anyone can hide themselves. Every import is logged.

create table if not exists private.official_grades (
  university_id  uuid not null references public.universities(id) on delete cascade,
  student_number text not null check (student_number ~ '^[0-9]{5,12}$'),
  term_label     text not null check (char_length(term_label) between 2 and 40),
  term_gpa       numeric(3,2) check (term_gpa between 0 and 4),
  cumulative_gpa numeric(3,2) check (cumulative_gpa between 0 and 4),
  credit_hours   smallint check (credit_hours between 0 and 300),
  imported_at    timestamptz not null default now(),
  primary key (university_id, student_number, term_label)
);
create index if not exists official_grades_term_idx on private.official_grades(university_id, term_label);

-- which term is "this term" per university (the latest import unless an admin sets it)
create table if not exists private.honor_terms (
  university_id uuid primary key references public.universities(id) on delete cascade,
  term_label    text not null,
  updated_at    timestamptz not null default now()
);

-- yesterday's ranks, for the ↑ / ↓ arrows
create table if not exists private.honor_snapshots (
  day        date not null,
  scope_key  text not null,
  user_id    uuid not null,
  rank       int not null,
  primary key (day, scope_key, user_id)
);

alter table public.profiles add column if not exists hide_honor boolean not null default false;

-- the ranked list behind everything (one place, so every view uses the same rules)
create or replace function private.honor_rows(p_uni uuid, p_period text)
returns table(user_id uuid, gpa numeric, major_id uuid, college_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, case when p_period = 'term' then g.term_gpa else g.cumulative_gpa end, p.major_id, p.college_id
  from private.official_grades g
  join private.honor_terms ht on ht.university_id = g.university_id and ht.term_label = g.term_label
  join profile_private pp on pp.student_number = g.student_number
  join profiles p on p.id = pp.user_id and p.university_id = g.university_id
  where g.university_id = p_uni and p.status::text = 'active' and p.account_type = 'student' and not p.hide_honor
    and (case when p_period = 'term' then g.term_gpa else g.cumulative_gpa end) is not null;
$$;

create or replace function public.honor_board(p_scope text default 'college', p_period text default 'term')
returns table(rank int, user_id uuid, full_name text, username text, avatar_url text, major text, gpa numeric, move int, is_me boolean, total int)
language plpgsql stable security definer set search_path = public as $$
declare me profiles; key text;
begin
  if p_scope not in ('major', 'college', 'university') or p_period not in ('term', 'cumulative') then raise exception 'bad args'; end if;
  select * into me from profiles where id = auth.uid();
  if me.id is null or me.university_id is null then return; end if;
  key := p_scope || ':' || p_period || ':' || coalesce(case p_scope when 'major' then me.major_id::text when 'college' then me.college_id::text else me.university_id::text end, '-');
  return query
  with r as (
    select h.user_id, h.gpa, (rank() over (order by h.gpa desc))::int rk, count(*) over ()::int tot
    from private.honor_rows(me.university_id, p_period) h
    where p_scope = 'university' or (p_scope = 'college' and h.college_id is not distinct from me.college_id and me.college_id is not null)
       or (p_scope = 'major' and h.major_id is not distinct from me.major_id and me.major_id is not null))
  select r.rk, p.id, p.full_name, p.username, p.avatar_url, m.name_ar, r.gpa,
         (select s.rank - r.rk from private.honor_snapshots s where s.scope_key = key and s.user_id = r.user_id
            and s.day = (select max(day) from private.honor_snapshots where scope_key = key and day < current_date))::int,
         p.id = auth.uid(), r.tot
  from r join profiles p on p.id = r.user_id left join majors m on m.id = p.major_id
  where (r.rk <= 100 or p.id = auth.uid()) and not is_blocked_between(auth.uid(), p.id)
  order by r.rk, p.full_name;
end $$;

create or replace function public.honor_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'term', (select term_label from private.honor_terms where university_id = my_university()),
    'updated_at', (select max(imported_at) from private.official_grades where university_id = my_university()),
    'hidden', (select hide_honor from profiles where id = auth.uid()),
    'has_record', exists (select 1 from private.official_grades g join profile_private pp on pp.student_number = g.student_number
                          where pp.user_id = auth.uid() and g.university_id = my_university()));
$$;

create or replace function public.set_hide_honor(p_hide boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update profiles set hide_honor = p_hide where id = auth.uid();
end $$;

-- admin: paste the registrar's file. rows: [{student_number, term_gpa?, cumulative_gpa?, credit_hours?}]
create or replace function public.admin_import_grades(p_university uuid, p_term text, p_rows jsonb, p_make_current boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; bad int := 0; matched int;
begin
  perform admin_require();
  if p_university is null or char_length(coalesce(trim(p_term), '')) < 2 then raise exception 'bad args'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 30000 then raise exception 'too_many_rows'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      insert into private.official_grades(university_id, student_number, term_label, term_gpa, cumulative_gpa, credit_hours)
      values (p_university, trim(r->>'student_number'), trim(p_term), nullif(r->>'term_gpa', '')::numeric, nullif(r->>'cumulative_gpa', '')::numeric, nullif(r->>'credit_hours', '')::smallint)
      on conflict (university_id, student_number, term_label) do update
        set term_gpa = excluded.term_gpa, cumulative_gpa = excluded.cumulative_gpa, credit_hours = excluded.credit_hours, imported_at = now();
      n := n + 1;
    exception when others then bad := bad + 1;
    end;
  end loop;
  if p_make_current then
    insert into private.honor_terms(university_id, term_label) values (p_university, trim(p_term))
    on conflict (university_id) do update set term_label = excluded.term_label, updated_at = now();
  end if;
  select count(*) into matched from private.official_grades g join profile_private pp on pp.student_number = g.student_number
    join profiles p on p.id = pp.user_id and p.university_id = g.university_id
    where g.university_id = p_university and g.term_label = trim(p_term);
  perform admin_log('import_grades', 'university', p_university::text, jsonb_build_object('term', p_term, 'saved', n, 'bad', bad, 'matched', matched));
  return jsonb_build_object('saved', n, 'bad', bad, 'matched', matched);
end $$;

-- daily: remember today's ranks so tomorrow can show ↑ / ↓
create or replace function private.honor_snapshot()
returns void language plpgsql security definer set search_path = public as $$
declare u record; per text; sc text;
begin
  delete from private.honor_snapshots where day < current_date - 30;
  for u in select university_id from private.honor_terms loop
    foreach per in array array['term', 'cumulative'] loop
      insert into private.honor_snapshots(day, scope_key, user_id, rank)
      select current_date, 'university:' || per || ':' || u.university_id, h.user_id, rank() over (order by h.gpa desc)
      from private.honor_rows(u.university_id, per) h on conflict do nothing;
      insert into private.honor_snapshots(day, scope_key, user_id, rank)
      select current_date, 'college:' || per || ':' || h.college_id, h.user_id, rank() over (partition by h.college_id order by h.gpa desc)
      from private.honor_rows(u.university_id, per) h where h.college_id is not null on conflict do nothing;
      insert into private.honor_snapshots(day, scope_key, user_id, rank)
      select current_date, 'major:' || per || ':' || h.major_id, h.user_id, rank() over (partition by h.major_id order by h.gpa desc)
      from private.honor_rows(u.university_id, per) h where h.major_id is not null on conflict do nothing;
    end loop;
  end loop;
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'honor_snapshot';
    perform cron.schedule('honor_snapshot', '15 0 * * *', 'select private.honor_snapshot()');
  end if;
end $$;

revoke all on function private.honor_rows(uuid, text), private.honor_snapshot() from public, anon, authenticated;
revoke all on function public.honor_board(text, text), public.honor_status(), public.set_hide_honor(boolean), public.admin_import_grades(uuid, text, jsonb, boolean) from public, anon;
grant execute on function public.honor_board(text, text), public.honor_status(), public.set_hide_honor(boolean), public.admin_import_grades(uuid, text, jsonb, boolean) to authenticated;
