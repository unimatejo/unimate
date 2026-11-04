-- every university with a campus point gets at least its main campus on the map
insert into buildings (university_id, name_ar, name_en, lat, lng, osm_id)
select u.id, 'الحرم الرئيسي - ' || u.name_ar, 'Main campus - ' || u.name_en, u.center_lat, u.center_lng, 'main:' || u.slug
from universities u
where u.center_lat is not null and not exists (select 1 from buildings b where b.university_id = u.id);
drop policy if exists osm_stage_ins on public.osm_stage; revoke insert on public.osm_stage from anon, authenticated;
