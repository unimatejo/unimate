-- Points, badges and a monthly leaderboard. Everything is awarded by the database itself (triggers),
-- never by the app, so nobody can give themselves points. Each award is unique per action, and taken back
-- when the action is undone (post deleted, like removed, seat cancelled).

-- fixes an old bug: guard_profile_update silently reset points, so nobody ever got any
alter table public.point_events add column if not exists ref_key text;
create unique index if not exists point_events_once on public.point_events(user_id, kind, ref_key) where ref_key is not null;
alter table public.profiles add column if not exists hide_rank boolean not null default false;

drop trigger if exists posts_points on public.posts;
drop trigger if exists point_events_apply on public.point_events;
do $$ declare t record; begin
  for t in select tgname from pg_trigger where tgrelid = 'public.point_events'::regclass and not tgisinternal loop
    execute format('drop trigger %I on public.point_events', t.tgname);
  end loop;
end $$;

create or replace function private.award(p_user uuid, p_kind text, p_points int, p_ref text)
returns void language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_user is null then return; end if;
  insert into point_events(user_id, kind, points, ref_key) values (p_user, p_kind, p_points, p_ref) on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then
    perform set_config('unimate.system', 'on', true);
    update profiles set points = greatest(0, points + p_points) where id = p_user;
    perform set_config('unimate.system', 'off', true);
  end if;
end $$;

create or replace function private.unaward(p_user uuid, p_kind text, p_ref text)
returns void language plpgsql security definer set search_path = public as $$
declare pts int;
begin
  delete from point_events where user_id = p_user and kind = p_kind and ref_key = p_ref returning points into pts;
  if pts is not null then
    perform set_config('unimate.system', 'on', true);
    update profiles set points = greatest(0, points - pts) where id = p_user;
    perform set_config('unimate.system', 'off', true);
  end if;
end $$;

-- posts: a summary +10, reporting a found item +5 (gone again if the post is deleted or hidden)
create or replace function private.points_posts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    if new.category = 'summaries' then perform private.award(new.author_id, 'summary', 10, new.id::text);
    elsif new.category = 'lost_found' and new.lost_found = 'found' then perform private.award(new.author_id, 'found_item', 5, new.id::text); end if;
  elsif TG_OP = 'DELETE' or (TG_OP = 'UPDATE' and new.is_hidden and not old.is_hidden) then
    perform private.unaward(old.author_id, 'summary', old.id::text);
    perform private.unaward(old.author_id, 'found_item', old.id::text);
    if TG_OP = 'DELETE' then
      delete from point_events where kind = 'summary_like' and ref_key like old.id::text || ':%';
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists posts_points_v2 on public.posts;
create trigger posts_points_v2 after insert or delete or update of is_hidden on public.posts
  for each row execute function private.points_posts();

-- a like on someone's summary: +1 to the author (not for liking your own; at most 30 like-points a day)
create or replace function private.points_likes()
returns trigger language plpgsql security definer set search_path = public as $$
declare p posts; today int;
begin
  select * into p from posts where id = coalesce(new.post_id, old.post_id);
  if p.id is null or p.category <> 'summaries' then return coalesce(new, old); end if;
  if TG_OP = 'INSERT' then
    if new.user_id = p.author_id then return new; end if;
    select coalesce(sum(points), 0) into today from point_events where user_id = p.author_id and kind = 'summary_like' and created_at > now() - interval '1 day';
    if today < 30 then perform private.award(p.author_id, 'summary_like', 1, p.id::text || ':' || new.user_id::text); end if;
  else
    perform private.unaward(p.author_id, 'summary_like', p.id::text || ':' || old.user_id::text);
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists post_likes_points on public.post_likes;
create trigger post_likes_points after insert or delete on public.post_likes for each row execute function private.points_likes();

