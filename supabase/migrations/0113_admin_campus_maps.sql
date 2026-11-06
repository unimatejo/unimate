-- Admin: every university's campus map at a glance (what the 3D file holds, our buildings and places), and a
-- button to rebuild one map now. Admins already read every university's buildings and places (RLS), so the map
-- screen can open any campus for them with ?uni=<id>.

create or replace function public.admin_campus_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id, 'name_ar', u.name_ar, 'name_en', u.name_en, 'has_center', u.center_lat is not null,
      'buildings', (select count(*) from buildings b where b.university_id = u.id and b.lat is not null),
      'places', (select count(*) from places p where p.university_id = u.id and p.state = 'approved'),
      'pending', (select count(*) from places p where p.university_id = u.id and p.state = 'pending'),
      'stats', m.stats, 'error', m.error, 'fetched_at', m.fetched_at, 'version', coalesce(m.version, 0)
    ) order by u.name_ar)
    from universities u left join campus_maps m on m.university_id = u.id
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_campus_rebuild(p_university uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  if not exists (select 1 from universities where id = p_university and center_lat is not null) then
    raise exception 'no campus point' using errcode = '22023';
  end if;
  perform private.campus_osm_fire(p_university);
  perform admin_log('campus_map_rebuild', 'university', p_university::text, '{}'::jsonb);
end $$;

revoke all on function public.admin_campus_overview(), public.admin_campus_rebuild(uuid) from public, anon;
grant execute on function public.admin_campus_overview(), public.admin_campus_rebuild(uuid) to authenticated;
