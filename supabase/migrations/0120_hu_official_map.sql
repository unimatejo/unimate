-- Hashemite University: matched against the ElCoM campus map (a student committee's map; each college links to its
-- official HU page), 2026-11-07. Only what two sources agree on (the map's location code and an OSM name or one of our
-- buildings at that spot). Everything else is listed as needing confirmation in the report, not guessed.
do $$
declare hu uuid := '76fd8b09-ef03-49d7-8370-2712a88aaf32';
begin
  -- other names students use, so search finds them
  insert into place_aliases (university_id, place_id, building_id, alias, state)
  select hu, x.place_id, x.building_id, x.alias, 'approved' from (values
    ((select id from places where university_id = hu and name_ar = 'بوابة الجامعة الهاشمية الشمالية' and state = 'approved' limit 1), null::uuid, 'بوابة الزرقاء'),
    ((select id from places where university_id = hu and name_ar = 'بوابة الجامعة الهاشمية الجنوبية' and state = 'approved' limit 1), null::uuid, 'بوابة عمان'),
    ((select id from places where university_id = hu and name_ar = 'مكتبة الجامعة الهاشمية' and state = 'approved' limit 1), null::uuid, 'مكتبة عبد الحميد شومان'),
    (null::uuid, (select id from buildings where university_id = hu and name_ar = 'مبنى إدارة الجامعة' and state = 'approved' limit 1), 'رئاسة الجامعة'),
    (null::uuid, (select id from buildings where university_id = hu and name_ar = 'كلية العلوم الحياتية والتكنولوجيا الحيوية' and state = 'approved' limit 1), 'مبنى الأحياء')
  ) x(place_id, building_id, alias)
  where (x.place_id is not null or x.building_id is not null)
    and not exists (select 1 from place_aliases a where a.university_id = hu and a.alias = x.alias);

  -- two places the map and OSM agree on that we didn't have
  insert into places (university_id, kind, name_ar, lat, lng, state)
  select hu, k::place_kind, n, la, ln, 'approved' from (values
    ('mosque', 'مسجد هاشم', 32.1066125, 36.1830156),
    ('sports', 'ملعب كلية تكنولوجيا المعلومات', 32.1010875, 36.1860469)
  ) v(k, n, la, ln)
  where not exists (select 1 from places p where p.university_id = hu and p.name_ar = v.n);
end $$;
