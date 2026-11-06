-- The owner edits how the app looks and what it says from the admin panel: home texts and banner, the
-- quick links on home, a notice strip for everyone, the sign-in tagline, and which features are switched on.
-- Everyone (even before signing in) reads it; only the owner writes it, and every change is logged.
-- Plus daily numbers for the admin dashboard charts.

create or replace function public.app_content()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select value::jsonb from app_config where key = 'app_content'), '{}'::jsonb);
$$;

create or replace function public.admin_set_app_content(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare before jsonb := app_content();
begin
  perform owner_require();
  if jsonb_typeof(p) <> 'object' then raise exception 'bad content'; end if;
  if length(p::text) > 30000 then raise exception 'too_big'; end if;
  insert into app_config(key, value, updated_at) values ('app_content', p::text, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform admin_log('app_content', 'config', 'app_content', jsonb_build_object('before', before, 'after', p));
  return p;
end $$;

-- one row per day (Amman time): new accounts, posts, messages, people who posted or wrote
create or replace function public.admin_series(p_days int default 14)
returns table(day date, signups int, posts int, messages int, active int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query
  with d as (select g::date dd from generate_series((now() at time zone 'Asia/Amman')::date - (least(greatest(p_days, 1), 90) - 1), (now() at time zone 'Asia/Amman')::date, interval '1 day') g)
  select d.dd,
    (select count(*)::int from profiles x where (x.created_at at time zone 'Asia/Amman')::date = d.dd),
    (select count(*)::int from posts x where (x.created_at at time zone 'Asia/Amman')::date = d.dd),
    (select count(*)::int from messages x where (x.created_at at time zone 'Asia/Amman')::date = d.dd),
    (select count(distinct a.u)::int from (
       select x.author_id u from posts x where (x.created_at at time zone 'Asia/Amman')::date = d.dd
       union select x.sender_id from messages x where (x.created_at at time zone 'Asia/Amman')::date = d.dd) a)
  from d order by d.dd;
end $$;

grant execute on function public.app_content() to anon, authenticated;
revoke all on function public.admin_set_app_content(jsonb), public.admin_series(int) from public, anon;
grant execute on function public.admin_set_app_content(jsonb), public.admin_series(int) to authenticated;
