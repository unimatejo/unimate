-- University of Jordan: matched against the official campus map of the university's IT centre (itc.ju.edu.jo, the
-- computer-labs map), 2026-11-07. The map is a drawing, not to scale: it gives names and which building is next to
-- which, not positions. So only what it and a second source agree on changes here (an OSM or Wikimapia name at that
-- spot, or one of our buildings). Everything else is in the report as needing confirmation, not guessed.
do $$
declare ju uuid := '49569f3c-5c69-479f-8f67-7ee0552db5ae';
begin
  -- 1. Names as the university writes them (gates on the official map, matched to the OSM gate at that spot)
  update places set name_ar = 'البوابة الشمالية' where id = '414cd02a-07ae-4124-9e29-8509e8641f58' and university_id = ju;
  update places set name_ar = 'البوابة الرئيسية' where id = 'af7c720d-3832-4ab9-b9ba-12aa8b105f79' and university_id = ju;
  update places set name_ar = 'بوابة الطب' where id = 'bf9cb33c-f9f3-4a2c-9be0-09cde647a9ea' and university_id = ju;
  update places set name_ar = 'بوابة الهندسة' where id = '56d9e911-94ef-4435-b8d2-b7bac3050fdb' and university_id = ju;
  update places set kind = 'building' where id = '05dacd33-028b-4b6f-845d-21ef95b9cd51' and university_id = ju; -- «مبنى الرياضيات» was filed as sports
  update buildings set name_ar = 'كلية الملك عبدالله الثاني لتكنولوجيا المعلومات' where id = '411624c6-b9a0-4e9b-9446-7a412356fc33' and university_id = ju;
  update buildings set name_ar = 'مجمع القاعات الطبية' where id = 'f2912382-ee84-478d-b2fe-30d58b29d5d3' and university_id = ju;
  update buildings set name_ar = 'قسم الهندسة المدنية' where id = 'a6296518-0710-4053-9a08-d7a69d1b2902' and university_id = ju;
  update buildings set name_ar = 'مبنى إذاعة الجامعة الأردنية' where id = 'a01ce3fc-d3d7-44ba-aad4-fb6b0fbab4c0' and university_id = ju;

  -- 2. Other names students use (from the map), and where the computer labs are, so search finds them
  insert into place_aliases (university_id, place_id, building_id, alias, state)
  select ju, null, x.b, x.a, 'approved' from (values
    ('6404c4f0-4f54-4daa-9328-45add10e8666'::uuid, 'رئاسة الجامعة'),
    ('09ff8926-8436-4ea8-8d97-e222b915347f'::uuid, 'مركز البحوث والدراسات العليا'),
    ('b27b5994-b8a5-4c02-833b-07eda3dab502'::uuid, 'العلوم الحياتية'),
    ('6b52d06e-d34e-4f1c-bb71-4eb70dfeea59'::uuid, 'الصالة الرياضية'),
    ('a8831bba-f47b-401d-b31e-476c02372481'::uuid, 'ملعب الجامعة'),
    ('9223d2df-d5d3-4735-9e13-5ed3daf0a02d'::uuid, 'مجمع الإنسانية'),
    ('2540f3fe-d535-4cdb-b29a-5e76820807c8'::uuid, 'كلية اللغات'),
    ('8d5ebedc-87ac-4c3d-9b72-de08d1d6c298'::uuid, 'مختبرات حاسوب العلوم التربوية'),
    ('9223d2df-d5d3-4735-9e13-5ed3daf0a02d'::uuid, 'مختبر الأندلس'),
    ('9223d2df-d5d3-4735-9e13-5ed3daf0a02d'::uuid, 'مختبر الدراسات العليا'),
    ('ae664b5c-024f-4ee5-9e75-080214a6f8bb'::uuid, 'مختبرات حاسوب مجمع القاعات العلمية'),
    ('881a1085-12ed-4cdb-b467-d748a588bb4a'::uuid, 'مختبرات حاسوب علوم التأهيل'),
    ('5c60b278-24e8-4d85-8f0e-6fe27a1a18f1'::uuid, 'مختبرات حاسوب الحقوق'),
    ('86363245-825b-4593-a1be-ab0ae6582866'::uuid, 'مختبرات حاسوب الشريعة'),
    ('1a46a44f-9e4c-4e81-935a-ddfd84b98e48'::uuid, 'مختبر كلية الآداب'),
    ('dd9eafe6-8eb8-40ad-87cd-f44a088851c8'::uuid, 'مختبرات حاسوب الهندسة'),
    ('46750c2c-06cc-490f-9109-bdc9fcb3fec9'::uuid, 'مختبرات حاسوب التمريض')
  ) x(b, a) where not exists (select 1 from place_aliases p where p.university_id = ju and p.alias = x.a);

  -- 3. On the map and in Wikimapia/OSM at that spot, but missing here
  insert into places (university_id, kind, name_ar, lat, lng, state)
  select ju, k::place_kind, n, la, ln, 'approved' from (values
    ('building', 'كلية طب الأسنان', 32.00776, 35.87599),
    ('building', 'دائرة القبول والتسجيل (المبنى الجديد)', 32.0093, 35.87274),
    ('building', 'برج الساعة', 32.01632, 35.87072),
    ('shop', 'محل الكتب (Book shop)', 32.01134, 35.87149)
  ) v(k, n, la, ln)
  where not exists (select 1 from places p where p.university_id = ju and p.name_ar = v.n);
  insert into place_aliases (university_id, place_id, building_id, alias, state)
  select ju, (select id from places where university_id = ju and name_ar = 'كلية طب الأسنان' limit 1), null, 'مختبرات حاسوب طب الأسنان', 'approved'
  where not exists (select 1 from place_aliases p where p.university_id = ju and p.alias = 'مختبرات حاسوب طب الأسنان');
end $$;
