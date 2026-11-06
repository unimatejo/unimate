-- 0089 · Honor board and points board privacy (FOR REVIEW — not applied yet)
-- Nobody appears unless they choose to; a nickname is possible; only the top of each board is shown;
-- a grade point average is shown only if its owner allows it. Plus a "my cohort" scope for the points board.

alter table profiles alter column hide_honor set default true;
alter table profiles alter column hide_rank set default true;
alter table profiles add column if not exists honor_alias text check (honor_alias is null or char_length(honor_alias) between 2 and 24);
alter table profiles add column if not exists honor_show_gpa boolean not null default false;

-- everyone starts hidden (no official grades are loaded yet, so nobody loses a place they chose)
select set_config('unimate.system', 'on', true);
update profiles set hide_honor = true, hide_rank = true;

-- join the boards (or leave them), with an optional nickname and whether the GPA shows
create or replace function public.set_honor_options(p_show boolean, p_alias text default null, p_show_gpa boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare a text := nullif(trim(coalesce(p_alias, '')), '');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if a is not null and (char_length(a) < 2 or char_length(a) > 24) then raise exception 'bad_alias' using errcode = 'P0001'; end if;
  if a is not null and private.mod_hits(a) is not null then raise exception 'bad_alias' using errcode = 'P0001'; end if;
  update profiles set hide_honor = not p_show, honor_alias = a, honor_show_gpa = coalesce(p_show_gpa, false) where id = auth.uid();
end $$;
revoke all on function public.set_honor_options(boolean, text, boolean) from public, anon;
grant execute on function public.set_honor_options(boolean, text, boolean) to authenticated;

-- top 10 only; nickname instead of name/photo when set; GPA only with permission (you always see your own)
create or replace function public.honor_board(p_scope text default 'college', p_period text default 'term')
returns table(rank integer, user_id uuid, full_name text, username text, avatar_url text, major text, gpa numeric, move integer, is_me boolean, total integer)
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
  select r.rk,
         case when p.honor_alias is null or p.id = auth.uid() then p.id end,
         coalesce(p.honor_alias, p.full_name),
         case when p.honor_alias is null then p.username end,
         case when p.honor_alias is null then p.avatar_url end,
         case when p.honor_alias is null then m.name_ar end,
         case when p.honor_show_gpa or p.id = auth.uid() then r.gpa end,
         (select s.rank - r.rk from private.honor_snapshots s where s.scope_key = key and s.user_id = r.user_id
            and s.day = (select max(day) from private.honor_snapshots where scope_key = key and day < current_date))::int,
         p.id = auth.uid(), r.tot
  from r join profiles p on p.id = r.user_id left join majors m on m.id = p.major_id
  where (r.rk <= 10 or p.id = auth.uid()) and not is_blocked_between(auth.uid(), p.id)
  order by r.rk, p.full_name;
end $$;

-- points board: top 20 of my college, my cohort (same college and entry year) or the university; joined by choice
create or replace function public.leaderboard(p_scope text default 'college', p_period text default 'month')
returns table(rank integer, user_id uuid, full_name text, username text, avatar_url text, points integer, is_me boolean)
language sql stable security definer set search_path = public as $$
  with me as (select university_id, college_id, entry_year from profiles where id = auth.uid()),
  pts as (
    select e.user_id, sum(e.points)::int pts from point_events e
    where p_period = 'all' or e.created_at >= date_trunc('month', now() at time zone 'Asia/Amman') at time zone 'Asia/Amman'
    group by 1 having sum(e.points) > 0)
  select (row_number() over (order by pts.pts desc, p.full_name))::int, p.id, p.full_name, p.username, p.avatar_url, pts.pts, p.id = auth.uid()
  from pts join profiles p on p.id = pts.user_id, me
  where auth.uid() is not null and p.status::text = 'active'
    and p.university_id = me.university_id
    and (p_scope = 'university'
      or (p_scope = 'college' and p.college_id is not distinct from me.college_id)
      or (p_scope = 'cohort' and p.college_id is not distinct from me.college_id and p.entry_year is not distinct from me.entry_year and me.entry_year is not null))
    and (not p.hide_rank or p.id = auth.uid())
    and not is_blocked_between(auth.uid(), p.id)
  order by pts.pts desc, p.full_name
  limit 20;
$$;
