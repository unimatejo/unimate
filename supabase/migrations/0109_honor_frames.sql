-- UniMate · 0109 honor frames, and an honor board that never shows anyone else's GPA.
-- Frames come ONLY from the university's official grades (private.official_grades), per term and per scope
-- (major / college / university): 1st gold, 2nd silver, 3rd bronze, 4th–10th a small blue frame, nobody else.
-- A frame shows only for a student who turned the honor board on (hide_honor = false) and doesn't use a nickname
-- there (a frame next to their real name would give the nickname away). The owner/team can grant or take one by
-- hand for special cases (scope 'special'). Frames are worked out again every night and right after an import.
-- The board: the term can be picked, the major is the one in the official file when given, and GPAs are never
-- returned for anybody but the student asking.

-- ---------- official major (optional column in the university's file) ----------
alter table private.official_grades add column if not exists major text;

-- ---------- frames ----------
create table if not exists public.honor_frames (
  user_id       uuid not null references profiles(id) on delete cascade,
  university_id uuid not null references universities(id) on delete cascade,
  term_label    text not null,
  scope         text not null check (scope in ('major', 'college', 'university', 'special')),
  rank          int,
  level         text not null check (level in ('gold', 'silver', 'bronze', 'blue')),
  source        text not null default 'grades' check (source in ('grades', 'manual')),
  note          text check (char_length(note) <= 120),
  granted_by    uuid references profiles(id) on delete set null,
  computed_at   timestamptz not null default now(),
  primary key (user_id, term_label, scope)
);
alter table public.honor_frames enable row level security;
revoke all on public.honor_frames from anon, authenticated;

create or replace function private.frame_level(p_rank int) returns text
language sql immutable set search_path = '' as $$
  select case when p_rank = 1 then 'gold' when p_rank = 2 then 'silver' when p_rank = 3 then 'bronze'
              when p_rank between 4 and 10 then 'blue' end;
$$;

-- the rows the board and the frames rank: opted-in students of the term (default: the university's current one)
drop function if exists public.honor_board(text, text);
drop function if exists private.honor_rows(uuid, text);
create or replace function private.honor_rows(p_uni uuid, p_period text, p_term text default null)
returns table(user_id uuid, gpa numeric, major_key text, college_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, case when p_period = 'term' then g.term_gpa else g.cumulative_gpa end,
         coalesce(nullif(trim(g.major), ''), p.major_id::text), p.college_id
  from private.official_grades g
  join profile_private pp on pp.student_number = g.student_number
  join profiles p on p.id = pp.user_id and p.university_id = g.university_id
  where g.university_id = p_uni
    and g.term_label = coalesce(p_term, (select term_label from private.honor_terms where university_id = p_uni))
    and p.status::text = 'active' and p.account_type = 'student' and not p.hide_honor
    and (case when p_period = 'term' then g.term_gpa else g.cumulative_gpa end) is not null;
$$;

-- frames of one university for one term, from that term's GPA (manual frames are left alone)
create or replace function private.compute_honor_frames(p_uni uuid, p_term text default null)
returns int language plpgsql security definer set search_path = public as $$
declare term text := coalesce(p_term, (select term_label from private.honor_terms where university_id = p_uni)); n int;
begin
  if term is null then return 0; end if;
  delete from honor_frames where university_id = p_uni and term_label = term and source = 'grades';
  insert into honor_frames(user_id, university_id, term_label, scope, rank, level)
  select user_id, p_uni, term, scope, rk, private.frame_level(rk) from (
    select h.user_id, 'university' scope, (rank() over (order by h.gpa desc))::int rk from private.honor_rows(p_uni, 'term', term) h
    union all
    select h.user_id, 'college', (rank() over (partition by h.college_id order by h.gpa desc))::int from private.honor_rows(p_uni, 'term', term) h where h.college_id is not null
    union all
    select h.user_id, 'major', (rank() over (partition by h.major_key order by h.gpa desc))::int from private.honor_rows(p_uni, 'term', term) h where h.major_key is not null
  ) x where rk <= 10;
  get diagnostics n = row_count;
  return n;
end $$;

-- the nightly job: snapshots for the "moved up / down" arrows, then the frames
create or replace function private.honor_snapshot() returns void
language plpgsql security definer set search_path = public as $$
declare u record; per text;
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
      select current_date, 'major:' || per || ':' || h.major_key, h.user_id, rank() over (partition by h.major_key order by h.gpa desc)
      from private.honor_rows(u.university_id, per) h where h.major_key is not null on conflict do nothing;
    end loop;
    perform private.compute_honor_frames(u.university_id);
    update private.honor_terms set updated_at = now() where university_id = u.university_id;
  end loop;
end $$;

-- ---------- the board ----------
create or replace function public.honor_board(p_scope text default 'college', p_period text default 'term', p_term text default null)
returns table(rank integer, user_id uuid, full_name text, username text, avatar_url text, major text, gpa numeric, move integer,
              is_me boolean, total integer, frame text)
language plpgsql stable security definer set search_path = public as $$
declare me profiles; key text; my_major text; term text;
begin
  if p_scope not in ('major', 'college', 'university') or p_period not in ('term', 'cumulative') then raise exception 'bad args'; end if;
  select * into me from profiles where id = auth.uid();
  if me.id is null or me.university_id is null then return; end if;
  term := coalesce(p_term, (select term_label from private.honor_terms where university_id = me.university_id));
  -- my major as the university's file has it (else the one on my profile)
  select coalesce(nullif(trim(g.major), ''), me.major_id::text) into my_major
  from private.official_grades g join profile_private pp on pp.student_number = g.student_number
  where pp.user_id = me.id and g.university_id = me.university_id and g.term_label = term;
  my_major := coalesce(my_major, me.major_id::text);
  key := p_scope || ':' || p_period || ':' || coalesce(case p_scope when 'major' then my_major when 'college' then me.college_id::text else me.university_id::text end, '-');
  return query
  with r as (
    select h.user_id, h.gpa, (rank() over (order by h.gpa desc))::int rk, count(*) over ()::int tot
    from private.honor_rows(me.university_id, p_period, term) h
    where p_scope = 'university' or (p_scope = 'college' and h.college_id is not distinct from me.college_id and me.college_id is not null)
       or (p_scope = 'major' and h.major_key is not distinct from my_major and my_major is not null))
  select r.rk,
         case when p.honor_alias is null or p.id = auth.uid() then p.id end,
         coalesce(p.honor_alias, p.full_name),
         case when p.honor_alias is null then p.username end,
         case when p.honor_alias is null then p.avatar_url end,
         case when p.honor_alias is null then m.name_ar end,
         -- nobody else's GPA, ever: only mine
         case when p.id = auth.uid() then r.gpa end,
         case when term = (select term_label from private.honor_terms where university_id = me.university_id) then
           (select s.rank - r.rk from private.honor_snapshots s where s.scope_key = key and s.user_id = r.user_id
              and s.day = (select max(day) from private.honor_snapshots where scope_key = key and day < current_date))::int end,
         p.id = auth.uid(), r.tot,
         case when p.honor_alias is null then private.frame_level(r.rk) end
  from r join profiles p on p.id = r.user_id left join majors m on m.id = p.major_id
  where (r.rk <= 10 or p.id = auth.uid()) and not is_blocked_between(auth.uid(), p.id)
  order by r.rk, p.full_name;
end $$;

-- the terms that have official grades, newest first, and when the board was last worked out
create or replace function public.honor_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'term', (select term_label from private.honor_terms where university_id = my_university()),
    'terms', coalesce((select jsonb_agg(term_label order by last desc) from (
        select term_label, max(imported_at) last from private.official_grades where university_id = my_university() group by 1) t), '[]'::jsonb),
    'updated_at', (select greatest(t.updated_at, (select max(imported_at) from private.official_grades where university_id = my_university()))
                   from private.honor_terms t where t.university_id = my_university()),
    'hidden', (select hide_honor from profiles where id = auth.uid()),
    'has_record', exists (select 1 from private.official_grades g join profile_private pp on pp.student_number = g.student_number
                          where pp.user_id = auth.uid() and g.university_id = my_university()));
$$;

-- ---------- frames the app draws ----------
-- one frame per person (their best one this term), for my university; nothing when the owner switched frames off
create or replace function public.honor_frames_visible()
returns table(user_id uuid, level text, label text)
language sql stable security definer set search_path = public as $$
  with cfg as (select coalesce((select value::jsonb #>> '{features,frames}' from app_config where key = 'app_content'), 'true') <> 'false' on_),
  term as (select term_label from private.honor_terms where university_id = my_university()),
  best as (
    select distinct on (f.user_id) f.user_id, f.level, f.scope, f.rank, f.note, f.term_label
    from honor_frames f, term
    where f.university_id = my_university() and (f.term_label = term.term_label or f.source = 'manual')
    order by f.user_id, array_position(array['gold', 'silver', 'bronze', 'blue'], f.level), f.computed_at desc)
  select b.user_id, b.level,
         case when b.scope = 'special' then coalesce(b.note, 'إطار تكريمي')
              else case b.rank when 1 then 'المركز الأول' when 2 then 'المركز الثاني' when 3 then 'المركز الثالث' else 'ضمن العشرة الأوائل' end
                || case b.scope when 'major' then ' بالتخصص' when 'college' then ' بالكلية' else ' بالجامعة' end || ' · ' || b.term_label end
  from best b join profiles p on p.id = b.user_id, cfg
  where cfg.on_ and auth.uid() is not null and not p.hide_honor and p.honor_alias is null and p.status::text = 'active'
    and not is_blocked_between(auth.uid(), p.id);
$$;

-- ---------- the owner/team: special frames by hand ----------
create or replace function public.admin_set_frame(p_user uuid, p_level text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uni uuid;
begin
  perform owner_require();
  if p_level is not null and p_level not in ('gold', 'silver', 'bronze', 'blue') then raise exception 'bad level'; end if;
  select university_id into uni from profiles where id = p_user;
  if uni is null then raise exception 'not found'; end if;
  delete from honor_frames where user_id = p_user and scope = 'special';
  if p_level is not null then
    insert into honor_frames(user_id, university_id, term_label, scope, level, source, note, granted_by)
    values (p_user, uni, 'special', 'special', p_level, 'manual', nullif(trim(p_note), ''), auth.uid());
  end if;
  perform admin_log(case when p_level is null then 'frame_off' else 'frame_on' end, 'user', p_user::text, jsonb_build_object('level', p_level, 'note', p_note));
end $$;

-- ---------- import: an optional official major, and frames right away ----------
create or replace function public.admin_import_grades(p_university uuid, p_term text, p_rows jsonb, p_make_current boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0; bad int := 0; matched int; frames int := 0;
begin
  perform owner_require(); perform private.team_require();
  if p_university is null or char_length(coalesce(trim(p_term), '')) < 2 then raise exception 'bad args'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 30000 then raise exception 'too_many_rows'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      if coalesce(trim(r->>'student_number'), '') !~ '^[0-9A-Za-z]{4,20}$' then raise exception 'bad number'; end if;
      if nullif(r->>'term_gpa', '')::numeric not between 0 and 4.5 or nullif(r->>'cumulative_gpa', '')::numeric not between 0 and 4.5 then raise exception 'bad gpa'; end if;
      insert into private.official_grades(university_id, student_number, term_label, term_gpa, cumulative_gpa, credit_hours, major)
      values (p_university, trim(r->>'student_number'), trim(p_term), nullif(r->>'term_gpa', '')::numeric, nullif(r->>'cumulative_gpa', '')::numeric,
              nullif(r->>'credit_hours', '')::smallint, nullif(left(trim(coalesce(r->>'major', '')), 120), ''))
      on conflict (university_id, student_number, term_label) do update
        set term_gpa = excluded.term_gpa, cumulative_gpa = excluded.cumulative_gpa, credit_hours = excluded.credit_hours,
            major = coalesce(excluded.major, private.official_grades.major), imported_at = now();
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
  frames := private.compute_honor_frames(p_university, trim(p_term));
  perform admin_log('import_grades', 'university', p_university::text, jsonb_build_object('term', p_term, 'saved', n, 'bad', bad, 'matched', matched, 'frames', frames));
  return jsonb_build_object('saved', n, 'bad', bad, 'matched', matched, 'frames', frames);
end $$;

-- a student who leaves the board, or picks a nickname, loses the frame at once (no waiting for the night)
create or replace function private.honor_privacy_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.hide_honor and not old.hide_honor then delete from honor_frames where user_id = new.id and source = 'grades'; end if;
  return new;
end $$;
drop trigger if exists profiles_honor_privacy on profiles;
create trigger profiles_honor_privacy after update of hide_honor on profiles for each row execute function private.honor_privacy_changed();

revoke all on function private.frame_level(int), private.honor_rows(uuid, text, text), private.compute_honor_frames(uuid, text),
  private.honor_privacy_changed() from public, anon, authenticated;
revoke all on function public.honor_board(text, text, text), public.honor_frames_visible(), public.admin_set_frame(uuid, text, text) from public, anon;
grant execute on function public.honor_board(text, text, text), public.honor_frames_visible(), public.admin_set_frame(uuid, text, text) to authenticated;