-- a seat given in a ride: +3 to the driver (taken back if the rider cancels)
create or replace function private.points_rides()
returns trigger language plpgsql security definer set search_path = public as $$
declare drv uuid;
begin
  select driver_id into drv from rides where id = new.ride_id;
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform private.award(drv, 'ride_seat', 3 * new.seats, new.id::text);
  elsif old.status = 'accepted' and new.status <> 'accepted' then
    perform private.unaward(drv, 'ride_seat', new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists ride_requests_points on public.ride_requests;
create trigger ride_requests_points after update of status on public.ride_requests for each row execute function private.points_rides();

-- backfill what already happened
do $$ declare r record; begin
  for r in select id, author_id, category, lost_found from posts where not is_hidden and category in ('summaries', 'lost_found') loop
    if r.category = 'summaries' then perform private.award(r.author_id, 'summary', 10, r.id::text);
    elsif r.lost_found = 'found' then perform private.award(r.author_id, 'found_item', 5, r.id::text); end if;
  end loop;
  for r in select l.post_id, l.user_id, p.author_id from post_likes l join posts p on p.id = l.post_id
           where p.category = 'summaries' and not p.is_hidden and l.user_id <> p.author_id loop
    perform private.award(r.author_id, 'summary_like', 1, r.post_id::text || ':' || r.user_id::text);
  end loop;
end $$;

-- ---------- leaderboard ----------
create or replace function public.leaderboard(p_scope text default 'college', p_period text default 'month')
returns table(rank int, user_id uuid, full_name text, username text, avatar_url text, points int, is_me boolean)
language sql stable security definer set search_path = public as $$
  with me as (select university_id, college_id from profiles where id = auth.uid()),
  pts as (
    select e.user_id, sum(e.points)::int pts from point_events e
    where p_period = 'all' or e.created_at >= date_trunc('month', now() at time zone 'Asia/Amman') at time zone 'Asia/Amman'
    group by 1 having sum(e.points) > 0)
  select (row_number() over (order by pts.pts desc, p.full_name))::int, p.id, p.full_name, p.username, p.avatar_url, pts.pts, p.id = auth.uid()
  from pts join profiles p on p.id = pts.user_id, me
  where auth.uid() is not null and p.status::text = 'active'
    and p.university_id = me.university_id
    and (p_scope = 'university' or p.college_id is not distinct from me.college_id)
    and (not p.hide_rank or p.id = auth.uid())
    and not is_blocked_between(auth.uid(), p.id)
  order by pts.pts desc, p.full_name
  limit 50;
$$;

-- ---------- badges (worked out live from what the person did; nothing to fake) ----------
create or replace function public.user_badges(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with u as (select id, created_at, points, college_id, university_id from profiles where id = p_user and can_see_user(p_user)),
  s as (select
      (select count(*) from posts where author_id = p_user and category = 'summaries' and not is_hidden) summaries,
      (select count(*) from point_events where user_id = p_user and kind = 'summary_like') summary_likes,
      (select count(*) from posts where author_id = p_user and category = 'lost_found' and lost_found = 'found' and not is_hidden) found,
      (select coalesce(sum(points) / 3, 0) from point_events where user_id = p_user and kind = 'ride_seat') seats,
      (select coalesce(sum(points), 0) from point_events where user_id = p_user
         and created_at >= date_trunc('month', now() at time zone 'Asia/Amman') at time zone 'Asia/Amman') month_pts),
  rank as (
    select count(*) + 1 r from (
      select e.user_id, sum(e.points) t from point_events e join profiles p on p.id = e.user_id
      where e.created_at >= date_trunc('month', now() at time zone 'Asia/Amman') at time zone 'Asia/Amman'
        and p.college_id is not distinct from (select college_id from u) and p.university_id = (select university_id from u) and not p.hide_rank
      group by 1) x
    where x.t > (select month_pts from s))
  select case when not exists (select 1 from u) then '[]'::jsonb else jsonb_build_array(
    jsonb_build_object('key', 'pioneer',      'earned', (select created_at < timestamptz '2027-01-01' from u), 'progress', null, 'goal', null),
    jsonb_build_object('key', 'summary_1',    'earned', (select summaries >= 1 from s),  'progress', (select summaries from s), 'goal', 1),
    jsonb_build_object('key', 'summary_10',   'earned', (select summaries >= 10 from s), 'progress', (select summaries from s), 'goal', 10),
    jsonb_build_object('key', 'liked_50',     'earned', (select summary_likes >= 50 from s), 'progress', (select summary_likes from s), 'goal', 50),
    jsonb_build_object('key', 'finder',       'earned', (select found >= 1 from s), 'progress', (select found from s), 'goal', 1),
    jsonb_build_object('key', 'driver_5',     'earned', (select seats >= 5 from s), 'progress', (select seats from s), 'goal', 5),
    jsonb_build_object('key', 'points_100',   'earned', (select points >= 100 from u), 'progress', (select points from u), 'goal', 100),
    jsonb_build_object('key', 'top3_month',   'earned', (select month_pts > 0 from s) and (select r <= 3 from rank), 'progress', (select r from rank), 'goal', 3)
  ) end;
$$;

create or replace function public.my_points_history()
returns table(kind text, points int, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select kind, points, created_at from point_events where user_id = auth.uid() order by created_at desc limit 50;
$$;

create or replace function public.set_hide_rank(p_hide boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update profiles set hide_rank = p_hide where id = auth.uid();
end $$;

revoke all on function public.leaderboard(text, text), public.user_badges(uuid), public.my_points_history(), public.set_hide_rank(boolean) from public, anon;
grant execute on function public.leaderboard(text, text), public.user_badges(uuid), public.my_points_history(), public.set_hide_rank(boolean) to authenticated;
revoke all on function private.award(uuid, text, int, text), private.unaward(uuid, text, text) from public, anon, authenticated;
