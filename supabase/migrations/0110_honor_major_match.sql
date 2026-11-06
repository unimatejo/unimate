-- UniMate · 0110 the university's file names a major in words («هندسة مدنية»): match it to our majors list so it
-- groups with students whose profile says the same major; an unknown name still groups by itself.
create or replace function private.major_key(p_uni uuid, p_file text, p_profile uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.id::text from majors m where m.university_id = p_uni and nullif(trim(p_file), '') is not null
       and (m.name_ar = trim(p_file) or lower(m.name_en) = lower(trim(p_file))) order by m.verified desc limit 1),
    nullif(trim(p_file), ''), p_profile::text);
$$;

create or replace function private.honor_rows(p_uni uuid, p_period text, p_term text default null)
returns table(user_id uuid, gpa numeric, major_key text, college_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id, case when p_period = 'term' then g.term_gpa else g.cumulative_gpa end,
         private.major_key(p_uni, g.major, p.major_id), p.college_id
  from private.official_grades g
  join profile_private pp on pp.student_number = g.student_number
  join profiles p on p.id = pp.user_id and p.university_id = g.university_id
  where g.university_id = p_uni
    and g.term_label = coalesce(p_term, (select term_label from private.honor_terms where university_id = p_uni))
    and p.status::text = 'active' and p.account_type = 'student' and not p.hide_honor
    and (case when p_period = 'term' then g.term_gpa else g.cumulative_gpa end) is not null;
$$;
revoke all on function private.major_key(uuid, text, uuid) from public, anon, authenticated;

-- the board looks up my own major the same way
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
  select private.major_key(me.university_id, g.major, me.major_id) into my_major
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

