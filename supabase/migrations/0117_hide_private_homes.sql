-- Private homes off the maps. Places already hide as `rejected`; buildings get the same: a state, approved by default.
--
-- 1) buildings.state (moderation_state, default approved). A student reads only approved buildings (RLS); admins
--    see all. Everything that lists buildings for students (campus_pins, campus_search, admin counts) skips the rest.
--    The 3D file (campus-osm) only links approved buildings, so a hidden one keeps its OSM shape with no name.
-- 2) Hidden now, never deleted (one update brings any back):
--    - «منزل رئيس جامعة اليرموك» (Yarmouk building): someone's home.
--    - «عمارة مهدي الطوافشه» (Yarmouk place, tagged library in OSM): a private residential building.
--    - «سكن المنزل» (Mutah building): OSM says apartments, 4 flats, outside both Mutah campuses: private housing.
--    - «عمارة رقم 18 ب» (WISE building): an 18-storey residential tower in Prince Faisal housing, not WISE's.

alter table public.buildings add column if not exists state moderation_state not null default 'approved';

drop policy if exists "buildings read" on public.buildings;
create policy "buildings read" on public.buildings for select
  using ((university_id = my_university() and state = 'approved') or is_admin());

create or replace function public.campus_pins(p_university uuid)
returns table (id uuid, kind text, name_ar text, name_en text, sub text, lat float8, lng float8, advertiser_id uuid)
language sql stable security definer set search_path = public as $$
  select b.id, 'building', b.name_ar, b.name_en, b.code, b.lat, b.lng, null::uuid
    from buildings b where auth.uid() is not null and b.university_id = p_university and b.lat is not null and b.state = 'approved'
  union all
  select p.id, p.kind::text, p.name_ar, p.name_en, p.description, p.lat, p.lng, p.advertiser_id
    from places p where auth.uid() is not null and p.university_id = p_university and p.state = 'approved';
$$;

create or replace function public.campus_search(q text, lim integer default 20)
returns table (kind text, id uuid, title text, subtitle text, lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  with u as (select my_university() as uni)
  select * from (
    select 'building', b.id, b.name_ar, coalesce(b.code, ''), b.lat, b.lng
      from buildings b, u where b.university_id = u.uni and b.state = 'approved' and (b.name_ar ilike '%' || q || '%' or b.code ilike q || '%')
    union all
    select 'room', r.id, b.name_ar || ' · ' || r.code, coalesce(r.name, ''), b.lat, b.lng
      from rooms r join buildings b on b.id = r.building_id, u where b.university_id = u.uni and b.state = 'approved' and (r.code ilike q || '%' or r.name ilike '%' || q || '%')
    union all
    select 'place', p.id, p.name_ar, p.kind::text, p.lat, p.lng
      from places p, u where p.university_id = u.uni and p.state = 'approved' and p.name_ar ilike '%' || q || '%'
    union all
    select 'alias', coalesce(a.building_id, a.room_id, a.place_id), a.alias,
           coalesce(b.name_ar, pl.name_ar, ''), coalesce(b.lat, pl.lat), coalesce(b.lng, pl.lng)
      from place_aliases a
      left join buildings b on b.id = a.building_id
      left join places pl on pl.id = a.place_id, u
      where a.university_id = u.uni and a.state = 'approved' and a.alias ilike '%' || q || '%'
        and coalesce(b.state, 'approved') = 'approved' and coalesce(pl.state, 'approved') = 'approved'
    union all
    select 'course', c.id, c.name_ar, c.code, null, null
      from courses c, u where c.university_id = u.uni and (c.name_ar ilike '%' || q || '%' or c.code ilike q || '%')
    union all
    select 'link', l.id, l.title, l.url, null, null
      from university_links l, u where l.university_id = u.uni and l.title ilike '%' || q || '%'
  ) s limit least(greatest(coalesce(lim, 20), 1), 50);
$$;

create or replace function public.admin_campus_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id, 'name_ar', u.name_ar, 'name_en', u.name_en, 'has_center', u.center_lat is not null,
      'buildings', (select count(*) from buildings b where b.university_id = u.id and b.lat is not null and b.state = 'approved'),
      'places', (select count(*) from places p where p.university_id = u.id and p.state = 'approved'),
      'pending', (select count(*) from places p where p.university_id = u.id and p.state = 'pending'),
      'stats', m.stats, 'error', m.error, 'fetched_at', m.fetched_at, 'version', coalesce(m.version, 0)
    ) order by u.name_ar)
    from universities u left join campus_maps m on m.university_id = u.id
  ), '[]'::jsonb);
end $$;

update buildings set state = 'rejected' where state = 'approved' and id in (
  '357c1df7-234a-4ce2-a637-6b9dd8eec9c0',  -- منزل رئيس جامعة اليرموك
  'd79749d3-560e-4244-8412-0e9697bdb40f',  -- سكن المنزل (مؤتة)
  '176f0920-d67f-43ab-b56b-6606d712373a'); -- عمارة رقم 18 ب (العلوم الإسلامية)
update places set state = 'rejected' where state = 'approved' and id = 'ca55747a-61c9-4023-a7c3-41c358170c29'; -- عمارة مهدي الطوافشه
