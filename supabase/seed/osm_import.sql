-- Import OpenStreetMap places from osm_stage into buildings/places (safe to re-run).
with s as (
  select distinct on (st.osm) st.*, u.id as university_id
  from osm_stage st join universities u on u.slug = st.uni
  -- keep to the campus and the streets right around it
  where sqrt(power((st.lat - u.center_lat) * 111000, 2) + power((st.lng - u.center_lng) * 94000, 2)) < case when u.slug in ('yu','ju') then 1000 else 1400 end
  order by st.osm, st.id desc
), m as (
  select s.*,
    case
      when k = 'building' then 'building'
      when k in ('cafe','fast_food','food_court','ice_cream') then 'cafeteria'
      when k = 'restaurant' then 'restaurant'
      when k = 'shop:kiosk' then 'kiosk'
      when k in ('shop:stationery','shop:copyshop') then 'print'
      when k like 'shop:%' then 'shop'
      when k in ('parking','motorcycle_parking') then 'parking'
      when k in ('bus_stop','bus_station','platform','taxi') or (k = 'shelter' and tags->>'shelter_type' = 'public_transport') then 'bus'
      when k = 'place_of_worship' then 'mosque'
      when k = 'library' then 'library'
      when k = 'bank' then 'bank'
      when k = 'atm' then 'atm'
      when k in ('clinic','doctors','hospital','dentist') then 'clinic'
      when k = 'pharmacy' then 'pharmacy'
      when k = 'gate' then 'gate'
      when k in ('pitch','sports_centre','stadium','swimming_pool') then 'sports'
      when k in ('park','garden') then 'garden'
      when k in ('internet_cafe','post_office','theatre','arts_centre','office','townhall','community_centre','police','fuel','conference_centre','events_venue','exhibition_centre','studio','car_wash','museum','attraction','information') then 'service'
      else null end as pk
  from s
)
, nb as (
  insert into buildings (university_id, name_ar, name_en, lat, lng, osm_id)
  select university_id, name_ar, name_en, lat, lng, osm from m
  where pk = 'building' and name_ar is not null
    and not exists (select 1 from buildings b where b.osm_id = m.osm)
    and not exists (select 1 from buildings b where b.university_id = m.university_id and b.name_ar = m.name_ar)
    and not exists (select 1 from buildings b where b.university_id = m.university_id and b.lat is not null
                    and abs(b.lat - m.lat) < 0.00025 and abs(b.lng - m.lng) < 0.0003)
  returning 1
), np as (
  insert into places (university_id, kind, name_ar, name_en, lat, lng, hours, osm_id, state)
  select university_id, pk::place_kind,
    coalesce(name_ar, case pk when 'parking' then 'موقف سيارات' when 'bus' then 'موقف باص' when 'atm' then 'صراف آلي'
      when 'gate' then 'بوابة' when 'sports' then 'ملعب' when 'kiosk' then 'كشك' when 'cafeteria' then 'كافتيريا'
      when 'mosque' then 'مسجد' when 'garden' then 'حديقة' when 'shop' then 'محل' when 'print' then 'مكتبة وطباعة'
      when 'bank' then 'بنك' when 'clinic' then 'عيادة' when 'pharmacy' then 'صيدلية' when 'library' then 'مكتبة'
      when 'restaurant' then 'مطعم' else 'خدمة' end),
    coalesce(name_en, case when name_ar is null then initcap(replace(pk, '_', ' ')) end),
    lat, lng, tags->>'opening_hours', osm, 'approved'
  from m
  where pk is not null and pk <> 'building'
    and not exists (select 1 from places p where p.osm_id = m.osm)
    and not exists (select 1 from places p where p.university_id = m.university_id and p.kind::text = m.pk
                    and abs(p.lat - m.lat) < 0.00012 and abs(p.lng - m.lng) < 0.00015)
  returning 1
)
select (select count(*) from nb) as buildings_added, (select count(*) from np) as places_added;
