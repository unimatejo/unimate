-- UniMate · 0111 campus maps: one OpenStreetMap file per university (Storage campus/<id>.json, built by the
-- campus-osm function), refreshed by itself: every 3 hours the campus with the oldest file is rebuilt.
create table if not exists public.campus_maps (
  university_id uuid primary key references universities(id) on delete cascade,
  version       int not null default 0,
  bbox          float8[],
  stats         jsonb,
  error         text,
  fetched_at    timestamptz
);
alter table public.campus_maps enable row level security;
drop policy if exists campus_maps_read on public.campus_maps;
create policy campus_maps_read on public.campus_maps for select to anon, authenticated using (true);
revoke insert, update, delete on public.campus_maps from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campus', 'campus', true, 15728640, array['application/json'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- the function reports back here (service role only)
create or replace function public.campus_map_saved(p_university uuid, p_bbox float8[], p_stats jsonb, p_error text)
returns void language sql security definer set search_path = public as $$
  insert into campus_maps(university_id, version, bbox, stats, error, fetched_at)
  values (p_university, case when p_error is null then 1 else 0 end, p_bbox, p_stats, p_error, now())
  on conflict (university_id) do update set
    version = campus_maps.version + case when p_error is null then 1 else 0 end,
    bbox = coalesce(excluded.bbox, campus_maps.bbox), stats = coalesce(excluded.stats, campus_maps.stats),
    error = excluded.error, fetched_at = now();
$$;
create or replace function public.campus_map_next() returns uuid
language sql stable security definer set search_path = public as $$
  select u.id from universities u left join campus_maps m on m.university_id = u.id
  where u.center_lat is not null order by m.fetched_at nulls first limit 1;
$$;
revoke all on function public.campus_map_saved(uuid, float8[], jsonb, text), public.campus_map_next() from public, anon, authenticated;
grant execute on function public.campus_map_saved(uuid, float8[], jsonb, text), public.campus_map_next() to service_role;

create or replace function private.campus_osm_fire(p_university uuid default null) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare s text;
begin
  select v into s from private.push_cfg where k = 'secret';
  if s is null then return null; end if;
  return net.http_post(
    url := 'https://slkfyblvpewlxrifzrhg.supabase.co/functions/v1/campus-osm',
    body := case when p_university is null then '{}'::jsonb else jsonb_build_object('university_id', p_university) end,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', s),
    timeout_milliseconds := 150000);
end $$;
revoke all on function private.campus_osm_fire(uuid) from public, anon, authenticated;
do $$ begin perform cron.unschedule('campus-osm'); exception when others then null; end $$;
select cron.schedule('campus-osm', '41 */3 * * *', 'select private.campus_osm_fire()');
